create table movie (
    id uuid primary key,

    title text not null,
    original_title text,
    original_language text,
    overview text,

    backdrop_path text,
    poster_path text,

    release_date date,

    popularity double precision,
    vote_average double precision,
    vote_count integer,

    adult boolean not null default false,
    video boolean not null default false,
    softcore boolean not null default false,

    created_at timestamptz not null default now()
);