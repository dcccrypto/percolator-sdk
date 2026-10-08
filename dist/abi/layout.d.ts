/**
 * Account LAYOUT tables keyed on the wrapper VERSION, plus the VERSION / discriminator guard that
 * every slab and portfolio decoder runs before it reads a single field.
 *
 * Why this exists (security reviews of the v2.2 stack, "silent misread" findings): the wrapper
 * hand-lays every account, the engine grows its structs between releases, and a decoder that picks
 * its geometry from the buffer LENGTH alone happily reads a v2.2 market with v2.1 offsets. The
 * result is numbers that look plausible and are wrong. So geometry is chosen by VERSION (the u16 at
 * offset 8 of every wrapper-owned account), the engine layout discriminator is checked wherever the
 * account carries one (portfolios), and anything else is refused with a typed
 * {@link UnknownLayoutError}.
 *
 * Tables:
 *
 * - {@link LAYOUT_V21}: wrapper VERSION 18, engine discriminator 18. FROZEN. Every value equals the constant the v2.1
 *   decoders have always used (pinned by `test/layout-guard.test.ts`).
 * - {@link LAYOUT_V22_VARIANT_B}: wrapper VERSION 19, the v2.2 LAUNCH CANDIDATE (`release/v22-wrapper-rem` c8501d15 on
 *   `release/v22-engine-rem`: per-leg K/F remainders + the 32 B slot tail): leg 217, portfolio 10,603, slot 2,661 (engine #287 +32: `provider_principal_{long,short}` at slot offsets 1605 / 1621).
 *   **PROVISIONAL**, pinned against the real crate by `test/fixtures/v22-parity.json` (rustc `offset_of!`).
 * - {@link LAYOUT_V22_STAGE_A}: the earlier stage-A numbers (leg 185, portfolio 10,091, slot 2,597), kept as a named row.
 * - {@link LAYOUT_V22} is the alias every default uses (variant B). Another stacked engine fix may still move numbers:
 *   edit the rows in this file only (and regenerate the fixture); no decoder holds a layout number of its own.
 *
 * @module layout
 */
/** Why a buffer was refused. */
export type LayoutErrorCode = "TOO_SHORT" | "BAD_MAGIC" | "UNKNOWN_VERSION" | "WRONG_KIND" | "DISCRIMINATOR_MISMATCH" | "PROVENANCE_VERSION" | "BAD_LENGTH" | "INVALID_RECORD";
/**
 * Thrown by every guarded decoder when the account is not a layout this SDK knows. It extends
 * `Error` and keeps the historical message prefixes, so callers that matched on text keep working;
 * new callers should switch on {@link UnknownLayoutError.code}.
 */
export declare class UnknownLayoutError extends Error {
    /** Machine-readable reason. */
    readonly code: LayoutErrorCode;
    /** The decoder that refused (for example `parsePortfolioV17`). */
    readonly parser: string;
    /** The VERSION found in the buffer, when it was readable. */
    readonly version?: number;
    /** The engine layout discriminator found in the buffer, when it was readable. */
    readonly discriminator?: number;
    /** The account kind byte found in the buffer, when it was readable. */
    readonly kind?: number;
    constructor(code: LayoutErrorCode, parser: string, message: string, found?: {
        version?: number;
        discriminator?: number;
        kind?: number;
    });
}
/** Offsets inside the market-group header (relative to `marketGroupOff + 0`). */
export interface GroupHeaderOffsets {
    /** `V16ConfigAccount` starts here; `config.max_market_slots` is a u32 at +2. */
    config: number;
    maxMarketSlotsInConfig: number;
    assetSlotCapacity: number;
    vault: number;
    insurance: number;
    cTot: number;
    sourceInsuranceCreditReservedTotalAtoms: number;
    insuranceDomainBudgetRemainingTotal: number;
    materializedPortfolioCount: number;
    currentSlot: number;
    mode: number;
}
/** Offsets inside `AssetStateV16Account` (relative to the engine slot start). */
export interface AssetStateOffsets {
    rawOracleTargetPrice: number;
    effectivePrice: number;
    oiEffLongQ: number;
    oiEffShortQ: number;
}
/** Offsets inside `EngineAssetSlotV16Account` (relative to the engine slot start). */
export interface EngineSlotOffsets {
    insuranceDomainBudgetLong: number;
    insuranceDomainBudgetShort: number;
    insuranceDomainSpentLong: number;
    insuranceDomainSpentShort: number;
    sourceCreditLong: number;
    sourceCreditShort: number;
    backingLong: number;
    backingShort: number;
    insuranceReservationLong: number;
    insuranceReservationShort: number;
}
/** Offsets inside the wrapper-owned prefix of an asset slot (identical in v2.1 and v2.2). */
export interface WrapperSlotOffsets {
    oracleProfile: number;
    controlSequences: number;
    riskLimits: number;
    growth: number;
    vaultLpDraw: number;
    vaultLp: number;
    /** `lot_exp` byte inside the oracle profile (`_padding0[0]`); 0 on v2.1 markets. */
    profileLotExp: number;
    /** `p4_flags` byte inside the oracle profile (`_padding0[1]`). */
    profileP4Flags: number;
}
/** Offsets inside one `PortfolioLegV16Account` (relative to the leg start). */
export interface LegOffsets {
    active: number;
    assetIndex: number;
    marketId: number;
    side: number;
    basisPosQ: number;
    aBasis: number;
    kSnap: number;
    fSnap: number;
    kfEpochSnap: number;
    epochSnap: number;
    lossWeight: number;
    bSnap: number;
    bRem: number;
    bEpochSnap: number;
    bStale: number;
    stale: number;
    /** v2.2 band/rent tail; `null` on v2.1. */
    bandEpochSnap: number | null;
    bandLiqPending: number | null;
    rentSnap: number | null;
    rentCarry: number | null;
}
/** The portfolio geometry (absolute account offsets unless stated). */
export interface PortfolioGeometry {
    /** Total account length: the wrapper's `PORTFOLIO_ACCOUNT_LEN`. */
    accountLen: number;
    legStride: number;
    legCount: number;
    legsOff: number;
    sourceDomainsOff: number;
    sourceDomainStride: number;
    sourceDomainCap: number;
    /** `PortfolioMatcherConfigV16` (104 B) then the 24 B identity trailer follow the engine body. */
    matcherConfigOff: number;
    /** Absolute offset of `ResolvedPayoutReceiptV16Account` (66 B: four u128, `present`, `finalized`). */
    resolvedPayoutReceiptOff: number;
    identityTrailerLen: number;
    /** Provenance header: `version` u16 and `layout_discriminator` u16. */
    provenanceVersionOff: number;
    provenanceDiscriminatorOff: number;
    leg: LegOffsets;
}
/** Body / account lengths of the new standalone accounts (header excluded unless noted). */
export interface StandaloneAccountLens {
    /** Wrapper account header: magic u64, version u16, kind u8, pad[5]. */
    headerLen: number;
    redemptionBody: number;
    /** `LpRedemptionExtV22` appended to the body of a v2.2-form request. */
    redemptionExtBody: number;
    bondTrancheBody: number;
    bondPositionBody: number;
    insuranceUnitsBody: number;
    g9FeedAllowlistBody: number;
    g9FeedAllowlistCap: number;
}
/**
 * Band / holding-rent state words (v2.2 only; null on v2.1). Config offsets are relative to the CONFIG start
 * (marketGroupOff + group.config), asset-state offsets to the ENGINE slot start, growth / vaultLp offsets to the
 * record start (slot + wrapperSlot.growth / slot + wrapperSlot.vaultLp).
 */
export interface BandRentOffsets {
    configLen: number;
    config: {
        maxAccrualDtSlots: number;
        maxPriceMoveBpsPerSlot: number;
        bandBps: number;
        bandMaxEpochSlots: number;
        bandMaxPinSlots: number;
        rentMaxE9PerSlot: number;
        bandMaxPositionsPerSide: number;
        bandMinLegNotional: number;
    };
    assetState: {
        bandAnchorPrice: number;
        bandAnchorSlot: number;
        bandEpoch: number;
        bandUncertifiedLong: number;
        bandUncertifiedShort: number;
        bandLiqPendingLong: number;
        bandLiqPendingShort: number;
        bandPinSinceSlot: number;
        rentIndexLongNum: number;
        rentIndexShortNum: number;
        rentUnroutedAtoms: number;
    };
    growth: {
        rentKinkBps: number;
        rentNCapQ: number;
    };
    vaultLp: {
        lpNetQ: number;
        flags: number;
    };
}
/** One complete layout. */
export interface LayoutTable {
    /** Human name. */
    readonly name: string;
    /** `FROZEN` (deployed / released) or `PROVISIONAL` (final values come from the combined build). */
    readonly status: "FROZEN" | "PROVISIONAL";
    /** Where the numbers come from. */
    readonly source: string;
    /** Wrapper `constants::VERSION` (u16 at account offset 8). */
    readonly version: number;
    /** Engine `V16_LAYOUT_DISCRIMINATOR` (stored in every portfolio's provenance header). */
    readonly engineDiscriminator: number;
    readonly headerLen: number;
    readonly wrapperConfigLen: number;
    /** `HEADER_LEN + WRAPPER_CONFIG_LEN`: where the market-group header starts. */
    readonly marketGroupOff: number;
    /** `MARKET_GROUP_LEN`: size of `MarketGroupV16HeaderAccount`. */
    readonly marketGroupLen: number;
    /** `MARKET_ASSET_SLOT_LEN`: stride of one asset slot (`wrapperSlotLen + engineSlotLen`). */
    readonly assetSlotStride: number;
    /** `ASSET_ORACLE_WRAPPER_LEN`: wrapper prefix of each slot. */
    readonly wrapperSlotLen: number;
    /** `size_of::<EngineAssetSlotV16Account>()`. */
    readonly engineSlotLen: number;
    /** `size_of::<AssetStateV16Account>()`. */
    readonly assetStateLen: number;
    readonly group: GroupHeaderOffsets;
    readonly assetState: AssetStateOffsets;
    readonly engineSlot: EngineSlotOffsets;
    readonly wrapperSlot: WrapperSlotOffsets;
    readonly portfolio: PortfolioGeometry;
    readonly accounts: StandaloneAccountLens;
    /** Band / rent state offsets; `null` on v2.1. */
    readonly bandRent: BandRentOffsets | null;
}
/**
 * Wrapper VERSION 18 (v2.1; also the `ETDLAdi`-lineage v17/v18 market layout this SDK always read).
 * FROZEN: do not edit; `test/layout-guard.test.ts` pins every value to the legacy constants.
 */
export declare const LAYOUT_V21: LayoutTable;
/**
 * Wrapper VERSION 19, STAGE A (release/v22-wrapper b4390fe0 on engine release/v22-engine 73ef2c32): leg 185,
 * portfolio 10,091, slot 2,597. Kept as a named row for comparison and fixtures; NOT the launch candidate.
 */
export declare const LAYOUT_V22_STAGE_A: LayoutTable;
/**
 * Wrapper VERSION 19, VARIANT B: the v2.2 LAUNCH CANDIDATE (branches release/v22-engine-rem and
 * release/v22-wrapper-rem, coordinator report 2026-10-06): per-leg K/F remainders (`k_rem_num` @78, `f_rem_num` @94,
 * every later leg field +32), a second 32 B slot tail, and (fold 2026-10-08, engine #287) a third: provider-principal mirror. Leg 217, portfolio 10,603, slot 2,661.
 *
 * The in-slot ENGINE offsets below assume the extra 32 B slot tail sits after the existing fields (so no offset moves);
 * `test/layout-guard.test.ts` verifies the whole row against `layout-v22.json` when that file is present. PROVISIONAL:
 * another stacked engine fix may still move numbers: edit this row only.
 */
export declare const LAYOUT_V22_VARIANT_B: LayoutTable;
/** The named v2.2 rows. */
export declare const LAYOUT_V22_ROWS: Readonly<{
    readonly stageA: LayoutTable;
    readonly variantB: LayoutTable;
}>;
/** The v2.2 layout every default uses: variant B (the launch candidate). Swap the alias to change the default. */
export declare const LAYOUT_V22: LayoutTable;
/** Every layout this SDK can decode, keyed on the wrapper VERSION. */
export declare const LAYOUTS_BY_VERSION: ReadonlyMap<number, LayoutTable>;
/** Wrapper account magic (`"PERCV16\0"` little-endian). */
export declare const WRAPPER_ACCOUNT_MAGIC = 5784119745589622272n;
/** Account kind bytes (header byte 10). */
export declare const ACCOUNT_KIND: Readonly<{
    readonly Market: 1;
    readonly Portfolio: 2;
    readonly BackingDomainLedger: 3;
    readonly InsuranceLedger: 4;
    readonly LpVaultRegistry: 5;
    readonly LpRedemption: 6;
    readonly NftRegistry: 7;
    readonly ClosedMarket: 8;
    readonly VaultLpState: 9;
    readonly VaultLpExt: 10;
    readonly BondTranche: 11;
    readonly BondPosition: 12;
    readonly InsuranceUnits: 13;
    readonly G9FeedAllowlist: 15;
}>;
/**
 * Read the 16-byte wrapper header.
 *
 * @param data  Raw account bytes.
 * @param parser  Caller name for error messages.
 * @returns `{ magic, version, kind }`.
 * @throws {@link UnknownLayoutError} `TOO_SHORT` when fewer than 16 bytes.
 * @example
 * ```ts
 * const { version, kind } = readWrapperHeader(info.data, "myDecoder");
 * ```
 */
export declare function readWrapperHeader(data: Uint8Array, parser?: string): {
    magic: bigint;
    version: number;
    kind: number;
};
/** Options for {@link resolveLayout}. */
export interface ResolveLayoutOptions {
    /** Caller name, used as the error prefix. */
    parser: string;
    /** Required account kind byte; omit to accept any kind. */
    kind?: number;
    /**
     * Restrict to these VERSIONs (for decoders that only know one geometry). Default: every version in
     * {@link LAYOUTS_BY_VERSION}.
     */
    versions?: readonly number[];
    /** Table registry override (tests). */
    registry?: ReadonlyMap<number, LayoutTable>;
}
/**
 * The VERSION guard: check magic, VERSION and (optionally) kind, and return the layout table for the
 * account's VERSION. NEVER infers the layout from the buffer length.
 *
 * @param data  Raw account bytes.
 * @param opts  See {@link ResolveLayoutOptions}.
 * @returns The layout table of the account's VERSION.
 * @throws {@link UnknownLayoutError} `TOO_SHORT`, `BAD_MAGIC`, `UNKNOWN_VERSION` or `WRONG_KIND`.
 * @example
 * ```ts
 * const L = resolveLayout(info.data, { parser: "myDecoder", kind: ACCOUNT_KIND.Market });
 * ```
 */
export declare function resolveLayout(data: Uint8Array, opts: ResolveLayoutOptions): LayoutTable;
/** Geometry of a market account resolved by VERSION. */
export interface MarketGeometry {
    readonly layout: LayoutTable;
    /** Absolute offset of the market-group header. */
    readonly groupOff: number;
    /** Absolute offset of asset slot 0. */
    readonly slotsBase: number;
    /** Number of whole asset slots physically present. */
    readonly slotCount: number;
    /** Absolute offset of asset slot `i` (wrapper prefix start). */
    slotOff(i: number): number;
    /** Absolute offset of asset `i`'s engine slot (`slotOff(i) + wrapperSlotLen`). */
    engineOff(i: number): number;
}
/** Options for {@link resolveMarketGeometry}. */
export interface MarketGeometryOptions {
    /** Caller name. */
    parser: string;
    /** Require the account to be an exact `groupEnd + n * stride` (default true; InitMarket enforces it). */
    strictLength?: boolean;
    /** Restrict to these VERSIONs. */
    versions?: readonly number[];
    registry?: ReadonlyMap<number, LayoutTable>;
}
/**
 * Resolve the geometry of a MARKET account (kind 1) by VERSION.
 *
 * @param data  Raw market account bytes.
 * @param opts  See {@link MarketGeometryOptions}.
 * @returns The geometry.
 * @throws {@link UnknownLayoutError}: `TOO_SHORT`, `BAD_MAGIC`, `UNKNOWN_VERSION`, `WRONG_KIND`, or
 *   `BAD_LENGTH` when the slot region is not a whole number of this VERSION's strides.
 * @example
 * ```ts
 * const g = resolveMarketGeometry(info.data, { parser: "myDecoder" });
 * const insurance = readU128(info.data, g.groupOff + g.layout.group.insurance);
 * ```
 */
export declare function resolveMarketGeometry(data: Uint8Array, opts: MarketGeometryOptions): MarketGeometry;
/** Options for {@link resolvePortfolioLayout}. */
export interface PortfolioGuardOptions {
    parser: string;
    /** Require the exact account length of the VERSION (default false: legacy decoders tolerate truncation). */
    strictLength?: boolean;
    versions?: readonly number[];
    registry?: ReadonlyMap<number, LayoutTable>;
}
/**
 * Guard a PORTFOLIO account (kind 2): VERSION picks the table, then the engine provenance header must
 * carry that table's `layout_discriminator` and `version == 1`. A portfolio whose wrapper VERSION was
 * bumped but whose leg stride was not (the NFT finding) fails here instead of reading legs 1..15 at
 * the wrong offsets.
 *
 * @param data  Raw portfolio account bytes.
 * @param opts  See {@link PortfolioGuardOptions}.
 * @returns The layout table.
 * @throws {@link UnknownLayoutError}: any {@link LayoutErrorCode}.
 * @example
 * ```ts
 * const L = resolvePortfolioLayout(info.data, { parser: "parsePortfolioV17" });
 * ```
 */
export declare function resolvePortfolioLayout(data: Uint8Array, opts: PortfolioGuardOptions): LayoutTable;
/**
 * `getProgramAccounts` size filter for portfolios of one VERSION. Always pair it with a `memcmp` on
 * the VERSION so a length collision between layouts cannot match.
 *
 * @param layout  Table (default {@link LAYOUT_V22}).
 * @returns `{ dataSize, versionMemcmp }` ready to spread into `filters`.
 * @example
 * ```ts
 * const f = portfolioFilterForLayout(LAYOUT_V22);
 * ```
 */
export declare function portfolioFilterForLayout(layout?: LayoutTable): {
    dataSize: number;
    versionMemcmp: {
        offset: number;
        bytes: string;
    };
};
