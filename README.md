This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app), configured to support two deployment targets: **Cloudflare (D1)** and **AWS / Node.js (Turso/libsql)**.

---

## Deployment Paths

The active path is controlled by the `DB_PROVIDER` environment variable:

| `DB_PROVIDER` | Target | Database |
|---|---|---|
| *(unset)* | Cloudflare Workers (via opennextjs-cloudflare) | D1 |
| `turso` | AWS / Node.js (via opennextjs-aws or `next start`) | Turso / libsql |

---

## Cloudflare Path (D1)

### Development
```bash
npm run dev
```
Starts Next.js dev server with Cloudflare D1 bindings via wrangler proxy (`initOpenNextCloudflareForDev`).

### Build
```bash
npm run build:cloudflare
```
Bundles the app using `opennextjs-cloudflare` into `.open-next/worker.js`.

### Preview locally
```bash
npm run preview
```
Runs the Cloudflare bundle locally using wrangler.

### Deploy to Cloudflare
```bash
npm run deploy
```

### Database migrations
```bash
# Apply migrations to local wrangler D1
npm run db:migrate:d1:local

# Apply migrations to remote Cloudflare D1
npm run db:migrate:d1
```

---

## AWS / Node.js Path (Turso/libsql)

Requires `TURSO_DATABASE_URL` and optionally `TURSO_AUTH_TOKEN` in `.env.local`.

### Development
```bash
npm run dev:turso
```
Starts Next.js dev server using Turso/libsql (`DB_PROVIDER=turso`).

### Build
```bash
npm run build:aws
```
Standard Next.js build with `DB_PROVIDER=turso`.

### Start production server
```bash
npm run start:turso
```

### Database migrations
```bash
npm run db:migrate:turso
```

---

## Common Commands

```bash
# Generate Drizzle migration files
npm run db:generate

# Lint
npm run lint
```

---

## Getting Started

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [OpenNextjs Cloudflare](https://opennext.js.org/cloudflare)
- [Drizzle ORM](https://orm.drizzle.team)
- [Turso](https://turso.tech) / [libsql](https://github.com/tursodatabase/libsql)
- [Cloudflare D1](https://developers.cloudflare.com/d1)
