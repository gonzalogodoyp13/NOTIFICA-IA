# NOTIFICA IA — Phase 1 Summary (Infrastructure & Core System Stability)

**Period:** Oct 30 – Nov 5, 2025  
**Branch:** `phase1-step1-auth`  
**Status:** ✅ 95% complete (foundation stable; minor polish pending)

---

## 🎯 Phase Goal

Create a stable, secure, and connected base of NOTIFICA IA: authentication, protected dashboard shell, audit logging, and PWA installability—ready to build real features (Demanda flow, Ajustes, etc.).

---

## 🧱 Tech Stack

- **Framework:** Next.js 14 (App Router, TypeScript, SSR)
- **UI:** TailwindCSS + React
- **Auth:** Supabase Auth (Email/Password, JWT via cookies)
- **DB/ORM:** PostgreSQL (Railway) + Prisma
- **Deploy Targets:** Vercel (app) + Railway (DB)
- **PWA:** `manifest.json`, `sw.js`, install button
- **Version Control:** Git + GitHub

---

## ✅ What We Built (Detailed)

### 1) Project Setup & Structure

- Next.js App Router initialized with clean TypeScript config.
- Folders: `app/`, `components/`, `lib/`, `prisma/`, `public/`, `app/api/…`
- ESLint/Tailwind configured; dev server verified.

### 2) Supabase Auth (Login/Logout/Sessions)

- Server + browser clients via `@supabase/ssr`.
- Helpers:
  - `lib/auth-server.ts`: `getSession()`, `getCurrentUser()`, `requireSession()`
  - `lib/auth-client.ts`: `signIn()`, `signOut()`
- Session persists across refresh; cookies handled by SSR + middleware.
- **Manual checks:**  
  - Logged-in user → `/api/user/me` returns `{ id, email, metadata }`  
  - Logged-out → returns `{ "error": "Unauthorized" }`

### 3) Dashboard UI Shell

- Topbar: Logo/title, `Inicio`, user email, **Cerrar Sesión**.
- Dashboard cards (main actions):
  1. **Agregar Demanda** (future subpage)
  2. **Gestionar Demandas** (future subpage)
  3. **Ajustes de Oficina** (future subpage)
- Protected route (`/dashboard`) using `requireSession()`.

### 4) Audit Logs (Login/Logout)

- **Prisma model** `AuditLog` with `id`, `userEmail`, `action`, `createdAt` (+ indexes).
- **API routes:**
  - `POST /api/log` → registers `"login"`/`"logout"`.
  - `GET /api/logs/recent` → returns recent log entries (currently 10, filtered to user in polish).
- Integrated events on login/logout automatically.

### 5) PWA (Installable App)

- `public/manifest.json` with name, theme color, icons.
- `public/sw.js`:
  - Cache-first (static), network-first (API).
- `components/ServiceWorkerRegister.tsx` (global registration).
- `components/InstallAppButton.tsx` (shows "Instalar App" when available).
- Verified in DevTools: Service Worker **activated and running**.

### 6) Windows OneDrive "EBUSY" Build Lock — Fixed

- `.next/` added to `.gitignore`.
- Developer note added in `README.md`.
- Result: Dev server runs cleanly on port 3000 (no lock errors).

### 7) Branch & Repo

- Working branch: `phase1-step1-auth`.
- GitHub connected; regular commits pushed for each step.

---

## 🧪 Validation & Test Notes

- **Auth Flow**
  - `/login` → successful login redirects to `/dashboard`.
  - `/dashboard` while logged out → redirected to `/login` (protected).
  - Logout → session cleared → redirected to `/login`.

- **User Info Endpoint**
  - When authenticated → `/api/user/me` returns:
    ```json
    {"id":"<uuid>","email":"notificaia@gmail.com","metadata":{"email_verified":true}}
    ```
  - Logged-out → `{"error":"Unauthorized"}`

- **Audit Logs**
  - `/api/logs/recent` returns last events; verified entries for login/logout with timestamps.

- **PWA**
  - DevTools → Application → Service Workers: **activated and running**
  - Manifest detected (icons valid after replacements)
  - "Instalar App" button visible when eligible

---

## ⚠️ Remaining Polish (to complete before merging to `main`)

1. **Greeting Consistency**  
   Ensure dashboard shows `Hola, {email} 👋` consistently.

2. **Navbar Behavior**  
   - When logged out → hide **Dashboard**; show **Inicio / Iniciar Sesión** only.  
   - After logout → instantly hide Dashboard (no flicker).

3. **Audit Log Filtering**  
   `/api/logs/recent` must return only **current user's** last 10 entries.

4. **Manifest Polish**  
   - Add `"id": "/"` to remove "Computed App ID".
   - Add `"screenshots": [ { "src": "/icons/screenshot-desktop.png", "sizes": "1280x720", "type": "image/png", "form_factor": "wide" } ]`.

5. **Metadata Theme Color**  
   Move to `export const viewport = { themeColor: '#0ea5e9' }` to clear console warning.

6. **Service Worker**  
   - Skip caching non-GET requests (POST/PUT/DELETE).  
   - Wrap `cache.put()` in `try/catch` to avoid `TypeError` for unsupported methods.

7. **Env Vars Cleanup**  
   Update `.env.example` with clear English comments and only active keys:

```
Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

Database (Railway)
DATABASE_URL=

App
NEXT_PUBLIC_APP_NAME=NOTIFICA IA
NEXT_PUBLIC_ENVIRONMENT=development
```

8. **Landing Redirect (Polish)**  
   - `/` should redirect:  
     - Not authenticated → `/login`  
     - Authenticated → `/dashboard`  
   - Prefer doing it in `middleware.ts` to avoid double redirects.

9. **UI Visual Nits**  
   - Slight spacing/centering of dashboard cards.
   - Replace placeholder icons (192/512) and add a favicon.
   - Optional: toast on logout success.

---

## 🧭 Phase 2 Preview (Next)

- **Agregar Demanda** (DB model + form + validation + create API)
- **Gestionar Demandas** (table, filters/search, pagination)
- **Ajustes de Oficina** (basic office profile, branding, members)
- (Optional) Start PDF templating scaffolding for later Phase 4

---

## 📂 Files of Interest (Phase 1)

- `app/dashboard/page.tsx` — protected dashboard page
- `components/Topbar.tsx`, `components/Navbar.tsx` — navigation & session UI
- `lib/auth-server.ts`, `lib/auth-client.ts` — session & auth helpers
- `app/api/user/me/route.ts` — session info endpoint
- `app/api/log/route.ts`, `app/api/logs/recent/route.ts` — audit log routes
- `prisma/schema.prisma` — DB models
- `public/manifest.json`, `public/sw.js` — PWA
- `.gitignore`, `README.md` — DX

---

## ✅ Phase 1 Status

**Infrastructure complete, functional, and tested.**  
Proceeding to Phase 2 with a stable base.  
Minor polish items queued for a single "Polish Pass" before merging to `main`.

