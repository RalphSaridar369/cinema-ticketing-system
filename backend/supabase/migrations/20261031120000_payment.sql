-- Stripe payments. Booking is now two steps: hold_seats reserves seats for 10
-- minutes (a pending reservation with held tickets), and the payment is
-- confirmed from Stripe's webhook (confirm_payment, service role only). An
-- unpaid hold expires: when someone holds again, on a one-minute pg_cron job,
-- or when Stripe reports the checkout session expired.
--
-- Same error convention as the booking functions, plus payment_not_found and
-- hold_expired.
--
-- Locks are always taken reservation first, then payment, so the webhook,
-- the expiry paths and cancellation can't deadlock.

-- A hold has a deadline; held tickets and expired reservations are new states.
-- The inline checks got Postgres' default names.
alter table reservation add column hold_expires_at timestamptz;

alter table reservation drop constraint reservation_status_check;
alter table reservation add constraint reservation_status_check
    check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'expired'));

alter table ticket drop constraint ticket_status_check;
alter table ticket add constraint ticket_status_check
    check (status in ('held', 'confirmed', 'used', 'cancelled'));

create table payment (
    id uuid primary key default gen_random_uuid(),

    reservation_id uuid not null
        references reservation(id) on delete cascade,

    user_id uuid not null
        references auth.users(id) on delete cascade,

    amount numeric(10, 2) not null
        check (amount >= 0),

    currency text not null default 'usd',

    status text not null
        check (status in ('pending', 'succeeded', 'expired', 'refunding', 'refunded')),

    stripe_checkout_session_id text unique not null,
    stripe_payment_intent_id text unique,
    stripe_refund_id text,

    created_at timestamptz not null default now(),
    paid_at timestamptz,
    refunded_at timestamptz
);

create index payment_reservation_id_idx on payment(reservation_id);

-- One checkout session at a time per reservation.
create unique index payment_reservation_id_pending_key
on payment(reservation_id)
where status = 'pending';

-- Users read their own payments; only the functions below write.
alter table payment enable row level security;
create policy "read own payments" on payment for select to authenticated
    using (user_id = auth.uid());
revoke all on public.payment from anon, authenticated;
grant select on public.payment to authenticated;

-- Held seats count as taken for everyone but the user holding them, so the
-- seat map keeps the holder's own seats selectable. showtime_seats_left is
-- unchanged: a held seat is not free.
create or replace function public.showtime_taken_seats(p_showtime uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
    select t.seat_id
    from public.ticket t
    where t.showtime_id = p_showtime
      and t.status <> 'cancelled'
      and not (
          t.status = 'held'
          and exists (
              select 1 from public.reservation r
              where r.id = t.reservation_id and r.user_id = auth.uid()
          )
      )
$$;

-- Expire one pending reservation: the reservation, its held tickets and its
-- pending payments. Callers hold the reservation's row lock. Returns the
-- Stripe session ids of the payments it expired (so the caller can have them
-- expired at Stripe), and does nothing for a reservation that is no longer
-- pending.
create function public.expire_reservation(p_reservation uuid)
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_sessions text[];
begin
    update public.reservation set status = 'expired'
    where id = p_reservation and status = 'pending';

    if not found then
        return '{}';
    end if;

    update public.ticket set status = 'cancelled'
    where reservation_id = p_reservation and status = 'held';

    with expired as (
        update public.payment set status = 'expired'
        where reservation_id = p_reservation and status = 'pending'
        returning stripe_checkout_session_id
    )
    select coalesce(array_agg(stripe_checkout_session_id), '{}') into v_sessions from expired;

    return v_sessions;
end;
$$;

revoke execute on function public.expire_reservation(uuid) from public, anon, authenticated;

-- Hold seats for the signed-in user for 10 minutes. Same checks and errors as
-- the old book_seats; prices come from the showtime. First it clears out what
-- would be in the way: this showtime's holds past their time, and any hold the
-- caller still has (one checkout at a time). released_sessions are the
-- caller's Stripe sessions that just expired, for the web app to expire at
-- Stripe. The partial unique index on ticket(showtime_id, seat_id) still
-- stops double booking.
drop function public.book_seats(uuid, uuid[]);

create function public.hold_seats(p_showtime uuid, p_seats uuid[])
returns table (reservation_id uuid, ref text, seat_count int, unit_price numeric, released_sessions text[])
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
    v_user uuid := auth.uid();
    v_showtime public.showtime%rowtype;
    v_count int := coalesce(cardinality(p_seats), 0);
    v_reservation uuid;
    v_ref text;
    v_constraint text;
    v_released text[] := '{}';
    r record;
begin
    if v_user is null then
        raise exception 'not_signed_in';
    end if;

    select * into v_showtime from public.showtime where id = p_showtime;
    if not found or v_showtime.starts_at <= now() then
        raise exception 'showtime_unavailable';
    end if;

    -- 1 to 10 seats, no repeats (or nulls), all in the showtime's room.
    if v_count = 0 or v_count > 10
        or (select count(distinct seat_id) from unnest(p_seats) as seat_id) <> v_count
        or (select count(*) from public.seat
            where id = any(p_seats) and room_id = v_showtime.room_id) <> v_count
    then
        raise exception 'invalid_seats';
    end if;

    for r in
        select res.id, res.user_id
        from public.reservation res
        where res.status = 'pending'
          and ((res.showtime_id = p_showtime and res.hold_expires_at < now())
               or res.user_id = v_user)
        order by res.id
        for update of res
    loop
        if r.user_id = v_user then
            v_released := v_released || public.expire_reservation(r.id);
        else
            perform public.expire_reservation(r.id);
        end if;
    end loop;

    v_ref := public.new_booking_ref();

    begin
        insert into public.reservation
            (user_id, showtime_id, reserved_at, party_size, status, total_amount, ref, hold_expires_at)
        values
            (v_user, p_showtime, now(), v_count, 'pending', v_count * v_showtime.price, v_ref,
             now() + interval '10 minutes')
        returning id into v_reservation;

        insert into public.ticket (reservation_id, showtime_id, seat_id, price, status)
        select v_reservation, p_showtime, seat_id, v_showtime.price, 'held'
        from unnest(p_seats) as seat_id;
    exception when unique_violation then
        get stacked diagnostics v_constraint = constraint_name;
        if v_constraint = 'ticket_showtime_id_seat_id_active_key' then
            raise exception 'seats_taken';
        end if;
        raise;
    end;

    return query select v_reservation, v_ref, v_count, v_showtime.price::numeric, v_released;
end;
$$;

revoke execute on function public.hold_seats(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.hold_seats(uuid, uuid[]) to authenticated;

-- Give up the signed-in user's pending hold (they left checkout). Returns the
-- hold's pending Stripe session id so it can be expired at Stripe, or null.
-- Anything that isn't the caller's pending reservation is a no-op.
create function public.release_hold(p_ref text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_reservation uuid;
    v_sessions text[];
begin
    select r.id into v_reservation
    from public.reservation r
    where r.ref = p_ref and r.user_id = auth.uid() and r.status = 'pending'
    for update of r;

    if not found then
        return null;
    end if;

    v_sessions := public.expire_reservation(v_reservation);
    return v_sessions[1];
end;
$$;

revoke execute on function public.release_hold(text) from public, anon, authenticated;
grant execute on function public.release_hold(text) to authenticated;

-- Expire every hold past its time. Run by pg_cron every minute (as the
-- database owner); service_role may call it too. skip locked leaves rows
-- another transaction is working on (a webhook confirming) to that one.
create function public.expire_holds()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    r record;
    v_count int := 0;
begin
    for r in
        select res.id
        from public.reservation res
        where res.status = 'pending' and res.hold_expires_at < now()
        order by res.id
        for update of res skip locked
    loop
        perform public.expire_reservation(r.id);
        v_count := v_count + 1;
    end loop;
    return v_count;
end;
$$;

revoke execute on function public.expire_holds() from public, anon, authenticated;
grant execute on function public.expire_holds() to service_role;

create extension if not exists pg_cron;

-- Naming the job makes this an upsert, so re-running the migration is safe.
select cron.schedule('expire-holds', '* * * * *', $$select public.expire_holds()$$);

-- Record the Stripe checkout session for a reservation (web app, service role).
-- The amount is the reservation's total, never taken from the caller. Only a
-- pending reservation can be paid for: hold_expired otherwise.
create function public.create_payment(p_reservation uuid, p_session_id text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_user uuid;
    v_amount numeric;
    v_status text;
    v_payment uuid;
begin
    select r.user_id, r.total_amount, r.status into v_user, v_amount, v_status
    from public.reservation r
    where r.id = p_reservation
    for update of r;

    if not found then
        raise exception 'booking_not_found';
    end if;

    if v_status <> 'pending' then
        raise exception 'hold_expired';
    end if;

    insert into public.payment (reservation_id, user_id, amount, status, stripe_checkout_session_id)
    values (p_reservation, v_user, v_amount, 'pending', p_session_id)
    returning id into v_payment;

    return v_payment;
end;
$$;

revoke execute on function public.create_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.create_payment(uuid, text) to service_role;

-- Stripe says the session was paid. Safe to call again for the same event:
--   confirmed      the booking is paid and confirmed
--   refund_needed  the money arrived but the hold was lost (expired or
--                  released); the web app must refund payment_intent
--   refunded       that refund is already done
create function public.confirm_payment(p_session_id text, p_payment_intent text)
returns table (outcome text, payment_id uuid, payment_intent text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
    v_payment public.payment%rowtype;
    v_reservation uuid;
    v_reservation_status text;
begin
    -- Reservation lock first (see the top of this file), then the payment.
    select p.reservation_id into v_reservation
    from public.payment p
    where p.stripe_checkout_session_id = p_session_id;

    if not found then
        raise exception 'payment_not_found';
    end if;

    select r.status into v_reservation_status
    from public.reservation r
    where r.id = v_reservation
    for update of r;

    select * into v_payment
    from public.payment p
    where p.stripe_checkout_session_id = p_session_id
    for update of p;

    if v_payment.status in ('pending', 'expired') then
        if v_reservation_status = 'pending' then
            update public.payment
            set status = 'succeeded', stripe_payment_intent_id = p_payment_intent, paid_at = now()
            where id = v_payment.id;

            update public.reservation set status = 'confirmed', hold_expires_at = null
            where id = v_reservation;
            update public.ticket set status = 'confirmed'
            where reservation_id = v_reservation and status = 'held';

            return query select 'confirmed'::text, v_payment.id, p_payment_intent;
        else
            update public.payment
            set status = 'refunding', stripe_payment_intent_id = p_payment_intent, paid_at = now()
            where id = v_payment.id;

            return query select 'refund_needed'::text, v_payment.id, p_payment_intent;
        end if;
    elsif v_payment.status = 'succeeded' then
        return query select 'confirmed'::text, v_payment.id, v_payment.stripe_payment_intent_id;
    elsif v_payment.status = 'refunding' then
        return query select 'refund_needed'::text, v_payment.id, v_payment.stripe_payment_intent_id;
    else
        return query select 'refunded'::text, v_payment.id, v_payment.stripe_payment_intent_id;
    end if;
end;
$$;

revoke execute on function public.confirm_payment(text, text) from public, anon, authenticated;
grant execute on function public.confirm_payment(text, text) to service_role;

-- Stripe says the checkout session expired unpaid. The payment expires, and so
-- does its reservation if it is still pending. Unknown sessions and payments
-- that are no longer pending are ignored.
create function public.expire_payment(p_session_id text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_reservation uuid;
    v_status text;
begin
    select p.reservation_id into v_reservation
    from public.payment p
    where p.stripe_checkout_session_id = p_session_id;

    if not found then
        return;
    end if;

    perform 1 from public.reservation r where r.id = v_reservation for update of r;

    select p.status into v_status
    from public.payment p
    where p.stripe_checkout_session_id = p_session_id
    for update of p;

    if v_status <> 'pending' then
        return;
    end if;

    update public.payment set status = 'expired'
    where stripe_checkout_session_id = p_session_id;

    perform public.expire_reservation(v_reservation);
end;
$$;

revoke execute on function public.expire_payment(text) from public, anon, authenticated;
grant execute on function public.expire_payment(text) to service_role;

-- Cancel the signed-in user's whole booking while it is confirmed and its
-- showtime hasn't started. A paid booking's payment moves to refunding and is
-- returned, for the web app to refund at Stripe. Calling it again while that
-- refund is still outstanding returns the same payment (the refund can be
-- retried); an unpaid booking returns no rows.
drop function public.cancel_booking(text);

create function public.cancel_booking(p_ref text)
returns table (payment_id uuid, payment_intent text, amount numeric)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
    v_reservation uuid;
    v_status text;
    v_starts_at timestamptz;
    v_payment uuid;
    v_intent text;
    v_amount numeric;
begin
    select r.id, r.status, s.starts_at
    into v_reservation, v_status, v_starts_at
    from public.reservation r
    join public.showtime s on s.id = r.showtime_id
    where r.ref = p_ref and r.user_id = auth.uid()
    for update of r;

    if not found then
        raise exception 'booking_not_found';
    end if;

    -- Cancelled, or expired and paid late: a refund still owed is returned for retry.
    if v_status in ('cancelled', 'expired') then
        select p.id, p.stripe_payment_intent_id, p.amount into v_payment, v_intent, v_amount
        from public.payment p
        where p.reservation_id = v_reservation and p.status = 'refunding'
        order by p.created_at
        limit 1;

        if not found then
            raise exception 'booking_not_cancellable';
        end if;

        return query select v_payment, v_intent, v_amount;
        return;
    end if;

    if v_status <> 'confirmed' or v_starts_at <= now() then
        raise exception 'booking_not_cancellable';
    end if;

    update public.reservation set status = 'cancelled' where id = v_reservation;
    update public.ticket set status = 'cancelled' where reservation_id = v_reservation;

    update public.payment set status = 'refunding'
    where id = (
        select p.id from public.payment p
        where p.reservation_id = v_reservation and p.status = 'succeeded'
        order by p.created_at
        limit 1
    )
    returning id, stripe_payment_intent_id, amount into v_payment, v_intent, v_amount;

    if found then
        return query select v_payment, v_intent, v_amount;
    end if;
end;
$$;

revoke execute on function public.cancel_booking(text) from public, anon, authenticated;
grant execute on function public.cancel_booking(text) to authenticated;

-- Stripe refunded the payment (web app, service role). Also covers a refund
-- made from the Stripe dashboard on a succeeded payment. Repeat calls change
-- nothing.
create function public.mark_refunded(p_payment_intent text, p_refund_id text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
    update public.payment
    set status = 'refunded', stripe_refund_id = p_refund_id, refunded_at = now()
    where stripe_payment_intent_id = p_payment_intent
      and status in ('refunding', 'succeeded');
end;
$$;

revoke execute on function public.mark_refunded(text, text) from public, anon, authenticated;
grant execute on function public.mark_refunded(text, text) to service_role;
