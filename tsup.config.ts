import { defineConfig } from "tsup";

/**
 * Two outputs, both under dist/:
 *
 * 1. ESM, one file per source module (bundle:false) so the module graph is
 *    preserved. Bundlers (webpack/turbopack/rollup/esbuild) can then drop
 *    unused modules; with `"sideEffects": false` they can drop unused
 *    re-exports too. Import specifiers already carry `.js`, so the emitted
 *    files resolve under Node ESM as well.
 * 2. CJS, a single bundled dist/index.cjs for `require()` (Node consumers do
 *    not need tree-shaking and this avoids rewriting every relative specifier).
 *
 * Declarations are emitted separately by `tsc` (see package.json "build").
 */
export default defineConfig([
  {
    entry: ["src/**/*.ts", "!src/**/__tests__/**", "!src/**/*.test.ts"],
    format: ["esm"],
    target: "node20",
    outDir: "dist",
    clean: true,
    bundle: false,
    splitting: false,
    sourcemap: true,
    dts: false,
  },
  {
    entry: ["src/index.ts"],
    format: ["cjs"],
    target: "node20",
    outDir: "dist",
    clean: false,
    bundle: true,
    splitting: false,
    sourcemap: true,
    dts: false,
  },
  {
    // dist/index.d.cts: CommonJS-flavoured declarations so TypeScript
    // moduleResolution node16/nodenext `require()` consumers type-check
    // (the ESM .d.ts tree raises TS1479 in a CJS file).
    entry: ["src/index.ts"],
    format: ["cjs"],
    outDir: "dist",
    clean: false,
    bundle: true,
    dts: { only: true },
  },
]);
