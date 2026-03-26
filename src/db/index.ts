// @ts-ignore - dynamic import to avoid type checking issues
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import type { D1Database } from "@cloudflare/workers-types";
import * as users from "./schema/users";
import * as departments from "./schema/departments";
import * as reports from "./schema/reports";
import * as approvals from "./schema/approvals";

// Augment the global CloudflareEnv interface with our D1 binding
declare global {
  interface CloudflareEnv {
    DB: D1Database;
  }
}

const schema = { ...users, ...departments, ...reports, ...approvals };

export type DbProvider = "d1" | "turso";

// Mirrors the provider logic in drizzle.config.ts
export function getDbProvider(): DbProvider {
  return process.env.DB_PROVIDER === "turso" ? "turso" : "d1";
}

// Used for Turso provider — dynamically imported so @libsql/client is not statically traced
// (prevents opennextjs from trying to symlink it into the Cloudflare bundle on Windows)
export async function createLibsqlDb() {
  const { createClient } = await import("@libsql/client");
  const { drizzle: drizzleLibsql } = await import("drizzle-orm/libsql");
  const url = process.env.TURSO_DATABASE_URL ?? "file:./drizzle/local.db";
  const authToken = process.env.TURSO_AUTH_TOKEN;

  const client = createClient(
    authToken ? { url, authToken } : { url }
  );

  return drizzleLibsql(client, { schema });
}

// Used for Cloudflare D1 provider (MiniFlare in dev, Workers/Pages in production)
export function createD1Db(d1: Parameters<typeof drizzleD1>[0]) {
  return drizzleD1(d1, { schema });
}

/**
 * Call inside Server Actions, Route Handlers, and Server Components.
 * - D1 provider: resolves the binding from Cloudflare context (MiniFlare in dev, Workers in production)
 * - Turso provider: creates a libsql client using TURSO_DATABASE_URL / TURSO_AUTH_TOKEN
 */
export async function getDb() {
  const provider = getDbProvider();

  if (provider === "turso") {
    return createLibsqlDb();
  }

  // D1: obtain binding via Cloudflare context — use async mode to avoid sync-mode errors
  // webpackIgnore prevents Next.js from tracing @opennextjs/cloudflare into traced files
  // (opennext bundles it via esbuild — symlink not needed, avoids Windows EPERM)
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env } = await getCloudflareContext({ async: true });
  return createD1Db(env.DB);
}

export type AppDb = Awaited<ReturnType<typeof createLibsqlDb>>;
export { schema };
