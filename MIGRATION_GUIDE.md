# Web Demà - Migration Guide

## Overview

This guide provides step-by-step instructions for migrating the Demà Band website from its current monolithic architecture to the modernized Svelte-based architecture. Follow these steps in order to ensure a smooth transition.

## Prerequisites

Before starting the migration:

- [ ] Backup current database: `npm run backup`
- [ ] Backup all gallery photos: `cp -r assets/gallery assets/gallery.backup`
- [ ] Document current admin password from `.env`
- [ ] Test current site thoroughly and document all features
- [ ] Set up staging environment
- [ ] Review and approve MODERNIZATION_PLAN.md

## Phase 1: Project Initialization

### Step 1.1: Create New Directory Structure

```bash
# Create main directories
mkdir -p client/src/{lib,routes}
mkdir -p client/src/lib/{components,stores,services,utils,types}
mkdir -p client/src/routes/admin
mkdir -p client/static/assets

# Create server directories
mkdir -p server/src/{api,db,services,utils}
mkdir -p server/src/api/{routes,middleware}
mkdir -p server/src/db/{migrations,models}
mkdir -p server/tests/{unit,integration}
```

### Step 1.2: Initialize Client (Svelte + Vite)

```bash
cd client

# Initialize Svelte + TypeScript + Vite project
npm create vite@latest . -- --template svelte-ts

# Install dependencies
npm install

# Install additional dependencies
npm install @98-css/98-css
npm install -D @sveltejs/adapter-static
npm install -D vitest @vitest/ui
npm install -D @playwright/test
```

**Configure vite.config.ts:**
```typescript
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../dist/client'
  }
});
```

### Step 1.3: Initialize Server (Express + TypeScript)

```bash
cd server

# Initialize package.json
npm init -y

# Install dependencies
npm install express better-sqlite3 dotenv multer cors
npm install -D typescript @types/node @types/express @types/better-sqlite3 @types/multer @types/cors
npm install -D tsx nodemon

# Install testing dependencies
npm install -D vitest @vitest/ui supertest @types/supertest
```

**Configure tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "../dist/server",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "tests"]
}
```

**Update package.json scripts:**
```json
{
  "scripts": {
    "dev": "nodemon --watch src --exec tsx src/index.ts",
    "build": "tsc",
    "start": "node ../dist/server/index.js",
    "test": "vitest",
    "test:ui": "vitest --ui"
  }
}
```

### Step 1.4: Set Up Docker

**Create Dockerfile.client:**
```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Create Dockerfile.server:**
```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev
COPY data/ ./data/
COPY assets/ ./assets/
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

**Create docker-compose.yml:**
```yaml
version: '3.8'

services:
  client:
    build:
      context: .
      dockerfile: Dockerfile.client
    ports:
      - "80:80"
    depends_on:
      - server
    environment:
      - API_URL=http://server:3001

  server:
    build:
      context: .
      dockerfile: Dockerfile.server
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
    volumes:
      - ./data:/app/data
      - ./assets:/app/assets
```

## Phase 2: Backend Migration

### Step 2.1: Set Up Database Layer

**Create server/src/db/database.ts:**
```typescript
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export class BandDatabase {
  private db: Database.Database;

  constructor(dbPath: string = './data/band.db') {
    // Ensure data directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tours (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        city TEXT NOT NULL,
        venue TEXT NOT NULL,
        info TEXT,
        tickets_url TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS gallery (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL UNIQUE,
        caption TEXT,
        uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS countdown (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        enabled INTEGER DEFAULT 0,
        target_date TEXT,
        title TEXT,
        description TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tours_date ON tours(date);
      CREATE INDEX IF NOT EXISTS idx_gallery_uploaded ON gallery(uploaded_at);
    `);
  }

  // Tour methods
  getAllTours() {
    return this.db.prepare('SELECT * FROM tours ORDER BY date ASC').all();
  }

  addTour(tour: { date: string; city: string; venue: string; info?: string; tickets_url?: string }) {
    const stmt = this.db.prepare(
      'INSERT INTO tours (date, city, venue, info, tickets_url) VALUES (?, ?, ?, ?, ?)'
    );
    const result = stmt.run(tour.date, tour.city, tour.venue, tour.info || null, tour.tickets_url || null);
    return this.db.prepare('SELECT * FROM tours WHERE id = ?').get(result.lastInsertRowid);
  }

  updateTour(id: number, tour: { date: string; city: string; venue: string; info?: string; tickets_url?: string }) {
    const stmt = this.db.prepare(
      'UPDATE tours SET date = ?, city = ?, venue = ?, info = ?, tickets_url = ? WHERE id = ?'
    );
    stmt.run(tour.date, tour.city, tour.venue, tour.info || null, tour.tickets_url || null, id);
    return this.db.prepare('SELECT * FROM tours WHERE id = ?').get(id);
  }

  deleteTour(id: number) {
    const stmt = this.db.prepare('DELETE FROM tours WHERE id = ?');
    return stmt.run(id);
  }

  // Gallery methods
  getAllPhotos() {
    return this.db.prepare('SELECT * FROM gallery ORDER BY uploaded_at DESC').all();
  }

  addPhoto(photo: { filename: string; caption?: string }) {
    const stmt = this.db.prepare('INSERT INTO gallery (filename, caption) VALUES (?, ?)');
    const result = stmt.run(photo.filename, photo.caption || null);
    return this.db.prepare('SELECT * FROM gallery WHERE id = ?').get(result.lastInsertRowid);
  }

  deletePhoto(filename: string) {
    const stmt = this.db.prepare('DELETE FROM gallery WHERE filename = ?');
    return stmt.run(filename);
  }

  // Countdown methods
  getCountdown() {
    return this.db.prepare('SELECT * FROM countdown WHERE id = 1').get();
  }

  updateCountdown(data: { enabled: boolean; target_date?: string; title?: string; description?: string }) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO countdown (id, enabled, target_date, title, description)
      VALUES (1, ?, ?, ?, ?)
    `);
    stmt.run(data.enabled ? 1 : 0, data.target_date || null, data.title || null, data.description || null);
    return this.getCountdown();
  }

  close() {
    this.db.close();
  }
}
```

### Step 2.2: Create Type Definitions

**Create server/src/types/index.ts:**
```typescript
export interface Tour {
  id?: number;
  date: string;
  city: string;
  venue: string;
  info?: string;
  tickets_url?: string;
  created_at?: string;
}

export interface Photo {
  id?: number;
  filename: string;
  caption?: string;
  uploaded_at?: string;
  url?: string;
}

export interface Countdown {
  id?: number;
  enabled: boolean;
  target_date?: string;
  title?: string;
  description?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

### Step 2.3: Create Middleware

**Create server/src/api/middleware/auth.ts:**
```typescript
import { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return res.status(500).json({ 
      success: false,
      error: 'Server configuration error: Admin password not configured' 
    });
  }

  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const token = authHeader.substring(7);
  
  if (token !== adminPassword) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  next();
}
```

**Create server/src/api/middleware/validation.ts:**
```typescript
import { Request, Response, NextFunction } from 'express';
import type { Tour } from '../../types';

export function validateTourData(req: Request, res: Response, next: NextFunction) {
  const { date, city, venue } = req.body as Partial<Tour>;

  if (!date || !city || !venue) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: date, city, venue'
    });
  }

  if (typeof date !== 'string' || typeof city !== 'string' || typeof venue !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Invalid field types'
    });
  }

  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid date format. Use YYYY-MM-DD'
    });
  }

  // Check field lengths
  if (city.length > 100 || venue.length > 200) {
    return res.status(400).json({
      success: false,
      error: 'Field length exceeded'
    });
  }

  next();
}
```

### Step 2.4: Create Route Handlers

**Create server/src/api/routes/tours.ts:**
```typescript
import { Router } from 'express';
import type { BandDatabase } from '../../db/database';
import { requireAuth } from '../middleware/auth';
import { validateTourData } from '../middleware/validation';

export function createTourRouter(db: BandDatabase) {
  const router = Router();

  // GET /api/tours - Get all tours
  router.get('/', (req, res) => {
    try {
      const tours = db.getAllTours();
      res.json({ success: true, data: tours });
    } catch (error) {
      console.error('Error fetching tours:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch tours' });
    }
  });

  // POST /api/tours - Create tour (auth required)
  router.post('/', requireAuth, validateTourData, (req, res) => {
    try {
      const tour = db.addTour(req.body);
      res.json({ success: true, data: tour });
    } catch (error) {
      console.error('Error creating tour:', error);
      res.status(500).json({ success: false, error: 'Failed to create tour' });
    }
  });

  // PUT /api/tours/:id - Update tour (auth required)
  router.put('/:id', requireAuth, validateTourData, (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const tour = db.updateTour(id, req.body);
      res.json({ success: true, data: tour });
    } catch (error) {
      console.error('Error updating tour:', error);
      res.status(500).json({ success: false, error: 'Failed to update tour' });
    }
  });

  // DELETE /api/tours/:id - Delete tour (auth required)
  router.delete('/:id', requireAuth, (req, res) => {
    try {
      const id = parseInt(req.params.id);
      db.deleteTour(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting tour:', error);
      res.status(500).json({ success: false, error: 'Failed to delete tour' });
    }
  });

  return router;
}
```

### Step 2.5: Create Server Entry Point

**Create server/src/index.ts:**
```typescript
import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { BandDatabase } from './db/database';
import { createTourRouter } from './api/routes/tours';
// Import other routers...

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database
const db = new BandDatabase();

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(cors());

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// API routes
app.use('/api/tours', createTourRouter(db));
// Add other routes...

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});
```

## Phase 3: Frontend Migration

### Step 3.1: Create Base Components

**Create client/src/lib/components/Window.svelte:**
```svelte
<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let id: string;
  export let title: string;
  export let x: number = 100;
  export let y: number = 100;
  export let width: number = 400;
  export let height: number = 300;

  const dispatch = createEventDispatcher();

  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  function handleMouseDown(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('.window-controls')) return;
    
    isDragging = true;
    dragOffset = {
      x: e.clientX - x,
      y: e.clientY - y
    };
    dispatch('focus');
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    x = e.clientX - dragOffset.x;
    y = e.clientY - dragOffset.y;
  }

  function handleMouseUp() {
    isDragging = false;
  }

  function close() {
    dispatch('close');
  }
</script>

<svelte:window 
  on:mousemove={handleMouseMove}
  on:mouseup={handleMouseUp}
/>

<div 
  class="window" 
  class:dragging={isDragging}
  style="left: {x}px; top: {y}px; width: {width}px; height: {height}px;"
  on:mousedown={() => dispatch('focus')}
>
  <div class="title-bar" on:mousedown={handleMouseDown}>
    <div class="title-bar-text">{title}</div>
    <div class="title-bar-controls">
      <button aria-label="Close" on:click={close}></button>
    </div>
  </div>
  <div class="window-body">
    <slot />
  </div>
</div>

<style>
  .window {
    position: absolute;
    box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.3);
  }

  .window.dragging {
    cursor: move;
  }

  .title-bar {
    cursor: move;
  }

  .window-body {
    height: calc(100% - 30px);
    overflow: auto;
    padding: 10px;
  }
</style>
```

### Step 3.2: Create Stores

**Create client/src/lib/stores/windows.ts:**
```typescript
import { writable } from 'svelte/store';

interface WindowState {
  id: string;
  title: string;
  component: any;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

function createWindowStore() {
  const { subscribe, update } = writable<WindowState[]>([]);
  let zIndexCounter = 100;

  return {
    subscribe,
    open: (window: Omit<WindowState, 'zIndex'>) => {
      update(windows => {
        // Check if window already open
        if (windows.find(w => w.id === window.id)) {
          return windows;
        }
        return [...windows, { ...window, zIndex: zIndexCounter++ }];
      });
    },
    close: (id: string) => {
      update(windows => windows.filter(w => w.id !== id));
    },
    focus: (id: string) => {
      update(windows => {
        return windows.map(w => ({
          ...w,
          zIndex: w.id === id ? zIndexCounter++ : w.zIndex
        }));
      });
    }
  };
}

export const windows = createWindowStore();
```

## Testing Strategy

### Backend Tests

**Example: server/tests/unit/database.test.ts:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BandDatabase } from '../../src/db/database';
import fs from 'fs';

describe('BandDatabase', () => {
  let db: BandDatabase;
  const testDbPath = './test-data/test.db';

  beforeEach(() => {
    db = new BandDatabase(testDbPath);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should create a tour', () => {
    const tour = db.addTour({
      date: '2025-12-31',
      city: 'Barcelona',
      venue: 'Sala Apolo'
    });

    expect(tour).toHaveProperty('id');
    expect(tour.city).toBe('Barcelona');
  });

  it('should get all tours', () => {
    db.addTour({ date: '2025-12-31', city: 'Barcelona', venue: 'Sala Apolo' });
    db.addTour({ date: '2025-11-15', city: 'Madrid', venue: 'Joy Eslava' });

    const tours = db.getAllTours();
    expect(tours).toHaveLength(2);
  });
});
```

### Frontend Tests

**Example: client/src/lib/components/Window.test.ts:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Window from './Window.svelte';

describe('Window component', () => {
  it('renders with title', () => {
    const { getByText } = render(Window, {
      props: {
        id: 'test',
        title: 'Test Window'
      }
    });

    expect(getByText('Test Window')).toBeInTheDocument();
  });

  it('emits close event when close button clicked', async () => {
    const { component, container } = render(Window, {
      props: {
        id: 'test',
        title: 'Test Window'
      }
    });

    let closed = false;
    component.$on('close', () => { closed = true; });

    const closeButton = container.querySelector('.title-bar-controls button');
    await fireEvent.click(closeButton!);

    expect(closed).toBe(true);
  });
});
```

## Data Migration

### Step 1: Export Current Data

```bash
# Run this on the current production server
node -e "
const Database = require('better-sqlite3');
const fs = require('fs');

const db = new Database('./data/band.db');

const data = {
  tours: db.prepare('SELECT * FROM tours').all(),
  gallery: db.prepare('SELECT * FROM gallery').all(),
  countdown: db.prepare('SELECT * FROM countdown WHERE id = 1').get()
};

fs.writeFileSync('./data-export.json', JSON.stringify(data, null, 2));
console.log('Data exported to data-export.json');
"
```

### Step 2: Import to New System

```bash
# Run this on the new system
node -e "
const Database = require('better-sqlite3');
const fs = require('fs');

const data = JSON.parse(fs.readFileSync('./data-export.json', 'utf8'));
const db = new Database('./data/band.db');

// Import tours
const insertTour = db.prepare('INSERT INTO tours (date, city, venue, info, tickets_url) VALUES (?, ?, ?, ?, ?)');
data.tours.forEach(tour => {
  insertTour.run(tour.date, tour.city, tour.venue, tour.info, tour.tickets_url);
});

// Import gallery
const insertPhoto = db.prepare('INSERT INTO gallery (filename, caption) VALUES (?, ?)');
data.gallery.forEach(photo => {
  insertPhoto.run(photo.filename, photo.caption);
});

// Import countdown
if (data.countdown) {
  const insertCountdown = db.prepare('INSERT OR REPLACE INTO countdown (id, enabled, target_date, title, description) VALUES (1, ?, ?, ?, ?)');
  insertCountdown.run(data.countdown.enabled, data.countdown.target_date, data.countdown.title, data.countdown.description);
}

console.log('Data imported successfully');
"
```

## Deployment

### Step 1: Build Production Bundles

```bash
# Build client
cd client
npm run build

# Build server
cd ../server
npm run build
```

### Step 2: Deploy with Docker

```bash
# Build and run containers
docker-compose up -d

# Check logs
docker-compose logs -f
```

### Step 3: Deploy Without Docker

```bash
# Copy files to server
scp -r dist/ user@server:/var/www/dema/
scp -r data/ user@server:/var/www/dema/
scp -r assets/ user@server:/var/www/dema/

# On server, install dependencies and start
cd /var/www/dema
npm ci --omit=dev
pm2 start dist/server/index.js --name dema-web
pm2 save
```

## Rollback Procedure

If issues arise:

```bash
# Stop new version
pm2 stop dema-web

# Start old version
pm2 start ecosystem.config.json

# Restore database
cp data/band.db.backup data/band.db

# Verify old version works
curl http://localhost:3001/api/tours
```

## Verification Checklist

After deployment, verify:

- [ ] Homepage loads correctly
- [ ] All windows can be opened
- [ ] Tour dates display correctly
- [ ] Gallery photos load
- [ ] Countdown works (if enabled)
- [ ] Admin panel accessible
- [ ] Can create/edit/delete tours
- [ ] Can upload photos
- [ ] Mobile version works
- [ ] All links work
- [ ] No console errors

## Monitoring

Set up monitoring for:

- Server uptime
- API response times
- Error rates
- Database performance
- Disk space (for photos)

## Support

If issues arise during migration:

1. Check server logs: `pm2 logs dema-web`
2. Check browser console for frontend errors
3. Verify database file exists and has correct permissions
4. Verify `.env` file has correct values
5. Check network connectivity between client and server

---

*Document Version: 1.0*  
*Last Updated: 2025-11-01*
