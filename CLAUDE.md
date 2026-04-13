# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Website for the band **Demà** (demabcn.cat). A retro OS-style interactive site built with vanilla HTML/CSS/JS frontend and a Node.js/Express backend. All UI text and validation messages are in **Catalan**.

## Commands

- **Run dev server:** `npm run dev` (starts on port 3001 by default)
- **Run production:** `NODE_ENV=production npm start` (port 3000)
- **DB backup:** `npm run backup`
- **Migrate JSON to DB:** `npm run migrate-json-db`
- **Clean orphaned photos:** `npm run cleanup-photos`
- **Deploy (Podman):** `bash deploy-podman.sh`

No test suite or linter is configured.

## Architecture

### Backend (Node.js + Express)

- **Entry point:** `server.js` — sets up Express, static file serving, security headers, CSP, and mounts routes.
- **Config:** `src/config.js` — centralized config from env vars (via dotenv). Dev/prod paths differ (local `./data/` vs container `/app/data/`).
- **Database:** `src/db/` — SQLite via `better-sqlite3`. `index.js` exports a facade object with all DB operations. Schema in `schema.js`, migrations in `migrations/`. All migrations are additive (CREATE IF NOT EXISTS); data is never wiped.
- **Routes:**
  - `src/routes/api.js` — public read-only API mounted at `/api` (health, tours, countdown, band-info, releases, gallery, tracks).
  - `src/routes/adminApi.js` — admin CRUD mounted at `/admin/api`, protected by cookie-session auth.
  - `src/routes/admin.js` — serves the admin HTML page.
- **Middleware:** `src/middleware.js` — rate limiting, cookie-session auth, input sanitization, validation, error handler.
- **Auth:** Simple password-based admin login with timing-safe comparison, cookie-session, and rate-limited login endpoint.

### Frontend (Vanilla JS)

- `public/index.html` — main site (retro OS desktop UI)
- `public/admin.html` — admin panel
- `public/js/script.js` — main site logic
- `public/js/admin/` — admin panel scripts
- `public/css/styles.css`, `98.css`, `mobile.css` — styling (Windows 98-inspired theme)

### Data Storage

- **SQLite DB:** `data/band.db` (dev) or `/app/data/band.db` (prod). Tables: tours, countdown, gallery, settings, releases, tracks.
- **File uploads:** Gallery images and audio tracks stored on disk. Paths differ by environment (see `src/config.js`).
- **DB file is gitignored.** `data/band-info.json` exists as legacy seed data.

### Deployment

- Container-based via Podman on Oracle Linux VM. See `DEPLOY.md` for full details.
- `Containerfile` builds a Node 20-slim image with `/app/data` as a persistent volume.
- `deploy-podman.sh` handles the full deploy lifecycle (install deps, build image, nginx, certbot, systemd).

## Key Patterns

- The DB facade in `src/db/index.js` is injected into route modules as a function argument — routes receive `db` and call methods on it.
- Each domain (tours, gallery, releases, tracks, settings, countdown) has its own module under `src/db/` with pure functions that take `(db, ...)` args.
- All API responses and error messages use Catalan.
- No build step for frontend — files are served directly from `public/`.
