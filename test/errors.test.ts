import { describe, it, expect } from "vitest";
import {
  PERCOLATOR_ERRORS,
  decodeError,
  getErrorName,
  getErrorHint,
  parseErrorFromLogs,
} from "../src/abi/errors.js";

/**
 * v17 error table tests.
 *
 * Error ordinals sourced from v16_program.rs PercolatorError enum:
 *   0-29  = toly base errors
 *   30-41 = fork LP-vault errors
 *   42-46 = fork NFT/B-3 errors
 *   47-48 = insurance withdrawal policy (F-1/F-2) — in deployed wrapper
 *   49    = EngineInsufficientInitialMargin (discriminant tentative — TODO)
 *   50    = LpVaultDepositBelowMinimumLiquidity (BUG-2/N7 dead-share floor)
 *   51    = FeeSplitFloorViolation (creator/LP/insurance floor, added commit
 *           a3cb4390 — confirmed on-chain 2026-07-16 against fresh wrapper
 *           DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj)
 *   52-53 = fee-collection split (FeeSplitSumInvalid, NoInsuranceReserveToClaim)
 *   54-60 = load_bound_stake_pool diagnostics for wrapper tag 87; ordinal 55
 *           was briefly StakePoolAssetAdminNotBurned on an unmerged branch and
 *           NEVER deployed, so only StakePoolOwnerMismatch is valid
 *   61    = AssetSlotAlreadyConfigured (UpdateAssetLifecycle ACTIVATE against a
 *           slot below max_market_slots that is already in service; replaces a
 *           misleading Custom(21) EngineLockActive)
 *   62    = CreatorFeeOverClaim (tag 90 WithdrawCreatorFee over-claim; NOT
 *           yet deployed — ships with the creator-fee-claim wrapper upgrade)
 *   64+   = undefined (should be undefined in the table)
 *
 * 52-61 are DEPLOYED as of 2026-07-22: devnet wrapper
 * DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj carries percolator-prog@10acb5ae
 * (hash 6b2fda2363352aba0ef88abde0d398f9dd477b1208507e7e8393586ed5458931), so
 * every one of these codes is observable on-chain.
 */

// ============================================================================
// Error table completeness
// ============================================================================

describe("PERCOLATOR_ERRORS table", () => {
  it("has contiguous error codes from 0 to 61", () => {
    for (let i = 0; i <= 61; i++) {
      expect(PERCOLATOR_ERRORS[i], `error ${i} should be defined`).toBeDefined();
      expect(PERCOLATOR_ERRORS[i].name).toBeTruthy();
      expect(PERCOLATOR_ERRORS[i].hint).toBeTruthy();
    }
  });

  it("error code 63 is LpVaultBackingBucketNotEmpty and 64+ are not defined", () => {
    // Boundary moved 62 -> 63 by the LP-vault reachability guard, DEPLOYED to devnet
    // 2026-08-29 (wrapper 02326f4f, sha c9827970bf02098b, slot 490057417). The PROPERTY
    // this test encodes is unchanged — the tail is pinned so an accidental insertion or
    // reordering of an ordinal fails loudly — only the boundary value moves.
    // (PercolatorError::CreatorFeeOverClaim appended after
    // AssetSlotAlreadyConfigured=61). Keep asserting the NEW boundary rather
    // than deleting the guard: this test is what catches an accidental or
    // mis-ordered ordinal addition.
    expect(PERCOLATOR_ERRORS[62]!.name).toBe("CreatorFeeOverClaim");
    expect(PERCOLATOR_ERRORS[63]?.name).toBe("LpVaultBackingBucketNotEmpty");
    expect(PERCOLATOR_ERRORS[64]).toBeUndefined();
    expect(PERCOLATOR_ERRORS[65]).toBeUndefined();
    expect(PERCOLATOR_ERRORS[100]).toBeUndefined();
  });

  // Ordinal 61 is the current tail. It is wire-visible and was appended after
  // StakeProgramNotPinned=60 in percolator-prog@10acb5ae, so pin it by name:
  // a shift here silently mislabels an error every consumer surfaces.
  it("AssetSlotAlreadyConfigured is ordinal 61", () => {
    expect(PERCOLATOR_ERRORS[61].name).toBe("AssetSlotAlreadyConfigured");
  });

  // Fee-collection split ordinals, pinned by name against v16_program.rs's
  // PercolatorError enum on feat/protocol-fee-taker-only@2b3a6a65. These are
  // wire-visible: a rename that shifts an ordinal silently mislabels every
  // error a client surfaces, so assert the exact mapping rather than presence.
  it("fee-collection-split error ordinals 52-60 match the program enum", () => {
    expect(PERCOLATOR_ERRORS[52].name).toBe("FeeSplitSumInvalid");
    expect(PERCOLATOR_ERRORS[53].name).toBe("NoInsuranceReserveToClaim");
    expect(PERCOLATOR_ERRORS[54].name).toBe("StakePoolNotBound");
    expect(PERCOLATOR_ERRORS[55].name).toBe("StakePoolOwnerMismatch");
    expect(PERCOLATOR_ERRORS[56].name).toBe("StakePoolAuthorityMismatch");
    expect(PERCOLATOR_ERRORS[57].name).toBe("StakePoolMarketMismatch");
    expect(PERCOLATOR_ERRORS[58].name).toBe("StakePoolWrapperMismatch");
    expect(PERCOLATOR_ERRORS[59].name).toBe("StakePoolModeMismatch");
    expect(PERCOLATOR_ERRORS[60].name).toBe("StakeProgramNotPinned");
  });

  // 51 pre-existed the fee-collection split and is REUSED, not redefined.
  // A duplicate entry for it would be a regression.
  it("51 remains FeeSplitFloorViolation (pre-existing, reused)", () => {
    expect(PERCOLATOR_ERRORS[51].name).toBe("FeeSplitFloorViolation");
  });

  // Ordinal 55 changed meaning during development: StakePoolAssetAdminNotBurned
  // (an ineffective mitigation) -> StakePoolOwnerMismatch. The old variant
  // existed only on an unmerged branch and NEVER shipped on-chain, so the SDK
  // must carry only the current meaning.
  it("55 does not carry the never-deployed StakePoolAssetAdminNotBurned meaning", () => {
    const names = Object.values(PERCOLATOR_ERRORS).map((e) => e.name);
    expect(names).not.toContain("StakePoolAssetAdminNotBurned");
  });

  it("every error has a non-empty name", () => {
    for (const [_code, info] of Object.entries(PERCOLATOR_ERRORS)) {
      expect(info.name.length).toBeGreaterThan(0);
    }
  });

  it("every error has a non-empty hint", () => {
    for (const [_code, info] of Object.entries(PERCOLATOR_ERRORS)) {
      expect(info.hint.length).toBeGreaterThan(0);
    }
  });

  it("all error names are unique", () => {
    const names = Object.values(PERCOLATOR_ERRORS).map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("v17 well-known error codes map to expected names (toly base 0-29)", () => {
    // toly base errors (0-29)
    expect(PERCOLATOR_ERRORS[0].name).toBe("InvalidMagic");
    expect(PERCOLATOR_ERRORS[1].name).toBe("InvalidVersion");
    expect(PERCOLATOR_ERRORS[2].name).toBe("AlreadyInitialized");
    expect(PERCOLATOR_ERRORS[3].name).toBe("NotInitialized");
    expect(PERCOLATOR_ERRORS[4].name).toBe("InvalidAccountKind");
    expect(PERCOLATOR_ERRORS[5].name).toBe("InvalidAccountLen");
    expect(PERCOLATOR_ERRORS[6].name).toBe("ExpectedSigner");
    expect(PERCOLATOR_ERRORS[7].name).toBe("ExpectedWritable");
    expect(PERCOLATOR_ERRORS[8].name).toBe("Unauthorized");
    expect(PERCOLATOR_ERRORS[9].name).toBe("InvalidInstruction");
    expect(PERCOLATOR_ERRORS[13].name).toBe("InvalidTokenProgram");
    expect(PERCOLATOR_ERRORS[14].name).toBe("EngineInvalidConfig");
    expect(PERCOLATOR_ERRORS[19].name).toBe("EngineStale");
    expect(PERCOLATOR_ERRORS[26].name).toBe("OracleInvalid");
    expect(PERCOLATOR_ERRORS[27].name).toBe("OracleStale");
    expect(PERCOLATOR_ERRORS[28].name).toBe("OracleConfTooWide");
    expect(PERCOLATOR_ERRORS[29].name).toBe("InvalidOracleKey");
  });

  it("v17 well-known error codes map to expected names (LP-vault 30-41)", () => {
    expect(PERCOLATOR_ERRORS[30].name).toBe("LpVaultAlreadyExists");
    expect(PERCOLATOR_ERRORS[31].name).toBe("LpVaultNotFound");
    expect(PERCOLATOR_ERRORS[32].name).toBe("LpVaultPaused");
    expect(PERCOLATOR_ERRORS[33].name).toBe("LpVaultSharesOutstanding");
    expect(PERCOLATOR_ERRORS[37].name).toBe("LpVaultOiReservationViolated");
    expect(PERCOLATOR_ERRORS[38].name).toBe("LpVaultNoFeesToCrank");
    expect(PERCOLATOR_ERRORS[41].name).toBe("LpVaultZeroSharesMinted");
  });

  it("v17 well-known error codes map to expected names (NFT/B-3 42-46)", () => {
    expect(PERCOLATOR_ERRORS[42].name).toBe("NftRegistryNotFound");
    expect(PERCOLATOR_ERRORS[43].name).toBe("NftPortfolioNotTransferable");
    expect(PERCOLATOR_ERRORS[44].name).toBe("NftTransferSelfOrZero");
    expect(PERCOLATOR_ERRORS[45].name).toBe("NftInvalidMintAuthority");
    expect(PERCOLATOR_ERRORS[46].name).toBe("NftPortfolioProvenance");
  });

  it("insurance withdrawal policy errors 47-48 (F-1/F-2) are in deployed wrapper", () => {
    expect(PERCOLATOR_ERRORS[47].name).toBe("InsuranceWithdrawCooldownActive");
    expect(PERCOLATOR_ERRORS[47].hint.toLowerCase()).toContain("cooldown");
    expect(PERCOLATOR_ERRORS[48].name).toBe("InsuranceWithdrawCeilingExceeded");
    expect(PERCOLATOR_ERRORS[48].hint.toLowerCase()).toContain("ceiling");
  });

  it("EngineInsufficientInitialMargin at tentative ordinal 49 (TODO: confirm discriminant)", () => {
    expect(PERCOLATOR_ERRORS[49].name).toBe("EngineInsufficientInitialMargin");
    expect(PERCOLATOR_ERRORS[49].hint.toLowerCase()).toContain("initial margin");
  });
});

// ============================================================================
// decodeError
// ============================================================================

describe("decodeError", () => {
  it("returns error info for valid code 0 (InvalidMagic)", () => {
    const info = decodeError(0);
    expect(info).toBeDefined();
    expect(info!.name).toBe("InvalidMagic");
  });

  it("returns error info for code 8 (Unauthorized)", () => {
    const info = decodeError(8);
    expect(info).toBeDefined();
    expect(info!.name).toBe("Unauthorized");
  });

  it("returns error info for code 27 (OracleStale)", () => {
    const info = decodeError(27);
    expect(info).toBeDefined();
    expect(info!.name).toBe("OracleStale");
  });

  it("returns error info for code 30 (LpVaultAlreadyExists)", () => {
    const info = decodeError(30);
    expect(info).toBeDefined();
    expect(info!.name).toBe("LpVaultAlreadyExists");
  });

  it("returns error info for code 42 (NftRegistryNotFound)", () => {
    const info = decodeError(42);
    expect(info).toBeDefined();
    expect(info!.name).toBe("NftRegistryNotFound");
  });

  it("returns defined info for code 47 (InsuranceWithdrawCooldownActive)", () => {
    expect(decodeError(47)).toBeDefined();
    expect(decodeError(47)!.name).toBe("InsuranceWithdrawCooldownActive");
  });

  it("returns defined info for code 50 (LpVaultDepositBelowMinimumLiquidity)", () => {
    expect(decodeError(50)).toBeDefined();
    expect(decodeError(50)!.name).toBe("LpVaultDepositBelowMinimumLiquidity");
  });

  it("returns defined info for code 51 (FeeSplitFloorViolation)", () => {
    expect(decodeError(51)).toBeDefined();
    expect(decodeError(51)!.name).toBe("FeeSplitFloorViolation");
  });

  it("returns defined info for code 52 (FeeSplitSumInvalid)", () => {
    expect(decodeError(52)).toBeDefined();
    expect(decodeError(52)!.name).toBe("FeeSplitSumInvalid");
  });

  it("returns defined info for code 60 (StakeProgramNotPinned)", () => {
    expect(decodeError(60)).toBeDefined();
    expect(decodeError(60)!.name).toBe("StakeProgramNotPinned");
  });

  it("returns defined info for code 61 (AssetSlotAlreadyConfigured, current tail)", () => {
    expect(decodeError(61)).toBeDefined();
    expect(decodeError(61)!.name).toBe("AssetSlotAlreadyConfigured");
  });

  it("decodes 63 as LpVaultBackingBucketNotEmpty and returns undefined for 64 (beyond current table)", () => {
    expect(decodeError(62)!.name).toBe("CreatorFeeOverClaim");
    expect(decodeError(63)?.name).toBe("LpVaultBackingBucketNotEmpty");
    expect(decodeError(64)).toBeUndefined();
  });

  it("returns undefined for unknown code 10_000", () => {
    expect(decodeError(10_000)).toBeUndefined();
  });

  it("returns undefined for unknown code -1", () => {
    expect(decodeError(-1)).toBeUndefined();
  });
});

// ============================================================================
// getErrorName
// ============================================================================

describe("getErrorName", () => {
  it("returns name for valid v17 codes", () => {
    expect(getErrorName(0)).toBe("InvalidMagic");
    expect(getErrorName(8)).toBe("Unauthorized");
    expect(getErrorName(27)).toBe("OracleStale");
    expect(getErrorName(30)).toBe("LpVaultAlreadyExists");
    expect(getErrorName(42)).toBe("NftRegistryNotFound");
  });

  it("returns name for codes 47-49 (new insurance + im errors)", () => {
    expect(getErrorName(47)).toBe("InsuranceWithdrawCooldownActive");
    expect(getErrorName(48)).toBe("InsuranceWithdrawCeilingExceeded");
    expect(getErrorName(49)).toBe("EngineInsufficientInitialMargin");
  });

  it("returns Unknown(...) for unknown codes beyond the table", () => {
    // The fee-collection split extended the table 51 -> 60, the 2026-07-22
    // bug-fix pass added 61 (AssetSlotAlreadyConfigured), and the creator-fee
    // claim added 62 (CreatorFeeOverClaim); the LP-vault reachability guard added 63
    // (LpVaultBackingBucketNotEmpty, deployed 2026-08-29); 64 is the first unknown.
    expect(getErrorName(62)).toBe("CreatorFeeOverClaim");
    expect(getErrorName(63)).toBe("LpVaultBackingBucketNotEmpty");
    expect(getErrorName(64)).toBe("Unknown(64)");
    expect(getErrorName(999)).toBe("Unknown(999)");
    expect(getErrorName(100)).toBe("Unknown(100)");
  });
});

// ============================================================================
// getErrorHint
// ============================================================================

describe("getErrorHint", () => {
  it("returns hint for valid v17 code 27 (OracleStale)", () => {
    const hint = getErrorHint(27);
    expect(hint).toBeDefined();
    expect(hint!.toLowerCase()).toContain("stale");
  });

  it("returns hint for valid v17 code 0 (InvalidMagic)", () => {
    const hint = getErrorHint(0);
    expect(hint).toBeDefined();
    expect(hint!.toLowerCase()).toContain("magic");
  });

  it("returns hint for valid v17 code 8 (Unauthorized)", () => {
    const hint = getErrorHint(8);
    expect(hint).toBeDefined();
    expect(hint!.toLowerCase()).toContain("author");
  });

  it("returns undefined for unknown code", () => {
    expect(getErrorHint(500)).toBeUndefined();
  });
});

// ============================================================================
// parseErrorFromLogs
// ============================================================================

describe("parseErrorFromLogs", () => {
  it("parses hex error code 0x0 (InvalidMagic)", () => {
    const logs = [
      "Program xyz failed: custom program error: 0x0",
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(0);
    expect(result!.name).toBe("InvalidMagic");
  });

  it("parses hex error code 0x8 (Unauthorized)", () => {
    const logs = [
      "Program log: Instruction: TradeNoCpi",
      "Program 11111111111111111111111111111111 failed: custom program error: 0x8",
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(8);
    expect(result!.name).toBe("Unauthorized");
  });

  it("parses hex error code 0x1b (OracleStale = 27)", () => {
    const logs = [
      "Program xyz failed: custom program error: 0x1b",
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(27);
    expect(result!.name).toBe("OracleStale");
  });

  it("parses LpVault error 0x1e (LpVaultAlreadyExists = 30)", () => {
    const logs = [
      "Program xyz failed: custom program error: 0x1e",
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(30);
    expect(result!.name).toBe("LpVaultAlreadyExists");
  });

  it("parses NFT error 0x2a (NftRegistryNotFound = 42)", () => {
    const logs = [
      "Program xyz failed: custom program error: 0x2a",
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(42);
    expect(result!.name).toBe("NftRegistryNotFound");
  });

  it("returns null for logs without error", () => {
    const logs = [
      "Program log: Instruction: InitPortfolio",
      "Program 11111111111111111111111111111111 consumed 50000 of 200000 compute units",
      "Program 11111111111111111111111111111111 success",
    ];
    expect(parseErrorFromLogs(logs)).toBeNull();
  });

  it("returns null for empty logs", () => {
    expect(parseErrorFromLogs([])).toBeNull();
  });

  it("handles unknown error codes gracefully (beyond v17 range)", () => {
    const logs = [
      "Program xyz failed: custom program error: 0xff",
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(255);
    expect(result!.name).toBe("Unknown(255)");
    expect(result!.hint).toBeUndefined();
  });

  it("returns first error if multiple errors in logs", () => {
    const logs = [
      "Program A failed: custom program error: 0x1b",
      "Program B failed: custom program error: 0x8",
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(27); // OracleStale — the first one
  });

  it("returns null for non-array input (does not throw)", () => {
    expect(parseErrorFromLogs(null as unknown as string[])).toBeNull();
    expect(parseErrorFromLogs(undefined as unknown as string[])).toBeNull();
  });

  it("skips non-string log lines", () => {
    const logs = [123, "Program x failed: custom program error: 0x5"] as unknown as string[];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(5);
    expect(result!.name).toBe("InvalidAccountLen");
  });

  it("does not match unbounded hex (avoids bogus precision-loss codes)", () => {
    const logs = [
      "Program x failed: custom program error: 0x100000000",
    ];
    expect(parseErrorFromLogs(logs)).toBeNull();
  });

  it("matches exactly 8 hex digits (u32 max)", () => {
    const logs = [
      "Program x failed: custom program error: 0xffffffff",
    ];
    const result = parseErrorFromLogs(logs);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(0xffff_ffff);
    expect(result!.name).toBe("Unknown(4294967295)");
  });
});
