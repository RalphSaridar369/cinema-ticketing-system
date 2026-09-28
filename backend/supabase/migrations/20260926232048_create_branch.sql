create table branch (
    id uuid primary key,
    name text not null,
    address text not null,
    city text not null,
    latitude double precision,
    longitude double precision,
    phone text,
    created_at timestamptz not null default now()
);