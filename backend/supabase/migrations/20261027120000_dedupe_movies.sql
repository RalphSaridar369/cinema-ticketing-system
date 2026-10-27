-- The movie seed fetched TMDB's popularity list page by page and gave every
-- result a fresh uuid, so movies that moved between pages while it ran were
-- stored twice. Keep one row per (title, release_date, poster_path), point
-- everything that referenced a duplicate at the kept row, then delete the
-- duplicates.

begin;

create temporary table movie_dupe on commit drop as
select id, first_value(id) over w as keep_id
from movie
window w as (
    partition by title, release_date, poster_path
    order by created_at, id
);

delete from movie_dupe where id = keep_id;

update showtime s
set movie_id = d.keep_id
from movie_dupe d
where s.movie_id = d.id;

update user_movie_interaction i
set movie_id = d.keep_id
from movie_dupe d
where i.movie_id = d.id;

-- movie_rating is unique per (user_id, movie_id): a user who rated both
-- copies keeps the rating on the kept row. The duplicate's rating goes with
-- the row below.
update movie_rating r
set movie_id = d.keep_id
from movie_dupe d
where r.movie_id = d.id
  and not exists (
      select 1 from movie_rating k
      where k.user_id = r.user_id and k.movie_id = d.keep_id
  );

-- Cascades to the duplicates' movie_genre rows (the kept row has the same
-- genres) and any ratings left over from the step above.
delete from movie m
using movie_dupe d
where m.id = d.id;

commit;
