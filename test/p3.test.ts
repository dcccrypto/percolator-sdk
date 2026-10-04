/**
 * P3 vault-owned LP parity. Fixture `test/fixtures/p3-parity.json` is emitted by the REAL
 * P3 crate (percolator-prog feat/p3-vault-owned-lp @ 5e4c15ff) via
 * scripts/p3-parity/sdk_p3_parity.rs: `Instruction::decode` of our encoder hex, rustc
 * `offset_of!`, `PercolatorError::X as u32`, `read_asset_vault_lp`, `init_vault_lp_state`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Keypair, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
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
  decodeAssetVaultLpDrawP3,
  ASSET_VAULT_LP_DRAW_LEN_P3,
  ASSET_VAULT_LP_DRAW_SLOT_OFF_P3,
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
  buildCreateVaultLpMatcherCtxIxP3,
  VAULT_LP_MATCHER_CTX_LEN_P3,
} from "../src/solana/p3-vault-lp.js";
import {
  CANONICAL_VAULT_LP_MATCHER_PROGRAM_DEVNET_P3,
  VAULT_LP_PIN_P3,
  VAULT_LP_DEFAULT_MAX_LEV_BPS_P3,
  ENGINE_MAX_POSITION_ABS_Q_P3,
  pinnedMatcherCapsP3,
  usdToQCappedP3,
} from "../src/abi/p3.js";
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
    assetVaultLpDrawSlotOff: number; assetVaultLpDrawLen: number; assetVaultLpDrawFieldOff: Record<string, number>;
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
    expect(FX.p3Sha).toBe("5e4c15ff66a4176cf9b0204ef35aef6df058f018");
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

describe("P3 errors 72-89 (and P1 66-71) by name from the final enum", () => {
  it("every ordinal matches PercolatorError::X as u32", () => {
    for (const [name, code] of Object.entries(FX.errors)) expect(PERCOLATOR_ERRORS[code]?.name, `code ${code}`).toBe(name);
    expect(Object.keys(FX.errors)).toHaveLength(24); // P3 name list in the parity oracle (90 is checked by wrapper-errors.test.ts)
    expect(PERCOLATOR_ERRORS[91]?.name).toBe("LpVaultTargetPotImpaired"); // NAV floor 7a3ac04c
    expect(PERCOLATOR_ERRORS[95]).toBeUndefined(); // 92-94 = growth-v19
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
    expect(ASSET_VAULT_LP_DRAW_SLOT_OFF_P3).toBe(FX.layout.assetVaultLpDrawSlotOff);
    expect(ASSET_VAULT_LP_DRAW_LEN_P3).toBe(FX.layout.assetVaultLpDrawLen);
    expect(FX.layout.assetVaultLpDrawFieldOff).toEqual({ pendingOutEvenAtoms: 0, pendingOutOddAtoms: 16, outstandingMirrorAtoms: 32, pendingMovedAtoms: 48 });
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
    expect([st.seniorDrawnAtoms, st.seniorDrawOutstandingAtoms]).toEqual([0n, 0n]);
    // d119eebd: [240..256) senior_drawn, [256..272) senior_draw_outstanding — valid non-zero data
    const drawn = Uint8Array.from(d); drawn[240] = 1; drawn[257] = 2;
    const sd = decodeVaultLpStateP3(drawn);
    expect([sd.seniorDrawnAtoms, sd.seniorDrawOutstandingAtoms]).toEqual([1n, 512n]);
    // only _padding [232..240) must stay zero
    const bad2 = Uint8Array.from(d); bad2[233] = 1;
    expect(() => decodeVaultLpStateP3(bad2)).toThrow(/invalid/);
  });
  it("decodeAssetVaultLpDrawP3 reads the 64-byte AssetVaultLpDrawV18 just before the vault-LP record", () => {
    const off0 = assetVaultLpAccountOffsetP3(0) - ASSET_VAULT_LP_DRAW_LEN_P3;
    expect(off0).toBe(2246 - 64);
    const d = new Uint8Array(assetVaultLpAccountOffsetP3(1) + 128);
    const w = (o: number, x: bigint) => { const v = new DataView(d.buffer); v.setBigUint64(o, x & 0xffffffffffffffffn, true); v.setBigUint64(o + 8, x >> 64n, true); };
    expect(decodeAssetVaultLpDrawP3(d, 0).hasPendingDraw).toBe(false);
    w(off0, 5n); w(off0 + 16, 7n); w(off0 + 32, 1n << 70n); w(off0 + 48, 12n);
    expect(decodeAssetVaultLpDrawP3(d, 0)).toEqual({ pendingOutEvenAtoms: 5n, pendingOutOddAtoms: 7n, outstandingMirrorAtoms: 1n << 70n, pendingMovedAtoms: 12n, hasPendingDraw: true });
    const onlyMirror = new Uint8Array(d.length); new DataView(onlyMirror.buffer).setBigUint64(off0 + 32, 3n, true);
    expect(decodeAssetVaultLpDrawP3(onlyMirror, 0).hasPendingDraw).toBe(false); // outstanding alone is not a pending draw
    expect(ASSET_VAULT_LP_DRAW_SLOT_OFF_P3 + ASSET_VAULT_LP_DRAW_LEN_P3).toBe(ASSET_VAULT_LP_SLOT_OFF_P3);
    expect(() => decodeAssetVaultLpDrawP3(new Uint8Array(100), 0)).toThrow(/too short/);
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
    ].map((a) => a.length)).toEqual([11, 8, 7, 11, 8, 3, 4, 12, 7]);
  });
  const market = pk(), lp = pk();
  const m = { programId: W, market, registryDomain: 1, lpPortfolio: lp };
  it("tag 94 (07a1d0eb): 11 accounts, marketauth only; [8] canonical matcher, [9] ctx (w), [10] delegate derived with the REGISTRY", () => {
    const auth = pk(), ctx = pk();
    const a = buildInitVaultLpIxP3(m, auth, 2_000, ctx);
    expect(a.keys).toHaveLength(11);
    expect(a.keys[0]).toEqual({ pubkey: auth, isSigner: true, isWritable: true });
    expect(a.keys[2].pubkey.equals(deriveLpVaultRegistry(W, market)[0])).toBe(true);
    expect(a.keys[3].pubkey.equals(deriveVaultLpStateP3(W, market)[0])).toBe(true);
    expect(a.keys[6].pubkey.equals(deriveLpBackingLedger(W, market, 1)[0])).toBe(true); // own = registry domain
    expect(a.keys[7].pubkey.equals(deriveLpBackingLedger(W, market, 0)[0])).toBe(true); // sibling = domain ^ 1
    const matcher = new PublicKey(CANONICAL_VAULT_LP_MATCHER_PROGRAM_DEVNET_P3);
    expect(a.keys[8]).toEqual({ pubkey: matcher, isSigner: false, isWritable: false });
    expect(a.keys[9]).toEqual({ pubkey: ctx, isSigner: false, isWritable: true });
    const [reg] = deriveLpVaultRegistry(W, market);
    expect(a.keys[10]).toEqual({ pubkey: deriveMatcherDelegate(W, market, lp, reg, matcher, ctx)[0], isSigner: false, isWritable: false });
    // path B stays gone: a stray extra argument adds nothing, the tail constant is not exported
    const loose = buildInitVaultLpIxP3 as unknown as (...args: unknown[]) => TransactionInstruction;
    expect(loose(m, auth, 2_000, ctx, matcher, pk()).keys).toHaveLength(11);
    expect((root as Record<string, unknown>).ACCOUNTS_INIT_VAULT_LP_PATH_B_TAIL_P3).toBeUndefined();
    expect(a.keys.some((k) => k.pubkey.equals(deriveProgramDataAddressP3(W)[0]))).toBe(false);
  });
  it("matcher ctx pre-create = SystemProgram.createAccount(320 B, owner = canonical matcher)", () => {
    const payer = pk(), ctx = pk();
    const ix = buildCreateVaultLpMatcherCtxIxP3(payer, ctx, 3_118_080);
    expect(ix.programId.equals(SystemProgram.programId)).toBe(true);
    expect(ix.keys[0]).toEqual({ pubkey: payer, isSigner: true, isWritable: true });
    expect(ix.keys[1]).toEqual({ pubkey: ctx, isSigner: true, isWritable: true });
    const d = new DataView(ix.data.buffer, ix.data.byteOffset);
    expect(d.getUint32(0, true)).toBe(0); // CreateAccount
    expect(d.getBigUint64(4, true)).toBe(3_118_080n);
    expect(d.getBigUint64(12, true)).toBe(320n);
    expect(new PublicKey(ix.data.subarray(20, 52)).toBase58()).toBe(CANONICAL_VAULT_LP_MATCHER_PROGRAM_DEVNET_P3);
    expect(VAULT_LP_MATCHER_CTX_LEN_P3).toBe(320);
  });
  it("auto-pin constants and caps match vault_lp_v18 (incl. its pinned_caps unit test)", () => {
    expect(VAULT_LP_PIN_P3).toEqual({ MATCHER_KIND: 1, TRADING_FEE_BPS: 10, BASE_SPREAD_BPS: 10, MAX_TOTAL_BPS: 100, IMPACT_K_BPS: 50,
      FEE_TO_INSURANCE_BPS: 0, SKEW_SPREAD_MULT_BPS: 1, TRADE_FEE_CAP_BPS: 10_000, LIQUIDITY_USD: 250_000n, MAX_FILL_USD: 5_000n, MAX_INVENTORY_USD: 25_000n });
    expect(VAULT_LP_DEFAULT_MAX_LEV_BPS_P3).toBe(10_000);
    expect(pinnedMatcherCapsP3(1_000_000n)).toEqual({ liquidityNotionalE6: 250_000_000_000n, maxFillAbs: 5_000_000_000n, maxInventoryAbs: 25_000_000_000n });
    expect(pinnedMatcherCapsP3(0n)).toBeNull();
    expect(pinnedMatcherCapsP3(1n)!.maxInventoryAbs).toBe(ENGINE_MAX_POSITION_ABS_Q_P3);
    expect(usdToQCappedP3(5_000n, (1n << 64n) - 1n)).toBeNull();
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
  it("withBoundVaultLpTailP3: 75 → [11] state(w), [12] lp(w); ledgers forced w; 77 → [13],[14]; 78 → [6] state(w); others refused", () => {
    const st = pk();
    const mk = (tag: number, n: number): TransactionInstruction => new TransactionInstruction({
      programId: W, keys: Array.from({ length: n }, () => ({ pubkey: pk(), isSigner: false, isWritable: false })), data: Buffer.from([tag]),
    });
    const d = withBoundVaultLpTailP3(mk(75, 11), st, lp);
    expect(d.keys).toHaveLength(13);
    expect(d.keys[11]).toEqual({ pubkey: st, isSigner: false, isWritable: true });
    expect(d.keys[12]).toEqual({ pubkey: lp, isSigner: false, isWritable: true });
    expect(d.keys[7].isWritable && d.keys[10].isWritable).toBe(true);
    expect(d.keys.filter((k, i) => i !== 7 && i !== 10 && i < 11).every((k) => !k.isWritable)).toBe(true);
    expect(withBoundVaultLpTailP3(mk(75, 11), st, lp, { lpReadOnly: true }).keys[12].isWritable).toBe(false);
    const e = withBoundVaultLpTailP3(mk(77, 13), st, lp);
    expect(e.keys).toHaveLength(15);
    expect(e.keys[14]).toEqual({ pubkey: lp, isSigner: false, isWritable: true });
    expect(e.keys[8].isWritable && e.keys[11].isWritable).toBe(true);
    const c = withBoundVaultLpTailP3(mk(78, 6), st, lp);
    expect(c.keys).toHaveLength(7);
    expect(c.keys[6].isWritable).toBe(true);
    expect(c.keys[3].isWritable && c.keys[4].isWritable).toBe(true);
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
