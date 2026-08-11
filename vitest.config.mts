import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // Integration tests share one Postgres database, so they must not
    // interleave. Correctness over speed until it actually hurts.
    fileParallelism: false,
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "./src") },
  },
});
