import { execSync } from "node:child_process";

// Integration tests run against a dedicated database (DATABASE_URL_TEST): never the dev one.
export default function setup() {
  const url = process.env.ORDER_HUB_TEST_DB;
  if (!url) throw new Error("ORDER_HUB_TEST_DB not set by vitest.config.mts");
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}
