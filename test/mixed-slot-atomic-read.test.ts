/**
 * J-20261120-SDK-FIX-MIXEDSLOTATOMICREAD (from J-20261120-SDK-REPORT-MIXEDSLOTSNAPSHOT): quote helpers that read every
 * money input at ONE slot.
 *
 * `TimelineConnection` holds one account world per slot (N = 1000 before an event, K = 1002 after it) and serves its
 * i-th RPC call at `schedule[i]`. A caller that reads the accounts one `getAccountInfo` at a time straddles the event;
 * the helpers must read them with one `getMultipleAccountsInfoAndContext`, so the quote equals a consistent snapshot.
 * Each case first shows the split read is wrong in that world (so the world really has the hazard), then that the
 * helper is right. On the base branch (e4acaa84) the helpers do not exist, so every helper case fails.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import * as SDK from "../src/index.js";
import { resolveMarketGeometry, resolvePortfolioLayout } from "../src/abi/layout.js";
import {
  BACKING_BUCKET_FIELD_OFF_P2B, BACKING_DOMAIN_LEDGER_ACCOUNT_LEN_P2B, BACKING_DOMAIN_LEDGER_FIELD_OFF_P2B, BOUND_SCALE_P2B,
  KIND_BACKING_DOMAIN_LEDGER_P2B,
} from "../src/abi/p2b-earn.js";
import { stampHeader } from "./helpers/stamp.js";
import { toEngineDisc20Portfolio } from "./helpers/portfolio-disc20.js";

type World = Map<string, Uint8Array>;
type Call = { method: string; slot: number; keys: string[]; config?: unknown };
/** Serves call i at schedule[i]: a split reader sees the event between its reads; a one-call reader sees one slot. */
class TimelineConnection {
  calls: Call[] = [];
  private i = 0;
  constructor(private readonly worlds: Map<number, World>, private readonly schedule: number[]) {}
  private next(): number { const s = this.schedule[Math.min(this.i, this.schedule.length - 1)]!; this.i++; return s; }
  private info(slot: number, pk: PublicKey) {
    const d = this.worlds.get(slot)!.get(pk.toBase58());
    return d ? { data: Buffer.from(d), owner: PublicKey.default, lamports: 1, executable: false, rentEpoch: 0 } : null;
  }
  async getAccountInfo(pk: PublicKey) { const s = this.next(); this.calls.push({ method: "getAccountInfo", slot: s, keys: [pk.toBase58()] }); return this.info(s, pk); }
  async getMultipleAccountsInfoAndContext(pks: PublicKey[], config?: unknown) {
    const s = this.next();
    this.calls.push({ method: "getMultipleAccountsInfoAndContext", slot: s, keys: pks.map((p) => p.toBase58()), config });
    return { context: { slot: s }, value: pks.map((p) => this.info(s, p)) };
  }
  /** Bytes of `pk` from the i-th call's slot (split-recipe helper). */
  async bytes(pk: PublicKey): Promise<Uint8Array | null> { const a = await this.getAccountInfo(pk); return a ? new Uint8Array(a.data) : null; }
}
const N = 1_000, K = 1_002;
const atomicCalls = (c: TimelineConnection) => c.calls.filter((x) => x.method === "getMultipleAccountsInfoAndContext");
const u64 = (b: Uint8Array, o: number, v: bigint) => new DataView(b.buffer, b.byteOffset, b.byteLength).setBigUint64(o, v, true);
const u128 = (b: Uint8Array, o: number, v: bigint) => { u64(b, o, v & ((1n << 64n) - 1n)); u64(b, o + 8, (v >> 64n) & ((1n << 64n) - 1n)); };
const splToken = (amount: bigint) => { const b = new Uint8Array(165); u64(b, 64, amount); return b; };
const splAmount = (d: Uint8Array) => new DataView(d.buffer, d.byteOffset, d.byteLength).getBigUint64(64, true);
const header = (len: number, kind: number) => { const b = new Uint8Array(len); u64(b, 0, 0x5045_5243_5631_3600n); new DataView(b.buffer).setUint16(8, 19, true); b[10] = kind; return b; };
const world = (entries: [PublicKey, Uint8Array][]): World => new Map(entries.map(([k, v]) => [k.toBase58(), v]));
const PROGRAM_ID = new PublicKey(SDK.PROGRAM_IDS_DEVNET_V22.percolator);

// Real v2.2 devnet market (5 assets) and vault-LP portfolio bytes, with records planted at layout offsets.
const FX = JSON.parse(readFileSync(new URL("./fixtures/v22-q7-devnet-2026-10-12.json", import.meta.url), "utf8")) as { market: string; accounts: { market: string; lp: string } };
const MARKET = new PublicKey(FX.market);
const MARKET_BYTES = new Uint8Array(Buffer.from(FX.accounts.market, "base64"));
const GEOM = resolveMarketGeometry(MARKET_BYTES, { parser: "test", strictLength: false });

function plantPot(m: Uint8Array, domain: number, freshAtoms: bigint): Uint8Array {
  const asset = domain >> 1;
  const bk = GEOM.engineOff(asset) + ((domain & 1) ? GEOM.layout.engineSlot.backingShort : GEOM.layout.engineSlot.backingLong);
  const sc = GEOM.engineOff(asset) + ((domain & 1) ? GEOM.layout.engineSlot.sourceCreditShort : GEOM.layout.engineSlot.sourceCreditLong);
  m.fill(0, bk, bk + 97);
  m.fill(0, sc, sc + 160);
  u128(m, bk + BACKING_BUCKET_FIELD_OFF_P2B.freshUnlienedBackingNum, freshAtoms * BOUND_SCALE_P2B);
  return m;
}
function plantPrices(m: Uint8Array, asset: number, effE6: bigint, targetE6: bigint): Uint8Array {
  u64(m, GEOM.engineOff(asset) + GEOM.layout.assetState.effectivePrice, effE6);
  u64(m, GEOM.engineOff(asset) + GEOM.layout.assetState.rawOracleTargetPrice, targetE6);
  return m;
}
function ledgerBytes(domain: number, principal: bigint): Uint8Array {
  const d = stampHeader(new Uint8Array(BACKING_DOMAIN_LEDGER_ACCOUNT_LEN_P2B), KIND_BACKING_DOMAIN_LEDGER_P2B, 19);
  const F = BACKING_DOMAIN_LEDGER_FIELD_OFF_P2B;
  d.set(MARKET.toBytes(), 16 + F.marketGroup); d.fill(9, 16 + F.authority, 16 + F.authority + 32);
  u128(d, 16 + F.totalPrincipalAtoms, principal); u128(d, 16 + F.totalDepositedAtoms, principal);
  new DataView(d.buffer).setUint16(16 + F.domain, domain, true);
  return d;
}
function registryBytes(shares: bigint, domain: number, feeShareBps: number, bound: boolean): Uint8Array {
  const d = stampHeader(new Uint8Array(176), 5, 19);
  d.set(MARKET.toBytes(), 16); d.fill(4, 48, 80);
  u128(d, 16 + 64, shares);
  const v = new DataView(d.buffer);
  v.setUint16(16 + 128, feeShareBps, true); v.setUint16(16 + 132, domain, true);
  d[16 + 135] = 1;
  d[SDK.LP_VAULT_REGISTRY_BOUND_FLAG_OFF_P3] = bound ? 1 : 0;
  return d;
}

// ----------------------------------------------------------------------------------------------------------------
describe("readAccountsAtomic", () => {
  const a = Keypair.generate().publicKey, b = Keypair.generate().publicKey;
  const worlds = new Map<number, World>([[N, world([[a, splToken(1n)]])], [K, world([[a, splToken(2n)], [b, splToken(3n)]])]]);
  it("reads every key in one call, returns the slot, forwards minContextSlot and commitment", async () => {
    const c = new TimelineConnection(worlds, [K]);
    const r = await SDK.readAccountsAtomic(c, [a, b], { minContextSlot: K, commitment: "confirmed" });
    expect(c.calls).toEqual([{ method: "getMultipleAccountsInfoAndContext", slot: K, keys: [a.toBase58(), b.toBase58()], config: { commitment: "confirmed", minContextSlot: K } }]);
    expect(r.slot).toBe(K);
    expect(r.accounts.map((x) => (x ? splAmount(new Uint8Array(x.data)) : null))).toEqual([2n, 3n]);
  });
  it("keeps missing accounts as null and throws when a node answers below minContextSlot", async () => {
    const r = await SDK.readAccountsAtomic(new TimelineConnection(worlds, [N]), [a, b]);
    expect(r.accounts[1]).toBeNull();
    await expect(SDK.readAccountsAtomic(new TimelineConnection(worlds, [N]), [a], { minContextSlot: K })).rejects.toThrow(/minContextSlot/);
  });
  it("refuses an empty key list and more keys than one call can read", async () => {
    const c = new TimelineConnection(worlds, [N]);
    await expect(SDK.readAccountsAtomic(c, [])).rejects.toThrow(/no keys/);
    await expect(SDK.readAccountsAtomic(c, Array.from({ length: 101 }, () => a))).rejects.toThrow(/101 keys/);
    expect(c.calls).toEqual([]);
  });
  it("throws when the RPC returns the wrong number of accounts", async () => {
    const bad = { getMultipleAccountsInfoAndContext: async () => ({ context: { slot: N }, value: [] }) };
    await expect(SDK.readAccountsAtomic(bad, [a])).rejects.toThrow(/0 accounts for 1 keys/);
  });
});

// ----------------------------------------------------------------------------------------------------------------
describe("F1: stake withdraw quote reads pool + units + vault + user LP in ONE slot", () => {
  const pool = (flushed: bigint) => { const d = new Uint8Array(SDK.STAKE_POOL_SIZE_V5); d.set(Buffer.from("SPOOL_V1"), 320); d[328] = 5; d[408] = 1; u64(d, 168, 20_000_000n); u64(d, 176, 20_000_000n); u64(d, 200, flushed); d.set(k.vault.toBytes(), SDK.STAKE_POOL_FIELD_OFF_V5.vault); return d; };
  const units = (stake: bigint, ins: bigint) => { const d = header(208, 13); d.fill(7, 16, 48); u128(d, 48, stake + 40_000_000n); u128(d, 64, stake); u128(d, 80, 40_000_000n); u128(d, 112, ins); u128(d, 128, ins); d[152] = 1; return d; };
  const k = { pool: Keypair.generate().publicKey, insuranceUnits: Keypair.generate().publicKey, vault: Keypair.generate().publicKey, userLp: Keypair.generate().publicKey };
  // N: 20M deposited, nothing deployed. N+1: SyncInsuranceDeployment moves 10M into wrapper insurance (pool value unchanged).
  const worlds = new Map<number, World>([
    [N, world([[k.pool, pool(0n)], [k.insuranceUnits, units(0n, 40_000_000n)], [k.vault, splToken(20_000_000n)], [k.userLp, splToken(15_000_000n)]])],
    [K, world([[k.pool, pool(10_000_000n)], [k.insuranceUnits, units(10_000_000n, 50_000_000n)], [k.vault, splToken(10_000_000n)], [k.userLp, splToken(15_000_000n)]])],
  ]);
  it("fetchStakeWithdrawQuoteV5 equals the consistent quote when a SyncInsuranceDeployment lands mid-read", async () => {
    const split = new TimelineConnection(worlds, [N, K, K, K]);
    const u = SDK.decodeInsuranceUnitsV20((await split.bytes(k.insuranceUnits))!); // units first (the JSDoc order reads pool first; both orders are wrong)
    const p = SDK.decodeStakePoolV5((await split.bytes(k.pool))!);
    const splitQ = SDK.quoteStakeWithdrawNowV5(p, u, u.snapInsuranceFreeAtoms, splAmount((await split.bytes(k.vault))!), splAmount((await split.bytes(k.userLp))!))!;
    expect(splitQ.redeemable).toBe(7_500_000n); // split: the deployed 10M is dropped (-50%)

    const conn = new TimelineConnection(worlds, [N, K, K, K]);
    const q = (await SDK.fetchStakeWithdrawQuoteV5(conn, k))!;
    expect(conn.calls).toEqual([{ method: "getMultipleAccountsInfoAndContext", slot: N, keys: [k.pool, k.insuranceUnits, k.vault, k.userLp].map((x) => x.toBase58()), config: {} }]);
    expect(q.redeemable).toBe(15_000_000n);
    expect(q.slot).toBe(N);
    expect(q.maxCollateralNow).toBe(15_000_000n);
    const atK = (await SDK.fetchStakeWithdrawQuoteV5(new TimelineConnection(worlds, [K]), k, { minContextSlot: K }))!;
    expect([atK.redeemable, atK.maxCollateralNow, atK.maxLpNow, atK.capBinds, atK.slot]).toEqual([15_000_000n, 10_000_000n, 10_000_000n, true, K]);
  });
  it("a missing user LP account reads as 0 LP; a missing pool throws", async () => {
    const w = new Map<number, World>([[N, new Map(worlds.get(N)!)]]);
    w.get(N)!.delete(k.userLp.toBase58());
    expect((await SDK.fetchStakeWithdrawQuoteV5(new TimelineConnection(w, [N]), k))!.redeemable).toBe(0n);
    await expect(SDK.fetchStakeWithdrawQuoteV5(new TimelineConnection(w, [N]), { ...k, vault: k.userLp })).rejects.toThrow(/is not pool.vault/);
    w.get(N)!.delete(k.pool.toBase58());
    await expect(SDK.fetchStakeWithdrawQuoteV5(new TimelineConnection(w, [N]), k)).rejects.toThrow(/stake pool account/);
  });
  it("with a market, clamps the exit reading to the live free insurance read in the same slot", async () => {
    const market = MARKET_BYTES.slice();
    const w = new Map<number, World>([[N, new Map([...worlds.get(N)!, [MARKET.toBase58(), market]])]]);
    const conn = new TimelineConnection(w, [N]);
    const q = (await SDK.fetchStakeWithdrawQuoteV5(conn, { ...k, market: MARKET }))!;
    expect(atomicCalls(conn)).toHaveLength(1);
    expect(conn.calls[0]!.keys).toHaveLength(5);
    const cap = SDK.decodeTerminalInsuranceCapacity(market, 0);
    const live = cap.domains[0].withdrawCapacity + cap.domains[1].withdrawCapacity;
    const expected = live < cap.insurance ? live : cap.insurance;
    expect(q.exitInsurance).toBe(expected < 40_000_000n ? expected : 40_000_000n);
  });
});

// ----------------------------------------------------------------------------------------------------------------
describe("F2: non-bound Earn pricing reads market + registry + both ledgers in ONE slot", () => {
  const [REG] = SDK.deriveLpVaultRegistry(PROGRAM_ID, MARKET);
  const [OWN] = SDK.deriveLpBackingLedger(PROGRAM_ID, MARKET, 0);
  // 1,000 USDC principal backed 1:1, 1,000 shares. N+1: a 500 USDC deposit (ledger, pot and shares all +500).
  const worlds = new Map<number, World>([
    [N, world([[MARKET, plantPot(MARKET_BYTES.slice(), 0, 1_000_000_000n)], [REG, registryBytes(1_000_000_000n, 0, 0, false)], [OWN, ledgerBytes(0, 1_000_000_000n)]])],
    [K, world([[MARKET, plantPot(MARKET_BYTES.slice(), 0, 1_500_000_000n)], [REG, registryBytes(1_500_000_000n, 0, 0, false)], [OWN, ledgerBytes(0, 1_500_000_000n)]])],
  ]);
  it("fetchNonboundVaultPricingP2b shows no par-minus-E3 gap when a deposit lands mid-read", async () => {
    const split = new TimelineConnection(worlds, [N, K, K, K]); // JSDoc order: market, registry, own ledger, sibling ledger
    const marketData = (await split.bytes(MARKET))!;
    const reg = SDK.parseLpVaultRegistry((await split.bytes(REG))!);
    const own = await split.bytes(OWN);
    const sib = await split.bytes(SDK.deriveLpBackingLedger(PROGRAM_ID, MARKET, 1)[0]);
    expect(SDK.nonboundVaultPricingFromAccountsP2b({ marketData, registryDomain: reg.domain, feeShareBps: reg.feeShareBps, ownLedgerData: own, siblingLedgerData: sib }).parMinusE3Bps).toBe(3_333);

    const conn = new TimelineConnection(worlds, [N, K, K, K]);
    const p = await SDK.fetchNonboundVaultPricingP2b(conn, PROGRAM_ID, MARKET, { domain: 0 });
    expect(conn.calls.length).toBe(1);
    expect(conn.calls[0]!.keys).toEqual([MARKET, REG, OWN, SDK.deriveLpBackingLedger(PROGRAM_ID, MARKET, 1)[0]].map((x) => x.toBase58()));
    expect(p.parMinusE3Bps).toBe(0);
    expect([p.slot, p.domain, p.totalLpSharesOutstanding, p.exitNavAtoms]).toEqual([N, 0, 1_000_000_000n, 1_000_000_000n]);
    expect(SDK.lpAtomsForRedemptionP2b(100_000_000n, p.totalLpSharesOutstanding, p.exitNavAtoms)).toBe(100_000_000n);
  });
  it("without a domain it reads the registry first, then prices from ONE later slot", async () => {
    const conn = new TimelineConnection(worlds, [N, K, K, K]);
    const p = await SDK.fetchNonboundVaultPricingP2b(conn, PROGRAM_ID, MARKET);
    expect(conn.calls.map((c) => [c.method, c.slot, c.keys.length])).toEqual([["getMultipleAccountsInfoAndContext", N, 1], ["getMultipleAccountsInfoAndContext", K, 4]]);
    expect([p.parMinusE3Bps, p.slot, p.totalLpSharesOutstanding, p.exitNavAtoms]).toEqual([0, K, 1_500_000_000n, 1_500_000_000n]);
  });
  it("refuses a bound registry and a wrong cached domain", async () => {
    const w = new Map<number, World>([[N, new Map([...worlds.get(N)!, [REG.toBase58(), registryBytes(1n, 0, 0, true)]])]]);
    await expect(SDK.fetchNonboundVaultPricingP2b(new TimelineConnection(w, [N]), PROGRAM_ID, MARKET, { domain: 0 })).rejects.toThrow(/bound/);
    await expect(SDK.fetchNonboundVaultPricingP2b(new TimelineConnection(worlds, [N]), PROGRAM_ID, MARKET, { domain: 2 })).rejects.toThrow(/domain 0 != expected 2/);
  });
});

// ----------------------------------------------------------------------------------------------------------------
describe("F3+F4: bound vault exit quote reads registry + vault state + ledgers + vault-LP portfolio + market in ONE slot", () => {
  const [REG] = SDK.deriveLpVaultRegistry(PROGRAM_ID, MARKET);
  const [STATE] = SDK.deriveVaultLpStateP3(PROGRAM_ID, MARKET);
  const [OWN] = SDK.deriveLpBackingLedger(PROGRAM_ID, MARKET, 0);
  const [SIB] = SDK.deriveLpBackingLedger(PROGRAM_ID, MARKET, 1);
  const LPPF = Keypair.generate().publicKey;
  const vaultLpState = (c: bigint) => {
    const d = stampHeader(new Uint8Array(SDK.VAULT_LP_STATE_ACCOUNT_LEN_P3), SDK.V18_KIND_VAULT_LP_STATE_P3, 19);
    const O = SDK.VAULT_LP_STATE_OFF_P3, v = new DataView(d.buffer);
    d.set(MARKET.toBytes(), O.marketGroup); d.set(REG.toBytes(), O.registry); d.set(LPPF.toBytes(), O.lpPortfolio); d.fill(3, O.juniorOwner, O.juniorOwner + 32);
    u128(d, O.seniorClaimAtoms, c);
    v.setUint16(O.juniorFloorBps, 1_000, true); v.setUint16(O.seniorFeeShareBps, 10_000, true); d[O.version] = 1;
    return d;
  };
  // The real devnet vault-LP portfolio (short on assets 0, 1, 2 with a valid certificate); asset 0's leg is set to
  // q = -6,000 units and the certified equity is set per slot.
  const LP_BASE = toEngineDisc20Portfolio(new Uint8Array(Buffer.from(FX.accounts.lp, "base64")));
  const PG = resolvePortfolioLayout(LP_BASE, { parser: "test" }).portfolio;
  const CERT_OFF = PG.sourceDomainsOff + PG.sourceDomainCap * PG.sourceDomainStride;
  const lpPortfolio = (certifiedEquity: bigint) => {
    const d = LP_BASE.slice();
    for (let i = 0; i < PG.legCount; i++) {
      const b = PG.legsOff + i * PG.legStride;
      if (d[b + PG.leg.active] === 1 && new DataView(d.buffer).getUint32(b + PG.leg.assetIndex, true) === 0) u128(d, b + PG.leg.basisPosQ, (1n << 128n) - 6_000_000_000n);
    }
    u128(d, CERT_OFF, certifiedEquity < 0n ? (1n << 128n) + certifiedEquity : certifiedEquity);
    return d;
  };
  const market = (eff0: bigint, potAtoms: bigint) => {
    const m = plantPot(MARKET_BYTES.slice(), 0, potAtoms);
    plantPrices(m, 0, eff0, 110_000_000n);
    for (const a of [1, 2]) { const p = SDK.readAssetPricesP3(m, a); plantPrices(m, a, p.effectivePriceE6, p.effectivePriceE6); }
    return m;
  };
  // N: C = 1,000 USDC = S shares, eff 100 with a pending target 110, certificate E = 100,000 USDC.
  // N+1: a 250 USDC senior deposit (C, S, ledger, pot +250) and a crank applying the target (eff 110, E' = E - 6,000 * 10).
  const worlds = new Map<number, World>([
    [N, world([[MARKET, market(100_000_000n, 1_000_000_000n)], [REG, registryBytes(1_000_000_000n, 0, 0, true)], [STATE, vaultLpState(1_000_000_000n)], [OWN, ledgerBytes(0, 1_000_000_000n)], [LPPF, lpPortfolio(100_000_000_000n)]])],
    [K, world([[MARKET, market(110_000_000n, 1_250_000_000n)], [REG, registryBytes(1_250_000_000n, 0, 0, true)], [STATE, vaultLpState(1_250_000_000n)], [OWN, ledgerBytes(0, 1_250_000_000n)], [LPPF, lpPortfolio(40_000_000_000n)]])],
  ]);
  const keys = { vaultLpState: STATE, registry: REG, lpPortfolio: LPPF, domain: 0, ownLedger: OWN, siblingLedger: SIB };

  it("the health-certificate offset is the layout's (devnet bytes: valid, certified for the active legs)", () => {
    expect(CERT_OFF + 309).toBe(PG.resolvedPayoutReceiptOff);
    expect(LP_BASE[CERT_OFF + 120]).toBe(1);
    expect(new DataView(LP_BASE.buffer).getBigUint64(CERT_OFF + 112, true)).toBe(SDK.parsePortfolioV17(LP_BASE).activeBitmap);
  });

  it("fetchBoundVaultExitQuoteP3 does not report a false deficit when a crank lands mid-read", async () => {
    // Split: portfolio after the crank, market before it -> the pending move is counted twice.
    const split = new TimelineConnection(worlds, [K, N]);
    const pf = SDK.parsePortfolioV17((await split.bytes(LPPF))!);
    const m = (await split.bytes(MARKET))!;
    const legs = pf.legs.filter((l) => l.active).map((l) => ({ basisPosQ: l.basisPosQ, ...SDK.readAssetPricesP3(m, l.assetIndex) }));
    expect(SDK.vaultLpEquityLagBoundsP3({ legs, certifiedEquity: 40_000_000_000n, capital: 0n, pnl: 0n, feeCredits: 0n }).worse).toBe(-20_000_000_000n);

    const conn = new TimelineConnection(worlds, [N, K, K, K, K, K]);
    const q = await SDK.fetchBoundVaultExitQuoteP3(conn, PROGRAM_ID, MARKET, { shares: 100_000_000n, keys });
    expect(conn.calls.length).toBe(1);
    expect(conn.calls[0]!.keys).toEqual([MARKET, REG, STATE, OWN, SIB, LPPF].map((x) => x.toBase58()));
    expect(q.lpEquityWorse >= 0n).toBe(true);
    expect([q.slot, q.lpEquityWorse, q.certifiedEquity, q.certUsable, q.resolved]).toEqual([N, 40_000_000_000n, 100_000_000_000n, true, false]);
    expect([q.totalShares, q.seniorClaim, q.nav, q.seniorValue, q.redemptionAtoms]).toEqual([1_000_000_000n, 1_000_000_000n, 1_000_000_000n, 1_000_000_000n, 100_000_000n]);
  });

  it("the tag-77 payout uses S and C from the same slot (a split read pays -20% / +25%)", async () => {
    const split = new TimelineConnection(worlds, [K, N]); // registry after the deposit, state before it
    const S = SDK.parseLpVaultRegistry((await split.bytes(REG))!).totalLpSharesOutstanding;
    const C = SDK.decodeVaultLpStateP3((await split.bytes(STATE))!).seniorClaimAtoms;
    expect(SDK.boundVaultRedemptionAtomsP3(100_000_000n, S, C)).toBe(80_000_000n);

    const conn = new TimelineConnection(worlds, [N, K]);
    const q = await SDK.fetchBoundVaultExitQuoteP3(conn, PROGRAM_ID, MARKET, { shares: 100_000_000n });
    // Without cached keys: one read resolves them (slot N), the quote comes from one later read (slot K).
    expect(conn.calls.map((c) => [c.method, c.slot, c.keys.length])).toEqual([["getMultipleAccountsInfoAndContext", N, 2], ["getMultipleAccountsInfoAndContext", K, 6]]);
    expect(q.keys).toEqual(keys);
    expect([q.slot, q.totalShares, q.seniorClaim, q.lpEquityWorse, q.redemptionAtoms]).toEqual([K, 1_250_000_000n, 1_250_000_000n, 40_000_000_000n, 100_000_000n]);
  });

  it("refuses a non-bound registry and keys that no longer match", async () => {
    const w = new Map<number, World>([[N, new Map([...worlds.get(N)!, [REG.toBase58(), registryBytes(1_000_000_000n, 0, 0, false)]])]]);
    await expect(SDK.fetchBoundVaultExitQuoteP3(new TimelineConnection(w, [N]), PROGRAM_ID, MARKET, { shares: 1n })).rejects.toThrow(/not bound/);
    await expect(SDK.fetchBoundVaultExitQuoteP3(new TimelineConnection(worlds, [N]), PROGRAM_ID, MARKET, { shares: 1n, keys: { ...keys, domain: 2 } })).rejects.toThrow(/domain 0 != cached 2/);
    await expect(SDK.fetchBoundVaultExitQuoteP3(new TimelineConnection(worlds, [N]), PROGRAM_ID, MARKET, { shares: 1n, keys: { ...keys, lpPortfolio: STATE } })).rejects.toThrow(/cached keys/);
  });

  it("a stale certificate on a non-flat vault LP gives no senior value; the backstop is netted off the live value", async () => {
    const stale = lpPortfolio(100_000_000_000n); stale[CERT_OFF + 120] = 0;
    const w1 = new Map<number, World>([[N, new Map([...worlds.get(N)!, [LPPF.toBase58(), stale]])]]);
    const q1 = await SDK.fetchBoundVaultExitQuoteP3(new TimelineConnection(w1, [N]), PROGRAM_ID, MARKET, { shares: 100_000_000n, keys });
    expect([q1.certUsable, q1.lpValueAtEff, q1.seniorValue, q1.redemptionAtoms]).toEqual([false, null, null, null]);
    // Same with a deficit at the worse price (worse < 0): still no payout, the program refuses with 85.
    const staleDeficit = lpPortfolio(10_000_000_000n); staleDeficit[CERT_OFF + 120] = 0;
    const w3 = new Map<number, World>([[N, new Map([...worlds.get(N)!, [LPPF.toBase58(), staleDeficit]])]]);
    const q3 = await SDK.fetchBoundVaultExitQuoteP3(new TimelineConnection(w3, [N]), PROGRAM_ID, MARKET, { shares: 100_000_000n, keys });
    expect([q3.lpEquityWorse, q3.seniorValue, q3.redemptionAtoms]).toEqual([-50_000_000_000n, null, null]);

    const st = vaultLpState(1_000_000_000n); u64(st, SDK.VAULT_LP_STATE_BACKSTOP_OUTSTANDING_OFF_P3, 40_000_500_000n);
    const w2 = new Map<number, World>([[N, new Map([...worlds.get(N)!, [STATE.toBase58(), st]])]]);
    const q2 = await SDK.fetchBoundVaultExitQuoteP3(new TimelineConnection(w2, [N]), PROGRAM_ID, MARKET, { shares: 100_000_000n, keys });
    // min(nav + min(lpValue, worse) - backstop, C) = min(1,000 + 40,000 - 40,000.5, 1,000) USDC = 999.5 USDC
    expect([q2.backstopOutstandingAtoms, q2.seniorValue, q2.redemptionAtoms]).toEqual([40_000_500_000n, 999_500_000n, 99_950_000n]);
  });
});

// ----------------------------------------------------------------------------------------------------------------
describe("F5: PumpSwap spot price reads pool + both vaults in ONE slot", () => {
  const pool = new Uint8Array(210);
  for (let i = 0; i < 32; i++) { pool[43 + i] = 1 + i; pool[75 + i] = 33 + i; pool[139 + i] = 65 + i; pool[171 + i] = 97 + (i % 30); }
  const pk = Keypair.generate().publicKey;
  const parsed = SDK.parseDexPool("pumpswap", pk, pool);
  // x*y=k, 6dp/6dp. N: 1,000,000 base / 1,000 quote. N+1: a buy with 100 quote.
  const worlds = new Map<number, World>([
    [N, world([[pk, pool], [parsed.baseVault!, splToken(1_000_000_000_000n)], [parsed.quoteVault!, splToken(1_000_000_000n)]])],
    [K, world([[pk, pool], [parsed.baseVault!, splToken(909_090_909_090n)], [parsed.quoteVault!, splToken(1_100_000_000n)]])],
  ]);
  it("fetchDexSpotPriceE6 equals the consistent price when a swap lands between the vault reads", async () => {
    const split = new TimelineConnection(worlds, [N, N, K]);
    const p = (await split.bytes(pk))!, base = (await split.bytes(parsed.baseVault!))!, quote = (await split.bytes(parsed.quoteVault!))!;
    expect(SDK.computeDexSpotPriceE6("pumpswap", p, { base, quote }, { base: 6, quote: 6 })).toBe(1_100n);

    const conn = new TimelineConnection(worlds, [N, N, K]);
    const r = await SDK.fetchDexSpotPriceE6(conn, "pumpswap", pk, { base: 6, quote: 6 });
    expect([1_000n, 1_210n]).toContain(r.priceE6);
    expect(atomicCalls(conn).at(-1)!.keys).toEqual([pk, parsed.baseVault!, parsed.quoteVault!].map((x) => x.toBase58()));
    expect(r).toEqual({ priceE6: 1_000n, slot: N });
  });
  it("with cached vaults it is one call; a pool that names other vaults throws", async () => {
    const conn = new TimelineConnection(worlds, [K]);
    const vaults = { baseVault: parsed.baseVault!, quoteVault: parsed.quoteVault! };
    expect(await SDK.fetchDexSpotPriceE6(conn, "pumpswap", pk, { base: 6, quote: 6 }, { vaults })).toEqual({ priceE6: 1_210n, slot: K });
    expect(conn.calls).toHaveLength(1);
    await expect(SDK.fetchDexSpotPriceE6(new TimelineConnection(worlds, [K]), "pumpswap", pk, { base: 6, quote: 6 }, { vaults: { ...vaults, baseVault: pk } })).rejects.toThrow(/cached vaults/);
  });
  it("a single-account DEX (Raydium CLMM) reads the pool once", async () => {
    const pk2 = Keypair.generate().publicKey;
    const conn = new TimelineConnection(new Map([[N, world([])]]), [N]);
    await expect(SDK.fetchDexSpotPriceE6(conn, "raydium-clmm", pk2)).rejects.toThrow(/DEX pool account/);
    expect(conn.calls.map((c) => c.keys.length)).toEqual([1]);
  });
});
