import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: true,
  // DTS is generated separately via tsc for reliability in CI
  // (tsup's rollup-plugin-dts can produce incomplete .d.ts files
  //  when run inside pnpm's temp prepare directory)
  dts: false,
});
