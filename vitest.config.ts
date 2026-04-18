import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.d.ts",
        // DB layer and infrastructure contracts are integration-tested via npm run test:integration
        "src/db/**",
        "src/server/contracts/queue.ts",
        "src/server/contracts/storage.ts",
        // Next.js app layer (server actions, pages) are not unit-testable
        "src/app/**",
        // Type-only and env singleton files
        "src/lib/types.ts",
        "src/lib/env.ts",
      ],
      thresholds: { lines: 80 },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
