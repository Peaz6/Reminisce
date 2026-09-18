-- ==============================================
-- Reminisce - Database Schema (SQLite)
-- Loaded automatically on server start by server.js
-- The actual data lives in data/reminisce.db (git-ignored).
-- ==============================================

-- ----------------------------------------------
-- USERS
-- ----------------------------------------------

create table if not exists users (
    id            integer primary key autoincrement,
    full_name     text not null,
    email         text not null unique,
    phone         text,
    password_hash text not null,
    created_at    text not null default (datetime('now'))
);

-- ----------------------------------------------
-- SESSIONS
-- Login tokens. A row exists for every active login.
-- ----------------------------------------------

create table if not exists sessions (
    token      text primary key,
    user_id    integer not null references users (id) on delete cascade,
    created_at text not null default (datetime('now')),
    expires_at text not null
);