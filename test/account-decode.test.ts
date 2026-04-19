/**
 * @file account-decode.test.ts
 *
 * Round-trip decode tests against real on-chain account blobs captured from devnet and mainnet.
 *
 * These tests pin SDK decoder stability against actual encoded data, catching layout drift that
 * parity-fixtures.test.ts cannot surface: field encoding inside padded regions, semantic meaning
 * shifts, or off-by-one offsets that happen to land in zero-filled reserved bytes.
 *
 * Fixtures live in fixtures/accounts/*.json. Each fixture has:
 *   - data_base64: the raw account bytes (full for small accounts; prefix for slabs)
 *   - total_data_length: for slab fixtures, the true on-chain length used by detectSlabLayout
 *   - expected_decoded: the key fields a reader would verify after decode
 *
 * Slab fixtures store only the meaningful header+config+engine prefix to keep file sizes small.
 * The test pads the prefix to total_data_length with zeros before calling SDK decoders —
 * the trailing region is the accounts bitmap and user slots, which are empty on devnet slabs.
 *
 * Captured: 2026-04-19 (devnet slot 456513856, mainnet slot 414164554).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";

import {
  parseHeader,
  parseConfig,
  parseEngine,
  detectSlabLayout,
  SLAB_MAGIC,
} from "../src/solana/slab.js";
import {
  decodeStakePool,
  decodeDepositPda,
  STAKE_POOL_SIZE,
  STAKE_DEPOSIT_SIZE,
} from "../src/solana/stake.js";
import {
  parsePositionNftAccount,
  POSITION_NFT_STATE_LEN,
} from "../src/abi/nft.js";

// ---------------------------------------------------------------------------
// Fixture loader
// ---------------------------------------------------------------------------

interface AccountFixture {
  source: string;
  cluster_slot: number;
  captured_at: string;
  program_id: string;
  account_address: string;
  owner: string;
  lamports: number;
  data_base64: string;
  /** For slab fixtures: true total on-chain byte length (prefix is padded to this). */
  total_data_length?: number;
  layout?: string;
  expected_decoded: Record<string, unknown>;
}

function loadFixture(filename: string): AccountFixture {
  const dir = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "fixtures", "accounts");
  return JSON.parse(readFileSync(resolve(dir, filename), "utf8")) as AccountFixture;
}

/**
 * Decode a base64 fixture into a Uint8Array of the correct total length.
 * For slab fixtures, the stored base64 is a prefix; zeros fill the remainder.
 */
function fixtureBytes(f: AccountFixture): Uint8Array {
  const prefix = Buffer.from(f.data_base64, "base64");
  const totalLen = f.total_data_length ?? prefix.length;
  if (prefix.length === totalLen) {
    return new Uint8Array(prefix.buffer, prefix.byteOffset, prefix.byteLength);
  }
  // Pad prefix to correct total length so detectSlabLayout can identify the layout.
  const full = new Uint8Array(totalLen);
  full.set(prefix, 0);
  return full;
}

// ---------------------------------------------------------------------------
// describe: StakePool
// ---------------------------------------------------------------------------

describe("account-decode: StakePool (devnet)", () => {
  const fixture = loadFixture("devnet-stake-pool.json");
  const data = fixtureBytes(fixture);

  it("data length matches STAKE_POOL_SIZE", () => {
    expect(data.length).toBe(STAKE_POOL_SIZE);
  });

  it("decodeStakePool returns correct fields", () => {
    const pool = decodeStakePool(data);
    const ex = fixture.expected_decoded;

    expect(pool.isInitialized).toBe(ex["isInitialized"]);
    expect(pool.bump).toBe(ex["bump"]);
    expect(pool.vaultAuthorityBump).toBe(ex["vaultAuthorityBump"]);
    expect(pool.adminTransferred).toBe(ex["adminTransferred"]);

    expect(pool.slab.toBase58()).toBe(ex["slab"]);
    expect(pool.admin.toBase58()).toBe(ex["admin"]);
    expect(pool.collateralMint.toBase58()).toBe(ex["collateralMint"]);
    expect(pool.lpMint.toBase58()).toBe(ex["lpMint"]);
    expect(pool.vault.toBase58()).toBe(ex["vault"]);

    expect(pool.totalDeposited).toBe(BigInt(ex["totalDeposited"] as string));
    expect(pool.totalLpSupply).toBe(BigInt(ex["totalLpSupply"] as string));
    expect(pool.cooldownSlots).toBe(BigInt(ex["cooldownSlots"] as string));
    expect(pool.depositCap).toBe(BigInt(ex["depositCap"] as string));
    expect(pool.totalFlushed).toBe(BigInt(ex["totalFlushed"] as string));
    expect(pool.totalReturned).toBe(BigInt(ex["totalReturned"] as string));
    expect(pool.totalWithdrawn).toBe(BigInt(ex["totalWithdrawn"] as string));

    expect(pool.poolMode).toBe(ex["poolMode"]);
    expect(pool.marketResolved).toBe(ex["marketResolved"]);
    expect(pool.hwmEnabled).toBe(ex["hwmEnabled"]);
    expect(pool.hwmFloorBps).toBe(ex["hwmFloorBps"]);
  });
});

// ---------------------------------------------------------------------------
// describe: StakeDeposit
// ---------------------------------------------------------------------------

describe("account-decode: StakeDeposit (devnet)", () => {
  const fixture = loadFixture("devnet-stake-deposit.json");
  const data = fixtureBytes(fixture);

  it("data length matches STAKE_DEPOSIT_SIZE", () => {
    expect(data.length).toBe(STAKE_DEPOSIT_SIZE);
  });

  it("decodeDepositPda returns correct fields", () => {
    const deposit = decodeDepositPda(data);
    const ex = fixture.expected_decoded;

    expect(deposit.isInitialized).toBe(ex["isInitialized"]);
    expect(deposit.bump).toBe(ex["bump"]);
    expect(deposit.pool.toBase58()).toBe(ex["pool"]);
    expect(deposit.user.toBase58()).toBe(ex["user"]);
    expect(deposit.lastDepositSlot).toBe(BigInt(ex["lastDepositSlot"] as string));
    expect(deposit.lpAmount).toBe(BigInt(ex["lpAmount"] as string));
  });

  it("deposit.pool matches stake pool account address", () => {
    const deposit = decodeDepositPda(data);
    const poolFixture = loadFixture("devnet-stake-pool.json");
    expect(deposit.pool.toBase58()).toBe(poolFixture.account_address);
  });
});

// ---------------------------------------------------------------------------
// describe: NFT PositionNft
// ---------------------------------------------------------------------------

describe("account-decode: NFT PositionNft (mainnet)", () => {
  const fixture = loadFixture("mainnet-nft-position.json");
  const data = fixtureBytes(fixture);

  it("data length matches POSITION_NFT_STATE_LEN", () => {
    expect(data.length).toBe(POSITION_NFT_STATE_LEN);
  });

  it("parsePositionNftAccount returns correct fields", () => {
    const nft = parsePositionNftAccount(data);
    const ex = fixture.expected_decoded;

    expect(nft.version).toBe(ex["version"]);
    expect(nft.bump).toBe(ex["bump"]);
    expect(nft.slab.toBase58()).toBe(ex["slab"]);
    expect(nft.userIdx).toBe(ex["userIdx"]);
    expect(nft.nftMint.toBase58()).toBe(ex["nftMint"]);
    expect(nft.entryPriceE6).toBe(BigInt(ex["entryPriceE6"] as string));
    expect(nft.positionSize).toBe(BigInt(ex["positionSize"] as string));
    expect(nft.isLong).toBe(ex["isLong"]);
    expect(nft.positionBasisQ).toBe(BigInt(ex["positionBasisQ"] as string));
    expect(nft.lastFundingIndexE18).toBe(BigInt(ex["lastFundingIndexE18"] as string));
    expect(nft.mintedAt).toBe(BigInt(ex["mintedAt"] as string));
    expect(nft.accountId).toBe(BigInt(ex["accountId"] as string));
  });
});

// ---------------------------------------------------------------------------
// describe: Wrapper / Engine Slab (V1D)
// ---------------------------------------------------------------------------

describe("account-decode: Wrapper slab V1D (devnet)", () => {
  const fixture = loadFixture("devnet-wrapper-slab-v1d.json");
  const data = fixtureBytes(fixture);

  it("total data length matches V1D small slab size", () => {
    expect(data.length).toBe(fixture.total_data_length);
    expect(data.length).toBe(65088);
  });

  it("detectSlabLayout recognises V1D layout", () => {
    const layout = detectSlabLayout(data.length, data);
    expect(layout).not.toBeNull();
    expect(layout?.version).toBe(1);
    // V1D engineOff = 424
    expect(layout?.engineOff).toBe(424);
    // V1D accountSize = 248
    expect(layout?.accountSize).toBe(248);
    // V1D maxAccounts = 256 (small tier)
    expect(layout?.maxAccounts).toBe(256);
  });

  it("parseHeader returns correct fields", () => {
    const header = parseHeader(data);
    const ex = fixture.expected_decoded["header"] as Record<string, unknown>;

    expect(header.magic).toBe(SLAB_MAGIC);
    expect(header.magic.toString()).toBe(ex["magic"]);
    expect(header.version).toBe(ex["version"]);
    expect(header.bump).toBe(ex["bump"]);
    expect(header.flags).toBe(ex["flags"]);
    expect(header.resolved).toBe(ex["resolved"]);
    expect(header.paused).toBe(ex["paused"]);
    expect(header.admin.toBase58()).toBe(ex["admin"]);
    expect(header.nonce).toBe(BigInt(ex["nonce"] as string));
    expect(header.lastThrUpdateSlot).toBe(BigInt(ex["lastThrUpdateSlot"] as string));
  });

  it("parseConfig returns correct fields", () => {
    const config = parseConfig(data);
    const ex = fixture.expected_decoded["config"] as Record<string, unknown>;

    expect(config.collateralMint.toBase58()).toBe(ex["collateralMint"]);
    expect(config.vaultPubkey.toBase58()).toBe(ex["vaultPubkey"]);
    expect(config.maxStalenessSlots).toBe(BigInt(ex["maxStalenessSlots"] as string));
    expect(config.confFilterBps).toBe(ex["confFilterBps"]);
  });

  it("parseEngine returns fields of correct types", () => {
    const engine = parseEngine(data);
    const ex = fixture.expected_decoded["engine"] as Record<string, unknown>;

    // Verify types (ensures decoder returned bigint, not string/number)
    expect(typeof engine.currentSlot).toBe("bigint");
    expect(typeof engine.markPriceE6).toBe("bigint");
    expect(typeof engine.fundingRateBpsPerSlotLast).toBe("bigint");

    // Verify values against fixture
    expect(engine.currentSlot).toBe(BigInt(ex["currentSlot"] as string));
    expect(engine.markPriceE6).toBe(BigInt(ex["markPriceE6"] as string));
    expect(engine.fundingRateBpsPerSlotLast).toBe(BigInt(ex["fundingRateBpsPerSlotLast"] as string));
  });
});
