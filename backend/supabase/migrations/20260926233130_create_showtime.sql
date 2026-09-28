create table showtime (
    id uuid primary key,

    movie_id uuid not null
        references movie(id) on delete cascade,

    room_id uuid not null
        references room(id) on delete cascade,

    starts_at timestamptz not null,
    ends_at timestamptz not null,

    price numeric(10, 2) not null
        check (price >= 0),

    created_at timestamptz not null default now(),

    check (ends_at > starts_at)
);