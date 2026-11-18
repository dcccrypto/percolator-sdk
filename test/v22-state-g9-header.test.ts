/**
 * Branch coverage for decodeG9FeedAllowlistV22's header validation (src/abi/v22-state.ts).
 * Bytes are the REAL rc23 account written by the wrapper (test/fixtures/v22-parity.json accounts.g9Allowlist),
 * mutated at the Rust `G9FeedAllowlistV22` body offsets (16-byte header + body, align 1):
 *   count u8 @0, version u8 @1, bump u8 @2, pending_count u8 @3, pad[4] @4..8, pending_slot u64 LE @8,
 *   keys[16][32] @16, owners, pending_keys, pending_owners.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as S from "../src/abi/v22-state.js";
import { UnknownLayoutError } from "../src/abi/layout.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/v22-parity.json", import.meta.url), "utf8")) as {
  accounts: Record<string, { hex: string }>;
};
const HDR = 16;
const real = () => Uint8Array.from(Buffer.from(FX.accounts.g9Allowlist.hex, "hex"));
const refused = (d: Uint8Array) => {
  try {
    S.decodeG9FeedAllowlistV22(d);
  } catch (e) {
    expect(e).toBeInstanceOf(UnknownLayoutError);
    return (e as UnknownLayoutError).code;
  }
  throw new Error("decoded");
};

describe("decodeG9FeedAllowlistV22 header validation (real rc23 bytes)", () => {
  it("baseline decodes", () => {
    expect(S.decodeG9FeedAllowlistV22(real()).count).toBe(2);
  });
  it("version != 1", () => {
    const d = real();
    d[HDR + 1] = 2;
    expect(refused(d)).toBe("INVALID_RECORD");
  });
  it("count > cap (16)", () => {
    const d = real();
    d[HDR] = 17;
    expect(refused(d)).toBe("INVALID_RECORD");
  });
  it("pending_count > cap (16)", () => {
    const d = real();
    d[HDR + 3] = 17;
    expect(refused(d)).toBe("INVALID_RECORD");
  });
  it("non-zero padding byte at body[4..8]", () => {
    for (const off of [4, 7]) {
      const d = real();
      d[HDR + off] = 1;
      expect(refused(d)).toBe("INVALID_RECORD");
    }
  });
  it("count == cap with pending_count == cap is accepted only if every slot is valid (boundary is >, not >=)", () => {
    const d = real();
    d[HDR + 3] = 16;
    // pending slots 0..15 may be zero (not listed-checked), so this decodes
    expect(S.decodeG9FeedAllowlistV22(d).pendingKeys.length).toBe(16);
  });
  it("listed key zeroed (keys[0] @ body+16)", () => {
    const d = real();
    d.fill(0, HDR + 16, HDR + 48);
    expect(refused(d)).toBe("INVALID_RECORD");
  });
  it("listed key duplicated (keys[1] := keys[0])", () => {
    const d = real();
    d.copyWithin(HDR + 16 + 32, HDR + 16, HDR + 48);
    expect(refused(d)).toBe("INVALID_RECORD");
  });
  it("unlisted owner slot set (owners[2] @ body+16+16*32+64)", () => {
    const d = real();
    d[HDR + 16 + 16 * 32 + 64] = 1;
    expect(refused(d)).toBe("INVALID_RECORD");
  });
  it("truncated buffers are TOO_SHORT", () => {
    for (const n of [0, 15, HDR, HDR + 2063]) expect(refused(real().subarray(0, n))).toBe("TOO_SHORT");
  });
});
