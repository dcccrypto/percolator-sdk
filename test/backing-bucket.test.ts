import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  BackingBucketStatus,
  backingBucketStatusName,
  findExpirableBackingDomains,
  isBackingBucketExpirable,
  parseBackingBucketsV17,
  V17_ASSET_SLOT_WRAPPER_LEN,
  V17_BACKING_BUCKET_LEN,
  V17_CONFIG_MAX_MARKET_SLOTS_REL,
  V17_ENGINE_BACKING_LONG_REL,
  V17_ENGINE_BACKING_SHORT_REL,
  V17_GROUP_CONFIG_REL,
  V17_GROUP_CURRENT_SLOT_REL,
  V17_GROUP_MODE_REL,
} from "../src/solana/backing-bucket.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  PERCOLATOR_VAULT_TOKEN_PROGRAM_ID,
  deriveCanonicalVault,
  deriveCanonicalVaultForAuthority,
  deriveMarketVaultAccounts,
  deriveVaultAuthority,
} from "../src/solana/pda.js";
import { deriveStakePool, deriveStakeVaultAuth } from "../src/solana/stake.js";
import {
  V17_MAGIC,
  V17_MARKET_ASSET_SLOT_LEN,
  V17_MARKET_GROUP_LEN,
  V17_MARKET_GROUP_OFF,
  V17_EXPECTED_VERSION,
  V17_KIND_MARKET,
} from "../src/solana/slab.js";

// =============================================================================
// Fixture builder — a synthetic v17 market account
//
// Offsets used here are the ones the parser is being tested against, so this
// alone would be circular. It is not the evidence: the offsets are pinned
// independently by `offset_of!` against the engine's own #[repr(C)] structs
// (see the module doc of src/solana/backing-bucket.ts), and the *sizes* below
// are re-derived from the SDK's independently-sourced length constants.
// =============================================================================

interface BucketFixture {
  status: number;
  expirySlot: bigint;
  freshUnliened?: bigint;
  validLiened?: bigint;
  consumedLiened?: bigint;
  impairedLiened?: bigint;
  utilizationFee?: bigint;
  marketId?: bigint;
}

interface MarketFixture {
  mode: number;
  currentSlot: bigint;
  maxMarketSlots: number;
  /** One entry per PHYSICAL asset slot: [longBucket, shortBucket]. */
  slots: Array<[BucketFixture, BucketFixture]>;
}

function writeU64(buf: Uint8Array, off: number, v: bigint): void {
  new DataView(buf.buffer, buf.byteOffset + off, 8).setBigUint64(0, v, true);
}

function writeU128(buf: Uint8Array, off: number, v: bigint): void {
  const dv = new DataView(buf.buffer, buf.byteOffset + off, 16);
  dv.setBigUint64(0, v & 0xffff_ffff_ffff_ffffn, true);
  dv.setBigUint64(8, v >> 64n, true);
}

function writeBucket(buf: Uint8Array, off: number, b: BucketFixture): void {
  writeU64(buf, off + 0, b.marketId ?? 0n);
  writeU128(buf, off + 8, b.freshUnliened ?? 0n);
  writeU128(buf, off + 24, b.validLiened ?? 0n);
  writeU128(buf, off + 40, b.consumedLiened ?? 0n);
  writeU128(buf, off + 56, b.impairedLiened ?? 0n);
  writeU128(buf, off + 72, b.utilizationFee ?? 0n);
  writeU64(buf, off + 88, b.expirySlot);
  buf[off + 96] = b.status;
}

function buildMarket(fx: MarketFixture): Uint8Array {
  const len =
    V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN + fx.slots.length * V17_MARKET_ASSET_SLOT_LEN;
  const buf = new Uint8Array(len);

  // v17 account header: magic(8) + version(2) + kind(1)
  writeU64(buf, 0, V17_MAGIC);
  new DataView(buf.buffer, 8, 2).setUint16(0, V17_EXPECTED_VERSION, true);
  buf[10] = V17_KIND_MARKET;

  const g = V17_MARKET_GROUP_OFF;
  buf[g + V17_GROUP_MODE_REL] = fx.mode;
  writeU64(buf, g + V17_GROUP_CURRENT_SLOT_REL, fx.currentSlot);
  new DataView(
    buf.buffer,
    g + V17_GROUP_CONFIG_REL + V17_CONFIG_MAX_MARKET_SLOTS_REL,
    4,
  ).setUint32(0, fx.maxMarketSlots, true);

  const slotsBase = g + V17_MARKET_GROUP_LEN;
  fx.slots.forEach(([long, short], i) => {
    const engineBase = slotsBase + i * V17_MARKET_ASSET_SLOT_LEN + V17_ASSET_SLOT_WRAPPER_LEN;
    writeBucket(buf, engineBase + V17_ENGINE_BACKING_LONG_REL, long);
    writeBucket(buf, engineBase + V17_ENGINE_BACKING_SHORT_REL, short);
  });

  return buf;
}

const EMPTY: BucketFixture = { status: BackingBucketStatus.Empty, expirySlot: 0n };

// =============================================================================
// Layout constants — cross-checked against independently-sourced lengths
// =============================================================================

/**
 * Independent re-derivation of the offsets, from the ENGINE'S FIELD DECLARATIONS
 * rather than from the SDK constants under test.
 *
 * Every `V16Pod*` field is an align-1 `[u8; N]` and every struct derives
 * `bytemuck::Pod`, which forbids implicit padding, so a field's offset is exactly
 * the running sum of the sizes of the fields declared before it. Walking the
 * declaration and checking the total lands on an INDEPENDENTLY-SOURCED struct
 * length (`V17_MARKET_GROUP_LEN` / `V17_MARKET_ASSET_SLOT_LEN`, both already in
 * the SDK from the program's own layout dump) is two derivations agreeing.
 *
 * This is what pins the offsets. The fixture round-trip below cannot: it writes
 * with the same constants it reads with, so it would survive any shift applied to
 * both sides — exactly the shared-bug pattern that let the keeper's
 * `issue-335` fixture pass against a 144-byte-wrong production constant.
 */
function runningSum(fields: ReadonlyArray<readonly [string, number]>): Map<string, number> {
  const offsets = new Map<string, number>();
  let off = 0;
  for (const [name, size] of fields) {
    offsets.set(name, off);
    off += size;
  }
  offsets.set("__total__", off);
  return offsets;
}

// percolator/src/v16.rs — `pub struct MarketGroupV16HeaderAccount`, in declaration order.
const GROUP_HEADER_FIELDS = [
  ["market_group_id", 32],
  ["config", 249], // V16ConfigAccount
  ["asset_slot_capacity", 4],
  ["vault", 16],
  ["insurance", 16],
  ["c_tot", 16],
  ["pnl_pos_tot", 16],
  ["pnl_pos_bound_tot_num", 16],
  ["pnl_pos_bound_tot", 16],
  ["pnl_matured_pos_tot", 16],
  ["backing_provider_earnings_total", 16],
  ["source_claim_bound_total_num", 16],
  ["source_fresh_backing_total_num", 16],
  ["source_insurance_credit_reserved_total_atoms", 16],
  ["insurance_domain_budget_remaining_total", 16],
  ["resolved_payout_blocker_count", 8],
  ["stress_consumption_bps_e9_since_envelope", 16],
  ["stress_envelope_start_slot", 8],
  ["stress_envelope_start_credit_epoch", 8],
  ["materialized_portfolio_count", 8],
  ["stale_certificate_count", 8],
  ["b_stale_account_count", 8],
  ["negative_pnl_account_count", 8],
  ["risk_epoch", 8],
  ["asset_set_epoch", 8],
  ["asset_activation_count", 8],
  ["last_asset_activation_slot", 8],
  ["next_market_id", 8],
  ["oracle_epoch", 8],
  ["funding_epoch", 8],
  ["slot_last", 8],
  ["current_slot", 8],
  ["bankruptcy_hlock_active", 1],
  ["threshold_stress_active", 1],
  ["loss_stale_active", 1],
  ["recovery_reason", 2], // V16OptionalRecoveryReasonAccount
  ["mode", 1],
  ["resolved_slot", 8],
  ["payout_snapshot", 16],
  ["payout_snapshot_pnl_pos_tot", 16],
  ["payout_snapshot_captured", 1],
  ["resolved_payout_ledger", 90], // ResolvedPayoutLedgerV16Account
] as const;

// percolator/src/v16.rs — `pub struct EngineAssetSlotV16Account`, in declaration order.
const ENGINE_SLOT_FIELDS = [
  ["asset", 499], // AssetStateV16Account
  ["insurance_domain_budget_long", 16],
  ["insurance_domain_budget_short", 16],
  ["insurance_domain_spent_long", 16],
  ["insurance_domain_spent_short", 16],
  ["pending_domain_loss_barrier_long", 8],
  ["pending_domain_loss_barrier_short", 8],
  ["source_credit_long", 184], // SourceCreditStateV16Account
  ["source_credit_short", 184],
  ["backing_long", 97], // BackingBucketV16Account
  ["backing_short", 97],
  ["insurance_reservation_long", 72], // InsuranceCreditReservationV16Account
  ["insurance_reservation_short", 72],
] as const;

// percolator/src/v16.rs — `pub struct BackingBucketV16Account`, in declaration order.
const BACKING_BUCKET_FIELDS = [
  ["market_id", 8],
  ["fresh_unliened_backing_num", 16],
  ["valid_liened_backing_num", 16],
  ["consumed_liened_backing_num", 16],
  ["impaired_liened_backing_num", 16],
  ["utilization_fee_earnings", 16],
  ["expiry_slot", 8],
  ["status", 1],
] as const;

describe("v17 backing-bucket layout constants (independently re-derived)", () => {
  it("MarketGroupV16HeaderAccount field walk lands on V17_MARKET_GROUP_LEN", () => {
    const o = runningSum(GROUP_HEADER_FIELDS);
    // The convergence check: an independent walk of the declaration reaching the
    // SDK's separately-sourced struct length is what makes the offsets below evidence.
    expect(o.get("__total__")).toBe(V17_MARKET_GROUP_LEN);
    expect(o.get("config")).toBe(V17_GROUP_CONFIG_REL);
    expect(o.get("current_slot")).toBe(V17_GROUP_CURRENT_SLOT_REL);
    expect(o.get("mode")).toBe(V17_GROUP_MODE_REL);
  });

  it("EngineAssetSlotV16Account field walk lands on the stride minus the wrapper prefix", () => {
    const o = runningSum(ENGINE_SLOT_FIELDS);
    // V17_MARKET_ASSET_SLOT_LEN is `size_of::<Market<[u8; 512]>>()`, and Market<T>
    // is `{ wrapper: T, engine: EngineAssetSlotV16Account }` — wrapper FIRST.
    expect(o.get("__total__")).toBe(V17_MARKET_ASSET_SLOT_LEN - V17_ASSET_SLOT_WRAPPER_LEN);
    expect(o.get("backing_long")).toBe(V17_ENGINE_BACKING_LONG_REL);
    expect(o.get("backing_short")).toBe(V17_ENGINE_BACKING_SHORT_REL);
  });

  it("BackingBucketV16Account field walk lands on V17_BACKING_BUCKET_LEN", () => {
    const o = runningSum(BACKING_BUCKET_FIELDS);
    expect(o.get("__total__")).toBe(V17_BACKING_BUCKET_LEN);
    // ...and the engine slot reserves exactly that much for each of the two buckets.
    expect(V17_ENGINE_BACKING_SHORT_REL - V17_ENGINE_BACKING_LONG_REL).toBe(
      V17_BACKING_BUCKET_LEN,
    );
  });

  it("V16ConfigAccount places max_market_slots after max_portfolio_assets:u16", () => {
    // V16ConfigAccount { max_portfolio_assets: V16PodU16, max_market_slots: V16PodU32, .. }
    expect(V17_CONFIG_MAX_MARKET_SLOTS_REL).toBe(2);
    // ...and the u32 read stays inside the 249-byte config block.
    expect(V17_CONFIG_MAX_MARKET_SLOTS_REL + 4).toBeLessThanOrEqual(249);
  });
});

// =============================================================================
// Field decoding
// =============================================================================

describe("parseBackingBucketsV17 — field decoding", () => {
  it("decodes every bucket field, distinctly", () => {
    const data = buildMarket({
      mode: 0,
      currentSlot: 100n,
      maxMarketSlots: 1,
      slots: [
        [
          {
            status: BackingBucketStatus.Fresh,
            expirySlot: 7n,
            marketId: 0x1122_3344_5566_7788n,
            freshUnliened: 11n,
            validLiened: 22n,
            consumedLiened: 33n,
            impairedLiened: 44n,
            utilizationFee: 55n,
          },
          EMPTY,
        ],
      ],
    });

    const state = parseBackingBucketsV17(data, { chainSlot: 100n });
    const b = state.buckets[0]!;
    expect(b.marketId).toBe(0x1122_3344_5566_7788n);
    expect(b.freshUnlienedBackingNum).toBe(11n);
    expect(b.validLienedBackingNum).toBe(22n);
    expect(b.consumedLienedBackingNum).toBe(33n);
    expect(b.impairedLienedBackingNum).toBe(44n);
    expect(b.utilizationFeeEarnings).toBe(55n);
    expect(b.expirySlot).toBe(7n);
    expect(b.status).toBe(BackingBucketStatus.Fresh);
    expect(b.statusName).toBe("Fresh");
  });

  it("carries the full u128 range without truncation", () => {
    const MAX_U128 = (1n << 128n) - 1n;
    const data = buildMarket({
      mode: 0,
      currentSlot: 0n,
      maxMarketSlots: 1,
      slots: [
        [
          {
            status: BackingBucketStatus.Impaired,
            expirySlot: (1n << 64n) - 1n,
            freshUnliened: MAX_U128,
            validLiened: MAX_U128 - 1n,
          },
          EMPTY,
        ],
      ],
    });
    const b = parseBackingBucketsV17(data).buckets[0]!;
    expect(b.freshUnlienedBackingNum).toBe(MAX_U128);
    expect(b.validLienedBackingNum).toBe(MAX_U128 - 1n);
    expect(b.expirySlot).toBe((1n << 64n) - 1n);
  });

  it("maps domain -> (assetIndex, side) as the engine does: 2i LONG, 2i+1 SHORT", () => {
    const data = buildMarket({
      mode: 0,
      currentSlot: 0n,
      maxMarketSlots: 3,
      slots: [
        [EMPTY, EMPTY],
        [EMPTY, EMPTY],
        [EMPTY, EMPTY],
      ],
    });
    const { buckets } = parseBackingBucketsV17(data);
    expect(buckets.map((b) => b.domain)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const b of buckets) {
      expect(b.assetIndex).toBe(Math.floor(b.domain / 2));
      expect(b.side).toBe(b.domain % 2 === 0 ? "long" : "short");
    }
  });

  it("reads LONG and SHORT from distinct byte ranges", () => {
    const data = buildMarket({
      mode: 0,
      currentSlot: 0n,
      maxMarketSlots: 1,
      slots: [
        [
          { status: BackingBucketStatus.Fresh, expirySlot: 111n, freshUnliened: 1n },
          { status: BackingBucketStatus.Impaired, expirySlot: 222n, freshUnliened: 2n },
        ],
      ],
    });
    const [long, short] = parseBackingBucketsV17(data).buckets;
    expect(long!.expirySlot).toBe(111n);
    expect(long!.freshUnlienedBackingNum).toBe(1n);
    expect(short!.expirySlot).toBe(222n);
    expect(short!.freshUnlienedBackingNum).toBe(2n);
  });

  it("names every status byte, and flags unknown ones rather than guessing", () => {
    expect(backingBucketStatusName(0)).toBe("Empty");
    expect(backingBucketStatusName(1)).toBe("Fresh");
    expect(backingBucketStatusName(2)).toBe("Expired");
    expect(backingBucketStatusName(3)).toBe("Impaired");
    expect(backingBucketStatusName(4)).toBe("Unknown(4)");
  });
});

// =============================================================================
// The lapse / expirability predicate — BOTH sides
// =============================================================================

describe("isBackingBucketExpirable — the tag-89 acceptance predicate", () => {
  const ctx = { mode: 0, nowSlot: 1_000n, addressableDomainCount: 4 };

  it("a Fresh bucket whose expiry has NOT passed is NOT expirable", () => {
    expect(
      isBackingBucketExpirable(
        { domain: 0, status: BackingBucketStatus.Fresh, expirySlot: 1_001n },
        ctx,
      ),
    ).toBe(false);
  });

  it("a Fresh bucket whose expiry HAS passed IS expirable", () => {
    expect(
      isBackingBucketExpirable(
        { domain: 0, status: BackingBucketStatus.Fresh, expirySlot: 999n },
        ctx,
      ),
    ).toBe(true);
  });

  it("the boundary is >=, not >: nowSlot === expirySlot is expirable", () => {
    // The engine rejects with `now_slot < bucket.expiry_slot`, so equality passes.
    // This agrees with the deadlock side, which is `expiry_slot <= current_slot`.
    expect(
      isBackingBucketExpirable(
        { domain: 0, status: BackingBucketStatus.Fresh, expirySlot: 1_000n },
        ctx,
      ),
    ).toBe(true);
    expect(
      isBackingBucketExpirable(
        { domain: 0, status: BackingBucketStatus.Fresh, expirySlot: 1_000n },
        { ...ctx, nowSlot: 999n },
      ),
    ).toBe(false);
  });

  it("only Fresh is expirable — Empty / Expired / Impaired are not, even when lapsed", () => {
    for (const status of [
      BackingBucketStatus.Empty,
      BackingBucketStatus.Expired,
      BackingBucketStatus.Impaired,
    ]) {
      expect(isBackingBucketExpirable({ domain: 0, status, expirySlot: 0n }, ctx)).toBe(false);
    }
  });

  it("a non-Live market is never expirable (EngineLockActive gate)", () => {
    const lapsed = { domain: 0, status: BackingBucketStatus.Fresh, expirySlot: 1n };
    expect(isBackingBucketExpirable(lapsed, ctx)).toBe(true);
    expect(isBackingBucketExpirable(lapsed, { ...ctx, mode: 1 })).toBe(false); // Resolved
    expect(isBackingBucketExpirable(lapsed, { ...ctx, mode: 2 })).toBe(false); // Recovery
  });

  it("a domain at or above the addressable count is never expirable", () => {
    const lapsed = { status: BackingBucketStatus.Fresh, expirySlot: 1n };
    expect(isBackingBucketExpirable({ domain: 3, ...lapsed }, ctx)).toBe(true);
    expect(isBackingBucketExpirable({ domain: 4, ...lapsed }, ctx)).toBe(false);
    expect(isBackingBucketExpirable({ domain: -1, ...lapsed }, ctx)).toBe(false);
  });

  it("is not vacuously true: the same bucket flips on each gate independently", () => {
    const lapsed = { domain: 0, status: BackingBucketStatus.Fresh, expirySlot: 500n };
    expect(isBackingBucketExpirable(lapsed, ctx)).toBe(true);
    expect(isBackingBucketExpirable({ ...lapsed, expirySlot: 5_000n }, ctx)).toBe(false);
    expect(
      isBackingBucketExpirable({ ...lapsed, status: BackingBucketStatus.Expired }, ctx),
    ).toBe(false);
    expect(isBackingBucketExpirable(lapsed, { ...ctx, mode: 1 })).toBe(false);
    expect(isBackingBucketExpirable(lapsed, { ...ctx, addressableDomainCount: 0 })).toBe(false);
  });
});

describe("parseBackingBucketsV17 — lapse detection end to end", () => {
  const mixed = () =>
    buildMarket({
      mode: 0,
      currentSlot: 1_000n,
      maxMarketSlots: 3,
      slots: [
        // asset 0: LONG lapsed, SHORT fresh-and-live
        [
          { status: BackingBucketStatus.Fresh, expirySlot: 900n, freshUnliened: 5n },
          { status: BackingBucketStatus.Fresh, expirySlot: 5_000n, freshUnliened: 5n },
        ],
        // asset 1: already Expired, and Empty
        [
          { status: BackingBucketStatus.Expired, expirySlot: 100n },
          { status: BackingBucketStatus.Empty, expirySlot: 0n },
        ],
        // asset 2: SHORT lapsed exactly at the boundary
        [
          { status: BackingBucketStatus.Impaired, expirySlot: 10n },
          { status: BackingBucketStatus.Fresh, expirySlot: 1_000n },
        ],
      ],
    });

  it("reports exactly the lapsed-and-Live domains as expirable", () => {
    const state = parseBackingBucketsV17(mixed(), { chainSlot: 1_000n });
    expect(state.buckets.filter((b) => b.expirable).map((b) => b.domain)).toEqual([0, 5]);
    expect(findExpirableBackingDomains(mixed(), { chainSlot: 1_000n })).toEqual([0, 5]);
  });

  it("a healthy market yields NO work — the predicate is not always-true", () => {
    const healthy = buildMarket({
      mode: 0,
      currentSlot: 1_000n,
      maxMarketSlots: 2,
      slots: [
        [
          { status: BackingBucketStatus.Fresh, expirySlot: 9_000n },
          { status: BackingBucketStatus.Fresh, expirySlot: 9_000n },
        ],
        [
          { status: BackingBucketStatus.Fresh, expirySlot: 9_000n },
          { status: BackingBucketStatus.Empty, expirySlot: 0n },
        ],
      ],
    });
    expect(findExpirableBackingDomains(healthy, { chainSlot: 1_000n })).toEqual([]);
    expect(parseBackingBucketsV17(healthy, { chainSlot: 1_000n }).buckets).toHaveLength(4);
  });

  it("a Resolved market yields NO work even though domains are lapsed", () => {
    const data = mixed();
    data[V17_MARKET_GROUP_OFF + V17_GROUP_MODE_REL] = 1; // Resolved
    const state = parseBackingBucketsV17(data, { chainSlot: 1_000n });
    expect(state.mode).toBe(1);
    expect(state.buckets.some((b) => b.lapsed)).toBe(true); // still deadlocked...
    expect(state.buckets.some((b) => b.expirable)).toBe(false); // ...but tag 89 is refused
  });

  it("`lapsed` and `expirable` are distinct: lapsed survives the mode gate", () => {
    const data = mixed();
    data[V17_MARKET_GROUP_OFF + V17_GROUP_MODE_REL] = 2; // Recovery
    const state = parseBackingBucketsV17(data, { chainSlot: 1_000n });
    expect(state.buckets.filter((b) => b.lapsed).map((b) => b.domain)).toEqual([0, 5]);
    expect(state.buckets.filter((b) => b.expirable)).toEqual([]);
  });
});

describe("parseBackingBucketsV17 — nowSlot resolution", () => {
  it("uses max(chainSlot, header.current_slot), matching the program", () => {
    // header.current_slot runs AHEAD of the chain slot: the program would still
    // accept, so the SDK must not report a false negative.
    const data = buildMarket({
      mode: 0,
      currentSlot: 5_000n,
      maxMarketSlots: 1,
      slots: [[{ status: BackingBucketStatus.Fresh, expirySlot: 4_000n }, EMPTY]],
    });
    const state = parseBackingBucketsV17(data, { chainSlot: 100n });
    expect(state.headerCurrentSlot).toBe(5_000n);
    expect(state.nowSlot).toBe(5_000n);
    expect(state.buckets[0]!.expirable).toBe(true);
  });

  it("uses the chain slot when it runs ahead of the engine counter", () => {
    const data = buildMarket({
      mode: 0,
      currentSlot: 100n,
      maxMarketSlots: 1,
      slots: [[{ status: BackingBucketStatus.Fresh, expirySlot: 4_000n }, EMPTY]],
    });
    expect(parseBackingBucketsV17(data, { chainSlot: 100n }).buckets[0]!.expirable).toBe(false);
    expect(parseBackingBucketsV17(data, { chainSlot: 4_000n }).buckets[0]!.expirable).toBe(true);
    expect(parseBackingBucketsV17(data, { chainSlot: 4_000n }).nowSlot).toBe(4_000n);
  });

  it("falls back to header.current_slot when no chain slot is given", () => {
    const data = buildMarket({
      mode: 0,
      currentSlot: 777n,
      maxMarketSlots: 1,
      slots: [[EMPTY, EMPTY]],
    });
    expect(parseBackingBucketsV17(data).nowSlot).toBe(777n);
  });

  it("accepts a number chainSlot and rejects a negative one", () => {
    const data = buildMarket({
      mode: 0,
      currentSlot: 10n,
      maxMarketSlots: 1,
      slots: [[EMPTY, EMPTY]],
    });
    expect(parseBackingBucketsV17(data, { chainSlot: 4_242 }).nowSlot).toBe(4_242n);
    expect(() => parseBackingBucketsV17(data, { chainSlot: -1 })).toThrow(/non-negative/);
  });
});

describe("parseBackingBucketsV17 — domain bounds", () => {
  it("clamps to max_market_slots when the account is sized larger", () => {
    // 3 physical slots but only 1 configured: the wrapper rejects domain >= 2
    // with InvalidInstruction, so only domains 0 and 1 may be emitted.
    const data = buildMarket({
      mode: 0,
      currentSlot: 1_000n,
      maxMarketSlots: 1,
      slots: [
        [{ status: BackingBucketStatus.Fresh, expirySlot: 1n }, EMPTY],
        [{ status: BackingBucketStatus.Fresh, expirySlot: 1n }, EMPTY],
        [{ status: BackingBucketStatus.Fresh, expirySlot: 1n }, EMPTY],
      ],
    });
    const state = parseBackingBucketsV17(data, { chainSlot: 1_000n });
    expect(state.physicalAssetSlots).toBe(3);
    expect(state.maxMarketSlots).toBe(1);
    expect(state.addressableDomainCount).toBe(2);
    expect(state.buckets.map((b) => b.domain)).toEqual([0, 1]);
    expect(findExpirableBackingDomains(data, { chainSlot: 1_000n })).toEqual([0]);
  });

  it("clamps to the physical slot count when max_market_slots overstates it", () => {
    // Configured for 8 slots, sized for 2. The engine's domain_asset_side rejects
    // asset_index >= markets.len() with InvalidLeg, and reading past the buffer
    // would be a misparse.
    const data = buildMarket({
      mode: 0,
      currentSlot: 1_000n,
      maxMarketSlots: 8,
      slots: [
        [{ status: BackingBucketStatus.Fresh, expirySlot: 1n }, EMPTY],
        [{ status: BackingBucketStatus.Fresh, expirySlot: 1n }, EMPTY],
      ],
    });
    const state = parseBackingBucketsV17(data, { chainSlot: 1_000n });
    expect(state.physicalAssetSlots).toBe(2);
    expect(state.maxMarketSlots).toBe(8);
    expect(state.addressableDomainCount).toBe(4);
    expect(state.buckets.map((b) => b.domain)).toEqual([0, 1, 2, 3]);
    expect(findExpirableBackingDomains(data, { chainSlot: 1_000n })).toEqual([0, 2]);
  });
});

describe("parseBackingBucketsV17 — input validation", () => {
  it("rejects a buffer shorter than the group header", () => {
    expect(() => parseBackingBucketsV17(new Uint8Array(100))).toThrow(/buffer too short/);
  });

  it("rejects a non-v17 account rather than misparsing it", () => {
    const data = buildMarket({ mode: 0, currentSlot: 0n, maxMarketSlots: 1, slots: [[EMPTY, EMPTY]] });
    data[10] = 2; // KIND_PORTFOLIO, not KIND_MARKET
    expect(() => parseBackingBucketsV17(data)).toThrow(/not a v17 market account/);
  });

  it("tolerates a market with zero asset slots", () => {
    const data = buildMarket({ mode: 0, currentSlot: 0n, maxMarketSlots: 4, slots: [] });
    const state = parseBackingBucketsV17(data);
    expect(state.physicalAssetSlots).toBe(0);
    expect(state.addressableDomainCount).toBe(0);
    expect(state.buckets).toEqual([]);
  });
});

// =============================================================================
// Canonical vault derivation (tags 84 / 87)
// =============================================================================

const WRAPPER_ID = new PublicKey("DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj");
const MARKET = new PublicKey("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");
const MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

describe("deriveCanonicalVault", () => {
  it("equals the SPL ATA of the vault authority — derived independently", () => {
    // Independent path: the vault authority from its own seeds, then
    // @solana/spl-token's ATA derivation. Neither side reuses the other's code.
    const [expectedAuthority] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("vault"), MARKET.toBytes()],
      WRAPPER_ID,
    );
    const expectedVault = getAssociatedTokenAddressSync(
      MINT,
      expectedAuthority,
      /*allowOwnerOffCurve=*/ true,
      TOKEN_PROGRAM_ID,
    );

    const [vault] = deriveCanonicalVault(WRAPPER_ID, MARKET, MINT);
    expect(vault.toBase58()).toBe(expectedVault.toBase58());
  });

  it("mirrors canonical_vault_address's seed tuple exactly", () => {
    // The program: find_program_address(&[vault_authority, spl_token::ID, mint], ATA_PROGRAM)
    const [authority] = deriveVaultAuthority(WRAPPER_ID, MARKET);
    const [expected] = PublicKey.findProgramAddressSync(
      [authority.toBytes(), TOKEN_PROGRAM_ID.toBytes(), MINT.toBytes()],
      new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
    );
    const [vault] = deriveCanonicalVault(WRAPPER_ID, MARKET, MINT);
    expect(vault.toBase58()).toBe(expected.toBase58());
  });

  it("pins the two program ids the derivation depends on", () => {
    expect(PERCOLATOR_VAULT_TOKEN_PROGRAM_ID.toBase58()).toBe(
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    );
    expect(PERCOLATOR_VAULT_TOKEN_PROGRAM_ID.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()).toBe(
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    );
  });

  it("uses legacy SPL Token as the middle seed, NOT Token-2022", () => {
    // The wrapper hard-pins spl_token::ID in verify_token_program AND
    // unpack_token_account, so a Token-2022-derived ATA is simply the wrong
    // address here — it would fail with InvalidVaultAccount.
    const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
    const [authority] = deriveVaultAuthority(WRAPPER_ID, MARKET);
    const [token2022Ata] = PublicKey.findProgramAddressSync(
      [authority.toBytes(), TOKEN_2022.toBytes(), MINT.toBytes()],
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const [vault] = deriveCanonicalVault(WRAPPER_ID, MARKET, MINT);
    expect(vault.equals(token2022Ata)).toBe(false);
  });

  it("is deterministic and varies with every input", () => {
    const [a] = deriveCanonicalVault(WRAPPER_ID, MARKET, MINT);
    const [b] = deriveCanonicalVault(WRAPPER_ID, MARKET, MINT);
    expect(a.equals(b)).toBe(true);

    const otherMarket = PublicKey.unique();
    const otherMint = PublicKey.unique();
    const otherProgram = PublicKey.unique();
    expect(deriveCanonicalVault(WRAPPER_ID, otherMarket, MINT)[0].equals(a)).toBe(false);
    expect(deriveCanonicalVault(WRAPPER_ID, MARKET, otherMint)[0].equals(a)).toBe(false);
    expect(deriveCanonicalVault(otherProgram, MARKET, MINT)[0].equals(a)).toBe(false);
  });

  it("deriveCanonicalVaultForAuthority agrees with the market-level entry point", () => {
    const [authority] = deriveVaultAuthority(WRAPPER_ID, MARKET);
    const [fromAuthority, bumpA] = deriveCanonicalVaultForAuthority(authority, MINT);
    const [fromMarket, bumpB] = deriveCanonicalVault(WRAPPER_ID, MARKET, MINT);
    expect(fromAuthority.equals(fromMarket)).toBe(true);
    expect(bumpA).toBe(bumpB);
  });
});

describe("deriveMarketVaultAccounts", () => {
  it("returns the same keys as the individual derivations", () => {
    const [authority, authBump] = deriveVaultAuthority(WRAPPER_ID, MARKET);
    const [vault, vaultBump] = deriveCanonicalVault(WRAPPER_ID, MARKET, MINT);

    const v = deriveMarketVaultAccounts(WRAPPER_ID, MARKET, MINT);
    expect(v.vaultAuthority.equals(authority)).toBe(true);
    expect(v.vaultAuthorityBump).toBe(authBump);
    expect(v.vaultToken.equals(vault)).toBe(true);
    expect(v.vaultTokenBump).toBe(vaultBump);
    expect(v.tokenProgram.equals(TOKEN_PROGRAM_ID)).toBe(true);
  });

  it("the vault authority is off-curve, as a PDA must be", () => {
    const v = deriveMarketVaultAccounts(WRAPPER_ID, MARKET, MINT);
    expect(PublicKey.isOnCurve(v.vaultAuthority.toBytes())).toBe(false);
    expect(v.vaultAuthority.equals(v.vaultToken)).toBe(false);
  });
});

// =============================================================================
// Stake-side accounts for tag 87 — already present; pinned here against the
// program's own seed constants so a rename fails loudly.
// =============================================================================

const STAKE_PROGRAM = new PublicKey("GCHhcgwPyrai8SWHEVWw3odedguFXEtJobNnWSfWBCU3");

describe("tag 87 stake-side derivations", () => {
  it("deriveStakePool mirrors STAKE_POOL_SEED = b\"stake_pool\"", () => {
    const [expected] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("stake_pool"), MARKET.toBytes()],
      STAKE_PROGRAM,
    );
    const [pool] = deriveStakePool(MARKET, STAKE_PROGRAM);
    expect(pool.toBase58()).toBe(expected.toBase58());
  });

  it("deriveStakeVaultAuth mirrors STAKE_VAULT_AUTHORITY_SEED = b\"vault_auth\"", () => {
    const [pool] = deriveStakePool(MARKET, STAKE_PROGRAM);
    const [expected] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("vault_auth"), pool.toBytes()],
      STAKE_PROGRAM,
    );
    const [vaultAuth] = deriveStakeVaultAuth(pool, STAKE_PROGRAM);
    expect(vaultAuth.toBase58()).toBe(expected.toBase58());
  });

  it("the stake vault authority is NOT the wrapper vault authority", () => {
    // Two different programs, two different seeds. Confusing them would send
    // tag 87 to an address the wrapper rejects.
    const [pool] = deriveStakePool(MARKET, STAKE_PROGRAM);
    const [stakeAuth] = deriveStakeVaultAuth(pool, STAKE_PROGRAM);
    const [wrapperAuth] = deriveVaultAuthority(WRAPPER_ID, MARKET);
    expect(stakeAuth.equals(wrapperAuth)).toBe(false);
  });
});
