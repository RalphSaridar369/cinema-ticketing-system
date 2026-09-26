create table movie_rating (
    id bigint primary key,

    user_id bigint not null references app_user(id) on delete cascade,
    movie_id bigint not null references movie(id) on delete cascade,

    rating integer not null check (rating between 1 and 5),

    created_at timestamptz not null default now(),

    unique (user_id, movie_id)
);