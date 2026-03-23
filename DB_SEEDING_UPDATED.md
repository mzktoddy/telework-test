# Database Seeding Guide

This project supports seeding data to multiple database providers: **D1** (Cloudflare) and **Turso** (LibSQL).

## Quick Start

### 1. Local D1 (SQLite file)
```bash
pnpm run db:setup  # Runs migrations + seed
# or separately:
pnpm run db:migrate
pnpm run db:seed
```

### 2. Turso Remote
```bash
export DB_PROVIDER=turso
export TURSO_DATABASE_URL="libsql://your-db.turso.io"
export TURSO_AUTH_TOKEN="your-token"
pnpm run db:seed:turso:remote
```

### 3. D1 Remote
```bash
# 1. Apply migrations
pnpm run db:migrate:d1

# 2. Deploy the seeding function
pnpm run build
npx wrangler pages deploy dist

# 3. Seed the remote database
export D1_SEED_URL="https://your-app.pages.dev/api/db/seed"
pnpm run db:seed:d1:remote
```

## Detailed Seeding Strategies

### Local D1 (Development)
- **Database**: SQLite file at `./drizzle/local.db`
- **Commands**:
  ```bash
  pnpm run db:migrate      # Apply migrations locally
  pnpm run db:seed         # Seed local database
  pnpm run db:setup        # Do both
  ```

### Remote Turso
- **Database**: Turso (hosted LibSQL)
- **Prerequisites**:
  1. Create a Turso database: `turso db create telework-v1`
  2. Get credentials: `turso db tokens create telework-v1`
  3. Set environment variables in `.env.local`:
     ```
     DB_PROVIDER=turso
     TURSO_DATABASE_URL=libsql://your-db.turso.io
     TURSO_AUTH_TOKEN=your-token
     ```
- **Commands**:
  ```bash
  pnpm run db:migrate:turso         # Apply migrations
  pnpm run db:seed:turso:remote     # Seed remote database
  ```

### Remote D1 (Cloudflare Production)
- **Database**: Cloudflare D1 (remote)
- **Architecture**: Uses a Cloudflare Pages Function (`functions/api/db/seed.ts`) as the seeding endpoint
- **Setup Steps**:
  
  **1. Apply Migrations to Remote D1:**
  ```bash
  pnpm run db:migrate:d1
  ```
  
  **2. Deploy the Pages Function:**
  ```bash
  pnpm run build
  npx wrangler pages deploy dist
  ```
  After deployment, note your app URL (e.g., `https://your-app.pages.dev`)
  
  **3. Trigger Seeding:**
  ```bash
  export D1_SEED_URL="https://your-app.pages.dev/api/db/seed"
  # Optional: Add token-based authorization
  export D1_SEED_TOKEN="your-secret-token"
  pnpm run db:seed:d1:remote
  ```

**How Remote D1 Seeding Works:**
- Local CLI script (`scripts/seed-remote-d1.mjs`) makes HTTP POST request to deployed function
- Pages Function (`functions/api/db/seed.ts`) receives D1 binding from Cloudflare runtime
- Function calls `seedDatabase()` from `src/db/seed.ts` with D1 instance
- Results returned as JSON to local script

**Protecting the Seeding Endpoint:**
Add optional token-based authorization by setting `SEED_TOKEN` in your Cloudflare environment:

1. Set in `wrangler.toml`:
   ```toml
   [env.production]
   vars = { SEED_TOKEN = "your-secret-token" }
   ```

2. When seeding, pass the same token:
   ```bash
   export D1_SEED_TOKEN="your-secret-token"
   pnpm run db:seed:d1:remote
   ```

## Environment Variables

Create `.env.local`:

### For Local D1
```
DB_PROVIDER=d1
```

### For Remote Turso
```
DB_PROVIDER=turso
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=eyJ0eXAiOiJKV1...
```

### For Remote D1
```
D1_SEED_URL=https://your-app.pages.dev/api/db/seed
# Optional: Token-based authorization
D1_SEED_TOKEN=your-secret-token
```

See `.env.example` for detailed documentation.

## Troubleshooting

### Error: "TURSO_DATABASE_URL is required"
- Make sure `DB_PROVIDER=turso` is set
- Verify `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are exported

### Error: "D1_SEED_URL is required"
- Set `D1_SEED_URL` to your deployed app URL
- Example: `export D1_SEED_URL="https://your-app.pages.dev/api/db/seed"`

### Error: "no such table: departments"
- Ensure migrations were applied first
- Local: `pnpm run db:migrate`
- Remote D1: `pnpm run db:migrate:d1`
- Remote Turso: `pnpm run db:migrate:turso`

### Remote D1 returns 401 (Unauthorized)
- If you set `SEED_TOKEN` in wrangler/Cloudflare, must also set `D1_SEED_TOKEN` locally
- The script automatically includes it in the Authorization header

### Remote D1 endpoint returns 404
- Verify you've deployed the Pages Function: `npx wrangler pages deploy dist`
- Check correct URL format (usually `https://[your-app].pages.dev/api/db/seed`)
- Verify `functions/api/db/seed.ts` exists in your project

### Local seeding fails with migration errors
- Ensure you ran migrations first: `pnpm run db:migrate`
- Check that `./drizzle/local.db` exists or is created during migrate
- Run `pnpm run db:setup` to do both in sequence

## Default Seed Data

All providers are seeded with identical data:
- **Departments**: 技術部 (Engineering), 営業部 (Sales)
- **Users** (5 total):
  - admin@telework.local (admin)
  - manager@telework.local (manager)
  - reviewer@telework.local (reviewer)
  - employee1@telework.local (employee)
  - employee2@telework.local (employee)
- **Default Password**: `password123`

## Architecture Diagram

```
LOCAL DEVELOPMENT                    REMOTE PRODUCTION
─────────────────────────────────────────────────────

  sqlite file                          D1 Database
      ▲                                   ▲
      │                                   │
      │ createLibsqlDb()                  │ env.DB
      │                                   │  (Pages Function)
      │                                   │
   db:seed.ts ◄────────────────────  functions/api/db/seed.ts
  (CLI entry)    HTTP POST request       (Deployed)
      ▼                                   ▲
  seedDatabase()                         │
                                    seed-remote-d1.mjs
                                    (CLI script)

PROVIDERS:
──────────
1. D1 Local  → ./drizzle/local.db
2. D1 Remote → Cloudflare D1 (via Pages Function)
3. Turso     → libsql://your-db.turso.io
```

## NPM Scripts Reference

```bash
# Local Development (D1 SQLite)
pnpm run db:migrate              # Apply migrations to local D1
pnpm run db:seed                 # Seed local D1
pnpm run db:setup                # Migrate + seed (combined)

# Remote Turso
pnpm run db:migrate:turso         # Apply migrations to Turso
pnpm run db:seed:turso            # Seed Turso (local env vars)
pnpm run db:seed:turso:remote     # Seed Turso (configured credentials)

# Remote D1
pnpm run db:migrate:d1            # Apply migrations to remote D1
pnpm run db:seed:d1:remote        # Seed remote D1 (via Pages Function)

# Utilities
pnpm run db:generate              # Generate Drizzle migrations
pnpm run db:generate:d1           # Generate for D1
pnpm run db:generate:turso        # Generate for Turso
```
