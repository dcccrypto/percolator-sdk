import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  PERCOLATOR_ERRORS,
  decodeError,
  getErrorName,
  getErrorHint,
  getContextualErrorHint,
  parseErrorFromLogs,
} from "../src/abi/errors.js";
import { PROGRAM_IDS } from "../src/config/program-ids.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  PERCOLATOR_VAULT_TOKEN_PROGRAM_ID,
  PYTH_PUSH_ORACLE_PROGRAM_ID,
  deriveVaultAuthority,
  deriveCanonicalVault,
  deriveCanonicalVaultForAuthority,
  deriveMarketVaultAccounts,
  deriveInsuranceLpMint,
  deriveLpPda,
  deriveCreatorLockPda,
  deriveLpVaultRegistry,
  deriveLpRedemption,
  deriveLpBackingLedger,
  deriveLpEscrow,
  deriveNftRegistry,
  deriveMatcherDelegate,
  derivePythPushOraclePDA,
} from "../src/solana/pda.js";

// Pinned from percolator-prog feat/v22-rc23-2026-10-22 src/v16_program.rs `pub enum PercolatorError` (discriminant = code).
export const PROG_RC23_ERROR_TABLE: ReadonlyArray<readonly [number, string]> = [
  [0, "InvalidMagic"],
  [1, "InvalidVersion"],
  [2, "AlreadyInitialized"],
  [3, "NotInitialized"],
  [4, "InvalidAccountKind"],
  [5, "InvalidAccountLen"],
  [6, "ExpectedSigner"],
  [7, "ExpectedWritable"],
  [8, "Unauthorized"],
  [9, "InvalidInstruction"],
  [10, "InvalidMint"],
  [11, "InvalidTokenAccount"],
  [12, "InvalidVaultAccount"],
  [13, "InvalidTokenProgram"],
  [14, "EngineInvalidConfig"],
  [15, "EngineArithmeticOverflow"],
  [16, "EngineProvenanceMismatch"],
  [17, "EngineHiddenLeg"],
  [18, "EngineInvalidLeg"],
  [19, "EngineStale"],
  [20, "EngineBStale"],
  [21, "EngineLockActive"],
  [22, "EngineNonProgress"],
  [23, "EngineRecoveryRequired"],
  [24, "EngineCounterOverflow"],
  [25, "EngineCounterUnderflow"],
  [26, "OracleInvalid"],
  [27, "OracleStale"],
  [28, "OracleConfTooWide"],
  [29, "InvalidOracleKey"],
  [30, "LpVaultAlreadyExists"],
  [31, "LpVaultNotFound"],
  [32, "LpVaultPaused"],
  [33, "LpVaultSharesOutstanding"],
  [34, "LpVaultZeroAmount"],
  [35, "LpVaultInsufficientShares"],
  [36, "LpVaultCooldownActive"],
  [37, "LpVaultOiReservationViolated"],
  [38, "LpVaultNoFeesToCrank"],
  [39, "LpVaultSupplyMismatch"],
  [40, "LpVaultAuthorityMismatch"],
  [41, "LpVaultZeroSharesMinted"],
  [42, "NftRegistryNotFound"],
  [43, "NftPortfolioNotTransferable"],
  [44, "NftTransferSelfOrZero"],
  [45, "NftInvalidMintAuthority"],
  [46, "NftPortfolioProvenance"],
  [47, "InsuranceWithdrawCooldownActive"],
  [48, "InsuranceWithdrawCeilingExceeded"],
  [49, "EngineInsufficientInitialMargin"],
  [50, "LpVaultDepositBelowMinimumLiquidity"],
  [51, "FeeSplitFloorViolation"],
  [52, "FeeSplitSumInvalid"],
  [53, "NoInsuranceReserveToClaim"],
  [54, "StakePoolNotBound"],
  [55, "StakePoolOwnerMismatch"],
  [56, "StakePoolAuthorityMismatch"],
  [57, "StakePoolMarketMismatch"],
  [58, "StakePoolWrapperMismatch"],
  [59, "StakePoolModeMismatch"],
  [60, "StakeProgramNotPinned"],
  [61, "AssetSlotAlreadyConfigured"],
  [62, "CreatorFeeOverClaim"],
  [63, "LpVaultBackingBucketNotEmpty"],
  [64, "RentExemptRequired"],
  [65, "AssetGenerationMismatch"],
  [66, "ExecPriceOutsideOracleBand"],
  [67, "SameOwnerTrade"],
  [68, "LpExposureCapExceeded"],
  [69, "LpFloorHalt"],
  [70, "ProtocolSideOiCapExceeded"],
  [71, "CloseSlabFeesOutstanding"],
  [72, "VaultLpAlreadyBound"],
  [73, "VaultLpNotBound"],
  [74, "VaultLpSeniorImpaired"],
  [75, "VaultLpJuniorWithdrawRefused"],
  [76, "VaultLpRecallRefused"],
  [77, "VaultLpExclusiveCounterparty"],
  [78, "VaultLpLeverageStepDown"],
  [79, "VaultLpBoundCannotClose"],
  [80, "VaultLpExposureCapExceeded"],
  [81, "VaultLpMatcherNotApproved"],
  [82, "VaultLpUseSettleResolved"],
  [83, "VaultLpReleaseRefused"],
  [84, "VaultLpHarvestPending"],
  [85, "VaultLpValuationStale"],
  [86, "VaultLpMultiAssetMarket"],
  [87, "VaultLpSeniorDrawRequired"],
  [88, "VaultLpRedeemNeedsRecall"],
  [89, "VaultLpPausedForSeniorDraw"],
  [90, "VaultLpBindRequiresFlatAsset"],
  [91, "LpVaultTargetPotImpaired"],
  [92, "GrowthLeverageExceeded"],
  [93, "GrowthCapacityFull"],
  [94, "GrowthInvalidConfig"],
  [95, "GrowthNeedsLpCounterparty"],
  [96, "GrowthBatchTooManyLegs"],
  [97, "GrowthRequiresBoundVaultLp"],
  [98, "GrowthUtilisationFeeNotCovered"],
  [99, "GrowthUtilisationFeeRequiresTradeCpi"],
  [100, "VaultLpAllocateRefused"],
  [101, "VaultLpCapacityLocked"],
  [102, "VaultLpCreatorFeeVesting"],
  [103, "VaultLpSeniorCapitalHalt"],
  [104, "PriceBandPinned"],
  [105, "PriceBandConfigInvalid"],
  [106, "HoldingRentConfigInvalid"],
  [107, "BondTrancheImpaired"],
  [108, "BondCapacityLocked"],
  [109, "BondWithdrawCooldown"],
  [110, "BondConfigInvalid"],
  [111, "PriceBandPositionCap"],
  [112, "PriceBandTooNarrow"],
  [113, "PriceBandLegBelowMinNotional"],
  [114, "RescueRefused"],
  [115, "RescueNavFloor"],
  [116, "InsuranceBackstopRefused"],
  [117, "RedemptionBelowMinPayout"],
  [118, "ExitRequiresLossCurrent"],
  [119, "LotConfigInvalid"],
  [120, "EngineAdlReduceOnly"],
  [121, "EngineLossStale"],
  [122, "EarnExitWouldUnderBackClaims"],
  [123, "BondDepositAboveCap"],
  [124, "BondSlippage"],
  [125, "G9AllowlistTimelock"],
  [126, "PositionCapReached"],
  [127, "CounterpartyPositionCapReached"],
  [128, "DepthInputInvalid"],
  [129, "DepthSourceInvalid"],
  [130, "GrowthTierConfigInvalid"],
  [131, "CreatorStakeBelowMinimum"],
  [132, "LevGuardRequired"],
  [133, "LevGuardRefused"],
  [134, "LevGuardInvalid"],
  [135, "LpStopNotTriggered"],
  [136, "CreatorFeePayeeInvalid"],
];

describe("PERCOLATOR_ERRORS vs percolator-prog PercolatorError (rc23)", () => {
  it("has exactly the prog's code set", () => {
    expect(Object.keys(PERCOLATOR_ERRORS).map(Number).sort((a, b) => a - b)).toEqual(
      PROG_RC23_ERROR_TABLE.map(([c]) => c),
    );
  });
  it.each(PROG_RC23_ERROR_TABLE)("code %i is %s", (code, name) => {
    expect(PERCOLATOR_ERRORS[code].name).toBe(name);
    expect(decodeError(code)?.name).toBe(name);
    expect(getErrorName(code)).toBe(name);
    expect(getErrorHint(code)).toBe(PERCOLATOR_ERRORS[code].hint);
  });
  it("unknown code falls back", () => {
    expect(getErrorName(9999)).toBe("Unknown(9999)");
    expect(getErrorHint(9999)).toBeUndefined();
    expect(decodeError(9999)).toBeUndefined();
  });
});

describe("getContextualErrorHint", () => {
  it("covers every context branch", () => {
    expect(getContextualErrorHint(9, { action: "trade" })).toMatch(/Trade refused/);
    expect(getContextualErrorHint(9)).toBe(PERCOLATOR_ERRORS[9].hint);
    expect(getContextualErrorHint(19, { action: "trade", healthCheckStale: true })).toMatch(/health check/);
    expect(getContextualErrorHint(19, { action: "trade" })).toBe(PERCOLATOR_ERRORS[19].hint);
    expect(getContextualErrorHint(19, { action: "withdraw", openLegs: 2 })).toMatch(/Close your open positions/);
    expect(getContextualErrorHint(19, { action: "withdraw" })).toBe(PERCOLATOR_ERRORS[19].hint);
    expect(getContextualErrorHint(19, { action: "withdraw", openLegs: 0 })).toBe(PERCOLATOR_ERRORS[19].hint);
    expect(getContextualErrorHint(27, { action: "resolve", staleSlotsRemaining: null })).toMatch(/turned off/);
    expect(getContextualErrorHint(27, { action: "resolve", staleSlotsRemaining: 300 })).toMatch(/300 more slots \(about 2 min\)/);
    expect(getContextualErrorHint(27, { action: "resolve", staleSlotsRemaining: 10n })).toMatch(/under a minute/);
    expect(getContextualErrorHint(27, { action: "resolve", staleSlotsRemaining: 0 })).toMatch(/try again later/);
    expect(getContextualErrorHint(27, { action: "resolve" })).toMatch(/try again later/);
    expect(getContextualErrorHint(21, { action: "resolve" })).toBe("This market is already resolved.");
    expect(getContextualErrorHint(19, { action: "resolve" })).toMatch(/clock is behind/);
    expect(getContextualErrorHint(9999, { action: "resolve" })).toBeUndefined();
  });
});

describe("parseErrorFromLogs attribution", () => {
  const id = (k: string) => String(k === "wrapper" ? PROGRAM_IDS.devnet.percolator : PROGRAM_IDS.devnet.matcher);
  const fail = (pid: string, hex: string) => [`Program ${pid} failed: custom program error: 0x${hex}`];
  it("non-array / non-string / no match / out-of-range", () => {
    expect(parseErrorFromLogs(null as unknown as string[])).toBeNull();
    expect(parseErrorFromLogs([5 as unknown as string, "nothing"])).toBeNull();
    expect(parseErrorFromLogs(["custom program error: 0x1ffffffff"])).toBeNull();
  });
  it("skips a code the finiteness guard rejects (regex caps at 8 hex digits, so only a stubbed isFinite reaches it)", async () => {
    const { vi } = await import("vitest");
    const spy = vi.spyOn(Number, "isFinite").mockReturnValueOnce(false);
    try {
      expect(parseErrorFromLogs(["custom program error: 0x8"])).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
  it("wrapper id decodes with the wrapper table and context", () => {
    const r = parseErrorFromLogs(fail(id("wrapper"), "9"), { context: { action: "trade" } });
    expect(r).toMatchObject({ code: 9, program: "wrapper", name: "InvalidInstruction" });
    expect(r?.hint).toMatch(/Trade refused/);
  });
  it("no id falls back to unknown + wrapper table", () => {
    const r = parseErrorFromLogs(["custom program error: 0x8"]);
    expect(r).toMatchObject({ code: 8, program: "unknown", name: "Unauthorized" });
    expect(r).not.toHaveProperty("programId");
  });
  it("token program", () => {
    const r = parseErrorFromLogs(fail("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "1"));
    expect(r?.program).toBe("token");
  });
  it("matcher: listed and unlisted codes", () => {
    const m = id("matcher");
    expect(parseErrorFromLogs(fail(m, "1f41"))?.program).toBe("matcher");
    const r = parseErrorFromLogs(fail(m, "9"));
    expect(r).toMatchObject({ program: "matcher", name: "Unknown(9)" });
    expect(r?.hint).toMatch(/8001-8005/);
  });
  it("caller-declared stake / nft ids with unlisted codes get a build-mismatch hint", () => {
    for (const kind of ["stake", "nft"] as const) {
      const pid = Keypair.generate().publicKey;
      const r = parseErrorFromLogs(fail(pid.toBase58(), "ffff"), { programIds: { [kind]: [pid] } });
      expect(r).toMatchObject({ program: kind, name: "Unknown(65535)" });
      expect(r?.hint).toMatch(new RegExp(`${kind} program returned code 65535`));
    }
  });
  it("stake: known code decodes, extra string id accepted, wrapper unlisted has no hint", () => {
    const pid = Keypair.generate().publicKey.toBase58();
    const r = parseErrorFromLogs(fail(pid, "0"), { programIds: { stake: [pid] } });
    expect(r?.program).toBe("stake");
    expect(r?.name).not.toBe("Unknown(0)");
    const v5 = parseErrorFromLogs(fail(pid, "21"), { programIds: { stake: [pid, undefined as unknown as string] } });
    expect(v5?.program).toBe("stake");
    expect(v5?.name).not.toBe("Unknown(33)");
    const w = parseErrorFromLogs(fail(id("wrapper"), "ffff"));
    expect(w).toMatchObject({ program: "wrapper", name: "Unknown(65535)", hint: undefined });
  });
  it("nft known code", () => {
    const pid = Keypair.generate().publicKey;
    const r = parseErrorFromLogs(fail(pid.toBase58(), "0"), { programIds: { nft: [pid] } });
    expect(r?.program).toBe("nft");
  });
});

const k = () => Keypair.generate().publicKey;
const enc = (s: string) => new TextEncoder().encode(s);
const find = (seeds: (Uint8Array | Buffer)[], p: PublicKey) => PublicKey.findProgramAddressSync(seeds, p);

describe("PDA seeds pinned to percolator-prog rc23 derivations", () => {
  const prog = k(), a = k(), b = k(), c = k(), d = k(), e = k();
  it("vault authority [vault, market]", () => {
    expect(deriveVaultAuthority(prog, a)).toEqual(find([enc("vault"), a.toBytes()], prog));
  });
  it("canonical vault = ATA(authority, SPL token, mint)", () => {
    const [auth] = deriveVaultAuthority(prog, a);
    const exp = find([auth.toBytes(), PERCOLATOR_VAULT_TOKEN_PROGRAM_ID.toBytes(), b.toBytes()], ASSOCIATED_TOKEN_PROGRAM_ID);
    expect(deriveCanonicalVault(prog, a, b)).toEqual(exp);
    expect(deriveCanonicalVaultForAuthority(auth, b)).toEqual(exp);
    const v = deriveMarketVaultAccounts(prog, a, b);
    expect(v).toEqual({
      vaultAuthority: auth,
      vaultAuthorityBump: deriveVaultAuthority(prog, a)[1],
      vaultToken: exp[0],
      vaultTokenBump: exp[1],
      tokenProgram: PERCOLATOR_VAULT_TOKEN_PROGRAM_ID,
    });
    expect(PERCOLATOR_VAULT_TOKEN_PROGRAM_ID.toBase58()).toBe("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  });
  it("LP vault family", () => {
    expect(deriveInsuranceLpMint(prog, a)).toEqual(find([enc("lp_vault_mint"), a.toBytes()], prog));
    expect(deriveLpVaultRegistry(prog, a)).toEqual(find([enc("lp_vault"), a.toBytes()], prog));
    expect(deriveLpRedemption(prog, a, b)).toEqual(find([enc("lp_redemption"), a.toBytes(), b.toBytes()], prog));
    expect(deriveLpEscrow(prog, a)).toEqual(find([enc("lp_escrow"), a.toBytes()], prog));
    expect(deriveLpBackingLedger(prog, a, 0x0102)).toEqual(
      find([enc("lp_backing_ledger"), a.toBytes(), new Uint8Array([2, 1])], prog),
    );
    expect(deriveLpBackingLedger(prog, a, 65535)[0]).toBeInstanceOf(PublicKey);
  });
  it("nft registry and matcher delegate", () => {
    expect(deriveNftRegistry(prog, a)).toEqual(find([enc("nft_registry"), a.toBytes()], prog));
    expect(deriveMatcherDelegate(prog, a, b, c, d, e)).toEqual(
      find([enc("matcher"), a.toBytes(), b.toBytes(), c.toBytes(), d.toBytes(), e.toBytes()], prog),
    );
  });
  it("lp pda and creator lock (SDK-side seeds; no rc23 prog counterpart)", () => {
    expect(deriveLpPda(prog, a, 258)).toEqual(find([enc("lp"), a.toBytes(), new Uint8Array([2, 1])], prog));
    expect(deriveCreatorLockPda(prog, a)[0]).toBeInstanceOf(PublicKey);
  });
  it("u16 validation", () => {
    for (const bad of [-1, 65536, 1.5, NaN, "1" as unknown as number]) {
      expect(() => deriveLpBackingLedger(prog, a, bad)).toThrow(/u16LE/);
      expect(() => deriveLpPda(prog, a, bad)).toThrow(/deriveLpPda/);
    }
  });
  it("pyth push oracle PDA", () => {
    const hex = "ab".repeat(32);
    const exp = find([new Uint8Array(2), Buffer.from(hex, "hex")], PYTH_PUSH_ORACLE_PROGRAM_ID);
    expect(derivePythPushOraclePDA(hex)).toEqual(exp);
    expect(derivePythPushOraclePDA(`  0x${hex}  `)).toEqual(exp);
    expect(derivePythPushOraclePDA(`0X${hex.toUpperCase()}`)).toEqual(exp);
    expect(() => derivePythPushOraclePDA("abcd")).toThrow(/4 chars/);
    expect(() => derivePythPushOraclePDA("zz".repeat(32))).toThrow(/non-hexadecimal/);
  });
});
