/**
 * Differential test: the non-bound LP-vault (Earn) money path in `src/abi/p2b-earn.ts` against
 * BigInt transcriptions of the Rust it ports. No cargo: the Rust was read with `git show`.
 *
 * References (quoted line by line beside each transcription below):
 * - engine `percolator` @ feat/v22-engine-rc23-2026-10-22 (67a4c5b9)
 *     src/v16.rs:29941 `lp_vault::lp_shares_for_deposit`
 *     src/v16.rs:29965 `lp_vault::lp_atoms_for_redemption`
 *     src/wide_math.rs:1623 `wide_mul_div_floor_u128`
 * - program `percolator-prog` @ feat/v22-rc23-2026-10-22 (bc657392)
 *     src/v16_program.rs:22454 `lp_vault_combined_nav_rule`
 *     src/v16_program.rs:22175 `lp_vault_domain_nav_atoms` (entry: par, exit: E3)
 *     src/v16_program.rs:22232 `lp_vault_nav_atoms_floored`
 *     src/v16_program.rs:32214 tag-75 `amount == 0` gate, :32551 zero-share gate, :32565 genesis dead shares
 *     src/vault_lp_v18.rs:874 `nonbound_pot_available`, :899 `nonbound_pot_entry_available`
 *   (src/v16_program.rs:8739 `state::lp_shares_for_deposit` is a legacy helper the live tag-75
 *   handler does NOT call: tag 75 calls `percolator::lp_vault::lp_shares_for_deposit` at :32542 and
 *   tag 77 calls `percolator::lp_vault::lp_atoms_for_redemption` at :33772. It is transcribed only
 *   to pin that it differs (nav 0 with shares outstanding mints 1:1 there) and is not the reference.)
 *
 * Every reference returns `ok` (value), `err` (the program refuses with an error code) or `panic`
 * (the value left u128: `wide_mul_div_floor_u128` aborts, or a checked_add fails with
 * EngineArithmeticOverflow; the SDK uses unbounded bigints there).
 * The SDK matches when: ok == the same bigint; err == SDK returns null or throws; panic/overflow ==
 * SDK returns null, throws, or a value above u128::MAX (never an in-range value the chain would
 * not produce).
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  entryVsExitP2b,
  lpAtomsForRedemptionP2b,
  lpSharesForDepositP2b,
  nonboundVaultPricingP2b,
  type NonboundPotP2b,
  type NonboundVaultPricingP2b,
} from "../src/abi/p2b-earn.js";

const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;
/** `percolator::MAX_MARGIN_BPS` (10_000). */
const MAX_MARGIN_BPS = 10_000n;
/** prog `constants::LP_VAULT_MINIMUM_LIQUIDITY` (v16_program.rs:1048). */
const LP_VAULT_MINIMUM_LIQUIDITY = 1_000n;

type Ref = { ok: bigint } | { err: string } | { panic: string };
type Sdk = { ok: bigint } | { err: "null" | "throw" };

// ---------------------------------------------------------------------------------------------
// Rust transcriptions
// ---------------------------------------------------------------------------------------------

/**
 * wide_math.rs:1623
 *   pub fn wide_mul_div_floor_u128(a: u128, b: u128, d: u128) -> u128 {
 *       assert!(d > 0, "wide_mul_div_floor_u128: division by zero");
 *       let result = mul_div_floor_u256(U256::from_u128(a), U256::from_u128(b), U256::from_u128(d));
 *       result
 *           .try_into_u128()
 *           .expect("wide_mul_div_floor_u128: result exceeds u128")
 *   }
 * (a*b < 2^256 always for u128 inputs, so the U256 product is exact.)
 */
function wideMulDivFloorU128(a: bigint, b: bigint, d: bigint): Ref {
  if (d === 0n) return { panic: "division by zero" };
  const r = (a * b) / d;
  if (r > U128_MAX) return { panic: "result exceeds u128" };
  return { ok: r };
}

/**
 * v16.rs:29941
 *   pub fn lp_shares_for_deposit(amount: u128, total_shares: u128, nav_atoms: u128) -> V16Result<u128> {
 *       if total_shares == 0 {
 *           return Ok(amount);
 *       }
 *       if nav_atoms == 0 {
 *           return Err(V16Error::InvalidConfig);
 *       }
 *       let shares = wide_mul_div_floor_u128(amount, total_shares, nav_atoms);
 *       if shares == 0 {
 *           return Err(V16Error::LpVaultZeroSharesMinted);
 *       }
 *       Ok(shares)
 *   }
 * (doc: "`total_shares == 0`: fresh vault or drain-epoch reset -> 1:1 (returns `amount`).
 *  Caller guarantees `amount > 0`.")
 */
function engineLpSharesForDeposit(amount: bigint, totalShares: bigint, nav: bigint): Ref {
  if (totalShares === 0n) return { ok: amount };
  if (nav === 0n) return { err: "InvalidConfig" };
  const s = wideMulDivFloorU128(amount, totalShares, nav);
  if ("ok" in s && s.ok === 0n) return { err: "LpVaultZeroSharesMinted" };
  return s;
}

/**
 * The shares tag 75 (non-bound) adds to `registry.total_lp_shares_outstanding`
 * (v16_program.rs handle_deposit_to_lp_vault):
 *   :32214  if amount == 0 {
 *               return Err(PercolatorError::LpVaultZeroAmount.into());
 *           }
 *   :32542  percolator::lp_vault::lp_shares_for_deposit(amount, registry.total_lp_shares_outstanding, nav)
 *               .map_err(map_v16_error)?
 *   :32551  if shares == 0 {
 *               return Err(PercolatorError::LpVaultZeroSharesMinted.into());
 *           }
 * The SDK contract ("null when the program would refuse: nav 0 with shares, or 0 shares") is this
 * composed result. Not modelled (they are separate gates on the NAV itself, not share pricing):
 * the :32456 `nav * LP_VAULT_MAX_PRICE_COLLAPSE < total` refusal and the target-pot impairment gate.
 */
function progDepositShares(amount: bigint, totalShares: bigint, nav: bigint): Ref {
  if (amount === 0n) return { err: "LpVaultZeroAmount" };
  const s = engineLpSharesForDeposit(amount, totalShares, nav);
  if ("ok" in s && s.ok === 0n) return { err: "LpVaultZeroSharesMinted" };
  return s;
}

/**
 * The shares tag 75 MINTS to the depositor (v16_program.rs:32565):
 *   let shares_to_mint = if registry.total_lp_shares_outstanding == 0 {
 *       shares
 *           .checked_sub(crate::constants::LP_VAULT_MINIMUM_LIQUIDITY)
 *           .filter(|&s| s != 0)
 *           .ok_or(PercolatorError::LpVaultDepositBelowMinimumLiquidity)?
 *   } else {
 *       shares
 *   };
 *   let shares_u64 = u64::try_from(shares_to_mint).map_err(|_| PercolatorError::EngineArithmeticOverflow)?;
 */
function progSharesMinted(amount: bigint, totalShares: bigint, nav: bigint): Ref {
  const s = progDepositShares(amount, totalShares, nav);
  if (!("ok" in s)) return s;
  let m = s.ok;
  if (totalShares === 0n) {
    m = s.ok - LP_VAULT_MINIMUM_LIQUIDITY;
    if (m <= 0n) return { err: "LpVaultDepositBelowMinimumLiquidity" };
  }
  if (m > U64_MAX) return { err: "EngineArithmeticOverflow" };
  return { ok: m };
}

/**
 * v16_program.rs:8739 (legacy `state::lp_shares_for_deposit`, NOT called by tag 75):
 *   let shares = if total_shares == 0 || nav_atoms == 0 {
 *       // Bootstrap: 1 share per atom.
 *       amount
 *   } else {
 *       let num = amount.checked_mul(total_shares).ok_or(PercolatorError::EngineArithmeticOverflow)?;
 *       num / nav_atoms
 *   };
 *   Ok(shares)
 */
function legacyStateLpSharesForDeposit(amount: bigint, totalShares: bigint, nav: bigint): Ref {
  if (totalShares === 0n || nav === 0n) return { ok: amount };
  const num = amount * totalShares;
  if (num > U128_MAX) return { err: "EngineArithmeticOverflow" };
  return { ok: num / nav };
}

/**
 * v16.rs:29965
 *   pub fn lp_atoms_for_redemption(shares: u128, total_shares: u128, nav_atoms: u128) -> V16Result<u128> {
 *       if total_shares == 0 {
 *           return Err(V16Error::InvalidConfig);
 *       }
 *       if shares > total_shares {
 *           return Err(V16Error::CounterUnderflow);
 *       }
 *       Ok(wide_mul_div_floor_u128(shares, nav_atoms, total_shares))
 *   }
 */
function engineLpAtomsForRedemption(shares: bigint, totalShares: bigint, nav: bigint): Ref {
  if (totalShares === 0n) return { err: "InvalidConfig" };
  if (shares > totalShares) return { err: "CounterUnderflow" };
  return wideMulDivFloorU128(shares, nav, totalShares);
}

/**
 * v16_program.rs:22232 (called by `lp_vault_domain_nav_atoms` with loss = recovery = 0):
 *   if fee_share_bps as u64 > percolator::MAX_MARGIN_BPS {
 *       return Err(PercolatorError::EngineInvalidConfig.into());
 *   }
 *   let available_principal = total_principal_atoms
 *       .saturating_sub(cumulative_loss_atoms.saturating_sub(cumulative_recovery_atoms));
 *   let net_earnings = total_earnings_atoms
 *       .checked_sub(total_earnings_withdrawn_atoms)
 *       .ok_or(PercolatorError::EngineCounterUnderflow)?;
 *   let lp_earnings = percolator::wide_math::wide_mul_div_floor_u128(
 *       net_earnings, fee_share_bps as u128, percolator::MAX_MARGIN_BPS as u128);
 *   available_principal
 *       .checked_add(lp_earnings)
 *       .ok_or_else(|| PercolatorError::EngineArithmeticOverflow.into())
 */
function lpVaultNavAtomsFloored(available: bigint, earnings: bigint, withdrawn: bigint, feeShareBps: bigint): Ref {
  if (feeShareBps > MAX_MARGIN_BPS) return { err: "EngineInvalidConfig" };
  const availablePrincipal = available; // loss = recovery = 0 -> saturating_sub(0)
  if (earnings < withdrawn) return { err: "EngineCounterUnderflow" };
  const lp = wideMulDivFloorU128(earnings - withdrawn, feeShareBps, MAX_MARGIN_BPS);
  if (!("ok" in lp)) return lp;
  const nav = availablePrincipal + lp.ok;
  if (nav > U128_MAX) return { panic: "EngineArithmeticOverflow" }; // u128 overflow class (see agrees)
  return { ok: nav };
}

/**
 * v16_program.rs:22175 lp_vault_domain_nav_atoms:
 *   let available = if entry {
 *       nonbound_entry_available(&bucket, &ledger)           // vault_lp_v18.rs:899 -> principal
 *   } else {
 *       nonbound_available_e3(&source, &bucket, &ledger)     // vault_lp_v18.rs:874 ->
 *   };                                                       //   if principal < physical_net { principal } else { physical_net }
 *   lp_vault_nav_atoms_floored(available, ledger.total_earnings_atoms, ledger.total_earnings_withdrawn_atoms, 0, 0, fee_share_bps)
 */
function domainNav(p: NonboundPotP2b, feeShareBps: bigint, entry: boolean): Ref {
  const principal = p.totalPrincipalAtoms;
  const available = entry ? principal : principal < p.physicalNetAtoms ? principal : p.physicalNetAtoms;
  return lpVaultNavAtomsFloored(available, p.totalEarningsAtoms, p.totalEarningsWithdrawnAtoms, feeShareBps);
}

/**
 * v16_program.rs:22454
 *   fn lp_vault_combined_nav_rule(group, market_group, authority, domain, fee_share_bps,
 *                                 own_ledger_data, sibling_ledger_data, entry: bool) -> Result<u128, ProgramError> {
 *       let own = lp_vault_domain_nav_atoms(.., domain, fee_share_bps, own_ledger_data, entry)?;
 *       let sib = lp_vault_domain_nav_atoms(.., sibling_domain(domain), fee_share_bps, sibling_ledger_data, entry)?;
 *       own.checked_add(sib)
 *           .ok_or_else(|| PercolatorError::EngineArithmeticOverflow.into())
 *   }
 */
function combinedNavRule(own: NonboundPotP2b, sib: NonboundPotP2b, feeShareBps: bigint, entry: boolean): Ref {
  const a = domainNav(own, feeShareBps, entry);
  if (!("ok" in a)) return a;
  const b = domainNav(sib, feeShareBps, entry);
  if (!("ok" in b)) return b;
  if (a.ok + b.ok > U128_MAX) return { panic: "EngineArithmeticOverflow" }; // u128 overflow class
  return { ok: a.ok + b.ok };
}

// ---------------------------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------------------------

function sdk(f: () => bigint | null): Sdk {
  try {
    const v = f();
    return v === null ? { err: "null" } : { ok: v };
  } catch {
    return { err: "throw" };
  }
}

function agrees(s: Sdk, r: Ref): boolean {
  if ("ok" in r) return "ok" in s && s.ok === r.ok;
  if ("err" in r) return "err" in s;
  return "err" in s || s.ok > U128_MAX; // panic: never an in-range value
}

const show = (x: Ref | Sdk): string => ("ok" in x ? `${x.ok}n` : "err" in x ? `err(${x.err})` : `panic(${x.panic})`);

interface Row { cases: number; boundary: number; random: number; mismatches: { input: string; sdk: string; rust: string }[] }
const table = new Map<string, Row>();
function record(fn: string, kind: "boundary" | "random", input: string, s: Sdk, r: Ref): void {
  let row = table.get(fn);
  if (!row) table.set(fn, (row = { cases: 0, boundary: 0, random: 0, mismatches: [] }));
  row.cases++;
  row[kind]++;
  if (!agrees(s, r)) row.mismatches.push({ input, sdk: show(s), rust: show(r) });
}
function mismatches(fn: string): Row["mismatches"] {
  return table.get(fn)?.mismatches ?? [];
}

/** splitmix64, BigInt: deterministic across runs and platforms. */
function rng(seed: bigint): () => bigint {
  let s = seed & U64_MAX;
  return () => {
    s = (s + 0x9e3779b97f4a7c15n) & U64_MAX;
    let z = s;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & U64_MAX;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & U64_MAX;
    return z ^ (z >> 31n);
  };
}
/** A value from a mix of edge-heavy u128 distributions. */
function draw(next: () => bigint): bigint {
  const k = next() % 10n;
  switch (k) {
    case 0n: return 0n;
    case 1n: return 1n + (next() % 3n);
    case 2n: return next() % 1_000_000n;
    case 3n: return next() % (1n << 32n);
    case 4n: return next(); // u64
    case 5n: return U64_MAX - (next() % 1_000n);
    case 6n: return (next() << 64n) | next(); // u128
    case 7n: return U128_MAX - (next() % 1_000n);
    case 8n: return LP_VAULT_MINIMUM_LIQUIDITY - 2n + (next() % 5n);
    default: return next() % (1n << 48n);
  }
}
/** A u64-bounded atom amount (ledger counters are u64-bounded on chain). */
function drawAtoms(next: () => bigint): bigint {
  const v = draw(next);
  return v > U64_MAX ? v & U64_MAX : v;
}

const N_RANDOM = 10_000;
const ZERO_POT: NonboundPotP2b = { totalPrincipalAtoms: 0n, totalEarningsAtoms: 0n, totalEarningsWithdrawnAtoms: 0n, physicalNetAtoms: 0n };
const pot = (principal: bigint, physical: bigint, earnings = 0n, withdrawn = 0n): NonboundPotP2b => ({
  totalPrincipalAtoms: principal, totalEarningsAtoms: earnings, totalEarningsWithdrawnAtoms: withdrawn, physicalNetAtoms: physical,
});

const EDGES = [0n, 1n, 2n, 999n, 1_000n, 1_001n, 10n ** 6n, U64_MAX - 1n, U64_MAX, U64_MAX + 1n, U128_MAX - 1n, U128_MAX];

// ---------------------------------------------------------------------------------------------
// lpSharesForDepositP2b (src/abi/p2b-earn.ts:773)
// ---------------------------------------------------------------------------------------------

describe("lpSharesForDepositP2b vs tag 75 (engine lp_shares_for_deposit + prog gates)", () => {
  const FN = "lpSharesForDepositP2b vs prog tag-75 shares";
  const FN_ENG = "lpSharesForDepositP2b vs engine (amount >= 1)";
  const run = (kind: "boundary" | "random", a: bigint, t: bigint, n: bigint) => {
    const s = sdk(() => lpSharesForDepositP2b(a, t, n));
    const input = `amount=${a} total=${t} nav=${n}`;
    record(FN, kind, input, s, progDepositShares(a, t, n));
    // The engine fn's own domain is amount > 0 ("Caller guarantees `amount > 0`").
    if (a > 0n) record(FN_ENG, kind, input, s, engineLpSharesForDeposit(a, t, n));
  };

  it("boundary grid (0, 1, u64/u128 max, nav 0 with shares, first deposit)", () => {
    for (const a of EDGES) for (const t of EDGES) for (const n of EDGES) run("boundary", a, t, n);
    expect(mismatches(FN_ENG)).toEqual([]);
    expect(mismatches(FN)).toEqual([]);
  });

  it("amount 0 is refused at genesis too (prog :32214 LpVaultZeroAmount), not priced 0n", () => {
    // Before the fix the SDK returned 0n here although its own doc promises null on 0 shares
    // and the program refuses every amount-0 deposit before pricing.
    expect(lpSharesForDepositP2b(0n, 0n, 0n)).toBeNull();
    expect(lpSharesForDepositP2b(0n, 0n, 5_000n)).toBeNull();
    expect(lpSharesForDepositP2b(0n, 10_000n, 10_000n)).toBeNull(); // non-genesis: already null
    expect(lpSharesForDepositP2b(1n, 0n, 0n)).toBe(1n); // genesis 1:1 unchanged
  });

  it("nav 0 with shares outstanding: tag 75 refuses (engine InvalidConfig); the legacy state helper would mint 1:1", () => {
    expect(engineLpSharesForDeposit(1_000n, 10_000n, 0n)).toEqual({ err: "InvalidConfig" });
    expect(legacyStateLpSharesForDeposit(1_000n, 10_000n, 0n)).toEqual({ ok: 1_000n });
    expect(lpSharesForDepositP2b(1_000n, 10_000n, 0n)).toBeNull();
  });

  it("first deposit with and without the minimum-liquidity rule", () => {
    // Without the rule (the share count the registry total grows by) the SDK is exact.
    for (const a of [1n, 999n, 1_000n, 1_001n, 10n ** 9n, U64_MAX]) {
      expect(lpSharesForDepositP2b(a, 0n, 0n)).toBe(a);
      expect(lpSharesForDepositP2b(a, 0n, 123n)).toBe(a);
    }
    // With it: the depositor receives shares - 1000; 1..=1000 is refused. The SDK fn returns the
    // registry increment, so a genesis UI must subtract LP_VAULT_MINIMUM_LIQUIDITY itself.
    expect(progSharesMinted(1_000n, 0n, 0n)).toEqual({ err: "LpVaultDepositBelowMinimumLiquidity" });
    expect(progSharesMinted(1n, 0n, 0n)).toEqual({ err: "LpVaultDepositBelowMinimumLiquidity" });
    expect(progSharesMinted(1_001n, 0n, 0n)).toEqual({ ok: 1n });
    expect(progSharesMinted(5_000n, 10_000n, 10_000n)).toEqual({ ok: 5_000n }); // non-genesis: no carve-out
    for (const a of [1_001n, 10n ** 9n, U64_MAX]) {
      const s = lpSharesForDepositP2b(a, 0n, 0n)!;
      expect(progSharesMinted(a, 0n, 0n)).toEqual({ ok: s - LP_VAULT_MINIMUM_LIQUIDITY });
    }
  });

  it("result above u128 (engine panics) is never an in-range SDK value", () => {
    const r = engineLpSharesForDeposit(U64_MAX, U128_MAX, 1n);
    expect("panic" in r).toBe(true);
    expect(lpSharesForDepositP2b(U64_MAX, U128_MAX, 1n)! > U128_MAX).toBe(true);
  });

  it(`${N_RANDOM} seeded random cases`, () => {
    const next = rng(0x5eed_75n);
    for (let i = 0; i < N_RANDOM; i++) {
      const t = i % 7 === 0 ? 0n : draw(next);
      run("random", draw(next), t, draw(next));
    }
    expect(mismatches(FN_ENG)).toEqual([]);
    expect(mismatches(FN)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// lpAtomsForRedemptionP2b (src/abi/p2b-earn.ts:791)
// ---------------------------------------------------------------------------------------------

describe("lpAtomsForRedemptionP2b vs engine lp_atoms_for_redemption", () => {
  const FN = "lpAtomsForRedemptionP2b vs engine";
  const run = (kind: "boundary" | "random", sh: bigint, t: bigint, n: bigint) =>
    record(FN, kind, `shares=${sh} total=${t} nav=${n}`, sdk(() => lpAtomsForRedemptionP2b(sh, t, n)), engineLpAtomsForRedemption(sh, t, n));

  it("boundary grid (0, 1, u64/u128 max, shares > total, nav 0 with shares)", () => {
    for (const sh of EDGES) for (const t of EDGES) for (const n of EDGES) run("boundary", sh, t, n);
    expect(mismatches(FN)).toEqual([]);
    expect(lpAtomsForRedemptionP2b(11n, 10n, 1_000n)).toBeNull(); // shares > total: CounterUnderflow
    expect(lpAtomsForRedemptionP2b(1n, 0n, 1_000n)).toBeNull(); // no shares: InvalidConfig
    expect(lpAtomsForRedemptionP2b(10n, 10n, 0n)).toBe(0n); // nav 0 with shares: 0 atoms, not an error
    // shares <= total keeps the quotient <= nav <= u128::MAX, so the engine never panics here.
    expect(lpAtomsForRedemptionP2b(U128_MAX, U128_MAX, U128_MAX)).toBe(U128_MAX);
  });

  it(`${N_RANDOM} seeded random cases`, () => {
    const next = rng(0x5eed_77n);
    for (let i = 0; i < N_RANDOM; i++) {
      const t = draw(next);
      const sh = i % 4 === 0 ? draw(next) : t === 0n ? 0n : (draw(next) % (t + 1n)); // mostly shares <= total
      run("random", sh, t, draw(next));
    }
    expect(mismatches(FN)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// potNav (:725) and nonboundVaultPricingP2b (:747)
// ---------------------------------------------------------------------------------------------

describe("nonboundVaultPricingP2b / potNav vs lp_vault_combined_nav_rule (entry=par, exit=E3)", () => {
  const FN_POT = "potNav (one pot + empty sibling) vs domain nav";
  const FN_ENTRY = "nonboundVaultPricingP2b.entryNavAtoms vs rule(entry=true)";
  const FN_EXIT = "nonboundVaultPricingP2b.exitNavAtoms vs rule(entry=false)";
  const FN_BPS = "nonboundVaultPricingP2b.parMinusE3* vs BigInt floor";

  const run = (kind: "boundary" | "random", own: NonboundPotP2b, sib: NonboundPotP2b, fee: number) => {
    const input = `own=${JSON.stringify(own, (_, v) => (typeof v === "bigint" ? `${v}` : v))} sib=${JSON.stringify(sib, (_, v) => (typeof v === "bigint" ? `${v}` : v))} fee=${fee}`;
    let p: NonboundVaultPricingP2b | null = null;
    try { p = nonboundVaultPricingP2b(own, sib, fee); } catch { p = null; }
    const sEntry: Sdk = p ? { ok: p.entryNavAtoms } : { err: "throw" };
    const sExit: Sdk = p ? { ok: p.exitNavAtoms } : { err: "throw" };
    const rEntry = combinedNavRule(own, sib, BigInt(fee), true);
    const rExit = combinedNavRule(own, sib, BigInt(fee), false);
    record(FN_ENTRY, kind, input, sEntry, rEntry);
    record(FN_EXIT, kind, input, sExit, rExit);
    if (sib === ZERO_POT) record(FN_POT, kind, input, sEntry, domainNav(own, BigInt(fee), true));
    // The program refuses the whole pricing when either reading errors; so must the SDK.
    if ("err" in rEntry || "err" in rExit) {
      record(FN_BPS, kind, input, p ? { ok: 0n } : { err: "throw" }, { err: "either reading refused" });
      return;
    }
    if ("panic" in rEntry || "panic" in rExit) {
      // Out of u128: covered by the entry/exit rows (SDK value above u128::MAX); no bps to compare.
      record(FN_BPS, kind, input, sEntry, rEntry);
      return;
    }
    // parMinusE3 (SDK-only display): gap = entry - exit >= 0, bps = floor(gap*10000/entry), 0 if entry 0.
    const gap = rEntry.ok - rExit.ok;
    const bps = rEntry.ok === 0n ? 0n : (gap * 10_000n) / rEntry.ok;
    const ok = p !== null && gap >= 0n && p.parMinusE3Atoms === gap && Number.isSafeInteger(p.parMinusE3Bps) && BigInt(p.parMinusE3Bps) === bps;
    record(FN_BPS, kind, input, ok ? { ok: 0n } : { ok: -1n }, { ok: 0n });
  };

  it("boundary inputs (0, 1, u64/u128 max, earnings < withdrawn, fee 0/10000/10001, E3 below par)", () => {
    const vals = [0n, 1n, 999n, 10n ** 6n, U64_MAX, U128_MAX];
    const fees = [0, 1, 5_000, 9_999, 10_000, 10_001];
    for (const pr of vals) for (const ph of vals) for (const e of [0n, 1n, U64_MAX, U128_MAX]) for (const w of [0n, 1n, U64_MAX]) for (const fee of fees) {
      run("boundary", pot(pr, ph, e, w), ZERO_POT, fee);
      run("boundary", pot(pr, ph, e, w), pot(pr, ph, e, w), fee);
    }
    for (const fn of [FN_POT, FN_ENTRY, FN_EXIT, FN_BPS]) expect(mismatches(fn)).toEqual([]);
    // earnings < withdrawn: the program fails EngineCounterUnderflow (Custom 25); SDK throws.
    expect(() => nonboundVaultPricingP2b(pot(5n, 5n, 1n, 2n), ZERO_POT, 10_000)).toThrow(/Custom 25/);
    // u128 overflow on the sum: the program fails; the SDK value is above u128::MAX (detectable).
    expect(combinedNavRule(pot(U128_MAX, U128_MAX), pot(1n, 1n), 0n, true)).toEqual({ panic: "EngineArithmeticOverflow" });
    expect(nonboundVaultPricingP2b(pot(U128_MAX, U128_MAX), pot(1n, 1n), 0).entryNavAtoms > U128_MAX).toBe(true);
  });

  it(`${N_RANDOM} seeded random cases (u64-bounded ledger atoms, as on chain)`, () => {
    const next = rng(0x5eed_4a7n);
    const p = (): NonboundPotP2b => {
      const earnings = drawAtoms(next);
      const withdrawn = next() % 8n === 0n ? drawAtoms(next) : earnings === 0n ? 0n : (next() % (earnings + 1n));
      return pot(drawAtoms(next), drawAtoms(next), earnings, withdrawn);
    };
    for (let i = 0; i < N_RANDOM; i++) {
      const fee = next() % 50n === 0n ? 10_001 : Number(next() % 10_001n);
      run("random", p(), i % 5 === 0 ? ZERO_POT : p(), fee);
    }
    for (const fn of [FN_POT, FN_ENTRY, FN_EXIT, FN_BPS]) expect(mismatches(fn)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// entryVsExitP2b (:821)
// ---------------------------------------------------------------------------------------------

describe("entryVsExitP2b vs lp_atoms_for_redemption on the entry and exit NAVs", () => {
  const FN = "entryVsExitP2b vs engine redemption x2";
  const run = (kind: "boundary" | "random", sh: bigint, t: bigint, entryNav: bigint, exitNav: bigint) => {
    const pricing: NonboundVaultPricingP2b = { entryNavAtoms: entryNav, exitNavAtoms: exitNav, parMinusE3Atoms: entryNav - exitNav, parMinusE3Bps: 0 };
    const input = `shares=${sh} total=${t} entryNav=${entryNav} exitNav=${exitNav}`;
    const e = engineLpAtomsForRedemption(sh, t, entryNav);
    const x = engineLpAtomsForRedemption(sh, t, exitNav);
    let v: ReturnType<typeof entryVsExitP2b> | null = null;
    try { v = entryVsExitP2b(sh, t, pricing); } catch { v = null; }
    if (!("ok" in e) || !("ok" in x)) {
      record(FN, kind, input, v ? { ok: 0n } : { err: "throw" }, { err: "refused" });
      return;
    }
    const haircut = e.ok - x.ok;
    const bps = e.ok === 0n ? 0n : (haircut * 10_000n) / e.ok;
    const ok = v !== null && v.entryValueAtoms === e.ok && v.exitValueAtoms === x.ok && v.haircutAtoms === haircut
      && haircut >= 0n && Number.isSafeInteger(v.haircutBps) && BigInt(v.haircutBps) === bps;
    record(FN, kind, input, ok ? { ok: 0n } : { ok: -1n }, { ok: 0n });
  };

  it("boundary inputs (0, 1, u128 max, shares > total, exit 0)", () => {
    for (const sh of EDGES) for (const t of EDGES) for (const en of [0n, 1n, 10n ** 6n, U64_MAX, U128_MAX]) for (const xf of [0n, 1n, 2n]) {
      const ex = xf === 0n ? 0n : xf === 1n ? en : en / 2n; // exit <= entry always (E3 <= par)
      run("boundary", sh, t, en, ex);
    }
    expect(mismatches(FN)).toEqual([]);
  });

  it(`${N_RANDOM} seeded random cases`, () => {
    const next = rng(0x5eed_e4en);
    for (let i = 0; i < N_RANDOM; i++) {
      const t = draw(next);
      const sh = i % 6 === 0 ? draw(next) : t === 0n ? 0n : draw(next) % (t + 1n);
      const en = draw(next);
      const ex = en === 0n ? 0n : draw(next) % (en + 1n);
      run("random", sh, t, en, ex);
    }
    expect(mismatches(FN)).toEqual([]);
  });
});

afterAll(() => {
  const rows = [...table.entries()].map(([fn, r]) => ({ fn, boundary: r.boundary, random: r.random, cases: r.cases, mismatches: r.mismatches.length }));
  // eslint-disable-next-line no-console
  console.log(`\nfn x cases (SDK vs transcribed Rust)\n${rows.map((r) => `| ${r.fn} | ${r.boundary} | ${r.random} | ${r.cases} | ${r.mismatches} |`).join("\n")}`);
  for (const [fn, r] of table) for (const m of r.mismatches.slice(0, process.env.DIFF_ALL ? undefined : 5)) console.log(`MISMATCH ${fn}: ${m.input} sdk=${m.sdk} rust=${m.rust}`);
});
