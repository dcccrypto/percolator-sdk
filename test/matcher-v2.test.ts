/**
 * Matcher v2 (P2) ABI — pinned byte-for-byte to `percolator-match`
 * feat/p2-matcher-v2 @ 4a0f696, `cargo run --bin sdk_parity_fixtures_v2`
 * (fixture inputs copied from src/bin/sdk_parity_fixtures_v2.rs).
 */
import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  encodeMatcherSetParams,
  defaultMatcherV2ConfigForKind2,
  encodeMatcherCallExt,
  decodeMatcherCallExt,
  encodeMatcherConfigureBackingFeeCap,
  encodeMatcherConfigureSetParams,
  buildMatcherConfigureBackingFeeCapIx,
  buildMatcherConfigureSetParamsIx,
  matcherConfigureOwnerProofAccounts,
  decodeMatcherRequestedFeeBps,
  isMatcherCtxV2,
  decodeMatcherV2Error,
  validateMatcherSetParams,
  zeroMatcherV2Config,
  MATCHER_RETURN_FLAG_REQUESTED_FEE_MASK,
  MATCHER_RETURN_KNOWN_FLAGS_V2,
  MATCHER_CALL_EXT_OFFSET,
  MATCHER_CALL_EXT_LEN,
  MATCHER_SET_PARAMS_LEN,
  MATCHER_CONFIGURE_HEADER_OWNER_PROOF_LEN,
  MATCHER_V2_BLOCK_ACCOUNT_OFFSET,
  type MatcherSetParams,
} from "../src/abi/matcher-v2.js";
import { MATCHER_RETURN_KNOWN_FLAGS } from "../src/abi/instructions.js";
import { deriveMatcherDelegate } from "../src/solana/pda.js";
import { PERCOLATOR_ERRORS } from "../src/abi/errors.js";
import { STAKE_ERRORS } from "../src/solana/stake.js";

const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

// ── P2 fixture values (sdk_parity_fixtures_v2 @ 4a0f696) ─────────────────────
const FX_SET_PARAMS_HEX =
  "020000000032000000c80000001027000000ca9a3b000000000000000000000000e8030000000000000000000000000000a00f00000000000000000000000000000000320001010a0050000a00e8036400e8030864190019006400320096000000a00f000000000000";
const FX_CALL_EXT_HEX = "011ff4011817161514131211080706050403020100000000";
const FX_V2_BLOCK_HEX =
  "01010a0050000a00e8036400e80308641900190064003200960000000000a00f00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

function fixtureSetParams(): MatcherSetParams {
  return {
    kind: 2, tradingFeeBps: 0, baseSpreadBps: 50, maxTotalBps: 200, impactKBps: 10_000,
    liquidityNotionalE6: 1_000_000_000n, maxFillAbs: 1_000n, maxInventoryAbs: 4_000n,
    feeToInsuranceBps: 0, skewSpreadMultBps: 50, enableV2: true,
    v2: defaultMatcherV2ConfigForKind2(10, 50, 200, 50, 4_000n),
  };
}

describe("matcher v2 — SetParams (tag 5 op 1)", () => {
  it("matches the P2 fixture set_params_example_hex byte-for-byte (105 B)", () => {
    const b = encodeMatcherSetParams(fixtureSetParams());
    expect(b.length).toBe(MATCHER_SET_PARAMS_LEN);
    expect(hex(b)).toBe(FX_SET_PARAMS_HEX);
  });
  it("defaultMatcherV2ConfigForKind2 == the fixture's V2Config Debug", () => {
    expect(defaultMatcherV2ConfigForKind2(10, 50, 200, 50, 4_000n)).toEqual({
      flags: 1, feeLoBps: 10, feeHiBps: 80, feeColdBps: 10, volAMilli: 1000, volBDen: 100, volAlphaBps: 1000,
      volWarmup: 8, volMoveCap10bps: 100, volRefSlots: 25, thinRebateMultBps: 25, skewCapBps: 100,
      rebateCapBps: 50, maxMarkAgeSlots: 150, observedStaleSlots: 0, skewRefInventory: 4_000n,
    });
  });
  it("the v2 block the fixture emits carries the same config at ctx+178", () => {
    // V2Block::fresh(cfg).encode(): block_version=1, then the config fields in SetParams order.
    const block = Buffer.from(FX_V2_BLOCK_HEX, "hex");
    const sp = Buffer.from(FX_SET_PARAMS_HEX, "hex");
    expect(block[0]).toBe(1);
    // config bytes: flags(1) + 26 bytes of u16/u8 fields == SetParams[70..97]
    expect(hex(block.subarray(1, 28))).toBe(hex(sp.subarray(70, 97)));
    expect(hex(block.subarray(30, 38))).toBe(hex(sp.subarray(97, 105))); // skew_ref_inventory @ ctx 208
  });
  it("rejects configs the matcher would reject (negative controls)", () => {
    const base = fixtureSetParams();
    expect(() => validateMatcherSetParams({ ...base, v2: { ...base.v2, thinRebateMultBps: 51 } })).toThrow(/round-trip/);
    expect(() => validateMatcherSetParams({ ...base, v2: { ...base.v2, feeHiBps: 151 } })).toThrow(/feeHiBps/);
    expect(() => validateMatcherSetParams({ ...base, enableV2: false })).toThrow(/kind 2 requires enableV2/);
    expect(() => validateMatcherSetParams({ ...base, kind: 1, v2: base.v2 })).toThrow(/pricing field/);
    expect(() => validateMatcherSetParams({ ...base, kind: 1, v2: { ...zeroMatcherV2Config(), maxMarkAgeSlots: 150, flags: 1 } })).not.toThrow();
    expect(() => validateMatcherSetParams({ ...base, v2: { ...base.v2, skewRefInventory: 0n } })).toThrow(/skewRefInventory/);
    expect(() => validateMatcherSetParams({ ...base, impactKBps: 100_001 })).toThrow(/impactKBps/);
  });
});

describe("matcher v2 — call extension (tag-0 bytes 43..67)", () => {
  const fx = { headroomQ: 0x0102_0304_0506_0708n, markSlot: 0x1112_1314_1516_1718n, acceptsFeeRequest: true, takerReducing: true, execBandBps: 500 };
  it("matches the P2 fixture example_hex and sits at offset 43, 24 bytes", () => {
    expect(MATCHER_CALL_EXT_OFFSET).toBe(43);
    expect(MATCHER_CALL_EXT_LEN).toBe(24);
    expect(hex(encodeMatcherCallExt(fx))).toBe(FX_CALL_EXT_HEX);
  });
  it("round-trips and accepts a full 67-byte call", () => {
    expect(decodeMatcherCallExt(Buffer.from(FX_CALL_EXT_HEX, "hex"))).toEqual(fx);
    const call = new Uint8Array(67);
    call.set(Buffer.from(FX_CALL_EXT_HEX, "hex"), 43);
    expect(decodeMatcherCallExt(call)).toEqual(fx);
    expect(decodeMatcherCallExt(new Uint8Array(24))).toBeNull(); // legacy
  });
  it("rejects what the matcher rejects", () => {
    const b = Buffer.from(FX_CALL_EXT_HEX, "hex");
    const bad = (mut: (x: Buffer) => void): Buffer => { const c = Buffer.from(b); mut(c); return c; };
    expect(() => decodeMatcherCallExt(bad((x) => { x[0] = 2; }))).toThrow(/version/);
    expect(() => decodeMatcherCallExt(bad((x) => { x[1] = 0x3f; }))).toThrow(/reserved bits/);
    expect(() => decodeMatcherCallExt(bad((x) => { x[1] = 0x0f; }))).toThrow(/EXEC_BAND/);
    expect(() => decodeMatcherCallExt(bad((x) => { x[20] = 1; }))).toThrow(/reserved bytes/);
    expect(() => decodeMatcherCallExt(bad((x) => { x.fill(0); x[5] = 1; }))).toThrow(/legacy/);
  });
});

describe("matcher v2 — tag 5 Configure (owner proof)", () => {
  const wrapper = new PublicKey("ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB");
  const matcher = new PublicKey("4seJWjv3R5qfXY8R5ntuPHWsoqcVvaxvfFSnU2AnGMhT");
  const market = Keypair.generate().publicKey;
  const lpPortfolio = Keypair.generate().publicKey;
  const lpOwner = Keypair.generate().publicKey;
  const matcherCtx = Keypair.generate().publicKey;

  it("SetBackingFeeCap wire = [5, 1, wrapper(32), market(32), lp_portfolio(32), bump, 0, cap u16 LE] (102 B)", () => {
    const d = encodeMatcherConfigureBackingFeeCap({ wrapperProgramId: wrapper, market, lpPortfolio, bump: 254 }, 10_000);
    expect(d.length).toBe(102);
    expect([d[0], d[1]]).toEqual([5, 1]);
    expect(hex(d.subarray(2, 34))).toBe(hex(wrapper.toBytes()));
    expect(hex(d.subarray(34, 66))).toBe(hex(market.toBytes()));
    expect(hex(d.subarray(66, 98))).toBe(hex(lpPortfolio.toBytes()));
    expect(d[98]).toBe(254);
    expect(d[99]).toBe(0);
    expect([d[100], d[101]]).toEqual([0x10, 0x27]);
    expect(MATCHER_CONFIGURE_HEADER_OWNER_PROOF_LEN).toBe(99);
    expect(() => encodeMatcherConfigureBackingFeeCap({ wrapperProgramId: wrapper, market, lpPortfolio, bump: 1 }, 10_001)).toThrow();
  });
  it("the ix derives the SAME bump as the wrapper's matcher-delegate PDA (ctx.lp_pda)", () => {
    const [, bump] = deriveMatcherDelegate(wrapper, market, lpPortfolio, lpOwner, matcher, matcherCtx);
    const ix = buildMatcherConfigureBackingFeeCapIx({ matcherProgramId: matcher, wrapperProgramId: wrapper, market, lpPortfolio, lpOwner, matcherCtx }, 500);
    expect(ix.programId.equals(matcher)).toBe(true);
    expect(ix.data[98]).toBe(bump);
    expect(ix.keys).toEqual(matcherConfigureOwnerProofAccounts(lpOwner, matcherCtx));
    expect(ix.keys[0]).toEqual({ pubkey: lpOwner, isSigner: true, isWritable: false });
    expect(ix.keys[1]).toEqual({ pubkey: matcherCtx, isSigner: false, isWritable: true });
  });
  it("SetParams ix = 99-byte header + op 1 + the 105-byte fixture payload", () => {
    const d = encodeMatcherConfigureSetParams({ wrapperProgramId: wrapper, market, lpPortfolio, bump: 7 }, fixtureSetParams());
    expect(d.length).toBe(205);
    expect(d[99]).toBe(1);
    expect(hex(d.subarray(100))).toBe(FX_SET_PARAMS_HEX);
    const ix = buildMatcherConfigureSetParamsIx({ matcherProgramId: matcher, wrapperProgramId: wrapper, market, lpPortfolio, lpOwner, matcherCtx }, fixtureSetParams());
    expect(ix.data.length).toBe(205);
  });
});

describe("matcher v2 — return bits 22..31, ctx marker, errors", () => {
  it("requested_fee_bps mask/shift match the fixture (4290772992, 22)", () => {
    expect(MATCHER_RETURN_FLAG_REQUESTED_FEE_MASK).toBe(4290772992);
    expect(decodeMatcherRequestedFeeBps(((1023 << 22) >>> 0) | 1)).toBe(1023);
    expect(decodeMatcherRequestedFeeBps(((37 << 22) >>> 0) | 0x2710 << 8 | 3)).toBe(37);
    expect(decodeMatcherRequestedFeeBps(1)).toBe(0);
    // the deployed-wrapper KNOWN_FLAGS must NOT include the fee bits; the v2 set must
    expect((MATCHER_RETURN_KNOWN_FLAGS & MATCHER_RETURN_FLAG_REQUESTED_FEE_MASK) >>> 0).toBe(0);
    expect((MATCHER_RETURN_KNOWN_FLAGS_V2 & MATCHER_RETURN_FLAG_REQUESTED_FEE_MASK) >>> 0).toBe(MATCHER_RETURN_FLAG_REQUESTED_FEE_MASK);
  });
  it("isMatcherCtxV2 reads the PERCMATC magic @64 and the marker @242", () => {
    const ctx = new Uint8Array(320);
    new DataView(ctx.buffer).setBigUint64(64, 0x504552434d415443n, true);
    expect(isMatcherCtxV2(ctx)).toBe(false);
    ctx.set(Buffer.from(FX_V2_BLOCK_HEX, "hex"), MATCHER_V2_BLOCK_ACCOUNT_OFFSET);
    expect(isMatcherCtxV2(ctx)).toBe(true);
    ctx[64] = 0;
    expect(isMatcherCtxV2(ctx)).toBe(false);
  });
  it("maps matcher errors 8002-8005", () => {
    expect(decodeMatcherV2Error(8002)?.name).toBe("ERR_STALE_MARK");
    expect(decodeMatcherV2Error(8003)?.name).toBe("ERR_MARK_SLOT_IN_FUTURE");
    expect(decodeMatcherV2Error(8004)?.name).toBe("ERR_ASSET_MISMATCH");
    expect(decodeMatcherV2Error(8005)?.name).toBe("ERR_OWNER_PROOF_MISMATCH");
    expect(decodeMatcherV2Error(8006)).toBeUndefined();
  });
  it("wrapper error map covers 62-71 (deployed 62-65, P1 66-71) and stake 29", () => {
    const want: Record<number, string> = {
      62: "CreatorFeeOverClaim", 63: "LpVaultBackingBucketNotEmpty", 64: "RentExemptRequired", 65: "AssetGenerationMismatch",
      66: "ExecPriceOutsideOracleBand", 67: "SameOwnerTrade", 68: "LpExposureCapExceeded", 69: "LpFloorHalt",
      70: "ProtocolSideOiCapExceeded", 71: "CloseSlabFeesOutstanding",
    };
    for (const [code, name] of Object.entries(want)) expect(PERCOLATOR_ERRORS[Number(code)]?.name).toBe(name);
    expect(PERCOLATOR_ERRORS[63]?.hint).toMatch(/tag 74/);
    expect(STAKE_ERRORS[29]).toMatch(/No real LP holders/);
  });
});
