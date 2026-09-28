create table movie_rating (
    id uuid primary key,

    user_id uuid not null references auth.users(id) on delete cascade,
    movie_id uuid not null references movie(id) on delete cascade,

    rating integer not null check (rating between 1 and 5),

    created_at timestamptz not null default now(),

    unique (user_id, movie_id)
);