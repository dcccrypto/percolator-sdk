import { bench, describe } from "vitest";
import { encU8, encU16, encU32, encU64, encI64, encU128, encI128 } from "../../src/abi/encode.js";

// Deterministic xorshift PRNG so every run encodes identical inputs.
let s = 0x9e3779b9;
const rnd = () => {
  s ^= s << 13; s >>>= 0;
  s ^= s >>> 17;
  s ^= s << 5; s >>>= 0;
  return s;
};
const big = (bits: number): bigint => {
  let r = 0n;
  for (let i = 0; i < bits; i += 32) r = (r << 32n) | BigInt(rnd());
  return r & ((1n << BigInt(bits)) - 1n);
};

const N = 100_000;
const u8s = Array.from({ length: N }, () => rnd() & 0xff);
const u16s = Array.from({ length: N }, () => rnd() & 0xffff);
const u32s = Array.from({ length: N }, () => rnd());
// mixed: ~3/4 bigint, ~1/4 decimal string
const mix = (v: bigint): bigint | string => (rnd() & 3 ? v : v.toString());
const u64s = Array.from({ length: N }, () => mix(big(64)));
const i64s = Array.from({ length: N }, () => mix(big(64) - (1n << 63n)));
const u128s = Array.from({ length: N }, () => mix(big(128)));
const i128s = Array.from({ length: N }, () => mix(big(128) - (1n << 127n)));

const opts = { time: 500, warmupTime: 200 };
describe("encode primitives x100k", () => {
  bench("encU8", () => { for (let i = 0; i < N; i++) encU8(u8s[i]); }, opts);
  bench("encU16", () => { for (let i = 0; i < N; i++) encU16(u16s[i]); }, opts);
  bench("encU32", () => { for (let i = 0; i < N; i++) encU32(u32s[i]); }, opts);
  bench("encU64", () => { for (let i = 0; i < N; i++) encU64(u64s[i]); }, opts);
  bench("encI64", () => { for (let i = 0; i < N; i++) encI64(i64s[i]); }, opts);
  bench("encU128", () => { for (let i = 0; i < N; i++) encU128(u128s[i]); }, opts);
  bench("encI128", () => { for (let i = 0; i < N; i++) encI128(i128s[i]); }, opts);
});
