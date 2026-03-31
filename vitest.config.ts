import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "test/encode.test.ts",
      "test/errors.test.ts",
      "test/instructions.test.ts",
      "test/pda.test.ts",
      "test/slab-parser.test.ts",
      "test/program-ids.test.ts",
      "test/adl.test.ts",
      "src/solana/__tests__/stake.test.ts",
    ],
  },
});
