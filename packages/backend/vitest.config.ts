import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Backend tests share one postgres instance. Run files serially so
    // DROP SCHEMA / CREATE SCHEMA calls in per-file beforeAll hooks don't
    // race each other. Individual tests within a file are still parallel.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
    },
  },
});
