import { useSyncExternalStore } from "react";
import { PAST_BOOKINGS, type Booking } from "./data";
import { STORAGE_KEY as KEY, applyTheme, type Theme } from "./theme";

export type { Theme };

// Client-only app state, persisted to localStorage. There is no backend yet,
// so auth, bookings and preferences all live here.

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

const DEMO_PROFILE: Profile = {
  first: "Rami",
  last: "Haddad",
  email: "rami.haddad@mail.com",
  phone: "+961 70 123 456",
  dob: "1994-03-14",
  gender: "Male",
  city: "Beirut",
};

const initial = (): AppState => ({
  authed: false,
  profile: DEMO_PROFILE,
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
  state = { ...initial(), ...saved };
  return state;
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const cur = load();
  state = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
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

export const actions = {
  logIn(email?: string) {
    setState((s) => ({ authed: true, profile: email ? { ...s.profile, email } : s.profile }));
  },
  register(p: Pick<Profile, "first" | "last" | "email" | "phone">) {
    setState((s) => ({ authed: true, profile: { ...s.profile, ...p } }));
  },
  logOut() {
    const theme = getState().theme;
    state = { ...initial(), theme };
    setState({});
    try {
      sessionStorage.clear();
    } catch {}
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
