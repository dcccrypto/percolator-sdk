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

  it("rejects the stale devnet fixture because it has no v2 discriminator/version", () => {
    expect(() => decodeStakePool(data)).toThrow(/StakePool invalid discriminator/);
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

  it("rejects the stale devnet fixture because it has no discriminator", () => {
    expect(() => decodeDepositPda(data)).toThrow(/StakeDeposit invalid discriminator/);
  });

  it("still documents the captured pool link for fixture archaeology", () => {
    const poolFixture = loadFixture("devnet-stake-pool.json");
    expect(fixture.expected_decoded["pool"]).toBe(poolFixture.account_address);
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
    expect(nft.portfolioAccount.toBase58()).toBe(ex["portfolioAccount"]);
    expect(nft.nftMint.toBase58()).toBe(ex["nftMint"]);
    expect(nft.assetIndex).toBe(ex["assetIndex"]);
    expect(nft.sideAtMint).toBe(ex["sideAtMint"]);
    expect(nft.basisPosQAtMint).toBe(BigInt(ex["basisPosQAtMint"] as string));
    expect(nft.fSnapAtMint).toBe(BigInt(ex["fSnapAtMint"] as string));
    expect(nft.marketIdAtMint).toBe(BigInt(ex["marketIdAtMint"] as string));
    expect(nft.epochSnapAtMint).toBe(BigInt(ex["epochSnapAtMint"] as string));
    expect(nft.positionOwnerAtMint.toBase58()).toBe(ex["positionOwnerAtMint"]);
    expect(nft.positionOwner.toBase58()).toBe(ex["positionOwnerAtMint"]);
    expect(nft.mintedAt).toBe(BigInt(ex["mintedAt"] as string));
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
