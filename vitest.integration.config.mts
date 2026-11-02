import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Runs against a real Postgres (TEST_DATABASE_URL). Kept out of `pnpm test`.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.int.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
