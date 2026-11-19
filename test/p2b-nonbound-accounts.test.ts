/**
 * Account-shape hazards of nonboundVaultPricingFromAccountsP2b: short / closed / wrong-kind ledgers and
 * out-of-range domains or truncated markets must fail with a descriptive Error, never a RangeError / TypeError.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeBackingDomainLedgerP2b, nonboundVaultPricingFromAccountsP2b, readPotEngineRecordsP2b } from "../src/solana/p2b-earn.js";
import { stampMarket } from "./helpers/stamp.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/p2b-parity.json", import.meta.url), "utf8")) as { ledgerAccountHex: string; potLayout: { marketGroupOff: number; marketGroupHeaderLen: number; assetSlotLen: number } };
const ledger = (): Uint8Array => new Uint8Array(Buffer.from(FX.ledgerAccountHex, "hex"));
const L = FX.potLayout;
const market = (): Uint8Array => stampMarket(new Uint8Array(L.marketGroupOff + L.marketGroupHeaderLen + 2 * L.assetSlotLen));

/** Run fn and return the thrown value (or undefined). */
const thrown = (fn: () => unknown): unknown => { try { fn(); } catch (e) { return e; } return undefined; };
const expectPlainError = (fn: () => unknown, re: RegExp): void => {
  const e = thrown(fn);
  expect(e).toBeInstanceOf(Error);
  expect(e).not.toBeInstanceOf(RangeError);
  expect(e).not.toBeInstanceOf(TypeError);
  expect((e as Error).message).toMatch(re);
};

describe("decodeBackingDomainLedgerP2b on malformed accounts", () => {
  it("every truncated length 1..239 throws a descriptive Error", () => {
    const full = ledger();
    for (let n = 1; n < 240; n++) expectPlainError(() => decodeBackingDomainLedgerP2b(full.subarray(0, n)), /exactly 240/);
  });
  it("a closed (all-zero 240B) account throws on magic", () => {
    expectPlainError(() => decodeBackingDomainLedgerP2b(new Uint8Array(240)), /invalid v17 magic/);
  });
  it("an oversized account throws", () => {
    expectPlainError(() => decodeBackingDomainLedgerP2b(new Uint8Array(241)), /exactly 240/);
  });
});

describe("readPotEngineRecordsP2b bounds", () => {
  it.each([40, 2 ** 31, 2 ** 32, 2 ** 32 + 2, 2 ** 40, Number.MAX_SAFE_INTEGER, Infinity])("domain %s beyond the market throws a descriptive Error", (d) => {
    expectPlainError(() => readPotEngineRecordsP2b(market(), d), /bad domain|too short/);
  });
  it("a market truncated to every length never throws a RangeError", () => {
    const m = market();
    for (let n = 0; n < m.length; n += 97) {
      const e = thrown(() => readPotEngineRecordsP2b(m.subarray(0, n), 1));
      if (e !== undefined) { expect(e).toBeInstanceOf(Error); expect(e).not.toBeInstanceOf(RangeError); }
    }
  });
});

describe("nonboundVaultPricingFromAccountsP2b with unusable ledgers", () => {
  const base = { marketData: market(), registryDomain: 0, feeShareBps: 0 };
  it("null and zero-length ledgers are absent", () => {
    expect(() => nonboundVaultPricingFromAccountsP2b({ ...base, ownLedgerData: null, siblingLedgerData: new Uint8Array(0) })).not.toThrow();
  });
  it("a short own ledger throws a descriptive Error", () => {
    expectPlainError(() => nonboundVaultPricingFromAccountsP2b({ ...base, ownLedgerData: ledger().subarray(0, 100), siblingLedgerData: null }), /exactly 240/);
  });
  it("a closed all-zero sibling ledger throws a descriptive Error", () => {
    expectPlainError(() => nonboundVaultPricingFromAccountsP2b({ ...base, ownLedgerData: null, siblingLedgerData: new Uint8Array(240) }), /invalid v17 magic/);
  });
});
