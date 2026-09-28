create table ticket (
    id uuid primary key,

    reservation_id uuid not null
        references reservation(id) on delete cascade,

    showtime_id uuid not null
        references showtime(id) on delete cascade,

    seat_id uuid not null
        references seat(id) on delete cascade,

    price numeric(10, 2) not null
        check (price >= 0),

    status text not null
        check (status in ('confirmed', 'used', 'cancelled')),

    created_at timestamptz not null default now(),
);

create unique index ticket_showtime_id_seat_id_active_key
on ticket(showtime_id, seat_id)
where status <> 'cancelled';