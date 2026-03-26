import type { NextConfig } from "next";

// When DB_PROVIDER=turso → AWS/Node.js path (libsql)
// When DB_PROVIDER unset  → Cloudflare path (D1)
const isCloudflare = process.env.DB_PROVIDER !== "turso";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client"],
  // Cloudflare: exclude @libsql/client from tracing (D1 is used, not libsql)
  // Prevents EPERM symlink errors on Windows during opennextjs-cloudflare build
  // AWS/Turso: do NOT exclude — libsql must be traced so it's bundled in deployment
  ...(isCloudflare && {
    outputFileTracingExcludes: {
      "*": ["./node_modules/@libsql/**"],
    },
  }),
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 5,
  },
};

// Wire Cloudflare D1 bindings from wrangler for `next dev` — Cloudflare path only
// Skipped for Turso path (no wrangler proxy needed)
if (isCloudflare) {
  const { initOpenNextCloudflareForDev } = require("@opennextjs/cloudflare");
  initOpenNextCloudflareForDev();
}

export default nextConfig;
