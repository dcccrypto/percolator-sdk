/**
 * v2.2 DEATH F-3 (percolator-prog #564, `fix/v22-f1-f3-wrapper` @ 4db44b69): byte 44 bit 6 `DEPTH_DEX_PINNED`, the mode-1 push guard
 * (`depth_push_mode_allowed`), tag 123 with a WRITABLE market, error 129, and SEC-RC L-1 (`depth_tw_layout_ok`).
 *
 * The record fixture is LiteSVM output of the canonical .so (sha256 7bdadf4a...), not hand-built bytes: see the fixture's `provenance`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import {
  DEPTH_DEX_PINNED, DEPTH_EVER, DEPTH_PREV_REAL, DEPTH_MODE, DEPTH_SOURCE, DEPTH_SOURCE_MASK, DEPTH_TW_ABSENT, GROWTH_FLAG_R3_LAYOUT,
  depthDexPinned, depthPushModeAllowed, depthSourceByteOk, depthSourceOf, depthTwLayoutOk, isDexPinned, decodeAssetGrowthRecordV19,
  assetGrowthAccountOffsetV19, LAYOUT_V22, ASSET_GROWTH_DEPTH_FIELD_OFF, ACCOUNTS_SET_DEPTH_SOURCE_V22, buildSetDepthSourceIxV22, buildClearDepthSourceIxV22, decodeError,
} from "../src/index.js";

interface Rec { accountOffset: number; byte44: string; hex: string }
const FX = JSON.parse(readFileSync(new URL("./fixtures/v22-f3-dex-pin-records.json", import.meta.url), "utf8")) as {
  mode1OnPin: { customError: number; log: string };
  records: Record<"unpinned_after_mode1" | "pinned_after_tag123_op1" | "pinned_after_mode2" | "cleared_after_tag123_op0", Rec>;
};
const rec = (r: Rec): Uint8Array => new Uint8Array(Buffer.from(r.hex, "hex"));

describe("DEPTH_DEX_PINNED byte layout (wrapper growth_v19.rs @ 4db44b69)", () => {
  it("bit 6 of byte 44, disjoint from the source / PREV_REAL / EVER bits", () => {
    expect(DEPTH_DEX_PINNED).toBe(0x40);
    expect(ASSET_GROWTH_DEPTH_FIELD_OFF.depthSource).toBe(44);
    expect(DEPTH_DEX_PINNED & (DEPTH_SOURCE_MASK | DEPTH_PREV_REAL | DEPTH_EVER)).toBe(0);
  });
  it("the validator accepts bit 6 and still refuses bits 3-5 (exhaustive vs the Rust rule)", () => {
    for (let b = 0; b < 256; b++) {
      const rust = (b & ~(0x03 | 0x04 | 0x40 | 0x80) & 0xff) === 0 && (b & 0x03) <= 2;
      expect(depthSourceByteOk(b)).toBe(rust);
    }
    expect(depthSourceByteOk(0xc6)).toBe(true);
    for (const b of [0x08, 0x10, 0x20, 0x43]) expect(depthSourceByteOk(b)).toBe(false);
  });
  it("the pin bit is not a source", () => {
    expect(depthSourceOf(0xc6)).toBe(DEPTH_SOURCE.OnChainPool);
    expect(depthSourceOf(0x41)).toBe(DEPTH_SOURCE.Attested);
  });
});

describe("depthPushModeAllowed (port of depth_push_mode_allowed; Rust f3_depth_push_mode_allowed_table)", () => {
  it("every byte x {35 B, mode 0, 1, 2}: refused exactly for mode 1 on a pinned byte", () => {
    for (let b = 0; b < 256; b++) {
      const pinned = (b & 0x40) !== 0;
      expect(depthDexPinned(b)).toBe(pinned);
      expect(depthPushModeAllowed(b, null)).toBe(true);
      expect(depthPushModeAllowed(b, DEPTH_MODE.None)).toBe(true);
      expect(depthPushModeAllowed(b, DEPTH_MODE.OnChainDex)).toBe(true);
      expect(depthPushModeAllowed(b, DEPTH_MODE.Attested)).toBe(!pinned);
    }
  });
  it("NEGATIVE CONTROL: the pre-F-3 rule (no guard) disagrees on every pinned byte for mode 1", () => {
    const preF3 = (_b: number, _m: number | null): boolean => true;
    let diffs = 0;
    for (let b = 0; b < 256; b++) if (preF3(b, DEPTH_MODE.Attested) !== depthPushModeAllowed(b, DEPTH_MODE.Attested)) diffs++;
    expect(diffs).toBe(128);
  });
});

describe("LiteSVM-produced growth records (death2-build1.so)", () => {
  it("decodes the pin bit at each step of the F-3 sequence", () => {
    const steps = [
      ["unpinned_after_mode1", 0x01, false, DEPTH_SOURCE.Attested],
      ["pinned_after_tag123_op1", 0x41, true, DEPTH_SOURCE.Attested],
      ["pinned_after_mode2", 0xc6, true, DEPTH_SOURCE.OnChainPool],
      ["cleared_after_tag123_op0", 0x86, false, DEPTH_SOURCE.OnChainPool],
    ] as const;
    for (const [name, byte44, pinned, source] of steps) {
      const r = FX.records[name];
      const bytes = rec(r);
      expect(bytes).toHaveLength(120);
      expect(bytes[44]).toBe(byte44);
      expect(Number(r.byte44)).toBe(byte44);
      expect(depthSourceByteOk(bytes[44] as number)).toBe(true);
      const g = decodeAssetGrowthRecordV19(bytes);
      expect(g).not.toBeNull();
      expect(g!.depthDexPinned).toBe(pinned);
      expect(isDexPinned(g)).toBe(pinned);
      expect(g!.depthSource).toBe(source);
      expect(depthPushModeAllowed(bytes[44] as number, DEPTH_MODE.Attested)).toBe(!pinned);
    }
    const p = decodeAssetGrowthRecordV19(rec(FX.records.pinned_after_mode2))!;
    expect([p.depthEver, p.depthPrevReal]).toEqual([true, true]);
  });
  it("the wrapper refused mode 1 on the pinned record with Custom(129) DepthSourceInvalid", () => {
    expect(FX.mode1OnPin.customError).toBe(129);
    expect(FX.mode1OnPin.log).toBe("g8_depth_refused_attested_on_dex_pin");
    expect(decodeError(129)?.name).toBe("DepthSourceInvalid");
  });
  it("the LiteSVM record offset equals the SDK's v2.2 growth offset (assetGrowthAccountOffsetV19(0, LAYOUT_V22))", () => {
    for (const r of Object.values(FX.records)) expect(r.accountOffset).toBe(assetGrowthAccountOffsetV19(0, LAYOUT_V22));
  });
  it("NEGATIVE CONTROL: masking bit 6 out of the fixture turns the decoder and the guard back to 'unpinned'", () => {
    const bytes = rec(FX.records.pinned_after_mode2);
    bytes[44] = (bytes[44] as number) & ~DEPTH_DEX_PINNED;
    const g = decodeAssetGrowthRecordV19(bytes)!;
    expect(isDexPinned(g)).toBe(false);
    expect(depthPushModeAllowed(bytes[44] as number, DEPTH_MODE.Attested)).toBe(true);
  });
  it("growth off (null) is never pinned", () => {
    expect(isDexPinned(null)).toBe(false);
  });
});

describe("tag 123 account metas: market WRITABLE (expect_writable(market_ai), both ops)", () => {
  const program = new PublicKey(new Uint8Array(32).fill(7));
  const k = (n: number): PublicKey => new PublicKey(new Uint8Array(32).fill(n));
  it("ACCOUNTS_SET_DEPTH_SOURCE_V22 marks the market writable", () => {
    const m = ACCOUNTS_SET_DEPTH_SOURCE_V22.find((a) => a.name === "market");
    expect(m?.writable).toBe(true);
    expect(m?.signer).toBe(false);
    expect(ACCOUNTS_SET_DEPTH_SOURCE_V22.map((a) => a.name)).toEqual(["upgradeAuthority", "programData", "market", "depthSource", "systemProgram"]);
  });
  it("op 1 and op 0 builders both carry the market as writable at index 2", () => {
    const market = k(1);
    const set = buildSetDepthSourceIxV22({ programId: program, upgradeAuthority: k(7), market, assetIndex: 0, marketId: 1n, pool: k(2), baseVault: k(3), quoteVault: k(4), baseMint: k(5), quoteMint: k(6) });
    const clr = buildClearDepthSourceIxV22(program, k(7), market, 0, 0n, k(2));
    for (const ix of [set, clr]) {
      expect(ix.keys[2]!.pubkey.equals(market)).toBe(true);
      expect(ix.keys[2]!.isWritable).toBe(true);
      expect(ix.keys[2]!.isSigner).toBe(false);
    }
  });
});

describe("SEC-RC L-1: depthTwLayoutOk (port of depth_tw_layout_ok)", () => {
  it("a window needs flags bit 0; no window is always fine", () => {
    const w = { curTokens: 5, prevTokens: DEPTH_TW_ABSENT, bucketP1: 3 };
    const none = { curTokens: 0, prevTokens: 0, bucketP1: 0 };
    expect(depthTwLayoutOk(0, w)).toBe(false);
    expect(depthTwLayoutOk(GROWTH_FLAG_R3_LAYOUT, w)).toBe(true);
    expect(depthTwLayoutOk(0x03, w)).toBe(true);
    expect(depthTwLayoutOk(0, none)).toBe(true);
  });
  it("every LiteSVM record satisfies it", () => {
    for (const r of Object.values(FX.records)) {
      const g = decodeAssetGrowthRecordV19(rec(r))!;
      expect(depthTwLayoutOk(g.flags, g.depthTw)).toBe(true);
    }
  });
});

describe("error 129", () => {
  it("is DepthSourceInvalid (wrapper PercolatorError::DepthSourceInvalid = 129)", () => {
    expect(decodeError(129)?.name).toBe("DepthSourceInvalid");
    expect(decodeError(129)?.hint.length).toBeGreaterThan(20);
  });
});
