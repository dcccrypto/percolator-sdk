/**
 * v2.2 fill / reduce / move events and the strict log attribution rule (wrapper docs/v22-fill-events.md).
 * Vectors: the five worked examples of the document (generated there by an independent python encoder) plus vectors generated the
 * same way (python `struct`) for MOVE subs 2/3/4, REDUCE reasons 3/5 and a 4-leg batch.
 */
import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import * as E from "../src/abi/v22-fill-events.js";

const WRAPPER = Keypair.generate().publicKey;
const MATCHER = Keypair.generate().publicKey;
const SYSTEM = "11111111111111111111111111111111";
const m1 = new PublicKey(new Uint8Array(32).fill(1));
const m2 = new PublicKey(new Uint8Array(32).fill(2));
const m3 = new PublicKey(new Uint8Array(32).fill(3));

const DOC = {
  trade: "AQEKAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAQAABwAAAAAAAAAJwOHkAAAAAAAAAAAAAAAAAICWmAAAAAAAAAAAAAAAAAAA4fUFAAAAAADh9QUAAAAA6AMAAAAAAAAAAAAAAAAAAA==",
  zero: "AQEKAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAQAABwAAAAAAAAANwMYtAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4fUFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
  batch2: "AQFDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAgAABwAAAAAAAAAIQEIPAAAAAAAAAAAAAAAAAEBCDwAAAAAAAAAAAAAAAAAA4fUFAAAAAADh9QUAAAAAAAAAAAAAAAAAAAAAAAAAAAEACAAAAAAAAAAKgIQeAAAAAAAAAAAAAAAAACChBwAAAAAAAAAAAAAAAACAsuYOAAAAAEBw1w4AAAAAAAAAAAAAAAAAAAAAAAAAAA==",
  rebalance: "AgEsAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAAAAAAAAAEA98L/////////////////AOH1BQAAAAA=",
  earnExit: "AwFNAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB//9AVIkAAAAAANASEwAAAAAAgJaYAAAAAAA=",
};
const GEN = {
  g9Restore: "AwFvAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEE//9grgoAAAAAAOCTBAAAAAAAoCUmAAAAAAA=",
  g9Draw: "AwFvAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEC//9AQg8AAAAAAAAJPQAAAAAAAAAAAAAAAAA=",
  g9Capital: "AwFvAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEC//9AQg8AAAAAAMDGLQAAAAAAAQAAAAAAAAA=",
  rent: "AwFqAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEDAAA5MAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  liq: "AgEFAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAJAAAAAAAAAANAOdL/////////////////wDtHAwAAAAA=",
  evict: "AgF3AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAAAHAAAAAAAAAAUAEnoAAAAAAAAAAAAAAAAAAOH1BQAAAAA=",
  batch4: "AQFDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDBAAABwAAAAAAAAAIwL3w/////////////////8C98P////////////////8A4fUFAAAAAMCe5gUAAAAA9AEAAAAAAAAAAAAAAAAAAAEACAAAAAAAAAAKgIQeAAAAAAAAAAAAAAAAACChBwAAAAAAAAAAAAAAAACAsuYOAAAAAEBw1w4AAAAAAAAAAAAAAAAAAAAAAAAAAAIACQAAAAAAAAAJwMYtAAAAAAAAAAAAAAAAAICEHgAAAAAAAAAAAAAAAABAS0wAAAAAAEBLTAAAAAAA//////////8AAAAAAAAAAAMACgAAAAAAAAAIAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAA==",
};
const ev = (tok: string) => {
  const d = E.decodeWrapperEventTokenV22(tok);
  if (!("event" in d)) throw new Error("skipped: " + d.skip);
  return d.event;
};

describe("event decoders (document worked examples)", () => {
  it("1. TradeCpi clipped by LP headroom", () => {
    const e = ev(DOC.trade);
    expect(e.kind).toBe("fill");
    if (e.kind !== "fill") return;
    expect(e.ixTag).toBe(10);
    expect(e.market.equals(m1) && e.taker.equals(m2) && e.lp.equals(m3)).toBe(true);
    expect(e.records).toEqual([{ assetIndex: 0, assetGen: 7n, flags: 9, requestedQ: 15_000_000n, executedQ: 10_000_000n, priceE6: 100_000_000n, quotedPriceE6: 100_000_000n, feeAtoms: 1000n, backingFeeAtoms: 0n }]);
    expect(e.records[0].flags & E.FILL_FLAG_V22.CLIPPED).toBeTruthy();
  });
  it("2. zero fill: executed 0, quoted 0, flags CLIPPED|ZERO|MATCHER", () => {
    const e = ev(DOC.zero);
    if (e.kind !== "fill") throw new Error();
    expect(e.records[0]).toMatchObject({ flags: 13, requestedQ: 3_000_000n, executedQ: 0n, quotedPriceE6: 0n, feeAtoms: 0n });
  });
  it("3. two-leg batch (tag 67): records in leg order, partial leg carries PARTIAL", () => {
    const e = ev(DOC.batch2);
    if (e.kind !== "fill") throw new Error();
    expect(e.ixTag).toBe(67);
    expect(e.records.map((r) => [r.assetIndex, r.assetGen, r.flags, r.executedQ, r.priceE6, r.quotedPriceE6])).toEqual([[0, 7n, 8, 1_000_000n, 100_000_000n, 100_000_000n], [1, 8n, 10, 500_000n, 250_000_000n, 249_000_000n]]);
  });
  it("4. RebalanceReduce: signed i128 is negative for a reduced long", () => {
    const e = ev(DOC.rebalance);
    expect(e).toMatchObject({ kind: "reduce", ixTag: 44, reason: E.REDUCE_REASON_V22.REBALANCE_REDUCE, signedReducedQ: -4_000_000n, priceE6: 100_000_000n, assetIndex: 0, assetGen: 7n });
    if (e.kind === "reduce") expect(e.counterparty.equals(PublicKey.default)).toBe(true);
  });
  it("5. Earn exit MOVE sub 1", () => {
    const e = ev(DOC.earnExit);
    expect(e).toMatchObject({ kind: "move", sub: 1, ixTag: 77, assetIndex: E.MOVE_NO_ASSET_V22, principalAtoms: 9_000_000n, earningsAtoms: 1_250_000n, sharesBurned: 10_000_000n });
  });
});

describe("MOVE sub 4 G9_RESTORE_PNL and the other generated vectors", () => {
  it("sub 4: a = from released profit, b = from capital, c = receivable after (tag 111)", () => {
    const e = ev(GEN.g9Restore);
    expect(e).toMatchObject({ kind: "move", sub: 4, ixTag: 111, fromProfitAtoms: 700_000n, fromCapitalAtoms: 300_000n, receivableAfterAtoms: 2_500_000n });
    if (e.kind === "move" && e.sub === 4) expect(e.fromProfitAtoms + e.fromCapitalAtoms).toBe(1_000_000n); // the amount repaid into insurance
  });
  it("sub 2: mode 0 draw and mode 1 capital-only restore keep their own meaning", () => {
    expect(ev(GEN.g9Draw)).toMatchObject({ sub: 2, mode: 0, amountAtoms: 1_000_000n, receivableAfterAtoms: 4_000_000n });
    expect(ev(GEN.g9Capital)).toMatchObject({ sub: 2, mode: 1, amountAtoms: 1_000_000n, receivableAfterAtoms: 3_000_000n });
  });
  it("sub 3: routed rent on asset 0", () => {
    expect(ev(GEN.rent)).toMatchObject({ sub: 3, ixTag: 106, assetIndex: 0, routedAtoms: 12_345n });
  });
  it("REDUCE liquidation (reason 3, unilateral) and eviction (reason 5, bilateral, positive = short covered)", () => {
    expect(ev(GEN.liq)).toMatchObject({ kind: "reduce", ixTag: 5, reason: 3, assetIndex: 2, assetGen: 9n, signedReducedQ: -3_000_000n, priceE6: 55_000_000n });
    const e = ev(GEN.evict);
    expect(e).toMatchObject({ kind: "reduce", ixTag: 119, reason: 5, signedReducedQ: 8_000_000n });
    if (e.kind === "reduce") expect(e.counterparty.equals(m3)).toBe(true);
  });
  it("4-leg batch (the v2.2 cap): negative executed, u64::MAX fee kept exact", () => {
    const e = ev(GEN.batch4);
    if (e.kind !== "fill") throw new Error();
    expect(e.records).toHaveLength(4);
    expect(e.records[0]).toMatchObject({ requestedQ: -1_000_000n, executedQ: -1_000_000n, quotedPriceE6: 99_000_000n, feeAtoms: 500n });
    expect(e.records[2].feeAtoms).toBe(2n ** 64n - 1n);
  });
});

describe("skip rules (never throw, never guess)", () => {
  const raw = (tok: string) => new Uint8Array(Buffer.from(tok, "base64"));
  it("unknown kind, unknown version, unknown sub, unknown reason, wrong lengths, junk", () => {
    const k = raw(DOC.earnExit); k[0] = 9;
    expect(E.decodeWrapperEventV22(k)).toEqual({ skip: "unknown-kind" });
    const v = raw(DOC.trade); v[1] = 2;
    expect(E.decodeWrapperEventV22(v)).toEqual({ skip: "unknown-version" });
    // the version is checked BEFORE any length: a v2 line of another length is "unknown-version", not "bad-length"
    expect(E.decodeWrapperEventV22(new Uint8Array([1, 2, 10]))).toEqual({ skip: "unknown-version" });
    const s = raw(GEN.g9Restore); s[35] = 9;
    expect(E.decodeWrapperEventV22(s)).toEqual({ skip: "unknown-move-sub" });
    const r = raw(GEN.liq); r[109] = 9;
    expect(E.decodeWrapperEventV22(r)).toEqual({ skip: "unknown-reduce-reason" });
    expect(E.decodeWrapperEventV22(raw(DOC.trade).slice(0, 174))).toEqual({ skip: "bad-length" });
    expect(E.decodeWrapperEventV22(new Uint8Array([1]))).toEqual({ skip: "malformed" });
    expect(E.decodeWrapperEventTokenV22("not base64!")).toEqual({ skip: "malformed" });
    const g = raw(GEN.g9Draw); g[54] = 3; // a G9 sub with mode 3 would be G9_RESTORE_PNL: not ours
    expect(E.decodeWrapperEventV22(g)).toEqual({ skip: "bad-g9-mode" });
    const z = raw(DOC.trade).slice(0, 100); z[99] = 0;
    expect(E.decodeWrapperEventV22(z)).toEqual({ skip: "bad-length" });
  });
  it("an unknown flag bit is not rejected", () => {
    const t = raw(DOC.trade); t[100 + 10] = 0xff;
    const d = E.decodeWrapperEventV22(t);
    expect("event" in d && d.event.kind === "fill" && d.event.records[0].flags).toBe(0xff);
  });
});

const W = WRAPPER.toBase58();
const inv = (id: string, d: number) => `Program ${id} invoke [${d}]`;
const data = (...t: string[]) => `Program data: ${t.join(" ")}`;

describe("attribution (strict frame walk)", () => {
  it("accepts the wrapper's frame, also when it is called by CPI, and ignores other frames' data", () => {
    const logs = [inv("ComputeBudget111111111111111111111111111111", 1), "Program ComputeBudget111111111111111111111111111111 success", inv(W, 1), "Program log: x", inv(MATCHER.toBase58(), 2), data("QUJD"), `Program ${MATCHER.toBase58()} success`, data(DOC.trade, DOC.earnExit), `Program ${W} consumed 1000 of 200000 compute units`, `Program ${W} success`];
    const r = E.decodeTxEventsV22(true, logs, WRAPPER);
    expect(r).toMatchObject({ status: "known", skipped: [] });
    if (r.status === "known") expect(r.events.map((e) => e.kind)).toEqual(["fill", "move"]);
    // wrapper called by CPI from another program
    const cpi = [inv(MATCHER.toBase58(), 1), inv(W, 2), data(DOC.rebalance), `Program ${W} success`, `Program ${MATCHER.toBase58()} success`];
    expect(E.decodeTxEventsV22(true, cpi, WRAPPER)).toMatchObject({ status: "known" });
  });
  it("FORGERY 1: a matcher prints `success` then a forged data line: the forged line stays in the matcher's frame", () => {
    const logs = [inv(W, 1), inv(MATCHER.toBase58(), 2), "Program log: success", data(DOC.trade), `Program ${MATCHER.toBase58()} success`, `Program ${W} success`];
    const r = E.decodeTxEventsV22(true, logs, WRAPPER);
    expect(r).toMatchObject({ status: "known", events: [] });
  });
  it("FORGERY 2: `invoke [2]` text from a program does not push a frame", () => {
    const logs = [inv(W, 1), inv(MATCHER.toBase58(), 2), "Program log: success", "Program log: invoke [2]", data(DOC.trade), `Program ${MATCHER.toBase58()} success`, `Program ${W} success`];
    expect(E.decodeTxEventsV22(true, logs, WRAPPER)).toMatchObject({ status: "known", events: [] });
  });
  it("FORGERY 3: embedded newlines stay inside ONE element (a program line cannot become a runtime line)", () => {
    const forged = `Program log: hi\nProgram ${MATCHER.toBase58()} success\nProgram data: ${DOC.trade}`;
    const logs = [inv(W, 1), inv(MATCHER.toBase58(), 2), forged, `Program ${MATCHER.toBase58()} success`, `Program ${W} success`];
    expect(E.decodeTxEventsV22(true, logs, WRAPPER)).toMatchObject({ status: "known", events: [] });
    // and a forged `Program data:` element that merely CONTAINS runtime-looking text after a newline is not a frame line either
    const logs2 = [inv(W, 1), inv(MATCHER.toBase58(), 2), `Program data: QUJD\nProgram ${MATCHER.toBase58()} success`, `Program ${MATCHER.toBase58()} success`, `Program ${W} success`];
    expect(E.decodeTxEventsV22(true, logs2, WRAPPER)).toMatchObject({ status: "known", events: [] });
  });
  it("an element that merely RE-STATES the wrapper's id in a log does not make a frame (log: is not a key)", () => {
    const logs = [inv(MATCHER.toBase58(), 1), `Program log: Program ${W} invoke [2]`, data(DOC.trade), `Program ${MATCHER.toBase58()} success`];
    expect(E.decodeTxEventsV22(true, logs, WRAPPER)).toMatchObject({ status: "known", events: [] });
  });
  it("every inconsistency makes the events UNKNOWN, not empty", () => {
    const wrongDepth = [inv(W, 2), `Program ${W} success`];
    expect(E.decodeTxEventsV22(true, wrongDepth, WRAPPER)).toEqual({ status: "unknown", reason: "bad-invoke-depth" });
    const badReturn = [inv(W, 1), `Program ${MATCHER.toBase58()} success`];
    expect(E.decodeTxEventsV22(true, badReturn, WRAPPER)).toEqual({ status: "unknown", reason: "bad-return" });
    expect(E.decodeTxEventsV22(true, [data(DOC.trade)], WRAPPER)).toEqual({ status: "unknown", reason: "data-outside-frame" });
    expect(E.decodeTxEventsV22(true, [inv(W, 1), data(DOC.trade)], WRAPPER)).toEqual({ status: "unknown", reason: "unclosed-frame" });
    expect(E.decodeTxEventsV22(true, [inv(W, 1), `Program ${W} failed: custom program error: 0x1`], WRAPPER)).toMatchObject({ status: "known" });
    // a key of the wrong length / not canonical is not a runtime line: ignored, so the frame never closes
    expect(E.decodeTxEventsV22(true, [inv(W, 1), data(DOC.trade), `Program ${SYSTEM}xx success`, `Program ${W} success`], WRAPPER)).toMatchObject({ status: "known" });
  });
  it("success must be EXACT: trailing text does not pop", () => {
    expect(E.decodeTxEventsV22(true, [inv(W, 1), `Program ${W} success!`], WRAPPER)).toEqual({ status: "unknown", reason: "unclosed-frame" });
    expect(E.decodeTxEventsV22(true, [inv(W, 1), `Program ${W} success\nProgram ${W} success`], WRAPPER)).toEqual({ status: "unknown", reason: "unclosed-frame" });
  });
  it("Log truncated, null and empty logs are UNKNOWN; a failed transaction is ignored", () => {
    expect(E.decodeTxEventsV22(true, [inv(W, 1), "Log truncated", `Program ${W} success`], WRAPPER)).toEqual({ status: "unknown", reason: "truncated" });
    expect(E.decodeTxEventsV22(true, null, WRAPPER)).toEqual({ status: "unknown", reason: "no-logs" });
    expect(E.decodeTxEventsV22(true, [], WRAPPER)).toEqual({ status: "unknown", reason: "no-logs" });
    expect(E.decodeTxEventsV22(false, [inv(W, 1), data(DOC.trade), `Program ${W} success`], WRAPPER)).toEqual({ status: "failed" });
  });
  it("the wrapper id is the PINNED one: the same lines under another program are not the wrapper's", () => {
    const other = Keypair.generate().publicKey;
    const logs = [inv(other.toBase58(), 1), data(DOC.trade), `Program ${other.toBase58()} success`];
    expect(E.decodeTxEventsV22(true, logs, WRAPPER)).toMatchObject({ status: "known", events: [] });
  });
  it("a wrapper token that does not decode is skipped, the rest is kept, order is log order (tag 119: REDUCE then FILL)", () => {
    const logs = [inv(W, 1), data(GEN.evict, "AAAA", "!!!", DOC.trade, GEN.g9Restore), `Program ${W} success`];
    const r = E.decodeTxEventsV22(true, logs, WRAPPER);
    expect(r.status).toBe("known");
    if (r.status !== "known") return;
    expect(r.events.map((e) => e.kind)).toEqual(["reduce", "fill", "move"]);
    expect(r.skipped).toEqual(["unknown-kind", "malformed"]);
  });
});

describe("near-miss runtime lines never push or pop a frame (reviewer's vectors)", () => {
  const closers = [
    `Program ${W} success `, // trailing space
    `Program ${W} successful`,
    `Program ${W} failed`, // no colon
    `Program ${W} failedx: boom`,
    ` Program ${W} success`, // leading space
    `program ${W} success`, // lowercase
    `Program  ${W} success`, // double space
    `Program ${W} success\n`, // trailing newline
    `Program ${W} success\nProgram ${W} success`, // embedded newline
  ];
  for (const c of closers) {
    it(`closer ${JSON.stringify(c.length > 40 ? c.slice(0, 12) + "..." + c.slice(-14) : c)} does not close the frame: the transaction is UNKNOWN`, () => {
      const r = E.decodeTxEventsV22(true, [inv(W, 1), data(DOC.trade), c], WRAPPER);
      expect(r).toEqual({ status: "unknown", reason: "unclosed-frame" });
    });
  }
  const openers = [
    `Program ${W} invoke [+1]`,
    `Program ${W} invoke []`,
    `Program ${W} invoke [1`,
    `Program ${W} invoke [1]\n`,
    `Program ${W} invoke [ 1]`,
    `Program ${W} invoke [01x]`,
    ` Program ${W} invoke [1]`,
    `program ${W} invoke [1]`,
    `Program  ${W} invoke [1]`,
  ];
  for (const o of openers) {
    it(`opener ${JSON.stringify(o)} does not open the wrapper's frame: its data line is outside every frame (UNKNOWN), never attributed`, () => {
      const r = E.decodeTxEventsV22(true, [o, data(DOC.trade), `Program ${W} success`], WRAPPER);
      expect(r.status).toBe("unknown");
    });
  }
  it("a leading-zero depth is the same number (the runtime never prints one, but the rule is on the NUMBER): [01] at depth 1 pushes", () => {
    // documented behaviour of this decoder: digits only, compared numerically; the wrapper's own lines never carry leading zeros
    const r = E.decodeTxEventsV22(true, [`Program ${W} invoke [01]`, data(DOC.trade), `Program ${W} success`], WRAPPER);
    expect(r).toMatchObject({ status: "known" });
  });
});
