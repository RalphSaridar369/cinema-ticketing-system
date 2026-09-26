create table profile (
    id uuid primary key references auth.users(id) on delete cascade,

    first_name text not null,
    last_name text not null,
    phone text unique,
    date_of_birth date,
    gender text,
    city text,

    last_login_at timestamptz,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);