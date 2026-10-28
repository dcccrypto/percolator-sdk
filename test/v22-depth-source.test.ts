/**
 * v2.2 growth round 2 (R2.1 item 4): tag 123 SetDepthSource, the DepthSourceV22 record (kind 16), PushAuthMark mode 2 and the depth math.
 * Vectors are lifted from percolator-prog `feat/v22-growth-dex-depth` @ e2c93138: `depth_src_v22.rs` (`keeper_vectors`,
 * `valuation_chillhouse_lot_exp_4`, `mode_decode_table`) and `tests/v22_dex_depth.rs` (`c_tag123_wire`, `a_valuation_real_numbers`).
 */
import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  ACCOUNT_KIND, LAYOUT_V22, WRAPPER_ACCOUNT_MAGIC, UnknownLayoutError,
  deriveDepthSourceV22, derivePoolClaimV22, encodeSetDepthSourceV22, encodeClearDepthSourceV22, buildSetDepthSourceIxV22, buildClearDepthSourceIxV22, buildPushAuthMarkDexIxV22,
  decodeDepthSourceV22, DEPTH_AMM_PROGRAMS_V22, DEPTH_SOURCE_ACCOUNT_LEN_V22, plus2PctDepthE6, isqrtU128, reserveValueE6, encodePushAuthMark, IX_TAG_V22,
  decodeError,
} from "../src/index.js";

const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
const program = new PublicKey(new Uint8Array(32).fill(7));
const k = (n: number): PublicKey => new PublicKey(new Uint8Array(32).fill(n));

describe("tag 123 SetDepthSource wire", () => {
  it("[123][op][asset u16][market_id u64] (Rust c_tag123_wire)", () => {
    expect(Array.from(encodeSetDepthSourceV22(1, 3, 0x0102030405060708n))).toEqual([123, 1, 3, 0, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(IX_TAG_V22.SetDepthSource).toBe(123);
    expect(Array.from(encodeClearDepthSourceV22())).toEqual([123, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(() => encodeSetDepthSourceV22(2 as 0, 0, 0n)).toThrow();
    expect(() => encodeSetDepthSourceV22(1, 70_000, 0n)).toThrow();
  });
  it("PDA is [\"depth_src\", market] under the wrapper", () => {
    const market = k(9);
    const [pda, bump] = deriveDepthSourceV22(program, market);
    const [want, wb] = PublicKey.findProgramAddressSync([Buffer.from("depth_src"), market.toBuffer()], program);
    expect([pda.toBase58(), bump]).toEqual([want.toBase58(), wb]);
  });
  it("set: 11 accounts in the Rust order (prog#606 pool claim at [10]), UA signer + writable, market writable (F-3), PDA writable; clear: 5 (+[5] claim)", () => {
    const [market, pool, bv, qv, bm, qm, ua] = [k(1), k(2), k(3), k(4), k(5), k(6), k(7)];
    const ix = buildSetDepthSourceIxV22({ programId: program, upgradeAuthority: ua, market, assetIndex: 3, marketId: 5n, pool, baseVault: bv, quoteVault: qv, baseMint: bm, quoteMint: qm });
    expect(ix.keys).toHaveLength(11);
    const claim = (p: PublicKey): PublicKey => PublicKey.findProgramAddressSync([Buffer.from("pool_claim"), p.toBuffer()], program)[0];
    expect(derivePoolClaimV22(program, pool)[0].equals(claim(pool))).toBe(true);
    expect(ix.keys.map((x) => x.pubkey.toBase58()).slice(2)).toEqual([market, deriveDepthSourceV22(program, market)[0], PublicKey.default, pool, bv, qv, bm, qm, claim(pool)].map((x) => x.toBase58()));
    expect(ix.keys.map((x) => [x.isSigner, x.isWritable])).toEqual([[true, true], [false, false], [false, true], [false, true], [false, false], [false, false], [false, false], [false, false], [false, false], [false, false], [false, true]]);
    // the pin moves to another pool: the old pool's claim at [11]; same pool: no [11]
    const old = k(9);
    const mv = buildSetDepthSourceIxV22({ programId: program, upgradeAuthority: ua, market, assetIndex: 3, marketId: 5n, pool, baseVault: bv, quoteVault: qv, baseMint: bm, quoteMint: qm, previousPool: old });
    expect(mv.keys).toHaveLength(12);
    expect(mv.keys[11]!.pubkey.equals(claim(old)) && mv.keys[11]!.isWritable).toBe(true);
    expect(buildSetDepthSourceIxV22({ programId: program, upgradeAuthority: ua, market, assetIndex: 3, marketId: 5n, pool, baseVault: bv, quoteVault: qv, baseMint: bm, quoteMint: qm, previousPool: pool }).keys).toHaveLength(11);
    const cc = buildClearDepthSourceIxV22(program, ua, market, 0, 0n, pool);
    expect(cc.keys).toHaveLength(6);
    expect(cc.keys[5]!.pubkey.equals(claim(pool)) && cc.keys[5]!.isWritable).toBe(true);
    expect(ix.keys[1]!.pubkey.equals(PublicKey.findProgramAddressSync([program.toBytes()], new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"))[0])).toBe(true);
    expect(hex(ix.data)).toBe("7b" + "01" + "0300" + "0500000000000000");
    const c = buildClearDepthSourceIxV22(program, ua, market);
    expect(c.keys).toHaveLength(5);
    expect(c.data[1]).toBe(0);
  });
});

describe("PushAuthMark mode 2", () => {
  it("44 B with depth_mode 2 and depth 0; 6 accounts [authority s, market w, depth_src, pool, base_vault, quote_vault]", () => {
    const [market, pool, bv, qv, auth] = [k(1), k(2), k(3), k(4), k(8)];
    const ix = buildPushAuthMarkDexIxV22({ programId: program, oracleAuthority: auth, market, push: { assetIndex: 0, marketId: 1n, nowSlot: 100n, markE6: 12_000_000n, observationSequence: 5n }, pool, baseVault: bv, quoteVault: qv });
    expect(ix.data).toHaveLength(44);
    expect(ix.data[0]).toBe(63);
    expect(ix.data[35]).toBe(2);
    expect(Array.from(ix.data.subarray(36))).toEqual(new Array(8).fill(0));
    expect(ix.keys.map((x) => [x.pubkey.toBase58(), x.isSigner, x.isWritable])).toEqual([
      [auth.toBase58(), true, false], [market.toBase58(), false, true], [deriveDepthSourceV22(program, market)[0].toBase58(), false, false],
      [pool.toBase58(), false, false], [bv.toBase58(), false, false], [qv.toBase58(), false, false],
    ]);
  });
  it("a wire depth on mode 2 is refused client-side (chain: 128)", () => {
    expect(() => encodePushAuthMark({ assetIndex: 0, marketId: 1n, nowSlot: 1n, markE6: 1n, observationSequence: 1n, depth: { mode: 2, depthE6: 1n } })).toThrow(/mode 2/);
  });
});

function record(over: (b: Uint8Array) => void = () => undefined): Uint8Array {
  const data = new Uint8Array(DEPTH_SOURCE_ACCOUNT_LEN_V22);
  const v = new DataView(data.buffer);
  v.setBigUint64(0, WRAPPER_ACCOUNT_MAGIC, true);
  v.setUint16(8, LAYOUT_V22.version, true);
  data[10] = ACCOUNT_KIND.DepthSource;
  const b = data.subarray(16);
  b.set(k(1).toBytes(), 0); b.set(DEPTH_AMM_PROGRAMS_V22.pumpSwap.toBytes(), 32);
  b.set(k(2).toBytes(), 64); b.set(k(3).toBytes(), 96); b.set(k(4).toBytes(), 128); b.set(k(5).toBytes(), 160); b.set(k(6).toBytes(), 192);
  new DataView(b.buffer, b.byteOffset).setBigUint64(224, 7n, true);
  new DataView(b.buffer, b.byteOffset).setBigUint64(232, 999n, true);
  new DataView(b.buffer, b.byteOffset).setUint16(240, 3, true);
  b[242] = 6; b[243] = 9; b[244] = 1; b[245] = 1; b[246] = 254; b[247] = 1;
  over(b);
  return data;
}

describe("DepthSourceV22 decoder (kind 16, 16 + 256)", () => {
  it("decodes every field at the Rust offset", () => {
    const d = decodeDepthSourceV22(record());
    expect(d.market.equals(k(1)) && d.ammProgram.equals(DEPTH_AMM_PROGRAMS_V22.pumpSwap) && d.pool.equals(k(2)) && d.baseVault.equals(k(3)) && d.quoteVault.equals(k(4)) && d.baseMint.equals(k(5)) && d.quoteMint.equals(k(6))).toBe(true);
    expect([d.marketId, d.setSlot, d.assetIndex, d.baseDecimals, d.quoteDecimals, d.active, d.baseIsSide1, d.version, d.bump, d.ammKind]).toEqual([7n, 999n, 3, 6, 9, true, false, 1, 254, 1]);
    expect(decodeDepthSourceV22(record((b) => { b[244] = 3; })).baseIsSide1).toBe(true);
    expect(ACCOUNT_KIND.DepthSource).toBe(16);
  });
  it("a cleared record is all-zero but market / version / bump", () => {
    const clear = (b: Uint8Array): void => { b.fill(0, 32, 248); b[245] = 1; };
    const d = decodeDepthSourceV22(record(clear));
    expect(d.active).toBe(false);
    expect(() => decodeDepthSourceV22(record((b) => { clear(b); b[242] = 6; }))).toThrow(UnknownLayoutError);
  });
  it("refuses what validate_depth_source refuses", () => {
    const bad: ((b: Uint8Array) => void)[] = [
      (b) => { b[245] = 2; }, (b) => { b.fill(0, 0, 32); }, (b) => { b[250] = 1; }, (b) => { b[244] = 5; },
      (b) => { b[247] = 2; }, (b) => { b.set(k(99).toBytes(), 32); }, (b) => { b.fill(0, 64, 96); }, (b) => { b.set(k(6).toBytes(), 160); },
      (b) => { b.set(k(4).toBytes(), 96); }, (b) => { b[242] = 19; },
    ];
    for (const f of bad) expect(() => decodeDepthSourceV22(record(f))).toThrow(UnknownLayoutError);
    expect(() => decodeDepthSourceV22(record().subarray(0, 200))).toThrow(UnknownLayoutError);
    const wrongKind = record(); wrongKind[10] = 15;
    expect(() => decodeDepthSourceV22(wrongKind)).toThrow(UnknownLayoutError);
  });
  it("Raydium (either mainnet or devnet program) is kind 2", () => {
    expect(decodeDepthSourceV22(record((b) => { b.set(DEPTH_AMM_PROGRAMS_V22.raydiumCpmm.toBytes(), 32); b[247] = 2; })).ammKind).toBe(2);
    expect(decodeDepthSourceV22(record((b) => { b.set(DEPTH_AMM_PROGRAMS_V22.raydiumCpmmDevnet.toBytes(), 32); b[247] = 2; })).ammKind).toBe(2);
  });
});

describe("depth math (Rust keeper_vectors, valuation_chillhouse_lot_exp_4, a_valuation_real_numbers)", () => {
  it("plus2PctDepthE6", () => {
    for (const [r, want] of [[1_000_000n * 1_000_000n, 9_852_457_023n], [25_000n * 1_000_000n, 246_311_425n], [123_456_789n, 1_216_352n], [0n, 0n], [1n, 0n], [100n, 0n], [102n, 1n], [(1n << 64n) - 1n, 181_745_753_206_511_237n]] as const) {
      expect(plus2PctDepthE6(r), `R=${r}`).toBe(want);
    }
    expect(plus2PctDepthE6(205_739_012_856n)).toBe(2_027_034_782n);
    expect(plus2PctDepthE6(1_377_211_761_778n)).toBe(13_568_919_694n);
    // tier 1 ($25k of +-2% depth) needs a ~$2.538M reserve
    expect(plus2PctDepthE6(2_538_000_000_000n) >= 25_000_000_000n && plus2PctDepthE6(2_537_000_000_000n) < 25_000_000_000n).toBe(true);
  });
  it("exact definition on a grid: smallest m with 51 m^2 >= 50 r^2", () => {
    for (let r = 0n; r < 3000n; r++) {
      const d = plus2PctDepthE6(r);
      const m = r - d;
      expect(51n * m * m >= 50n * r * r).toBe(true);
      if (m > 0n) expect(51n * (m - 1n) * (m - 1n) < 50n * r * r).toBe(true);
    }
  });
  it("isqrt exact", () => {
    for (let n = 0n; n < 2000n; n++) { const r = isqrtU128(n); expect(r * r <= n && (r + 1n) * (r + 1n) > n).toBe(true); }
    const mx = (1n << 128n) - 1n;
    const r = isqrtU128(mx);
    expect(r * r <= mx && (r + 1n) * (r + 1n) > mx).toBe(true);
  });
  it("reserve value", () => {
    expect(reserveValueE6("base-at-mark", 171_449_177_380_421n, 0n, 12_000_000n, 6, 4)).toBe(205_739_012_856n);
    expect(reserveValueE6("base-at-mark", 171_449_177_380_421n, 0n, 1_200n, 6, 0)).toBe(205_739_012_856n);
    expect(reserveValueE6("base-at-mark", 1n, 0n, 0n, 6, 4)).toBeNull();
    expect(reserveValueE6("base-at-mark", 1n, 0n, 1n, 19, 0)).toBeNull();
    expect(reserveValueE6("base-at-mark", 1n, 0n, 1n, 0, 16)).toBeNull();
    expect(reserveValueE6("base-at-mark", (1n << 64n) - 1n, 0n, (1n << 64n) - 1n, 0, 0)).toBe((1n << 64n) - 1n);
    expect(reserveValueE6("quote-is-collateral", 5n, 9n, 0n, 99, 99)).toBe(9n);
  });
});

describe("error 129", () => {
  it("DepthSourceInvalid decodes", () => { expect(decodeError(129)?.name).toBe("DepthSourceInvalid"); });
});
