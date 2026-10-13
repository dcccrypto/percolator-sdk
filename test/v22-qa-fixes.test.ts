/**
 * QA v2.2 SDK fixes (2026-10-11): Q-1 (trade fee to sign + Custom 9 hint), Q-2 (error attribution by failing
 * program), Q-5 (honest devnet defaults, NFT id env, tag 39), P-2 (withdraw with open legs -> 19).
 *
 * Fixture test/fixtures/v22-qa-devnet-2026-10-11.json was captured from devnet by READ-ONLY simulateTransaction
 * (sigVerify:false, nothing sent) against the v2.2 fresh programs, plus raw account bytes. Each block carries a
 * negative control that fails if the fix is reverted.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import {
  parseErrorFromLogs,
  getContextualErrorHint,
  PERCOLATOR_ERRORS,
  NFT_ERRORS,
  computeTradeFeeBpsToSignV22,
  matcherFeeWorstCaseBpsV22,
  readTradeFeeInputsV22,
  encodeResolveStalePermissionless,
  encodeResolveStalePermissionlessV22,
  buildResolveStalePermissionlessIxV22,
  staleResolveStatusV22,
  staleResolveErrorContextV22,
  ACCOUNTS_RESOLVE_STALE_PERMISSIONLESS_V22,
  IX_TAG,
  PROGRAM_IDS,
  PROGRAM_IDS_V17,
  PROGRAM_IDS_DEVNET_V22,
  NFT_PROGRAM_IDS,
  getProgramId,
  getMatcherProgramId,
  getStakeProgramId,
  STAKE_PROGRAM_IDS,
  NFT_PROGRAM_ID,
  resolveNftProgramOverride,
  CANONICAL_VAULT_LP_MATCHER_PROGRAM_DEVNET_P3,
} from "../src/index.js";

interface SimRec { label?: string; slot: number; err: unknown; logs: string[]; data?: string; feeBps?: string; openLegs?: number }
const FX = JSON.parse(readFileSync(new URL("./fixtures/v22-qa-devnet-2026-10-11.json", import.meta.url), "utf8")) as {
  programs: Record<"wrapper" | "stake" | "matcher" | "nft", string>;
  stakeRefusals: SimRec[];
  tradeCpiJup: { sims: SimRec[] };
  resolveTag39: SimRec[];
  withdraw: SimRec[];
  accounts: { capturedAtSlot: number; accounts: Record<string, { dataBase64: string }> };
};
const acct = (k: string): Uint8Array => new Uint8Array(Buffer.from(FX.accounts.accounts[k]!.dataBase64, "base64"));
const customOf = (err: unknown): number | undefined => {
  const e = err as { InstructionError?: [number, { Custom?: number } | string] } | null;
  const inner = e?.InstructionError?.[1];
  return typeof inner === "object" && inner !== null ? inner.Custom : undefined;
};
/** Replace the failing program id on the error line (negative control: same bytes, other program). */
const reattribute = (logs: string[], from: string, to: string): string[] => logs.map((l) => (l.includes("failed: custom program error") ? l.replace(from, to) : l));

// ============================================================================
// Q-2: attribute a custom error to the program that failed
// ============================================================================
describe("Q-2 parseErrorFromLogs attributes by failing program (real devnet stake logs)", () => {
  const expected: Record<number, string> = { 29: "NoRealLpHolders", 33: "ConsentRequired", 41: "NotSupportedOnFirstLoss", 5: "ZeroAmount" };
  for (const rec of FX.stakeRefusals) {
    const code = customOf(rec.err)!;
    it(`stake ${code} decodes with the stake table (${rec.label})`, () => {
      const p = parseErrorFromLogs(rec.logs)!;
      expect(p.code).toBe(code);
      expect(p.program).toBe("stake");
      expect(p.programId).toBe(FX.programs.stake);
      expect(p.name).toBe(expected[code]);
      expect(p.name).not.toBe(PERCOLATOR_ERRORS[code]?.name);
    });
    it(`negative control: the same line from the wrapper decodes ${code} as the wrapper error`, () => {
      const p = parseErrorFromLogs(reattribute(rec.logs, FX.programs.stake, FX.programs.wrapper))!;
      expect(p.program).toBe("wrapper");
      expect(p.name).toBe(PERCOLATOR_ERRORS[code]!.name);
    });
  }

  it("covers the codes QA named that devnet can still produce (29, 33, 41) plus a colliding low code (5)", () => {
    expect(FX.stakeRefusals.map((r) => customOf(r.err)).sort((a, b) => a! - b!)).toEqual([5, 29, 33, 41]);
  });

  it("stake 28 (unreachable on current devnet pools: every floor is locked) decodes by name with a stake id", () => {
    const p = parseErrorFromLogs([`Program ${FX.programs.stake} failed: custom program error: 0x1c`])!;
    expect(p).toMatchObject({ program: "stake", code: 28, name: "DepositBelowMinimumLiquidity" });
    expect(p.hint).toMatch(/1,000 atoms/);
  });

  it("an unknown program falls back to the wrapper table (legacy) and says so", () => {
    const p = parseErrorFromLogs(["Program 9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin failed: custom program error: 0x1d"])!;
    expect(p.program).toBe("unknown");
    expect(p.name).toBe("InvalidOracleKey");
  });

  it("caller-declared ids attribute a fresh (unlisted) stake deployment", () => {
    const fresh = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
    const p = parseErrorFromLogs([`Program ${fresh} failed: custom program error: 0x21`], { programIds: { stake: [new PublicKey(fresh)] } })!;
    expect(p).toMatchObject({ program: "stake", name: "ConsentRequired" });
  });

  it("matcher, nft and SPL token failures use their own tables", () => {
    expect(parseErrorFromLogs([`Program ${FX.programs.matcher} failed: custom program error: 0x1f42`])).toMatchObject({ program: "matcher", code: 8002, name: "ERR_STALE_MARK" });
    expect(parseErrorFromLogs([`Program ${FX.programs.nft} failed: custom program error: 0x1b`])).toMatchObject({ program: "nft", code: 27, name: NFT_ERRORS[27]!.name });
    expect(parseErrorFromLogs(["Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA failed: custom program error: 0x1"])).toMatchObject({ program: "token", name: "InsufficientFunds" });
  });

  it("a CPI chain attributes to the innermost failing program (first failed line)", () => {
    const logs = [
      `Program ${FX.programs.wrapper} invoke [1]`,
      `Program ${FX.programs.matcher} invoke [2]`,
      `Program ${FX.programs.matcher} failed: custom program error: 0x1f42`,
      `Program ${FX.programs.wrapper} failed: custom program error: 0x1f42`,
    ];
    expect(parseErrorFromLogs(logs)).toMatchObject({ program: "matcher", name: "ERR_STALE_MARK" });
  });
});

// ============================================================================
// Q-1: the fee to sign, and the Custom 9 message
// ============================================================================
describe("Q-1 computeTradeFeeBpsToSignV22 (real JUP market + matcher context)", () => {
  const inputs = readTradeFeeInputsV22(acct("jupMarket"), 0, acct("jupMatcherCtx"));

  it("reads base 30, program max 700, P1 request cap 100 (channel on), matcher max_total 100", () => {
    expect(inputs).toEqual({ tradeFeeBaseBps: 30n, maxTradingFeeBps: 700n, maxRequestedFeeBps: 100, matcherExtMode: 1, matcherMaxTotalBps: 100 });
  });

  it("signs base + worst matcher fee + margin = 135, inside the program's [30, 700]", () => {
    const r = computeTradeFeeBpsToSignV22(inputs);
    expect(r).toEqual({ feeBps: 135n, minFeeBps: 30n, maxFeeBps: 700n, matcherFeeWorstCaseBps: 100, worstCaseFeeBps: 130n, coversWorstCase: true });
  });

  it("devnet evidence: base-only (30) and 701 were refused with 9; the helper's 135 simulated clean", () => {
    const by = Object.fromEntries(FX.tradeCpiJup.sims.map((s) => [s.feeBps, s]));
    expect(customOf(by["30"]!.err)).toBe(9);
    expect(customOf(by["701"]!.err)).toBe(9);
    expect(by["135"]!.err).toBeNull();
    expect(computeTradeFeeBpsToSignV22(inputs).feeBps).toBe(135n);
  });

  it("negative control: the old app rule (base fee only) is below the fee the program needs", () => {
    const r = computeTradeFeeBpsToSignV22(inputs);
    expect(inputs.tradeFeeBaseBps).toBeLessThan(r.worstCaseFeeBps);
  });

  it("is bounded by the program maximum and reports when the worst case cannot be covered", () => {
    const r = computeTradeFeeBpsToSignV22({ tradeFeeBaseBps: 30n, maxTradingFeeBps: 100n, maxRequestedFeeBps: 1023, matcherMaxTotalBps: 9000 });
    expect(r.feeBps).toBe(100n);
    expect(r.coversWorstCase).toBe(false);
  });

  it("channel off (max_requested 0 or ext mode 0): no matcher fee, base + margin", () => {
    expect(computeTradeFeeBpsToSignV22({ tradeFeeBaseBps: 30n, maxTradingFeeBps: 700n, maxRequestedFeeBps: 0 }).feeBps).toBe(35n);
    expect(matcherFeeWorstCaseBpsV22({ tradeFeeBaseBps: 30n, maxTradingFeeBps: 700n, maxRequestedFeeBps: 100, matcherExtMode: 0 })).toBe(0);
  });

  it("quote-based matcher fee, utilisation fee and margin", () => {
    const r = computeTradeFeeBpsToSignV22(inputs, { expectedMatcherFeeBps: 25, utilFeeBps: 10, marginBps: 10 });
    expect(r.feeBps).toBe(75n);
    expect(r.worstCaseFeeBps).toBe(140n);
  });

  it("refuses a market whose base fee is above its maximum", () => {
    expect(() => computeTradeFeeBpsToSignV22({ tradeFeeBaseBps: 800n, maxTradingFeeBps: 700n, maxRequestedFeeBps: 0 })).toThrow(/every trade is refused/);
  });

  it("Custom 9 no longer blames a version mismatch first; the trade hint names the real causes", () => {
    const rec = FX.tradeCpiJup.sims.find((s) => s.feeBps === "30")!;
    const generic = parseErrorFromLogs(rec.logs)!;
    expect(generic).toMatchObject({ program: "wrapper", code: 9 });
    expect(generic.hint).not.toMatch(/^Unknown instruction tag/);
    expect(generic.hint).toMatch(/max fee/);
    const trade = parseErrorFromLogs(rec.logs, { context: { action: "trade" } })!;
    expect(trade.hint).toMatch(/base fee plus the matcher's fee/);
    expect(trade.hint).toMatch(/limit price/);
    expect(trade.hint).toMatch(/4 positions/);
    expect(trade.hint).toMatch(/computeTradeFeeBpsToSignV22/);
  });
});

// ============================================================================
// P-2: withdraw with an open leg -> 19
// ============================================================================
describe("P-2 withdraw with open positions (real devnet 19)", () => {
  const rec = FX.withdraw.find((w) => (w.openLegs ?? 0) > 0)!;
  it("the fixture is a real 19 from a portfolio with an open leg; the flat one simulated clean", () => {
    expect(customOf(rec.err)).toBe(19);
    expect(FX.withdraw.find((w) => w.openLegs === 0)!.err).toBeNull();
  });
  it("with context: close positions first", () => {
    const p = parseErrorFromLogs(rec.logs, { context: { action: "withdraw", openLegs: rec.openLegs } })!;
    expect(p.hint).toMatch(/^Close your open positions first, then withdraw/);
  });
  it("negative control: flat context does not claim open positions, and no hint says the mark was not updated", () => {
    const p = parseErrorFromLogs(rec.logs, { context: { action: "withdraw", openLegs: 0 } })!;
    expect(p.hint).not.toMatch(/^Close your open positions/);
    expect(parseErrorFromLogs(rec.logs)!.hint).not.toMatch(/mark price has not been updated/);
    expect(getContextualErrorHint(19)).toBe(PERCOLATOR_ERRORS[19]!.hint);
  });
});

// ============================================================================
// Q-5: devnet defaults = the deployed v2.2 set; NFT env; tag 39
// ============================================================================
describe("Q-5 devnet defaults are the deployed v2.2 programs", () => {
  it("wrapper / matcher / stake / nft defaults", () => {
    expect(PROGRAM_IDS.devnet.percolator).toBe("6kpg2wi7vwkn7E9rvodXSktYRhna8TWjiZrC1dBek6NM");
    expect(getProgramId("devnet").toBase58()).toBe(PROGRAM_IDS_DEVNET_V22.percolator);
    expect(getMatcherProgramId("devnet").toBase58()).toBe("AsHvEJ8zNctKmdeS57H5E4w6nkTLi3bPVpd6ZCLc2ayN");
    expect(getStakeProgramId("devnet").toBase58()).toBe("7JrgAUHi4PxaRv5JKHoGAxodDFbozYexpERei66Xgq4V");
    expect(STAKE_PROGRAM_IDS.devnet).toBe(PROGRAM_IDS_DEVNET_V22.vault);
    expect(NFT_PROGRAM_IDS.devnet).toBe("27LWmR72Ru1NCkbN2xgxB7BgYcTUrU7qeEJoV3D8sZh1");
    expect(PROGRAM_IDS_V17).toBe(PROGRAM_IDS_DEVNET_V22);
    expect(CANONICAL_VAULT_LP_MATCHER_PROGRAM_DEVNET_P3).toBe(PROGRAM_IDS_DEVNET_V22.matcher);
  });
  it("negative control: no default is a never-deployed v2.1 RC id", () => {
    const rc = ["5NGgnU2j315Ci2tso8VJDEthaVExuiKG3tn4xnur28xe", "DfTxJUT5BbERs1tR33dP82kaUJ1NLymRxXErXAYXcDam", "DWUNq2iYh6Sdgdv3qv7aWJNJGhoK25FqyQrqDUrDD9zs", "A6DVNubvzMMETQinK6bipekkaTTrkUu2RMw2kBoJrdkE"];
    const defaults = [PROGRAM_IDS.devnet.percolator, PROGRAM_IDS.devnet.matcher, STAKE_PROGRAM_IDS.devnet, NFT_PROGRAM_ID.toBase58(), CANONICAL_VAULT_LP_MATCHER_PROGRAM_DEVNET_P3, ...Object.values(PROGRAM_IDS_V17)];
    for (const id of rc) expect(defaults).not.toContain(id);
  });
  it("NFT_PROGRAM_ID = the v2.2 NFT needs no override opt-in", () => {
    const env = (k: string): string | undefined => (k === "NFT_PROGRAM_ID" ? "27LWmR72Ru1NCkbN2xgxB7BgYcTUrU7qeEJoV3D8sZh1" : undefined);
    expect(resolveNftProgramOverride(env)).toBe("27LWmR72Ru1NCkbN2xgxB7BgYcTUrU7qeEJoV3D8sZh1");
  });
  it("negative control: an unlisted NFT id (incl. the v2.1 RC id) still throws without the opt-in", () => {
    const env = (k: string): string | undefined => (k === "NFT_PROGRAM_ID" ? "DWUNq2iYh6Sdgdv3qv7aWJNJGhoK25FqyQrqDUrDD9zs" : undefined);
    expect(() => resolveNftProgramOverride(env)).toThrow(/not a known NFT program address/);
  });
});

describe("Q-5 tag 39 ResolveStalePermissionless (wrapper RC 6c078a0e)", () => {
  it("wire: [39, now_slot u64 LE], 9 bytes — the exact bytes devnet simulated", () => {
    const sent = FX.resolveTag39.find((r) => r.label!.startsWith("tag39 CODEC"))!;
    expect(Buffer.from(encodeResolveStalePermissionless(509_899_484n)).toString("hex")).toBe(sent.data);
    expect(sent.data).toBe("27dc72641e00000000");
    expect(IX_TAG.ResolveStalePermissionless).toBe(39);
    expect(encodeResolveStalePermissionlessV22).toBe(encodeResolveStalePermissionless);
  });
  it("accounts: [market writable, not signer]", () => {
    expect(ACCOUNTS_RESOLVE_STALE_PERMISSIONLESS_V22).toEqual([{ name: "market", signer: false, writable: true }]);
    const m = new PublicKey(PROGRAM_IDS_DEVNET_V22.nft);
    const ix = buildResolveStalePermissionlessIxV22(getProgramId("devnet"), m, 1n);
    expect(ix.keys).toEqual([{ pubkey: m, isSigner: false, isWritable: true }]);
    expect(ix.programId.toBase58()).toBe(PROGRAM_IDS_DEVNET_V22.percolator);
  });
  it("devnet: resolved CODEC -> 21, live PENGU (not matured) -> 27, matured live SOL-v0 -> success; trailing/short payload -> InvalidInstructionData", () => {
    const by = (p: string) => FX.resolveTag39.find((r) => r.label!.startsWith(p))!;
    expect(customOf(by("tag39 CODEC").err)).toBe(21);
    expect(customOf(by("tag39 PENGU").err)).toBe(27);
    expect(by("tag39 SOL-v0").err).toBeNull();
    for (const p of ["tag39-trailing-byte", "tag39-short"]) {
      for (const r of FX.resolveTag39.filter((x) => x.label!.startsWith(p))) expect(r.err).toEqual({ InstructionError: [0, "InvalidInstructionData"] });
    }
    expect(parseErrorFromLogs(by("tag39 CODEC").logs)).toMatchObject({ program: "wrapper", name: "EngineLockActive" });
  });
  it("staleResolveStatusV22 predicts the program on real account bytes", () => {
    const slot = BigInt(FX.accounts.capturedAtSlot);
    expect(staleResolveStatusV22(acct("codecMarket"), slot)).toMatchObject({ mode: 1, canResolve: false, refusalCode: 21 });
    const v0 = staleResolveStatusV22(acct("solV0Market"), slot);
    expect(v0).toMatchObject({ mode: 0, staleSlots: 18_000n, canResolve: true, refusalCode: null });
    // negative control: one slot before maturity it is refused 27
    expect(staleResolveStatusV22(acct("solV0Market"), v0.maturesAtSlot! - 1n)).toMatchObject({ canResolve: false, refusalCode: 27 });
  });
  it("rejects a non-u64 slot", () => {
    expect(() => encodeResolveStalePermissionless(-1n)).toThrow();
    expect(() => encodeResolveStalePermissionless(1n << 64n)).toThrow();
    expect(() => encodeResolveStalePermissionless(Number.MAX_SAFE_INTEGER + 2)).toThrow();
  });
});

// ============================================================================
// P-4: 104 copy says which close is refused (favourable TO THE CLOSER while pinned)
// ============================================================================
describe("P-4 error 104 copy", () => {
  it("keeps the on-chain name and says the close would beat the market price", () => {
    expect(PERCOLATOR_ERRORS[104]!.name).toBe("PriceBandPinned");
    expect(PERCOLATOR_ERRORS[104]!.hint).toMatch(/hasn't caught up yet/);
    expect(PERCOLATOR_ERRORS[104]!.hint).toMatch(/better price than the market/);
    expect(PERCOLATOR_ERRORS[104]!.hint).toMatch(/Closing in the other direction/);
  });
  it("negative control: no longer promises closing resumes in a few seconds", () => {
    expect(PERCOLATOR_ERRORS[104]!.hint).not.toMatch(/closing resumes in a few seconds/);
    const p = parseErrorFromLogs([`Program ${FX.programs.wrapper} failed: custom program error: 0x68`])!;
    expect(p).toMatchObject({ program: "wrapper", code: 104, name: "PriceBandPinned" });
    expect(p.hint).toMatch(/better price than the market/);
  });
});

// ============================================================================
// Minor (QA 2026-10-11): matcher unknown code, 104 wording, 27 on tag 39
// ============================================================================
describe("Minor QA items", () => {
  it("104 copy is true when the price is only lagging: it does not say pinned", () => {
    expect(PERCOLATOR_ERRORS[104]!.hint).not.toMatch(/pinned/i);
    expect(PERCOLATOR_ERRORS[104]!.hint).toMatch(/Try again shortly/);
  });

  it("a code the matcher does not define (9) is explained, never given the wrapper's name", () => {
    const p = parseErrorFromLogs([`Program ${FX.programs.matcher} failed: custom program error: 0x9`])!;
    expect(p).toMatchObject({ program: "matcher", code: 9, name: "Unknown(9)" });
    expect(p.hint).toMatch(/does not define \(its own codes are 8001-8005\)/);
    expect(p.name).not.toBe(PERCOLATOR_ERRORS[9]!.name);
  });
  it("negative control: a defined matcher code keeps its own hint, and the wrapper's 9 is unchanged", () => {
    expect(parseErrorFromLogs([`Program ${FX.programs.matcher} failed: custom program error: 0x1f42`])!.hint).toMatch(/^Matcher refused/);
    expect(parseErrorFromLogs([`Program ${FX.programs.wrapper} failed: custom program error: 0x9`])!.name).toBe("InvalidInstruction");
    expect(parseErrorFromLogs(["Program 9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin failed: custom program error: 0xff"])!.hint).toBeUndefined();
  });

  const pengu = FX.resolveTag39.find((r) => r.label!.startsWith("tag39 PENGU"))!;
  it("27 on tag 39 (real devnet PENGU refusal) says how many slots are left", () => {
    const p = parseErrorFromLogs(pengu.logs, { context: { action: "resolve", staleSlotsRemaining: 17_272n } })!;
    expect(p).toMatchObject({ program: "wrapper", code: 27, name: "OracleStale" });
    expect(p.hint).toBe("This market's price has not been stale for long enough to resolve yet: 17,272 more slots (about 116 min) without a price update are needed. A new price update restarts the wait.");
  });
  it("staleResolveStatusV22 gives slotsRemaining and the context helper carries it", () => {
    const v0 = staleResolveStatusV22(acct("solV0Market"), BigInt(FX.accounts.capturedAtSlot));
    expect(v0.slotsRemaining).toBe(0n);
    const early = staleResolveStatusV22(acct("solV0Market"), v0.maturesAtSlot! - 100n);
    expect(early).toMatchObject({ refusalCode: 27, slotsRemaining: 100n });
    expect(staleResolveErrorContextV22(early)).toEqual({ action: "resolve", staleSlotsRemaining: 100n });
    expect(getContextualErrorHint(27, staleResolveErrorContextV22(early))).toMatch(/100 more slots \(under a minute\)/);
  });
  it("disabled window, unknown remaining, and already-resolved (21) wording", () => {
    expect(getContextualErrorHint(27, { action: "resolve", staleSlotsRemaining: null })).toMatch(/turned off/);
    expect(getContextualErrorHint(27, { action: "resolve" })).toMatch(/not been stale for long enough/);
    expect(getContextualErrorHint(21, { action: "resolve" })).toBe("This market is already resolved.");
  });
  it("negative control: without the resolve context 27 keeps the generic stale-price hint", () => {
    expect(parseErrorFromLogs(pengu.logs)!.hint).toBe(PERCOLATOR_ERRORS[27]!.hint);
    expect(getContextualErrorHint(27, { action: "trade" })).toBe(PERCOLATOR_ERRORS[27]!.hint);
    expect(getContextualErrorHint(21, { action: "trade" })).toBe(PERCOLATOR_ERRORS[21]!.hint);
  });
});
