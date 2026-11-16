import { describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 120_000 });
import { isqrtU128, plus2PctDepthE6 } from "../src/abi/v22-depth-source.js";

// Reference: the original bigint implementations (string bit-length seed).
function oldIsqrt(n: bigint): bigint {
  if (n < 2n) return n;
  const bits = n.toString(2).length;
  let x = 1n << BigInt(Math.ceil(bits / 2));
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}
function oldDepth(r: bigint): bigint {
  if (r === 0n) return 0n;
  const q = r * r;
  const t = q - (q + 50n) / 51n;
  const m0 = oldIsqrt(t);
  const a = m0 * m0;
  const ok = a >= q || q - a <= a / 50n;
  return r - (ok ? m0 : m0 + 1n);
}

let seed = 0x9e3779b97f4a7c15n;
function rnd64(): bigint {
  seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
  return seed;
}
function rndBits(bits: number): bigint {
  const v = (rnd64() << 64n) | rnd64();
  return v >> BigInt(128 - bits);
}

describe("isqrtU128 / plus2PctDepthE6 differential vs original", () => {
  it("every n < 2^20", () => {
    for (let n = 0n; n < 1n << 20n; n++) if (isqrtU128(n) !== oldIsqrt(n)) throw new Error(`n=${n}`);
  });
  it("perfect squares and +-1 up to 2^128-1", () => {
    const max = (1n << 128n) - 1n;
    const roots: bigint[] = [];
    for (let k = 0n; k < 64n; k++) roots.push(...[1n << k, (1n << k) - 1n, (1n << k) + 1n]);
    for (let i = 0; i < 20000; i++) roots.push(rndBits(1 + (i % 64)));
    roots.push((1n << 64n) - 1n);
    for (const r of roots) {
      for (const d of [-1n, 0n, 1n]) {
        const n = r * r + d;
        if (n < 0n || n > max) continue;
        expect(isqrtU128(n)).toBe(oldIsqrt(n));
      }
    }
  });
  it("1M random u128 of mixed width", () => {
    for (let i = 0; i < 1_000_000; i++) {
      const n = rndBits(1 + (i % 128));
      if (isqrtU128(n) !== oldIsqrt(n)) throw new Error(`n=${n}`);
    }
  });
  it("plus2PctDepthE6 every R < 1e6", () => {
    for (let r = 0n; r < 1_000_000n; r++) if (plus2PctDepthE6(r) !== oldDepth(r)) throw new Error(`r=${r}`);
  });
  it("plus2PctDepthE6 random u64 + edges", () => {
    const edges = [(1n << 64n) - 1n, (1n << 64n) - 2n, 1n << 63n, 1n << 52n, (1n << 52n) + 1n, 1n << 26n];
    for (const r of edges) expect(plus2PctDepthE6(r)).toBe(oldDepth(r));
    for (let i = 0; i < 300_000; i++) {
      const r = rnd64() >> BigInt(i % 64);
      if (plus2PctDepthE6(r) !== oldDepth(r)) throw new Error(`r=${r}`);
    }
  });
});
