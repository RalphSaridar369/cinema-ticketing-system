import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "./supabase";

// Catalogue read from Supabase. Loads are cached for the session and shared by
// every screen through useResource().

export type Branch = {
  id: string;
  slug: string;
  name: string;
  city: string;
  addr: string;
  phone: string;
};

export type Movie = {
  id: string;
  title: string;
  original: string;
  lang: string;
  genres: string[];
  rating: number;
  votes: number;
  popularity: number;
  adult: boolean;
  released: string;
  poster: string | null;
  backdrop: string | null;
};

export type MovieDetail = Movie & { overview: string };

export type RoomKind = "standard" | "vip" | "imax";
export type Room = { id: string; branch: string; name: string; kind: RoomKind; format: string; rows: number };

export type Showtime = {
  id: string;
  movie: string;
  branch: string;
  room: Room;
  // Days from today, matching getDays() indexes.
  day: number;
  start: string;
  end: string;
  price: number;
  soldOut: boolean;
};

export type Catalog = {
  branches: Branch[];
  // Movies with a showtime in the booking window.
  movies: Movie[];
  showtimes: Showtime[];
};

export const DAYS = 7;
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IMAGE_BASE = "https://image.tmdb.org/t/p/";
const MOVIE_COLUMNS =
  "id, title, original_title, original_language, poster_path, backdrop_path, release_date, popularity, vote_average, vote_count, adult, movie_genre(genre_id)";
// PostgREST returns at most 1000 rows per request.
const PAGE = 1000;
// Keeps `id=in.(...)` filters well under URL length limits.
const ID_CHUNK = 100;

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const clock = (d: Date) => String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const languages = new Intl.DisplayNames(["en"], { type: "language" });
const languageName = (code: string | null) => {
  if (!code) return "";
  try {
    return languages.of(code) ?? code;
  } catch {
    return code;
  }
};

// "2026-10-09" -> "9 Oct 2026"
const releaseLabel = (iso: string | null) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MO[m - 1]} ${y}`;
};

export const posterUrl = (path: string, size = "w500") => IMAGE_BASE + size + path;

const FORMATS: Record<string, string> = { "standard 2D": "Standard 2D", "standard 3D": "Standard 3D", "vip 2D": "VIP", "imax IMAX": "IMAX" };

type MovieRow = {
  id: string;
  title: string;
  original_title: string | null;
  original_language: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string | null;
  popularity: number | null;
  vote_average: number | null;
  vote_count: number | null;
  adult: boolean;
  movie_genre: { genre_id: number }[];
};

function toMovie(r: MovieRow, genres: Map<number, string>): Movie {
  return {
    id: r.id,
    title: r.title,
    original: r.original_title ?? r.title,
    lang: languageName(r.original_language),
    genres: r.movie_genre.map((g) => genres.get(g.genre_id)).filter((g): g is string => !!g),
    rating: r.vote_average ?? 0,
    votes: r.vote_count ?? 0,
    popularity: r.popularity ?? 0,
    adult: r.adult,
    released: releaseLabel(r.release_date),
    poster: r.poster_path,
    backdrop: r.backdrop_path,
  };
}

function check<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

async function loadGenres() {
  const rows = check(await supabase.from("genre").select("id, name"));
  return new Map(rows.map((g) => [g.id as number, g.name as string]));
}

async function loadMovies(ids: string[], genres: Map<number, string> | Promise<Map<number, string>>) {
  const parts = await Promise.all(
    chunks(ids, ID_CHUNK).map(async (part) => check(await supabase.from("movie").select(MOVIE_COLUMNS).in("id", part)) as MovieRow[]),
  );
  const names = await genres;
  return parts.flat().map((r) => toMovie(r, names));
}

type ShowtimeRow = { id: string; movie_id: string; room_id: string; starts_at: string; ends_at: string; price: number };

async function loadShowtimes(from: Date, to: Date) {
  const rows: ShowtimeRow[] = [];
  for (let at = 0; ; at += PAGE) {
    const page = check(
      await supabase
        .from("showtime")
        .select("id, movie_id, room_id, starts_at, ends_at, price")
        .gte("starts_at", from.toISOString())
        .lt("starts_at", to.toISOString())
        .order("starts_at")
        .order("id")
        .range(at, at + PAGE - 1),
    ) as ShowtimeRow[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function loadCatalog(): Promise<Catalog> {
  const now = new Date();
  const today = startOfDay(now);
  const dayStart = (d: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + d);

  // Round trips dominate the load time, so everything runs in parallel: one
  // showtime request per day, each followed by the movies it adds. Today starts
  // from now, skipping showtimes that have already begun.
  const genres = loadGenres();
  const requested = new Set<string>();
  const loadDay = async (d: number) => {
    const rows = await loadShowtimes(d ? dayStart(d) : now, dayStart(d + 1));
    const ids = [...new Set(rows.map((r) => r.movie_id))].filter((id) => !requested.has(id));
    ids.forEach((id) => requested.add(id));
    return { rows, movies: await loadMovies(ids, genres) };
  };
  const [branchRows, roomRows, ...days] = await Promise.all([
    supabase.from("branch").select("id, name, address, city, phone").order("name").then(check),
    supabase.from("room").select("id, branch_id, name, room_type, screen_type, capacity").then(check),
    ...Array.from({ length: DAYS }, (_, d) => loadDay(d)),
  ]);
  const showRows = days.flatMap((d) => d.rows);

  const branches: Branch[] = branchRows.map((b) => ({
    id: b.id,
    slug: slugify(b.name),
    name: b.name,
    city: b.city,
    addr: b.address,
    phone: b.phone ?? "",
  }));
  const rooms = new Map(
    roomRows.map((r): [string, Room] => [
      r.id,
      {
        id: r.id,
        branch: r.branch_id,
        name: r.name,
        kind: r.room_type,
        format: FORMATS[`${r.room_type} ${r.screen_type}`] ?? r.screen_type,
        rows: Math.min(25, Math.ceil(r.capacity / 10)),
      },
    ]),
  );
  const showtimes = showRows.flatMap((r): Showtime[] => {
    const room = rooms.get(r.room_id);
    if (!room) return [];
    const starts = new Date(r.starts_at);
    return [
      {
        id: r.id,
        movie: r.movie_id,
        branch: room.branch,
        room,
        day: Math.round((startOfDay(starts).getTime() - today.getTime()) / 86_400_000),
        start: clock(starts),
        end: clock(new Date(r.ends_at)),
        price: Number(r.price),
        soldOut: false,
      },
    ];
  });

  return { branches, movies: days.flatMap((d) => d.movies), showtimes };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadMovieDetail(id: string): Promise<MovieDetail | null> {
  if (!UUID.test(id)) return null;
  const [genres, row] = await Promise.all([
    loadGenres(),
    supabase.from("movie").select(`${MOVIE_COLUMNS}, overview`).eq("id", id).maybeSingle().then(check),
  ]);
  if (!row) return null;
  const r = row as MovieRow & { overview: string | null };
  return { ...toMovie(r, genres), overview: r.overview ?? "" };
}

// Movies saved by id, in the order given. Ids no longer in the database are dropped.
async function loadMoviesById(ids: string[]): Promise<Movie[]> {
  if (!ids.length) return [];
  const movies = await loadMovies(ids, await loadGenres());
  const byId = new Map(movies.map((m) => [m.id, m]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

// Genre weights from what the signed-in user has clicked, viewed, saved or shared.
async function loadTaste(): Promise<Map<string, number>> {
  const rows = check(
    await supabase.from("user_movie_interaction").select("movie_id, interaction_type").order("created_at", { ascending: false }).limit(300),
  );
  const weight = new Map<string, number>();
  for (const r of rows) {
    const w = r.interaction_type === "favorite" || r.interaction_type === "watchlist" ? 2 : 1;
    weight.set(r.movie_id, (weight.get(r.movie_id) ?? 0) + w);
  }
  const taste = new Map<string, number>();
  if (!weight.size) return taste;
  for (const m of await loadMovies([...weight.keys()], await loadGenres()))
    for (const g of m.genres) taste.set(g, (taste.get(g) ?? 0) + weight.get(m.id)!);
  return taste;
}

// Session cache of loads, keyed by name, observable from React.

export type Resource<T> = { data?: T; error?: string };

const cache = new Map<string, Resource<unknown>>();
const loaders = new Map<string, () => Promise<unknown>>();
const inflight = new Set<string>();
const listeners = new Set<() => void>();
const EMPTY: Resource<never> = {};

function fetchInto<T>(key: string, load: () => Promise<T>) {
  loaders.set(key, load);
  if (inflight.has(key) || cache.has(key)) return;
  inflight.add(key);
  load()
    .then((data) => cache.set(key, { data }))
    .catch((e: Error) => cache.set(key, { error: e.message }))
    .finally(() => {
      inflight.delete(key);
      listeners.forEach((l) => l());
    });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function useResource<T>(key: string | null, load: () => Promise<T>): Resource<T> {
  const res = useSyncExternalStore(
    subscribe,
    () => (key ? (cache.get(key) as Resource<T>) : undefined) ?? EMPTY,
    () => EMPTY,
  );
  useEffect(() => {
    if (key) fetchInto(key, load);
    // `load` is derived from `key`, so the key alone decides when to fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return res;
}

// Runs a failed load again.
export function retry(key: string) {
  const load = loaders.get(key);
  if (!cache.get(key)?.error || !load) return;
  cache.delete(key);
  listeners.forEach((l) => l());
  fetchInto(key, load);
}

export const CATALOG_KEY = "catalog";

export const useCatalog = () => useResource(CATALOG_KEY, loadCatalog);
export const useMovieDetail = (id: string) => useResource(`movie:${id}`, () => loadMovieDetail(id));
export const useMoviesById = (ids: string[]) => useResource(`movies:${ids.join(",")}`, () => loadMoviesById(ids));
export const useTaste = (userKey: string | null) => useResource(userKey && `taste:${userKey}`, loadTaste);

export const branchById = (c: Catalog, id: string | null) => (id == null ? null : (c.branches.find((b) => b.id === id) ?? null));
export const branchBySlug = (c: Catalog, slug: string) => c.branches.find((b) => b.slug === slug) ?? null;
export const showtimeById = (c: Catalog, id: string) => c.showtimes.find((s) => s.id === id) ?? null;

export const showtimesFor = (c: Catalog, branch: string | null, movie: string, day: number) =>
  c.showtimes.filter((s) => s.movie === movie && s.day === day && (branch == null || s.branch === branch));

// Movies with any showtime in the window at the branch, or at any branch.
export const moviesAt = (c: Catalog, branch: string | null) => {
  if (branch == null) return c.movies;
  const ids = new Set(c.showtimes.filter((s) => s.branch === branch).map((s) => s.movie));
  return c.movies.filter((m) => ids.has(m.id));
};

export const cities = (c: Catalog) => [...new Set(c.branches.map((b) => b.city))];
