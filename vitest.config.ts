import { defineConfig } from "vitest/config";

import packageJson from "./package.json";

export default defineConfig({
  define: {
    __PI_WEB_VERSION__: JSON.stringify(packageJson.version),
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    testTimeout: 20_000,
    fileParallelism: false,
    maxWorkers: 1,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.*",
        "src/**/*.stories.*",
        "src/env.d.ts",
        "src/types.d.ts",
        "src/pi-app/test-helper.ts",
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
