# Reminisce

Burmese food &amp; culture website. Static frontend (HTML/CSS/JS) served by a
small Node.js/Express server, with a local SQLite database for accounts.

No external services. Works 100% locally, free.

## Requirements

- Node.js v22+ (uses the built-in `node:sqlite` module)
- npm

## Run it locally

```bash
npm install
npm run dev
```

Open **http://localhost:3000**

The server starts with an empty database (auto-created at `data/reminisce.db`).

## What's included

- `server.js` — Express server: serves the site + the auth API
- `db.sql` — database schema (loaded automatically on startup)
- `login.html` — Log In / Sign Up
- `js/auth.js` — nav auth state on every page (name + Log Out when logged in)

## How accounts work

- **Sign up** stores `full_name`, `email`, `phone` in SQLite.
  Passwords are hashed with `scrypt` (never stored in plaintext).
- **Log in** sets an HttpOnly cookie session (7 days).
- The nav shows your name + **Log Out** when logged in.
- On the **Order Now** page your stored details are pre-filled.

## API

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/signup` | Create account (`full_name`, `email`, `phone`, `password`) |
| POST | `/api/login` | Log in (`email`, `password`) |
| POST | `/api/logout` | Log out |
| GET | `/api/me` | Current user (401 if logged out) |

## Security notes

- `data/` (the SQLite database) is git-ignored — **never commit it**.
- The database file is also blocked from being served over HTTP.
- Passwords are hashed and compared in constant time.
- Queries are parameterized (no SQL injection).
- SQLite uses the whole database during a write, so multiple concurrent users
  can briefly block — fine for small/local use.

## Deployment (later)

The API and static files are one Node process, so it can run on any Node
hosting (Render free tier, Railway, a VPS). Note: on free tiers the filesystem
may be wiped on redeploy, so `data/reminisce.db` would reset. For a persistent
deploy later, swap SQLite for a hosted Postgres database (the `/api/*`
endpoints stay the same).