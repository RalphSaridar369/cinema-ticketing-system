create table reservation (
    id bigint primary key,

    user_id bigint not null
        references app_user(id) on delete cascade,

    showtime_id bigint not null
        references showtime(id) on delete cascade,

    reserved_at timestamptz not null,
    party_size integer not null
        check (party_size > 0),

    status text not null
        check (status in ('pending', 'confirmed', 'completed', 'cancelled')),

    total_amount numeric(10, 2) not null
        check (total_amount >= 0),

    created_at timestamptz not null default now()
);