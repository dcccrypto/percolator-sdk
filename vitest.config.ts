import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "test/encode.test.ts",
      "test/errors.test.ts",
      "test/instructions.test.ts",
      "test/pda.test.ts",
      "test/price-router.test.ts",
      "test/discovery.test.ts",
      "test/slab-parser.test.ts",
      "test/adl.test.ts",
      "test/accounts.test.ts",
      "test/program-ids.test.ts",
    ],
  },
});
