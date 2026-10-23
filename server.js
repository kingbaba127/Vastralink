require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
app.set("trust proxy", 1);

const PORT = Number(process.env.PORT || 3000);
const SITE_NAME = process.env.SITE_NAME || "VastraLink";
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || "admin").trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "");
const SESSION_SECRET = String(process.env.SESSION_SECRET || "");

if (
  !ADMIN_PASSWORD ||
  !SESSION_SECRET ||
  ADMIN_PASSWORD === "CHANGE_THIS_TO_A_STRONG_PASSWORD" ||
  SESSION_SECRET === "CHANGE_THIS_TO_A_LONG_RANDOM_SECRET"
) {
  console.error("Missing ADMIN_PASSWORD or SESSION_SECRET environment variable.");
  process.exit(1);
}

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath =
  process.env.DATABASE_FILE || path.join(dataDir, "vastralink.sqlite");

fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Fashion',
  price TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  affiliate_url TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_key TEXT NOT NULL,
  path TEXT NOT NULL,
  visited_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_visits_visited_at
ON visits(visited_at);

CREATE INDEX IF NOT EXISTS idx_visits_visitor_key
ON visits(visitor_key);
`);

/* Create the admin account on first startup.
   Existing password hashes are not overwritten automatically.
   To reset the password intentionally, set
   RESET_ADMIN_PASSWORD=true for one deployment,
   then remove or disable that setting afterward. */

const resetAdmin =
  String(process.env.RESET_ADMIN_PASSWORD || "").toLowerCase() === "true";

const existingAdmin = db
  .prepare("SELECT id FROM admins WHERE username = ?")
  .get(ADMIN_USERNAME);

if (!existingAdmin) {
  db.prepare(
    "INSERT INTO admins (username, password_hash) VALUES (?, ?)"
  ).run(ADMIN_USERNAME, bcrypt.hashSync(ADMIN_PASSWORD, 12));

  console.log("Admin account created.");
} else if (resetAdmin) {
  db.prepare(
    "UPDATE admins SET password_hash = ? WHERE username = ?"
  ).run(bcrypt.hashSync(ADMIN_PASSWORD, 12), ADMIN_USERNAME);

  console.log("Admin password reset completed.");
}

app.disable("x-powered-by");

app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(express.json({ limit: "1mb" }));

app.use(
  session({
    name: "vastralink.sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000
    }
  })
);

/* Website visitor analytics.
   Admin pages and affiliate redirects are excluded.
   Visitor IDs are random browser identifiers, not real identities. */

app.use((req, res, next) => {
  if (
    req.path.startsWith("/admin") ||
    req.path.startsWith("/assets") ||
    req.path === "/favicon.ico" ||
    req.path.startsWith("/go/")
  ) {
    return next();
  }

  let visitorKey = "";

  const cookieHeader = String(req.headers.cookie || "");

  const match = cookieHeader.match(
    /(?:^|;\s*)vl_visitor=([a-f0-9-]{20,80})/i
  );

  if (match) {
    visitorKey = match[1];
  }

  if (!visitorKey) {
    visitorKey = crypto.randomUUID();

    res.append(
      "Set-Cookie",
      `vl_visitor=${visitorKey}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly${
        process.env.NODE_ENV === "production" ? "; Secure" : ""
      }`
    );
  }

  try {
    db.prepare(
      "INSERT INTO visits(visitor_key, path) VALUES(?, ?)"
    ).run(visitorKey, req.path || "/");
  } catch (err) {
    console.error("Analytics tracking failed:", err.message);
  }

  next();
});

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function layout(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">

<title>${esc(title)} | ${esc(SITE_NAME)}</title>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">

<style>
:root {
  --purple: #6d28d9;
  --ink: #211a2b;
  --muted: #716b7a;
  --bg: #f8f5ff;
  --line: #ece6f5;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: 'DM Sans', Arial, sans-serif;
}

a {
  color: inherit;
  text-decoration: none;
}

.wrap {
  max-width: 1180px;
  margin: auto;
  padding: 0 22px;
}

.topbar {
  background: #26113f;
  color: #fff;
  text-align: center;
  padding: 9px 12px;
  font-size: 12px;
  letter-spacing: .4px;
}

.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 0;
}

.logo {
  font-family: 'Playfair Display', serif;
  font-size: 29px;
  font-weight: 700;
  color: var(--purple);
}

.navlinks {
  display: flex;
  gap: 22px;
  align-items: center;
  font-size: 14px;
}

.pill {
  background: var(--purple);
  color: white;
  padding: 11px 17px;
  border-radius: 12px;
  font-weight: 700;
  display: inline-block;
  border: 0;
  cursor: pointer;
  font: inherit;
}

.pill:hover {
  background: #5520b8;
}

.hero {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px;
  align-items: center;
  padding: 20px 0 34px;
}

.hero-copy {
  padding: 22px 4px;
}

.eyebrow {
  color: var(--purple);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 2px;
  font-size: 11px;
}

.hero h1 {
  font-family: 'Playfair Display', serif;
  font-size: clamp(40px, 5vw, 64px);
  line-height: 1.08;
  margin: 14px 0;
}

.hero p {
  font-size: 17px;
  line-height: 1.7;
  color: var(--muted);
  max-width: 480px;
}

.hero-image {
  height: 400px;
  border-radius: 28px;
  overflow: hidden;
  background: linear-gradient(135deg, #d8c5f6, #e9d9e7);
  position: relative;
}

.hero-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero-tag {
  position: absolute;
  bottom: 18px;
  left: 18px;
  background: #ffffffdf;
  padding: 10px 14px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
}

.section-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  margin: 22px 0 17px;
}

.section-head h2 {
  font-family: 'Playfair Display', serif;
  font-size: 29px;
  margin: 0;
}

.section-head p {
  color: var(--muted);
  margin: 6px 0 0;
  font-size: 14px;
}

.categories {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

.category {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 13px;
  font-weight: 700;
}

.cat-icon {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  background: #f0e8ff;
  border-radius: 13px;
  font-size: 22px;
}

.products {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  margin-bottom: 54px;
}

.product {
  background: white;
  border: 1px solid var(--line);
  border-radius: 18px;
  overflow: hidden;
  transition: transform .2s, box-shadow .2s;
}

.product:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 28px #27134412;
}

.product-img {
  height: 250px;
  background: #eee7f8;
  display: block;
  overflow: hidden;
}

.product-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.product-info {
  padding: 15px;
}

.badge {
  font-size: 10px;
  color: var(--purple);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.product h3 {
  font-size: 15px;
  margin: 8px 0 5px;
}

.price {
  font-weight: 700;
  margin: 7px 0 13px;
}

.product .pill {
  width: 100%;
  text-align: center;
  padding: 10px;
}

.empty {
  background: white;
  padding: 35px;
  border: 1px dashed #d7c8ed;
  border-radius: 18px;
  color: var(--muted);
  text-align: center;
  grid-column: 1 / -1;
}

.footer {
  background: #26113f;
  color: #eee4ff;
  padding: 35px 0;
  margin-top: 20px;
}

.footer-inner {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  font-size: 13px;
}

.admin-shell {
  max-width: 980px;
  margin: 38px auto;
  padding: 0 20px;
}

.panel {
  background: #fff;
  border: 1px solid var(--line);
  padding: 24px;
  border-radius: 18px;
  margin: 18px 0;
}

.formgrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.field.full {
  grid-column: 1 / -1;
}

label {
  font-size: 13px;
  font-weight: 700;
}

input,
textarea,
select {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd3eb;
  border-radius: 10px;
  font: inherit;
  background: white;
}

textarea {
  min-height: 90px;
  resize: vertical;
}

.tablewrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

td,
th {
  text-align: left;
  padding: 12px;
  border-bottom: 1px solid var(--line);
}

.muted {
  color: var(--muted);
}

.danger {
  color: #b91c1c;
}

.inline {
  display: inline;
}

.smallbtn {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 8px;
  padding: 7px 10px;
  cursor: pointer;
}

.notice {
  padding: 12px;
  background: #f0e8ff;
  border-radius: 10px;
  margin: 12px 0;
}

.login {
  max-width: 430px;
  margin: 65px auto;
  padding: 0 18px;
}

.login .panel {
  padding: 28px;
}

@media (max-width: 850px) {
  .hero {
    grid-template-columns: 1fr;
  }

  .hero-image {
    height: 320px;
  }

  .products {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .categories {
    grid-template-columns: repeat(2, 1fr);
  }

  .product-img {
    height: 220px;
  }

  .navlinks {
    gap: 12px;
  }
}

@media (max-width: 520px) {
  .wrap {
    padding: 0 14px;
  }

  .nav {
    padding: 15px 0;
  }

  .logo {
    font-size: 25px;
  }

  .navlinks a:not(.pill) {
    display: none;
  }

  .hero {
    gap: 10px;
    padding-top: 5px;
  }

  .hero h1 {
    font-size: 42px;
  }

  .hero p {
    font-size: 15px;
  }

  .hero-image {
    height: 260px;
    border-radius: 20px;
  }

  .categories {
    gap: 9px;
  }

  .category {
    padding: 13px 10px;
    font-size: 12px;
    gap: 8px;
  }

  .cat-icon {
    width: 35px;
    height: 35px;
    font-size: 18px;
  }

  .products {
    gap: 10px;
  }

  .product-img {
    height: 170px;
  }

  .product-info {
    padding: 11px;
  }

  .product h3 {
    font-size: 13px;
  }

  .section-head h2 {
    font-size: 24px;
  }

  .formgrid {
    grid-template-columns: 1fr;
  }

  .field.full {
    grid-column: auto;
  }
}
</style>
</head>
<body>${body}</body>
</html>`;
}

/* Public navigation: Admin Login button is hidden from customers. */
function header() {
  return `
  <div class="topbar">
    FRESH FINDS • EVERYDAY STYLE • SHOP YOUR WAY
  </div>
  <header class="wrap nav">
    <a class="logo" href="/">
      ${esc(SITE_NAME)}<span style="color:#211a2b">.</span>
    </a>
    <nav class="navlinks">
      <a href="/#collections">Collections</a>
      <a href="/#products">Trending</a>
    </nav>
  </header>`;
}

/* Public homepage */
app.get("/", (req, res) => {
  const products = db
    .prepare("SELECT * FROM products WHERE active = 1 ORDER BY id DESC")
    .all();

  const cards = products.map(p => `
    <article class="product">
      <a class="product-img" href="/go/${p.id}" target="_blank" rel="noopener noreferrer">
        <img
          loading="lazy"
          src="${esc(p.image_url || "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=80")}"
          alt="${esc(p.title)}"
          onerror="this.src='https://placehold.co/600x700/f0e8ff/6d28d9?text=VastraLink'"
        >
      </a>
      <div class="product-info">
        <div class="badge">${esc(p.category)}</div>
        <h3>${esc(p.title)}</h3>
        ${p.price ? `<div class="price">${esc(p.price)}</div>` : ""}
        <a class="pill" href="/go/${p.id}" target="_blank" rel="noopener noreferrer">
          View Product ↗
        </a>
      </div>
    </article>
  `).join("");

  const body = `
  ${header()}
  <main class="wrap">
    <section class="hero">
      <div class="hero-copy">
        <div class="eyebrow">Style that feels like you</div>
        <h1>Your Style,<br><span style="color:var(--purple)">Your Choice.</span></h1>
        <p>
          Discover fashion favourites, everyday essentials and trending looks
          — all in one place.
        </p>
        <a class="pill" href="#products" style="padding:14px 22px">
          EXPLORE COLLECTION&nbsp; →
        </a>
        <p style="font-size:12px;margin-top:18px">
          Curated finds. Easy browsing. Your kind of style.
        </p>
      </div>

      <div class="hero-image">
        <img
          src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85"
          alt="Fashion collection"
          onerror="this.style.display='none'"
        >
        <span class="hero-tag">New season • New looks</span>
      </div>
    </section>

    <section id="collections">
      <div class="section-head">
        <div>
          <h2>Shop by style</h2>
          <p>Find your next favourite look</p>
        </div>
      </div>

      <div class="categories">
        <a class="category" href="#products"><span class="cat-icon">👗</span>Women's Kurtis</a>
        <a class="category" href="#products"><span class="cat-icon">👔</span>Men's Fashion</a>
        <a class="category" href="#products"><span class="cat-icon">👜</span>Bags & Accessories</a>
        <a class="category" href="#products"><span class="cat-icon">✨</span>Trending Finds</a>
      </div>
    </section>

    <section id="products" style="padding-top:18px">
      <div class="section-head">
        <div>
          <h2>Trending picks</h2>
          <p>Handpicked products for your everyday style</p>
        </div>
      </div>

      <div class="products">
        ${cards || `
          <div class="empty">
            <div style="font-size:36px">🛍️</div>
            <h3 style="color:var(--ink)">Your collection is getting ready</h3>
            <p>Products you add in the admin panel will appear here automatically.</p>
          </div>
        `}
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="wrap footer-inner">
      <div>
        <strong style="font-family:'Playfair Display',serif;font-size:22px">
          ${esc(SITE_NAME)}.
        </strong>
        <p>Discover your style, one find at a time.</p>
      </div>

      <div>
        © ${new Date().getFullYear()} ${esc(SITE_NAME)}. All rights reserved.<br>
        <span style="opacity:.75">
          Affiliate links may earn a commission where applicable.
        </span>
      </div>
    </div>
  </footer>`;

  res.send(layout(SITE_NAME + " — Your Style, Your Choice", body));
});

/* Admin protection */
function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }

  return res.redirect(303, "/admin/login");
}

/* Admin login page */
app.get("/admin/login", (req, res) => {
  const body = `
  <div class="login">
    <a class="logo" href="/">VastraLink.</a>

    <div class="panel">
      <h1 style="font-family:'Playfair Display',serif">Welcome back</h1>
      <p class="muted">Sign in to manage your products.</p>

      ${
        req.query.error
          ? '<div class="notice">Login details are incorrect. Please try again.</div>'
          : ""
      }

      <form method="post" action="/admin/login" autocomplete="on">
        <div class="field">
          <label for="username">Username</label>
          <input id="username" name="username" autocomplete="username" required>
        </div>

        <div class="field" style="margin-top:14px">
          <label for="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autocomplete="current-password"
            required
          >
        </div>

        <button type="submit" class="pill" style="width:100%;margin-top:18px">
          Sign in
        </button>
      </form>
    </div>

    <a href="/" class="muted">← Back to store</a>
  </div>`;

  res.set("Cache-Control", "no-store");
  res.send(layout("Admin Login", body));
});

/* Process admin login */
app.post("/admin/login", (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    const admin = db
      .prepare("SELECT * FROM admins WHERE username = ?")
      .get(username);

    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
      console.log("Admin login rejected: username/password did not match.");
      return res.redirect(303, "/admin/login?error=1");
    }

    req.session.regenerate(err => {
      if (err) {
        console.error("Session regenerate failed:", err.message);
        return res.status(500).send(
          "Could not create login session. Please retry."
        );
      }

      req.session.adminId = admin.id;
      req.session.adminName = admin.username;

      req.session.save(saveErr => {
        if (saveErr) {
          console.error("Session save failed:", saveErr.message);
          return res.status(500).send(
            "Could not save login session. Please retry."
          );
        }

        console.log("Admin login successful; redirecting to dashboard.");
        return res.redirect(303, "/admin");
      });
    });
  } catch (err) {
    console.error("Admin login route failed:", err.message);
    return res.status(500).send(
      "Admin login failed. Please retry later."
    );
  }
});

/* Admin logout */
app.post("/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.redirect(303, "/");
  });
});

/* Admin dashboard with analytics */
app.get("/admin", requireAdmin, (req, res) => {
  const products = db
    .prepare("SELECT * FROM products ORDER BY id DESC")
    .all();

  const pageVisits = db
    .prepare("SELECT COUNT(*) AS n FROM visits")
    .get().n;

  const uniqueBrowsers = db
    .prepare("SELECT COUNT(DISTINCT visitor_key) AS n FROM visits")
    .get().n;

  const visitsToday = db.prepare(`
    SELECT COUNT(*) AS n
    FROM visits
    WHERE date(visited_at, 'localtime') = date('now', 'localtime')
  `).get().n;

  const rows = products.map(p => `
    <tr>
      <td>${p.id}</td>
      <td>
        <strong>${esc(p.title)}</strong><br>
        <span class="muted">${esc(p.category)}</span>
      </td>
      <td>${esc(p.price || "—")}</td>
      <td>${p.active ? "Visible" : "Hidden"}</td>
      <td>
        <a class="smallbtn" href="/admin/products/${p.id}/edit">Edit</a>

        <form class="inline" method="post" action="/admin/products/${p.id}/toggle">
          <button class="smallbtn">${p.active ? "Hide" : "Show"}</button>
        </form>

        <form
          class="inline"
          method="post"
          action="/admin/products/${p.id}/delete"
          onsubmit="return confirm('Delete this product?')"
        >
          <button class="smallbtn danger">Delete</button>
        </form>
      </td>
    </tr>
  `).join("");

  const body = `
  ${header()}

  <main class="admin-shell">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:15px;flex-wrap:wrap">
      <div>
        <div class="eyebrow">Store management</div>
        <h1 style="font-family:'Playfair Display',serif;margin:8px 0">
          Admin dashboard
        </h1>
        <p class="muted">Signed in as ${esc(req.session.adminName || "admin")}</p>
      </div>

      <form method="post" action="/admin/logout">
        <button class="smallbtn">Log out</button>
      </form>
    </div>

    <div class="panel">
      <h2 style="margin-top:0">Website analytics</h2>

      <div class="categories">
        <div class="category">
          <span class="cat-icon">👀</span>
          <div>
            <div class="muted">Page visits</div>
            <strong>${pageVisits}</strong>
          </div>
        </div>

        <div class="category">
          <span class="cat-icon">👤</span>
          <div>
            <div class="muted">Unique browsers (approx.)</div>
            <strong>${uniqueBrowsers}</strong>
          </div>
        </div>

        <div class="category">
          <span class="cat-icon">📅</span>
          <div>
            <div class="muted">Visits today</div>
            <strong>${visitsToday}</strong>
          </div>
        </div>
      </div>

      <p class="muted" style="font-size:12px;margin-bottom:0">
        Tracking starts after this version is deployed. Unique browsers are
        approximate. Affiliate clicks are not completed orders.
      </p>
    </div>

    <div class="panel">
      <h2 style="margin-top:0">Add a product</h2>

      <form method="post" action="/admin/products">
        <div class="formgrid">
          <div class="field">
            <label>Product name *</label>
            <input name="title" required placeholder="Women's printed kurti">
          </div>

          <div class="field">
            <label>Category *</label>
            <select name="category">
              <option>Women's Kurtis</option>
              <option>Men's Fashion</option>
              <option>Bags & Accessories</option>
              <option>Footwear</option>
              <option>Beauty</option>
              <option>Fashion</option>
              <option>Trending Finds</option>
            </select>
          </div>

          <div class="field">
            <label>Price (optional)</label>
            <input name="price" placeholder="₹499">
          </div>

          <div class="field">
            <label>Product image URL *</label>
            <input
              name="image_url"
              type="url"
              required
              placeholder="https://..."
            >
          </div>

          <div class="field full">
            <label>Affiliate/product link *</label>
            <input
              name="affiliate_url"
              type="url"
              required
              placeholder="https://..."
            >
          </div>

          <div class="field full">
            <label>Description (optional)</label>
            <textarea
              name="description"
              placeholder="Short product details"
            ></textarea>
          </div>
        </div>

        <button class="pill" style="margin-top:16px">
          ＋ Add product
        </button>
      </form>
    </div>

    <div class="panel">
      <h2 style="margin-top:0">Your products (${products.length})</h2>
      <p class="muted">Visible products appear on the public homepage.</p>

      <div class="tablewrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Product</th>
              <th>Price</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            ${
              rows ||
              '<tr><td colspan="5" class="muted">No products added yet. Use the form above.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </div>
  </main>`;

  res.set("Cache-Control", "no-store");
  res.send(layout("Admin Dashboard", body));
});

/* Add product */
app.post("/admin/products", requireAdmin, (req, res) => {
  const title = String(req.body.title || "").trim();
  const category = String(req.body.category || "Fashion").trim();
  const price = String(req.body.price || "").trim();
  const image = String(req.body.image_url || "").trim();
  const affiliate = String(req.body.affiliate_url || "").trim();
  const description = String(req.body.description || "").trim();

  if (
    !title ||
    !/^https?:\/\//i.test(image) ||
    !/^https?:\/\//i.test(affiliate)
  ) {
    return res.status(400).send(
      layout(
        "Invalid product",
        `${header()}
        <main class="admin-shell">
          <div class="panel">
            <h2>Check product details</h2>
            <p>Product image and affiliate link must both start with http:// or https://.</p>
            <a class="pill" href="/admin">Back to dashboard</a>
          </div>
        </main>`
      )
    );
  }

  db.prepare(`
    INSERT INTO products
    (title, category, price, image_url, affiliate_url, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(title, category, price, image, affiliate, description);

  res.redirect(303, "/admin");
});

/* Edit product form */
app.get("/admin/products/:id/edit", requireAdmin, (req, res) => {
  const p = db
    .prepare("SELECT * FROM products WHERE id = ?")
    .get(Number(req.params.id));

  if (!p) {
    return res.redirect(303, "/admin");
  }

  const body = `
  ${header()}

  <main class="admin-shell">
    <div class="panel">
      <h1>Edit product</h1>

      <form method="post" action="/admin/products/${p.id}/edit">
        <div class="formgrid">
          <div class="field">
            <label>Product name</label>
            <input name="title" required value="${esc(p.title)}">
          </div>

          <div class="field">
            <label>Category</label>
            <input name="category" required value="${esc(p.category)}">
          </div>

          <div class="field">
            <label>Price</label>
            <input name="price" value="${esc(p.price)}">
          </div>

          <div class="field">
            <label>Image URL</label>
            <input name="image_url" type="url" required value="${esc(p.image_url)}">
          </div>

          <div class="field full">
            <label>Affiliate link</label>
            <input name="affiliate_url" type="url" required value="${esc(p.affiliate_url)}">
          </div>

          <div class="field full">
            <label>Description</label>
            <textarea name="description">${esc(p.description)}</textarea>
          </div>
        </div>

        <button class="pill" style="margin-top:15px">Save changes</button>
        <a class="smallbtn" href="/admin">Cancel</a>
      </form>
    </div>
  </main>`;

  res.send(layout("Edit Product", body));
});

/* Save product edits */
app.post("/admin/products/:id/edit", requireAdmin, (req, res) => {
  const p = db
    .prepare("SELECT id FROM products WHERE id = ?")
    .get(Number(req.params.id));

  if (!p) {
    return res.redirect(303, "/admin");
  }

  const title = String(req.body.title || "").trim();
  const category = String(req.body.category || "Fashion").trim();
  const price = String(req.body.price || "").trim();
  const image = String(req.body.image_url || "").trim();
  const affiliate = String(req.body.affiliate_url || "").trim();
  const description = String(req.body.description || "").trim();

  if (
    !title ||
    !/^https?:\/\//i.test(image) ||
    !/^https?:\/\//i.test(affiliate)
  ) {
    return res.redirect(303, `/admin/products/${p.id}/edit`);
  }

  db.prepare(`
    UPDATE products
    SET title = ?, category = ?, price = ?, image_url = ?,
        affiliate_url = ?, description = ?
    WHERE id = ?
  `).run(title, category, price, image, affiliate, description, p.id);

  res.redirect(303, "/admin");
});

/* Show or hide a product */
app.post("/admin/products/:id/toggle", requireAdmin, (req, res) => {
  db.prepare(`
    UPDATE products
    SET active = CASE active WHEN 1 THEN 0 ELSE 1 END
    WHERE id = ?
  `).run(Number(req.params.id));

  res.redirect(303, "/admin");
});

/* Delete a product */
app.post("/admin/products/:id/delete", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM products WHERE id = ?")
    .run(Number(req.params.id));

  res.redirect(303, "/admin");
});

/* Affiliate redirect */
app.get("/go/:id", (req, res) => {
  const p = db
    .prepare("SELECT affiliate_url FROM products WHERE id = ? AND active = 1")
    .get(Number(req.params.id));

  if (!p) {
    return res.status(404).send("Product not found.");
  }

  res.redirect(p.affiliate_url);
});

/* 404 handler */
app.use((req, res) => {
  res.status(404).send(
    layout(
      "Not found",
      `${header()}
      <main class="wrap">
        <div class="panel">
          <h1>Page not found</h1>
          <a class="pill" href="/">Back home</a>
        </div>
      </main>`
    )
  );
});

/* Start server */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`${SITE_NAME} server started on port ${PORT}`);
});
