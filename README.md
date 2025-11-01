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

Accedeix a `/admin?password=your_password` per gestionar concerts i contingut.

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
- `database.js` - Sistema de base de dades SQLite
- `data/band.db` - Base de dades de concerts i contingut
- `scripts/` - Scripts d'utilitat (backup, migració)
- `admin.html` - Panel d'administració

## Scripts útils

```bash
# Crear backup de la base de dades
npm run backup

# Migrar des de fitxers JSON (només la primera vegada)
npm run migrate
```

## Desplegament

La web utilitza una base de dades que persisteix entre desplegaments. Consulta la documentació a `privat/` per a més detalls.

## Modernització

Aquest projecte té planificada una modernització per millorar la mantenibilitat, seguretat i escalabilitat. Consulta els següents documents per a més informació:

- **[MODERNIZATION_PLAN.md](./MODERNIZATION_PLAN.md)** - Pla complet de modernització amb enfocament per fases
- **[TECHNICAL_SPECIFICATION.md](./TECHNICAL_SPECIFICATION.md)** - Especificació tècnica detallada de l'arquitectura actual i proposada
- **[MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)** - Guia pas a pas per a la migració a la nova arquitectura

### Objectius de la modernització

- ✅ **Preservar l'estètica retro** - Mantenir l'aspecte Windows 95 amb 98.css
- 🎯 **Millorar la mantenibilitat** - Codi modular, ben documentat i testejable
- 🔒 **Augmentar la seguretat** - Type safety amb TypeScript, validació robusta
- 📦 **Habilitar l'escalabilitat** - Arquitectura neta preparada per futures funcionalitats
- 🚀 **Optimitzar el rendiment** - Code splitting, lazy loading, bundles optimitzats

### Stack tecnològic proposat

- **Frontend**: Svelte + Vite + TypeScript
- **Backend**: Express + TypeScript + better-sqlite3
- **DevOps**: Docker + docker-compose
- **Testing**: Vitest + Playwright
