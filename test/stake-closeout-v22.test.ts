/**
 * Stake close-out rule (percolator-stake `feat/v22-stake-closeout-split` 3e39e14; ledger R3.3): the pure split mirror, the pool decoders
 * (seed 457..464 + flag 333 bit 0, unclaimed 281..288 + 334, forwarded 448 + 464) and the tag 19 / tag 29 account lists.
 * Vectors are lifted from `math.rs::test_closeout_creator_share` and `tests/closeout_split.rs`.
 */
import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import { closeoutCreatorShare, closeoutSplit, decodeStakePoolV5, bindInsuranceAuthorityAccounts, recoverTerminalInsuranceAccounts } from "../src/index.js";

const U64 = (1n << 64n) - 1n;
const pk = () => Keypair.generate().publicKey;

describe("closeoutCreatorShare / closeoutSplit (Rust test_closeout_creator_share)", () => {
  const split = (surplus: bigint, seed: bigint, forwarded: bigint, released: bigint | undefined, real: boolean) =>
    closeoutSplit({ surplus, seed, forwarded, ...(released === undefined ? {} : { creatorClassReleased: released }), hasRealStakers: real });
  it("seed intact, fund grew: creator exactly the seed, growth to the stakers", () => {
    expect(closeoutCreatorShare(7_000_000n, 5_000_000n, 0n)).toBe(5_000_000n);
    expect(split(7_000_000n, 5_000_000n, 0n, undefined, true)).toEqual({ creator: 5_000_000n, stakers: 2_000_000n, unclaimed: 0n });
  });
  it("fund below the seed: creator gets what is left, stakers 0", () => {
    expect(split(3_000_000n, 5_000_000n, 0n, undefined, true)).toEqual({ creator: 3_000_000n, stakers: 0n, unclaimed: 0n });
  });
  it("zero real stakers: creator capped at the seed, the rest is unclaimed; never the creator's", () => {
    expect(split(7_600n, 5_000n, 0n, undefined, false)).toEqual({ creator: 5_000n, stakers: 0n, unclaimed: 2_600n });
    expect(split(7_600n, 0n, 0n, undefined, false)).toEqual({ creator: 0n, stakers: 0n, unclaimed: 7_600n }); // no seed recorded
    expect(split(7_600n, 0n, 0n, undefined, true)).toEqual({ creator: 0n, stakers: 7_600n, unclaimed: 0n });
    // negative control: the f372fa2 rule would give the creator 7_600 here
    expect(split(7_600n, 5_000n, 0n, undefined, false).creator).not.toBe(7_600n);
  });
  it("partial calls never exceed the seed", () => {
    const c1 = closeoutCreatorShare(3_000_000n, 5_000_000n, 0n);
    const c2 = closeoutCreatorShare(4_000_000n, 5_000_000n, c1);
    expect([c1, c2]).toEqual([3_000_000n, 2_000_000n]);
    expect(closeoutCreatorShare(U64, 5_000_000n, 5_000_000n)).toBe(0n);
    expect(closeoutCreatorShare(U64, 5_000_000n, U64)).toBe(0n);
  });
  it("unitised first-loss: the creator class released caps it", () => {
    expect(closeoutCreatorShare(9_000_000n, 5_000_000n, 0n, 4_000_000n)).toBe(4_000_000n);
    expect(closeoutCreatorShare(9_000_000n, 5_000_000n, 0n, 6_000_000n)).toBe(5_000_000n);
    expect(closeoutCreatorShare(9_000_000n, 5_000_000n, 0n, 0n)).toBe(0n);
    expect(closeoutCreatorShare(1n, 5_000_000n, 0n, 6_000_000n)).toBe(1n);
    expect(split(U64, U64, 0n, undefined, true)).toEqual({ creator: U64, stakers: 0n, unclaimed: 0n });
  });
  // Exact values from Rust `closeout_creator_share` / `closeout_split`, checked against percolator-stake 53f5480 (the stake ref the
  // rc23 prog pins; src/math.rs:592-603, 655-670), which is newer than the 3e39e14 named in the header.
  // The grid below only checks invariants, and paying the creator 0 instead of 1 satisfies all of them.
  it("one atom of room left: forwarded = seed - 1 pays the creator exactly 1", () => {
    expect(closeoutCreatorShare(7_600n, 5_000n, 4_999n)).toBe(1n);
    expect(split(7_600n, 5_000n, 4_999n, undefined, true)).toEqual({ creator: 1n, stakers: 7_599n, unclaimed: 0n });
    expect(split(7_600n, 5_000n, 4_999n, undefined, false)).toEqual({ creator: 1n, stakers: 0n, unclaimed: 7_599n });
    // differential vector vs the Rust oracle (a `room` check of entitled > forwarded + 1 pays 0 here)
    expect(split(86_065_143_909n, 86_065_143_910n, 86_065_143_909n, undefined, false)).toEqual({ creator: 1n, stakers: 0n, unclaimed: 86_065_143_908n });
  });
  it("closeoutSplit passes creatorClassReleased through: the released cap applies on the split path too", () => {
    expect(split(9_000_000n, 5_000_000n, 0n, 4_000_000n, true)).toEqual({ creator: 4_000_000n, stakers: 5_000_000n, unclaimed: 0n });
    expect(split(9_000_000n, 5_000_000n, 0n, 0n, false)).toEqual({ creator: 0n, stakers: 0n, unclaimed: 9_000_000n });
    // differential vector vs the Rust oracle: min(seed 13, released 1) - forwarded 2 saturates to 0 (dropping released pays 11)
    expect(split(12n, 13n, 2n, 1n, false)).toEqual({ creator: 0n, stakers: 0n, unclaimed: 12n });
  });
  // The grid proves, for every (surplus, seed, forwarded, creatorClassReleased, hasRealStakers):
  //   1. conservation: creator + stakers + unclaimed === surplus
  //   2. exclusivity: stakers === 0 || unclaimed === 0
  //   3. creator <= seed
  //   4. if forwarded <= seed: forwarded + creator <= seed (partial calls never exceed the seed)
  // Boundary values (0, 1, seed-1, seed, seed+1, a mid value, U64-1, U64) cover every comparison edge; a seeded
  // (deterministic) random sample over the full u64 range adds interior points. Violations are collected with plain
  // checks and asserted once: ~4k per-iteration expect() calls made this test time out under load.
  const check = (surplus: bigint, seed: bigint, fw: bigint, rel: bigint | undefined, real: boolean, bad: string[]) => {
    const r = split(surplus, seed, fw, rel, real);
    const tag = `${surplus}/${seed}/${fw}/${rel}/${real}`;
    if (r.creator + r.stakers + r.unclaimed !== surplus) bad.push(`conservation ${tag}`);
    if (r.stakers !== 0n && r.unclaimed !== 0n) bad.push(`exclusivity ${tag}`);
    if (r.creator > seed) bad.push(`creator>seed ${tag}`);
    if (fw <= seed && fw + r.creator > seed) bad.push(`fw+creator>seed ${tag}`);
  };
  it("conservation and exclusivity on a boundary grid", () => {
    const vals = [0n, 1n, 4_999n, 5_000n, 5_001n, 1_000_000n, U64 - 1n, U64];
    const bad: string[] = [];
    for (const surplus of vals) for (const seed of vals) for (const fw of vals) for (const rel of [undefined, 0n, 3_000n, U64]) for (const real of [true, false]) {
      check(surplus, seed, fw, rel, real, bad);
    }
    expect(bad).toEqual([]);
  });
  it("conservation and exclusivity on a seeded random sample", () => {
    let st = 0x9e3779b97f4a7c15n;
    const next = () => { st = (st * 6364136223846793005n + 1442695040888963407n) & U64; return st >> 32n; }; // LCG, deterministic; high 32 bits (low bits of a 2^64 LCG are periodic)
    const next64 = () => (next() << 32n) | next();
    const pick = () => { const m = next() % 4n; const x = next64(); return m === 0n ? x % 10_000n : m === 1n ? x : m === 2n ? U64 - (x % 10n) : x % 1_000_000_000n; };
    const bad: string[] = [];
    for (let i = 0; i < 2000; i++) {
      const rel = next() % 3n === 0n ? undefined : pick();
      check(pick(), pick(), pick(), rel, (next() & 1n) === 0n, bad);
    }
    expect(bad).toEqual([]);
  });
});

function pool(over: (d: Uint8Array, v: DataView) => void = () => undefined): Uint8Array {
  const d = new Uint8Array(480);
  const v = new DataView(d.buffer);
  d.set(Buffer.from("SPOOL_V1"), 320); d[328] = 5; d[408] = 2;
  over(d, v);
  return d;
}

describe("StakePoolV5 close-out decoders", () => {
  it("seed u56 at 457..464 is valid only when byte 333 bit 0 is set", () => {
    const seedBytes = [0x40, 0x4b, 0x4c, 0, 0, 0, 0x01]; // 5_000_000 + 2^48
    const withFlag = decodeStakePoolV5(pool((d) => { d.set(seedBytes, 457); d[333] = 1; }));
    expect(withFlag.creatorSeedAtoms).toBe(5_000_000n + (1n << 48n));
    const noFlag = decodeStakePoolV5(pool((d) => { d.set(seedBytes, 457); }));
    expect(noFlag.creatorSeedAtoms).toBeNull(); // bytes without the flag are not a seed (Rust closeout_no_seed_record_creator_owed_nothing)
    expect(decodeStakePoolV5(pool((d) => { d[333] = 0xfe; d.set(seedBytes, 457); })).creatorSeedAtoms).toBeNull();
    expect(decodeStakePoolV5(pool((d) => { d[333] = 3; })).creatorSeedAtoms).toBe(0n);
  });
  it("unclaimed is a full u64: low 7 bytes at 281..288, high byte at 334", () => {
    const p = decodeStakePoolV5(pool((d) => { d.set([1, 2, 3, 4, 5, 6, 7], 281); d[334] = 0x9a; }));
    expect(p.unclaimedAtoms).toBe(0x9a07060504030201n);
    expect(decodeStakePoolV5(pool()).unclaimedAtoms).toBe(0n);
    expect(decodeStakePoolV5(pool((d) => { d.fill(0xff, 281, 288); d[334] = 0xff; })).unclaimedAtoms).toBe(U64);
  });
  it("forwarded = u64 @448 + u64 @464 (saturating); the S2 backlog @472 is informational", () => {
    const p = decodeStakePoolV5(pool((_d, v) => { v.setBigUint64(448, 7n, true); v.setBigUint64(464, 123n, true); v.setBigUint64(472, 45n, true); }));
    expect([p.creatorForwardedAtoms, p.creatorSurplusForwardedAtoms, p.creatorTotalForwardedAtoms, p.s2BacklogOwedAtoms]).toEqual([7n, 123n, 130n, 45n]);
    const sat = decodeStakePoolV5(pool((_d, v) => { v.setBigUint64(448, U64, true); v.setBigUint64(464, 5n, true); }));
    expect(sat.creatorTotalForwardedAtoms).toBe(U64);
  });
});

describe("account lists", () => {
  it("tag 19 BindInsuranceAuthority: pool (index 1) writable", () => {
    const keys = bindInsuranceAuthorityAccounts({ admin: pk(), poolPda: pk(), vaultAuth: pk(), slab: pk(), percolatorProgram: pk() });
    expect(keys.map((k) => [k.isSigner, k.isWritable])).toEqual([[true, false], [false, true], [false, false], [false, true], [false, false]]);
  });
  it("tag 29: the creator token account is passed (FEE_ONLY after stray, first-loss at [10])", () => {
    const base = { caller: pk(), pool: pk(), poolVault: pk(), vaultAuth: pk(), market: pk(), wrapperVault: pk(), wrapperVaultAuthority: pk(), wrapperProgram: pk() };
    const creatorToken = pk();
    const fo = recoverTerminalInsuranceAccounts({ ...base, creatorToken });
    expect(fo).toHaveLength(10);
    expect(fo[9]!.pubkey.equals(creatorToken) && fo[9]!.isWritable).toBe(true);
    const fl = recoverTerminalInsuranceAccounts({ ...base, creatorToken, insuranceUnits: pk() });
    expect(fl[10]!.pubkey.equals(creatorToken)).toBe(true);
    expect(() => recoverTerminalInsuranceAccounts({ ...base, insuranceUnits: pk() })).toThrow(/creatorToken/);
  });
});
