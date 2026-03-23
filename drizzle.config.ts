import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

const provider = process.env.DB_PROVIDER === "turso" ? "turso" : "d1";

const libsqlCredentials = {
  url: process.env.TURSO_DATABASE_URL ?? "file:./drizzle/local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
};

const baseConfig = {
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  verbose: true,
  strict: true,
} as const;

export default provider === "d1"
  ? defineConfig({
      ...baseConfig,
      dialect: "sqlite",
    })
  : defineConfig({
      ...baseConfig,
      dialect: "turso",
      dbCredentials: libsqlCredentials,
    });
