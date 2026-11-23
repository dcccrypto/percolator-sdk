/**
 * Differential decode test: parsePositionNftAccount / isNftCurrentForPortfolio vs. an independent
 * encoder written from the percolator-nft Rust struct `PositionNftV16`
 * (dcccrypto/percolator-nft src/state_v16.rs, branch fix/v22-audit-1017-s1-2-nft-incarnation @
 * 95dcece4; identical struct on devnet/v22-fresh-ids @ b22280c1, the v2.2 devnet program 27LWmR72…).
 *
 * Rust layout: #[repr(C)] Pod, align 1, NO padding, NO Option fields (the SDK's null for legacy v2
 * is a length/version concept, not an on-wire Option). All ints are V16Pod* little-endian:
 *   magic u64 @0 | version u8 @8 | bump u8 @9 | portfolio_account [32] @10 | nft_mint [32] @42 |
 *   asset_index u32 @74 | side_at_mint u8 @78 | basis_pos_q_at_mint i128 @79 | f_snap_at_mint i128 @95 |
 *   market_id_at_mint u64 @111 | epoch_snap_at_mint u64 @119 | position_owner_at_mint [32] @127 |
 *   minted_at i64 @159 | last_holder [32] @167 | portfolio_market_group [32] @199 |
 *   portfolio_id_at_mint u64 @231 | total 239. Layout v2 (199 B) = first 199 bytes, version 2.
 *
 * Offsets are accumulated from field widths (not hard-coded) so a drift in either side shows up.
 * Tests only; seeded PRNG so failures are reproducible.
 */
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  isNftCurrentForPortfolio,
  parsePositionNftAccount,
  POSITION_NFT_LEGACY_V2_LEN,
  POSITION_NFT_STATE_LEN,
} from "../src/abi/nft.js";

// ---- seeded PRNG (xorshift128+ style via splitmix64 seeding), deterministic ----
function makeRng(seed: bigint) {
  let s = seed & 0xffff_ffff_ffff_ffffn;
  const M = 0xffff_ffff_ffff_ffffn;
  const next64 = (): bigint => {
    s = (s + 0x9e3779b97f4a7c15n) & M;
    let z = s;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & M;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & M;
    return z ^ (z >> 31n);
  };
  return {
    u64: next64,
    below: (n: number) => Number(next64() % BigInt(n)),
    bytes32: (): Uint8Array => {
      const b = new Uint8Array(32);
      for (let i = 0; i < 4; i++) {
        let v = next64();
        for (let j = 0; j < 8; j++) {
          b[i * 8 + j] = Number(v & 0xffn);
          v >>= 8n;
        }
      }
      return b;
    },
  };
}

// Edge-biased integer picks so sign bits / boundaries are hit often.
function pickU(r: ReturnType<typeof makeRng>, bits: number): bigint {
  const max = (1n << BigInt(bits)) - 1n;
  switch (r.below(6)) {
    case 0: return 0n;
    case 1: return max;
    case 2: return 1n << BigInt(bits - 1);
    case 3: return (1n << BigInt(bits - 1)) - 1n;
    default: {
      let v = 0n;
      for (let i = 0; i < Math.ceil(bits / 64); i++) v = (v << 64n) | r.u64();
      return v & max;
    }
  }
}
const toSigned = (u: bigint, bits: number): bigint =>
  u >= 1n << BigInt(bits - 1) ? u - (1n << BigInt(bits)) : u;

// ---- the Rust struct, as ordered (name, width) fields ----
const FIELDS = [
  ["magic", 8],
  ["version", 1],
  ["bump", 1],
  ["portfolio_account", 32],
  ["nft_mint", 32],
  ["asset_index", 4],
  ["side_at_mint", 1],
  ["basis_pos_q_at_mint", 16],
  ["f_snap_at_mint", 16],
  ["market_id_at_mint", 8],
  ["epoch_snap_at_mint", 8],
  ["position_owner_at_mint", 32],
  ["minted_at", 8],
  ["last_holder", 32],
  ["portfolio_market_group", 32],
  ["portfolio_id_at_mint", 8],
] as const;

const OFF: Record<string, number> = {};
{
  let o = 0;
  for (const [n, w] of FIELDS) {
    OFF[n] = o;
    o += w;
  }
  OFF.__total = o;
}

interface Raw {
  version: number;
  bump: number;
  portfolio_account: Uint8Array;
  nft_mint: Uint8Array;
  asset_index: bigint; // u32
  side_at_mint: number;
  basis_u: bigint; // u128 bit pattern
  fsnap_u: bigint;
  market_id: bigint;
  epoch_snap: bigint;
  position_owner: Uint8Array;
  minted_u: bigint; // u64 bit pattern of i64
  last_holder: Uint8Array;
  pmg: Uint8Array;
  pid: bigint;
}

function putLE(buf: Uint8Array, off: number, v: bigint, width: number) {
  for (let i = 0; i < width; i++) {
    buf[off + i] = Number(v & 0xffn);
    v >>= 8n;
  }
}

function encode(raw: Raw, len: number): Uint8Array {
  const buf = new Uint8Array(len);
  putLE(buf, OFF.magic, 0x5045_5243_4e46_5400n, 8);
  buf[OFF.version] = raw.version;
  buf[OFF.bump] = raw.bump;
  buf.set(raw.portfolio_account, OFF.portfolio_account);
  buf.set(raw.nft_mint, OFF.nft_mint);
  putLE(buf, OFF.asset_index, raw.asset_index, 4);
  buf[OFF.side_at_mint] = raw.side_at_mint;
  putLE(buf, OFF.basis_pos_q_at_mint, raw.basis_u, 16);
  putLE(buf, OFF.f_snap_at_mint, raw.fsnap_u, 16);
  putLE(buf, OFF.market_id_at_mint, raw.market_id, 8);
  putLE(buf, OFF.epoch_snap_at_mint, raw.epoch_snap, 8);
  buf.set(raw.position_owner, OFF.position_owner_at_mint);
  putLE(buf, OFF.minted_at, raw.minted_u, 8);
  buf.set(raw.last_holder, OFF.last_holder);
  if (len >= OFF.__total) {
    buf.set(raw.pmg, OFF.portfolio_market_group);
    putLE(buf, OFF.portfolio_id_at_mint, raw.pid, 8);
  }
  return buf;
}

function genRaw(r: ReturnType<typeof makeRng>, version: number): Raw {
  return {
    version,
    bump: r.below(256),
    portfolio_account: r.bytes32(),
    nft_mint: r.bytes32(),
    asset_index: pickU(r, 32),
    side_at_mint: r.below(2),
    basis_u: pickU(r, 128),
    fsnap_u: pickU(r, 128),
    market_id: pickU(r, 64),
    epoch_snap: pickU(r, 64),
    position_owner: r.bytes32(),
    minted_u: pickU(r, 64),
    last_holder: r.bytes32(),
    pmg: r.bytes32(),
    pid: pickU(r, 64),
  };
}

const pk = (b: Uint8Array) => new PublicKey(b);

const CASES = 25_000;
const SEED = 0x2_2d3_7ab_1e_5n;

describe("PositionNft state layout: SDK parser vs Rust PositionNftV16 encoder", { timeout: 180_000 }, () => {
  it("pins the struct offsets/total to the Rust assertions", () => {
    expect(OFF.__total).toBe(239);
    expect(POSITION_NFT_STATE_LEN).toBe(239);
    expect(POSITION_NFT_LEGACY_V2_LEN).toBe(199);
    expect(OFF.last_holder + 32).toBe(199);
  });

  it(`round-trips ${CASES} seeded v3 (239 B) states, every field`, () => {
    const r = makeRng(SEED);
    const mismatches: string[] = [];
    for (let i = 0; i < CASES; i++) {
      const raw = genRaw(r, 3);
      // Sometimes the account buffer is oversized (realloc'd / padded): trailing bytes must be ignored.
      const extra = r.below(4) === 0 ? 1 + r.below(64) : 0;
      const bytes = encode(raw, 239 + extra);
      for (let j = 239; j < bytes.length; j++) bytes[j] = r.below(256);
      // Also exercise a non-zero byteOffset view.
      const pad = r.below(3) === 0 ? 1 + r.below(7) : 0;
      const backing = new Uint8Array(bytes.length + pad);
      backing.set(bytes, pad);
      const view = backing.subarray(pad);

      const s = parsePositionNftAccount(view);
      const got = [
        s.version === 3,
        s.isLegacyV2 === false,
        s.bump === raw.bump,
        s.portfolioAccount.equals(pk(raw.portfolio_account)),
        s.nftMint.equals(pk(raw.nft_mint)),
        s.assetIndex === Number(raw.asset_index),
        s.sideAtMint === raw.side_at_mint,
        s.basisPosQAtMint === toSigned(raw.basis_u, 128),
        s.fSnapAtMint === toSigned(raw.fsnap_u, 128),
        s.marketIdAtMint === raw.market_id,
        s.epochSnapAtMint === raw.epoch_snap,
        s.positionOwnerAtMint.equals(pk(raw.position_owner)),
        s.positionOwner.equals(pk(raw.position_owner)),
        s.mintedAt === toSigned(raw.minted_u, 64),
        s.lastHolder.equals(pk(raw.last_holder)),
        s.portfolioMarketGroup !== null && s.portfolioMarketGroup.equals(pk(raw.pmg)),
        s.portfolioIdAtMint === raw.pid,
      ];
      if (got.some((x) => !x)) mismatches.push(`#${i} fields=${got.map((x, k) => (x ? "" : k)).join(",")}`);
    }
    expect(mismatches.length, mismatches.slice(0, 5).join(" | ")).toBe(0);
  });

  it(`round-trips ${CASES} seeded legacy v2 (199 B) states, every field`, () => {
    const r = makeRng(SEED ^ 0xdeadbeefn);
    const mismatches: string[] = [];
    for (let i = 0; i < CASES; i++) {
      const raw = genRaw(r, 2);
      const bytes = encode(raw, 199);
      const s = parsePositionNftAccount(bytes);
      const got = [
        s.version === 2,
        s.isLegacyV2 === true,
        s.bump === raw.bump,
        s.portfolioAccount.equals(pk(raw.portfolio_account)),
        s.nftMint.equals(pk(raw.nft_mint)),
        s.assetIndex === Number(raw.asset_index),
        s.sideAtMint === raw.side_at_mint,
        s.basisPosQAtMint === toSigned(raw.basis_u, 128),
        s.fSnapAtMint === toSigned(raw.fsnap_u, 128),
        s.marketIdAtMint === raw.market_id,
        s.epochSnapAtMint === raw.epoch_snap,
        s.positionOwnerAtMint.equals(pk(raw.position_owner)),
        s.mintedAt === toSigned(raw.minted_u, 64),
        s.lastHolder.equals(pk(raw.last_holder)),
        s.portfolioMarketGroup === null,
        s.portfolioIdAtMint === null,
      ];
      if (got.some((x) => !x)) mismatches.push(`#${i} fields=${got.map((x, k) => (x ? "" : k)).join(",")}`);
      // A legacy NFT is never current, whatever the live portfolio is.
      expect(isNftCurrentForPortfolio(s, { marketGroupId: pk(raw.pmg), portfolioId: raw.pid })).toBe(false);
    }
    expect(mismatches.length, mismatches.slice(0, 5).join(" | ")).toBe(0);
  });

  it(`isNftCurrentForPortfolio matches the verify_portfolio_incarnation spec over ${CASES} cases`, () => {
    const r = makeRng(SEED ^ 0x1234567n);
    const mismatches: string[] = [];
    for (let i = 0; i < CASES; i++) {
      const raw = genRaw(r, 3);
      // Force id 0 / equal / unequal and group equal / unequal with real frequency.
      const idMode = r.below(4); // 0: live=0, 1: equal, 2: differ, 3: equal (maybe 0 at mint)
      const grpEq = r.below(2) === 0;
      if (idMode === 3) raw.pid = 0n;
      const s = parsePositionNftAccount(encode(raw, 239));
      const liveId = idMode === 0 ? 0n : idMode === 2 ? (raw.pid + 1n) & 0xffff_ffff_ffff_ffffn : raw.pid;
      const liveGrp = grpEq ? raw.pmg : r.bytes32();
      const grpReallyEq = grpEq || Buffer.from(liveGrp).equals(Buffer.from(raw.pmg));
      // Spec: live id non-zero AND id equal AND group equal.
      const expected = liveId !== 0n && liveId === raw.pid && grpReallyEq;
      const got = isNftCurrentForPortfolio(s, { marketGroupId: pk(liveGrp), portfolioId: liveId });
      if (got !== expected) mismatches.push(`#${i} idMode=${idMode} grpEq=${grpEq} got=${got} want=${expected}`);
    }
    expect(mismatches.length, mismatches.slice(0, 5).join(" | ")).toBe(0);
  });

  it("rejects what the Rust verifier rejects: short data, bad magic, bad version, v3 short", () => {
    const r = makeRng(SEED ^ 0x99n);
    const base = genRaw(r, 3);
    expect(() => parsePositionNftAccount(encode(base, 239).subarray(0, 198))).toThrow(/too small/);
    // v3 version byte but only 199..238 bytes
    for (const len of [199, 200, 220, 238]) {
      expect(() => parsePositionNftAccount(encode({ ...base, version: 3 }, len))).toThrow(/v3 account too small/);
    }
    for (const v of [0, 1, 4, 255]) {
      expect(() => parsePositionNftAccount(encode({ ...base, version: v }, 239))).toThrow(/invalid version/);
    }
    const bad = encode(base, 239);
    bad[0] ^= 1;
    expect(() => parsePositionNftAccount(bad)).toThrow(/invalid magic/);
    // v2 version byte in a full 239 B buffer is still parsed as legacy (first 199 B only).
    const v2long = parsePositionNftAccount(encode({ ...base, version: 2 }, 239));
    expect(v2long.isLegacyV2).toBe(true);
    expect(v2long.portfolioIdAtMint).toBeNull();
  });
});
