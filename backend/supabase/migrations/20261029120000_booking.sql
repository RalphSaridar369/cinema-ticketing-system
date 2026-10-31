-- Booking goes through the backend: the web app books and cancels with the
-- functions below (supabase.rpc). RLS on reservation and ticket stays
-- read-only for their owner; only these security definer functions write.
--
-- Errors are raised with the code as the whole message, which supabase-js
-- puts in error.message: not_signed_in, showtime_unavailable, invalid_seats,
-- seats_taken, booking_not_found, booking_not_cancellable.

-- Short booking code shown on tickets and used in URLs, like VLR-2B8QX7.
-- 32 letters and digits without look-alikes (0/O, 1/I), 6 of them: about a
-- billion codes, and it retries until it finds an unused one.
create function public.new_booking_ref()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
    alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    candidate text;
begin
    loop
        candidate := 'VLR-';
        for i in 1..6 loop
            candidate := candidate || substr(alphabet, 1 + floor(random() * 32)::int, 1);
        end loop;
        exit when not exists (select 1 from public.reservation where ref = candidate);
    end loop;
    return candidate;
end;
$$;

revoke execute on function public.new_booking_ref() from public, anon, authenticated;
grant execute on function public.new_booking_ref() to service_role;

-- Give every existing reservation a code. One row per statement, so each
-- call sees the codes already written. The plain index keeps the lookups in
-- new_booking_ref fast while the 10,000 seeded rows are filled in.
alter table reservation add column ref text;
create index reservation_ref_backfill_idx on reservation(ref);

do $$
declare
    r record;
begin
    for r in select id from public.reservation where ref is null loop
        update public.reservation set ref = public.new_booking_ref() where id = r.id;
    end loop;
end;
$$;

alter table reservation
    add constraint reservation_ref_key unique (ref),
    alter column ref set not null;
drop index reservation_ref_backfill_idx;

-- The functions insert reservations and tickets, so let the database fill in
-- their ids.
alter table reservation alter column id set default gen_random_uuid();
alter table ticket alter column id set default gen_random_uuid();

-- Reading a user's bookings, and cancelling one, look rows up by these.
create index reservation_user_id_idx on reservation(user_id);
create index ticket_reservation_id_idx on ticket(reservation_id);

-- Seat ids with an active ticket for a showtime, for the seat map. No user
-- information leaves the function.
create function public.showtime_taken_seats(p_showtime uuid)
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
$$;

revoke execute on function public.showtime_taken_seats(uuid) from public, anon, authenticated;
grant execute on function public.showtime_taken_seats(uuid) to anon, authenticated;

-- Free seats per showtime, for the "N left" badge: one call for a list.
create function public.showtime_seats_left(p_showtimes uuid[])
returns table (showtime_id uuid, seats_left int)
language sql
stable
security definer
set search_path = ''
as $$
    select
        s.id,
        (
            (select count(*) from public.seat st where st.room_id = s.room_id)
            - (select count(*) from public.ticket t
               where t.showtime_id = s.id and t.status <> 'cancelled')
        )::int
    from public.showtime s
    where s.id = any(p_showtimes)
$$;

revoke execute on function public.showtime_seats_left(uuid[]) from public, anon, authenticated;
grant execute on function public.showtime_seats_left(uuid[]) to anon, authenticated;

-- Book seats for the signed-in user and return the new booking's ref.
-- Prices come from the showtime, never from the browser. The partial unique
-- index on ticket(showtime_id, seat_id) is what stops double booking: if
-- another booking took a seat first, the insert fails and nothing is kept.
create function public.book_seats(p_showtime uuid, p_seats uuid[])
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_user uuid := auth.uid();
    v_showtime public.showtime%rowtype;
    v_count int := coalesce(cardinality(p_seats), 0);
    v_reservation uuid;
    v_ref text;
    v_constraint text;
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

    v_ref := public.new_booking_ref();

    begin
        insert into public.reservation
            (user_id, showtime_id, reserved_at, party_size, status, total_amount, ref)
        values
            (v_user, p_showtime, now(), v_count, 'confirmed', v_count * v_showtime.price, v_ref)
        returning id into v_reservation;

        insert into public.ticket (reservation_id, showtime_id, seat_id, price, status)
        select v_reservation, p_showtime, seat_id, v_showtime.price, 'confirmed'
        from unnest(p_seats) as seat_id;
    exception when unique_violation then
        get stacked diagnostics v_constraint = constraint_name;
        if v_constraint = 'ticket_showtime_id_seat_id_active_key' then
            raise exception 'seats_taken';
        end if;
        raise;
    end;

    return v_ref;
end;
$$;

revoke execute on function public.book_seats(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.book_seats(uuid, uuid[]) to authenticated;

-- Cancel the signed-in user's whole booking while it is confirmed and its
-- showtime hasn't started. Cancelled tickets fall out of the partial unique
-- index, which frees their seats.
create function public.cancel_booking(p_ref text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_reservation uuid;
    v_status text;
    v_starts_at timestamptz;
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

    if v_status <> 'confirmed' or v_starts_at <= now() then
        raise exception 'booking_not_cancellable';
    end if;

    update public.reservation set status = 'cancelled' where id = v_reservation;
    update public.ticket set status = 'cancelled' where reservation_id = v_reservation;
end;
$$;

revoke execute on function public.cancel_booking(text) from public, anon, authenticated;
grant execute on function public.cancel_booking(text) to authenticated;
