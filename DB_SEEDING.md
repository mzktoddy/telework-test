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
# Set environment variables
export DB_PROVIDER=turso
export TURSO_DATABASE_URL="libsql://your-db.turso.io"
export TURSO_AUTH_TOKEN="eyJ0eXAiOiJKV1..."

# Run seeding
pnpm run db:seed:turso:remote
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
  3. Set environment variables in `.env.local` or shell:
     ```
     DB_PROVIDER=turso
     TURSO_DATABASE_URL=libsql://your-db.turso.io
     TURSO_AUTH_TOKEN=your-auth-token
     ```
- **Commands**:
  ```bash
  pnpm run db:migrate:turso         # Apply migrations
  pnpm run db:seed:turso:remote     # Seed remote database
  ```

### Remote D1 (Cloudflare)
- **Database**: Cloudflare D1 (remote)
- **Prerequisites**:
  1. Migrations handled via Wrangler: `pnpm run db:migrate:d1`
  2. Seeding requires either:
     - A Cloudflare Worker endpoint that calls seeding logic
     - Or use within your Next.js API routes (with `env.DB` binding)

## Environment Variables

Create `.env.local`:
```
DB_PROVIDER=turso
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token
```

See `.env.example` for detailed documentation.

## Troubleshooting

### Error: "TURSO_DATABASE_URL is required"
- Make sure `DB_PROVIDER=turso` is set
- Verify `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are exported

### Error: "no such table: departments"
- Run migrations first: `pnpm run db:migrate`

### D1 Remote Seeding
For remote D1 seeding in production, consider:
1. Creating a Cloudflare Worker that runs seeding on deploy
2. Using API endpoints in your Next.js app (if running on Cloudflare Pages Functions)
3. Using `wrangler d1 shell` for manual seeding

## Default Seed Data

Both databases are seeded with:
- **Departments**: 技術部 (Engineering), 営業部 (Sales)
- **Users** (5 total):
  - admin@telework.local (admin)
  - manager@telework.local (manager)
  - reviewer@telework.local (reviewer)
  - employee1@telework.local (employee)
  - employee2@telework.local (employee)
- **Default Password**: `password123`
