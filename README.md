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
