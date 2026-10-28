import type { Session } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { TASTE_KEY, refresh } from "./catalog";
import { supabase } from "./supabase";
import { STORAGE_KEY as KEY, applyTheme, type Theme } from "./theme";

export type { Theme };

// Client app state, persisted to localStorage. Auth, the profile, favorites,
// watchlist, ratings and bookings come from Supabase (the saved copy only
// bridges the moment before the session loads); preferences live only here.

export type Profile = {
  first: string;
  last: string;
  email: string;
  phone: string;
  dob: string;
  gender: string;
  city: string;
};

export type AppState = {
  // Not persisted: set from the Supabase session once it has loaded.
  authReady: boolean;
  authed: boolean;
  userId: string | null;
  profile: Profile;
  // Branch and movie ids are database uuids.
  branch: string | null;
  day: number;
  genre: string;
  // Newest first.
  favorites: string[];
  watchlist: string[];
  ratings: Record<string, number>;
  // False until lists and ratings saved by earlier builds, which kept them only
  // in this browser, have been copied to the account.
  listsSynced: boolean;
  theme: Theme;
};

const EMPTY_PROFILE: Profile = { first: "", last: "", email: "", phone: "", dob: "", gender: "", city: "" };

const initial = (): AppState => ({
  authReady: false,
  authed: false,
  userId: null,
  profile: EMPTY_PROFILE,
  branch: null,
  day: 0,
  genre: "All",
  favorites: [],
  watchlist: [],
  ratings: {},
  listsSynced: false,
  theme: "dark",
});

let state: AppState | null = null;
const listeners = new Set<() => void>();

function load(): AppState {
  if (state) return state;
  let saved: Partial<AppState> = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {}
  state = { ...initial(), ...fromMockIds(saved), authReady: false, authed: false, userId: null };
  watchSession();
  return state;
}

// Earlier builds saved numeric ids from the mock catalogue. Drop anything that
// can't refer to a database row.
function fromMockIds(saved: Partial<AppState>): Partial<AppState> {
  const ids = (a: unknown) => (Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : []);
  // Bookings now live in the database; drop the old local copy.
  const rest: Record<string, unknown> = { ...saved };
  delete rest.bookings;
  return {
    ...rest,
    branch: typeof saved.branch === "string" ? saved.branch : null,
    favorites: ids(saved.favorites),
    watchlist: ids(saved.watchlist),
    ratings: Object.fromEntries(Object.entries(saved.ratings ?? {}).filter(([k]) => !/^\d+$/.test(k))),
  };
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const cur = load();
  state = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) };
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, authReady: undefined, authed: undefined, userId: undefined }));
  } catch {}
  applyTheme(state.theme);
  listeners.forEach((l) => l());
}

export function getState() {
  return load();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// Returns null on the server and during hydration, so callers can render a
// placeholder instead of guessing at client-only state.
export function useAppState(): AppState | null {
  return useSyncExternalStore(subscribe, load, () => null);
}

// Keeps `authed` and the profile in step with the Supabase session, including
// sign-ins from other tabs and the session restored on page load.
let watching = false;
function watchSession() {
  if (watching) return;
  watching = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    // Supabase warns against awaiting its own calls inside this callback.
    setTimeout(() => applySession(session), 0);
  });
}

async function applySession(session: Session | null) {
  if (!session) {
    if (getState().authed) clearUserState();
    setState({ authReady: true, authed: false });
    return;
  }
  // Load the profile and lists before flagging the user as logged in, so
  // screens never render with an empty profile.
  const userId = session.user.id;
  const email = session.user.email ?? "";
  if (!getState().listsSynced) await copyLocalLists(userId);
  const [{ data }, saved, rated] = await Promise.all([
    supabase.from("profile").select("first_name, last_name, phone, date_of_birth, gender, city").eq("id", userId).maybeSingle(),
    supabase.from("saved_movie").select("movie_id, list").order("created_at", { ascending: false }),
    supabase.from("movie_rating").select("movie_id, rating"),
  ]);
  // Keep what's on screen if the lists fail to load; the next session load retries.
  const lists =
    saved.error || rated.error
      ? {}
      : {
          favorites: saved.data.filter((r) => r.list === "favorite").map((r) => r.movie_id as string),
          watchlist: saved.data.filter((r) => r.list === "watchlist").map((r) => r.movie_id as string),
          ratings: Object.fromEntries(rated.data.map((r) => [r.movie_id as string, Number(r.rating)])),
        };
  setState((s) => ({
    authReady: true,
    authed: true,
    userId,
    ...lists,
    profile: data
      ? {
          first: data.first_name,
          last: data.last_name,
          email,
          phone: data.phone ?? "",
          dob: data.date_of_birth ?? "",
          gender: data.gender ?? "",
          city: data.city ?? "",
        }
      : { ...s.profile, email },
  }));
}

// Copies favorites, watchlist and ratings that earlier builds kept only in this
// browser to the account. Each is written on its own, so one stale movie id
// can't block the rest. Done once every write has worked; a movie that no
// longer exists counts as done.
async function copyLocalLists(userId: string) {
  const s = getState();
  const rows = [
    ...s.favorites.map((movie_id) => ({ user_id: userId, movie_id, list: "favorite" })),
    ...s.watchlist.map((movie_id) => ({ user_id: userId, movie_id, list: "watchlist" })),
  ];
  const results = await Promise.all([
    ...rows.map((r) => supabase.from("saved_movie").upsert(r, { ignoreDuplicates: true })),
    ...Object.entries(s.ratings).map(([movie_id, rating]) =>
      supabase.from("movie_rating").upsert({ user_id: userId, movie_id, rating }, { onConflict: "user_id,movie_id", ignoreDuplicates: true }),
    ),
  ]);
  // 23503: foreign key violation, the movie is gone.
  if (results.every((r) => !r.error || r.error.code === "23503")) setState({ listsSynced: true });
}

function clearUserState() {
  const theme = getState().theme;
  state = { ...initial(), theme };
  setState({});
  try {
    sessionStorage.clear();
  } catch {}
}

export type Registration = Profile & { password: string };

// Auth actions resolve to an error message, or null on success.
export const actions = {
  async logIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  },
  // `confirm` is true when the project requires email confirmation, so no
  // session exists until the user follows the link in their inbox.
  async register(r: Registration): Promise<{ error: string | null; confirm: boolean }> {
    const { data, error } = await supabase.auth.signUp({
      email: r.email,
      password: r.password,
      options: {
        data: { first_name: r.first, last_name: r.last, phone: r.phone, date_of_birth: r.dob, gender: r.gender, city: r.city },
        emailRedirectTo: `${location.origin}/`,
      },
    });
    if (error) return { error: error.message, confirm: false };
    return { error: null, confirm: !data.session };
  },
  async logOut() {
    await supabase.auth.signOut();
  },
  async sendPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password` });
    return error?.message ?? null;
  },
  // Used by the reset link, which signs the user in with a recovery session.
  async setPassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password });
    return error?.message ?? null;
  },
  async changePassword(current: string, password: string) {
    const check = await supabase.auth.signInWithPassword({ email: getState().profile.email, password: current });
    if (check.error) return "Current password is incorrect";
    return actions.setPassword(password);
  },
  // Resolves to an error message, or to whether an email change now awaits
  // confirmation.
  async saveProfile(p: Profile): Promise<{ error: string | null; emailPending: boolean }> {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return { error: "You are logged out", emailPending: false };
    const { error } = await supabase
      .from("profile")
      .update({
        first_name: p.first.trim(),
        last_name: p.last.trim(),
        phone: p.phone || null,
        date_of_birth: p.dob || null,
        gender: p.gender || null,
        city: p.city || null,
      })
      .eq("id", data.user.id);
    if (error) return { error: error.message, emailPending: false };
    let emailPending = false;
    if (p.email !== data.user.email) {
      const res = await supabase.auth.updateUser({ email: p.email });
      if (res.error) return { error: res.error.message, emailPending: false };
      emailPending = true;
    }
    // The address only changes once confirmed, so keep showing the current one.
    setState({ profile: { ...p, email: data.user.email ?? "" } });
    return { error: null, emailPending };
  },
  // Updates the list on screen at once and saves in the background; if saving
  // fails, the change is undone. Returns whether the movie is now in the list.
  toggleList(key: "favorites" | "watchlist", movie: string) {
    const list = key === "favorites" ? "favorite" : "watchlist";
    const on = !getState()[key].includes(movie);
    const show = (add: boolean) =>
      setState((s) => ({ [key]: add ? [movie, ...s[key].filter((x) => x !== movie)] : s[key].filter((x) => x !== movie) }));
    show(on);
    void save(async (user_id) => {
      if (!on) return supabase.from("saved_movie").delete().match({ user_id, movie_id: movie, list });
      const res = await supabase.from("saved_movie").upsert({ user_id, movie_id: movie, list }, { ignoreDuplicates: true });
      // The event log keeps the history for future analytics; a failed log entry
      // doesn't undo the save.
      if (!res.error) await supabase.from("user_movie_interaction").insert({ user_id, movie_id: movie, interaction_type: list });
      return res;
    }, () => show(!on));
    return on;
  },
  rate(movie: string, value: number) {
    const before = getState().ratings[movie];
    setState((s) => ({ ratings: { ...s.ratings, [movie]: value } }));
    void save(
      (user_id) => supabase.from("movie_rating").upsert({ user_id, movie_id: movie, rating: value }, { onConflict: "user_id,movie_id" }),
      () =>
        setState((s) => {
          const ratings = { ...s.ratings };
          if (before == null) delete ratings[movie];
          else ratings[movie] = before;
          return { ratings };
        }),
    );
  },
};

// Runs a write for the signed-in user. On failure, `undo` puts the screen
// back and a toast says so. Recommendations reload either way, since lists
// feed them.
async function save(write: (userId: string) => PromiseLike<{ error: unknown }>, undo: () => void) {
  const userId = getState().userId;
  const failed = !userId || !!(await write(userId)).error;
  if (failed) {
    undo();
    say("Couldn’t save that. Try again.");
  }
  void refresh(TASTE_KEY);
}

// Toasts are ephemeral and kept outside the persisted store.
let toast: string | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const toastListeners = new Set<() => void>();

export function say(msg: string) {
  clearTimeout(toastTimer);
  toast = msg;
  toastListeners.forEach((l) => l());
  toastTimer = setTimeout(() => {
    toast = null;
    toastListeners.forEach((l) => l());
  }, 2200);
}

export function useToast() {
  return useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toast,
    () => null,
  );
}
