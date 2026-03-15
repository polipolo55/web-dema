# Deployment guide (v2)

## How the database works (dev vs deployed)

- **Development** (`NODE_ENV` not set or `development`):
  - Database file: `./data/band.db` (relative to project root).
  - Gallery files: `./public/assets/gallery`
  - Track files: `./public/assets/audio/tracks`
  - Created automatically on first run if missing.

- **Production** (`NODE_ENV=production`), e.g. on your Oracle VM:
  - Database file: `/app/data/band.db` (or `DATABASE_PATH` if set).
  - Gallery files: `/app/data/gallery` (or `GALLERY_PATH`).
  - Track files: `/app/data/tracks` (or `TRACKS_PATH`).
  - The app creates the directory and empty DB only if they do not exist.

**Your data is never replaced when you deploy.**

- On startup the app only runs **CREATE TABLE IF NOT EXISTS** and **migrations** (new tables/columns). It does **not** drop tables or wipe data.
- Deploying new code (e.g. `git pull` + restart) uses the **same** data directory. So the same `band.db` and the same `gallery/` and `tracks/` folders are reused. Existing concerts, gallery, band info, and tracks stay as they are.
- To keep data across deploys: point the app at a **persistent** data path (e.g. `/app/data` or a mounted volume) and do **not** overwrite that directory when you deploy. The deploy scripts create `/app/data` once and set permissions; later deploys leave it in place and just restart the Node process.

## Environment variables

Set these in `.env` (or export before starting the app).

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_PASSWORD` | **Yes** (production) | Admin panel password. |
| `NODE_ENV` | No | `production` or `development`. Default: development. |
| `PORT` | No | Server port. Default: 3001 (dev), 3000 (prod). |
| `DATABASE_PATH` | No | SQLite DB path. Default: `./data/band.db` (dev), `/app/data/band.db` (prod). |
| `GALLERY_PATH` | No | Gallery uploads directory. Default: `./public/assets/gallery` (dev), `/app/data/gallery` (prod). |
| `TRACKS_PATH` | No | Audio tracks directory. Default: `./public/assets/audio/tracks` (dev), `/app/data/tracks` (prod). |
| `ADMIN_SESSION_SECRET` | No | Secret for signed session cookie. Defaults to `ADMIN_PASSWORD`. |
| `ADMIN_SESSION_COOKIE_NAME` | No | Cookie name. Default: `dema_admin_session`. |
| `ADMIN_SESSION_TTL_MS` | No | Session TTL in ms. Default: 8 hours. |
| `TRUST_PROXY` | No | Set to `1` or `true` when behind nginx/reverse proxy. |
| `RATE_LIMIT_WINDOW_MS` | No | Rate limit window (default 60000). |
| `RATE_LIMIT_MAX` | No | Max requests per window (default 100). |

## Data directory

- In production the app expects a writable data directory (e.g. `/app/data`).
- The app creates `band.db`, `gallery/`, and `tracks/` inside that directory on startup if they do not exist.
- Ensure the process user has read/write access to the data directory.

## Health check

- `GET /api/health` returns `200` with `{ ok: true, db: 'ok' }` when the app and database are healthy.
- Use this for monitoring or container health checks.

## Oracle Linux / PM2

- Use `deploy-to-oracle-linux.sh` or `deploy-minimal-oracle-linux.sh`.
- The deploy script uses `./src/db` (createDb) for database initialization.
- Nginx: `client_max_body_size` is set to 200M for gallery uploads.

## Container (Podman/Docker)

- Build: `podman build -f Containerfile -t dema-web .`
- Run with a volume for persistence:  
  `-v /host/data:/app/data`  
  and set `DATABASE_PATH=/app/data/band.db` (default in production).
- See `deploy-podman.sh` for an example.
