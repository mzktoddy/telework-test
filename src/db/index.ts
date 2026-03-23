// @ts-ignore - dynamic import to avoid type checking issues
import { createClient } from "@libsql/client";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import * as users from "./schema/users";
import * as departments from "./schema/departments";
import * as reports from "./schema/reports";
import * as approvals from "./schema/approvals";

const schema = { ...users, ...departments, ...reports, ...approvals };

export type DbProvider = "d1" | "turso";

const DEFAULT_LOCAL_DB_URL = "file:./drizzle/local.db";

export function getDbProvider(): DbProvider {
  console.log("DB_PROVIDER:", process.env.DB_PROVIDER);
  return process.env.DB_PROVIDER === "turso" ? "turso" : "d1";
}

export function createLibsqlDb() {
  const url = process.env.TURSO_DATABASE_URL ?? DEFAULT_LOCAL_DB_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  const client = createClient(
    authToken ? { url, authToken } : { url }
  );

  return drizzleLibsql(client, { schema });
}

export function createD1Db(d1: Parameters<typeof drizzleD1>[0]) {
  return drizzleD1(d1, { schema });
}

export function resolveDb(options?: { d1?: Parameters<typeof drizzleD1>[0] }) {
  const provider = getDbProvider();

  if (provider === "d1" && options?.d1) {
    return createD1Db(options.d1);
  }

  return createLibsqlDb();
}

/**
 * Default DB instance for Node/local environments.
 * In Cloudflare runtime, call createD1Db(env.DB) in request context.
 */
export const db = createLibsqlDb();

export type AppDb = ReturnType<typeof createLibsqlDb>;
export { schema };
