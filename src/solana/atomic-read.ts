/**
 * One-slot (atomic) reads for quotes that combine several accounts.
 *
 * The pure quote combinators (`quoteStakeWithdrawNowV5`, `nonboundVaultPricingFromAccountsP2b`,
 * `vaultLpEquityLagBoundsP3` + `boundVaultRedemptionAtomsP3`, `computeDexSpotPriceE6`) are exact for inputs from ONE
 * slot, but they take each account separately. A caller that reads those accounts with one `getAccountInfo` each can
 * straddle an on-chain event (a sync, a deposit, a crank, a swap) and get a quote no slot ever had: measured up to
 * +/-150% on the vault-LP lag bound (a false deficit), +/-50% on a stake withdraw, a false 3,333 bps par-minus-E3
 * alert, -20%/+25% on a bound exit and 10% on a PumpSwap spot price (J-20261120-SDK-REPORT-MIXEDSLOTSNAPSHOT).
 *
 * The helpers here read every money input of a quote with ONE `getMultipleAccountsInfoAndContext` call, so all of them
 * come from one slot, return that slot, and accept `minContextSlot` so a poller (or an `RpcPool` failover) never moves
 * backwards. The pure combinators are unchanged; these helpers only own the read.
 *
 * Some account addresses live inside another account (a registry's `domain` picks the ledger PDAs, a VaultLpState
 * names the vault-LP portfolio, a PumpSwap pool names its vaults). Those identity fields are fixed at init, so the
 * helpers resolve them with a small first read when the caller does not pass them, then re-check them inside the
 * one-slot read. Pass them (or the resolved keys) to make a poll exactly one RPC call.
 */
import type { AccountInfo, Commitment, PublicKey, RpcResponseAndContext } from "@solana/web3.js";
import { decodeStakePoolV5 } from "../abi/v22-stake.js";
import type { StakePoolV5, StakeWithdrawQuoteV5 } from "../abi/v22-stake.js";
import { quoteStakeWithdrawNowV5 } from "../abi/v22-stake.js";
import { decodeInsuranceUnitsV20 } from "../abi/v22-state.js";
import type { InsuranceUnitsV20 } from "../abi/v22-state.js";
import type { NonboundVaultPricingP2b } from "../abi/p2b-earn.js";
import { resolveMarketGeometry, resolvePortfolioLayout } from "../abi/layout.js";
import { decodeBackingDomainLedgerP2b, nonboundVaultPricingFromAccountsP2b, readPotEngineRecordsP2b } from "./p2b-earn.js";
import {
  boundVaultNavFlooredP3,
  boundVaultRedemptionAtomsP3,
  decodeVaultLpStateP3,
  deriveVaultLpStateP3,
  isLpVaultRegistryBoundP3,
  liveExitSeniorValueP3,
  readAssetPricesP3,
  vaultLpEquityLagBoundsP3,
  vaultLpSeniorPricingClaimP3,
  vaultPhysicalIdleBackingAtomsP3,
  vaultPotHeldAtomsP3,
} from "./p3-vault-lp.js";
import type { BackingPotTermsP3 } from "./p3-vault-lp.js";
import { deriveLpBackingLedger, deriveLpVaultRegistry } from "./pda.js";
import { parseLpVaultRegistry, parsePortfolioV17 } from "./slab.js";
import { decodeTerminalInsuranceCapacity } from "./stake-wind-down.js";
import { computeDexSpotPriceE6, parseDexPool } from "./dex-oracle.js";
import type { DexType } from "./dex-oracle.js";

// ============================================================================
// readAccountsAtomic
// ============================================================================

/** The one Connection method the atomic helpers use (a web3.js `Connection` satisfies it). */
export interface AtomicReadConnection {
  getMultipleAccountsInfoAndContext(
    publicKeys: PublicKey[],
    config?: { commitment?: Commitment; minContextSlot?: number },
  ): Promise<RpcResponseAndContext<(AccountInfo<Buffer | Uint8Array> | null)[]>>;
}

/** Options for {@link readAccountsAtomic} and the `fetch…` helpers built on it. */
export interface AtomicReadOptions {
  /** Commitment for the read (the connection's default when omitted). */
  commitment?: Commitment;
  /**
   * The lowest slot the answer may come from. Pass the `slot` of the previous result when polling, so a lagging RPC
   * node (or an `RpcPool` failover to one) can never serve an older state. The RPC refuses a lower slot; the helper
   * also throws if a node answers below it anyway.
   */
  minContextSlot?: number;
}

/** Result of {@link readAccountsAtomic}. */
export interface AtomicAccounts {
  /** The slot every account was read at (`context.slot`). */
  slot: number;
  /** One entry per key, in key order; `null` for an account that does not exist. */
  accounts: (AccountInfo<Buffer | Uint8Array> | null)[];
}

/** `getMultipleAccounts` takes at most 100 keys per call; above that one call cannot cover the read. */
export const ATOMIC_READ_MAX_KEYS = 100;

/**
 * Read several accounts at ONE slot with a single `getMultipleAccountsInfoAndContext` call, and return that slot.
 * Use it for any value computed from two or more accounts: separate `getAccountInfo` calls can each come from a
 * different slot.
 *
 * @param connection  A web3.js `Connection` (or anything with `getMultipleAccountsInfoAndContext`). With an `RpcPool`,
 *                    run the whole helper inside one `pool.call((c) => …)` so the read goes to one endpoint.
 * @param keys        1..=100 account addresses.
 * @param opts        `commitment`, `minContextSlot`.
 * @returns `{ slot, accounts }`, `accounts[i]` for `keys[i]` (null when missing).
 * @throws If `keys` is empty or longer than 100, the RPC returns the wrong number of accounts, or answers below
 *         `minContextSlot`.
 * @example
 * ```ts
 * const { slot, accounts: [market, registry] } = await readAccountsAtomic(connection, [marketPk, registryPk], { minContextSlot: lastSlot });
 * ```
 */
export async function readAccountsAtomic(
  connection: AtomicReadConnection,
  keys: readonly PublicKey[],
  opts: AtomicReadOptions = {},
): Promise<AtomicAccounts> {
  if (keys.length === 0) throw new Error("readAccountsAtomic: no keys");
  if (keys.length > ATOMIC_READ_MAX_KEYS) {
    throw new Error(`readAccountsAtomic: ${keys.length} keys > ${ATOMIC_READ_MAX_KEYS}; one getMultipleAccounts call cannot read them at one slot`);
  }
  const config: { commitment?: Commitment; minContextSlot?: number } = {};
  if (opts.commitment !== undefined) config.commitment = opts.commitment;
  if (opts.minContextSlot !== undefined) config.minContextSlot = opts.minContextSlot;
  const res = await connection.getMultipleAccountsInfoAndContext([...keys], config);
  const slot = res.context.slot;
  if (res.value.length !== keys.length) {
    throw new Error(`readAccountsAtomic: RPC returned ${res.value.length} accounts for ${keys.length} keys`);
  }
  if (opts.minContextSlot !== undefined && slot < opts.minContextSlot) {
    throw new Error(`readAccountsAtomic: RPC answered at slot ${slot} < minContextSlot ${opts.minContextSlot}`);
  }
  return { slot, accounts: res.value };
}

const bytesOf = (a: AccountInfo<Buffer | Uint8Array> | null): Uint8Array | null =>
  a ? new Uint8Array(a.data.buffer, a.data.byteOffset, a.data.byteLength) : null;

function required(a: AccountInfo<Buffer | Uint8Array> | null, what: string, key: PublicKey): Uint8Array {
  const d = bytesOf(a);
  if (!d) throw new Error(`${what} account ${key.toBase58()} does not exist`);
  return d;
}

/** SPL token account `amount` (u64 @64; the same for classic and Token-2022 accounts). */
function splAmount(d: Uint8Array, what: string): bigint {
  if (d.length < 72) throw new Error(`${what}: not a token account (${d.length} bytes)`);
  return new DataView(d.buffer, d.byteOffset, d.byteLength).getBigUint64(64, true);
}

// ============================================================================
// F1: stake withdraw quote (pool + insurance units + pool vault + user LP [+ market])
// ============================================================================

/** Accounts for {@link fetchStakeWithdrawQuoteV5}. */
export interface StakeWithdrawAccountsV5 {
  /** The v5 StakePool. */
  pool: PublicKey;
  /** The wrapper InsuranceUnitsV20 the pool is deployed into. */
  insuranceUnits: PublicKey;
  /** `pool.vault` (SPL token account). */
  vault: PublicKey;
  /** The staker's LP token account (a missing account reads as 0 LP). */
  userLp: PublicKey;
  /**
   * OPTIONAL market account: when passed, the exit reading is clamped to the live free insurance
   * (`min(Σ domains[].withdrawCapacity, insurance)` of {@link decodeTerminalInsuranceCapacity}), read in the same slot.
   */
  market?: PublicKey;
  /** Asset of `market` whose insurance domains to read (default 0, the stake-bound asset). */
  assetIndex?: number;
}

/** Result of {@link fetchStakeWithdrawQuoteV5}. */
export interface StakeWithdrawQuoteAtSlotV5 extends StakeWithdrawQuoteV5 {
  /** The slot every input was read at. */
  slot: number;
  pool: StakePoolV5;
  insuranceUnits: InsuranceUnitsV20;
  vaultBalance: bigint;
  userLp: bigint;
  /** The exit reading the quote used (`snapInsuranceFreeAtoms`, clamped to the live reading when `market` was passed). */
  exitInsurance: bigint;
}

/**
 * {@link quoteStakeWithdrawNowV5} with every input read at ONE slot. Reading the pool and the insurance units
 * separately across a `SyncInsuranceDeployment` counts the deployed insurance twice or not at all (measured +/-50% on
 * `redeemable`).
 *
 * @param connection  Connection ({@link AtomicReadConnection}).
 * @param accounts    {@link StakeWithdrawAccountsV5}.
 * @param opts        `commitment`, `minContextSlot`.
 * @returns The quote plus its `slot` and decoded inputs, or `null` where the program fails closed (see
 *          {@link quoteStakeWithdrawNowV5}).
 * @throws If the pool, units, vault or (when passed) market account is missing or fails its decoder.
 * @example
 * ```ts
 * const q = await fetchStakeWithdrawQuoteV5(connection, { pool, insuranceUnits, vault: poolState.vault, userLp: ata });
 * if (q) maxButton(q.maxLpNow), lastSlot = q.slot;
 * ```
 */
export async function fetchStakeWithdrawQuoteV5(
  connection: AtomicReadConnection,
  accounts: StakeWithdrawAccountsV5,
  opts: AtomicReadOptions = {},
): Promise<StakeWithdrawQuoteAtSlotV5 | null> {
  const keys = [accounts.pool, accounts.insuranceUnits, accounts.vault, accounts.userLp];
  if (accounts.market) keys.push(accounts.market);
  const { slot, accounts: a } = await readAccountsAtomic(connection, keys, opts);
  const pool = decodeStakePoolV5(required(a[0]!, "stake pool", accounts.pool));
  const insuranceUnits = decodeInsuranceUnitsV20(required(a[1]!, "insurance units", accounts.insuranceUnits));
  const vaultBalance = splAmount(required(a[2]!, "pool vault", accounts.vault), "pool vault");
  const lpData = bytesOf(a[3]!);
  const userLp = lpData ? splAmount(lpData, "user LP") : 0n;
  let liveInsurance: bigint | undefined;
  if (accounts.market) {
    const cap = decodeTerminalInsuranceCapacity(required(a[4]!, "market", accounts.market), accounts.assetIndex ?? 0);
    const w = cap.domains[0].withdrawCapacity + cap.domains[1].withdrawCapacity;
    liveInsurance = w < cap.insurance ? w : cap.insurance;
  }
  const free = insuranceUnits.snapInsuranceFreeAtoms;
  const q = quoteStakeWithdrawNowV5(pool, insuranceUnits, free, vaultBalance, userLp, liveInsurance);
  if (!q) return null;
  const exitInsurance = liveInsurance !== undefined && liveInsurance < free ? liveInsurance : free;
  return { ...q, slot, pool, insuranceUnits, vaultBalance, userLp, exitInsurance };
}

// ============================================================================
// F2: non-bound Earn vault pricing (market + registry + own ledger + sibling ledger)
// ============================================================================

/** Options for {@link fetchNonboundVaultPricingP2b}. */
export interface NonboundVaultPricingFetchOptsP2b extends AtomicReadOptions {
  /**
   * The registry's `domain` (fixed at init). Pass it (e.g. from the last result) to make the read one RPC call;
   * without it the helper first reads the registry to learn it. Either way it is re-checked in the one-slot read.
   */
  domain?: number;
}

/** Result of {@link fetchNonboundVaultPricingP2b}. */
export interface NonboundVaultPricingAtSlotP2b extends NonboundVaultPricingP2b {
  /** The slot every input was read at. */
  slot: number;
  registry: PublicKey;
  domain: number;
  feeShareBps: number;
  /** `registry.total_lp_shares_outstanding` from the same slot (for `lpAtomsForRedemptionP2b` / `lpSharesForDepositP2b`). */
  totalLpSharesOutstanding: bigint;
}

/**
 * {@link nonboundVaultPricingFromAccountsP2b} with the market, the LP-vault registry and both backing ledgers read at
 * ONE slot. Reading the market before a deposit and the ledgers after it shows a par-minus-E3 gap that does not exist
 * (measured: a false 3,333 bps R3-M1 alert and +/-33% share quotes).
 *
 * @param connection  Connection ({@link AtomicReadConnection}).
 * @param programId   Wrapper program id.
 * @param market      Market account (the registry and ledger PDAs are derived from it).
 * @param opts        `domain`, `commitment`, `minContextSlot`.
 * @returns The pricing plus `slot`, `domain`, `feeShareBps` and the share count S from the same slot.
 * @throws If the market or registry is missing, the registry is BOUND (use {@link fetchBoundVaultExitQuoteP3}), or
 *         `opts.domain` does not match the registry.
 * @example
 * ```ts
 * const p = await fetchNonboundVaultPricingP2b(connection, PROGRAM_ID, market, { domain: last?.domain, minContextSlot: last?.slot });
 * health.parMinusE3Bps = p.parMinusE3Bps;
 * const out = lpAtomsForRedemptionP2b(shares, p.totalLpSharesOutstanding, p.exitNavAtoms);
 * ```
 */
export async function fetchNonboundVaultPricingP2b(
  connection: AtomicReadConnection,
  programId: PublicKey,
  market: PublicKey,
  opts: NonboundVaultPricingFetchOptsP2b = {},
): Promise<NonboundVaultPricingAtSlotP2b> {
  const [registry] = deriveLpVaultRegistry(programId, market);
  let domain = opts.domain;
  if (domain === undefined) {
    const pre = await readAccountsAtomic(connection, [registry], opts);
    domain = parseLpVaultRegistry(required(pre.accounts[0]!, "LP-vault registry", registry)).domain;
  }
  const [own] = deriveLpBackingLedger(programId, market, domain);
  const [sibling] = deriveLpBackingLedger(programId, market, domain ^ 1);
  const { slot, accounts: a } = await readAccountsAtomic(connection, [market, registry, own, sibling], opts);
  const marketData = required(a[0]!, "market", market);
  const registryData = required(a[1]!, "LP-vault registry", registry);
  if (isLpVaultRegistryBoundP3(registryData)) {
    throw new Error("fetchNonboundVaultPricingP2b: the registry is bound to a vault LP; use fetchBoundVaultExitQuoteP3");
  }
  const reg = parseLpVaultRegistry(registryData);
  if (reg.domain !== domain) throw new Error(`fetchNonboundVaultPricingP2b: registry domain ${reg.domain} != expected ${domain}`);
  const p = nonboundVaultPricingFromAccountsP2b({
    marketData, registryDomain: reg.domain, feeShareBps: reg.feeShareBps, ownLedgerData: bytesOf(a[2]!), siblingLedgerData: bytesOf(a[3]!),
  });
  return { ...p, slot, registry, domain: reg.domain, feeShareBps: reg.feeShareBps, totalLpSharesOutstanding: reg.totalLpSharesOutstanding };
}

// ============================================================================
// F3 + F4: bound vault senior exit (market + registry + VaultLpState + 2 ledgers + vault-LP portfolio)
// ============================================================================

/** The fixed addresses a bound vault's exit quote reads ({@link resolveBoundVaultKeysP3}). */
export interface BoundVaultKeysP3 {
  vaultLpState: PublicKey;
  registry: PublicKey;
  /** `VaultLpState.lp_portfolio`. */
  lpPortfolio: PublicKey;
  /** `registry.domain`. */
  domain: number;
  ownLedger: PublicKey;
  siblingLedger: PublicKey;
}

/**
 * Resolve the fixed addresses of a bound vault (they never change after init) with one read of the VaultLpState and
 * the registry. Cache the result and pass it as `keys` to {@link fetchBoundVaultExitQuoteP3} so each poll is one call.
 *
 * @param connection  Connection ({@link AtomicReadConnection}).
 * @param programId   Wrapper program id.
 * @param market      Market account.
 * @param opts        `commitment`, `minContextSlot`.
 * @returns {@link BoundVaultKeysP3}.
 * @throws If either account is missing, the VaultLpState names another registry, or the registry is not bound.
 * @example
 * ```ts
 * const keys = await resolveBoundVaultKeysP3(connection, PROGRAM_ID, market);
 * ```
 */
export async function resolveBoundVaultKeysP3(
  connection: AtomicReadConnection,
  programId: PublicKey,
  market: PublicKey,
  opts: AtomicReadOptions = {},
): Promise<BoundVaultKeysP3> {
  const [vaultLpState] = deriveVaultLpStateP3(programId, market);
  const [registry] = deriveLpVaultRegistry(programId, market);
  const { accounts: a } = await readAccountsAtomic(connection, [vaultLpState, registry], opts);
  const st = decodeVaultLpStateP3(required(a[0]!, "VaultLpState", vaultLpState));
  const registryData = required(a[1]!, "LP-vault registry", registry);
  if (!st.registry.equals(registry)) throw new Error(`VaultLpState names registry ${st.registry.toBase58()}, expected ${registry.toBase58()}`);
  if (!isLpVaultRegistryBoundP3(registryData)) throw new Error("the LP-vault registry is not bound to a vault LP; use fetchNonboundVaultPricingP2b");
  const { domain } = parseLpVaultRegistry(registryData);
  return {
    vaultLpState, registry, lpPortfolio: st.lpPortfolio, domain,
    ownLedger: deriveLpBackingLedger(programId, market, domain)[0],
    siblingLedger: deriveLpBackingLedger(programId, market, domain ^ 1)[0],
  };
}

/** Options for {@link fetchBoundVaultExitQuoteP3}. */
export interface BoundVaultExitQuoteOptsP3 extends AtomicReadOptions {
  /** Senior shares to redeem (tag 77). */
  shares: bigint;
  /** Cached {@link resolveBoundVaultKeysP3} result; without it the helper resolves the keys first (one extra read). */
  keys?: BoundVaultKeysP3;
}

/** Result of {@link fetchBoundVaultExitQuoteP3}. All values from one `slot`. */
export interface BoundVaultExitQuoteP3 {
  slot: number;
  keys: BoundVaultKeysP3;
  /** Market `header.mode == 1` (Resolved): seniors are priced on physical idle backing. */
  resolved: boolean;
  /** S, `registry.total_lp_shares_outstanding`. */
  totalShares: bigint;
  /** C, `VaultLpState.senior_claim_atoms`. */
  seniorClaim: bigint;
  /** Floored bound-vault NAV ({@link boundVaultNavFlooredP3}). */
  nav: bigint;
  /** The vault LP's health-certificate `certified_equity` (signed atoms). */
  certifiedEquity: bigint;
  /**
   * The certificate is usable here: `valid`, not stale, and certified for the current active-leg set. The program also
   * requires the certificate epochs to equal the market's (not checked here); when they do not, tag 77 fails with 85
   * until a vault-LP refresh crank (`buildVaultLpRefreshCrankIxP3`).
   */
  certUsable: boolean;
  /** {@link vaultLpEquityLagBoundsP3} `.worse` (prices the exit). Negative = a deficit at the worse price. */
  lpEquityWorse: bigint;
  /** {@link vaultLpEquityLagBoundsP3} `.better` (prices a tag-75 entry while a draw is outstanding). */
  lpEquityBetter: bigint;
  /** The vault LP's value at effective prices (`vault_lp_value_atoms`); null when the certificate is not usable on a non-flat LP. */
  lpValueAtEff: bigint | null;
  /** `VaultLpState.backstop_outstanding_atoms`: senior to the seniors, netted off the live vault value. */
  backstopOutstandingAtoms: bigint;
  /** `VaultLpState.senior_draw_outstanding_atoms`. */
  seniorDrawOutstandingAtoms: bigint;
  /** Senior tranche value tag 77 prices on; null when the vault LP cannot be valued (see `lpValueAtEff`). */
  seniorValue: bigint | null;
  /** `floor(shares · seniorValue / S)`; null when S == 0, shares > S, or `seniorValue` is null. */
  redemptionAtoms: bigint | null;
}

/** `HealthCertV16Account` (121 B) + stale_state, b_stale_state: they sit right before the 4 lock bytes, the 184 B
 * close-progress ledger and the resolved-payout receipt (same in every layout row; pinned against devnet bytes). */
const HEALTH_CERT_TO_RECEIPT = 121 + 4 + 184;

function readHealthCertP3(portfolio: Uint8Array): { certifiedEquity: bigint; valid: boolean; stale: boolean; bitmapAtCert: bigint } {
  const g = resolvePortfolioLayout(portfolio, { parser: "fetchBoundVaultExitQuoteP3" }).portfolio;
  const off = g.sourceDomainsOff + g.sourceDomainCap * g.sourceDomainStride;
  if (off + HEALTH_CERT_TO_RECEIPT !== g.resolvedPayoutReceiptOff) throw new Error("vault-LP portfolio: health-certificate offset does not match the layout");
  if (portfolio.length < off + 123) throw new Error("vault-LP portfolio too short for its health certificate");
  const v = new DataView(portfolio.buffer, portfolio.byteOffset, portfolio.byteLength);
  const lo = v.getBigUint64(off, true);
  const hi = v.getBigInt64(off + 8, true);
  return {
    certifiedEquity: (hi << 64n) | lo,
    bitmapAtCert: v.getBigUint64(off + 112, true),
    valid: portfolio[off + 120] === 1,
    stale: portfolio[off + 121] !== 0 || portfolio[off + 122] !== 0,
  };
}

function potTerms(d: Uint8Array | null): BackingPotTermsP3 {
  const l = d && d.length > 0 ? decodeBackingDomainLedgerP2b(d) : null;
  return {
    totalPrincipalAtoms: l?.totalPrincipalAtoms ?? 0n,
    totalEarningsAtoms: l?.totalEarningsAtoms ?? 0n,
    totalEarningsWithdrawnAtoms: l?.totalEarningsWithdrawnAtoms ?? 0n,
    cumulativeLossAtoms: l?.cumulativeLossAtoms ?? 0n,
    cumulativeRecoveryAtoms: l?.cumulativeRecoveryAtoms ?? 0n,
  };
}

/**
 * Live tag-77 senior value net of the G9 backstop receivable (`p4_rescue_ins::live_exit_senior_value_net_backstop`).
 * With no backstop outstanding it is exactly {@link liveExitSeniorValueP3}.
 */
function liveExitSeniorValueNetBackstop(c: bigint, nav: bigint, lpValueAtEff: bigint, worse: bigint, backstop: bigint): bigint {
  if (backstop === 0n) return liveExitSeniorValueP3(c, nav, lpValueAtEff, worse);
  const sat = (a: bigint, b: bigint) => (a > b ? a - b : 0n);
  const min = (a: bigint, b: bigint) => (a < b ? a : b);
  if (worse >= 0n) return min(sat(nav + min(lpValueAtEff, worse), backstop), c);
  const d = -worse;
  return min(sat(sat(nav, d), backstop), vaultLpSeniorPricingClaimP3(c, d, sat(nav, c)));
}

/**
 * The tag-77 senior exit quote of a BOUND vault with every input read at ONE slot: the registry share count S, the
 * VaultLpState claim C, both backing ledgers and pot buckets (NAV), and the vault-LP portfolio's legs and health
 * certificate against the market's effective / target prices. Reading the portfolio after a crank and the market
 * before it double-counts the pending price move (measured: `lpEquityWorse` -20,000 USDC against a true +40,000, a
 * false deficit); reading S and C across a senior deposit misprices the payout by -20% / +25%.
 *
 * Model: the existing SDK previews ({@link boundVaultNavFlooredP3}, {@link vaultLpEquityLagBoundsP3},
 * {@link liveExitSeniorValueP3} net of the backstop, {@link boundVaultRedemptionAtomsP3}). Not modelled: pending
 * harvestable fees (tag 77 then fails VaultLpHarvestPending; bundle tag 78 first), an undrawn senior deficit (87;
 * crank the draw first) and the certificate epochs (85; see `certUsable`).
 *
 * @param connection  Connection ({@link AtomicReadConnection}).
 * @param programId   Wrapper program id.
 * @param market      Market account.
 * @param opts        `shares`, cached `keys`, `commitment`, `minContextSlot`.
 * @returns {@link BoundVaultExitQuoteP3}.
 * @throws If an account is missing or fails its decoder, the registry is not bound, or the cached keys no longer match.
 * @example
 * ```ts
 * const keys = await resolveBoundVaultKeysP3(connection, PROGRAM_ID, market);
 * const q = await fetchBoundVaultExitQuoteP3(connection, PROGRAM_ID, market, { shares, keys, minContextSlot: last?.slot });
 * if (q.lpEquityWorse < 0n) note("the vault LP is in deficit at the pending price");
 * ```
 */
export async function fetchBoundVaultExitQuoteP3(
  connection: AtomicReadConnection,
  programId: PublicKey,
  market: PublicKey,
  opts: BoundVaultExitQuoteOptsP3,
): Promise<BoundVaultExitQuoteP3> {
  const keys = opts.keys ?? (await resolveBoundVaultKeysP3(connection, programId, market, opts));
  const { slot, accounts: a } = await readAccountsAtomic(
    connection, [market, keys.registry, keys.vaultLpState, keys.ownLedger, keys.siblingLedger, keys.lpPortfolio], opts,
  );
  const marketData = required(a[0]!, "market", market);
  const registryData = required(a[1]!, "LP-vault registry", keys.registry);
  const st = decodeVaultLpStateP3(required(a[2]!, "VaultLpState", keys.vaultLpState));
  const lpData = required(a[5]!, "vault-LP portfolio", keys.lpPortfolio);
  if (!isLpVaultRegistryBoundP3(registryData)) throw new Error("the LP-vault registry is not bound to a vault LP");
  const reg = parseLpVaultRegistry(registryData);
  if (reg.domain !== keys.domain) throw new Error(`registry domain ${reg.domain} != cached ${keys.domain}`);
  if (!st.registry.equals(keys.registry) || !st.lpPortfolio.equals(keys.lpPortfolio)) throw new Error("VaultLpState no longer matches the cached keys");

  const g = resolveMarketGeometry(marketData, { parser: "fetchBoundVaultExitQuoteP3", strictLength: false });
  const resolved = marketData[g.groupOff + g.layout.group.mode] === 1;
  const ownRec = readPotEngineRecordsP2b(marketData, reg.domain);
  const sibRec = readPotEngineRecordsP2b(marketData, reg.domain ^ 1);
  const { nav } = boundVaultNavFlooredP3(potTerms(bytesOf(a[3]!)), potTerms(bytesOf(a[4]!)), reg.feeShareBps, {
    own: vaultPotHeldAtomsP3(ownRec), sibling: vaultPotHeldAtomsP3(sibRec),
  });

  const pf = parsePortfolioV17(lpData);
  const cert = readHealthCertP3(lpData);
  const legs = pf.legs.filter((l) => l.active).map((l) => ({ basisPosQ: l.basisPosQ, ...readAssetPricesP3(marketData, l.assetIndex) }));
  const { worse, better } = vaultLpEquityLagBoundsP3({ legs, certifiedEquity: cert.certifiedEquity, capital: pf.capital, pnl: pf.pnl, feeCredits: pf.feeCredits });
  const certUsable = cert.valid && !cert.stale && cert.bitmapAtCert === pf.activeBitmap;
  let lpValueAtEff: bigint | null;
  if (certUsable) lpValueAtEff = cert.certifiedEquity > 0n ? cert.certifiedEquity : 0n;
  else if (pf.activeBitmap === 0n) lpValueAtEff = worse; // flat: vaultLpEquityLagBoundsP3 returns conservative_equity
  else lpValueAtEff = null;

  let seniorValue: bigint | null;
  if (resolved) {
    seniorValue = vaultPhysicalIdleBackingAtomsP3([ownRec.freshUnlienedBackingNum, sibRec.freshUnlienedBackingNum]);
    if (seniorValue > st.seniorClaimAtoms) seniorValue = st.seniorClaimAtoms;
  } else if (worse >= 0n && lpValueAtEff === null) {
    seniorValue = null;
  } else {
    seniorValue = liveExitSeniorValueNetBackstop(st.seniorClaimAtoms, nav, worse >= 0n ? lpValueAtEff! : 0n, worse, st.backstopOutstandingAtoms);
  }
  const redemptionAtoms = seniorValue === null ? null : boundVaultRedemptionAtomsP3(opts.shares, reg.totalLpSharesOutstanding, seniorValue);
  return {
    slot, keys, resolved, totalShares: reg.totalLpSharesOutstanding, seniorClaim: st.seniorClaimAtoms, nav,
    certifiedEquity: cert.certifiedEquity, certUsable, lpEquityWorse: worse, lpEquityBetter: better, lpValueAtEff,
    backstopOutstandingAtoms: st.backstopOutstandingAtoms, seniorDrawOutstandingAtoms: st.seniorDrawOutstandingAtoms,
    seniorValue, redemptionAtoms,
  };
}

// ============================================================================
// F5: DEX spot price (PumpSwap: pool + base vault + quote vault)
// ============================================================================

/** Options for {@link fetchDexSpotPriceE6}. */
export interface DexSpotPriceFetchOpts extends AtomicReadOptions {
  /** PumpSwap: cached `{ baseVault, quoteVault }` from `parseDexPool` (fixed at pool init); saves the first read. */
  vaults?: { baseVault: PublicKey; quoteVault: PublicKey };
  /** Forwarded to {@link computeDexSpotPriceE6}. */
  solPriceE6?: bigint;
}

/**
 * {@link computeDexSpotPriceE6} with the pool and (PumpSwap) both reserve vaults read at ONE slot. Reading the base
 * vault before a swap and the quote vault after it gives a price no slot had (measured 10% off both snapshots for a
 * swap worth 10% of the quote reserves). Raydium CLMM and Meteora DLMM price from the pool account alone.
 *
 * @param connection  Connection ({@link AtomicReadConnection}).
 * @param dexType     `"pumpswap" | "raydium-clmm" | "meteora-dlmm"`.
 * @param pool        Pool account.
 * @param decimals    Mint decimals (PumpSwap, Meteora; see {@link computeDexSpotPriceE6}).
 * @param opts        PumpSwap `vaults`, `solPriceE6`, `commitment`, `minContextSlot`.
 * @returns `{ priceE6, slot }`.
 * @throws If an account is missing, the pool no longer names the cached vaults, or the price is not positive.
 * @example
 * ```ts
 * const { priceE6, slot } = await fetchDexSpotPriceE6(connection, "pumpswap", poolPk, { base: 6, quote: 9 });
 * ```
 */
export async function fetchDexSpotPriceE6(
  connection: AtomicReadConnection,
  dexType: DexType,
  pool: PublicKey,
  decimals?: { base: number; quote: number },
  opts: DexSpotPriceFetchOpts = {},
): Promise<{ priceE6: bigint; slot: number }> {
  if (dexType !== "pumpswap") {
    const { slot, accounts: a } = await readAccountsAtomic(connection, [pool], opts);
    return { priceE6: computeDexSpotPriceE6(dexType, required(a[0]!, "DEX pool", pool), undefined, decimals, opts.solPriceE6), slot };
  }
  let vaults = opts.vaults;
  if (!vaults) {
    const pre = await readAccountsAtomic(connection, [pool], opts);
    const p = parseDexPool("pumpswap", pool, required(pre.accounts[0]!, "DEX pool", pool));
    vaults = { baseVault: p.baseVault!, quoteVault: p.quoteVault! };
  }
  const { slot, accounts: a } = await readAccountsAtomic(connection, [pool, vaults.baseVault, vaults.quoteVault], opts);
  const poolData = required(a[0]!, "DEX pool", pool);
  const p = parseDexPool("pumpswap", pool, poolData);
  if (!p.baseVault!.equals(vaults.baseVault) || !p.quoteVault!.equals(vaults.quoteVault)) throw new Error("PumpSwap pool no longer names the cached vaults");
  const priceE6 = computeDexSpotPriceE6(
    "pumpswap", poolData,
    { base: required(a[1]!, "PumpSwap base vault", vaults.baseVault), quote: required(a[2]!, "PumpSwap quote vault", vaults.quoteVault) },
    decimals, opts.solPriceE6,
  );
  return { priceE6, slot };
}
