import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "automation/tests/**/*.acceptance.test.ts"],
    setupFiles: ["automation/tests/setup.ts"],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(
        __dirname,
        "./automation/tests/stubs/server-only.ts",
      ),
    },
  },
});
