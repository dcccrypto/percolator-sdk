/**
 * Identity proof for the parsePositionNftAccount perf change (J-20261122-SDK-PERF-NFTPARSEDECODE).
 *
 * `parsePositionNftAccountOld` below is the parser exactly as it was on feat/v22-sdk-growth 0be4f0dd
 * (`new PublicKey(data.subarray(..))` for every key, and the three-BigInt `readI128FromView`). The new
 * parser builds each PublicKey directly and reads the i128 with a signed high half. This test decodes
 * 5,000 seeded random and boundary buffers with both and requires deep-strict equality (same
 * prototypes, same own keys, same bn.js words/length/negative/red), or the same thrown error.
 */
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  parsePositionNftAccount,
  POSITION_NFT_STATE_LEN,
  POSITION_NFT_LEGACY_V2_LEN,
} from "../src/abi/nft.js";

// ---- old code, copied verbatim from src/abi/nft.ts @ 0be4f0dd -----------------------------------
const POSITION_NFT_MAGIC = 0x5045_5243_4e46_5400n;
const POSITION_NFT_VERSION = 3;
const POSITION_NFT_LEGACY_VERSION = 2;

function readI128FromViewOld(view: DataView, offset: number): bigint {
  const lo = view.getBigUint64(offset, true);
  const hi = view.getBigUint64(offset + 8, true);
  const unsigned = (hi << 64n) | lo;
  const SIGN_BIT = 1n << 127n;
  if (unsigned >= SIGN_BIT) {
    return unsigned - (1n << 128n);
  }
  return unsigned;
}

function parsePositionNftAccountOld(data: Uint8Array) {
  if (data.length < POSITION_NFT_LEGACY_V2_LEN) {
    throw new Error(
      `PositionNft account too small: ${data.length} < ${POSITION_NFT_LEGACY_V2_LEN}`,
    );
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = view.getBigUint64(0, true);
  if (magic !== POSITION_NFT_MAGIC) {
    throw new Error("PositionNft account has invalid magic");
  }
  const version = data[8];
  if (version !== POSITION_NFT_VERSION && version !== POSITION_NFT_LEGACY_VERSION) {
    throw new Error(`PositionNft account has invalid version: ${version}`);
  }
  const isLegacyV2 = version === POSITION_NFT_LEGACY_VERSION;
  if (!isLegacyV2 && data.length < POSITION_NFT_STATE_LEN) {
    throw new Error(
      `PositionNft v3 account too small: ${data.length} < ${POSITION_NFT_STATE_LEN}`,
    );
  }

  const positionOwnerAtMint = new PublicKey(data.subarray(127, 159));

  return {
    version,
    bump: data[9],
    portfolioAccount: new PublicKey(data.subarray(10, 42)),
    nftMint: new PublicKey(data.subarray(42, 74)),
    assetIndex: view.getUint32(74, true),
    sideAtMint: data[78],
    basisPosQAtMint: readI128FromViewOld(view, 79),
    fSnapAtMint: readI128FromViewOld(view, 95),
    marketIdAtMint: view.getBigUint64(111, true),
    epochSnapAtMint: view.getBigUint64(119, true),
    positionOwnerAtMint,
    positionOwner: positionOwnerAtMint,
    mintedAt: view.getBigInt64(159, true),
    lastHolder: new PublicKey(data.subarray(167, 199)),
    portfolioMarketGroup: isLegacyV2 ? null : new PublicKey(data.subarray(199, 231)),
    portfolioIdAtMint: isLegacyV2 ? null : view.getBigUint64(231, true),
    isLegacyV2,
  };
}
// ---- end old code -------------------------------------------------------------------------------

function rng(seed0: number) {
  let s = seed0 >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s;
  };
}

const KEY_OFFSETS = [10, 42, 127, 167, 199];
const I128_OFFSETS = [79, 95];
const U64_OFFSETS = [111, 119, 159, 231];

/** Fill a key with a boundary pattern chosen by `kind`. */
function fillKey(d: Uint8Array, off: number, kind: number, r: () => number): void {
  if (off + 32 > d.length) return;
  const k = d.subarray(off, off + 32);
  switch (kind % 8) {
    case 0: k.fill(0); break;                                         // PublicKey.default
    case 1: k.fill(0xff); break;                                      // max
    case 2: k.fill(0); k[31] = r() & 0xff; break;                     // one low byte
    case 3: k.fill(0); k[0] = 0x80 | (r() & 0x7f); break;             // only top byte
    case 4: { const z = r() % 32; for (let i = 0; i < 32; i++) k[i] = i < z ? 0 : r() & 0xff; break; } // leading zeros
    case 5: { const z = r() % 32; for (let i = 0; i < 32; i++) k[i] = i >= 32 - z ? 0 : r() & 0xff; break; } // trailing zeros
    default: break;                                                   // keep random
  }
}

function fillWide(d: Uint8Array, off: number, width: number, kind: number): void {
  if (off + width > d.length) return;
  const w = d.subarray(off, off + width);
  switch (kind % 6) {
    case 0: w.fill(0); break;
    case 1: w.fill(0xff); break;                                       // -1
    case 2: w.fill(0); w[width - 1] = 0x80; break;                     // most negative
    case 3: w.fill(0xff); w[width - 1] = 0x7f; break;                  // most positive
    case 4: w.fill(0); w[width / 2 - 1] = 0x80; break;                 // bit 63 of the low half (S-3)
    default: break;
  }
}

/** Build case `n`. Buffers sit at a random offset inside a larger ArrayBuffer to exercise byteOffset. */
function makeCase(n: number): Uint8Array {
  const r = rng(0x9e3779b9 ^ Math.imul(n + 1, 0x85ebca6b));
  const pick = r() % 20;
  let len: number;
  if (pick < 8) len = POSITION_NFT_STATE_LEN;
  else if (pick < 14) len = POSITION_NFT_LEGACY_V2_LEN;
  else if (pick < 17) len = POSITION_NFT_STATE_LEN + (r() % 64);      // trailing bytes
  else if (pick < 18) len = POSITION_NFT_LEGACY_V2_LEN + 1 + (r() % (POSITION_NFT_STATE_LEN - POSITION_NFT_LEGACY_V2_LEN - 1)); // 200..238
  else len = r() % (POSITION_NFT_LEGACY_V2_LEN + 1);                  // 0..199
  const pad = r() % 9;
  const host = new Uint8Array(len + pad + (r() % 9));
  for (let i = 0; i < host.length; i++) host[i] = r() & 0xff;
  const d = host.subarray(pad, pad + len);
  if (len >= 9) {
    const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
    const m = r() % 50;
    v.setBigUint64(0, m === 0 ? POSITION_NFT_MAGIC ^ 1n : POSITION_NFT_MAGIC, true);
    const vv = r() % 50;
    d[8] = vv === 0 ? r() & 0xff : vv % 2 ? 3 : 2;
    if (len < POSITION_NFT_STATE_LEN && len !== POSITION_NFT_LEGACY_V2_LEN && r() % 2) d[8] = 3; // v3 too short
  }
  for (const off of KEY_OFFSETS) fillKey(d, off, r(), r);
  for (const off of I128_OFFSETS) fillWide(d, off, 16, r());
  for (const off of U64_OFFSETS) fillWide(d, off, 8, r());
  return n % 7 === 0 ? Buffer.from(d.buffer, d.byteOffset, d.byteLength) : d;
}

/**
 * First difference between two values, or null if identical. Used instead of node's isDeepStrictEqual,
 * which costs ~5 ms per parsed result here. Checks: same prototype, same own keys
 * in the same order, `===` on primitives (bigint included), and element-by-element on arrays, which
 * reaches each PublicKey's bn.js `words` / `length` / `negative` / `red`.
 */
function firstDiff(a: unknown, b: unknown, path = "$"): string | null {
  if (a === b) return null;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return `${path}: ${String(a)} !== ${String(b)}`;
  }
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return `${path}: prototype differs`;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    if (a.length !== bb.length) return `${path}.length: ${a.length} !== ${bb.length}`;
    for (let i = 0; i < a.length; i++) {
      if (!(i in a) !== !(i in bb)) return `${path}[${i}]: hole differs`;
      const d = firstDiff(a[i], bb[i], `${path}[${i}]`);
      if (d) return d;
    }
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.join() !== kb.join()) return `${path}: keys [${ka.join()}] !== [${kb.join()}]`;
  for (const k of ka) {
    const d = firstDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
    if (d) return d;
  }
  return null;
}

type Outcome = { ok: true; value: unknown } | { ok: false; message: string };
function run(f: (d: Uint8Array) => unknown, d: Uint8Array): Outcome {
  try {
    return { ok: true, value: f(d) };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

describe("parsePositionNftAccount: new == old on 5,000 seeded buffers", () => {
  it("deep-strict-equal results (or identical errors) for every case", () => {
    const N = 5000;
    let parsed = 0;
    let legacy = 0;
    let threw = 0;
    let negI128 = 0;
    let zeroKey = 0;
    for (let n = 0; n < N; n++) {
      const d = makeCase(n);
      const before = Uint8Array.from(d);
      const a = run(parsePositionNftAccountOld, d);
      const b = run(parsePositionNftAccount, d);
      const diff = firstDiff(a, b);
      if (diff !== null) throw new Error(`case ${n} (len ${d.length}): ${diff}`);
      if (Buffer.compare(Buffer.from(d.buffer, d.byteOffset, d.byteLength), Buffer.from(before)) !== 0) {
        throw new Error(`case ${n}: parser mutated its input`);
      }
      if (a.ok && b.ok) {
        parsed++;
        const o = a.value as Awaited<ReturnType<typeof parsePositionNftAccountOld>>;
        const nw = b.value as Awaited<ReturnType<typeof parsePositionNftAccountOld>>;
        if (o.isLegacyV2) legacy++;
        if (o.basisPosQAtMint < 0n || o.fSnapAtMint < 0n) negI128++;
        if (o.portfolioAccount.equals(PublicKey.default)) zeroKey++;
        if (n % 10 !== 0) continue;
        // spot check (every 10th case): the new keys behave as PublicKeys, not just look like them
        expect(nw.portfolioAccount).toBeInstanceOf(PublicKey);
        expect(nw.nftMint.toBase58()).toBe(o.nftMint.toBase58());
        expect(nw.lastHolder.equals(o.lastHolder)).toBe(true);
        expect(Buffer.compare(Buffer.from(nw.positionOwner.toBytes()), Buffer.from(d.subarray(127, 159)))).toBe(0);
        expect(nw.positionOwner).toBe(nw.positionOwnerAtMint);
        if (nw.portfolioMarketGroup) expect(nw.portfolioMarketGroup.toBuffer().equals(Buffer.from(d.subarray(199, 231)))).toBe(true);
      } else {
        threw++;
      }
    }
    // the corpus actually covers every branch
    expect(parsed + threw).toBe(N);
    expect(parsed).toBeGreaterThan(3000);
    expect(legacy).toBeGreaterThan(1000);
    expect(parsed - legacy).toBeGreaterThan(1000);
    expect(threw).toBeGreaterThan(200);
    expect(negI128).toBeGreaterThan(500);
    expect(zeroKey).toBeGreaterThan(100);
  }, 60_000); // 5,000 cases x two parsers; ~8 s on a loaded 14-core mini

  it("fixed boundary keys round-trip through the parser identically", () => {
    const keys = [
      new Uint8Array(32),
      new Uint8Array(32).fill(0xff),
      Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? 1 : 0)),
      Uint8Array.from({ length: 32 }, (_, i) => (i === 0 ? 0x80 : 0)),
      PublicKey.default.toBytes(),
      new PublicKey("Sysvar1nstructions1111111111111111111111111").toBytes(),
    ];
    for (const k of keys) {
      const d = new Uint8Array(POSITION_NFT_STATE_LEN);
      new DataView(d.buffer).setBigUint64(0, POSITION_NFT_MAGIC, true);
      d[8] = 3;
      for (const off of KEY_OFFSETS) d.set(k, off);
      const a = parsePositionNftAccountOld(d);
      const b = parsePositionNftAccount(d);
      expect(firstDiff(a, b)).toBeNull();
      expect(b.portfolioAccount.toBase58()).toBe(new PublicKey(k).toBase58());
    }
  });

  it("the comparator catches a one-word BN difference, a key-order difference and a bigint difference", () => {
    const d = new Uint8Array(POSITION_NFT_STATE_LEN);
    new DataView(d.buffer).setBigUint64(0, POSITION_NFT_MAGIC, true);
    d[8] = 3;
    const a = parsePositionNftAccount(d);
    const b = parsePositionNftAccount(d);
    expect(firstDiff(a, b)).toBeNull();
    (b.nftMint as unknown as { _bn: { words: number[] } })._bn.words[3] = 1;
    expect(firstDiff(a, b)).toMatch(/nftMint\._bn\.words\[3\]/);
    const { version, ...rest } = parsePositionNftAccount(d);
    expect(firstDiff(a, { ...rest, version })).toMatch(/keys/);
    expect(firstDiff(a, { ...parsePositionNftAccount(d), mintedAt: 1n })).toMatch(/mintedAt/);
  });
});
