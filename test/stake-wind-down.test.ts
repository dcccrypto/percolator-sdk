/**
 * F-9 stake wind-down: tags 29/30 (percolator-stake #301 @ f9b9190), the Withdraw slab-omission,
 * the tag-41 terminal-capacity decoder (wrapper 6377376a / engine 35ddd692), and the planner.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  STAKE_IX,
  STAKE_ERRORS,
  encodeStakeRecoverTerminalInsurance,
  encodeStakeAdminCloseSlab,
  recoverTerminalInsuranceAccounts,
  adminCloseSlabAccounts,
  withdrawAccounts,
} from "../src/solana/stake.js";
import {
  decodeTerminalInsuranceCapacity,
  buildRecoverTerminalInsuranceIx,
  buildAdminCloseSlabIx,
  planStakeWindDown,
  MARKET_GROUP_HEADER_OFF_V18,
  ENGINE_ASSET_SLOT_OFF_V18,
  ENGINE_BOUND_SCALE,
} from "../src/solana/stake-wind-down.js";
import { V17_MARKET_GROUP_OFF, V17_MARKET_GROUP_LEN, V17_MARKET_ASSET_SLOT_LEN } from "../src/solana/slab.js";
import { deriveVaultAuthority } from "../src/solana/pda.js";
import * as root from "../src/index.js";

const pk = (): PublicKey => Keypair.generate().publicKey;
const W = new PublicKey("ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB");
const STAKE = new PublicKey("GCHhcgwPyrai8SWHEVWw3odedguFXEtJobNnWSfWBCU3");

describe("stake tags 29 / 30 and errors (f9b9190)", () => {
  it("tag 29 = [29][amount u64 LE] (9 B); tag 30 = [30] (1 B)", () => {
    expect(STAKE_IX.RecoverTerminalInsurance).toBe(29);
    expect(STAKE_IX.AdminCloseSlab).toBe(30);
    expect(Buffer.from(encodeStakeRecoverTerminalInsurance(0x0102030405060708n)).toString("hex")).toBe("1d0807060504030201");
    expect(Array.from(encodeStakeRecoverTerminalInsurance(0))).toEqual([29, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(Array.from(encodeStakeAdminCloseSlab())).toEqual([30]);
    expect(() => encodeStakeRecoverTerminalInsurance(1n << 64n)).toThrow();
  });
  it("errors 29 NoRealLpHolders, 30 MarketNotTerminal, 31 NothingToRecover", () => {
    expect(STAKE_ERRORS[29]).toMatch(/No real LP holders/);
    expect(STAKE_ERRORS[30]).toMatch(/Market not terminal/);
    expect(STAKE_ERRORS[31]).toMatch(/Nothing to recover/);
    expect(STAKE_ERRORS[32]).toMatch(/Unsupported wrapper layout.*NOT retryable/);
    expect(STAKE_ERRORS[33]).toBeUndefined();
  });
  const t29 = { caller: pk(), pool: pk(), poolVault: pk(), vaultAuth: pk(), market: pk(), wrapperVault: pk(), wrapperVaultAuthority: pk(), wrapperProgram: W };
  it("tag 29 accounts: 9, caller NOT a signer; 10 with the stray (writable)", () => {
    const k = recoverTerminalInsuranceAccounts(t29);
    expect(k).toHaveLength(9);
    expect(k.map((x) => [x.isSigner, x.isWritable])).toEqual([
      [false, false], [false, true], [false, true], [false, false], [false, true], [false, true], [false, false], [false, false], [false, false],
    ]);
    expect(k[1].pubkey.equals(t29.pool) && k[8].pubkey.equals(W)).toBe(true);
    const stray = pk();
    const k2 = recoverTerminalInsuranceAccounts({ ...t29, stray });
    expect(k2).toHaveLength(10);
    expect(k2[9]).toEqual({ pubkey: stray, isSigner: false, isWritable: true });
    const ix = buildRecoverTerminalInsuranceIx({ ...t29, stakeProgram: STAKE }, 5_000_000n);
    expect(ix.programId.equals(STAKE)).toBe(true);
    expect(ix.data[0]).toBe(29);
  });
  it("tag 30 accounts: 10; admin signer+writable, [5] pool-owned dest (w), [7] mint (w), [8] pool vault (w)", () => {
    const a = { admin: pk(), pool: pk(), market: pk(), wrapperVault: pk(), wrapperVaultAuthority: pk(), poolDestToken: pk(), collateralMint: pk(), poolVault: pk(), wrapperProgram: W };
    const k = adminCloseSlabAccounts(a);
    expect(k.map((x) => [x.isSigner, x.isWritable])).toEqual([
      [true, true], [false, true], [false, true], [false, true], [false, false], [false, true], [false, false], [false, true], [false, true], [false, false],
    ]);
    expect(k[5].pubkey.equals(a.poolDestToken) && k[7].pubkey.equals(a.collateralMint) && k[8].pubkey.equals(a.poolVault)).toBe(true);
    expect(buildAdminCloseSlabIx({ ...a, stakeProgram: STAKE }).data.length).toBe(1);
  });
  it("Withdraw: 11 accounts with slab, 10 when slab is omitted (after CloseSlab)", () => {
    const base = { user: pk(), pool: pk(), userLpAta: pk(), lpMint: pk(), vault: pk(), userCollateralAta: pk(), vaultAuth: pk(), depositPda: pk() };
    const slab = pk();
    const withSlab = withdrawAccounts({ ...base, slab });
    expect(withSlab).toHaveLength(11);
    expect(withSlab[10].pubkey.equals(slab)).toBe(true);
    expect(withdrawAccounts(base)).toHaveLength(10);
  });
});

// ── market buffer helpers ───────────────────────────────────────────────────
const H = V17_MARKET_GROUP_OFF;
const slot0 = H + V17_MARKET_GROUP_LEN + 1024;
function put128(d: Uint8Array, o: number, v: bigint): void {
  const dv = new DataView(d.buffer, d.byteOffset);
  dv.setBigUint64(o, v & ((1n << 64n) - 1n), true);
  dv.setBigUint64(o + 8, v >> 64n, true);
}
function synth(p: { mode: number; vault: bigint; insurance: bigint; srcReserved: bigint; bL: bigint; sL: bigint; bS: bigint; sS: bigint; rL?: bigint; rS?: bigint }): Uint8Array {
  const d = new Uint8Array(H + V17_MARKET_GROUP_LEN + V17_MARKET_ASSET_SLOT_LEN);
  d[10] = 1;
  const O = MARKET_GROUP_HEADER_OFF_V18, E = ENGINE_ASSET_SLOT_OFF_V18;
  put128(d, H + O.vault, p.vault);
  put128(d, H + O.insurance, p.insurance);
  put128(d, H + O.sourceInsuranceCreditReservedTotalAtoms, p.srcReserved);
  put128(d, H + O.insuranceDomainBudgetRemainingTotal, p.bL - p.sL + p.bS - p.sS);
  d[H + O.mode] = p.mode;
  put128(d, slot0 + E.insuranceDomainBudgetLong, p.bL);
  put128(d, slot0 + E.insuranceDomainSpentLong, p.sL);
  put128(d, slot0 + E.insuranceDomainBudgetShort, p.bS);
  put128(d, slot0 + E.insuranceDomainSpentShort, p.sS);
  put128(d, slot0 + E.insuranceReservationLong, p.rL ?? 0n);
  put128(d, slot0 + E.insuranceReservationShort, p.rS ?? 0n);
  return d;
}

describe("decodeTerminalInsuranceCapacity", () => {
  it("live devnet v18.2 market: per-domain budgets/spent at the derived offsets sum to the header aggregate", () => {
    const fx = JSON.parse(readFileSync(new URL("./fixtures/market-v18-live-budgets.json", import.meta.url), "utf8")) as { dataBase64: string };
    const d = new Uint8Array(Buffer.from(fx.dataBase64, "base64"));
    const c = decodeTerminalInsuranceCapacity(d, 0);
    expect(c.mode).toBe(0);
    expect([c.domains[0].budget, c.domains[0].spent, c.domains[1].budget, c.domains[1].spent]).toEqual([50_000_000n, 0n, 50_000_000n, 50_000_000n]);
    // Engine invariant: header insurance_domain_budget_remaining_total == Σ over EVERY slot of (budget − spent).
    const n = Math.floor((d.length - H - V17_MARKET_GROUP_LEN) / V17_MARKET_ASSET_SLOT_LEN);
    let sum = 0n;
    for (let i = 0; i < n; i++) {
      const x = decodeTerminalInsuranceCapacity(d, i);
      sum += x.assetBudgetRemaining;
    }
    expect(sum).toBe(c.headerBudgetRemainingTotal);
    expect(c.headerBudgetRemainingTotal).toBe(50_000_000n);
    expect(c.terminalCapacity).toBe([50_000_000n, c.globalAvailable, c.vault].reduce((a, b) => (a < b ? a : b)));
  });
  it("formula: per-domain min(globalAvailable, budget−spent−ceil(reserved/1e12), vault), summed, then capped by globalAvailable and vault", () => {
    const d = synth({ mode: 1, vault: 10_000n, insurance: 900n, srcReserved: 100n, bL: 500n, sL: 100n, bS: 700n, sS: 0n, rL: 2n * ENGINE_BOUND_SCALE + 1n });
    const c = decodeTerminalInsuranceCapacity(d, 0);
    expect(c.globalAvailable).toBe(800n);
    expect(c.domains[0].reservedAtoms).toBe(3n); // ceil
    expect(c.domains[0].withdrawCapacity).toBe(397n); // 500 − 100 − 3
    expect(c.domains[1].withdrawCapacity).toBe(700n);
    expect(c.terminalCapacity).toBe(800n); // 1097 capped by global available
    expect(c.resolved).toBe(true);
    const v = decodeTerminalInsuranceCapacity(synth({ mode: 1, vault: 50n, insurance: 900n, srcReserved: 0n, bL: 500n, sL: 0n, bS: 0n, sS: 0n }), 0);
    expect(v.terminalCapacity).toBe(50n); // vault cap
  });
});

describe("planStakeWindDown", () => {
  const args = (marketData: Uint8Array) => ({
    stakeProgram: STAKE, wrapperProgram: W, caller: pk(), admin: pk(), pool: pk(), poolVault: pk(), vaultAuth: pk(),
    market: pk(), marketData, wrapperVault: pk(), poolDestToken: pk(), collateralMint: pk(), closePortfolioIxs: [] as TransactionInstruction[],
  });
  it("orders (a) close portfolios → (b) tag 29 capacity → (c) tag 29 amount 0 → (d) tag 30 until tombstone", () => {
    const a = args(synth({ mode: 1, vault: 10_000n, insurance: 5_000n, srcReserved: 0n, bL: 2_500n, sL: 0n, bS: 2_500n, sS: 0n }));
    const steps = planStakeWindDown({ ...a, stray: pk(), protocolFee: { authority: pk(), destToken: pk(), authorityEpoch: 3n } });
    expect(steps.map((s) => s.step)).toEqual(["closePortfolios", "recoverTerminal", "recoverTerminalBookOnly", "adminCloseSlab"]);
    const b = steps[1] as Extract<typeof steps[number], { step: "recoverTerminal" }>;
    expect(b.amount).toBe(5_000n);
    expect(new DataView(b.ix.data.buffer, b.ix.data.byteOffset).getBigUint64(1, true)).toBe(5_000n);
    expect(b.onCustomError[21]).toBe("retryLater");
    const c = steps[2] as Extract<typeof steps[number], { step: "recoverTerminalBookOnly" }>;
    expect(c.ix.data.subarray(1).every((x) => x === 0)).toBe(true);
    expect(c.ix.keys).toHaveLength(10); // stray swept here
    expect(c.onCustomError[31]).toBe("done");
    const d = steps[3] as Extract<typeof steps[number], { step: "adminCloseSlab" }>;
    expect(d.repeatUntil).toBe("tombstone");
    expect(d.ix.data[0]).toBe(30);
    expect(d.claimBetween!.data[0]).toBe(84);
    expect(d.ix.keys[4].pubkey.equals(deriveVaultAuthority(W, a.market)[0])).toBe(true);
  });
  it("skips (b) when capacity is 0; refuses a market that is not Resolved", () => {
    const zero = planStakeWindDown(args(synth({ mode: 1, vault: 1n, insurance: 0n, srcReserved: 0n, bL: 0n, sL: 0n, bS: 0n, sS: 0n })));
    expect(zero.map((s) => s.step)).toEqual(["closePortfolios", "recoverTerminalBookOnly", "adminCloseSlab"]);
    expect((zero[2] as Extract<typeof zero[number], { step: "adminCloseSlab" }>).claimBetween).toBeNull();
    expect(() => planStakeWindDown(args(synth({ mode: 0, vault: 1n, insurance: 1n, srcReserved: 0n, bL: 1n, sL: 0n, bS: 0n, sS: 0n })))).toThrow(/not Resolved/);
  });
  it("exported from the package root", () => {
    const r = root as Record<string, unknown>;
    for (const n of ["decodeTerminalInsuranceCapacity", "buildRecoverTerminalInsuranceIx", "buildAdminCloseSlabIx", "planStakeWindDown",
      "encodeStakeRecoverTerminalInsurance", "encodeStakeAdminCloseSlab", "recoverTerminalInsuranceAccounts", "adminCloseSlabAccounts"]) {
      expect(typeof r[n], n).toBe("function");
    }
  });
});
