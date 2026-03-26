import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";
import { readdirSync } from "fs"

loadEnvConfig(process.cwd());

const isProduction = process.env.NODE_ENV === 'production';
const provider = process.env.DB_PROVIDER === "turso" ? "turso" : "d1";
const sqliteDirPath = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';

// Only read local MiniFlare sqlite file when using D1 in development
let sqliteFilePath: string | undefined;
if (provider === "d1" && !isProduction) {
  try {
    sqliteFilePath = readdirSync(sqliteDirPath).find(file => file.endsWith('.sqlite'));
  } catch {
    // Directory doesn't exist yet — run `wrangler dev` or `next dev` with D1 bindings first
  }
}

const libsqlCredentials = {
  url: process.env.TURSO_DATABASE_URL ?? "file:./drizzle/local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
};

const d1Credentials = isProduction ? {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
    token: process.env.CLOUDFLARE_D1_TOKEN!,
} : {
    url: `${sqliteDirPath}/${sqliteFilePath!}`,
};
const baseConfig = {
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  verbose: true,
  strict: true,
} as const;

export default provider === "d1" && !isProduction
  ? defineConfig({
      ...baseConfig,
      dialect: "sqlite",
      dbCredentials: d1Credentials,
    }) : provider === "d1" && isProduction
     ? defineConfig({
      ...baseConfig,
      dialect: 'sqlite',
      driver: 'd1-http',
      dbCredentials: d1Credentials,
    })
  : defineConfig({
      ...baseConfig,
      dialect: "turso",
      dbCredentials: libsqlCredentials,
    });
