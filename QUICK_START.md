# Quick Start Guide - Web Demà Modernization

## For Developers Ready to Start

This guide helps you get started with implementing the modernization plan. Read this first, then refer to the detailed documents for specific guidance.

## Prerequisites

- Node.js 18+ installed
- npm 8+ installed
- Git configured
- Text editor (VS Code recommended)
- Basic knowledge of TypeScript, Svelte, and Express

## Step 0: Understand the Current System

### 1. Read the Documentation
```bash
# Start here (5 minutes each)
cat README.md                      # Current system overview
cat MODERNIZATION_PLAN.md          # What we're building
cat IMPLEMENTATION_ROADMAP.md      # How to get there
cat TECHNICAL_SPECIFICATION.md     # Technical details
cat MIGRATION_GUIDE.md            # Step-by-step migration
```

### 2. Run the Current Application
```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Start the server
npm start

# Visit in browser
open http://localhost:3001
```

### 3. Explore the Codebase
```bash
# Key files to understand
less script.js      # Main frontend logic (2142 lines)
less server.js      # Backend API (732 lines)
less database.js    # Database layer (9KB)
less styles.css     # Desktop styles (1586 lines)
```

### 4. Test the Features
- Open different windows (About, Music, Tours, Gallery)
- Try dragging windows and icons
- Change wallpaper
- Visit admin panel: http://localhost:3001/admin?password=dema2025!

## Step 1: Set Up Your Development Environment

### Install Additional Tools
```bash
# Install TypeScript globally (optional but helpful)
npm install -g typescript

# Install development dependencies
npm install -D vitest @vitest/ui @playwright/test
npm install -D typescript @types/node @types/express
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
npm install -D prettier eslint-config-prettier
```

### Configure VS Code (Recommended)
Create `.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "files.associations": {
    "*.svelte": "svelte"
  }
}
```

Install VS Code extensions:
- Svelte for VS Code
- ESLint
- Prettier
- TypeScript and JavaScript Language Features

## Step 2: Choose Your Starting Point

You have three options:

### Option A: Security First (Recommended for Production)
**Best if**: Current site is in production and needs immediate security improvements

```bash
# Start with Sprint 1 from IMPLEMENTATION_ROADMAP.md
# Focus: Security fixes and testing

# 1. Fix security vulnerabilities
npm audit fix

# 2. Add input validation library
npm install validator xss

# 3. Set up testing
npm install -D vitest @vitest/ui
```

**Follow**: Sprint 1 in IMPLEMENTATION_ROADMAP.md

### Option B: Backend First (Recommended for Most)
**Best if**: You want to improve code quality before adding new features

```bash
# Start with Sprint 2-3 from IMPLEMENTATION_ROADMAP.md
# Focus: TypeScript and better architecture

# 1. Set up TypeScript
npm install -D typescript @types/node @types/express
npx tsc --init

# 2. Rename database.js to database.ts
# 3. Add types gradually
```

**Follow**: Sprint 2-3 in IMPLEMENTATION_ROADMAP.md

### Option C: Full Rewrite (Recommended for Learning)
**Best if**: Starting a new project or learning the modern stack

```bash
# Follow MIGRATION_GUIDE.md from the beginning
# Focus: Build everything new

# 1. Create new directory structure
mkdir -p client/src/lib/{components,stores,services}
mkdir -p server/src/{api,db,services}

# 2. Initialize client with Vite + Svelte
cd client
npm create vite@latest . -- --template svelte-ts
npm install

# 3. Initialize server with TypeScript
cd ../server
npm init -y
npm install express better-sqlite3 dotenv
npm install -D typescript @types/node @types/express
```

**Follow**: MIGRATION_GUIDE.md from Phase 1

## Step 3: First Commit

### Create a Feature Branch
```bash
# Create branch for your work
git checkout -b feature/modernization-phase1

# Or more specific
git checkout -b feature/add-typescript-backend
git checkout -b feature/add-tests
git checkout -b feature/svelte-components
```

### Make Your First Change
Let's add TypeScript to the backend as an example:

```bash
# Install TypeScript
npm install -D typescript @types/node @types/express @types/better-sqlite3

# Initialize TypeScript
npx tsc --init

# Configure tsconfig.json
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["server.js", "database.js"],
  "exclude": ["node_modules", "dist"]
}
EOF

# Rename files
mv database.js database.ts
mv server.js server.ts

# Add build script to package.json
npm pkg set scripts.build="tsc"
npm pkg set scripts.dev="tsx server.ts"

# Test build
npm run build
```

### Test Your Changes
```bash
# Make sure everything still works
npm start

# Visit the site
curl http://localhost:3001/api/tours

# If it works, commit
git add .
git commit -m "feat: add TypeScript configuration"
git push origin feature/add-typescript-backend
```

## Step 4: Continuous Development

### Daily Workflow
```bash
# 1. Pull latest changes
git pull origin main

# 2. Create/switch to feature branch
git checkout -b feature/your-feature

# 3. Make changes
# ... edit files ...

# 4. Test locally
npm run dev      # Development server
npm run test     # Run tests
npm run build    # Test production build

# 5. Commit and push
git add .
git commit -m "feat: your feature description"
git push origin feature/your-feature

# 6. Create pull request on GitHub
```

### Testing Checklist
Before committing, verify:
- [ ] Server starts without errors
- [ ] All existing features still work
- [ ] New features work as expected
- [ ] No console errors in browser
- [ ] Admin panel still works
- [ ] Tests pass (if applicable)
- [ ] Code is formatted and linted

## Step 5: Common Tasks

### Adding a New Backend Route
```typescript
// 1. Create route file: server/src/api/routes/newFeature.ts
import { Router } from 'express';

export function createNewFeatureRouter() {
  const router = Router();
  
  router.get('/', (req, res) => {
    res.json({ message: 'Hello from new feature' });
  });
  
  return router;
}

// 2. Register in server/src/index.ts
import { createNewFeatureRouter } from './api/routes/newFeature';
app.use('/api/new-feature', createNewFeatureRouter());

// 3. Test
curl http://localhost:3001/api/new-feature
```

### Adding a New Svelte Component
```svelte
<!-- 1. Create component: client/src/lib/components/NewComponent.svelte -->
<script lang="ts">
  export let title: string;
</script>

<div class="window">
  <div class="title-bar">
    <div class="title-bar-text">{title}</div>
  </div>
  <div class="window-body">
    <p>Content goes here</p>
  </div>
</div>

<!-- 2. Use in parent component -->
<script lang="ts">
  import NewComponent from '$lib/components/NewComponent.svelte';
</script>

<NewComponent title="My Window" />
```

### Adding Tests
```typescript
// 1. Create test file: server/tests/database.test.ts
import { describe, it, expect } from 'vitest';
import { BandDatabase } from '../database';

describe('BandDatabase', () => {
  it('should add a tour', () => {
    const db = new BandDatabase(':memory:');
    const tour = db.addTour({
      date: '2025-12-31',
      city: 'Barcelona',
      venue: 'Sala Apolo'
    });
    expect(tour).toHaveProperty('id');
  });
});

// 2. Run tests
npm run test
```

## Step 6: Getting Help

### Documentation Resources
- **MODERNIZATION_PLAN.md** - Overall vision and phases
- **IMPLEMENTATION_ROADMAP.md** - Sprint-by-sprint guide
- **TECHNICAL_SPECIFICATION.md** - Technical details of current and new systems
- **MIGRATION_GUIDE.md** - Step-by-step migration instructions

### When You're Stuck
1. Check the relevant documentation above
2. Look at the current code for examples
3. Search the issues on GitHub
4. Ask in pull request comments
5. Create an issue with your question

### External Resources
- **Svelte**: https://svelte.dev/tutorial
- **Vite**: https://vitejs.dev/guide/
- **TypeScript**: https://www.typescriptlang.org/docs/
- **Express**: https://expressjs.com/
- **Vitest**: https://vitest.dev/

## Step 7: Review Checklist

Before submitting a pull request:

### Code Quality
- [ ] Code follows TypeScript strict mode
- [ ] No console.log() left in code
- [ ] Error handling for all edge cases
- [ ] Input validation for all user inputs
- [ ] Comments for complex logic

### Testing
- [ ] All tests pass
- [ ] New features have tests
- [ ] Manual testing completed
- [ ] Tested on different browsers (Chrome, Firefox, Safari)
- [ ] Tested on mobile devices

### Security
- [ ] No secrets in code
- [ ] Input sanitization
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] CSRF protection (for state-changing operations)

### Performance
- [ ] No unnecessary re-renders (Svelte)
- [ ] Images optimized
- [ ] Bundle size reasonable
- [ ] No memory leaks

### Documentation
- [ ] README updated if needed
- [ ] API documentation updated if endpoints changed
- [ ] Comments added for complex code
- [ ] Migration guide updated if structure changed

## Next Steps

1. **Choose your starting point** (Option A, B, or C above)
2. **Read the relevant detailed document**
3. **Set up your environment**
4. **Make your first commit**
5. **Follow the roadmap incrementally**

## Quick Commands Reference

```bash
# Development
npm install                    # Install dependencies
npm start                      # Start production server
npm run dev                    # Start development server
npm run build                  # Build for production
npm run test                   # Run tests
npm run test:ui                # Run tests with UI

# Database
npm run backup                 # Backup database
node scripts/test-database.js  # Test database connection

# Git
git status                     # Check status
git add .                      # Stage all changes
git commit -m "message"        # Commit changes
git push                       # Push to remote

# Docker (when ready)
docker-compose up              # Start all services
docker-compose down            # Stop all services
docker-compose logs -f         # View logs
```

## Tips for Success

1. **Start Small**: Don't try to do everything at once
2. **Test Often**: Test after each small change
3. **Commit Frequently**: Small, focused commits are better
4. **Read the Docs**: The detailed guides have everything you need
5. **Ask Questions**: Better to ask than to go wrong direction
6. **Keep It Working**: Never break the current site
7. **Have Fun**: This is a cool project with a great retro aesthetic!

---

**Ready to start?** Pick your starting point above and dive in!

**Need help?** Check the detailed documentation or create an issue.

**Want to contribute?** All contributions welcome! Follow the roadmap and submit PRs.

---

*Quick Start Guide v1.0*  
*Last Updated: 2025-11-01*
