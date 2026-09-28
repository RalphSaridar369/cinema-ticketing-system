create table user_movie_interaction (
    id uuid primary key,

    user_id uuid not null
        references auth.users(id) on delete cascade,

    movie_id uuid not null
        references movie(id) on delete cascade,

    interaction_type text not null
        check (
            interaction_type in (
                'click',
                'view',
                'favorite',
                'watchlist',
                'share'
            )
        ),

    created_at timestamptz not null default now()
);

create index idx_user_movie_interaction_user_id
on user_movie_interaction(user_id);

create index idx_user_movie_interaction_movie_id
on user_movie_interaction(movie_id);

create index idx_user_movie_interaction_type
on user_movie_interaction(interaction_type);