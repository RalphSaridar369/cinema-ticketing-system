-- 20260926233027_create_movie_rating was edited after it had already been
-- applied, so the remote still has rating as integer. Bring it in line.
alter table movie_rating
    alter column rating type numeric(2, 1);

alter table movie_rating
    drop constraint if exists movie_rating_rating_check;

alter table movie_rating
    add constraint movie_rating_rating_check
        check (rating between 1 and 5 and rating * 2 = floor(rating * 2));
