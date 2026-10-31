/**
 * #636 / #636b (percolator-prog #640 + #641 at 780013c8): the exact account lists of the eight flow tags and their
 * compute-unit limits. Every expected list below is written out by hand from the Rust handlers
 * (`src/v16_program.rs` `handle_*` + `lev_nav_flow_begin(.., guard_idx, ext_idx, ..)`), not derived from the SDK
 * table, so a builder that drifts from the program fails here.
 *
 * Everything is imported from the package root on purpose: run against the pre-#640 SDK (negative control) the
 * existing builders return the old, shorter lists and the new builders are undefined, so every case fails.
 */
import { Keypair, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import type { AccountMeta } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { describe, expect, it } from "vitest";
import * as S from "../src/index.js";

const pk = (): PublicKey => Keypair.generate().publicKey;
const P = pk(), MARKET = pk(), LP = pk();
const DOMAIN = 1;
const m = { programId: P, market: MARKET, registryDomain: DOMAIN, lpPortfolio: LP };
const SYS = SystemProgram.programId;

// PDAs, each derived here from its seed (independent of the SDK helpers under test).
const pda = (...seeds: (string | PublicKey | Uint8Array)[]): PublicKey =>
  PublicKey.findProgramAddressSync(seeds.map((s) => (typeof s === "string" ? Buffer.from(s) : s instanceof PublicKey ? s.toBuffer() : Buffer.from(s))), P)[0];
const GUARD = pda("lev_guard", MARKET);
const EXT = pda("vault_lp_ext", MARKET);
const STATE = pda("vault_lp", MARKET);
const TRANCHE = pda("bond_tranche", MARKET);
const UNITS = pda("ins_units", MARKET);

const REGISTRY = S.deriveLpVaultRegistry(P, MARKET)[0];
const OWN = S.deriveLpBackingLedger(P, MARKET, DOMAIN)[0];
const SIB = S.deriveLpBackingLedger(P, MARKET, DOMAIN ^ 1)[0];
const VAULT_AUTH = S.deriveVaultAuthority(P, MARKET)[0];

const keys = (ix: TransactionInstruction): string[] => ix.keys.map((k) => k.pubkey.toBase58());
const b58 = (xs: PublicKey[]): string[] => xs.map((x) => x.toBase58());
const at = (ix: TransactionInstruction, i: number): AccountMeta => ix.keys[i]!;

describe("seeds: the SDK derives the same lev guard / ext PDAs as the program", () => {
  it("navFlowAccountsV22 = [lev_guard, market] and [vault_lp_ext, market]", () => {
    const a = S.navFlowAccountsV22(P, MARKET);
    expect([a.guard.toBase58(), a.ext.toBase58()]).toEqual([GUARD.toBase58(), EXT.toBase58()]);
  });
});

describe("exact account lists (program 780013c8)", () => {
  const owner = pk(), tok = pk(), vault = pk(), cranker = pk();

  it("96 DepositJuniorTranche: 7 base + [7] guard w + [8] ext w", () => {
    const ix = S.buildDepositJuniorTrancheIxV22(m, owner, tok, vault, 5n);
    expect(keys(ix)).toEqual(b58([owner, MARKET, STATE, LP, tok, vault, TOKEN_PROGRAM_ID, GUARD, EXT]));
    expect([at(ix, 7).isWritable, at(ix, 8).isWritable]).toEqual([true, true]);
    expect(ix.data[0]).toBe(96);
  });

  it("97 WithdrawJuniorTranche: 11 base + [11] ext w + [12] pad / bond tranche + [13] guard w", () => {
    const base = [owner, MARKET, REGISTRY, STATE, LP, OWN, SIB, tok, vault, VAULT_AUTH, TOKEN_PROGRAM_ID];
    const ix = S.buildWithdrawJuniorTrancheIxV22(m, owner, tok, vault, 5n);
    expect(keys(ix)).toEqual(b58([...base, EXT, SYS, GUARD]));
    expect([at(ix, 11).isWritable, at(ix, 12).isWritable, at(ix, 13).isWritable]).toEqual([true, false, true]);
    const bond = S.buildWithdrawJuniorTrancheIxV22({ ...m, vaultLpExt: EXT }, owner, tok, vault, 5n, { bond: true });
    expect(keys(bond)).toEqual(b58([...base, EXT, TRANCHE, GUARD]));
  });

  it("98 VaultLpRecall: 8 base + [8] ext w (always) + [9] guard w", () => {
    const ix = S.buildVaultLpRecallIxV22(m, cranker, 7n, 0);
    expect(keys(ix)).toEqual(b58([cranker, MARKET, REGISTRY, STATE, LP, OWN, SIB, SYS, EXT, GUARD]));
    expect([at(ix, 8).isWritable, at(ix, 9).isWritable]).toEqual([true, true]);
  });

  it("102 VaultLpReleaseSurplus Live: 7 base + [7..11] pads + [12] ext w + [13] guard w", () => {
    const ix = S.buildVaultLpReleaseSurplusLiveIxV22(m, owner, 9n, DOMAIN);
    expect(keys(ix)).toEqual(b58([owner, MARKET, REGISTRY, STATE, LP, OWN, SIB, SYS, SYS, SYS, SYS, SYS, EXT, GUARD]));
    expect(ix.keys.slice(7, 12).every((k) => !k.isWritable && !k.isSigner)).toBe(true);
    expect([at(ix, 12).isWritable, at(ix, 13).isWritable]).toEqual([true, true]);
  });

  it("102 Resolved is unchanged (the program does not sample there)", () => {
    const resolved = S.buildVaultLpReleaseSurplusIxP3(m, owner, 9n, DOMAIN, { juniorDestToken: tok, vaultToken: vault });
    expect(resolved.keys).toHaveLength(11);
    expect(keys(S.withNavFlowTailV22(resolved, MARKET))).toEqual(keys(resolved));
    const bond = S.withBondTailV22(resolved, TRANCHE);
    expect(keys(S.withNavFlowTailV22(bond, MARKET))).toEqual(keys(bond));
  });

  it("103 VaultLpAllocate: 9 base ([7] ext) + [9] pad / bond tranche + [10] guard w", () => {
    const base = [cranker, MARKET, REGISTRY, STATE, LP, OWN, SIB, EXT, SYS];
    const ix = S.buildVaultLpAllocateIxV22(m, cranker, S.U128_MAX_P2B);
    expect(keys(ix)).toEqual(b58([...base, SYS, GUARD]));
    expect(at(ix, 10).isWritable).toBe(true);
    expect(keys(S.buildVaultLpAllocateIxV22(m, cranker, S.U128_MAX_P2B, { bondTranche: true }))).toEqual(b58([...base, TRANCHE, GUARD]));
  });

  it("108 BondDeposit: 13 base + [13] ext w + [14] guard w", () => {
    const ix = S.buildBondDepositIxV22(m, owner, tok, vault, 1_000n, 1n);
    const pos = S.deriveBondPositionV22(P, MARKET, owner)[0];
    expect(keys(ix)).toEqual(b58([owner, MARKET, REGISTRY, STATE, LP, OWN, SIB, TRANCHE, pos, tok, vault, TOKEN_PROGRAM_ID, SYS, EXT, GUARD]));
    expect([at(ix, 13).isWritable, at(ix, 14).isWritable]).toEqual([true, true]);
  });

  it("110 BondExecuteWithdraw: 13 base + [13] ext w + [14] guard w", () => {
    const ix = S.buildBondExecuteWithdrawIxV22(m, owner, tok, vault, 1n, DOMAIN);
    const pos = S.deriveBondPositionV22(P, MARKET, owner)[0];
    expect(keys(ix)).toEqual(b58([owner, MARKET, REGISTRY, STATE, LP, OWN, SIB, TRANCHE, pos, tok, vault, VAULT_AUTH, TOKEN_PROGRAM_ID, EXT, GUARD]));
    expect([at(ix, 13).isWritable, at(ix, 14).isWritable]).toEqual([true, true]);
  });

  it("111 InsuranceBackstopDraw: modes 0/1/3 carry ext w + guard w in [7..] (after units, before feeds); mode 2 does not", () => {
    const feed = pk();
    const base = [cranker, MARKET, REGISTRY, STATE, LP, OWN, SIB, UNITS];
    for (const mode of [0, 1, 3] as const) {
      const ix = S.buildInsuranceBackstopDrawIxV22(m, cranker, mode, 5n, [feed]);
      expect(keys(ix)).toEqual(b58([...base, EXT, GUARD, feed]));
      expect([at(ix, 8).isWritable, at(ix, 9).isWritable, at(ix, 10).isWritable]).toEqual([true, true, false]);
    }
    expect(keys(S.buildInsuranceBackstopDrawIxV22(m, cranker, 2, 0n, [feed]))).toEqual(b58([...base, feed]));
  });
});

describe("withNavFlowTailV22 (the helper a keeper / app applies to its own instructions)", () => {
  const mk = (tag: number, n: number, set: Record<number, PublicKey> = {}, extra: number[] = []): TransactionInstruction =>
    new TransactionInstruction({ programId: P, data: Buffer.from([tag, ...extra]), keys: Array.from({ length: n }, (_, i) => ({ pubkey: set[i] ?? pk(), isSigner: false, isWritable: false })) });

  it("is idempotent on every full form", () => {
    for (const ix of [
      S.buildDepositJuniorTrancheIxV22(m, pk(), pk(), pk(), 1n), S.buildWithdrawJuniorTrancheIxV22(m, pk(), pk(), pk(), 1n),
      S.buildVaultLpRecallIxV22(m, pk(), 1n, 0), S.buildVaultLpReleaseSurplusLiveIxV22(m, pk(), 1n, 0),
      S.buildVaultLpAllocateIxV22(m, pk(), 1n), S.buildBondDepositIxV22(m, pk(), pk(), pk(), 1n, 1n),
      S.buildBondExecuteWithdrawIxV22(m, pk(), pk(), pk(), 1n, 0), S.buildInsuranceBackstopDrawIxV22(m, pk(), 1, 1n),
    ]) {
      expect(keys(S.withNavFlowTailV22(ix, MARKET))).toEqual(keys(ix));
      expect(S.hasNavFlowTailV22(ix, MARKET)).toBe(true);
    }
  });

  it("an old-form instruction has no tail; the helper adds it", () => {
    const old = S.buildVaultLpAllocateIxP2b(m, pk(), 1n);
    expect(S.hasNavFlowTailV22(old, MARKET)).toBe(false);
    expect(S.withNavFlowTailV22(old, MARKET).keys).toHaveLength(11);
  });

  it("fails closed: a non-PDA ext where the program reads the ext, an unknown count, a tag without a tail", () => {
    expect(() => S.withNavFlowTailV22(mk(98, 9), MARKET)).toThrow(/vault ext at \[8\]/);
    expect(() => S.withNavFlowTailV22(mk(103, 9), MARKET)).toThrow(/vault ext at \[7\]/);
    expect(() => S.withNavFlowTailV22(mk(97, 12), MARKET)).toThrow(/vault ext at \[11\]/);
    expect(() => S.withNavFlowTailV22(mk(96, 6), MARKET)).toThrow(/tag 96 must have 7/);
    expect(() => S.withNavFlowTailV22(mk(108, 12), MARKET)).toThrow(/tag 108 must have 13/);
    expect(() => S.withNavFlowTailV22(mk(102, 9), MARKET)).toThrow(/tag 102 Live/);
    expect(() => S.withNavFlowTailV22(mk(75, 13), MARKET)).toThrow(/takes no NAV flow tail/);
    expect(() => S.withNavFlowTailV22(mk(96, 9), MARKET)).toThrow(/lev guard at \[7\]/);
  });

  it("111: an ext / guard already present in [7..] is not duplicated (made writable); below [7] it does not count", () => {
    const pre = mk(111, 9, { 7: GUARD, 8: EXT }, [1]);
    const out = S.withNavFlowTailV22(pre, MARKET);
    expect(out.keys).toHaveLength(9);
    expect([out.keys[7]!.isWritable, out.keys[8]!.isWritable]).toEqual([true, true]);
    const low = mk(111, 7, { 3: GUARD }, [0]);
    expect(S.withNavFlowTailV22(low, MARKET).keys).toHaveLength(9);
  });
});

describe("compute-unit limits (always explicit for the flow tags)", () => {
  it("pinned values, each at least 2x the worst measured case", () => {
    const want = { 96: 250_000, 97: 300_000, 98: 400_000, 102: 300_000, 103: 600_000, 108: 600_000, 110: 600_000, 111: 600_000 };
    const got = Object.fromEntries(Object.entries(S.NAV_FLOW_COMPUTE_UNITS_V22).map(([k, v]) => [k, v.units]));
    expect(got).toEqual(Object.fromEntries(Object.entries(want).map(([k, v]) => [k, v])));
    for (const v of Object.values(S.NAV_FLOW_COMPUTE_UNITS_V22)) expect(v.units).toBeGreaterThanOrEqual(2 * v.measuredWorst);
    // tag 103 after #640 measured 207k: above the 200k runtime default
    expect(S.NAV_FLOW_COMPUTE_UNITS_V22[103].measuredWorst).toBeGreaterThan(200_000);
  });
  it("COMPUTE_PRESETS_V22 carries the same numbers for every flow tag", () => {
    const c = S.COMPUTE_PRESETS_V22;
    expect([c.depositJuniorTranche!.units, c.withdrawJuniorTranche!.units, c.vaultLpRecall!.units, c.vaultLpReleaseSurplus!.units, c.vaultLpAllocate!.units, c.bondDeposit!.units, c.bondExecuteWithdraw!.units, c.insuranceBackstopDraw!.units])
      .toEqual([250_000, 300_000, 400_000, 300_000, 600_000, 600_000, 600_000, 600_000]);
  });
});
