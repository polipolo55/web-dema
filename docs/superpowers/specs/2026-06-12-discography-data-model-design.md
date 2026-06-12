# Discography Data Model Redesign

**Date:** 2026-06-12
**Status:** Approved

## Goal

Replace the current denormalized discography storage (releases with a `tracks_json`
blob, plus an unrelated `tracks` table for the retro music player) with a normalized
model where songs are first-class entities, releases (LP/EP/single) reference songs
through a junction table, and the music player is backed by songs that have uploaded
audio.

## Decisions (made with the user)

1. **Songs ↔ releases is many-to-many.** A song released as a single can later appear
   on an LP without duplication.
2. **The music player merges into songs.** A song optionally carries an uploaded audio
   file; the retro player plays songs that have audio. The standalone `tracks` table
   goes away.
3. **Fresh start, no data migration.** Existing `releases` and `tracks` rows are not
   converted. The discography is re-entered through the admin panel.
4. **Release types are a fixed list:** `album`, `ep`, `single`, `other` (replaces
   today's free-text `type`).
5. **Lyrics window is in scope.** Clicking a song in the discography opens its lyrics
   in a Notepad-style window on the main site.

## Schema

All new tables created by a new migration (`003_discography.js`), following the
existing migration pattern in `src/db/migrations/`.

### Fresh start, safely

The migration renames the old tables instead of dropping them, preserving the
project's "data is never wiped" rule:

- `releases` → `releases_legacy`
- `tracks` → `tracks_legacy`

The legacy tables are never read by application code after the migration.
`schema.js` no longer creates the old shapes; it creates the new tables below
(CREATE TABLE IF NOT EXISTS, as today).

### `songs`

```sql
CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    duration_seconds INTEGER,        -- admin enters m:ss, stored as seconds
    lyrics TEXT,                     -- plain text
    recorded_year INTEGER,
    recorded_place TEXT,             -- studio / place of recording
    notes TEXT,                      -- credits, anecdotes
    audio_filename TEXT,             -- uploaded audio for the retro player
    audio_mime TEXT,
    player_order INTEGER,            -- position in retro player; NULL = not in player
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `releases`

```sql
CREATE TABLE IF NOT EXISTS releases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('album','ep','single','other')),
    release_date TEXT,               -- ISO YYYY-MM-DD; year derived in code
    cover TEXT,                      -- uploaded image path
    description TEXT,
    recorded_place TEXT,
    spotify TEXT,
    youtube TEXT,
    apple_music TEXT,
    published INTEGER NOT NULL DEFAULT 1,  -- 0 = draft, hidden from public API
    sort_order INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Streaming links stay at the release level: a single is itself a release, so per-song
links are unnecessary.

### `release_songs`

```sql
CREATE TABLE IF NOT EXISTS release_songs (
    release_id INTEGER NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (release_id, song_id)
);
```

Deleting a release keeps its songs; deleting a song removes it from any tracklists.
`PRAGMA foreign_keys = ON` must be set at DB connection init (it currently is not).

## Backend changes

### DB layer (`src/db/`)

- **New `songs.js`** — pure functions taking `(db, ...)` like the other modules:
  list, get by id, create, update, delete, set/clear audio, reorder player,
  list player songs (audio present, ordered by `player_order`).
- **Rewritten `releases.js`** — CRUD plus tracklist operations
  (`setReleaseSongs(db, releaseId, songIds)` writes positions in a transaction),
  `getReleases(db, { includeDrafts })` joins `release_songs` + `songs` and returns
  releases with an ordered, embedded `songs` array.
- **Deleted `tracks.js`.** Facade in `index.js` updated; `migrate.js` and the
  backup/cleanup scripts updated where they reference `tracks`.

### Public API (`src/routes/api.js`)

- `GET /api/releases` — published releases with embedded ordered songs
  (id, title, duration, position; lyrics included so the lyrics window needs no
  extra request).
- `GET /api/tracks` — **keeps its URL and response shape** for player compatibility,
  now backed by songs with audio (`player_order` ordering). `GET /api/tracks/file/:id`
  serves the audio by **song id**.
- `GET /api/band-info` — discography portion sourced from the new model.

### Admin API (`src/routes/adminApi.js`)

- `/admin/api/songs` — CRUD, audio upload (reusing the existing upload handling
  pattern from tracks), player reorder.
- `/admin/api/releases` — CRUD, cover upload, `published` toggle, tracklist
  management (set ordered song ids), release reorder.
- Old track endpoints removed.

All validation messages in Catalan, as everywhere else.

## Frontend changes

### Admin panel (`public/admin.html` + `public/js/admin/`)

Two sections replace the current releases + tracks sections:

- **Cançons** — song library table; form with title, duration (m:ss input),
  lyrics textarea, recording year/place, notes, audio upload, "show in player"
  toggle + player ordering.
- **Llançaments** — release list (drag to reorder); form with title, type select,
  release date, cover upload, description, streaming links, published toggle, and a
  tracklist editor: pick songs from the library, reorder within the release.

### Main site (`public/index.html` + `public/js/`)

- Discography window renders from the new `/api/releases` shape (markup largely
  unchanged; duration formatted from seconds).
- **Lyrics window:** clicking a song title in a tracklist opens a Notepad-style
  window (reusing the existing window manager / 98.css styling) showing the song
  title, duration, recording year/place, and lyrics. Songs without lyrics show
  "Lletra no disponible." (Catalan).
- Retro music player: unchanged behavior; same endpoint contract.

## Error handling

- DB writes wrapped in transactions where multi-row (tracklist set, reorders) —
  same pattern as existing `reorderRelease`.
- Admin input normalized/sanitized following the existing `normalizeText` pattern.
- Invalid `type` rejected at validation layer (and by the CHECK constraint).
- Deleting a song with audio also deletes the file from disk (same as current
  track/gallery deletion behavior).

## Testing

No test suite or linter exists in this project. Verification is manual:
`npm run dev`, then exercise via admin panel and main site — create songs with and
without audio/lyrics, build an EP and a single sharing a song, reorder tracklists
and player, toggle published, delete a song that's on a release, play audio,
open the lyrics window.

## Out of scope

- Migrating legacy data (tables kept as `*_legacy` only as a safety net).
- Per-song streaming links.
- Multi-artist credits, featured artists, songwriting splits.
