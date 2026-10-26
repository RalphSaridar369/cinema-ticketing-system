import type { Session } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { PAST_BOOKINGS, type Booking } from "./data";
import { supabase } from "./supabase";
import { STORAGE_KEY as KEY, applyTheme, type Theme } from "./theme";

export type { Theme };

// Client app state, persisted to localStorage. Auth and the profile come from
// Supabase; bookings and preferences still live only here.

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
  // Not persisted: both are set from the Supabase session once it has loaded.
  authReady: boolean;
  authed: boolean;
  profile: Profile;
  branch: number | null;
  day: number;
  genre: string;
  favorites: number[];
  watchlist: number[];
  ratings: Record<number, number>;
  bookings: Booking[];
  theme: Theme;
};

const EMPTY_PROFILE: Profile = { first: "", last: "", email: "", phone: "", dob: "", gender: "", city: "" };

const initial = (): AppState => ({
  authReady: false,
  authed: false,
  profile: EMPTY_PROFILE,
  branch: null,
  day: 0,
  genre: "All",
  favorites: [],
  watchlist: [],
  ratings: {},
  bookings: PAST_BOOKINGS,
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
  state = { ...initial(), ...saved, authReady: false, authed: false };
  watchSession();
  return state;
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const cur = load();
  state = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) };
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, authReady: undefined, authed: undefined }));
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
  // Load the profile before flagging the user as logged in, so screens never
  // render with an empty profile.
  const email = session.user.email ?? "";
  const { data } = await supabase
    .from("profile")
    .select("first_name, last_name, phone, date_of_birth, gender, city")
    .eq("id", session.user.id)
    .maybeSingle();
  setState((s) => ({
    authReady: true,
    authed: true,
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
  toggleList(key: "favorites" | "watchlist", movie: number) {
    const on = getState()[key].includes(movie);
    setState((s) => ({ [key]: on ? s[key].filter((x) => x !== movie) : [...s[key], movie] }));
    return !on;
  },
  rate(movie: number, value: number) {
    setState((s) => ({ ratings: { ...s.ratings, [movie]: value } }));
  },
  addBooking(b: Booking) {
    setState((s) => ({ bookings: [b, ...s.bookings] }));
  },
};

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
