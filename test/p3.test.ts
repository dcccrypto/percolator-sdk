/**
 * P3 vault-owned LP parity. Fixture `test/fixtures/p3-parity.json` is emitted by the REAL
 * P3 crate (percolator-prog feat/p3-vault-owned-lp @ 424fe7e4) via
 * scripts/p3-parity/sdk_p3_parity.rs: `Instruction::decode` of our encoder hex, rustc
 * `offset_of!`, `PercolatorError::X as u32`, `read_asset_vault_lp`, `init_vault_lp_state`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { P3_VECTOR_INPUTS, encodeP3Vector } from "./p3-vector-inputs.js";
import * as root from "../src/index.js";
import {
  IX_TAG_P3,
  ACCOUNTS_INIT_VAULT_LP_P3,
  ACCOUNTS_VAULT_LP_SET_MATCHER_P3,
  ACCOUNTS_DEPOSIT_JUNIOR_TRANCHE_P3,
  ACCOUNTS_WITHDRAW_JUNIOR_TRANCHE_P3,
  ACCOUNTS_VAULT_LP_RECALL_P3,
  ACCOUNTS_SET_VAULT_LP_RISK_P3,
  ACCOUNTS_VAULT_LP_CONVERT_PNL_P3,
  ACCOUNTS_VAULT_LP_SETTLE_RESOLVED_P3,
  ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_P3,
  encodeInitVaultLpP3,
  encodeVaultLpSetMatcherP3,
  encodeSetVaultLpRiskP3,
} from "../src/abi/p3.js";
import {
  VAULT_LP_STATE_OFF_P3,
  ASSET_VAULT_LP_FIELD_OFF_P3,
  VAULT_LP_STATE_ACCOUNT_LEN_P3,
  V18_KIND_VAULT_LP_STATE_P3,
  ASSET_VAULT_LP_SLOT_OFF_P3,
  ASSET_VAULT_LP_LEN_P3,
  LP_VAULT_REGISTRY_BOUND_FLAG_OFF_P3,
  assetVaultLpAccountOffsetP3,
  decodeVaultLpStateP3,
  decodeAssetVaultLpRecordP3,
  decodeAssetVaultLpP3,
  isLpVaultRegistryBoundP3,
  withBoundVaultLpTailP3,
  buildVaultLpRefreshCrankIxP3,
  buildInitVaultLpIxP3,
  buildVaultLpSetMatcherIxP3,
  buildWithdrawJuniorTrancheIxP3,
  buildVaultLpReleaseSurplusIxP3,
  deriveVaultLpStateP3,
  deriveProgramDataAddressP3,
} from "../src/solana/p3-vault-lp.js";
import { PERCOLATOR_ERRORS } from "../src/abi/errors.js";
import { IX_TAG } from "../src/abi/instructions.js";
import { deriveLpBackingLedger, deriveLpVaultRegistry, deriveMatcherDelegate } from "../src/solana/pda.js";

interface Fixture {
  p3Sha: string;
  vectors: Record<string, { hex: string; rust: { ok: boolean; decoded?: Record<string, string | number | number[][]> | null; err?: string } }>;
  errors: Record<string, number>;
  layout: {
    headerLen: number; vaultLpStateBodyLen: number; vaultLpStateAccountLen: number; kindVaultLpState: number;
    assetVaultLpLen: number; assetVaultLpSlotOff: number; flagBound: number; registryReservedOff: number;
    vaultLpStateAccountOff: Record<string, number>; assetVaultLpFieldOff: Record<string, number>;
  };
  assetVaultLpOffsets: { marketLenCap4: number; rows: { asset: number; sdkOffset: number; programReadsSame: boolean; recordHex: string }[] };
  vaultLpStateAccountHex: string;
}
const FX = JSON.parse(readFileSync(new URL("./fixtures/p3-parity.json", import.meta.url), "utf8")) as Fixture;
const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
const W = new PublicKey("ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB");
const pk = (): PublicKey => Keypair.generate().publicKey;

describe("P3 encoders — round-trip through the real P3 decoder", () => {
  it("fixture is from the pinned P3 head", () => {
    expect(FX.p3Sha).toBe("424fe7e473bec1154eacde1ac8bd7e190b526fd2");
  });
  for (const [id, input] of Object.entries(P3_VECTOR_INPUTS)) {
    it(`${id}: SDK bytes == fixture bytes, and Rust decodes them to the SDK inputs`, () => {
      const fx = FX.vectors[id];
      expect(hex(encodeP3Vector(input))).toBe(fx.hex);
      expect(fx.rust.ok).toBe(true);
      const d = fx.rust.decoded!;
      expect(d.tag).toBe(input.tag);
      for (const [k, v] of Object.entries(input)) {
        if (k === "tag") continue;
        if (k === "approvedMatcherProgram") { expect(d.approvedMatcherProgramHex).toBe(hex((v as PublicKey).toBytes())); continue; }
        if (k === "observations") { expect(d.observations).toEqual((v as { assetIndex: number; oracleAccounts: number }[]).map((o) => [o.assetIndex, o.oracleAccounts])); continue; }
        expect(d[k], `${id}.${k}`).toBe(String(v));
      }
      expect(FX.vectors[`${id}__long`].rust.ok, "decoder must reject a trailing byte").toBe(false);
      expect(FX.vectors[`${id}__short`].rust.ok, "decoder must reject a short payload").toBe(false);
    });
  }
  it("encoders refuse values the program refuses", () => {
    expect(() => encodeInitVaultLpP3(999)).toThrow();
    expect(() => encodeInitVaultLpP3(10_001)).toThrow();
    const sm = P3_VECTOR_INPUTS.setMatcher as Parameters<typeof encodeVaultLpSetMatcherP3>[0] & { tag: 95 };
    expect(() => encodeVaultLpSetMatcherP3({ ...sm, maxFillAbs: 0n })).toThrow();
    expect(() => encodeVaultLpSetMatcherP3({ ...sm, maxInventoryAbs: 0n })).toThrow();
    const sr = P3_VECTOR_INPUTS.setRisk as Parameters<typeof encodeSetVaultLpRiskP3>[0] & { tag: 99 };
    expect(() => encodeSetVaultLpRiskP3({ ...sr, vaultLpMaxLevBps: 50_001 })).toThrow();
    expect(() => encodeSetVaultLpRiskP3({ ...sr, levMaxImrBps: 10_001 })).toThrow();
  });
  it("IX_TAG_P3 = 94..102; the deprecated v12 IX_TAG entries still hold those numbers (documented collision), P1 is 93", () => {
    expect(Object.values(IX_TAG_P3)).toEqual([94, 95, 96, 97, 98, 99, 100, 101, 102]);
    expect(IX_TAG.InitSharedVault).toBe(94);
    expect(IX_TAG.QueueWithdrawal).toBe(102);
  });
});

describe("P3 errors 72-85 (and P1 66-71) by name from the final enum", () => {
  it("every ordinal matches PercolatorError::X as u32", () => {
    for (const [name, code] of Object.entries(FX.errors)) expect(PERCOLATOR_ERRORS[code]?.name, `code ${code}`).toBe(name);
    expect(Object.keys(FX.errors)).toHaveLength(20);
    expect(PERCOLATOR_ERRORS[86]).toBeUndefined();
  });
});

describe("P3 layout — rustc offset_of on the real structs", () => {
  it("VaultLpStateV18 account offsets, sizes and kind", () => {
    expect(VAULT_LP_STATE_OFF_P3).toEqual(FX.layout.vaultLpStateAccountOff);
    expect(VAULT_LP_STATE_ACCOUNT_LEN_P3).toBe(FX.layout.vaultLpStateAccountLen);
    expect(V18_KIND_VAULT_LP_STATE_P3).toBe(FX.layout.kindVaultLpState);
    expect(LP_VAULT_REGISTRY_BOUND_FLAG_OFF_P3).toBe(FX.layout.registryReservedOff);
  });
  it("AssetVaultLpV18 field offsets", () => {
    expect(ASSET_VAULT_LP_FIELD_OFF_P3).toEqual(FX.layout.assetVaultLpFieldOff);
    expect(ASSET_VAULT_LP_SLOT_OFF_P3).toBe(FX.layout.assetVaultLpSlotOff);
    expect(ASSET_VAULT_LP_LEN_P3).toBe(FX.layout.assetVaultLpLen);
  });
  it("per-asset account offset (2246 + 2325·i) is where the program's read_asset_vault_lp reads", () => {
    for (const r of FX.assetVaultLpOffsets.rows) {
      expect(r.programReadsSame).toBe(true);
      expect(assetVaultLpAccountOffsetP3(r.asset)).toBe(r.sdkOffset);
    }
    expect(assetVaultLpAccountOffsetP3(0)).toBe(2246);
  });
});

describe("P3 decoders", () => {
  it("decodeVaultLpStateP3 reads an account written by the program's init_vault_lp_state", () => {
    const d = new Uint8Array(Buffer.from(FX.vaultLpStateAccountHex, "hex"));
    const st = decodeVaultLpStateP3(d);
    expect(st.marketGroup.toBytes().every((b) => b === 1)).toBe(true);
    expect(st.juniorOwner.toBytes().every((b) => b === 4)).toBe(true);
    expect(st.seniorClaimAtoms).toBe(123_456_789_012_345n);
    expect(st.juniorDepositedAtoms).toBe(50_000_000n);
    expect(st.juniorWithdrawnAtoms).toBe(7n);
    expect(st.seniorFeeCreditedAtoms).toBe(999n);
    expect(st.recalledAtoms).toBe(42n);
    expect([st.assetIndex, st.juniorFloorBps, st.seniorFeeShareBps, st.version, st.bump]).toEqual([3, 2_000, 10_000, 1, 254]);
    const bad = Uint8Array.from(d); bad[10] = 5;
    expect(() => decodeVaultLpStateP3(bad)).toThrow(/kind/);
    const bad2 = Uint8Array.from(d); bad2[240] = 1;
    expect(() => decodeVaultLpStateP3(bad2)).toThrow(/invalid/);
  });
  it("decodeAssetVaultLpRecordP3 / decodeAssetVaultLpP3 read the program's record bytes", () => {
    const row = FX.assetVaultLpOffsets.rows[2];
    const rec = decodeAssetVaultLpRecordP3(new Uint8Array(Buffer.from(row.recordHex, "hex")));
    expect(rec.bound).toBe(true);
    expect(rec.vaultLpPortfolio!.toBytes().every((b) => b === 0xa2)).toBe(true);
    expect(rec.lpNetQ).toBe(-1_234_567_890_125n);
    expect([rec.levCapQ, rec.lpNetSlot, rec.skewSlopeE9, rec.skewMaxE9]).toEqual([40_000_000_000n, 505_580_402n, 2_000n, 900n]);
    expect([rec.levMaxImrBps, rec.vaultLpMaxLevBps]).toEqual([5_000, 20_000]);
    const market = new Uint8Array(FX.assetVaultLpOffsets.marketLenCap4);
    market[10] = 1;
    market.set(Buffer.from(row.recordHex, "hex"), row.sdkOffset);
    expect(decodeAssetVaultLpP3(market, 2).lpNetQ).toBe(-1_234_567_890_125n);
    expect(decodeAssetVaultLpP3(market, 1).bound).toBe(false);
    const inconsistent = new Uint8Array(Buffer.from(row.recordHex, "hex")); inconsistent[90] = 0;
    expect(() => decodeAssetVaultLpRecordP3(inconsistent)).toThrow();
  });
  it("isLpVaultRegistryBoundP3 reads _reserved[0] at account offset 160", () => {
    const r = new Uint8Array(176);
    expect(isLpVaultRegistryBoundP3(r)).toBe(false);
    r[160] = 1;
    expect(isLpVaultRegistryBoundP3(r)).toBe(true);
    r[160] = 2;
    expect(() => isLpVaultRegistryBoundP3(r)).toThrow();
  });
});

describe("P3 account lists and builders (verified against the handler bodies)", () => {
  it("account counts per tag", () => {
    expect([ACCOUNTS_INIT_VAULT_LP_P3, ACCOUNTS_VAULT_LP_SET_MATCHER_P3, ACCOUNTS_DEPOSIT_JUNIOR_TRANCHE_P3,
      ACCOUNTS_WITHDRAW_JUNIOR_TRANCHE_P3, ACCOUNTS_VAULT_LP_RECALL_P3, ACCOUNTS_SET_VAULT_LP_RISK_P3,
      ACCOUNTS_VAULT_LP_CONVERT_PNL_P3, ACCOUNTS_VAULT_LP_SETTLE_RESOLVED_P3, ACCOUNTS_VAULT_LP_RELEASE_SURPLUS_P3,
    ].map((a) => a.length)).toEqual([8, 8, 7, 11, 8, 3, 4, 12, 7]);
  });
  const market = pk(), lp = pk();
  const m = { programId: W, market, registryDomain: 1, lpPortfolio: lp };
  it("tag 94 is path A only: exactly 8 accounts, marketauth signs; no path-B tail exists", () => {
    const auth = pk();
    const a = buildInitVaultLpIxP3(m, auth, 2_000);
    expect(a.keys).toHaveLength(8);
    expect(a.keys[0]).toEqual({ pubkey: auth, isSigner: true, isWritable: true });
    expect(a.keys[2].pubkey.equals(deriveLpVaultRegistry(W, market)[0])).toBe(true);
    expect(a.keys[3].pubkey.equals(deriveVaultLpStateP3(W, market)[0])).toBe(true);
    expect(a.keys[6].pubkey.equals(deriveLpBackingLedger(W, market, 1)[0])).toBe(true); // own = registry domain
    expect(a.keys[7].pubkey.equals(deriveLpBackingLedger(W, market, 0)[0])).toBe(true); // sibling = domain ^ 1
    // a stray 4th argument (the removed juniorOwner) must not resurrect the [8]/[9] tail
    const loose = buildInitVaultLpIxP3 as unknown as (...args: unknown[]) => TransactionInstruction;
    expect(loose(m, auth, 2_000, pk()).keys).toHaveLength(8);
    expect((root as Record<string, unknown>).ACCOUNTS_INIT_VAULT_LP_PATH_B_TAIL_P3).toBeUndefined();
    expect(a.keys.some((k) => k.pubkey.equals(deriveProgramDataAddressP3(W)[0]))).toBe(false);
  });
  it("tag 95 delegate is derived with the REGISTRY as LP owner", () => {
    const prog = pk(), ctx = pk();
    const sm = P3_VECTOR_INPUTS.setMatcher as Parameters<typeof encodeVaultLpSetMatcherP3>[0] & { tag: 95 };
    const ix = buildVaultLpSetMatcherIxP3(m, pk(), prog, ctx, sm);
    const [reg] = deriveLpVaultRegistry(W, market);
    expect(ix.keys[7].pubkey.equals(deriveMatcherDelegate(W, market, lp, reg, prog, ctx)[0])).toBe(true);
    expect(ix.keys[0].isSigner).toBe(true);
    expect(ix.data.length).toBe(96);
  });
  it("tag 97 = 11 accounts; tag 102 Resolved appends the 4-account SPL tail", () => {
    expect(buildWithdrawJuniorTrancheIxP3(m, pk(), pk(), pk(), 1n).keys).toHaveLength(11);
    expect(buildVaultLpReleaseSurplusIxP3(m, pk(), 1n, 0).keys).toHaveLength(7);
    expect(buildVaultLpReleaseSurplusIxP3(m, pk(), 1n, 0, { juniorDestToken: pk(), vaultToken: pk() }).keys).toHaveLength(11);
  });
  it("withBoundVaultLpTailP3: 75 → [11] state(w), [12] lp; 77 → [13],[14]; 78 → [6] state(w); others refused", () => {
    const st = pk();
    const mk = (tag: number, n: number): TransactionInstruction => new TransactionInstruction({
      programId: W, keys: Array.from({ length: n }, () => ({ pubkey: pk(), isSigner: false, isWritable: false })), data: Buffer.from([tag]),
    });
    const d = withBoundVaultLpTailP3(mk(75, 11), st, lp);
    expect(d.keys).toHaveLength(13);
    expect(d.keys[11]).toEqual({ pubkey: st, isSigner: false, isWritable: true });
    expect(d.keys[12]).toEqual({ pubkey: lp, isSigner: false, isWritable: false });
    expect(withBoundVaultLpTailP3(mk(77, 13), st, lp).keys).toHaveLength(15);
    const c = withBoundVaultLpTailP3(mk(78, 6), st, lp);
    expect(c.keys).toHaveLength(7);
    expect(c.keys[6].isWritable).toBe(true);
    expect(() => withBoundVaultLpTailP3(mk(75, 10), st, lp)).toThrow(/exactly 11/);
    expect(() => withBoundVaultLpTailP3(mk(76, 5), st, lp)).toThrow(/no vault-LP tail/);
  });
  it("refresh crank = tag 5 on the vault LP portfolio with the oracle tail", () => {
    const oracle = pk();
    const ix = buildVaultLpRefreshCrankIxP3({ programId: W, cranker: pk(), market, vaultLpPortfolio: lp, nowSlot: 505_580_400n,
      observations: [{ assetIndex: 0, oracleAccounts: 1 }, { assetIndex: 2, oracleAccounts: 0 }], oracleAccounts: [oracle] });
    expect(hex(ix.data)).toBe(FX.vectors.refreshCrank.hex);
    expect(ix.keys[2]).toEqual({ pubkey: lp, isSigner: false, isWritable: true });
    expect(ix.keys[3]).toEqual({ pubkey: oracle, isSigner: false, isWritable: false });
    expect(() => buildVaultLpRefreshCrankIxP3({ programId: W, cranker: pk(), market, vaultLpPortfolio: lp, nowSlot: 1n,
      observations: [{ assetIndex: 0, oracleAccounts: 2 }], oracleAccounts: [oracle] })).toThrow();
  });
});

describe("package root exports", () => {
  it("tag-44 helpers and the P3 surface are exported from the package root", () => {
    const names = ["buildRebalanceReduceIx", "planReduceOnlyExit", "ACCOUNTS_REBALANCE_REDUCE", "planCloseSlabAttempt",
      "IX_TAG_P3", "encodeInitVaultLpP3", "encodeVaultLpReleaseSurplusP3", "decodeVaultLpStateP3", "decodeAssetVaultLpP3",
      "withBoundVaultLpTailP3", "buildVaultLpRefreshCrankIxP3", "deriveVaultLpStateP3"];
    const r = root as Record<string, unknown>;
    for (const n of names) expect(typeof r[n], n).not.toBe("undefined");
  });
});
