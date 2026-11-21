// Fail-before / pass-after check for percolator-sdk#652 (package shape F1 engines, F4 types:["node"], F5 ./package.json export).
// Run from the SDK repo root (needs node_modules installed):  node --test /abs/path/scripts/gate/pkgshape-f1f4f5.test.mjs
// Uses only node builtins. Everything it creates lives under one mkdtemp dir in /tmp and is removed at the end.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO = process.cwd();
const PKG = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));
assert.ok(fs.existsSync(path.join(REPO, "node_modules/.bin/tsc")), "run from the SDK root after install");

// /tmp literally (macOS os.tmpdir() is /var/folders/..., which is not where the reported failure happens)
const ROOT = fs.mkdtempSync("/tmp/pkgshape-gate-");
after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

// F4 setup: a stray ancestor @types package with no typings, like /tmp/node_modules/@types/{chai,...} on the mini.
// Without compilerOptions.types, tsc auto-includes every ancestor node_modules/@types/* and fails with TS2688.
fs.mkdirSync(path.join(ROOT, "node_modules/@types/stray-gate"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "node_modules/@types/stray-gate/package.json"), JSON.stringify({ name: "@types/stray-gate", version: "1.0.0" }));
const PROJ = path.join(ROOT, "proj");
fs.mkdirSync(PROJ);
for (const f of ["src", "package.json", "tsconfig.json", "tsup.config.ts"]) fs.cpSync(path.join(REPO, f), path.join(PROJ, f), { recursive: true });
fs.symlinkSync(path.join(REPO, "node_modules"), path.join(PROJ, "node_modules"), "dir");

function sh(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout: 5 * 60e3 });
  return { status: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

test("F4: `pnpm build` steps (tsup && tsc --emitDeclarationOnly) pass in a /tmp dir with a stray ancestor @types", () => {
  const tsup = sh(path.join(PROJ, "node_modules/.bin/tsup"), [], PROJ);
  assert.equal(tsup.status, 0, `tsup failed:\n${tsup.out.slice(-2000)}`);
  const tsc = sh(path.join(PROJ, "node_modules/.bin/tsc"), ["--emitDeclarationOnly", "--declaration", "--outDir", "dist"], PROJ);
  assert.doesNotMatch(tsc.out, /TS2688/, "tsc picked up the stray ancestor @types");
  assert.equal(tsc.status, 0, `tsc failed:\n${tsc.out.slice(-2000)}`);
  assert.ok(fs.existsSync(path.join(PROJ, "dist/index.js")) && fs.existsSync(path.join(PROJ, "dist/index.d.ts")));
});

test("F5: `<pkg>/package.json` resolves via require and ESM import; deep dist/* stays sealed", () => {
  const consumer = path.join(ROOT, "consumer");
  const scope = path.join(consumer, "node_modules", PKG.name.split("/")[0]);
  fs.mkdirSync(scope, { recursive: true });
  fs.symlinkSync(PROJ, path.join(consumer, "node_modules", PKG.name), "dir");
  fs.writeFileSync(path.join(consumer, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
  const probe = `
    import { createRequire } from "node:module";
    const require = createRequire(import.meta.url);
    const out = {};
    try { out.cjs = require(${JSON.stringify(PKG.name + "/package.json")}).name; } catch (e) { out.cjs = "ERR " + e.code; }
    try { out.esm = (await import(${JSON.stringify(PKG.name + "/package.json")}, { with: { type: "json" } })).default.name; } catch (e) { out.esm = "ERR " + e.code; }
    try { require.resolve(${JSON.stringify(PKG.name + "/dist/index.js")}); out.deep = "resolved"; } catch (e) { out.deep = "ERR " + e.code; }
    console.log(JSON.stringify(out));`;
  fs.writeFileSync(path.join(consumer, "probe.mjs"), probe);
  const r = sh(process.execPath, ["probe.mjs"], consumer);
  assert.equal(r.status, 0, r.out);
  const out = JSON.parse(r.out.trim().split("\n").at(-1));
  assert.equal(out.cjs, PKG.name, `require('${PKG.name}/package.json') -> ${out.cjs}`);
  assert.equal(out.esm, PKG.name, `import('${PKG.name}/package.json') -> ${out.esm}`);
  assert.equal(out.deep, "ERR ERR_PACKAGE_PATH_NOT_EXPORTED", "deep dist/* import must stay sealed");
});

// Minimal semver range check for the forms used in engines (x.y.z, ^, ~, >=, >, <=, <, ||, space-AND). No deps.
function satisfies(v, range) {
  const p = s => s.split(".").map(Number);
  const cmp = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return 0; };
  const V = p(v);
  return range.split("||").some(set => set.trim().split(/\s+/).every(c => {
    const m = c.match(/^(\^|~|>=|<=|>|<|=)?v?(\d+)\.(\d+)\.(\d+)$/);
    if (!m) throw new Error(`unsupported comparator ${c}`);
    const B = [+m[2], +m[3], +m[4]]; const k = cmp(V, B);
    switch (m[1] || "=") {
      case "^": return k >= 0 && (B[0] > 0 ? V[0] === B[0] : B[1] > 0 ? V[0] === 0 && V[1] === B[1] : cmp(V, B) === 0);
      case "~": return k >= 0 && V[0] === B[0] && V[1] === B[1];
      case ">=": return k >= 0; case ">": return k > 0; case "<=": return k <= 0; case "<": return k < 0; default: return k === 0;
    }
  }));
}

test("F1: engines.node excludes the Node lines the SDK fails on (20.18.0, 22.11.0) and admits the ones it passes on", () => {
  const range = PKG.engines?.node;
  assert.ok(range, "engines.node missing");
  for (const bad of ["20.0.0", "20.18.0", "21.7.3", "22.11.0"]) assert.equal(satisfies(bad, range), false, `engines "${range}" still admits ${bad}`);
  for (const good of ["20.19.0", "22.12.0", "24.0.0", "25.6.1"]) assert.equal(satisfies(good, range), true, `engines "${range}" rejects ${good}`);
});
