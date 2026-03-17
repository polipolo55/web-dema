# Web Demà

Pàgina web de la banda Demà — [demabcn.cat](https://demabcn.cat)

## Quick start (local development)

```bash
npm install
cp .env.example .env   # edit and set ADMIN_PASSWORD
npm start              # starts on http://localhost:3001
```

## Deploying to production

Two supported deployment paths:

### Option A — Oracle Linux server (recommended for OCI/VPS)

1. SSH into your server.
2. Run the automated deployment script (it installs Node.js, PM2, Nginx, and configures everything):

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/polipolo55/web-dema/main/deploy-to-oracle-linux.sh)
```

Or, if you already have the repo on the server:

```bash
chmod +x deploy-to-oracle-linux.sh
./deploy-to-oracle-linux.sh
```

The script will ask you for your domain name, clone the repo, install dependencies, set up the database, configure Nginx, and start the app with PM2.

**After the script finishes:**

```bash
nano .env              # set a strong ADMIN_PASSWORD
pm2 restart dema-website
```

Then point your domain's DNS A records (`@` and `www`) to the server's public IP.

### Option B — Podman / Docker container

```bash
cp .env.example .env   # edit and set ADMIN_PASSWORD
chmod +x deploy-podman.sh
./deploy-podman.sh
```

The container mounts `./data` for persistence, so your database and uploads survive container restarts and rebuilds.

---

## Updating an existing deployment

### Oracle Linux / PM2

Run the update script from the project directory on your server:

```bash
chmod +x update.sh
./update.sh
```

Or update manually:

```bash
cd /home/opc/web-dema   # or wherever the app is installed
git pull origin main
npm install --omit=dev
pm2 restart dema-website
```

> **Your data is never replaced.** The database (`/app/data/band.db`) and uploads (`/app/data/gallery`, `/app/data/tracks`) are untouched by `git pull`.

### Podman / Docker

```bash
git pull origin main
./deploy-podman.sh      # rebuilds the image and restarts the container
```

Your `./data` volume is preserved.

---

## Full documentation

See [DEPLOY.md](./DEPLOY.md) for environment variables, database paths, SSL setup, health check endpoint, and troubleshooting tips.