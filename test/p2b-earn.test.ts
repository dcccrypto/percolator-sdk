/**
 * P2b Earn as counterparty (percolator-prog #526 @ d9e3e2d7): tag 103, the tag-99 dials trailer, the
 * VaultLpExtV19 record + decoder, the ext account tails, the Q2 senior floor, p2b_flags, the
 * entry-par vs exit-E3 pricing and the non-bound tag-77 redeemer signature.
 *
 * Fixture `test/fixtures/p2b-parity.json` is emitted by the REAL crate via
 * `scripts/p2b-parity/sdk_p2b_parity.rs` (`Instruction::decode` / `encode` of our encoder hex, rustc
 * `offset_of!`, `init_vault_lp_ext`, `vault_lp_v18::*`). Account lists are pinned against the handler
 * bodies of the same commit (cited in each test).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Keypair, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { P2B_VECTOR_INPUTS, P2B_MATCHER, encodeP2bVector } from "./p2b-vector-inputs.js";
import {
  ACCOUNTS_SET_VAULT_LP_RISK_V19_P2B, ACCOUNTS_VAULT_LP_ALLOCATE_P2B, ALLOC_ALPHA_DEFAULT_BPS_P2B, ALLOC_ALPHA_MAX_BPS_P2B,
  ALLOC_BUFFER_DEFAULT_BPS_P2B, ALLOC_BUFFER_MIN_BPS_P2B, ALLOC_MIN_JUNIOR_BPS_P2B, BOUND_SCALE_P2B, IX_TAG_P2B_EARN, KIND_VAULT_LP_EXT_P2B,
  LP_VAULT_REGISTRY_EXT_FLAG_OFF_P2B, P2B_SENIOR_FLOOR_RECORD_OFF, P2B_SENIOR_FLOOR_SLOT_OFF, U128_MAX_P2B, VAULT_LP_EXT_ACCOUNT_LEN_P2B,
  VAULT_LP_EXT_BODY_LEN_P2B, VAULT_LP_EXT_FIELD_OFF_P2B, VAULT_LP_EXT_TAIL_INDEX_P2B, VAULT_LP_EXT_VERSION_P2B,
  a4CapacityLockOkP2b, allocJuniorOkP2b, allocWrittenDownP2b, assertVaultLpDialsP2b, creatorFeeVestedP2b, cushionLockedP2b, cushionSplitP2b,
  decodeSeniorFloorRecordP2b, encodeSetVaultLpRiskV19P2b, encodeVaultLpAllocateP2b, entryVsExitP2b, insuranceCoverNumP2b,
  liveBoundPrincipalPortionP2b, lpAtomsForRedemptionP2b, lpSharesForDepositP2b, nonboundPotAvailableE3P2b, nonboundPotEntryAvailableP2b,
  nonboundVaultPricingP2b, potPhysicalNetAtomsP2b, seniorCapitalHaltP2b, seniorFloorDecodeP2b, seniorFloorEncodeP2b, vaultLpAllocAdmittedP2b,
  vaultLpAllocLimitP2b, vaultLpAllocSplitP2b, vaultLpDeallocP2b,
} from "../src/abi/p2b-earn.js";
import { decodeAdlEpisodeRecord } from "../src/abi/p2b-lock-exits.js";
import { decodeAssetRiskLimitsRecordP1 } from "../src/abi/risk-limits-p1.js";
import { decodeError } from "../src/abi/errors.js";
import {
  buildExecuteRedemptionIxNonBoundP2b, buildSetVaultLpRiskV19IxP2b, buildVaultLpAllocateIxP2b, decodeVaultLpExtV19, deriveVaultLpExtP2b,
  fetchVaultLpExtP2b, isLpVaultRegistryExtP2b, withCrankFeesBoundTailP2b,
} from "../src/solana/p2b-earn.js";
import {
  ASSET_VAULT_LP_P2B_FLAGS_OFF_P3, buildExecuteRedemptionIxP3, buildVaultLpRecallIxP3, buildWithdrawJuniorTrancheIxP3, decodeAssetVaultLpRecordP3,
  deriveProgramDataAddressP3, deriveVaultLpStateP3, planResolvedVaultLpExitP3, withBoundVaultLpTailP3,
} from "../src/solana/p3-vault-lp.js";
import type { VaultLpMarketP3 } from "../src/solana/p3-vault-lp.js";
import { deriveLpBackingLedger, deriveLpVaultRegistry } from "../src/solana/pda.js";
import { encodeLpVaultCrankFees } from "../src/abi/instructions.js";

type Row = Record<string, string | number | boolean | null | string[]>;
interface Fx {
  p2bSha: string;
  vectors: Record<string, { hex: string; rust: { ok: boolean; err?: string; decoded?: Record<string, unknown> | null }; rustReencodedHex: string }>;
  errors: Record<string, number>;
  layout: Record<string, number | string | Record<string, number>>;
  constants: Record<string, number | string>;
  pdas: { program: string; market: string; pda: string; bump: number }[];
  vaultLpExt: Record<string, { hex: string; programReadsSame: boolean }>;
  records: { riskLimitsHex: string; riskLimitsValidates: boolean; vaultLpHex: string };
  seniorFloorEncode: { v: string; code: number; decoded: string }[];
  seniorFloorDecode: { code: number; floor: string }[];
  [rule: string]: unknown;
}
const FX = JSON.parse(readFileSync(new URL("./fixtures/p2b-parity.json", import.meta.url), "utf8")) as Fx;
const rows = (name: string): Row[] => FX[name] as Row[];
const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
const unhex = (h: string): Uint8Array => new Uint8Array(Buffer.from(h, "hex"));
const B = (s: string | number | boolean | null | string[]): bigint => BigInt(s as string);
const k = (): PublicKey => Keypair.generate().publicKey;
const L = FX.layout as Record<string, number & string & Record<string, number>>;

describe("fixture provenance", () => {
  it("is from the pinned #526 head", () => {
    expect(FX.p2bSha).toBe("d9e3e2d72c8734ecc9d99905f3cebbb090b61154");
  });
});

describe("wire: every SDK encoder is decoded AND re-encoded byte-identically by the real crate", () => {
  for (const [id, input] of Object.entries(P2B_VECTOR_INPUTS)) {
    it(`${id}: SDK bytes == fixture, real decoder accepts, real encoder reproduces`, () => {
      const v = FX.vectors[id];
      expect(hex(encodeP2bVector(input))).toBe(v.hex);
      expect(v.rust.ok).toBe(true);
      expect(v.rustReencodedHex).toBe(v.hex);
    });
    it(`${id}: negative controls (short and long payloads are refused)`, () => {
      expect(FX.vectors[`${id}__short`].rust.ok).toBe(false);
      expect(FX.vectors[`${id}__long`].rust.ok).toBe(false);
    });
  }
  it("tag 103 decodes to VaultLpAllocate { amount } and is 17 bytes", () => {
    for (const id of ["allocate_max", "allocate_one", "allocate_mid"]) {
      const d = FX.vectors[id].rust.decoded as Record<string, string>;
      expect(d.variant).toBe("VaultLpAllocate");
      expect(d.tag).toBe(103);
      expect(B((P2B_VECTOR_INPUTS[id] as { amount: bigint }).amount)).toBe(BigInt(d.amount));
      expect(unhex(FX.vectors[id].hex).length).toBe(17);
    }
    expect(IX_TAG_P2B_EARN.VaultLpAllocate).toBe(103);
    expect(hex(encodeVaultLpAllocateP2b(1n))).toBe("67" + "01" + "00".repeat(15));
    expect(() => encodeVaultLpAllocateP2b(-1n)).toThrow();
    expect(() => encodeVaultLpAllocateP2b(U128_MAX_P2B + 1n)).toThrow();
  });
  it("tag 99 legacy (73 B) stays SetVaultLpRisk; the 81-byte dials form is SetVaultLpRiskV19 with all four dials in wire order", () => {
    expect(unhex(FX.vectors.setRiskLegacy.hex).length).toBe(73);
    expect((FX.vectors.setRiskLegacy.rust.decoded as Record<string, unknown>).variant).toBe("SetVaultLpRisk");
    const d = FX.vectors.setRiskV19_cushion.rust.decoded as Record<string, string>;
    expect(unhex(FX.vectors.setRiskV19_cushion.hex).length).toBe(81);
    expect(d.variant).toBe("SetVaultLpRiskV19");
    expect([d.allocAlphaBps, d.allocBufferBps, d.cushionTargetBps, d.cushionShareBps]).toEqual(["4321", "3500", "1000", "5000"]);
    // the legacy fields ride through unchanged in the dials form
    const legacy = FX.vectors.setRiskLegacy.rust.decoded as Record<string, string>;
    for (const f of ["assetIndex", "skewSlopeE9", "skewMaxE9", "levCapQ", "levMaxImrBps", "vaultLpMaxLevBps", "approvedMatcherProgramHex"]) expect(d[f]).toBe(legacy[f]);
    expect(hex(unhex(FX.vectors.setRiskV19_cushion.hex).subarray(0, 73))).toBe(FX.vectors.setRiskLegacy.hex);
  });
  it("a PARTIAL dials trailer is not a legacy tag 99: the program refuses 2 and 6 trailing bytes", () => {
    expect(FX.vectors.setRiskV19__trailer2.rust.ok).toBe(false);
    expect(FX.vectors.setRiskV19__trailer6.rust.ok).toBe(false);
  });
  it("dials are validated with the wrapper's own bounds before encoding", () => {
    const ok = { allocAlphaBps: 5_000, allocBufferBps: 3_000, cushionTargetBps: 0, cushionShareBps: 0 };
    expect(() => assertVaultLpDialsP2b(ok)).not.toThrow();
    expect(() => assertVaultLpDialsP2b({ ...ok, allocAlphaBps: 5_001 })).toThrow();
    expect(() => assertVaultLpDialsP2b({ ...ok, allocBufferBps: 2_999 })).toThrow();
    expect(() => assertVaultLpDialsP2b({ ...ok, allocBufferBps: 10_001 })).toThrow();
    expect(() => assertVaultLpDialsP2b({ ...ok, cushionTargetBps: 1_000 })).toThrow(/both zero or both non-zero/);
    expect(() => assertVaultLpDialsP2b({ ...ok, cushionShareBps: 1_000 })).toThrow(/both zero or both non-zero/);
    expect(() => assertVaultLpDialsP2b({ ...ok, cushionTargetBps: 10_001, cushionShareBps: 1 })).toThrow();
    expect(() => encodeSetVaultLpRiskV19P2b({ ...ok, allocAlphaBps: 5_001, assetIndex: 0, skewSlopeE9: 0n, skewMaxE9: 0n, levCapQ: 0n, levMaxImrBps: 0, vaultLpMaxLevBps: 0, approvedMatcherProgram: P2B_MATCHER })).toThrow();
  });
  it("tags 104 / 105 (#525) and the growth trailers 0 / 93 / 94 (#524) round-trip against the SAME wrapper head", () => {
    const a = FX.vectors.adlWindDown.rust.decoded as Record<string, string>;
    expect([a.nowSlot, a.assetIndex, a.portfolioId, a.positionEpoch]).toEqual(["507300000", "0", String(0x1122334455667788n), "9"]);
    expect((FX.vectors.setAdlMax_tight.rust.decoded as Record<string, string>).maxEpisodeSlots).toBe("300");
    const g = FX.vectors.setAssetRiskLimitsV19_8B.rust.decoded as Record<string, unknown>;
    expect(g).toMatchObject({ lambdaBps: "7500", kinkBps: "4000", utilFeeMaxBps: "800" });
    expect((g.limits as Record<string, string>).assetIndex).toBe("1");
    expect(unhex(FX.vectors.setAssetRiskLimitsV19_8B.hex).length).toBe(52);
    expect(unhex(FX.vectors.setAssetRiskLimitsV19_6B.hex).length).toBe(50);
    expect((FX.vectors.setAssetRiskLimitsV19_6B.rust.decoded as Record<string, string>).utilFeeMaxBps).toBe("0");
    expect(FX.vectors.initVaultLpV19.rust.decoded).toMatchObject({ juniorFloorBps: "2000", lLaunchX100: "550" });
    const m = FX.vectors.initMarketV19.rust.decoded as Record<string, unknown>;
    expect(m).toMatchObject({ rGapBps: "400", lLaunchX100: "550" });
    // the three InitMarket bytes the SDK's L-2 / MMR pre-check reads (offsets 59 / 91 / 131) are the program's fields
    const legacy = unhex(FX.vectors.initMarketLegacy.hex);
    const dv = new DataView(legacy.buffer, legacy.byteOffset, legacy.byteLength);
    const inner = m.market as Record<string, string>;
    expect(dv.getBigUint64(59, true)).toBe(BigInt(inner.maintenanceMarginBps));
    expect(dv.getBigUint64(91, true)).toBe(BigInt(inner.liquidationFeeBps));
    expect(dv.getBigUint64(131, true)).toBe(BigInt(inner.maxPriceMoveBpsPerSlot));
  });
});

describe("errors 100..103", () => {
  it("codes equal rustc and the SDK table names them", () => {
    for (const [name, code] of Object.entries(FX.errors)) expect(decodeError(code)?.name, name).toBe(name);
  });
  it("103 carries the required app copy verbatim", () => {
    expect(decodeError(103)?.hint?.startsWith("This side is paused while the market's first-loss capital is rebuilt; closing is always allowed")).toBe(true);
  });
});

describe("layout: SDK offsets equal rustc offset_of on the real structs", () => {
  it("VaultLpExtV19: 128 B body, kind 10, 144 B account, every field offset", () => {
    expect(L.vaultLpExtBodyLen).toBe(VAULT_LP_EXT_BODY_LEN_P2B);
    expect(L.vaultLpExtAccountLen).toBe(VAULT_LP_EXT_ACCOUNT_LEN_P2B);
    expect(L.kindVaultLpExt).toBe(KIND_VAULT_LP_EXT_P2B);
    expect(L.vaultLpExtVersion).toBe(VAULT_LP_EXT_VERSION_P2B);
    expect(L.vaultLpExtFieldOff).toEqual({ ...VAULT_LP_EXT_FIELD_OFF_P2B });
  });
  it("registry ext flag (account byte 161) and the seed", () => {
    expect(L.registryExtFlagAccountOff).toBe(LP_VAULT_REGISTRY_EXT_FLAG_OFF_P2B);
    expect(L.registryBoundFlagAccountOff).toBe(160);
    expect(L.vaultLpExtSeed).toBe("vault_lp_ext");
  });
  it("senior floor code at record bytes 42..44 (slot 650..652); ADL episode starts at 44 (slot 652)", () => {
    const rl = L.assetRiskLimitsFieldOff;
    expect(rl.p2bSeniorFloorCode).toBe(P2B_SENIOR_FLOOR_RECORD_OFF);
    expect(L.p2bSeniorFloorSlotOff).toBe(P2B_SENIOR_FLOOR_SLOT_OFF);
    expect(L.assetRiskLimitsOff + rl.p2bSeniorFloorCode).toBe(P2B_SENIOR_FLOOR_SLOT_OFF);
    expect(L.p2bSeniorFloorLen).toBe(2);
    expect(rl.adlMaxEpisodeSlots).toBe(44);
    expect(L.adlEpisodeSlotOff).toBe(652);
  });
  it("p2b_flags is at AssetVaultLpV18 record byte 91, bit 0 = creator fee vesting", () => {
    expect(L.p2bFlagsRecordOff).toBe(ASSET_VAULT_LP_P2B_FLAGS_OFF_P3);
    expect(L.p2bCreatorFeeVestingBit).toBe(1);
  });
  it("growth record offsets (re-verified against this head)", () => {
    expect(L.assetGrowthSlotOff).toBe(672);
    expect(L.assetGrowthLen).toBe(120);
    expect(L.assetGrowthFieldOff).toMatchObject({ version: 38, utilFeeMaxBps: 40, rGapBps: 28, lambdaBps: 16 });
  });
  it("constants", () => {
    const c = FX.constants;
    expect(c.allocAlphaDefaultBps).toBe(ALLOC_ALPHA_DEFAULT_BPS_P2B);
    expect(c.allocAlphaMaxBps).toBe(ALLOC_ALPHA_MAX_BPS_P2B);
    expect(c.allocBufferDefaultBps).toBe(ALLOC_BUFFER_DEFAULT_BPS_P2B);
    expect(c.allocBufferMinBps).toBe(ALLOC_BUFFER_MIN_BPS_P2B);
    expect(c.allocMinJuniorBps).toBe(ALLOC_MIN_JUNIOR_BPS_P2B);
    expect(B(c.boundScale)).toBe(BOUND_SCALE_P2B);
  });
});

describe("PDA and VaultLpExtV19 decoder", () => {
  it("deriveVaultLpExtP2b equals the program's derive_vault_lp_ext", () => {
    for (const p of FX.pdas) {
      const [pda, bump] = deriveVaultLpExtP2b(new PublicKey(p.program), new PublicKey(p.market));
      expect(pda.toBase58()).toBe(p.pda);
      expect(bump).toBe(p.bump);
    }
  });
  it("decodes the default ext the program itself wrote", () => {
    const x = decodeVaultLpExtV19(unhex(FX.vaultLpExt.default.hex));
    expect(FX.vaultLpExt.default.programReadsSame).toBe(true);
    expect(x.marketGroup.toBytes()).toEqual(new Uint8Array(32).fill(9));
    expect([x.allocAlphaBps, x.allocBufferBps, x.cushionTargetBps, x.cushionShareBps]).toEqual([5_000, 3_000, 0, 0]);
    expect([x.allocatedAtoms, x.cushionAccruedAtoms, x.allocatedTotalAtoms, x.deallocatedTotalAtoms]).toEqual([0n, 0n, 0n, 0n]);
    expect([x.version, x.bump]).toEqual([1, 253]);
  });
  it("decodes a fully-populated ext (u128 fields beyond u64 survive)", () => {
    const x = decodeVaultLpExtV19(unhex(FX.vaultLpExt.custom.hex));
    expect(x.allocatedAtoms).toBe(123_456_789_012_345_678_901n);
    expect(x.cushionAccruedAtoms).toBe(4_000_000_000_000_000_000n);
    expect(x.allocatedTotalAtoms).toBe(987_654_321_098_765_432_109n);
    expect(x.deallocatedTotalAtoms).toBe(11n);
    expect([x.allocAlphaBps, x.allocBufferBps, x.cushionTargetBps, x.cushionShareBps, x.bump]).toEqual([4_321, 3_500, 1_000, 5_000, 250]);
    expect(x.marketGroup.toBytes()).toEqual(new Uint8Array(32).fill(0xab));
  });
  it("rejects what the program rejects (alpha above the hard max), and bad header / kind / length", () => {
    expect(FX.vaultLpExt.badAlpha.programReadsSame).toBe(false); // the REAL read_vault_lp_ext refuses it
    expect(() => decodeVaultLpExtV19(unhex(FX.vaultLpExt.badAlpha.hex))).toThrow(/invalid record/);
    const good = unhex(FX.vaultLpExt.default.hex);
    expect(() => decodeVaultLpExtV19(good.subarray(0, 143))).toThrow(/need 144/);
    const kind = good.slice(); kind[10] = 9;
    expect(() => decodeVaultLpExtV19(kind)).toThrow(/kind 9/);
    const magic = good.slice(); magic[0] ^= 1;
    expect(() => decodeVaultLpExtV19(magic)).toThrow(/magic/);
    const ver = good.slice(); ver[8] = 17;
    expect(() => decodeVaultLpExtV19(ver)).toThrow(/version/);
    const pad = good.slice(); pad[16 + 106] = 1;
    expect(() => decodeVaultLpExtV19(pad)).toThrow(/invalid record/);
    const half = good.slice(); half.set([0xe8, 0x03], 16 + 100); // target set, share 0
    expect(() => decodeVaultLpExtV19(half)).toThrow(/invalid record/);
    const buf = good.slice(); buf.set([0xb7, 0x0b], 16 + 98); // buffer 2999
    expect(() => decodeVaultLpExtV19(buf)).toThrow(/invalid record/);
  });
  it("fetchVaultLpExtP2b returns null when the account does not exist and decodes when it does", async () => {
    const P = k(); const M = k();
    const want = deriveVaultLpExtP2b(P, M)[0];
    let asked: PublicKey | null = null;
    const none = { getAccountInfo: async (a: PublicKey) => { asked = a; return null; } };
    expect(await fetchVaultLpExtP2b(none, P, M)).toBeNull();
    expect(asked!.equals(want)).toBe(true);
    const some = { getAccountInfo: async () => ({ data: Buffer.from(unhex(FX.vaultLpExt.default.hex)) } as never) };
    expect((await fetchVaultLpExtP2b(some, P, M))?.allocAlphaBps).toBe(5_000);
  });
  it("registry ext flag: byte 161, 0|1 only", () => {
    const reg = new Uint8Array(176);
    expect(isLpVaultRegistryExtP2b(reg)).toBe(false);
    reg[161] = 1;
    expect(isLpVaultRegistryExtP2b(reg)).toBe(true);
    reg[160] = 1; reg[161] = 0; // the BOUND flag must not be read as the ext flag
    expect(isLpVaultRegistryExtP2b(reg)).toBe(false);
    reg[161] = 2;
    expect(() => isLpVaultRegistryExtP2b(reg)).toThrow();
    expect(() => isLpVaultRegistryExtP2b(new Uint8Array(100))).toThrow();
  });
});

describe("records the program lays out", () => {
  const rl = unhex(FX.records.riskLimitsHex);
  it("AssetRiskLimitsV17: senior floor at 42..44, episode at 44..64, P1 fields unchanged", () => {
    expect(FX.records.riskLimitsValidates).toBe(true);
    expect(decodeSeniorFloorRecordP2b(rl)).toEqual({ code: 0x1234, floorAtoms: seniorFloorDecodeP2b(0x1234) });
    expect(seniorFloorDecodeP2b(0x1234)).toBe(0x234n << 4n);
    const ep = decodeAdlEpisodeRecord(rl);
    expect([ep.maxEpisodeSlots, ep.sinceSlot, ep.epochKeyLong, ep.epochKeyShort]).toEqual([300, 507_300_123n, 0xdeadbeef, 0x0badf00d]);
    const p1 = decodeAssetRiskLimitsRecordP1(rl);
    expect([p1.sideOiCapQ, p1.lpFloorAtoms, p1.lpExposureKBps, p1.execBandBps, p1.matcherExtMode, p1.maxRequestedFeeBps]).toEqual([7_000_000_000n, 250_000_000n, 50_000, 300, 1, 100]);
  });
  it("AssetVaultLpV18 with p2b_flags = 1 decodes (the pre-P2b decoder rejected byte 91 != 0)", () => {
    const rec = unhex(FX.records.vaultLpHex);
    const r = decodeAssetVaultLpRecordP3(rec);
    expect(r.p2bFlags).toBe(1);
    expect(r.creatorFeeVesting).toBe(true);
    expect(r.bound).toBe(true);
    // negative controls: the program's validate rejects any other p2b_flags bit, and so must we
    const bad = rec.slice(); bad[91] = 3;
    expect(() => decodeAssetVaultLpRecordP3(bad)).toThrow(/invalid record/);
    const zero = rec.slice(); zero[91] = 0;
    expect(decodeAssetVaultLpRecordP3(zero).creatorFeeVesting).toBe(false);
  });
});

describe("Q2 senior floor code == the program's encode / decode", () => {
  it("encode (ceiling) and decode agree with the real functions on every probe, incl. saturation", () => {
    for (const r of FX.seniorFloorEncode) {
      const v = BigInt(r.v);
      expect(seniorFloorEncodeP2b(v), `encode ${r.v}`).toBe(r.code);
      expect(seniorFloorDecodeP2b(r.code), `decode ${r.v}`).toBe(BigInt(r.decoded));
      expect(BigInt(r.decoded) >= v || r.code === 0xffff).toBe(true); // ceiling (except the saturated code)
    }
    for (const r of FX.seniorFloorDecode) expect(seniorFloorDecodeP2b(r.code)).toBe(BigInt(r.floor));
  });
  it("decode is `(code & 1023) << (code >> 10)` and 0 means no floor", () => {
    expect(seniorFloorDecodeP2b(0)).toBe(0n);
    expect(seniorFloorDecodeP2b(0x0401)).toBe(1n << 1n);
    expect(seniorFloorDecodeP2b(0xffff)).toBe(1023n << 63n);
    expect(() => seniorFloorDecodeP2b(65_536)).toThrow();
  });
  it("halt rule: strictly below the floor", () => {
    expect(FX.seniorCapitalHalt && (FX.seniorCapitalHalt as Row[]).every((r) => seniorCapitalHaltP2b(B(r.equity as string), B(r.floor as string)) === r.halt)).toBe(true);
  });
});

describe("pure rules equal the program's vault_lp_v18 on every fixture row", () => {
  it("vault_lp_alloc_limit (incl. out-of-range dials -> null)", () => {
    const rs = rows("allocLimit");
    expect(rs.length).toBeGreaterThan(5);
    for (const r of rs) expect(vaultLpAllocLimitP2b(B(r.cEff), B(r.allocated), B(r.drawable), r.alpha as number, r.buffer as number), JSON.stringify(r)).toBe(r.limit === null ? null : B(r.limit));
  });
  it("vault_lp_alloc_admitted", () => {
    for (const r of rows("allocAdmitted")) expect(vaultLpAllocAdmittedP2b(B(r.outstanding), r.pending as boolean, B(r.v), B(r.cEff), B(r.lpEquity)), JSON.stringify(r)).toBe(r.admitted);
  });
  it("alloc_junior_ok / alloc_written_down / vault_lp_dealloc / a4 / live_bound_principal_portion", () => {
    for (const r of rows("allocJuniorOk")) expect(allocJuniorOkP2b(B(r.v), B(r.cEff)), JSON.stringify(r)).toBe(r.ok);
    for (const r of rows("allocWrittenDown")) expect(allocWrittenDownP2b(B(r.allocated), B(r.lpValue))).toBe(B(r.writtenDown));
    for (const r of rows("dealloc")) expect(vaultLpDeallocP2b(B(r.allocated), B(r.recalled))).toBe(B(r.after));
    for (const r of rows("a4")) expect(a4CapacityLockOkP2b(B(r.before), B(r.after), B(r.lpEffAbs))).toBe(r.ok);
    for (const r of rows("liveBoundPrincipal")) expect(liveBoundPrincipalPortionP2b(B(r.out), B(r.available))).toBe(B(r.principal));
  });
  it("vault_lp_alloc_split (proportional, floor on the smaller pot, null when over both pots)", () => {
    for (const r of rows("allocSplit")) {
      const got = vaultLpAllocSplitP2b(B(r.moved), B(r.dEven), B(r.dOdd));
      expect(got === null ? null : got.map(String), JSON.stringify(r)).toEqual(r.split);
    }
  });
  it("pot_physical_net_atoms and E3 / par per pot", () => {
    for (const r of rows("potPhysicalNet")) expect(potPhysicalNetAtomsP2b(B(r.fresh), B(r.valid), B(r.claims), B(r.insCover), B(r.scale)), JSON.stringify(r)).toBe(B(r.net));
    for (const r of rows("nonboundPot")) {
      expect(nonboundPotAvailableE3P2b(B(r.principal), B(r.physicalNet))).toBe(B(r.exit));
      expect(nonboundPotEntryAvailableP2b(B(r.principal))).toBe(B(r.entry));
      expect(B(r.entry) >= B(r.exit)).toBe(true); // H-1: entry (par) is never below exit (E3)
    }
  });
  it("G6 cushion: split, lock, creator-fee vesting", () => {
    for (const r of rows("cushionSplit")) expect(cushionSplitP2b(B(r.available), r.share as number, r.target as number, B(r.cEff), B(r.juniorLevel)).map(String), JSON.stringify(r)).toEqual(r.split);
    for (const r of rows("cushionLocked")) expect(cushionLockedP2b(B(r.accrued), B(r.cEff), r.target as number), JSON.stringify(r)).toBe(r.locked === null ? null : B(r.locked));
    for (const r of rows("creatorFeeVested")) expect(creatorFeeVestedP2b(B(r.juniorLevel), B(r.cEff), r.share as number, r.target as number), JSON.stringify(r)).toBe(r.vested);
  });
  it("insuranceCoverNum saturates", () => {
    expect(insuranceCoverNumP2b(180n, 0n, 0n)).toBe(180n);
    expect(insuranceCoverNumP2b(180n, 100n, 100n)).toBe(0n);
  });
});

describe("non-bound Earn pricing: entry at par, exit at E3", () => {
  const pot = (principal: bigint, physicalNet: bigint, earn = 0n, wd = 0n) => ({ totalPrincipalAtoms: principal, totalEarningsAtoms: earn, totalEarningsWithdrawnAtoms: wd, physicalNetAtoms: physicalNet });
  it("healthy vault: entry == exit, gap 0", () => {
    const p = nonboundVaultPricingP2b(pot(1_000n, 1_000n), pot(500n, 700n), 10_000);
    expect([p.entryNavAtoms, p.exitNavAtoms, p.parMinusE3Atoms, p.parMinusE3Bps]).toEqual([1_500n, 1_500n, 0n, 0]);
  });
  it("a pot owing a winner's claim: exit is E3 (net of the claim), entry stays par", () => {
    const net = potPhysicalNetAtomsP2b(1_000n * BOUND_SCALE_P2B + 180n * BOUND_SCALE_P2B, 0n, 180n * BOUND_SCALE_P2B, 0n);
    expect(net).toBe(1_000n);
    const net2 = potPhysicalNetAtomsP2b(820n * BOUND_SCALE_P2B, 0n, 0n, 0n);
    const p = nonboundVaultPricingP2b(pot(1_000n, net2), pot(0n, 0n), 10_000);
    expect(p.entryNavAtoms).toBe(1_000n);
    expect(p.exitNavAtoms).toBe(820n);
    expect(p.parMinusE3Atoms).toBe(180n);
    expect(p.parMinusE3Bps).toBe(1_800);
  });
  it("LP earnings term: floor((earnings - withdrawn) * fee_share / 10000) per pot, identical on both readings", () => {
    const p = nonboundVaultPricingP2b(pot(1_000n, 1_000n, 1_001n, 1n), pot(0n, 0n, 33n, 0n), 5_000);
    expect(p.entryNavAtoms).toBe(1_000n + 500n + 16n);
    expect(p.exitNavAtoms).toBe(p.entryNavAtoms);
    expect(() => nonboundVaultPricingP2b(pot(1n, 1n, 1n, 2n), pot(0n, 0n), 5_000)).toThrow(/Custom 25/);
    expect(() => nonboundVaultPricingP2b(pot(1n, 1n), pot(0n, 0n), 10_001)).toThrow();
  });
  it("property: entry >= exit for any physical state (H-1: no round trip gains)", () => {
    let s = 0x2545f491n;
    const next = (): bigint => { s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); return s >> 33n; };
    for (let i = 0; i < 500; i++) {
      const a = pot(next() % 10_000n, next() % 12_000n, next() % 500n, 0n);
      const b = pot(next() % 10_000n, next() % 12_000n, next() % 500n, 0n);
      const p = nonboundVaultPricingP2b(a, b, Number(next() % 10_001n));
      expect(p.parMinusE3Atoms >= 0n).toBe(true);
      expect(p.entryNavAtoms >= p.exitNavAtoms).toBe(true);
    }
  });
  it("entryVsExit: what the shares cost at entry vs what tag 77 would pay now", () => {
    const p = nonboundVaultPricingP2b(pot(10_000n, 9_000n), pot(0n, 0n), 10_000);
    const v = entryVsExitP2b(1_000n, 10_000n, p);
    expect(v.entryValueAtoms).toBe(1_000n);
    expect(v.exitValueAtoms).toBe(900n);
    expect(v.haircutAtoms).toBe(100n);
    expect(v.haircutBps).toBe(1_000);
    expect(() => entryVsExitP2b(11n, 10n, p)).toThrow();
  });
  it("share math = the engine's lp_shares_for_deposit / lp_atoms_for_redemption", () => {
    expect(lpSharesForDepositP2b(1_000n, 0n, 0n)).toBe(1_000n);
    expect(lpSharesForDepositP2b(1_000n, 10_000n, 0n)).toBeNull();
    expect(lpSharesForDepositP2b(1n, 10n, 1_000n)).toBeNull(); // would mint 0 shares
    expect(lpSharesForDepositP2b(1_000n, 10_000n, 10_000n)).toBe(1_000n);
    expect(lpAtomsForRedemptionP2b(1_000n, 10_000n, 9_999n)).toBe(999n);
    expect(lpAtomsForRedemptionP2b(1n, 0n, 1n)).toBeNull();
    expect(lpAtomsForRedemptionP2b(11n, 10n, 1n)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// Account lists (pinned against the handler bodies at d9e3e2d7; line numbers are v16_program.rs)
// ---------------------------------------------------------------------------------------------
const programId = k();
const market = k();
const lp = k();
const cranker = k();
const m: VaultLpMarketP3 = { programId, market, registryDomain: 2, lpPortfolio: lp };
const ledger = deriveLpBackingLedger(programId, market, 2)[0];
const sibling = deriveLpBackingLedger(programId, market, 3)[0];
const registry = deriveLpVaultRegistry(programId, market)[0];
const state = deriveVaultLpStateP3(programId, market)[0];
const ext = deriveVaultLpExtP2b(programId, market)[0];
const flags = (ix: TransactionInstruction): string[] => ix.keys.map((x) => `${x.isSigner ? "s" : "-"}${x.isWritable ? "w" : "-"}`);

describe("tag 103 accounts (handle_vault_lp_allocate, 32497..)", () => {
  it("9 accounts in handler order; cranker s,w; registry w (it raises the ext flag); ext w; system program ro", () => {
    const ix = buildVaultLpAllocateIxP2b(m, cranker);
    expect(ix.keys.map((x) => x.pubkey.toBase58())).toEqual([cranker, market, registry, state, lp, ledger, sibling, ext, SystemProgram.programId].map((x) => x.toBase58()));
    expect(flags(ix)).toEqual(["sw", "-w", "-w", "-w", "-w", "-w", "-w", "-w", "--"]);
    expect(ACCOUNTS_VAULT_LP_ALLOCATE_P2B.length).toBe(9);
    expect(hex(ix.data)).toBe("67" + "ff".repeat(16)); // default = u128::MAX: the program clamps
    expect(hex(buildVaultLpAllocateIxP2b(m, cranker, 5n).data)).toBe("67" + "05" + "00".repeat(15));
  });
  it("ledgers follow the registry domain (domain 3 flips own / sibling)", () => {
    const ix = buildVaultLpAllocateIxP2b({ ...m, registryDomain: 3 }, cranker);
    expect(ix.keys[5].pubkey.equals(sibling)).toBe(true);
    expect(ix.keys[6].pubkey.equals(ledger)).toBe(true);
  });
});

describe("tag 99 dials form accounts (handle_set_vault_lp_risk, 33325..)", () => {
  it("6 accounts; the upgrade authority pays the ext rent so it is WRITABLE here", () => {
    const ua = k();
    const ix = buildSetVaultLpRiskV19IxP2b(programId, market, ua, { ...(P2B_VECTOR_INPUTS.setRiskV19_cushion as never as { allocAlphaBps: number; allocBufferBps: number; cushionTargetBps: number; cushionShareBps: number }), assetIndex: 0, skewSlopeE9: 0n, skewMaxE9: 0n, levCapQ: 0n, levMaxImrBps: 0, vaultLpMaxLevBps: 0, approvedMatcherProgram: P2B_MATCHER });
    expect(ix.keys.map((x) => x.pubkey.toBase58())).toEqual([ua, deriveProgramDataAddressP3(programId)[0], market, registry, ext, SystemProgram.programId].map((x) => x.toBase58()));
    expect(flags(ix)).toEqual(["sw", "--", "-w", "-w", "-w", "--"]);
    expect(ACCOUNTS_SET_VAULT_LP_RISK_V19_P2B.length).toBe(6);
    expect(ix.data.length).toBe(81);
  });
});

describe("ext tails for 98 / 97 / bound 78 (load_vault_lp_ext_if_flagged call sites 31944 / 31780 / 28705)", () => {
  const dest = k(); const vault = k();
  it("tail indices are the handler's: 98 -> [8], 97 -> [11], 78 -> [7]", () => {
    expect(VAULT_LP_EXT_TAIL_INDEX_P2B).toEqual({ 97: 11, 98: 8, 78: 7 });
  });
  it("98 recall: 8 accounts without the ext, ext appended as [8] (w) when set", () => {
    const a = buildVaultLpRecallIxP3(m, cranker, 5n, 2);
    const b = buildVaultLpRecallIxP3({ ...m, vaultLpExt: ext }, cranker, 5n, 2);
    expect(a.keys.length).toBe(8);
    expect(b.keys.length).toBe(9);
    expect(b.keys[8].pubkey.equals(ext) && b.keys[8].isWritable && !b.keys[8].isSigner).toBe(true);
    expect(b.keys.slice(0, 8)).toEqual(a.keys);
  });
  it("97 junior withdraw: 11 accounts, ext appended as [11] (w)", () => {
    const a = buildWithdrawJuniorTrancheIxP3(m, cranker, dest, vault, 5n);
    const b = buildWithdrawJuniorTrancheIxP3({ ...m, vaultLpExt: ext }, cranker, dest, vault, 5n);
    expect(a.keys.length).toBe(11);
    expect(b.keys.length).toBe(12);
    expect(b.keys[11].pubkey.equals(ext) && b.keys[11].isWritable).toBe(true);
    expect(b.keys.slice(0, 11)).toEqual(a.keys);
  });
  const crank = (): TransactionInstruction => new TransactionInstruction({
    programId,
    data: Buffer.from(encodeLpVaultCrankFees({ domain: 2 })),
    keys: [
      { pubkey: cranker, isSigner: true, isWritable: true }, { pubkey: market, isSigner: false, isWritable: true }, { pubkey: registry, isSigner: false, isWritable: true },
      { pubkey: ledger, isSigner: false, isWritable: true }, { pubkey: sibling, isSigner: false, isWritable: true }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  });
  it("bound 78: [6] vault_lp_state; with the ext: [7] ext (w) and [8] vault LP (w) (without it a post-ext 78 fails closed)", () => {
    const noExt = withCrankFeesBoundTailP2b(crank(), m);
    expect(noExt.keys.length).toBe(7);
    expect(noExt.keys[6].pubkey.equals(state)).toBe(true);
    const withExt = withCrankFeesBoundTailP2b(crank(), { ...m, vaultLpExt: ext });
    expect(withExt.keys.length).toBe(9);
    expect(withExt.keys[6].pubkey.equals(state) && withExt.keys[7].pubkey.equals(ext) && withExt.keys[8].pubkey.equals(lp)).toBe(true);
    expect(flags(withExt).slice(6)).toEqual(["-w", "-w", "-w"]);
    // the generic tail helper agrees
    expect(withBoundVaultLpTailP3(crank(), state, lp, { vaultLpExt: ext }).keys).toEqual(withExt.keys);
    // 75 / 77 are NOT ext-governed: the option is ignored for them
    expect(withBoundVaultLpTailP3(new TransactionInstruction({ programId, data: Buffer.from([77, 2, 0]), keys: Array.from({ length: 13 }, () => ({ pubkey: k(), isSigner: false, isWritable: false })) }), state, lp, { vaultLpExt: ext }).keys.length).toBe(15);
  });
  it("the Resolved exit planner appends the ext tail to its 78 (the program requires [7] there too)", () => {
    const seniorIx = buildExecuteRedemptionIxNonBoundP2b(m, cranker, k(), k(), k(), 2, { redeemerSigns: false }); // unbound-form 13 accounts, as the planner expects
    const plan = planResolvedVaultLpExitP3({ market: { ...m, vaultLpExt: ext }, crankFeesIx: crank(), seniorRedemptionIxs: [seniorIx] });
    const c78 = plan.perSeniorTxs[0][0];
    expect(c78.keys.length).toBe(9);
    expect(c78.keys[7].pubkey.equals(ext)).toBe(true);
    const plan0 = planResolvedVaultLpExitP3({ market: m, crankFeesIx: crank(), seniorRedemptionIxs: [seniorIx] });
    expect(plan0.perSeniorTxs[0][0].keys.length).toBe(7);
  });
});

describe("tag 77: the redeemer signs a Live NON-bound exit (handle_execute_redemption, review H-1(b))", () => {
  const redeemer = k(); const ata = k(); const vault = k();
  it("non-bound builder: 13 accounts, [12] = redeemer, writable AND signer by default", () => {
    const ix = buildExecuteRedemptionIxNonBoundP2b(m, redeemer, redeemer, ata, vault, 2);
    expect(ix.keys.length).toBe(13);
    expect(ix.keys[12].pubkey.equals(redeemer)).toBe(true);
    expect(ix.keys[12].isSigner && ix.keys[12].isWritable).toBe(true);
    expect(ix.keys[0].isSigner).toBe(true);
    expect(ix.keys[8].pubkey.equals(ledger) && ix.keys[11].pubkey.equals(sibling) && ix.keys[10].pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(hex(ix.data)).toBe("4d0200");
  });
  it("a keeper-executed exit (cranker != redeemer) still lists the redeemer as a signer: the transaction needs BOTH signatures", () => {
    const ix = buildExecuteRedemptionIxNonBoundP2b(m, cranker, redeemer, ata, vault, 2);
    expect(ix.keys[0].pubkey.equals(cranker) && ix.keys[0].isSigner).toBe(true);
    expect(ix.keys[12].isSigner).toBe(true);
  });
  it("Resolved exits do not need the signature (opt out)", () => {
    expect(buildExecuteRedemptionIxNonBoundP2b(m, cranker, redeemer, ata, vault, 2, { redeemerSigns: false }).keys[12].isSigner).toBe(false);
  });
  it("bound builder keeps [12] unsigned unless asked (bound pricing needs no claim term)", () => {
    expect(buildExecuteRedemptionIxP3(m, cranker, redeemer, ata, vault, 2).keys[12].isSigner).toBe(false);
    expect(buildExecuteRedemptionIxP3(m, cranker, redeemer, ata, vault, 2, { redeemerSigns: true }).keys[12].isSigner).toBe(true);
  });
});
