/**
 * Vitest config for PERC-8365 devnet integration tests.
 *
 * Used by the devnet-smoke.yml CI workflow and for local devnet testing.
 * NOT included in the default vitest.config.ts — this is opt-in only.
 *
 * Usage:
 *   # Offline error-code parsing only (no RPC):
 *   SKIP_DEVNET_TESTS=1 npx vitest run --config vitest.devnet.config.ts
 *
 *   # Full devnet integration (live RPC — requires internet access):
 *   npx vitest run --config vitest.devnet.config.ts
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/devnet-integration.test.ts", "test/devnet-getmarkets.test.ts", "test/mainnet-harness.test.ts", "test/devnet-full-api.test.ts"],
    testTimeout: 60_000,   // allow up to 60 s for RPC calls
    hookTimeout: 90_000,   // beforeAll does market discovery (can be slow)
    reporters: ["verbose"],
  },
});
