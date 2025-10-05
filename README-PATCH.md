
# Auto Trade — Integration Patch (2025-10-05, IST)

This patch wires **auth (login & registration)**, **SSE market stream**, **broker login URL**, and **client ↔ server** connectivity with cookies. It also adds a **login screen** and extends the **User** model with additional profile fields.

## What changed

**Server**
- `Server/src/models/User.js` → extended schema: `email, fullName, gender, birthdate, address, phone`.
- `Server/src/routes/auth.js` → added `POST /api/auth/register`; kept `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- `Server/src/routes/broker.js` → added `GET /api/broker/login/:name` returning OAuth login URL for **Upstox** and **Zerodha (Kite)**.
- `Server/.env.example` → new with all necessary variables.

**Client**
- `Client/login.html` + `Client/login.js` → new login & registration UI.
- `Client/script.js` → sends cookies with all requests (`credentials: "include"`), and adds an **auth guard** that redirects to `login.html` when unauthenticated. Also adds a logout handler (bind a button with `id="btnLogout"` in HTML if you want it visible).

## How to run (dev)

### 1) Server
```bash
cd Server
cp .env.example .env
# edit .env (MongoDB, JWT_SECRET, broker keys if available)
npm i
npm run dev   # or: node src/server.js
```

The server listens on `PORT` (default **4000**). CORS is configured to allow credentials and common localhost origins.

### 2) Client (static)
Open `Client/login.html` or `Client/index.html` in a static server (e.g. VSCode Live Server). The script expects the backend at `http://localhost:4000`. You can also host these files behind Nginx/Apache.

> **Note**: If you load `index.html` directly from file:// the cookie will not be sent. Use a local static server and add `http://localhost:<port>` to the server CORS allow-list (already permissive in `app.js`).

## Broker connectivity

Use `GET /api/broker/status` to verify connectivity. To start OAuth:
- Upstox: `GET /api/broker/login/upstox` → returns `{ url }`
- Zerodha (Kite): `GET /api/broker/login/zerodha` → returns `{ url }`

Set keys in `.env`. Without keys, the endpoint returns an error and **no dummy broker data is shown** (dashboards will continue to function with market feed if configured; orders will fail gracefully).

## Where to put login/logout buttons

- Login is at **`Client/login.html`** (auto-redirected when not authenticated).
- Add a Logout button anywhere in `index.html` like:
```html
<button id="btnLogout">Logout</button>
```

## Real-time market data

`GET /api/market/stream` (SSE) streams snapshots. The dashboard already subscribes to it and updates tables/KPIs.

## Security

- JWT cookie `at` is **HTTP-only**.
- CORS is **credentials-enabled** and origin-checked.
- Passwords stored as **bcrypt** hashes.
- Rate-limiting / brute-force protection can be added via express-rate-limit in production.

---

**Paths touched**

- `Server/src/models/User.js`
- `Server/src/routes/auth.js`
- `Server/src/routes/broker.js`
- `Server/.env.example`
- `Client/login.html`
- `Client/login.js`
- `Client/script.js`

