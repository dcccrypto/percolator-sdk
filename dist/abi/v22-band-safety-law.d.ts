/**
 * v2.2 Band Safety Law pre-check: a pure mirror of what InitMarket validates for the rent and band
 * blocks, so a launch the program would refuse (105 / 106) is caught before it is sent.
 *
 * This file has NO imports so the app and the seed kit can vendor an exact byte-for-byte copy (the
 * sha256 is pinned in `test/v22-band-safety-law.test.ts` and in the consumers' parity tests).
 *
 * Program sources mirrored (wrapper percolator-prog rc23 34996503, engine 2f05df8c):
 * - wrapper `init_market_apply_phase4_view` (v16_program.rs:17413-17478): the rent block, the band
 *   block, and (prog #647, rc23 34996503) the occupancy rule: on a band market with rent, the law must
 *   also hold with `rent_max x OCC_BSL_RENT_MULTIPLE` (5), else 106. bbaa0e7b has no such rule.
 * - engine `V16Config::validate_public_user_fund` (v16.rs:5553-5657): the band/rent shape, the §1.6
 *   exact solvency envelope, and the Band Safety Law (`validate_band_safety_law`, v16.rs:5376).
 *
 * The law, for every risk notional `N` in `1..=MAX_ACCOUNT_NOTIONAL` (exact, with the engine's
 * ceilings), for both (P, T) = (max_price_move x max_accrual_dt, max_accrual_dt) and, on a band
 * market, (P, T) = (G(d), 2E):
 *
 *   ceil(N x (P x 1e9 + R x T x 1e4) / 1e13)
 *     + min(max(ceil(ceil(N x (1e4 + P) / 1e4) x liq_bps / 1e4), min_liq_abs), liq_cap)
 *   <= max(ceil(N x MMR / 1e4), min_nonzero_mm_req)
 *
 * with `R = max_abs_funding_e9_per_slot + rent_max_e9_per_slot x k` (k = 1, and on a band market with
 * rent also k = 5 on rc23 34996503) and `G(d) = ceil((1e4 + d)^2 / (1e4 - d)) - 1e4`.
 *
 * Mainnet-only rules (a growth market must carry a rent block with both fields > 0, and a
 * single-asset growth market a band block) are out of scope: v2.2 runs on devnet builds.
 *
 * @module
 */
/** Engine `band_rent::MAX_RENT_E9_PER_SLOT`. */
export declare const BSL_MAX_RENT_E9_PER_SLOT = 10000n;
/** Wrapper `growth_v19::RENT_MIN_E9_PER_SLOT`: a non-zero rent ceiling is at least this. */
export declare const BSL_RENT_MIN_E9_PER_SLOT = 10n;
/** Wrapper `growth_v19::RENT_MAX_KINK_BPS`: the kink of a non-zero rent is at most this. */
export declare const BSL_RENT_MAX_KINK_BPS = 8000n;
/** Engine `band_rent::MAX_BAND_BPS`. */
export declare const BSL_MAX_BAND_BPS = 2000n;
/** Engine `band_rent::BAND_MIN_EPOCH_SLOTS`. */
export declare const BSL_BAND_MIN_EPOCH_SLOTS = 150n;
/** Engine `band_rent::BAND_MIN_PIN_EPOCHS`: `Pmax >= 8 x E`. */
export declare const BSL_BAND_MIN_PIN_EPOCHS = 8n;
/**
 * Wrapper `growth_v19::OCC_BSL_RENT_MULTIPLE` on rc23 34996503 (prog #647): utilisation rent plus the
 * per-slot occupancy charge of a minimum leg (`4 x rent_max`). Pass `1n` for a program without #647
 * (bbaa0e7b), or whatever multiple the per-notional rework (prog #572 follow-up) ships.
 */
export declare const BSL_OCCUPANCY_RENT_MULTIPLE_RC23 = 5n;
/** The InitMarket fields the law reads (u64 / u128 as bigint, as the program sees them). */
export interface BandSafetyLawInputV22 {
    /** InitMarket `max_portfolio_assets`; a band market must be 1. */
    maxPortfolioAssets: number;
    maintenanceMarginBps: bigint;
    initialMarginBps: bigint;
    liquidationFeeBps: bigint;
    liquidationFeeCap: bigint;
    minLiquidationAbs: bigint;
    minNonzeroMmReq: bigint;
    minNonzeroImReq: bigint;
    maxPriceMoveBpsPerSlot: bigint;
    maxAccrualDtSlots: bigint;
    maxAbsFundingE9PerSlot: bigint;
    minFundingLifetimeSlots: bigint;
    /** The trailer's rent block (absent = no rent block). */
    rent?: {
        rentMaxE9PerSlot: number;
        rentKinkBps: number;
    };
    /** The trailer's band block (absent or `bandBps` 0 = no band). */
    band?: {
        bandBps: number;
        bandMaxEpochSlots: number;
        bandMaxPinSlots: number;
        bandMinLegNotional: bigint;
    };
}
/** Options of {@link checkBandSafetyLawV22}. */
export interface BandSafetyLawOptionsV22 {
    /**
     * The occupancy multiple of the program being targeted: {@link BSL_OCCUPANCY_RENT_MULTIPLE_RC23} (5, rc23
     * 34996503, the default) or `1n` (bbaa0e7b: no occupancy rule). Must be >= 1.
     */
    occupancyRentMultiple?: bigint;
}
/** Which program rule a refusal comes from. */
export type BandSafetyLawRuleV22 = "base-config" | "rent-block" | "rent-envelope" | "band-shape-or-law" | "occupancy-law";
/** Result of {@link checkBandSafetyLawV22}. */
export type BandSafetyLawResultV22 = {
    ok: true;
} | {
    ok: false;
    /** The InitMarket error the program returns: 106 HoldingRentConfigInvalid, 105 PriceBandConfigInvalid; null = the base config (no rent / band) is itself invalid, so InitMarket fails elsewhere. */
    code: 105 | 106 | null;
    rule: BandSafetyLawRuleV22;
    /** One plain sentence. */
    message: string;
};
/**
 * The engine's worst two-epoch adverse move `G(d) = ceil((1e4 + d)^2 / (1e4 - d)) - 1e4` (bps).
 *
 * @param bandBps  Band half-width `d` in bps (1..=2000).
 * @returns `G(d)`, or null when `d` is out of range.
 * @example
 * ```ts
 * bandWorstAdverseBpsV22(130n); // 397n
 * ```
 */
export declare function bandWorstAdverseBpsV22(bandBps: bigint): bigint | null;
/**
 * Pre-check an InitMarket config against the v2.2 Band Safety Law and the rent / band block rules, the way
 * the wrapper's `init_market_apply_phase4_view` and the engine's `validate_public_user_fund` evaluate them.
 * Pure: no RPC. Exact (the same breakpoint validator, the same ceilings, the same step limits).
 *
 * Order (as the program): rent block (106), rent in the §1.6 envelope (106), band shape and law (105), then on
 * a band market with rent, the law at `rent_max x occupancyRentMultiple` (106). A config whose base (no rent, no
 * band) is itself invalid returns `code: null` (InitMarket refuses it for another reason).
 *
 * @param input  The InitMarket fields the law reads, plus the trailer's rent / band blocks.
 * @param opts   `occupancyRentMultiple`: 5 (rc23 34996503, default) or 1 (bbaa0e7b).
 * @returns `{ ok: true }`, or the refusal with the program's error code and the rule.
 * @throws RangeError on a malformed input (negative, non-integer, or wider than the instruction field).
 * @example
 * ```ts
 * const r = checkBandSafetyLawV22({
 *   maxPortfolioAssets: 1, maintenanceMarginBps: 1000n, initialMarginBps: 2000n, liquidationFeeBps: 50n,
 *   liquidationFeeCap: 10_000_000_000n, minLiquidationAbs: 0n, minNonzeroMmReq: 1_000_000n, minNonzeroImReq: 2_000_000n,
 *   maxPriceMoveBpsPerSlot: 1n, maxAccrualDtSlots: 500n, maxAbsFundingE9PerSlot: 111n, minFundingLifetimeSlots: 500n,
 *   rent: { rentMaxE9PerSlot: 100, rentKinkBps: 5000 },
 *   band: { bandBps: 130, bandMaxEpochSlots: 600, bandMaxPinSlots: 9000, bandMinLegNotional: 100_000_000n },
 * });
 * r.ok; // true (the seed's band pilot)
 * ```
 */
export declare function checkBandSafetyLawV22(input: BandSafetyLawInputV22, opts?: BandSafetyLawOptionsV22): BandSafetyLawResultV22;
/**
 * The largest holding-fee ceiling (`rent_max_e9_per_slot`) the program accepts for this config, by bisection over
 * {@link checkBandSafetyLawV22} (the law is monotone in rent). The `rent` block's kink is kept; its ceiling is ignored.
 *
 * @param input  As {@link checkBandSafetyLawV22}; `rent` supplies the kink (default 5000).
 * @param opts   As {@link checkBandSafetyLawV22}.
 * @returns The maximum accepted `rent_max_e9_per_slot` (>= 10), or null if not even 10 is accepted.
 * @example
 * ```ts
 * maxAcceptedRentE9PerSlotV22(seedBandPilot); // 2000n (x5: the engine ceiling 10,000 / 5)
 * ```
 */
export declare function maxAcceptedRentE9PerSlotV22(input: BandSafetyLawInputV22, opts?: BandSafetyLawOptionsV22): bigint | null;
