import { describe, it, expect } from "vitest";
import { seniorFloorEncodeP2b, seniorFloorDecodeP2b } from "../src/abi/p2b-earn.js";

// Literal port of percolator-prog src/vault_lp_v18.rs (feat/v22-rc23-2026-10-22)
// senior_floor_encode / senior_floor_decode, using u128 leading_zeros arithmetic
// (independent of the SDK's toString(2) bit-length).
const MASK128 = (1n << 128n) - 1n;
function leadingZeros128(v: bigint): bigint {
  let n = 0n;
  for (let b = 127n; b >= 0n; b--) {
    if ((v >> b) & 1n) break;
    n++;
  }
  return n;
}
function refEncode(v: bigint): number {
  if (v === 0n) return 0;
  const bits = 128n - leadingZeros128(v);
  if (bits <= 10n) return Number(v & 0xffffn);
  let e = bits - 10n;
  let m = ((v >> e) + ((v & ((1n << e) - 1n)) !== 0n ? 1n : 0n)) & MASK128;
  if (m === 1024n) {
    e += 1n;
    m = 512n;
  }
  if (e > 63n) return 0xffff;
  return Number(((e << 10n) | m) & 0xffffn);
}
function refDecode(code: number): bigint {
  return BigInt(code & 1023) << BigInt(code >> 10);
}

const SAT = 1023n << 63n;

function samples(): bigint[] {
  const out: bigint[] = [];
  for (let i = 0n; i <= 4096n; i++) out.push(i);
  for (let k = 0n; k < 128n; k++) {
    const p = 1n << k;
    for (const d of [-1n, 0n, 1n]) {
      const v = p + d;
      if (v >= 0n && v <= MASK128) out.push(v);
    }
  }
  out.push(MASK128, MASK128 - 1n, SAT - 1n, SAT, SAT + 1n, (1023n << 63n) + (1n << 63n));
  let s = 0x9e3779b9n;
  const next = () => {
    s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    return s;
  };
  for (let i = 0; i < 20000; i++) {
    const bitsN = BigInt(Number(next() % 128n) + 1);
    const v = ((next() << 64n) | next()) & ((1n << bitsN) - 1n);
    out.push(v);
  }
  return out;
}

describe("p2b senior floor code: differential vs Rust vault_lp_v18", () => {
  const vs = samples();

  it("encode matches the Rust port on all samples (0 mismatches)", () => {
    const bad = vs.filter((v) => seniorFloorEncodeP2b(v) !== refEncode(v));
    expect(bad).toEqual([]);
  });

  it("decode matches on every u16 code", () => {
    const bad: number[] = [];
    for (let c = 0; c <= 0xffff; c++) if (seniorFloorDecodeP2b(c) !== refDecode(c)) bad.push(c);
    expect(bad).toEqual([]);
  });

  it("ceiling and precision hold below the saturation bound", () => {
    const bad: bigint[] = [];
    for (const v of vs) {
      const code = seniorFloorEncodeP2b(v);
      const d = seniorFloorDecodeP2b(code);
      const ok = v <= SAT ? d >= v && d <= v + v / 512n + 1n : code === 0xffff;
      if (!ok) bad.push(v);
    }
    expect(bad).toEqual([]);
  });

  it("saturation boundary", () => {
    expect(seniorFloorEncodeP2b(SAT)).toBe(63 << 10 | 1023);
    expect(seniorFloorEncodeP2b(SAT + 1n)).toBe(0xffff);
    expect(seniorFloorEncodeP2b((1n << 128n) - 1n)).toBe(0xffff);
    expect(seniorFloorEncodeP2b(1023n)).toBe(1023);
    expect(seniorFloorEncodeP2b(1025n)).toBe((1 << 10) | 513);
  });
});
