import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: { exclude: ["scripts/**", "test/**", "dist/**", "**/*.config.*"] },
    // Pattern-based so new test PRs never need to edit this file.
    include: [
      "test/**/*.test.ts", // all SDK tests under test/
      "src/**/__tests__/**/*.test.ts", // colocated unit tests
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.git/**",
      "test/devnet-*.test.ts", // need a live devnet RPC cluster; run via vitest.devnet.config.ts
      "test/mainnet-harness.test.ts", // live-cluster harness; run via vitest.devnet.config.ts
      // Plain tsx scripts (no vitest suites); run by `pnpm test` via test/tsx-steps.ts before vitest.
      "test/abi.test.ts",
      "test/slab.test.ts",
      "test/validation.test.ts",
      "test/dex-oracle.test.ts",
      "test/trading.test.ts",
      "test/warmup-leverage-cap.test.ts",
      "test/dynamic-fees.test.ts",
      "test/oracle.test.ts",
    ],
  },
});
