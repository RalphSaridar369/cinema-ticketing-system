create table room (
    id uuid primary key,
    branch_id uuid not null references branch(id) on delete cascade,

    name text not null,
    capacity integer not null check (capacity > 0),

    room_type text not null
        check (room_type in ('standard', 'vip', 'imax')),

    screen_type text not null
        check (screen_type in ('2D', '3D', 'IMAX')),

    created_at timestamptz not null default now()
);