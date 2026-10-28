-- Favorites and watchlist as lists the user keeps, separate from
-- user_movie_interaction, which stays a log of events. Removing a movie from
-- a list deletes its row here, so it stops counting toward recommendations,
-- while the log keeps the history.
create table saved_movie (
    user_id uuid not null references auth.users(id) on delete cascade,
    movie_id uuid not null references movie(id) on delete cascade,

    list text not null
        check (list in ('favorite', 'watchlist')),

    created_at timestamptz not null default now(),

    primary key (user_id, movie_id, list)
);

create index saved_movie_movie_id_idx on saved_movie(movie_id);

alter table saved_movie enable row level security;

create policy "own saved movies" on saved_movie for all to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

-- Start the lists from the favorite and watchlist events already logged,
-- once per user, movie and list, dated by the first event.
insert into saved_movie (user_id, movie_id, list, created_at)
select user_id, movie_id, interaction_type, min(created_at)
from user_movie_interaction
where interaction_type in ('favorite', 'watchlist')
group by user_id, movie_id, interaction_type
on conflict do nothing;

-- The web app now writes ratings and interaction events directly, so let the
-- database fill in their ids.
alter table movie_rating alter column id set default gen_random_uuid();
alter table user_movie_interaction alter column id set default gen_random_uuid();
