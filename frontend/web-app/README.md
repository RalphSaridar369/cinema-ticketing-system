# Velour web app

Responsive Next.js implementation of the Velour cinema booking prototype (Claude Design project "Velour Prototype").

## Run

```bash
cd frontend/web-app
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

Log in with any valid email and a non-empty password. All data is mocked; nothing is sent to the `backend/` Supabase project yet.

## Stack

- Next.js 16 (App Router, Cache Components, Partial Prefetching), React 19, TypeScript
- Tailwind CSS v4 with the Velour palette as CSS variables (`src/app/globals.css`), dark and light themes
- Fonts: Sora (display), Manrope (body), DM Mono (labels) via `next/font`

## Layout

One codebase, two layouts switched at the `md` breakpoint (768px):

- Mobile: bottom tab bar (Home, Book, My Tickets, Profile), zoomable seat map, sticky booking bar
- Desktop: top navigation with branch picker and avatar, seat map with a summary sidebar

## Routes

| Route | Screen |
| --- | --- |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Auth flow |
| `/` | Home: recommended, genres, now showing, popular |
| `/branches` | Choose a cinema |
| `/branches/[branch]` | Movies and showtimes at a branch |
| `/movies/[movie]` | Movie details, rating, favorites, showtimes |
| `/book/[showtime]` | Seat selection |
| `/book/[showtime]/checkout?seats=…` | Review and confirm |
| `/tickets/[ref]` | Ticket carousel (`?new=1` after booking) |
| `/my-tickets` | Upcoming and past bookings |
| `/profile`, `/profile/password`, `/profile/favorites`, `/profile/watchlist` | Account |

## Code map

- `src/lib/data.ts`: branches, movies, rooms, and deterministic showtime and seat generation ported from the prototype
- `src/lib/store.ts`: client store persisted to `localStorage` (session, branch, favorites, ratings, bookings, theme) and toasts
- `src/components/app-shell.tsx`: auth gate, desktop nav, mobile tab bar
- `src/components/screens/*`: the larger interactive screens

## Next steps

- Replace `src/lib/data.ts` and the store's auth and booking actions with calls to the Supabase backend
- Real posters and backdrops (currently striped placeholders, as in the prototype)
