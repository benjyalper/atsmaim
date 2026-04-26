# atsmaim

Single-page patient session tracker. Hebrew RTL, mobile-friendly. Each user has private patient data.

## Stack
- Node.js + Express
- Postgres (`pg`) — schema `atsmaim`
- Auth: `bcryptjs` + `cookie-session`
- Vanilla HTML/CSS/JS frontend

## Local development
```
npm install
DATABASE_URL=postgres://user:pass@localhost:5432/atsmaim SESSION_SECRET=local-dev npm start
```
Open http://localhost:3000

## Deploy on Railway
1. Create a new Railway project from the GitHub repo `benjyalper/atsmaim`.
2. In that project: **+ New → Database → Add PostgreSQL**.
3. Railway auto-injects `DATABASE_URL` into the app service.
4. On the app service, add env vars:
   - `SESSION_SECRET` — long random string
   - `SIGNUP_CODE` — optional; if set, required to create new accounts. Leave unset to allow open signup while creating your first user, then set it.
5. App auto-creates the `atsmaim` schema and tables on first boot.
