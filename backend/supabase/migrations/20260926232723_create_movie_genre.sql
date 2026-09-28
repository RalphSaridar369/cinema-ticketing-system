create table movie_genre (
    movie_id uuid not null references movie(id) on delete cascade,
    genre_id integer not null
        references genre(id)
        on delete cascade,

    primary key (movie_id, genre_id)
);