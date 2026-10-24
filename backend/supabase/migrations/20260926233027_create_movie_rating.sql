create table movie_rating (
    id uuid primary key,

    user_id uuid not null references auth.users(id) on delete cascade,
    movie_id uuid not null references movie(id) on delete cascade,

    rating numeric(2, 1) not null
        check (rating between 1 and 5 and rating * 2 = floor(rating * 2)),

    created_at timestamptz not null default now(),

    unique (user_id, movie_id)
);