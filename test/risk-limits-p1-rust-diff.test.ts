/**
 * Differential test: src/abi/risk-limits-p1.ts (tag 93 `SetAssetRiskLimits` + the `AssetRiskLimitsV17`
 * record) against the Rust in percolator-prog `origin/feat/v22-rc23-2026-10-22` @ bc657392, read with
 * `git grep` / `git show` only (no checkout, no cargo). Engine consts from percolator
 * `origin/feat/v22-engine-rc23-2026-10-22` @ 67a4c5b9.
 *
 * Every Rust rule this file uses is quoted below with its file:line. The helpers `rustDecode93`,
 * `rustEncode93`, `rustHandlerRefuses`, `rustRecordBytes` and `rustAssetRiskLimitsStart` are line-for-line
 * TS ports of those excerpts; the SDK must agree with them on bytes, accounts, caps and offsets.
 *
 * Rust excerpts (prog src/v16_program.rs @ bc657392):
 *
 *   :446  pub const ASSET_RISK_LIMITS_OFF: usize = PROTOCOL_FEE_AUTHORITY_EPOCH_OFF + PROTOCOL_FEE_AUTHORITY_EPOCH_LEN;
 *   :448  pub const ASSET_RISK_LIMITS_LEN: usize = 64;
 *   :449  const _: () = assert!(ASSET_RISK_LIMITS_OFF == 608);
 *   :463  pub const TAG_SET_ASSET_RISK_LIMITS: u8 = 93;
 *
 *   decode arm :10666
 *     asset_index: read_u16, exec_band_bps: read_u16, lp_exposure_k_bps: read_u32,
 *     lp_floor_atoms: read_u128, side_oi_cap_q: read_u128,
 *     matcher_ext_mode: if rest.is_empty() { 0 } else { read_u8 },
 *     max_requested_fee_bps: if rest.is_empty() { 0 } else { read_u16 },
 *     then: rest.len() == 6 + 2 + TIER_CONFIG_WIRE_LEN + 1 => SetAssetRiskLimitsV22Tiers,
 *           rest.len() == 6 || rest.len() == 8              => SetAssetRiskLimitsV19,
 *           else                                            => base SetAssetRiskLimits
 *   readers :12205.. all `from_le_bytes`, `InvalidInstructionData` when short.
 *
 *   encode arm :11749
 *     out.push(93); push_u16(asset_index); push_u16(exec_band_bps); push_u32(lp_exposure_k_bps);
 *     push_u128(lp_floor_atoms); push_u128(side_oi_cap_q);
 *     if matcher_ext_mode != 0 || max_requested_fee_bps != 0 { out.push(matcher_ext_mode); }
 *     if max_requested_fee_bps != 0 { push_u16(max_requested_fee_bps); }
 *
 *   handle_set_asset_risk_limits :24625
 *     upgrade_authority = account(accounts, 0); program_data_ai = account(accounts, 1); market_ai = account(accounts, 2);
 *     expect_signer(upgrade_authority); expect_writable(market_ai); expect_owner(market_ai, program_id);
 *     expect_key(program_data_ai, derive_program_data_address(program_id))   // :50403 find_program_address(&[program_id], bpf_loader_upgradeable)
 *     if exec_band_bps > MAX_EXEC_BAND_BPS || lp_exposure_k_bps > MAX_LP_EXPOSURE_K_BPS
 *        || side_oi_cap_q > percolator::MAX_OI_SIDE_Q || matcher_ext_mode > MATCHER_EXT_MODE_V1
 *        || max_requested_fee_bps > MAX_REQUESTED_FEE_BPS  => InvalidInstruction
 *     (no bound on lp_floor_atoms: any u128)
 *
 *   :13676  pub const MAX_EXEC_BAND_BPS: u16 = 10_000;
 *   :13678  pub const MAX_LP_EXPOSURE_K_BPS: u32 = 10_000_000;
 *   :13922  pub const MAX_REQUESTED_FEE_BPS: u16 = 1023;
 *   :3487   pub const MATCHER_EXT_MODE_V1: u8 = 1;
 *   engine src/lib.rs:31  pub const MAX_OI_SIDE_Q: u128 = 100_000_000_000_000;
 *
 *   #[repr(C)] struct AssetRiskLimitsV17 :3367 (size asserted == 64 at :3488)
 *     side_oi_cap_q: u128, lp_floor_atoms: u128, lp_exposure_k_bps: u32, exec_band_bps: u16,
 *     matcher_ext_mode: u8, _reserved0: u8, max_requested_fee_bps: u16,
 *     p2b_senior_floor_code: [u8; 2] (offset_of == 42), adl_max_episode_slots: u32 (== 44),
 *     adl_episode_since_slot: u64 (== 48), adl_episode_epoch_long: u32 (== 56), adl_episode_epoch_short: u32 (== 60)
 *
 *   asset_risk_limits_range :3557
 *     capacity = market_slot_capacity(data)?;           // :5192 (len - MARKET_GROUP_OFF - size_of header) / stride, must divide exactly
 *     if asset_index >= capacity => InvalidInstruction;
 *     start = dynamic_slot_offset(asset_index)? + ASSET_RISK_LIMITS_OFF;   // :5213 MARKET_GROUP_OFF + header + i * stride
 *   engine src/v16.rs:9474 dynamic_asset_slot_offset = size_of::<Self>() + asset_index * slot_len
 *
 * The VERSION 19 sizes (MARKET_GROUP_OFF, MARKET_GROUP_LEN, MARKET_ASSET_SLOT_LEN, ASSET_RISK_LIMITS_OFF) come from
 * test/fixtures/v22-parity.json `layout`, which scripts/v22-parity/sdk_v22_parity.rs prints from those very Rust
 * constants (`c::MARKET_GROUP_OFF, c::MARKET_GROUP_LEN, c::MARKET_ASSET_SLOT_LEN, ..., c::ASSET_RISK_LIMITS_OFF`).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  IX_TAG_P1,
  MAX_EXEC_BAND_BPS_P1,
  MAX_LP_EXPOSURE_K_BPS_P1,
  MAX_OI_SIDE_Q_P1,
  MATCHER_EXT_MODE_V1_P1,
  MAX_REQUESTED_FEE_BPS_P1,
  ACCOUNTS_SET_ASSET_RISK_LIMITS_P1,
  ASSET_RISK_LIMITS_FIELD_OFF_P1,
  ASSET_RISK_LIMITS_LEN_P1,
  ASSET_RISK_LIMITS_SLOT_OFF_P1,
  encodeSetAssetRiskLimitsP1,
  buildSetAssetRiskLimitsIxP1,
  assetRiskLimitsAccountOffsetP1,
  decodeAssetRiskLimitsRecordP1,
  decodeAssetRiskLimitsP1,
} from "../src/abi/risk-limits-p1.js";
import type { SetAssetRiskLimitsArgsP1 } from "../src/abi/risk-limits-p1.js";
import { LAYOUT_V21, LAYOUT_V22 } from "../src/abi/layout.js";
import type { LayoutTable } from "../src/abi/layout.js";
import { stampMarket } from "./helpers/stamp.js";

// ---------------------------------------------------------------------------------------------
// Rust values, quoted above.
// ---------------------------------------------------------------------------------------------
const RUST = Object.freeze({
  TAG_SET_ASSET_RISK_LIMITS: 93,
  MAX_EXEC_BAND_BPS: 10_000, // u16
  MAX_LP_EXPOSURE_K_BPS: 10_000_000, // u32
  MAX_OI_SIDE_Q: 100_000_000_000_000n, // engine u128
  MATCHER_EXT_MODE_V1: 1, // u8
  MAX_REQUESTED_FEE_BPS: 1023, // u16
  ASSET_RISK_LIMITS_OFF: 608,
  ASSET_RISK_LIMITS_LEN: 64,
  // 6 + 2 + growth_v19::TIER_CONFIG_WIRE_LEN (growth_v19.rs:1849 = 18) + 1 = 27 (decode arm :10684).
  V22_TRAILER_LEN: 6 + 2 + 18 + 1,
});
const U128_MAX = (1n << 128n) - 1n;

/** rustc field offsets of `AssetRiskLimitsV17` (struct :3367 + offset_of asserts :3402..3409). */
const RUST_RECORD_OFF = Object.freeze({
  side_oi_cap_q: 0, lp_floor_atoms: 16, lp_exposure_k_bps: 32, exec_band_bps: 36, matcher_ext_mode: 38,
  _reserved0: 39, max_requested_fee_bps: 40, p2b_senior_floor_code: 42, adl_max_episode_slots: 44,
  adl_episode_since_slot: 48, adl_episode_epoch_long: 56, adl_episode_epoch_short: 60,
});

interface Rust93 {
  variant: "SetAssetRiskLimits" | "SetAssetRiskLimitsV19" | "SetAssetRiskLimitsV22Tiers";
  asset_index: number; exec_band_bps: number; lp_exposure_k_bps: number;
  lp_floor_atoms: bigint; side_oi_cap_q: bigint; matcher_ext_mode: number; max_requested_fee_bps: number;
}

/** Port of the tag-93 decode arm (:10666) over the `read_*` helpers (:12205..). Throws like `InvalidInstructionData`. */
function rustDecode93(data: Uint8Array): Rust93 {
  let rest = data;
  const take = (n: number): DataView => {
    if (rest.length < n) throw new Error("InvalidInstructionData");
    const v = new DataView(rest.buffer, rest.byteOffset, n);
    rest = rest.subarray(n);
    return v;
  };
  const u8 = (): number => take(1).getUint8(0);
  const u16 = (): number => take(2).getUint16(0, true);
  const u32 = (): number => take(4).getUint32(0, true);
  const u128 = (): bigint => { const v = take(16); return (v.getBigUint64(8, true) << 64n) | v.getBigUint64(0, true); };
  if (u8() !== RUST.TAG_SET_ASSET_RISK_LIMITS) throw new Error("not tag 93");
  const base = {
    asset_index: u16(), exec_band_bps: u16(), lp_exposure_k_bps: u32(), lp_floor_atoms: u128(), side_oi_cap_q: u128(),
    matcher_ext_mode: rest.length === 0 ? 0 : u8(),
    max_requested_fee_bps: rest.length === 0 ? 0 : u16(),
  };
  const variant = rest.length === RUST.V22_TRAILER_LEN ? "SetAssetRiskLimitsV22Tiers"
    : rest.length === 6 || rest.length === 8 ? "SetAssetRiskLimitsV19" : "SetAssetRiskLimits";
  return { variant, ...base };
}

/** Port of the tag-93 encode arm (:11749). */
function rustEncode93(i: Omit<Rust93, "variant">): Uint8Array {
  const out: number[] = [RUST.TAG_SET_ASSET_RISK_LIMITS];
  const push = (v: bigint, n: number): void => { for (let k = 0; k < n; k++) out.push(Number((v >> BigInt(8 * k)) & 0xffn)); };
  push(BigInt(i.asset_index), 2); push(BigInt(i.exec_band_bps), 2); push(BigInt(i.lp_exposure_k_bps), 4);
  push(i.lp_floor_atoms, 16); push(i.side_oi_cap_q, 16);
  if (i.matcher_ext_mode !== 0 || i.max_requested_fee_bps !== 0) out.push(i.matcher_ext_mode);
  if (i.max_requested_fee_bps !== 0) push(BigInt(i.max_requested_fee_bps), 2);
  return Uint8Array.from(out);
}

/** Port of the handler's range check (:24647..24654). true = `InvalidInstruction`. */
function rustHandlerRefuses(l: Omit<Rust93, "variant" | "asset_index">): boolean {
  return l.exec_band_bps > RUST.MAX_EXEC_BAND_BPS || l.lp_exposure_k_bps > RUST.MAX_LP_EXPOSURE_K_BPS
    || l.side_oi_cap_q > RUST.MAX_OI_SIDE_Q || l.matcher_ext_mode > RUST.MATCHER_EXT_MODE_V1
    || l.max_requested_fee_bps > RUST.MAX_REQUESTED_FEE_BPS;
}

/** `bytemuck::bytes_of(&AssetRiskLimitsV17 { .. })` with the repr(C) offsets above. */
function rustRecordBytes(r: {
  side_oi_cap_q: bigint; lp_floor_atoms: bigint; lp_exposure_k_bps: number; exec_band_bps: number; matcher_ext_mode: number;
  max_requested_fee_bps: number; p2b_senior_floor_code: number; adl_max_episode_slots: number; adl_episode_since_slot: bigint;
  adl_episode_epoch_long: number; adl_episode_epoch_short: number;
}): Uint8Array {
  const b = new Uint8Array(RUST.ASSET_RISK_LIMITS_LEN);
  const v = new DataView(b.buffer);
  const O = RUST_RECORD_OFF;
  const u128 = (o: number, x: bigint): void => { v.setBigUint64(o, x & 0xffff_ffff_ffff_ffffn, true); v.setBigUint64(o + 8, x >> 64n, true); };
  u128(O.side_oi_cap_q, r.side_oi_cap_q); u128(O.lp_floor_atoms, r.lp_floor_atoms);
  v.setUint32(O.lp_exposure_k_bps, r.lp_exposure_k_bps, true); v.setUint16(O.exec_band_bps, r.exec_band_bps, true);
  v.setUint8(O.matcher_ext_mode, r.matcher_ext_mode); v.setUint8(O._reserved0, 0);
  v.setUint16(O.max_requested_fee_bps, r.max_requested_fee_bps, true);
  v.setUint16(O.p2b_senior_floor_code, r.p2b_senior_floor_code, true);
  v.setUint32(O.adl_max_episode_slots, r.adl_max_episode_slots, true);
  v.setBigUint64(O.adl_episode_since_slot, r.adl_episode_since_slot, true);
  v.setUint32(O.adl_episode_epoch_long, r.adl_episode_epoch_long, true);
  v.setUint32(O.adl_episode_epoch_short, r.adl_episode_epoch_short, true);
  return b;
}

/** Rust market geometry for one wrapper VERSION (MARKET_GROUP_OFF, size_of header, MARKET_ASSET_SLOT_LEN). */
interface RustGeom { marketGroupOff: number; marketGroupLen: number; slotLen: number }

/** Port of `asset_risk_limits_range` (:3557) + `market_slot_capacity` (:5192) + `dynamic_slot_offset` (:5213). */
function rustAssetRiskLimitsStart(g: RustGeom, dataLen: number, assetIndex: number): number {
  if (dataLen < g.marketGroupOff + g.marketGroupLen) throw new Error("InvalidAccountLen");
  const trailing = dataLen - g.marketGroupOff - g.marketGroupLen;
  if (trailing % g.slotLen !== 0) throw new Error("InvalidConfig");
  const capacity = trailing / g.slotLen;
  if (assetIndex >= capacity) throw new Error("InvalidInstruction");
  return g.marketGroupOff + g.marketGroupLen + assetIndex * g.slotLen + RUST.ASSET_RISK_LIMITS_OFF;
}

// VERSION 19 geometry printed by sdk_v22_parity.rs from the Rust consts (see header).
const FX = JSON.parse(readFileSync(new URL("./fixtures/v22-parity.json", import.meta.url), "utf8")) as {
  layout: { marketGroupOff: number; marketGroupLen: number; assetSlotStride: number; riskLimitsSlotOff: number; wrapperVersion: number };
};
const RUST_V19: RustGeom = { marketGroupOff: FX.layout.marketGroupOff, marketGroupLen: FX.layout.marketGroupLen, slotLen: FX.layout.assetSlotStride };
// VERSION 18 (v2.1, frozen): the constants the v2.1 decoders were pinned to (test/risk-limits-p1.test.ts: 592 + 758 + 2325·i).
const RUST_V18: RustGeom = { marketGroupOff: 592, marketGroupLen: 758, slotLen: 2325 };

const toRust = (a: SetAssetRiskLimitsArgsP1): Omit<Rust93, "variant"> => ({
  asset_index: a.assetIndex, exec_band_bps: a.execBandBps, lp_exposure_k_bps: a.lpExposureKBps,
  lp_floor_atoms: a.lpFloorAtoms, side_oi_cap_q: a.sideOiCapQ,
  matcher_ext_mode: a.matcherExtMode ?? 0, max_requested_fee_bps: a.maxRequestedFeeBps ?? 0,
});
const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
const base: SetAssetRiskLimitsArgsP1 = { assetIndex: 0, execBandBps: 0, lpExposureKBps: 0, lpFloorAtoms: 0n, sideOiCapQ: 0n };

// Boundary-heavy grid: every field at 0, a typical value and its cap; both tail fields in every combination.
const GRID: SetAssetRiskLimitsArgsP1[] = [];
for (const assetIndex of [0, 1, 0x1234, 0xffff])
  for (const execBandBps of [0, 300, RUST.MAX_EXEC_BAND_BPS])
    for (const lpExposureKBps of [0, 50_000, RUST.MAX_LP_EXPOSURE_K_BPS])
      for (const lpFloorAtoms of [0n, 250_000_000n, U128_MAX])
        for (const sideOiCapQ of [0n, 7_000_000_000n, RUST.MAX_OI_SIDE_Q])
          for (const [matcherExtMode, maxRequestedFeeBps] of [[undefined, undefined], [0, 0], [1, 0], [0, 40], [1, 40], [1, RUST.MAX_REQUESTED_FEE_BPS]] as const)
            GRID.push({ assetIndex, execBandBps, lpExposureKBps, lpFloorAtoms, sideOiCapQ, matcherExtMode, maxRequestedFeeBps });

describe("tag 93 wire bytes vs the Rust decode/encode arms", () => {
  it("tag = TAG_SET_ASSET_RISK_LIMITS (93)", () => {
    expect(IX_TAG_P1.SetAssetRiskLimits).toBe(RUST.TAG_SET_ASSET_RISK_LIMITS);
  });

  it("field-by-field byte ranges follow the Rust parse order (u16, u16, u32, u128, u128, [u8], [u16]), little-endian", () => {
    const a: SetAssetRiskLimitsArgsP1 = {
      assetIndex: 0x0102, execBandBps: 0x0304, lpExposureKBps: 0x0005_0607, lpFloorAtoms: 0x0f0e_0d0c_0b0a_0908n | (0x1716_1514_1312_1110n << 64n),
      sideOiCapQ: 0x5a_f3107a_4000n - 1n, matcherExtMode: 1, maxRequestedFeeBps: 0x03fe,
    };
    const d = encodeSetAssetRiskLimitsP1(a);
    const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
    const u128 = (o: number): bigint => (v.getBigUint64(o + 8, true) << 64n) | v.getBigUint64(o, true);
    expect(d.length).toBe(44);
    expect(d[0]).toBe(93); // tag
    expect(v.getUint16(1, true)).toBe(a.assetIndex); // asset_index [1,3)
    expect(v.getUint16(3, true)).toBe(a.execBandBps); // exec_band_bps [3,5)
    expect(v.getUint32(5, true)).toBe(a.lpExposureKBps); // lp_exposure_k_bps [5,9)
    expect(u128(9)).toBe(a.lpFloorAtoms); // lp_floor_atoms [9,25)
    expect(u128(25)).toBe(a.sideOiCapQ); // side_oi_cap_q [25,41)
    expect(d[41]).toBe(1); // matcher_ext_mode [41,42)
    expect(v.getUint16(42, true)).toBe(0x03fe); // max_requested_fee_bps [42,44)
    expect(hex(d.subarray(0, 9))).toBe("5d" + "0201" + "0403" + "07060500");
  });

  it(`SDK bytes == Rust encoder bytes and Rust decoder reads them back as the BASE variant (${GRID.length} grid cases)`, () => {
    // Plain comparisons in the loop and one expect at the end, so the case stays fast under coverage/load.
    const bad: string[] = [];
    let checked = 0;
    for (const a of GRID) {
      const sdk = encodeSetAssetRiskLimitsP1(a);
      const r = toRust(a);
      const back = rustDecode93(sdk);
      const fields = ["asset_index", "exec_band_bps", "lp_exposure_k_bps", "lp_floor_atoms", "side_oi_cap_q", "matcher_ext_mode", "max_requested_fee_bps"] as const;
      if (hex(sdk) !== hex(rustEncode93(r))) bad.push(`bytes ${JSON.stringify(a, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
      if (back.variant !== "SetAssetRiskLimits" || fields.some((f) => back[f] !== r[f])) bad.push(`decode ${hex(sdk)}`);
      if (rustHandlerRefuses(back)) bad.push(`handler refuses ${hex(sdk)}`); // every SDK-encodable value is accepted
      if (![41, 42, 44].includes(sdk.length)) bad.push(`len ${sdk.length}`);
      checked++;
    }
    expect(bad).toEqual([]);
    expect(checked).toBe(4 * 3 * 3 * 3 * 3 * 6);
  }, 20_000);

  it("tail lengths: 41 B (no tail), 42 B (ext only), 44 B (ext + fee); never 50/52/71 B (the V19 / V22 trailer forms)", () => {
    expect(encodeSetAssetRiskLimitsP1(base).length).toBe(41);
    expect(encodeSetAssetRiskLimitsP1({ ...base, matcherExtMode: 1 }).length).toBe(42);
    expect(encodeSetAssetRiskLimitsP1({ ...base, maxRequestedFeeBps: 1 }).length).toBe(44);
    // fee != 0 with ext 0 still writes the 0 ext byte first (Rust: `matcher_ext_mode != 0 || fee != 0`).
    expect(hex(encodeSetAssetRiskLimitsP1({ ...base, maxRequestedFeeBps: 1 }).subarray(41))).toBe("000100");
    // Port sanity: the trailer is measured AFTER ext + fee are read, so 44+6 / 44+8 route to V19 and 44+27 to
    // V22Tiers, while 47 B (41+6) is still the base form (ext + fee eat 3, 3 left over).
    const pad = (n: number): Uint8Array => { const b = new Uint8Array(n); b.set(encodeSetAssetRiskLimitsP1(base)); return b; };
    expect(rustDecode93(pad(47)).variant).toBe("SetAssetRiskLimits");
    expect(rustDecode93(pad(44 + 6)).variant).toBe("SetAssetRiskLimitsV19");
    expect(rustDecode93(pad(44 + 8)).variant).toBe("SetAssetRiskLimitsV19");
    expect(rustDecode93(pad(44 + 27)).variant).toBe("SetAssetRiskLimitsV22Tiers");
    expect(() => rustDecode93(encodeSetAssetRiskLimitsP1(base).subarray(0, 40))).toThrow("InvalidInstructionData");
  });
});

describe("tag 93 accounts vs handle_set_asset_risk_limits", () => {
  it("spec = [0 upgrade authority (signer), 1 ProgramData (readonly), 2 market (writable)]", () => {
    expect(ACCOUNTS_SET_ASSET_RISK_LIMITS_P1.map((s) => [s.name, s.signer, s.writable])).toEqual([
      ["upgradeAuthority", true, false], // account(accounts, 0) + expect_signer
      ["programData", false, false], // account(accounts, 1) + expect_key only
      ["market", false, true], // account(accounts, 2) + expect_writable + expect_owner
    ]);
  });

  it("built ix: index 1 is find_program_address([program_id], BPFLoaderUpgradeable) and market is the only writable", () => {
    for (const programId of [new PublicKey("ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB"), new PublicKey(new Uint8Array(32).fill(7))]) {
      const market = Keypair.generate().publicKey, ua = Keypair.generate().publicKey;
      const ix = buildSetAssetRiskLimitsIxP1(programId, market, ua, base);
      const [pd] = PublicKey.findProgramAddressSync([programId.toBuffer()], new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"));
      expect(ix.programId.equals(programId)).toBe(true);
      expect(ix.keys).toEqual([
        { pubkey: ua, isSigner: true, isWritable: false },
        { pubkey: pd, isSigner: false, isWritable: false },
        { pubkey: market, isSigner: false, isWritable: true },
      ]);
      expect(hex(ix.data)).toBe(hex(rustEncode93(toRust(base))));
    }
  }, 20_000); // PDA search + ed25519 key generation: give it room under coverage/load
});

describe("tag 93 caps vs the handler's bounds (accept cap, refuse cap+1)", () => {
  it("SDK consts equal the Rust consts", () => {
    expect(MAX_EXEC_BAND_BPS_P1).toBe(RUST.MAX_EXEC_BAND_BPS);
    expect(MAX_LP_EXPOSURE_K_BPS_P1).toBe(RUST.MAX_LP_EXPOSURE_K_BPS);
    expect(MAX_OI_SIDE_Q_P1).toBe(RUST.MAX_OI_SIDE_Q);
    expect(MATCHER_EXT_MODE_V1_P1).toBe(RUST.MATCHER_EXT_MODE_V1);
    expect(MAX_REQUESTED_FEE_BPS_P1).toBe(RUST.MAX_REQUESTED_FEE_BPS);
  });

  const CAPS: Array<[string, (v: number | bigint) => SetAssetRiskLimitsArgsP1, number | bigint, number | bigint]> = [
    ["exec_band_bps", (v) => ({ ...base, execBandBps: Number(v) }), RUST.MAX_EXEC_BAND_BPS, RUST.MAX_EXEC_BAND_BPS + 1],
    ["lp_exposure_k_bps", (v) => ({ ...base, lpExposureKBps: Number(v) }), RUST.MAX_LP_EXPOSURE_K_BPS, RUST.MAX_LP_EXPOSURE_K_BPS + 1],
    ["side_oi_cap_q", (v) => ({ ...base, sideOiCapQ: BigInt(v) }), RUST.MAX_OI_SIDE_Q, RUST.MAX_OI_SIDE_Q + 1n],
    ["matcher_ext_mode", (v) => ({ ...base, matcherExtMode: Number(v) }), RUST.MATCHER_EXT_MODE_V1, RUST.MATCHER_EXT_MODE_V1 + 1],
    ["max_requested_fee_bps", (v) => ({ ...base, maxRequestedFeeBps: Number(v) }), RUST.MAX_REQUESTED_FEE_BPS, RUST.MAX_REQUESTED_FEE_BPS + 1],
  ];
  for (const [field, mk, cap, over] of CAPS) {
    it(`${field}: cap ${cap} accepted by both, cap+1 ${over} refused by both`, () => {
      const ok = mk(cap);
      expect(rustHandlerRefuses(toRust(ok))).toBe(false);
      const d = encodeSetAssetRiskLimitsP1(ok);
      expect(rustDecode93(d)).toEqual({ variant: "SetAssetRiskLimits", ...toRust(ok) });
      const bad = mk(over);
      expect(rustHandlerRefuses(toRust(bad))).toBe(true);
      expect(() => encodeSetAssetRiskLimitsP1(bad)).toThrow(field === "side_oi_cap_q" ? /sideOiCapQ/ : /must be an integer in 0\.\./);
    });
  }

  it("lp_floor_atoms: Rust has no bound (any u128); SDK accepts u128::MAX and refuses only what is not a u128", () => {
    expect(rustHandlerRefuses(toRust({ ...base, lpFloorAtoms: U128_MAX }))).toBe(false);
    expect(rustDecode93(encodeSetAssetRiskLimitsP1({ ...base, lpFloorAtoms: U128_MAX })).lp_floor_atoms).toBe(U128_MAX);
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, lpFloorAtoms: U128_MAX + 1n })).toThrow(/u128/);
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, lpFloorAtoms: -1n })).toThrow(/u128/);
  });

  it("asset_index: wire is u16 (0..=65535); values the u16 reader cannot carry are refused", () => {
    expect(rustDecode93(encodeSetAssetRiskLimitsP1({ ...base, assetIndex: 0xffff })).asset_index).toBe(0xffff);
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, assetIndex: 0x10000 })).toThrow(/assetIndex/);
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, assetIndex: -1 })).toThrow(/assetIndex/);
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, sideOiCapQ: -1n })).toThrow(/sideOiCapQ/);
    expect(() => encodeSetAssetRiskLimitsP1({ ...base, execBandBps: 1.5 })).toThrow(/execBandBps/);
  });
});

describe("AssetRiskLimitsV17 record vs the Rust struct", () => {
  it("LEN 64, slot offset 608, P1 field offsets = rustc offsets", () => {
    expect(ASSET_RISK_LIMITS_LEN_P1).toBe(RUST.ASSET_RISK_LIMITS_LEN);
    expect(ASSET_RISK_LIMITS_SLOT_OFF_P1).toBe(RUST.ASSET_RISK_LIMITS_OFF);
    expect(FX.layout.riskLimitsSlotOff).toBe(RUST.ASSET_RISK_LIMITS_OFF);
    expect(LAYOUT_V21.wrapperSlot.riskLimits).toBe(RUST.ASSET_RISK_LIMITS_OFF);
    expect(LAYOUT_V22.wrapperSlot.riskLimits).toBe(RUST.ASSET_RISK_LIMITS_OFF);
    const F = ASSET_RISK_LIMITS_FIELD_OFF_P1, R = RUST_RECORD_OFF;
    expect([F.sideOiCapQ, F.lpFloorAtoms, F.lpExposureKBps, F.execBandBps, F.matcherExtMode, F.reserved0, F.maxRequestedFeeBps])
      .toEqual([R.side_oi_cap_q, R.lp_floor_atoms, R.lp_exposure_k_bps, R.exec_band_bps, R.matcher_ext_mode, R._reserved0, R.max_requested_fee_bps]);
    // The SDK's `reserved: 42` tail is Rust's p2b_senior_floor_code + ADL episode (42..64); the P1 decoder does not read it.
    expect(F.reserved).toBe(R.p2b_senior_floor_code);
  });

  it("decodes bytemuck bytes of the Rust struct; bytes 42..64 (senior floor + ADL episode) never leak into P1 fields", () => {
    for (const a of GRID.filter((_, i) => i % 7 === 0)) {
      const r = toRust(a);
      for (const tail of [
        { p2b_senior_floor_code: 0, adl_max_episode_slots: 0, adl_episode_since_slot: 0n, adl_episode_epoch_long: 0, adl_episode_epoch_short: 0 },
        { p2b_senior_floor_code: 0xffff, adl_max_episode_slots: 9_000, adl_episode_since_slot: 0xffff_ffff_ffff_ffffn, adl_episode_epoch_long: 0xffff_ffff, adl_episode_epoch_short: 0xdead_beef },
      ]) {
        const rec = rustRecordBytes({ ...r, ...tail });
        expect(decodeAssetRiskLimitsRecordP1(rec)).toEqual({
          sideOiCapQ: r.side_oi_cap_q, lpFloorAtoms: r.lp_floor_atoms, lpExposureKBps: r.lp_exposure_k_bps,
          execBandBps: r.exec_band_bps, matcherExtMode: r.matcher_ext_mode, maxRequestedFeeBps: r.max_requested_fee_bps,
        });
      }
    }
    expect(() => decodeAssetRiskLimitsRecordP1(new Uint8Array(63))).toThrow(/64 bytes/);
    expect(() => decodeAssetRiskLimitsRecordP1(new Uint8Array(65))).toThrow(/64 bytes/);
  });
});

describe("record account offset for asset 0..max vs asset_risk_limits_range", () => {
  const ROWS: Array<[string, LayoutTable, RustGeom, number]> = [
    ["VERSION 18 / LAYOUT_V21", LAYOUT_V21, RUST_V18, 18],
    ["VERSION 19 / LAYOUT_V22 (Rust-printed geometry)", LAYOUT_V22, RUST_V19, 19],
  ];
  for (const [name, layout, g, version] of ROWS) {
    it(`${name}: SDK geometry = Rust geometry`, () => {
      expect(layout.version).toBe(version);
      expect([layout.marketGroupOff, layout.marketGroupLen, layout.assetSlotStride]).toEqual([g.marketGroupOff, g.marketGroupLen, g.slotLen]);
      if (version === 19) expect(FX.layout.wrapperVersion).toBe(19);
    });

    it(`${name}: offset(i) == Rust start for i in 0..capacity, Rust and SDK both refuse i == capacity`, () => {
      for (const capacity of [1, 2, 5]) {
        const len = g.marketGroupOff + g.marketGroupLen + capacity * g.slotLen;
        const m = stampMarket(new Uint8Array(len), version);
        for (let i = 0; i < capacity; i++) {
          const start = rustAssetRiskLimitsStart(g, len, i);
          expect(assetRiskLimitsAccountOffsetP1(i, layout)).toBe(start);
          // write a distinct Rust record into asset i and read it back through the account decoder
          m.set(rustRecordBytes({
            side_oi_cap_q: BigInt(i + 1), lp_floor_atoms: BigInt(1000 + i), lp_exposure_k_bps: 10_000 + i, exec_band_bps: 100 + i,
            matcher_ext_mode: i % 2, max_requested_fee_bps: i, p2b_senior_floor_code: 7, adl_max_episode_slots: 1, adl_episode_since_slot: 2n,
            adl_episode_epoch_long: 3, adl_episode_epoch_short: 4,
          }), start);
        }
        for (let i = 0; i < capacity; i++) {
          expect(decodeAssetRiskLimitsP1(m, i)).toEqual({
            sideOiCapQ: BigInt(i + 1), lpFloorAtoms: BigInt(1000 + i), lpExposureKBps: 10_000 + i, execBandBps: 100 + i,
            matcherExtMode: i % 2, maxRequestedFeeBps: i,
          });
        }
        expect(() => rustAssetRiskLimitsStart(g, len, capacity)).toThrow("InvalidInstruction");
        expect(() => decodeAssetRiskLimitsP1(m, capacity)).toThrow(/too short for asset/);
      }
    });

    it(`${name}: pure offset math matches for every u16 asset index (Rust asset_index is u16)`, () => {
      for (let i = 0; i <= 0xffff; i++) {
        const sdk = assetRiskLimitsAccountOffsetP1(i, layout);
        if (sdk !== g.marketGroupOff + g.marketGroupLen + i * g.slotLen + RUST.ASSET_RISK_LIMITS_OFF) throw new Error(`asset ${i}: ${sdk}`);
      }
      const maxLen = g.marketGroupOff + g.marketGroupLen + 0x10000 * g.slotLen;
      expect(assetRiskLimitsAccountOffsetP1(0xffff, layout)).toBe(rustAssetRiskLimitsStart(g, maxLen, 0xffff));
    });
  }

  it("default layout of assetRiskLimitsAccountOffsetP1 is LAYOUT_V21 (asset 0 = 1958); decodeAssetRiskLimitsP1 picks the layout from VERSION", () => {
    expect(assetRiskLimitsAccountOffsetP1(0)).toBe(1958);
    expect(assetRiskLimitsAccountOffsetP1(0, LAYOUT_V22)).toBe(RUST_V19.marketGroupOff + RUST_V19.marketGroupLen + 608);
  });

  it("bad asset index is refused before any read", () => {
    for (const i of [-1, 1.5, Number.NaN]) expect(() => assetRiskLimitsAccountOffsetP1(i)).toThrow(/bad assetIndex/);
  });

  it("documented non-mismatch: a truncated buffer (not slot-aligned) still reads assets whose 64 B are present", () => {
    // Rust refuses a mis-sized ACCOUNT (market_slot_capacity: InvalidConfig), but the program never creates one;
    // the SDK decoder runs with strictLength:false so a truncated RPC read still decodes the bytes it has, at the
    // same offset Rust uses for that asset in the full account.
    const g = RUST_V19, full = g.marketGroupOff + g.marketGroupLen + 2 * g.slotLen;
    const cut = rustAssetRiskLimitsStart(g, full, 1) + 64;
    const m = stampMarket(new Uint8Array(cut), 19);
    m.set(rustRecordBytes({
      side_oi_cap_q: 9n, lp_floor_atoms: 0n, lp_exposure_k_bps: 0, exec_band_bps: 0, matcher_ext_mode: 0, max_requested_fee_bps: 0,
      p2b_senior_floor_code: 0, adl_max_episode_slots: 0, adl_episode_since_slot: 0n, adl_episode_epoch_long: 0, adl_episode_epoch_short: 0,
    }), cut - 64);
    expect(() => rustAssetRiskLimitsStart(g, cut, 1)).toThrow("InvalidConfig");
    expect(decodeAssetRiskLimitsP1(m, 1).sideOiCapQ).toBe(9n);
    expect(() => decodeAssetRiskLimitsP1(m.subarray(0, cut - 1), 1)).toThrow(/too short/);
  });
});
