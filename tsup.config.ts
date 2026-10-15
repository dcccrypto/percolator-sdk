import { defineConfig } from "tsup";

/**
 * Outputs under dist/:
 *
 * 1. ESM: a single bundled dist/index.js. (A per-module ESM build was tried and
 *    measured +12.5 KiB gz/route WORSE in the Next 16 / Turbopack app, which
 *    already tree-shakes a single ESM file at part level.) `"sideEffects": false`
 *    in package.json lets bundlers drop the whole package when unused.
 * 2. CJS: dist/index.cjs for `require()`, plus dist/index.d.cts declarations so
 *    TypeScript node16/nodenext CJS consumers type-check.
 *
 * Per-module .d.ts files are emitted separately by `tsc` (see package.json "build").
 */
export default defineConfig([
    {
    entry: ["src/index.ts"],
    format: ["esm"],
    target: "node20",
    outDir: "dist",
    clean: true,
    bundle: true,
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
