# Plan: Telework Report System — Project Bootstrap

## TL;DR
Bootstrap a Next.js 15 App Router project for a Japanese telework reporting system with 4 roles, multi-level approval, Drizzle ORM on Cloudflare D1 (swappable to Turso/AWS), custom JWT auth via HTTP-only cookies, and a minimal centered login page. The project structure is designed so swapping from Cloudflare → AWS requires only changing one DB driver file and deployment config.

---

## Phase 1: Project Scaffolding & Configuration

### Step 1 — Initialize Next.js 15 + pnpm
- `pnpm create next-app@latest telework-v1 --ts --tailwind --app --src-dir --eslint`
- Enable `strict: true` in `tsconfig.json`
- Set up `pnpm-workspace.yaml` if needed

### Step 2 — Install core dependencies
```
pnpm add drizzle-orm @libsql/client jose bcryptjs server-only
pnpm add -D drizzle-kit @tailwindcss/postcss wrangler @cloudflare/workers-types @types/bcryptjs
```
- `jose` for JWT (Edge-compatible, not jsonwebtoken)
- `bcryptjs` (pure JS, works on Cloudflare Workers — native `bcrypt` does not)

### Step 3 — Project folder structure
```
telework-v1/
├── src/
│   ├── app/
│   │   ├── (auth)/                    # Public routes (no auth required)
│   │   │   ├── login/
│   │   │   │   └── page.tsx           # Login page
│   │   │   └── layout.tsx             # Auth layout (centered card)
│   │   ├── (dashboard)/               # Protected routes (all roles)
│   │   │   ├── layout.tsx             # Dashboard shell (sidebar + header)
│   │   │   ├── page.tsx               # Dashboard home (redirect by role)
│   │   │   ├── reports/
│   │   │   │   ├── page.tsx           # Employee: list own reports
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx       # Submit new report (day/week)
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx       # View single report detail
│   │   │   ├── review/
│   │   │   │   └── page.tsx           # Reviewer: pending reviews
│   │   │   ├── approve/
│   │   │   │   └── page.tsx           # Manager: pending approvals
│   │   │   └── admin/
│   │   │       ├── employees/
│   │   │       │   └── page.tsx       # Admin: manage employees
│   │   │       ├── departments/
│   │   │       │   └── page.tsx       # Admin: manage departments
│   │   │       └── export/
│   │   │           └── page.tsx       # Admin: export CSV/PDF
│   │   ├── api/                       # API routes (only where needed)
│   │   │   └── auth/
│   │   │       └── login/
│   │   │           └── route.ts       # POST /api/auth/login
│   │   ├── layout.tsx                 # Root layout (html, body, fonts)
│   │   └── globals.css                # Tailwind v4: @import "tailwindcss"
│   │
│   ├── db/
│   │   ├── schema/
│   │   │   ├── users.ts               # users table
│   │   │   ├── departments.ts         # departments table
│   │   │   ├── reports.ts             # telework_reports table
│   │   │   ├── approvals.ts           # approvals table
│   │   │   └── index.ts              # Re-export all schemas
│   │   ├── index.ts                   # DB client — THE SWAP POINT
│   │   ├── migrate.ts                 # Migration runner
│   │   └── seed.ts                    # Seed data for dev
│   │
│   ├── lib/
│   │   ├── auth/
│   │   │   ├── session.ts             # JWT create/verify, cookie helpers
│   │   │   ├── password.ts            # bcryptjs hash/compare
│   │   │   └── dal.ts                 # Data Access Layer: verifySession(), getCurrentUser()
│   │   ├── constants.ts               # Role enums, report statuses, etc.
│   │   └── utils.ts                   # Shared helpers (date format, etc.)
│   │
│   ├── actions/
│   │   ├── auth.ts                    # Server Actions: login, logout
│   │   ├── reports.ts                 # Server Actions: create/update reports
│   │   ├── approvals.ts              # Server Actions: approve/reject
│   │   └── admin.ts                   # Server Actions: manage users, depts, export
│   │
│   ├── components/
│   │   ├── ui/                        # Reusable UI primitives
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── card.tsx
│   │   │   └── badge.tsx
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   └── header.tsx
│   │   └── forms/
│   │       ├── login-form.tsx         # Client component for login
│   │       └── report-form.tsx        # Client component for report submission
│   │
│   ├── middleware.ts                   # Route protection — reads JWT cookie
│   └── types/
│       └── index.ts                   # Shared TypeScript types
│
├── drizzle/                           # Generated migrations (drizzle-kit output)
├── drizzle.config.ts                  # Drizzle Kit configuration
├── wrangler.toml                      # Cloudflare D1 bindings
├── open-next.config.ts                # OpenNext adapter config
├── next.config.ts
├── tailwind.config.ts                 # Minimal — Tailwind v4 CSS-first config
├── postcss.config.mjs
├── tsconfig.json
├── package.json
└── .github/
    └── workflows/
        └── deploy.yml                 # CI/CD: build + deploy to Cloudflare Pages
```

### Step 4 — Tailwind CSS v4 setup
- `postcss.config.mjs`: use `@tailwindcss/postcss` plugin (not `tailwindcss`)
- `globals.css`: replace `@tailwind` directives with `@import "tailwindcss";`
- Add `@theme` block for custom colors (corporate blue/gray palette)

---

## Phase 2: Database Schema & Driver Abstraction

### Step 5 — DB driver abstraction (`src/db/index.ts`) — THE SWAP POINT
- Default export: Cloudflare D1 driver via `drizzle-orm/d1`
  - Reads `env.DB` binding from Cloudflare Workers context
- Alternate: Turso driver via `drizzle-orm/libsql`
  - Reads `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` env vars
- Toggle via a single env var `DB_PROVIDER=d1|turso` or simply swap the import

### Step 6 — Define Drizzle schemas

**users**
| Column | Type | Notes |
|--------|------|-------|
| id | text (UUID) | PK |
| email | text | unique, not null |
| password_hash | text | bcryptjs |
| name | text | 氏名 |
| role | text | enum: employee, reviewer, manager, admin |
| department_id | text | FK → departments |
| is_active | integer | 1/0 boolean |
| created_at | text | ISO timestamp |
| updated_at | text | ISO timestamp |

**departments**
| Column | Type |
|--------|------|
| id | text (UUID) | PK |
| name | text | 部署名 |
| created_at | text |

**telework_reports**
| Column | Type | Notes |
|--------|------|-------|
| id | text (UUID) | PK |
| employee_id | text | FK → users |
| start_date | text | YYYY-MM-DD |
| end_date | text | YYYY-MM-DD (same as start for daily) |
| tasks | text | JSON string — array of task descriptions |
| status | text | 'draft', 'submitted', 'reviewer_approved', 'approved', 'rejected' |
| created_at | text | |
| updated_at | text | |

**approvals**
| Column | Type | Notes |
|--------|------|-------|
| id | text (UUID) | PK |
| report_id | text | FK → telework_reports |
| approver_id | text | FK → users |
| level | integer | 1 = reviewer, 2 = manager |
| decision | text | 'pending', 'approved', 'rejected' |
| comment | text | nullable |
| decided_at | text | nullable ISO timestamp |
| created_at | text | |

### Step 7 — Drizzle Kit config & wrangler.toml
- `drizzle.config.ts`: point to schema files, set `driver: 'd1-http'` or `libsql`
- `wrangler.toml`: define `[[d1_databases]]` binding `DB`
- Create initial migration: `pnpm drizzle-kit generate`

### Step 8 — Seed script (`src/db/seed.ts`)
- Create 1 admin, 1 manager, 1 reviewer, 2 employees
- Create 2 departments (e.g., 技術部, 営業部)
- Hash passwords with bcryptjs (default password: `password123`)

---

## Phase 3: Authentication System

### Step 9 — Password utilities (`src/lib/auth/password.ts`)
- `hashPassword(plain)` → bcryptjs with 10 rounds
- `verifyPassword(plain, hash)` → bcryptjs compare

### Step 10 — JWT session management (`src/lib/auth/session.ts`)
- `createSession(userId, role)` → sign JWT with `jose`, set HTTP-only cookie
  - Payload: `{ sub: userId, role, exp }` — 7-day expiry
  - Cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`
- `getSession()` → read cookie from `next/headers`, verify with `jose`
- `deleteSession()` → clear cookie (logout)
- Secret key from env: `JWT_SECRET`

### Step 11 — Data Access Layer (`src/lib/auth/dal.ts`)
- `verifySession()` → `cache()`-wrapped, returns `{ userId, role }` or redirects to `/login`
- `getCurrentUser()` → calls `verifySession()` then fetches user from DB
- Used by Server Components and Server Actions, never exposed to client

### Step 12 — Middleware (`src/middleware.ts`)
- Match protected routes: everything except `/(auth)/*`, `/api/auth/*`, `/_next/*`, static files
- Read JWT cookie → verify with `jose` → if invalid/missing → redirect to `/login`
- Role-based route checks:
  - `/admin/*` → only `admin`
  - `/review/*` → only `reviewer` or `admin`
  - `/approve/*` → only `manager` or `admin`
  - All other dashboard routes → any authenticated user
- Use `NextResponse.next()` with custom headers to pass role info downstream

### Step 13 — Login Server Action (`src/actions/auth.ts`)
- `loginAction(formData)`:
  1. Validate email/password (basic checks)
  2. Query user by email from DB
  3. Verify password with bcryptjs
  4. Create JWT session (set cookie)
  5. Return success + redirect URL based on role
- `logoutAction()`: delete session cookie, redirect to `/login`

---

## Phase 4: Login Page UI

### Step 14 — Auth layout (`src/app/(auth)/layout.tsx`)
- Full-height centered layout: `min-h-screen flex items-center justify-center bg-gray-50`
- Wraps children in centered container

### Step 15 — Login page (`src/app/(auth)/login/page.tsx`)
- Server Component — renders `<LoginForm />`
- Page title: 在宅勤務報告システム

### Step 16 — Login form (`src/components/forms/login-form.tsx`)
- Client Component (`"use client"`)
- Minimal centered card design:
  - System title: 在宅勤務報告システム
  - Subtitle: ログイン
  - Email field (メールアドレス)
  - Password field (パスワード)
  - Submit button (ログイン)
  - Error message display area
- Uses `useActionState` (React 19) + `loginAction` server action
- Loading state on submit button
- Corporate color scheme: blue primary (`#2563EB` / blue-600)

---

## Phase 5: Deployment Configuration

### Step 17 — OpenNext config (`open-next.config.ts`)
- Cloudflare adapter: `@opennextjs/cloudflare`
- Export `default` config with `buildCommand` and `buildOutputPath`

### Step 18 — GitHub Actions CI/CD (`.github/workflows/deploy.yml`)
- Trigger: push to `main`
- Steps: checkout → pnpm install → build → deploy via `wrangler pages deploy`
- Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- Run DB migrations on deploy

### Step 19 — Environment variables
- `.env.local` for local dev (JWT_SECRET, DB path)
- `.dev.vars` for Cloudflare local dev (wrangler)
- Document required env vars in README

---

## Relevant Files (to create)

| File | Purpose |
|------|---------|
| `src/db/index.ts` | DB client — single swap point for D1↔Turso |
| `src/db/schema/*.ts` | All Drizzle table definitions |
| `src/db/seed.ts` | Dev seed data (4 roles, 2 departments) |
| `src/lib/auth/session.ts` | JWT + cookie management |
| `src/lib/auth/password.ts` | bcryptjs hash/verify |
| `src/lib/auth/dal.ts` | `verifySession()`, `getCurrentUser()` |
| `src/middleware.ts` | Route protection + role-based access |
| `src/actions/auth.ts` | `loginAction`, `logoutAction` |
| `src/app/(auth)/layout.tsx` | Centered auth layout |
| `src/app/(auth)/login/page.tsx` | Login page |
| `src/components/forms/login-form.tsx` | Login form (client component) |
| `src/components/ui/*.tsx` | Button, Input, Card primitives |
| `drizzle.config.ts` | Drizzle Kit config |
| `wrangler.toml` | Cloudflare D1 bindings |
| `open-next.config.ts` | OpenNext deployment adapter |
| `.github/workflows/deploy.yml` | CI/CD pipeline |

---

## Verification

1. **Build check**: `pnpm build` completes without errors
2. **Type check**: `pnpm tsc --noEmit` passes
3. **Local dev**: `pnpm dev` → login page renders at `http://localhost:3000/login`
4. **DB migration**: `pnpm drizzle-kit generate` creates migration SQL
5. **Seed**: Run seed script → 5 users, 2 departments inserted
6. **Login flow**: Submit form → cookie set → redirected to dashboard
7. **Middleware**: Unauthenticated user hitting `/reports` → redirected to `/login`
8. **Role guard**: Employee hitting `/admin/employees` → 403 or redirect

---

## Decisions

- **jose over jsonwebtoken**: `jose` works on Cloudflare Workers Edge Runtime; `jsonwebtoken` uses Node.js `crypto` and breaks on Edge
- **bcryptjs over bcrypt**: pure JS implementation works on all runtimes including Workers; native `bcrypt` requires Node.js bindings
- **Server Actions over API routes for auth**: except `/api/auth/login` as fallback — Server Actions are the primary pattern for mutations in Next.js 15
- **SQLite TEXT for dates**: D1/libSQL stores dates as ISO 8601 strings — no native DATE type in SQLite
- **UUID as TEXT PK**: Cloudflare D1 has no native UUID type; generate with `crypto.randomUUID()`
- **No NextAuth**: per requirements — custom JWT keeps the system simple and portable
- **Japanese-only UI**: no i18n framework needed; hardcode Japanese strings

---

## Further Considerations

1. **Report detail fields**: The current `tasks` column stores JSON. Should individual task entries have their own table for better querying, or is JSON-in-TEXT sufficient for the MVP? **Recommendation**: JSON string for MVP — simpler schema, add a `report_tasks` table later if needed.

2. **Approval notification**: When a reviewer approves and it moves to manager — should there be an in-app notification system or email? **Recommendation**: Skip for initial build; add notification table + polling in a later phase.

3. **Export format**: Admin export — CSV is straightforward, but PDF requires a library (e.g., `@react-pdf/renderer` or server-side `puppeteer`). **Recommendation**: Start with CSV only; add PDF in a later phase since it adds significant complexity.
