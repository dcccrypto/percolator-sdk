/**
 * Offline differential test: specs/wrapper-tags-v22.json and every wrapper tag constant the SDK encoders use
 * vs the v2.2 program's real `Instruction::decode` table. No cargo, no sibling repo, no RPC.
 *
 * `pnpm parity:check` only regenerates specs/wrapper-tags.json (and needs cargo), so nothing checked the v22
 * spec against today's program. The table below was hand-extracted with `git show` (no checkout, no build) from
 *
 *   dcccrypto/percolator-prog `feat/v22-rc23-2026-10-22` @ bc657392c31b217f58c4c153aed96bd7c24dad2c
 *   (2026-11-22 tip, "docs(#690): VERSION 19 no longer identifies the portfolio layout (re-land #692) (#769)")
 *
 *   - src/v16_program.rs:10078  `pub fn decode(input: &[u8])`, `match tag {` at :10082, `_ => Err` at :10969.
 *     `arm` below is the line of each `N =>` / `crate::constants::TAG_* =>` arm; `constLine` is the
 *     `pub const TAG_*: u8 = N;` line inside `pub mod constants` (:89) when the arm uses a named constant.
 *   - src/bin/sdk_parity_fixtures.rs:69 `variant_name`: the names. It maps four program variants to the
 *     SDK's names on purpose (Deposit -> DepositCollateral, Withdraw -> WithdrawCollateral,
 *     PermissionlessCrank -> KeeperCrank, ClosePortfolio -> CloseAccount), and collapses wire forms of one tag
 *     (InitMarket*, PushAuthMark*, RequestRedeemLpShares*, ExecuteRedemption*, SetAssetRiskLimits*,
 *     InitVaultLp*, SetVaultLpRisk*) to one name. The spec uses the same names, so the diff is exact.
 *
 * To re-pin: `git -C percolator-prog fetch && git show <sha>:src/v16_program.rs | sed -n '<decode range>p'`,
 * update PROG_SHA and the rows, and re-run this file. A renumbered, added or removed tag fails here offline.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IX_TAG } from "../src/abi/instructions.js";
import { IX_TAG_V22, IX_TAG_EXTENDED_V22 } from "../src/abi/v22-wire.js";
import { IX_TAG_P1 } from "../src/abi/risk-limits-p1.js";
import { IX_TAG_P2B } from "../src/abi/p2b-lock-exits.js";
import { IX_TAG_P2B_EARN } from "../src/abi/p2b-earn.js";
import { IX_TAG_P3 } from "../src/abi/p3.js";
import { TAG_LEV_GUARD_V22 } from "../src/abi/lev-guard-v22.js";
import { TAG_SET_DEPTH_SOURCE_V22 } from "../src/abi/v22-depth-source.js";
import { TAG_SET_CREATOR_FEE_PAYEE_V22 } from "../src/abi/creator-fee-payee-v22.js";

const PROG_SHA = "bc657392c31b217f58c4c153aed96bd7c24dad2c";
const PROG_BRANCH = "feat/v22-rc23-2026-10-22";

/** [tag, name (sdk_parity_fixtures.rs variant_name), arm line, constants line or 0] in src/v16_program.rs @ PROG_SHA. */
type Row = readonly [tag: number, name: string, arm: number, constLine: number];
const PROG: readonly Row[] = [
  [0, "InitMarket", 10083, 0],
  [1, "InitPortfolio", 10183, 0],
  [3, "DepositCollateral", 10184, 0],
  [4, "WithdrawCollateral", 10189, 0],
  [5, "KeeperCrank", 10194, 0],
  [6, "TradeNoCpi", 10212, 0],
  [8, "CloseAccount", 10290, 0],
  [9, "TopUpInsurance", 10300, 0],
  [10, "TradeCpi", 10224, 0],
  [13, "CloseSlab", 10313, 0],
  [19, "ResolveMarket", 10316, 0],
  [24, "TopUpBackingBucket", 10320, 0],
  [28, "ConvertReleasedPnl", 10334, 0],
  [30, "CloseResolved", 10339, 0],
  [32, "UpdateAuthority", 10342, 0],
  [34, "ConfigureHybridOracle", 10467, 0],
  [35, "ConfigureEwmaMark", 10488, 0],
  [36, "PushEwmaMark", 10497, 0],
  [37, "UpdateLiquidationFeePolicy", 10353, 0],
  [38, "ConfigurePermissionlessResolve", 10458, 0],
  [39, "ResolveStalePermissionless", 10464, 0],
  [40, "UpdateAssetLifecycle", 10504, 0],
  [41, "WithdrawInsurance", 10517, 0],
  [42, "CureAndCancelClose", 10526, 0],
  [43, "ForfeitRecoveryLeg", 10531, 0],
  [44, "RebalanceReduce", 10537, 0],
  [45, "FinalizeResetSide", 10543, 0],
  [46, "ClaimResolvedPayoutTopup", 10547, 0],
  [47, "RefineResolvedUnreceiptedBound", 10548, 0],
  [48, "SyncMaintenanceFee", 10551, 0],
  [49, "UpdateMaintenanceFeePolicy", 10357, 0],
  [50, "WithdrawBackingBucket", 10328, 0],
  [51, "UpdateBackingFeePolicy", 10361, 0],
  [52, "WithdrawBackingBucketEarnings", 10448, 0],
  [53, "SyncBackingDomainLedger", 10454, 0],
  [54, "SyncInsuranceLedger", 10457, 0],
  [55, "UpdateTradeFeePolicy", 10368, 0],
  [56, "TopUpInsuranceDomain", 10306, 0],
  [57, "WithdrawInsuranceAsset", 10520, 0],
  [58, "UpdateFeeRedirectPolicy", 10372, 0],
  [59, "UpdateMarketInitFeePolicy", 10381, 0],
  [60, "UpdateBaseUnitMints", 10385, 0],
  [61, "SwapSecondaryForPrimary", 10390, 0],
  [62, "ConfigureAuthMark", 10394, 0],
  [63, "PushAuthMark", 10401, 0],
  [64, "ForceCloseAbandonedAsset", 10436, 0],
  [65, "UpdateAssetAuthority", 10346, 0],
  [66, "BatchTradeNoCpi", 10237, 0],
  [67, "BatchTradeCpi", 10257, 0],
  [68, "SetMatcherConfig", 10282, 0],
  [69, "RestartAssetOracle", 10441, 0],
  [72, "TransferPortfolioOwnership", 10624, 0],
  [73, "SetNftProgramId", 10628, 0],
  [74, "CreateLpVault", 10555, 0],
  [75, "DepositToLpVault", 10561, 0],
  [76, "RequestRedeemLpShares", 10570, 0],
  [77, "ExecuteRedemption", 10596, 0],
  [78, "LpVaultCrankFees", 10615, 0],
  [79, "SetLpVaultPaused", 10618, 0],
  [80, "CloseLpVault", 10621, 0],
  [81, "CancelRedemption", 10622, 0],
  [82, "UnwrapEscrowedPortfolio", 10631, 0],
  [83, "InitMatcherCtx", 10634, 0],
  [84, "WithdrawProtocolFee", 10659, 0],
  [85, "SetProtocolFeeAuthority", 10663, 0],
  [86, "UpdateFeeSplit", 10722, 0],
  [87, "WithdrawInsuranceReserveToStake", 10728, 0],
  [88, "UpdateMaintenanceFeePerSlot", 10729, 0],
  [89, "ExpireBackingBucket", 10732, 0],
  [90, "WithdrawCreatorFee", 10741, 0],
  [91, "RebalanceLpVaultBacking", 10565, 0],
  [92, "UpdateInsuranceWithdrawPolicy", 10376, 0],
  [93, "SetAssetRiskLimits", 10666, 463],
  [94, "InitVaultLp", 10746, 0],
  [95, "VaultLpSetMatcher", 10771, 0],
  [96, "DepositJuniorTranche", 10787, 0],
  [97, "WithdrawJuniorTranche", 10790, 0],
  [98, "VaultLpRecall", 10793, 0],
  [99, "SetVaultLpRisk", 10797, 0],
  [100, "VaultLpConvertPnl", 10831, 0],
  [101, "VaultLpSettleResolved", 10834, 0],
  [102, "VaultLpReleaseSurplus", 10837, 0],
  [103, "VaultLpAllocate", 10853, 0],
  [104, "AdlWindDown", 10841, 576],
  [105, "SetAdlWindDownMaxSlots", 10847, 578],
  [106, "SettleHoldingRent", 10894, 581],
  [107, "InitBondTranche", 10856, 634],
  [108, "BondDeposit", 10862, 635],
  [109, "BondRequestWithdraw", 10866, 636],
  [110, "BondExecuteWithdraw", 10869, 637],
  [111, "InsuranceBackstopDraw", 10873, 651],
  [112, "RescueDeposit", 10877, 652],
  [116, "InitInsuranceUnits", 10882, 653],
  [117, "SetG9FeedAllowlist", 10883, 656],
  [118, "SweepBandDustLeg", 10898, 584],
  [119, "EvictAndTradeCpi", 10901, 590],
  [120, "ProposeG9FeedAllowlist", 10914, 658],
  [121, "CommitG9FeedAllowlist", 10927, 660],
  [122, "InitLpShareMetadata", 10928, 663],
  [123, "SetDepthSource", 10956, 673],
  [124, "LevGuard", 10939, 677],
  [125, "SetCreatorFeePayee", 10735, 684],
];

/** SDK alias names in IX_TAG -> the name the program table uses at that tag (both point at the same byte). */
const SDK_ALIASES: Record<string, string> = {
  InitUser: "InitPortfolio",
  Deposit: "DepositCollateral",
  Withdraw: "WithdrawCollateral",
  PermissionlessCrank: "KeeperCrank",
  ClosePortfolio: "CloseAccount",
};

/**
 * IX_TAG entries that are NOT a live v2.2 instruction under that name: v12.x / pre-v17 names kept for API
 * compatibility. Their encoders throw via `removedInstruction(...)` (checked below by source scan), so no byte
 * is ever produced. 45 of these 65 sit on a tag the program now gives to a DIFFERENT instruction (e.g. MintPositionNft
 * 64 = ForceCloseAbandonedAsset); the source scan proves no IX_TAG.<legacy> reference reaches the wire.
 */
const IX_TAG_LEGACY = new Set([
  "InitLP", "LiquidateAtOracle", "SetRiskThreshold", "UpdateAdmin", "LpVaultDeposit", "LpVaultWithdraw",
  "UpdateConfig", "SetMaintenanceFee", "SetOraclePriceCap", "AdminForceClose", "UpdateRiskParams", "SetPythOracle",
  "RenounceAdmin", "SetInsuranceWithdrawPolicy", "WithdrawInsuranceLimited", "FundMarketInsurance",
  "SetInsuranceIsolation", "DepositFeeCredits", "ResolvePermissionless", "ForceCloseResolved",
  "UpdateInsurancePolicy", "UnresolveMarket", "ChallengeSettlement", "ResolveDispute", "DepositLpCollateral",
  "WithdrawLpCollateral", "SetOffsetPair", "AttestCrossMargin", "PauseMarket", "UnpauseMarket", "MintPositionNft",
  "TransferPositionOwnership", "BurnPositionNft", "SetPendingSettlement", "ClearPendingSettlement",
  "TransferOwnershipCpi", "SetWalletCap", "SetOiImbalanceHardBlock", "RescueOrphanVault", "CloseOrphanSlab",
  "SetDexPool", "SetMaxPnlCap", "SetOiCapMultiplier", "SetDisputeParams", "InitSharedVault", "AllocateMarket",
  "QueueWithdrawalSV", "ClaimEpochWithdrawal", "AdvanceEpoch", "QueueWithdrawal", "ClaimQueuedWithdrawal",
  "CancelQueuedWithdrawal", "ExecuteAdl", "CloseStaleSlabs", "ReclaimSlabRent", "AuditCrank", "UpdateMarkPrice",
  "AcceptAdmin", "SetLpCollateralParams", "AdvanceOraclePhase", "SlashCreationDeposit", "SettleAccount",
  "ReclaimEmptyAccount", "TradeCpiV", "InitMatcherCtxV12",
]);

const byTag = new Map(PROG.map(([t, n]) => [t, n]));
const byName = new Map(PROG.map(([t, n]) => [n, t]));
const MAX_LIVE = Math.max(...PROG.map(([t]) => t));
const progGaps = Array.from({ length: MAX_LIVE + 1 }, (_, i) => i).filter((t) => !byTag.has(t));

const spec = JSON.parse(readFileSync(new URL("../specs/wrapper-tags-v22.json", import.meta.url), "utf8")) as {
  program: string; tags: { name: string; tag: number }[]; gaps: number[];
};

type Diff = { added: string[]; removed: string[]; renumbered: string[]; renamed: string[]; staleGaps: number[]; newGaps: number[] };
/** Diff a name->tag list against the program table. `added` = live in prog, missing from `side`. */
function diff(side: { name: string; tag: number }[], gaps: number[] | null, prog: readonly Row[] = PROG): Diff {
  const pTag = new Map(prog.map(([t, n]) => [t, n]));
  const pName = new Map(prog.map(([t, n]) => [n, t]));
  const sName = new Map(side.map((s) => [s.name, s.tag]));
  const sTag = new Map(side.map((s) => [s.tag, s.name]));
  const d: Diff = { added: [], removed: [], renumbered: [], renamed: [], staleGaps: [], newGaps: [] };
  for (const [t, n] of pTag) {
    if (sName.get(n) === t) continue;
    if (sName.has(n)) d.renumbered.push(`${n}: ${sName.get(n)} -> ${t}`);
    else if (sTag.has(t)) d.renamed.push(`${t}: ${sTag.get(t)} -> ${n}`);
    else d.added.push(`${n}=${t}`);
  }
  for (const { name, tag } of side) if (!pName.has(name) && !pTag.has(tag)) d.removed.push(`${name}=${tag}`);
  if (gaps) {
    const max = Math.max(...prog.map(([t]) => t));
    d.staleGaps = gaps.filter((g) => pTag.has(g));
    d.newGaps = Array.from({ length: max + 1 }, (_, i) => i).filter((t) => !pTag.has(t) && !gaps.includes(t));
  }
  return d;
}
const CLEAN: Diff = { added: [], removed: [], renumbered: [], renamed: [], staleGaps: [], newGaps: [] };

describe(`wrapper tags: specs/wrapper-tags-v22.json + SDK encoders vs percolator-prog ${PROG_BRANCH} @ ${PROG_SHA.slice(0, 8)}`, () => {
  it("the hand-extracted table is well formed", () => {
    expect(PROG_SHA).toMatch(/^[0-9a-f]{40}$/);
    expect(PROG).toHaveLength(102); // 126 bytes 0..125 minus 24 gaps
    expect(new Set(PROG.map(([t]) => t)).size).toBe(PROG.length);
    expect(new Set(PROG.map(([, n]) => n)).size).toBe(PROG.length);
    expect(new Set(PROG.map(([, , a]) => a)).size).toBe(PROG.length);
    // Every arm sits inside decode's match (10082 .. the `_ =>` at 10969).
    for (const [t, , a, c] of PROG) {
      expect(a > 10082 && a < 10969, `tag ${t} arm ${a}`).toBe(true);
      expect(c === 0 || (c > 89 && c < 1300), `tag ${t} const ${c}`).toBe(true);
    }
    expect(MAX_LIVE).toBe(125);
    expect(progGaps).toEqual([2, 7, 11, 12, 14, 15, 16, 17, 18, 20, 21, 22, 23, 25, 26, 27, 29, 31, 33, 70, 71, 113, 114, 115]);
  });

  it("spec vs prog: no added, removed, renumbered or renamed tags; gaps identical", () => {
    expect(spec.program).toBe("percolator-prog");
    expect(diff(spec.tags, spec.gaps)).toEqual(CLEAN);
    expect([...spec.gaps].sort((a, b) => a - b)).toEqual(progGaps);
    expect(spec.tags.map((t) => [t.tag, t.name])).toEqual(PROG.map(([t, n]) => [t, n]));
  });

  it("every v2.2 tag constant object matches the program by name and byte", () => {
    const objs: Record<string, Record<string, number>> = { IX_TAG_V22, IX_TAG_EXTENDED_V22, IX_TAG_P1, IX_TAG_P2B, IX_TAG_P2B_EARN, IX_TAG_P3 };
    const bad: string[] = [];
    for (const [obj, entries] of Object.entries(objs))
      for (const [name, tag] of Object.entries(entries)) if (byName.get(name) !== tag) bad.push(`${obj}.${name}=${tag} (prog ${byName.get(name)})`);
    const singles: [string, number, string][] = [
      ["TAG_LEV_GUARD_V22", TAG_LEV_GUARD_V22, "LevGuard"],
      ["TAG_SET_DEPTH_SOURCE_V22", TAG_SET_DEPTH_SOURCE_V22, "SetDepthSource"],
      ["TAG_SET_CREATOR_FEE_PAYEE_V22", TAG_SET_CREATOR_FEE_PAYEE_V22, "SetCreatorFeePayee"],
    ];
    for (const [k, v, n] of singles) if (byName.get(n) !== v) bad.push(`${k}=${v} (prog ${n}=${byName.get(n)})`);
    expect(bad).toEqual([]);
  });

  it("IX_TAG: every non-legacy entry is a live program tag under that name; every live tag has an IX_TAG or v22 constant", () => {
    const bad: string[] = [];
    const covered = new Set<number>();
    for (const [name, tag] of Object.entries(IX_TAG as Record<string, number>)) {
      if (IX_TAG_LEGACY.has(name)) continue;
      const prog = SDK_ALIASES[name] ?? name;
      if (byName.get(prog) !== tag) bad.push(`IX_TAG.${name}=${tag} (prog ${prog}=${byName.get(prog)})`);
      else covered.add(tag);
    }
    expect(bad).toEqual([]);
    for (const n of IX_TAG_LEGACY) expect(Object.hasOwn(IX_TAG, n), `legacy ${n} is in IX_TAG`).toBe(true);
    for (const o of [IX_TAG_V22, IX_TAG_P1, IX_TAG_P2B, IX_TAG_P2B_EARN, IX_TAG_P3]) for (const t of Object.values(o)) covered.add(t);
    for (const t of [TAG_LEV_GUARD_V22, TAG_SET_DEPTH_SOURCE_V22, TAG_SET_CREATOR_FEE_PAYEE_V22]) covered.add(t);
    expect(PROG.filter(([t]) => !covered.has(t)).map(([t, n]) => `${n}=${t}`)).toEqual([]);
  });

  // Source scan of src/abi: which tag byte does each encoder actually put first?
  const ABI = new URL("../src/abi/", import.meta.url);
  const files = readdirSync(ABI).filter((f) => f.endsWith(".ts"));
  const code = (f: string) => readFileSync(new URL(f, ABI), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/.*$/gm, "");

  it("every IX_TAG.<legacy> reference in src/abi is the tag argument of removedInstruction(...) (throws, emits no byte)", () => {
    const emitted: string[] = [];
    for (const f of files) {
      const src = code(f);
      for (const m of src.matchAll(/\bIX_TAG\.([A-Za-z0-9]+)/g)) {
        const name = m[1]!;
        if (!IX_TAG_LEGACY.has(name)) continue;
        // removedInstruction(<string literal>, IX_TAG.X ...
        const before = src.slice(Math.max(0, m.index! - 400), m.index!);
        if (!/removedInstruction\(\s*(?:"[^"]*"|'[^']*'|`[^`]*`)\s*,\s*$/.test(before)) emitted.push(`${f}: IX_TAG.${name}`);
      }
    }
    expect(emitted).toEqual([]);
  });

  it("literal tag bytes in wrapper encoders match the program", () => {
    // `encU8(<n>)` as the FIRST field of an instruction. v22-stake.ts is the stake program's namespace (not the wrapper).
    const found: string[] = [];
    for (const f of files.filter((x) => x !== "v22-stake.ts" && x !== "nft.ts" && x !== "matcher-v2.ts")) {
      for (const m of code(f).matchAll(/(?:concatBytes\(\s*|^\s*const data = concatBytes\(\s*)encU8\((\d+)\)/gm)) found.push(`${f}:${m[1]}`);
    }
    // The two literal-tag encoders: encodeInitMatcherCtx (83) and encodeSetVaultLpRiskV19P2b (99).
    expect(found.sort()).toEqual(["instructions.ts:83", "p2b-earn.ts:99"]);
    expect([byTag.get(83), byTag.get(99)]).toEqual(["InitMatcherCtx", "SetVaultLpRisk"]);
  });

  it("the diff catches a renumbered, added, removed tag and a stale gap (mutations)", () => {
    const base = PROG.map(([tag, name]) => ({ name, tag }));
    const renum = PROG.map((r) => (r[0] === 124 ? ([126, r[1], r[2], r[3]] as const) : r));
    expect(diff(base, progGaps, renum).renumbered).toEqual(["LevGuard: 124 -> 126"]);
    const added = [...PROG, [126, "NewThing", 10968, 0] as const];
    expect(diff(base, progGaps, added).added).toEqual(["NewThing=126"]);
    const removed = PROG.filter(([t]) => t !== 125);
    expect(diff(base, progGaps, removed).removed).toEqual(["SetCreatorFeePayee=125"]);
    const filled = [...PROG, [113, "OracleGraduation", 10968, 0] as const];
    const d = diff(base, progGaps, filled);
    expect([d.added, d.staleGaps]).toEqual([["OracleGraduation=113"], [113]]);
    const renamed = PROG.map((r) => (r[0] === 87 ? ([87, "Renamed", r[2], r[3]] as const) : r));
    expect(diff(base, progGaps, renamed).renamed).toEqual(["87: WithdrawInsuranceReserveToStake -> Renamed"]);
  });
});
