import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const fileEnv = loadEnv("test", process.cwd(), "");
const testDbUrl =
  process.env.DATABASE_URL_TEST ??
  fileEnv.DATABASE_URL_TEST ??
  "postgres://postgres:postgres@localhost:51219/template1?sslmode=disable";

// Read by tests/support/global-setup.ts (globalSetup runs in the main process, not in workers).
process.env.ORDER_HUB_TEST_DB = testDbUrl;

const sharedEnv = {
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-123",
  SHOPIFY_WEBHOOK_SECRET: "test_webhook_secret",
  SHOPIFY_SHOP_DOMAIN: "",
  CRM_RISK_DAYS: "60",
};

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": new URL("./tests/support/empty.ts", import.meta.url).pathname },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
          env: { ...sharedEnv, DATABASE_URL: "postgres://unused:unused@localhost:1/unused" },
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          env: {
            ...sharedEnv,
            DATABASE_URL: testDbUrl,
            DIRECT_URL: testDbUrl,
            DATABASE_POOL_MAX: "1",
          },
          globalSetup: ["tests/support/global-setup.ts"],
          // One shared database: run files serially.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
