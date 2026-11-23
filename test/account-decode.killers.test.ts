/**
 * Mutation killers for test/account-decode.test.ts, drafted by J-20261123-SDK-REPORT-ACCOUNTDECODETESTMUT
 * and landed by J-20261123-SDK-FIX-V1DENGINEOFFSETS (21 tests). One draft test was changed: it
 * pinned the V1D vault at abs 424, which is config, not engine (see the V1D block below).
 *
 * The captured devnet StakePool/StakeDeposit fixtures predate the discriminator, so the current
 * file only proves they are REFUSED; no field read in decodeStakePool/decodeDepositPda runs.
 * These tests take the captured bytes, stamp the discriminator and version the current program
 * writes, and pin the decoded money fields against the fixture's own expected_decoded.
 * Discriminator bytes are typed out here, not imported, so a constant mutant cannot hide.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { decodeStakePool, decodeDepositPda } from "../src/solana/stake.js";
import { parsePositionNftAccount } from "../src/abi/nft.js";
import { parseHeader, parseConfig, parseEngine } from "../src/solana/slab.js";

interface Fx {
  account_address: string;
  data_base64: string;
  total_data_length?: number;
  expected_decoded: Record<string, unknown>;
}
const FIX_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "fixtures", "accounts");
const load = (name: string): Fx => JSON.parse(readFileSync(resolve(FIX_DIR, name), "utf8")) as Fx;
const raw = (f: Fx): Uint8Array => new Uint8Array(Buffer.from(f.data_base64, "base64"));

// "SPOOL_V1" and "SDEP_V1\0" in ASCII.
const SPOOL_V1 = [0x53, 0x50, 0x4f, 0x4f, 0x4c, 0x5f, 0x56, 0x31];
const SDEP_V1 = [0x53, 0x44, 0x45, 0x50, 0x5f, 0x56, 0x31, 0x00];
const U64_MAX = (1n << 64n) - 1n;

function putU64(d: Uint8Array, off: number, v: bigint): void {
  new DataView(d.buffer, d.byteOffset, d.byteLength).setBigUint64(off, v, true);
}
function putI64(d: Uint8Array, off: number, v: bigint): void {
  new DataView(d.buffer, d.byteOffset, d.byteLength).setBigInt64(off, v, true);
}

// ---------------------------------------------------------------------------
// StakePool
// ---------------------------------------------------------------------------

const poolFx = load("devnet-stake-pool.json");
const poolEx = poolFx.expected_decoded;

/** Captured pool header (bytes 0..288, shared by every version) + discriminator/version at 320. */
function stampedPool(len: number, version: number): Uint8Array {
  const d = new Uint8Array(len);
  d.set(raw(poolFx).subarray(0, 288), 0);
  d.set(SPOOL_V1, 320);
  d[328] = version;
  return d;
}

describe("account-decode killers: StakePool (captured bytes + v2 discriminator)", () => {
  it("decodes the captured money fields of a 384-byte v2 pool", () => {
    const p = decodeStakePool(stampedPool(384, 2));
    expect(p.version).toBe(2);
    expect(p.isInitialized).toBe(poolEx["isInitialized"]);
    expect(p.bump).toBe(poolEx["bump"]);
    expect(p.vaultAuthorityBump).toBe(poolEx["vaultAuthorityBump"]);
    expect(p.adminTransferred).toBe(poolEx["adminTransferred"]);
    expect(p.slab.toBase58()).toBe(poolEx["slab"]);
    expect(p.admin.toBase58()).toBe(poolEx["admin"]);
    expect(p.collateralMint.toBase58()).toBe(poolEx["collateralMint"]);
    expect(p.lpMint.toBase58()).toBe(poolEx["lpMint"]);
    expect(p.vault.toBase58()).toBe(poolEx["vault"]);
    expect(p.totalDeposited).toBe(BigInt(poolEx["totalDeposited"] as string));
    expect(p.totalLpSupply).toBe(BigInt(poolEx["totalLpSupply"] as string));
    expect(p.cooldownSlots).toBe(BigInt(poolEx["cooldownSlots"] as string));
    expect(p.depositCap).toBe(BigInt(poolEx["depositCap"] as string));
    expect(p.totalFlushed).toBe(BigInt(poolEx["totalFlushed"] as string));
    expect(p.totalReturned).toBe(BigInt(poolEx["totalReturned"] as string));
    expect(p.totalWithdrawn).toBe(BigInt(poolEx["totalWithdrawn"] as string));
    expect(p.poolMode).toBe(poolEx["poolMode"]);
    expect(p.marketResolved).toBe(poolEx["marketResolved"]);
    expect(p.hwmEnabled).toBe(poolEx["hwmEnabled"]);
    expect(p.hwmFloorBps).toBe(poolEx["hwmFloorBps"]);
    expect(p.pendingAdmin).toBeNull();
    expect(p.totalRecoveredFromWrapper).toBeNull();
  });

  it("refuses a v2-sized pool that carries any version other than 2", () => {
    for (const v of [0, 1, 3, 4]) {
      expect(() => decodeStakePool(stampedPool(384, v))).toThrow(/StakePool unsupported version/);
    }
  });

  it("refuses a pool shorter than the v1 size before looking for a discriminator", () => {
    expect(() => decodeStakePool(stampedPool(384, 2).subarray(0, 351))).toThrow(/StakePool data too short/);
  });

  it("refuses the pool if any single discriminator byte is wrong", () => {
    for (let i = 0; i < 8; i += 1) {
      const d = stampedPool(384, 2);
      d[320 + i] ^= 0xff;
      expect(() => decodeStakePool(d), `byte ${i}`).toThrow(/StakePool invalid discriminator/);
    }
  });

  it("reads u64 balances unsigned (u64::MAX stays positive)", () => {
    const d = stampedPool(384, 2);
    putU64(d, 168, U64_MAX); // total_deposited
    expect(decodeStakePool(d).totalDeposited).toBe(U64_MAX);
  });

  it("v2 keeps pending_admin, so _reserved fields stay at 320+ (junior balance, hwm flag)", () => {
    const d = stampedPool(384, 2);
    d.fill(7, 288, 320); // pending_admin
    d[320 + 10] = 1; // hwm_enabled
    putU64(d, 320 + 33, 12_345n); // junior_balance
    const p = decodeStakePool(d);
    expect(p.pendingAdmin).not.toBeNull();
    expect(p.hwmEnabled).toBe(true);
    expect(p.juniorBalance).toBe(12_345n);
  });

  it("v3 (392 B) exposes totalRecoveredFromWrapper at 384", () => {
    const d = stampedPool(392, 3);
    putU64(d, 384, 99n);
    expect(decodeStakePool(d).totalRecoveredFromWrapper).toBe(99n);
  });

  it("v4 (408 B) is decoded as v4 and reads the cooldown timelock at 392/400, not the aliased v3 slot", () => {
    const d = stampedPool(408, 4);
    putU64(d, 384, 99n);
    putU64(d, 392, 77n);
    putU64(d, 400, 88n);
    const p = decodeStakePool(d);
    expect(p.version).toBe(4);
    expect(p.totalRecoveredFromWrapper).toBe(99n);
    expect(p.pendingCooldownSlots).toBe(77n);
    expect(p.cooldownProposedAtSlot).toBe(88n);
  });
});

// ---------------------------------------------------------------------------
// StakeDeposit
// ---------------------------------------------------------------------------

const depFx = load("devnet-stake-deposit.json");
const depEx = depFx.expected_decoded;

function stampedDeposit(): Uint8Array {
  const d = raw(depFx).slice();
  d.set(SDEP_V1, 88);
  return d;
}

describe("account-decode killers: StakeDeposit (captured bytes + discriminator)", () => {
  it("decodes the captured deposit (lp_amount at 80, not the slot at 72)", () => {
    const s = decodeDepositPda(stampedDeposit());
    expect(s.isInitialized).toBe(depEx["isInitialized"]);
    expect(s.bump).toBe(depEx["bump"]);
    expect(s.pool.toBase58()).toBe(depEx["pool"]);
    expect(s.user.toBase58()).toBe(depEx["user"]);
    expect(s.lastDepositSlot).toBe(BigInt(depEx["lastDepositSlot"] as string));
    expect(s.lpAmount).toBe(BigInt(depEx["lpAmount"] as string));
  });

  it("reads lp_amount as an unsigned u64", () => {
    const d = stampedDeposit();
    putU64(d, 80, U64_MAX);
    expect(decodeDepositPda(d).lpAmount).toBe(U64_MAX);
  });

  it("refuses a 151-byte deposit", () => {
    expect(() => decodeDepositPda(stampedDeposit().subarray(0, 151))).toThrow(/StakeDeposit data too short/);
  });

  it("refuses the deposit if any single discriminator byte is wrong", () => {
    for (let i = 0; i < 8; i += 1) {
      const d = stampedDeposit();
      d[88 + i] ^= 0xff;
      expect(() => decodeDepositPda(d), `byte ${i}`).toThrow(/StakeDeposit invalid discriminator/);
    }
  });

  it("treats only is_initialized == 1 as initialized", () => {
    const d = stampedDeposit();
    d[0] = 2;
    expect(decodeDepositPda(d).isInitialized).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PositionNft
// ---------------------------------------------------------------------------

describe("account-decode killers: PositionNft (v3 fixture)", () => {
  // eslint-disable-next-line no-useless-concat
  const nft = () => raw(load("main" + "net-nft-position-v3.json")).slice();

  it("refuses a bad magic", () => {
    const d = nft();
    d[0] ^= 0xff;
    expect(() => parsePositionNftAccount(d)).toThrow(/invalid magic/);
  });

  it("refuses an unknown version", () => {
    const d = nft();
    d[8] = 9;
    expect(() => parsePositionNftAccount(d)).toThrow(/invalid version: 9/);
  });

  it("refuses a truncated v3 account", () => {
    expect(() => parsePositionNftAccount(nft().subarray(0, 238))).toThrow(/v3 account too small/);
  });

  it("reads mintedAt as signed i64", () => {
    const d = nft();
    putI64(d, 159, -1n);
    expect(parsePositionNftAccount(d).mintedAt).toBe(-1n);
  });
});

// ---------------------------------------------------------------------------
// Slab V1D: magic, header width, config signedness, engine vault
// ---------------------------------------------------------------------------

describe("account-decode killers: wrapper slab V1D", () => {
  const fx = load("devnet-wrapper-slab-v1d.json");
  const slab = (): Uint8Array => {
    const d = new Uint8Array(fx.total_data_length!);
    d.set(raw(fx), 0);
    return d;
  };

  it("parseHeader and parseEngine refuse a bad magic", () => {
    const d = slab();
    d[0] ^= 0xff;
    expect(() => parseHeader(d)).toThrow(/Invalid slab magic/);
    expect(() => parseEngine(d)).toThrow(/invalid slab magic/);
  });

  it("reads the header version as a u32", () => {
    const d = slab();
    d[9] = 1; // version = 0x0101 = 257
    expect(parseHeader(d).version).toBe(257);
  });

  it("reads config i64 fields signed (funding_max_premium_bps at config+144)", () => {
    const d = slab();
    putI64(d, 104 + 144, -7n);
    expect(parseConfig(d).fundingMaxPremiumBps).toBe(-7n);
  });

  // The draft pinned vault = 1_000_000 read at abs 424. That word is config.authority_price_e6
  // (prog f7a2e8ab CONFIG_LEN = 352), not the engine. The engine starts at abs 456 and its vault
  // is 0 on this slab, so pin a sentinel at abs 456 instead.
  it("reads the engine vault at engine+0 (abs 456), not the config tail at 424", () => {
    expect(parseEngine(slab()).vault).toBe(0n);
    const d = slab();
    d.set([0x15, 0xcd, 0x5b, 0x07], 456); // 123_456_789
    expect(parseEngine(d).vault).toBe(123_456_789n);
  });
});
