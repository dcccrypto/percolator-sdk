/**
 * Branch coverage for decodeG9FeedAllowlistV22 (src/abi/v22-state.ts).
 * Body layout (percolator-prog d27f3d73): count u8 @0, version u8 @1, bump u8 @2, pending_count u8 @3, pad[4] @4..8,
 * pending_slot u64 LE @8, then four [16][32] arrays (keys, owners, pending_keys, pending_owners) from @16.
 */
import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { V22_VECTORS } from "./v22-vector-inputs.js";
import { decodeG9FeedAllowlistV22 } from "../src/abi/v22-state.js";
import { UnknownLayoutError } from "../src/abi/layout.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/v22-parity.json", import.meta.url), "utf8")) as {
  accounts: Record<string, { hex: string }>;
};
void V22_VECTORS;
const HEADER = 16;
const ARR = (idx: number, i: number) => HEADER + 16 + 32 * (idx * 16 + i);
const base = () => Uint8Array.from(Buffer.from(FX.accounts.g9Allowlist.hex, "hex"));
const mut = (f: (d: Uint8Array) => void) => {
  const d = base();
  f(d);
  return d;
};

describe("decodeG9FeedAllowlistV22 rejection branches", () => {
  it("baseline decodes", () => {
    expect(decodeG9FeedAllowlistV22(base()).count).toBe(2);
  });
  it.each([
    ["version != 1", (d: Uint8Array) => { d[HEADER + 1] = 2; }],
    ["count > cap", (d: Uint8Array) => { d[HEADER] = 17; }],
    ["pending_count > cap", (d: Uint8Array) => { d[HEADER + 3] = 17; }],
    ["non-zero padding", (d: Uint8Array) => { d[HEADER + 7] = 1; }],
  ])("header invalid: %s", (_n, f) => {
    expect(() => decodeG9FeedAllowlistV22(mut(f))).toThrow(/allowlist header invalid/);
  });
  it("zero listed key", () => {
    expect(() => decodeG9FeedAllowlistV22(mut((d) => d.fill(0, ARR(0, 1), ARR(0, 1) + 32)))).toThrow(/listed key 1 is zero or duplicated/);
  });
  it("duplicate listed key", () => {
    expect(() => decodeG9FeedAllowlistV22(mut((d) => d.copyWithin(ARR(0, 1), ARR(0, 0), ARR(0, 0) + 32)))).toThrow(UnknownLayoutError);
  });
  it("non-zero unlisted owner slot", () => {
    expect(() => decodeG9FeedAllowlistV22(mut((d) => { d[ARR(1, 5)] = 1; }))).toThrow(/unlisted owner slot 5 is not zero/);
  });
  it("accepts a populated pending proposal (zero/duplicate keys not policed there)", () => {
    const g = decodeG9FeedAllowlistV22(mut((d) => {
      d[HEADER + 3] = 2;
      d[HEADER + 8] = 7;
      d.fill(3, ARR(2, 0), ARR(2, 0) + 32);
      d.fill(3, ARR(2, 1), ARR(2, 1) + 32);
      d.fill(4, ARR(3, 0), ARR(3, 0) + 32);
      d.fill(5, ARR(3, 1), ARR(3, 1) + 32);
    }));
    expect([g.pendingCount, g.pendingSlot]).toEqual([2, 7n]);
    expect(g.pendingKeys).toEqual([new PublicKey(new Uint8Array(32).fill(3)), new PublicKey(new Uint8Array(32).fill(3))]);
    expect(g.pendingOwners[1].toBytes()[0]).toBe(5);
  });
});
