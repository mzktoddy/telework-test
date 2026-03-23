import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
// @ts-ignore
import { createClient } from "@libsql/client";

loadEnvConfig(process.cwd());

const url = process.env.TURSO_DATABASE_URL ?? "file:./drizzle/local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient(authToken ? { url, authToken } : { url });
const db = drizzle(client);

async function main() {
  console.log("Running migrations...");
  console.log("Database URL:", url);
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
