/**
 * Differential test for vendor/bigint-buffer (the pure-JS 1.1.5 copy that pnpm.overrides installs, #354).
 *
 * toBufferLE/BE(num, width) do `num.toString(16).padStart(width*2, '0').slice(0, width*2)`. That is exact for
 * 0 <= num < 2^(8*width). Outside that range it does not throw:
 *   - too big: slice keeps the HIGH hex digits and drops the LOW ones (2^64 at width 8 -> bytes of 2^60);
 *   - negative: the hex is "-1", Buffer.from(hex) stops at '-', so the buffer is one byte SHORT and all zero.
 * Upstream bigint-buffer@1.1.5's JS fallback does the same; the vendor copy only removed the native addon.
 *
 * Who reaches it (checked on feat/v22-sdk-growth 07647073):
 *   `pnpm why bigint-buffer` -> devDependencies: @solana/spl-token 0.4.14 -> @solana/buffer-layout-utils 0.2.0 ->
 *   bigint-buffer file:vendor/bigint-buffer. The only importer is buffer-layout-utils lib/cjs/bigint.js:5 and
 *   lib/esm/bigint.mjs:2 (its u64/u128/... layouts). The SDK's runtime dependencies are @noble/curves and
 *   @solana/web3.js (web3.js 1.99 does not depend on it), src/ imports spl-token-lite instead of @solana/spl-token,
 *   and the shipped dist/index.js imports neither. So no live SDK path emits these bytes; the tests below pin that.
 *
 * The `it.fails` cases are the differential against a strict reference (RangeError when out of range). They fail
 * on the vendor code today, which `it.fails` records as a pass. If the vendor copy ever gains range checks, they
 * start passing, `it.fails` turns red, and the pinned wrong-bytes table must be deleted with them.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, realpathSync, statSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(join(ROOT, "package.json"));

type BB = {
  toBigIntLE(b: Buffer): bigint;
  toBigIntBE(b: Buffer): bigint;
  toBufferLE(n: bigint, w: number): Buffer;
  toBufferBE(n: bigint, w: number): Buffer;
};

const FILES = ["node", "browser"] as const;
const impl: Record<(typeof FILES)[number], BB> = {
  node: req(join(ROOT, "vendor/bigint-buffer/dist/node.js")),
  browser: req(join(ROOT, "vendor/bigint-buffer/dist/browser.js")),
};

/** Reference: exact unsigned width-byte encoding, RangeError outside [0, 2^(8*width)). */
function refBE(num: bigint, width: number): Buffer {
  if (num < 0n || num >= 1n << BigInt(8 * width)) throw new RangeError(`${num} does not fit in ${width} bytes`);
  const out = Buffer.alloc(width);
  let n = num;
  for (let i = width - 1; i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}
const refLE = (num: bigint, width: number): Buffer => Buffer.from(refBE(num, width)).reverse();
function refToBigIntBE(buf: Buffer): bigint {
  let n = 0n;
  for (const b of buf) n = (n << 8n) | BigInt(b);
  return n;
}
const refToBigIntLE = (buf: Buffer): bigint => refToBigIntBE(Buffer.from(buf).reverse());

const WIDTHS = [8, 16, 32] as const;
const VALUES: Array<[string, bigint]> = [
  ["0", 0n],
  ["2^64-1", 2n ** 64n - 1n],
  ["2^64", 2n ** 64n],
  ["2^128", 2n ** 128n],
  ["-1", -1n],
];
const fits = (v: bigint, w: number) => v >= 0n && v < 1n << BigInt(8 * w);
const IN_RANGE = WIDTHS.flatMap((w) => VALUES.filter(([, v]) => fits(v, w)).map(([l, v]) => [w, l, v] as const));
const OUT_OF_RANGE = WIDTHS.flatMap((w) => VALUES.filter(([, v]) => !fits(v, w)).map(([l, v]) => [w, l, v] as const));

/** Exact bytes the vendor code emits today for the out-of-range cases (same in node.js and browser.js). */
const WRONG_BYTES: Record<string, { le: string; be: string }> = {
  "8:2^64": { le: "0000000000000010", be: "1000000000000000" }, // = 2^60, not an error
  "8:2^128": { le: "0000000000000010", be: "1000000000000000" }, // = 2^60
  "8:-1": { le: "00000000000000", be: "00000000000000" }, // 7 zero bytes
  "16:2^128": { le: "00000000000000000000000000000010", be: "10000000000000000000000000000000" }, // = 2^124
  "16:-1": { le: "00".repeat(15), be: "00".repeat(15) }, // 15 zero bytes
  "32:-1": { le: "00".repeat(31), be: "00".repeat(31) }, // 31 zero bytes
};

describe("vendor/bigint-buffer: which copy is installed", () => {
  it("spl-token -> buffer-layout-utils -> bigint-buffer resolves to a byte-identical copy of vendor dist/node.js", () => {
    const splToken = req.resolve("@solana/spl-token");
    const blu = createRequire(splToken).resolve("@solana/buffer-layout-utils");
    const bb = createRequire(blu).resolve("bigint-buffer");
    // pnpm copies file: deps into node_modules/.pnpm, so compare contents, not paths.
    expect(readFileSync(realpathSync(bb), "utf8")).toBe(readFileSync(join(ROOT, "vendor/bigint-buffer/dist/node.js"), "utf8"));
  });
});

describe.each(FILES)("vendor/bigint-buffer/dist/%s.js vs reference", (file) => {
  const bb = impl[file];

  it.each(IN_RANGE)("width %i, %s: toBufferLE/BE and toBigIntLE/BE match the reference", (w, _l, v) => {
    const le = bb.toBufferLE(v, w);
    const be = bb.toBufferBE(v, w);
    expect(le.toString("hex")).toBe(refLE(v, w).toString("hex"));
    expect(be.toString("hex")).toBe(refBE(v, w).toString("hex"));
    expect(bb.toBigIntLE(le)).toBe(refToBigIntLE(le));
    expect(bb.toBigIntBE(be)).toBe(refToBigIntBE(be));
    expect(bb.toBigIntLE(le)).toBe(v);
    expect(bb.toBigIntBE(be)).toBe(v);
  });

  it("toBigIntLE/BE match the reference on empty and odd buffers", () => {
    for (const hex of ["", "01", "ff00", "0102030405060708090a", "ff".repeat(32)]) {
      const buf = Buffer.from(hex, "hex");
      expect(bb.toBigIntLE(buf)).toBe(refToBigIntLE(buf));
      expect(bb.toBigIntBE(buf)).toBe(refToBigIntBE(buf));
    }
  });

  // Differential: the reference throws RangeError; the vendor code returns bytes. Fails today -> it.fails.
  it.fails.each(OUT_OF_RANGE)("width %i, %s: toBufferLE throws RangeError like the reference", (w, _l, v) => {
    expect(() => refLE(v, w)).toThrow(RangeError);
    expect(() => bb.toBufferLE(v, w)).toThrow(RangeError);
  });
  it.fails.each(OUT_OF_RANGE)("width %i, %s: toBufferBE throws RangeError like the reference", (w, _l, v) => {
    expect(() => refBE(v, w)).toThrow(RangeError);
    expect(() => bb.toBufferBE(v, w)).toThrow(RangeError);
  });

  it.each(OUT_OF_RANGE)("width %i, %s: pinned wrong bytes (no error, wrong value or short buffer)", (w, l, v) => {
    const want = WRONG_BYTES[`${w}:${l}`];
    expect(want, `missing WRONG_BYTES[${w}:${l}]`).toBeDefined();
    const le = bb.toBufferLE(v, w);
    const be = bb.toBufferBE(v, w);
    expect(le.toString("hex")).toBe(want.le);
    expect(be.toString("hex")).toBe(want.be);
    // Round-trip does not give the input back.
    expect(bb.toBigIntLE(le)).not.toBe(v);
    expect(bb.toBigIntBE(be)).not.toBe(v);
    if (v < 0n) expect(le.length).toBe(w - 1);
  });
});

describe("@solana/buffer-layout-utils u64 (the only importer) inherits it", () => {
  it("u64.encode(2^64) writes 2^60 instead of throwing", () => {
    const splToken = req.resolve("@solana/spl-token");
    const { u64 } = createRequire(splToken)("@solana/buffer-layout-utils") as {
      u64: (p: string) => { encode(v: bigint, b: Buffer, o: number): number; decode(b: Buffer, o: number): bigint };
    };
    const layout = u64("amount");
    const buf = Buffer.alloc(8);
    layout.encode(2n ** 64n, buf, 0);
    expect(buf.toString("hex")).toBe("0000000000000010");
    expect(layout.decode(buf, 0)).toBe(2n ** 60n);
  });
});

describe("no live SDK path reaches bigint-buffer", () => {
  const BANNED = /from\s+["'](?:@solana\/spl-token|@solana\/buffer-layout-utils|bigint-buffer)["']|require\(\s*["'](?:@solana\/spl-token|@solana\/buffer-layout-utils|bigint-buffer)["']\s*\)/;

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== "__tests__") walk(p, out);
      } else if (/\.(ts|js|mjs|cjs)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p);
    }
    return out;
  }

  it("runtime dependencies are only @noble/curves and @solana/web3.js; spl-token is dev-only", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(Object.keys(pkg.dependencies).sort()).toEqual(["@noble/curves", "@solana/web3.js"]);
    expect(pkg.devDependencies["@solana/spl-token"]).toBeDefined();
    const web3 = JSON.parse(readFileSync(req.resolve("@solana/web3.js/package.json"), "utf8"));
    expect(Object.keys(web3.dependencies ?? {})).not.toContain("bigint-buffer");
    expect(Object.keys(web3.dependencies ?? {})).not.toContain("@solana/buffer-layout-utils");
  });

  it("no non-test file under src/ imports spl-token, buffer-layout-utils or bigint-buffer", () => {
    const hits = walk(join(ROOT, "src")).filter((f) => BANNED.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });

  it("the shipped dist/index.js does not import them either", () => {
    const p = join(ROOT, "dist/index.js");
    if (!existsSync(p)) return;
    expect(BANNED.test(readFileSync(p, "utf8"))).toBe(false);
  });
});
