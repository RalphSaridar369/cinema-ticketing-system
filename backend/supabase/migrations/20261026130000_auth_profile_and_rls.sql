-- Create a profile row for every new auth user, filled from the metadata the
-- web app passes to supabase.auth.signUp().
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profile (id, first_name, last_name, phone, date_of_birth, gender, city)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'first_name', ''),
        coalesce(new.raw_user_meta_data ->> 'last_name', ''),
        nullif(new.raw_user_meta_data ->> 'phone', ''),
        nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date,
        nullif(new.raw_user_meta_data ->> 'gender', ''),
        nullif(new.raw_user_meta_data ->> 'city', '')
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- The anon key ships to the browser, so every public table needs RLS.
-- The service role (seed scripts) bypasses these policies.
alter table branch enable row level security;
alter table genre enable row level security;
alter table movie enable row level security;
alter table movie_genre enable row level security;
alter table room enable row level security;
alter table seat enable row level security;
alter table showtime enable row level security;
alter table profile enable row level security;
alter table movie_rating enable row level security;
alter table user_movie_interaction enable row level security;
alter table reservation enable row level security;
alter table ticket enable row level security;

-- Catalog: readable by everyone, writable only by the service role.
create policy "catalog is public" on branch for select to anon, authenticated using (true);
create policy "catalog is public" on genre for select to anon, authenticated using (true);
create policy "catalog is public" on movie for select to anon, authenticated using (true);
create policy "catalog is public" on movie_genre for select to anon, authenticated using (true);
create policy "catalog is public" on room for select to anon, authenticated using (true);
create policy "catalog is public" on seat for select to anon, authenticated using (true);
create policy "catalog is public" on showtime for select to anon, authenticated using (true);

-- Profile: the trigger above inserts it; users read and edit their own.
create policy "read own profile" on profile for select to authenticated
    using ((select auth.uid()) = id);
create policy "update own profile" on profile for update to authenticated
    using ((select auth.uid()) = id)
    with check ((select auth.uid()) = id);

-- Ratings and interactions: users manage their own rows.
create policy "own ratings" on movie_rating for all to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);
create policy "own interactions" on user_movie_interaction for all to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

-- Bookings: read-only for their owner until booking goes through the backend.
create policy "read own reservations" on reservation for select to authenticated
    using ((select auth.uid()) = user_id);
create policy "read own tickets" on ticket for select to authenticated
    using (exists (
        select 1 from reservation r
        where r.id = ticket.reservation_id and r.user_id = (select auth.uid())
    ));
