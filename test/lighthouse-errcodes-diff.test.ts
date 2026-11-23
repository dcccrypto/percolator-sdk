/**
 * Differential test: SDK Lighthouse code table vs the REAL Lighthouse program, and vs every Percolator
 * program's custom error codes. Source-only read, no cargo.
 *
 * Lighthouse (L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95) is a NATIVE solana-program crate (shank, no
 * anchor-lang in programs/lighthouse/Cargo.toml), so Anchor's framework codes (100.., 2000.., 3000..) never
 * come from it. Its only custom codes are `LighthouseError` 6000..6016 plus `0x1900 + i` (AssertionFailed of
 * the i-th assertion of a multi-assert instruction, `map_multi_err`).
 *
 *   https://github.com/Jac0xb/lighthouse/blob/4c579479c98635e419b1b167f08be02a71604a71/programs/lighthouse/src/error.rs#L23-L78
 *   declare_id!("L2TEx...") at programs/lighthouse/src/lib.rs:26 of the same commit; the generated client
 *   clients/rust/src/generated/errors/lighthouse.rs and clients/js/src/generated/errors/lighthouse.ts agree.
 *
 * Percolator enums (v2.2 branches, source):
 *   wrapper  dcccrypto/percolator-prog  feat/v22-rc23-2026-10-22 @ bc657392  src/v16_program.rs:1465-2039
 *            `PercolatorError` (137 variants, 0..136; Custom(value as u32) at :2126-2130). Identical to
 *            test/fixtures/wrapper-errors.json (generated at 2b5dce8a), checked variant by variant.
 *            The only raw Custom(n) literals in src/ are 120, 121, 21 (v16_program.rs:51586-51594).
 *   stake    dcccrypto/percolator-stake release/v22-stake @ 9712e3cd   src/error.rs:5-150 `StakeError` 0..45
 *            (Custom(e as u32) at :152-154)
 *   nft      dcccrypto/percolator-nft   release/v22-nft   @ 1b7429c8   src/error.rs:6-80 `NftError` 0..27
 *            (Custom(e as u32) at :82-84)
 *   matcher  dcccrypto/percolator-match release/v22-matcher @ 4bf14108 src/lib.rs:146 ERR_INCONSISTENT_LEG_ORACLE_PRICE
 *            8001, src/v2.rs:32/35/37/39 ERR_STALE_MARK 8002 .. ERR_OWNER_PROOF_MISMATCH 8005; every other matcher
 *            error is a builtin ProgramError (not Custom).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LIGHTHOUSE_CONSTRAINT_ADDRESS,
  LIGHTHOUSE_ERROR_CODES,
  LIGHTHOUSE_PROGRAM_ID_STR,
  isLighthouseError,
} from "../src/runtime/lighthouse.js";

/** LighthouseError (error.rs:23-69 @ 4c579479). Index = code - 6000. */
const LIGHTHOUSE_ENUM: readonly string[] = [
  "InvalidInstructionData", // 6000 0x1770
  "AssertionFailed", // 6001 0x1771 (single-assert failure)
  "NotEnoughAccounts", // 6002 0x1772
  "BumpNotFound", // 6003 0x1773
  "AccountBorrowFailed", // 6004 0x1774
  "RangeOutOfBounds", // 6005 0x1775
  "IndexOutOfBounds", // 6006 0x1776
  "FailedToDeserialize", // 6007 0x1777
  "FailedToSerialize", // 6008 0x1778
  "AccountOwnerMismatch", // 6009 0x1779
  "AccountKeyMismatch", // 6010 0x177a
  "AccountNotInitialized", // 6011 0x177b
  "AccountOwnerValidationFailed", // 6012 0x177c
  "AccountFundedValidationFailed", // 6013 0x177d
  "AccountDiscriminatorValidationFailed", // 6014 0x177e
  "AccountValidationFailed", // 6015 0x177f
  "CrossProgramInvokeViolation", // 6016 0x1780
];
/** map_multi_err (error.rs:72-78): AssertionFailed of assertion i -> Custom(0x1900 + i). */
const MULTI_ASSERT_BASE = 0x1900;
/** A legacy tx is <= 1232 bytes, so a multi-assert instruction holds < 1232 assertions. */
const MAX_TX_BYTES = 1232;

const REAL_LIGHTHOUSE_TABLE = new Map<number, string>([
  ...LIGHTHOUSE_ENUM.map((n, i) => [6000 + i, n] as [number, string]),
  [MULTI_ASSERT_BASE, "AssertionFailed (multi-assert index 0)"],
]);

function isRealLighthouseCode(c: number): boolean {
  return (c >= 6000 && c <= 6016) || (c >= MULTI_ASSERT_BASE && c < MULTI_ASSERT_BASE + MAX_TX_BYTES);
}

// Percolator custom codes, from the enums listed in the header.
const WRAPPER = JSON.parse(readFileSync(new URL("./fixtures/wrapper-errors.json", import.meta.url), "utf8")) as {
  count: number; errors: Record<string, string>;
};
const STAKE_ENUM = ["AlreadyInitialized","NotInitialized","Unauthorized","CooldownNotElapsed","InsufficientLpTokens","ZeroAmount","Overflow","InvalidMint","MarketResolved","DepositCapExceeded","InvalidPda","_DeprecatedAdminAlreadyTransferred","_DeprecatedAdminNotTransferred","InsufficientVaultBalance","InvalidPercolatorProgram","CpiFailed","InvalidAccount","InvalidPoolMode","WithdrawalBelowHwmFloor","TrancheNotEnabled","JuniorBalanceInsufficient","WrongTranche","ZeroSharesMinted","NoPendingAdmin","InsuranceLossOutstanding","CooldownIncreaseRequiresTimelock","TimelockNotElapsed","NoPendingCooldownProposal","DepositBelowMinimumLiquidity","NoRealLpHolders","MarketNotTerminal","NothingToRecover","UnsupportedWrapperLayout","ConsentRequired","DeprecatedV5","InsuranceUnitsInvalid","LiquidityBufferExhausted","SyncCooldownActive","InvalidDeployConfig","NotProtocolAuthority","NoPendingDeployTarget","NotSupportedOnFirstLoss","AssetAdminNotBurned","NothingToSync","InsuranceReadingsDiverged","InsuranceUnitsMismatch"];
const NFT_ENUM = ["PositionNotOpen","NftAlreadyMinted","InvalidNftPda","InvalidSlabOwner","SlabDataTooShort","UserIndexOutOfRange","PositionMismatch","NotNftHolder","FundingOverflow","InvalidMintAuthority","UnrecognizedSlabLayout","PositionInLiquidation","FundingNotSettled","InvalidPercolatorProgram","PositionNotClosed","InvalidExtraAccountMetas","InvalidTokenAccount","UnauthorizedDirectInvocation","LpAccountNotAllowed","InvalidAccountId","SlotReused","InvalidPortfolioOwner","LegNotActive","PortfolioDecodeFailed","TransferBlocked","MarketIdMismatch","RegistryNotConfigured","MultiLegNotWrappable"];
const MATCHER: Record<number, string> = {
  8001: "ERR_INCONSISTENT_LEG_ORACLE_PRICE", // lib.rs:146
  8002: "ERR_STALE_MARK", // v2.rs:32
  8003: "ERR_MARK_SLOT_IN_FUTURE", // v2.rs:35
  8004: "ERR_ASSET_MISMATCH", // v2.rs:37
  8005: "ERR_OWNER_PROOF_MISMATCH", // v2.rs:39
};

const PERCOLATOR: { prog: string; codes: number[] }[] = [
  { prog: "wrapper", codes: Object.keys(WRAPPER.errors).map(Number) },
  { prog: "stake", codes: STAKE_ENUM.map((_, i) => i) },
  { prog: "nft", codes: NFT_ENUM.map((_, i) => i) },
  { prog: "matcher", codes: Object.keys(MATCHER).map(Number) },
];

// Any non-Lighthouse program id (devnet wrapper, from test/errors.test.ts).
const PERC_ID = "DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj";
const hex = (c: number) => `0x${c.toString(16)}`;

describe("(1) LIGHTHOUSE_ERROR_CODES == the real Lighthouse enum (error.rs @ 4c579479)", () => {
  it("the real enum is 17 codes 6000..6016 plus multi-assert 0x1900", () => {
    expect(LIGHTHOUSE_ENUM).toHaveLength(17);
    expect(REAL_LIGHTHOUSE_TABLE.size).toBe(18);
    expect(REAL_LIGHTHOUSE_TABLE.get(0x1771)).toBe("AssertionFailed");
    expect(REAL_LIGHTHOUSE_TABLE.get(0x1780)).toBe("CrossProgramInvokeViolation");
  });

  it("every SDK code is a real Lighthouse code (none of the invented Anchor 0x1790..0x179b)", () => {
    const bogus = [...LIGHTHOUSE_ERROR_CODES].filter((c) => !REAL_LIGHTHOUSE_TABLE.has(c)).map(hex);
    expect(bogus).toEqual([]);
  });

  it("every real Lighthouse code is in the SDK set (6004..6015 included)", () => {
    const missing = [...REAL_LIGHTHOUSE_TABLE.keys()].filter((c) => !LIGHTHOUSE_ERROR_CODES.has(c)).map(hex);
    expect(missing).toEqual([]);
  });

  it("per-code pin: code -> real name", () => {
    for (const [code, name] of REAL_LIGHTHOUSE_TABLE) {
      expect(LIGHTHOUSE_ERROR_CODES.has(code), `${hex(code)} ${name}`).toBe(true);
    }
    expect(LIGHTHOUSE_ERROR_CODES.size).toBe(18);
  });

  it("0x1900 is multi-assert AssertionFailed (not Anchor ConstraintAddress, which is 2012 = 0x7dc)", () => {
    expect(LIGHTHOUSE_CONSTRAINT_ADDRESS).toBe(MULTI_ASSERT_BASE);
    expect(LIGHTHOUSE_ERROR_CODES.has(2012)).toBe(false);
    for (let c = 2000; c < 2100; c++) expect(LIGHTHOUSE_ERROR_CODES.has(c), `anchor ${c}`).toBe(false);
  });
});

describe("(2) no Percolator custom code falls in the Lighthouse code space", () => {
  it("enum sizes match the pinned sources", () => {
    expect(WRAPPER.count).toBe(137);
    expect(PERCOLATOR.map((p) => [p.prog, p.codes.length, Math.min(...p.codes), Math.max(...p.codes)])).toEqual([
      ["wrapper", 137, 0, 136],
      ["stake", 46, 0, 45],
      ["nft", 28, 0, 27],
      ["matcher", 5, 8001, 8005],
    ]);
  });

  it("no wrapper/stake/nft/matcher code is in 6000..6016 or 0x1900..0x1900+1231", () => {
    const hits = PERCOLATOR.flatMap((p) => p.codes.filter(isRealLighthouseCode).map((c) => `${p.prog}:${c}`));
    expect(hits).toEqual([]);
    expect(MULTI_ASSERT_BASE + MAX_TX_BYTES).toBeLessThan(8001); // matcher's lowest code is still clear
    for (const p of PERCOLATOR) for (const c of p.codes) expect(LIGHTHOUSE_ERROR_CODES.has(c), `${p.prog}:${c}`).toBe(false);
  });

  it("no Percolator code is classified as Lighthouse, bare or attributed to its program", () => {
    for (const p of PERCOLATOR) {
      for (const c of p.codes) {
        const bare = `Transaction simulation failed: Error processing Instruction 0: custom program error: ${hex(c)}`;
        expect(isLighthouseError(bare), `${p.prog}:${c} bare`).toBe(false);
        expect(isLighthouseError(`{"InstructionError":[0,{"Custom":${c}}]}`), `${p.prog}:${c} json`).toBe(false);
        const logs = `Program ${PERC_ID} invoke [1]\nProgram ${PERC_ID} failed: custom program error: ${hex(c)}`;
        expect(isLighthouseError(logs), `${p.prog}:${c} attributed`).toBe(false);
      }
    }
  });

  it("controls: every real Lighthouse code attributed to Lighthouse IS classified Lighthouse", () => {
    for (const c of [...REAL_LIGHTHOUSE_TABLE.keys(), MULTI_ASSERT_BASE + 3]) {
      const logs = `Program ${LIGHTHOUSE_PROGRAM_ID_STR} invoke [1]\nProgram ${LIGHTHOUSE_PROGRAM_ID_STR} failed: custom program error: ${hex(c)}`;
      expect(isLighthouseError(logs), hex(c)).toBe(true);
    }
    // 0x1900 attributed to a Percolator program stays Percolator (program id checked first).
    expect(isLighthouseError(`Program ${PERC_ID} failed: custom program error: 0x1900`)).toBe(false);
  });
});

describe("(3) bare (unattributed) codes: only the exact 0x1900 is blamed on the guard", () => {
  const bare = (h: string) => `Transaction simulation failed: Error processing Instruction 0: custom program error: ${h}`;

  // Unattributed 6000+ codes are shared by every Anchor program (custom errors start at 6000 = 0x1770), so
  // a bare 0x1771 must not be blamed on Lighthouse. Kills a widened range such as 0x1000..0x1eff.
  it("bare 0x1900 is Lighthouse; neighbouring and Anchor-range codes are not", () => {
    expect(isLighthouseError(bare("0x1900"))).toBe(true);
    for (const c of [0x1000, 0x1770, 0x1771, 0x1780, 0x1901, 0x1903, 0x18ff, 0x1eff]) {
      expect(isLighthouseError(bare(hex(c))), hex(c)).toBe(false);
    }
  });

  // Kills a dropped trailing \b: 0x19001 / 0x1900a must not match as a prefix.
  it("0x1900 is matched as a whole hex token, not a prefix of a longer code", () => {
    for (const h of ["0x19001", "0x1900a", "0x1900F", "0x190000"]) {
      expect(isLighthouseError(bare(h)), h).toBe(false);
    }
    // Same for the JSON form: the `"Custom": 6400\b` regex must not match 64001.
    expect(isLighthouseError(`{"InstructionError":[0,{"Custom":64001}]}`)).toBe(false);
  });
});
