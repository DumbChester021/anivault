# AniVault

A self-hosted anime browsing, streaming, and vault app. Powered by [Jikan](https://jikan.moe) (metadata) and [Consumet](https://github.com/consumet/consumet.ts) (streaming). Optional Supabase backend for cloud sync.

---

## Features

### Browsing & Discovery
- **Home feed** — trending (airing), top-rated, recently completed, and upcoming seasonal anime carousels
- **Hero banner** — auto-generated from the top trending title with backdrop art
- **Search** — full-text search with quick filters (Latest Completed, Top Airing, Top Rated 18+)
- **Anime detail modal** — synopsis, score, genres, episode list, trailer embed, character cast

### Streaming
- **In-app player** — HLS streaming via [Plyr](https://plyr.io) + `hls.js`; supports multiple servers (AnimeKai, Zoro)
- **Sub / dub toggle** — switch audio track per episode
- **Watch history** — auto-saved progress (episode, timestamp) to IndexedDB and cloud

### Vault
- **Favorites** — save any anime; persists locally (IndexedDB) and syncs to Supabase when signed in
- **Watch history** — resume where you left off across devices
- **Update checks** — background polling detects new episodes or new seasons for all favorited anime

### Notifications
- **In-app notification bell** — new-episode and new-season alerts for favorites
- Unread badge, per-item read state, deduplication, stale-entry pruning
- Notification store persists to `localStorage` and syncs to cloud on login

### Downloader
- **Episode download** — fetches HLS segments and assembles to MP4/TS blob
- **Subtitle muxing** — optional ffmpeg.wasm pass to embed VTT subtitles into an MKV container (no server needed, runs in-browser)
- Per-episode download buttons in the episode list

### Auth & Cloud Sync (Supabase)
- Email / password sign-in and sign-up with confirmation email flow
- Password strength meter, show/hide toggle, honeypot anti-bot field
- **Cloud sync** — favorites, watch history, and app settings synced via Supabase; writes are batched and debounced (2 s) to respect rate limits
- **Local data migration banner** — on first login, detects any local-only data and offers a one-click import to cloud
- Account-scoped sync: switching users on the same browser never leaks another account's data

### Settings Page
Sidebar-navigated settings with three sections:

| Section | Options |
|---|---|
| Content | NSFW toggle (hides/shows 18+ quick-filter and adult titles) |
| Notifications | Toggle new-episode and new-season alerts |
| Account | Sign in / sign out, email display, sync status |

### Developer / Infrastructure
- **Startup diagnostics** — console logs Jikan + Consumet reachability with latency on page load
- **Global loading bar** — progress indicator for async page transitions
- **Consumet proxy** — Vercel serverless function (`api/consumet/[...path].js`) rewrites `/consumet/*` to a self-hosted or public Consumet instance; avoids CORS issues in production
- **Dev scripts** — `dev.sh` starts the Vite frontend; `dev-all.sh` starts frontend + local Consumet together

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS (ES modules), no framework |
| Metadata API | [Jikan v4](https://jikan.moe) (MAL wrapper) |
| Streaming API | [Consumet](https://github.com/consumet/consumet.ts) (self-hosted or Vercel proxy) |
| Player | Plyr + hls.js |
| Local storage | IndexedDB (via idb-style helpers in `js/db.js`) |
| Cloud | Supabase (Auth + Postgres) — optional |
| Subtitle muxing | ffmpeg.wasm (single-threaded, no COOP/COEP headers needed) |
| Deployment | Vercel (static + one serverless function) |

---

## Setup

### 1. Clone & install

```bash
git clone <repo>
cd anime
npm install        # only needed for dev tooling
```

### 2. Configure

Copy `js/env.example.js` to `js/env.js` and fill in:

```js
export const CONSUMET_API_BASE = 'http://localhost:3000';   // your Consumet instance
export const SUPABASE_URL       = '';   // optional — leave blank to disable cloud sync
export const SUPABASE_ANON_KEY  = '';   // optional
```

### 3. Run locally

```bash
./dev-all.sh    # starts frontend (Vite) + local Consumet together
# or
./dev.sh        # frontend only (if Consumet is already running)
```

### 4. Supabase (optional)

1. Create a Supabase project
2. Run `supabase-schema.sql` in the SQL editor to create the `favorites`, `history`, and `settings` tables
3. Add your project URL and anon key to `js/env.js` (or `js/config.js` for production builds)

### 5. Deploy to Vercel

Push to a Vercel-linked repo. The `vercel.json` routes `/consumet/*` through the serverless proxy automatically.

Set the following environment variable in your Vercel project settings:

```
CONSUMET_API_BASE=https://your-consumet-instance.vercel.app
```

---

## Project Structure

```
anime/
├── index.html                  # Single-page app shell
├── css/style.css               # All styles
├── js/
│   ├── app.js                  # Router, page controllers, auth UI, notification store
│   ├── api.js                  # Jikan API client (rate-limited)
│   ├── streaming.js            # Consumet streaming client
│   ├── db.js                   # IndexedDB helpers + cloud sync queue
│   ├── auth.js                 # Supabase auth wrapper
│   ├── sync.js                 # Supabase DB read/write helpers
│   ├── components.js           # UI component builders
│   ├── downloader.js           # HLS segment downloader
│   ├── muxer.js                # ffmpeg.wasm subtitle muxer
│   ├── updates.js              # Favorites update checker
│   ├── utils.js                # DOM helpers, debounce, toast, loading
│   └── config.js               # Runtime config (URLs, keys)
├── api/consumet/[...path].js   # Vercel serverless Consumet proxy
├── supabase-schema.sql         # DB schema for cloud sync
├── dev.sh                      # Frontend dev server
├── dev-all.sh                  # Frontend + Consumet dev server
└── vercel.json                 # Vercel routing config
```

---

## License

MIT
