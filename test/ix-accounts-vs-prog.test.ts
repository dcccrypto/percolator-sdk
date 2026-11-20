/**
 * v2.2 builder account lists vs percolator-prog feat/v22-rc23-2026-10-22 d27f3d73 handlers (tags >= 100).
 * From the J-20261120-SDK-REPORT-IXACCOUNTSVSPROG draft tests (M3, M4, M5). Each case failed on
 * feat/v22-sdk-growth c6037802. Rust line numbers are src/v16_program.rs at d27f3d73.
 *
 * M1 (tag 102 Live) and M2 (tag 103) are not here: the raw P3 / P2b builders are the documented pre-#640 / #641
 * inputs to withNavFlowTailV22, and the v2.2 forms are buildVaultLpReleaseSurplusLiveIxV22 / buildVaultLpAllocateIxV22
 * (pinned in test/v22-nav-flow.test.ts).
 */
import { describe, it, expect } from "vitest";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  planResolvedVaultLpExitP3,
  buildRescueDepositIxV22,
  buildClearDepthSourceIxV22,
  deriveBondTrancheV22,
  derivePoolClaimV22,
} from "../src/index.js";

const k = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
const programId = k(1);
const market = k(2);
const m = { programId, market, registryDomain: 0, lpPortfolio: k(3) };

describe("M3 tag 102 Resolved: planResolvedVaultLpExitP3 junior can carry the bond tranche [11]", () => {
  // Rust: Resolved path -> load_bond_tranche_if_flagged(program_id, accounts, 11, ..) :42556 -> account(accounts, idx)? :43109
  // (NotEnoughAccountKeys once the registry bond flag is set).
  const crankFeesIx = new TransactionInstruction({ programId, keys: Array.from({ length: 6 }, (_, i) => ({ pubkey: k(40 + i), isSigner: false, isWritable: true })), data: Buffer.from([78]) });
  const junior = { juniorOwner: k(9), amount: 1n, sourceDomain: 0, juniorDestToken: k(10), vaultToken: k(11) };
  it("a bond market's junior release carries the read-only tranche at [11]", () => {
    const plan = planResolvedVaultLpExitP3({ market: m, crankFeesIx, seniorRedemptionIxs: [], junior: { ...junior, bondTranche: true } });
    const [tranche] = deriveBondTrancheV22(programId, market);
    expect(plan.junior?.keys.length).toBe(12);
    expect(plan.junior?.keys[11]?.pubkey.equals(tranche)).toBe(true);
    expect(plan.junior?.keys[11]?.isWritable).toBe(false);
  });
  it("without bondTranche the junior keeps the 11-account Resolved form", () => {
    expect(planResolvedVaultLpExitP3({ market: m, crankFeesIx, seniorRedemptionIxs: [], junior }).junior?.keys.length).toBe(11);
  });
});

describe("M4 tag 112: buildRescueDepositIxV22 no longer drops the bound tail [11..12] silently", () => {
  // Rust: handle_rescue_deposit: registry_vault_lp_bound :41640 -> load_bound_vault_lp_tail(accounts, 11, ..) :41641-41649 (fail closed).
  const unbound = { programId, market, registryDomain: 0 };
  it("refuses to build without the bound vault LP instead of emitting an 11-account ix", () => {
    expect(() => buildRescueDepositIxV22(unbound, k(9), k(10), k(11), k(12), 1_000_000n, 1n)).toThrow(/lpPortfolio/);
  });
  it("opts.unbound still builds the 11-account form for a registry with no bound vault LP", () => {
    expect(buildRescueDepositIxV22(unbound, k(9), k(10), k(11), k(12), 1_000_000n, 1n, 0, { unbound: true }).keys).toHaveLength(11);
  });
  it("a bound vault still gets [11] vault_lp_state and [12] LP, both writable", () => {
    const ix = buildRescueDepositIxV22(m, k(9), k(10), k(11), k(12), 1_000_000n, 1n);
    expect(ix.keys).toHaveLength(13);
    expect(ix.keys[12]?.pubkey.equals(m.lpPortfolio)).toBe(true);
    expect(ix.keys.slice(11).every((x) => x.isWritable)).toBe(true);
  });
});

describe("M5 tag 123 op 0: buildClearDepthSourceIxV22 requires the pinned pool's claim [5]", () => {
  // Rust: handle_set_depth_source op 0: `if old.pool != [0u8; 32]` :40729 -> pool_claim_release(.., account(accounts, 5)?, ..) :40730;
  // an active pin always has pool != 0 (depth_src_v22.rs validate_depth_source :418).
  it("clearing without naming the pinned pool is refused at build time (it can only fail on chain)", () => {
    expect(() => buildClearDepthSourceIxV22(programId, k(9), market)).toThrow(/pinnedPool/);
  });
  it("with the pinned pool it carries the writable claim at [5]", () => {
    const ix = buildClearDepthSourceIxV22(programId, k(9), market, 0, 0n, k(20));
    expect(ix.keys).toHaveLength(6);
    expect(ix.keys[5]?.pubkey.equals(derivePoolClaimV22(programId, k(20))[0])).toBe(true);
    expect(ix.keys[5]?.isWritable).toBe(true);
  });
});
