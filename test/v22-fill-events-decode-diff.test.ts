import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import * as E from "../src/abi/v22-fill-events.js";
import { CORPUS_WRAPPER, REAL_TOKENS, fuzzLogs, fuzzToken, realisticLogs, rng } from "./support/v22-fill-events-corpus.js";

// Verbatim copy of the pre-optimisation decoder (DataView per field, slice for keys).
function u16(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}
function u64(b: Uint8Array, o: number): bigint {
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getBigUint64(o, true);
}
function i128(b: Uint8Array, o: number): bigint {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return (dv.getBigInt64(o + 8, true) << 64n) | dv.getBigUint64(o, true);
}
function key(b: Uint8Array, o: number): PublicKey {
  return new PublicKey(b.slice(o, o + 32));
}
function oldDecode(b: Uint8Array): { event: E.WrapperEventV22 } | { skip: E.SkipReasonV22 } {
  if (b.length < 2) return { skip: "malformed" };
  if (b[0] < 1 || b[0] > 3) return { skip: "unknown-kind" };
  if (b[1] !== E.EVENT_VERSION_V22) return { skip: "unknown-version" };
  if (b.length < E.EVENT_HEADER_LEN_V22) return { skip: "bad-length" };
  const ixTag = b[2];
  const market = key(b, 3);
  if (b[0] === E.EVENT_KIND_FILL_V22) {
    if (b.length < E.FILL_FIXED_LEN_V22) return { skip: "bad-length" };
    const n = b[99];
    if (n === 0 || n > E.FILL_MAX_RECS_PER_LINE_V22 || b.length !== E.FILL_FIXED_LEN_V22 + E.FILL_REC_LEN_V22 * n) return { skip: "bad-length" };
    const records: E.FillRecordV22[] = [];
    for (let i = 0; i < n; i++) {
      const o = E.FILL_FIXED_LEN_V22 + E.FILL_REC_LEN_V22 * i;
      records.push({
        assetIndex: u16(b, o), assetGen: u64(b, o + 2), flags: b[o + 10],
        requestedQ: i128(b, o + 11), executedQ: i128(b, o + 27),
        priceE6: u64(b, o + 43), quotedPriceE6: u64(b, o + 51), feeAtoms: u64(b, o + 59), backingFeeAtoms: u64(b, o + 67),
      });
    }
    return { event: { kind: "fill", ixTag, market, taker: key(b, 35), lp: key(b, 67), records } };
  }
  if (b[0] === E.EVENT_KIND_REDUCE_V22) {
    if (b.length !== E.REDUCE_LEN_V22) return { skip: "bad-length" };
    const reason = b[109];
    if (reason < 1 || reason > 5 && reason !== E.REDUCE_REASON_V22.LP_STOP) return { skip: "unknown-reduce-reason" };
    return {
      event: {
        kind: "reduce", ixTag, market, portfolio: key(b, 35), counterparty: key(b, 67), assetIndex: u16(b, 99), assetGen: u64(b, 101),
        reason: reason as E.ReduceReasonV22, signedReducedQ: i128(b, 110), priceE6: u64(b, 126),
      },
    };
  }
  if (b.length !== E.MOVE_LEN_V22) return { skip: "bad-length" };
  const sub = b[35];
  const assetIndex = u16(b, 36), a = u64(b, 38), bb = u64(b, 46), c = u64(b, 54);
  const base = { kind: "move" as const, ixTag, market, assetIndex, a, b: bb, c };
  switch (sub) {
    case E.MOVE_SUB_V22.EARN_EXIT: return { event: { ...base, sub: 1, principalAtoms: a, earningsAtoms: bb, sharesBurned: c } };
    case E.MOVE_SUB_V22.G9:
      if (c !== 0n && c !== 1n) return { skip: "bad-g9-mode" };
      return { event: { ...base, sub: 2, amountAtoms: a, receivableAfterAtoms: bb, mode: Number(c) as 0 | 1 } };
    case E.MOVE_SUB_V22.RENT_ROUTED: return { event: { ...base, sub: 3, routedAtoms: a } };
    case E.MOVE_SUB_V22.G9_RESTORE_PNL: return { event: { ...base, sub: 4, fromProfitAtoms: a, fromCapitalAtoms: bb, receivableAfterAtoms: c } };
    default: return { skip: "unknown-move-sub" };
  }
}

// Normalise PublicKeys to base58 so toEqual compares values (bigint-safe).
const norm = (v: unknown): unknown =>
  JSON.parse(JSON.stringify(v, (_k, x) => (x instanceof PublicKey ? "pk:" + x.toBase58() : typeof x === "bigint" ? "n:" + x.toString() : x)));

describe("v22 fill-events decode: old vs new", () => {
  it("every real token decodes identically (and to an event)", () => {
    for (const tok of REAL_TOKENS) {
      const raw = new Uint8Array(Buffer.from(tok, "base64"));
      const n = E.decodeWrapperEventV22(raw);
      expect("event" in n).toBe(true);
      expect(norm(n)).toEqual(norm(oldDecode(raw)));
    }
  });

  it("non-zero byteOffset views (Buffer pool slices) decode identically", () => {
    for (const tok of REAL_TOKENS) {
      const raw = Buffer.from(tok, "base64");
      const padded = new Uint8Array(raw.length + 13);
      padded.set(raw, 7);
      const view = padded.subarray(7, 7 + raw.length);
      expect(norm(E.decodeWrapperEventV22(view))).toEqual(norm(oldDecode(new Uint8Array(raw))));
    }
  });

  it("decoded keys do not alias the input buffer", () => {
    const raw = new Uint8Array(Buffer.from(REAL_TOKENS[0], "base64"));
    const d = E.decodeWrapperEventV22(raw);
    if (!("event" in d) || d.event.kind !== "fill") throw new Error("expected fill");
    const before = d.event.market.toBase58();
    raw.fill(0xee);
    expect(d.event.market.toBase58()).toBe(before);
  });

  it("12k fuzzed tokens: same events, same skip reasons", () => {
    const r = rng(7);
    const reasons = new Set<string>();
    let events = 0;
    for (let i = 0; i < 12000; i++) {
      const tok = fuzzToken(r);
      const n = E.decodeWrapperEventTokenV22(tok);
      // old token path = same B64/canonical checks + oldDecode on the same bytes
      let o: unknown;
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(tok)) o = { skip: "malformed" };
      else {
        const raw = Buffer.from(tok, "base64");
        o = raw.toString("base64").replace(/=+$/, "") !== tok.replace(/=+$/, "") ? { skip: "malformed" } : oldDecode(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
      }
      expect(norm(n)).toEqual(norm(o));
      if ("skip" in n) reasons.add(n.skip);
      else events++;
    }
    expect(events).toBeGreaterThan(1000);
    // the fuzzer must reach most skip reasons, or the comparison proves little
    expect(reasons.size).toBeGreaterThanOrEqual(5);
  }, 300_000);

  it("11k log arrays end to end (decodeTxEventsV22): same events, skipped reasons, unknown reasons", () => {
    const r = rng(11);
    const statuses = new Map<string, number>();
    for (let i = 0; i < 11000; i++) {
      const logs = i % 2 === 0 ? realisticLogs(r) : fuzzLogs(r);
      const n = E.decodeTxEventsV22(true, logs, CORPUS_WRAPPER);
      // old decode of the same token list (the frame walk is unchanged here; pinned by v22-fill-events-frame-diff.test.ts)
      const t = E.wrapperEventTokensV22(logs, CORPUS_WRAPPER);
      let o: unknown;
      if (!t.ok) o = { status: "unknown", reason: t.unknown };
      else {
        const events: unknown[] = [];
        const skipped: string[] = [];
        for (const tok of t.tokens) {
          let d: ReturnType<typeof oldDecode>;
          if (!/^[A-Za-z0-9+/]+={0,2}$/.test(tok)) d = { skip: "malformed" };
          else {
            const raw = Buffer.from(tok, "base64");
            d = raw.toString("base64").replace(/=+$/, "") !== tok.replace(/=+$/, "") ? { skip: "malformed" } : oldDecode(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
          }
          if ("event" in d) events.push(d.event);
          else skipped.push(d.skip);
        }
        o = { status: "known", events, skipped };
      }
      expect(norm(n)).toEqual(norm(o));
      const k = n.status === "known" ? (n.skipped.length ? "known+skips" : n.events.length ? "known+events" : "known-empty") : n.status === "unknown" ? "unknown:" + n.reason : n.status;
      statuses.set(k, (statuses.get(k) ?? 0) + 1);
    }
    expect(statuses.get("known+events") ?? 0).toBeGreaterThan(3000);
    expect(statuses.get("known+skips") ?? 0).toBeGreaterThan(20);
    expect([...statuses.keys()].filter((k) => k.startsWith("unknown:")).length).toBeGreaterThanOrEqual(3);
  }, 300_000);
});
