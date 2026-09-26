create table ticket (
    id bigint primary key,

    reservation_id bigint not null
        references reservation(id) on delete cascade,

    showtime_id bigint not null
        references showtime(id) on delete cascade,

    seat_id bigint not null
        references seat(id) on delete cascade,

    price numeric(10, 2) not null
        check (price >= 0),

    status text not null
        check (status in ('reserved', 'used', 'cancelled')),

    created_at timestamptz not null default now(),

    unique (showtime_id, seat_id)
);