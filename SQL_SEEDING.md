# SQL-Based Database Seeding Guide

All seed data is now managed through SQL migrations. This approach is simpler, more transparent, and works consistently across all environments (local D1, remote D1, Turso).

## Current Seed Data

**File:** `drizzle/0001_seed_initial_data.sql`

Contains:
- **2 Departments:**
  - 技術部 (Engineering) - `dept-eng-001`
  - 営業部 (Sales) - `dept-sales-001`

- **4 Users:**
  - admin@telework.local (admin) - 技術部
  - manager@telework.local (manager) - 技術部
  - employee1@telework.local (employee) - 技術部
  - employee2@telework.local (employee) - 営業部

- **Default Password:** `password123`
- **Password Hash:** `$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWQ2SLsEQNN3/npu` (bcryptjs cost 10)

## Adding More Seed Data

### Method 1: Update Existing Seed Migration

Edit `drizzle/0001_seed_initial_data.sql` and add more INSERT statements.

**Example - Adding a reviewer:**
```sql
INSERT INTO `users` (
  `id`,
  `email`,
  `password_hash`,
  `name`,
  `role`,
  `department_id`,
  `is_active`,
  `created_at`,
  `updated_at`
) VALUES (
  'user-reviewer-001',
  'reviewer@telework.local',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWQ2SLsEQNN3/npu',
  '審査 花子',
  'reviewer',
  'dept-eng-001',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
```

### Method 2: Create New Migration (Recommended for modifications)

If the initial seed has already been applied, create a new migration file:

**File:** `drizzle/0002_add_more_users.sql`

```sql
-- Add new department
INSERT INTO `departments` (`id`, `name`, `created_at`) VALUES
  ('dept-hr-001', '人事部', CURRENT_TIMESTAMP);

--> statement-breakpoint

-- Add new user
INSERT INTO `users` (
  `id`,
  `email`,
  `password_hash`,
  `name`,
  `role`,
  `department_id`,
  `is_active`,
  `created_at`,
  `updated_at`
) VALUES (
  'user-reviewer-001',
  'reviewer@telework.local',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWQ2SLsEQNN3/npu',
  '審査 花子',
  'reviewer',
  'dept-eng-001',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
```

Then apply migrations:
```bash
pnpm run db:migrate
```

## Generating Password Hashes

To create password hashes for seed users:

### Using bcryptjs (Node.js)
```bash
node -e "
const bcrypt = require('bcryptjs');
bcrypt.hash('your-password', 10, (err, hash) => {
  console.log('Hash:', hash);
});
"
```

### Using an online tool
Search for "bcryptjs hash generator" online. Use cost factor 10 to match the existing data.

### Example hashes:
- Password `password123`: `$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWQ2SLsEQNN3/npu`
- Password `test1234`: `$2a$10$8xKVRhpOcFM/E7H4q2Xn6OQkYqxkPJExHNXEf.zVZHPLgFHNy7aOK`

## Migration Format

SQLite migrations in Drizzle use this format:

```sql
-- Your SQL statement here
CREATE TABLE ...;

--> statement-breakpoint

-- Another statement
INSERT INTO ...;

--> statement-breakpoint
```

**Important:**
- Each SQL statement must be followed by `--> statement-breakpoint`
- Comments are optional but recommended
- Use backticks for table/column names: `` `table_name` ``

## Applying Migrations

### Local Development
```bash
pnpm run db:migrate        # Apply all pending migrations
```

### Remote D1
```bash
pnpm run db:migrate:d1     # Apply to remote database
```

### View Applied Migrations
```bash
npx wrangler d1 migrations list telework-test --local
```

## Seeding Best Practices

1. **Keep seed data minimal** - Only include essential data needed for testing/development
2. **Use descriptive IDs** - Makes debugging easier
  - `dept-eng-001` instead of `1` or random UUIDs
  - `user-admin-001` instead of long UUID
3. **Include comments** - Document what each section does
4. **One migration per logical change** - Makes rollbacks easier
5. **Test locally first** - Always validate with `pnpm run db:migrate` before pushing
6. **Don't include sensitive data** - Never commit real user data or credentials

## File Structure

```
drizzle/
├── 0000_past_famine.sql           # Schema creation (auto-generated)
├── 0001_seed_initial_data.sql     # Initial seed data
├── 0002_add_more_users.sql        # Additional modifications
└── meta/
    └── _journal.json              # Migration tracking
```

## Troubleshooting

### Error: "UNIQUE constraint failed"
- The email already exists in the database
- Check for duplicate emails in your INSERT statements
- Or clear the database and re-migrate

### Error: "FOREIGN KEY constraint failed"
- The referenced department doesn't exist
- Verify department IDs exist before inserting users
- Insert departments before users

### Need to reset seed data?
```bash
# This will only apply new migrations, not re-run old ones
# To truly reset, you'd need to delete the .wrangler database file:
rm .wrangler/state/v3/d1/*

# Then re-apply all migrations
pnpm run db:migrate
```

## Related Commands

```bash
pnpm run db:generate      # Generate new migrations from schema changes
pnpm run db:migrate       # Apply all pending migrations
pnpm run db:migrate:d1    # Apply migrations to remote D1
pnpm run lint             # Check code quality
```
