create table seat (
    id bigint primary key,

    room_id bigint not null
        references room(id) on delete cascade,

    row_label text not null,
    seat_number integer not null
        check (seat_number > 0),

    seat_type text not null
        check (seat_type in ('standard', 'vip')),

    unique (room_id, row_label, seat_number)
);