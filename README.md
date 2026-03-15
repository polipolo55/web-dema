# Web Demà 

Pàgina web de la banda Demà

## Com fer-la funcionar

Per posar-la en marxa al teu ordinador:

```bash
# Instal·lar dependències
npm install

# Executar el servidor (amb base de dades)
npm start
```

El servidor s'executarà al port 3001 per defecte.

### Panel d'administració

Accedeix a `/admin` i inicia sessió amb la contrasenya d'administració.
El backend crea una sessió amb cookie `httpOnly` i `SameSite=Strict`.

## Què és això?

És una web que simula un sistema operatiu dels 90s per a la nostra banda de rock català.

### Característiques

- 🎵 Gestió de concerts amb base de dades persistent
- 📅 Sistema de countdown per a llançaments
- 📸 Galeria de fotos
- 🔧 Panel d'administració per a la banda
- 💾 Backup automàtic de dades

## Estructura del projecte

- `server.js` - Servidor backend amb API
- `src/db/` - Base de dades SQLite (mòduls per tours, galeria, etc.)
- `data/band.db` - Base de dades de concerts i contingut
- `scripts/` - Scripts d'utilitat (backup, migració)
- `admin.html` - Panel d'administració

## Scripts útils

```bash
# Crear backup de la base de dades
npm run backup

# Netejar fotos òrfenes de la galeria
npm run cleanup-photos
```

## Desplegament

La web utilitza una base de dades que persisteix entre desplegaments. Consulta la documentació a `privat/` per a més detalls.

Quan desplegues amb `deploy-podman.sh`, s'executa automàticament una migració controlada de `data/band-info.json` cap a SQLite **només si la base de dades està buida** (`--if-empty`).

També la pots executar manualment:

```bash
npm run migrate-json-db
```

## Configuració d'entorn

Copia `.env.example` a `.env` i defineix mínim:

- `ADMIN_PASSWORD`
- `DATABASE_PATH` (especialment en producció)
- `TRUST_PROXY` quan hi hagi reverse proxy
