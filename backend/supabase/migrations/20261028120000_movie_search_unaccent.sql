-- Accent-insensitive movie search for Explore: "amelie" finds "Amélie".
--
-- unaccent() is not immutable, so a generated column can't call it directly.
-- The wrapper pins the dictionary, which makes it safe to mark immutable.

create extension if not exists unaccent with schema extensions;

create or replace function public.immutable_unaccent(value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
    select extensions.unaccent('extensions.unaccent'::regdictionary, value)
$$;

-- Title and original title, lowercased and without accents. The web app
-- strips accents from the search text the same way and matches with ilike.
alter table movie
    add column search_title text
    generated always as (
        public.immutable_unaccent(lower(title || ' ' || coalesce(original_title, '')))
    ) stored;
