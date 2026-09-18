// ==============================================
// Reminisce - Local server
//
//   * Serves the static site (index.html, Food/, Images/, ...)
//   * Provides a small auth API backed by SQLite
//   * No external services required
//
// Run:  npm run dev   (or)   node server.js
// Then: http://localhost:3000
// ==============================================

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const { DatabaseSync } = require("node:sqlite");

const app = express();
const PORT = process.env.PORT || 3000;

const SESSION_COOKIE = "reminisce_session";
const SESSION_DAYS = 7;
const SESSION_TTL_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

const ROOT = __dirname;

// ----------------------------------------------
// Database
// ----------------------------------------------

fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });

const db = new DatabaseSync(path.join(ROOT, "data", "reminisce.db"));

// Load schema (single source of truth = db.sql; committed to git)
const schema = fs.readFileSync(path.join(ROOT, "db.sql"), "utf8");
db.exec(schema);

// ----------------------------------------------
// Middleware
// ----------------------------------------------

app.use(express.json());

// Block anything we don't want served over the network
// (especially the database file - it never leaves the machine via HTTP).
app.use((req, res, next) => {
    const blocked = [
        "/data",
        "/server.js",
        "/db.sql",
        "/package.json",
        "/package-lock.json",
        "/node_modules",
        "/js/"
    ];
    if (blocked.some((p) => req.path === p || req.path.startsWith(p + "/"))) {
        return res.status(404).send("Not found");
    }
    next();
});

// Static site files (index.html, Food/, Images/, css/, js/auth.js, login files)
app.use(express.static(ROOT));

// ----------------------------------------------
// Helpers
// ----------------------------------------------

function parseCookies(req) {
    const header = req.headers["cookie"];
    if (!header) return {};
    return header.split(";").reduce((acc, part) => {
        const idx = part.indexOf("=");
        if (idx === -1) return acc;
        const key = part.slice(0, idx).trim();
        const val = part.slice(idx + 1).trim();
        if (key) acc[key] = decodeURIComponent(val);
        return acc;
    }, {});
}

function setSessionCookie(res, token) {
    res.setHeader(
        "Set-Cookie",
        SESSION_COOKIE + "=" + token +
        "; HttpOnly; SameSite=Lax; Path=/; Max-Age=" + (SESSION_DAYS * 86400)
    );
}

function clearSessionCookie(res) {
    res.setHeader(
        "Set-Cookie",
        SESSION_COOKIE + "=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    );
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return salt + ":" + hash;
}

function verifyPassword(password, stored) {
    const [salt, hash] = String(stored).split(":");
    if (!salt || !hash) return false;
    const calc = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return calc.length === expected.length && crypto.timingSafeEqual(calc, expected);
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createSession(userId) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    db.prepare("insert into sessions (token, user_id, expires_at) values (?, ?, ?)")
        .run(token, userId, expiresAt);
    return token;
}

function getUserFromToken(token) {
    if (!token) return null;
    const row = db.prepare(
        "select u.id, u.full_name, u.email, u.phone, s.expires_at " +
        "from sessions s join users u on u.id = s.user_id " +
        "where s.token = ? and s.expires_at > datetime('now')"
    ).get(token);
    return row || null;
}

function publicUser(row) {
    if (!row) return null;
    return {
        id: row.id,
        full_name: row.full_name,
        email: row.email,
        phone: row.phone || ""
    };
}

// ----------------------------------------------
// API: Auth
// ----------------------------------------------

// GET /api/me - current logged-in user (or 401)
app.get("/api/me", (req, res) => {
    const cookies = parseCookies(req);
    const user = getUserFromToken(cookies[SESSION_COOKIE]);
    if (!user) {
        return res.status(401).json({ error: "Not logged in" });
    }
    res.json({ user: publicUser(user) });
});

// POST /api/signup - create account + log in
app.post("/api/signup", (req, res) => {
    const fullName = String(req.body.full_name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const phone = String(req.body.phone || "").trim();
    const password = String(req.body.password || "");

    if (!fullName) {
        return res.status(400).json({ error: "Please enter your full name." });
    }
    if (!isValidEmail(email)) {
        return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const existing = db.prepare("select id from users where email = ?").get(email);
    if (existing) {
        return res.status(409).json({ error: "An account already exists for this email." });
    }

    const result = db.prepare(
        "insert into users (full_name, email, phone, password_hash) values (?, ?, ?, ?)"
    ).run(fullName, email, phone, hashPassword(password));

    const userId = result.lastInsertRowid;
    const token = createSession(userId);
    setSessionCookie(res, token);

    const user = db.prepare("select id, full_name, email, phone from users where id = ?").get(userId);
    res.json({ user: publicUser(user) });
});

// POST /api/login - verify credentials + log in
app.post("/api/login", (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const user = db.prepare("select * from users where email = ?").get(email);

    // Same message whether the email or password is wrong (don't leak which)
    if (!user || !verifyPassword(password, user.password_hash)) {
        return res.status(401).json({ error: "Incorrect email or password." });
    }

    const token = createSession(user.id);
    setSessionCookie(res, token);

    res.json({ user: publicUser(user) });
});

// POST /api/logout - invalidate the session
app.post("/api/logout", (req, res) => {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE];
    if (token) {
        db.prepare("delete from sessions where token = ?").run(token);
    }
    clearSessionCookie(res);
    res.json({ ok: true });
});

// ----------------------------------------------
// Start
// ----------------------------------------------

app.listen(PORT, () => {
    console.log("Reminisce running at http://localhost:" + PORT);
});