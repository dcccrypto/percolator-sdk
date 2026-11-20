/**
 * DiscoveredMarket.marketMode for v17-line (v2.1 / v2.2) markets.
 *
 * Fixture: two real devnet v2.2 (wrapper VERSION 19) market accounts captured by
 * scripts/capture-market-mode-fixture.mjs: [0] active (engine mode 0), [1] resolved (mode 1).
 * Before this change discovery returned both as ordinary markets with no way to tell them apart.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { PublicKey, type Connection } from "@solana/web3.js";
import { discoverMarkets, getMarketsByAddress } from "../src/solana/discovery.js";

interface FixtureAccount { address: string; owner: string; data_base64: string }
const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/accounts/devnet-v22-market-modes.json", import.meta.url), "utf8"),
) as { program_id: string; accounts: FixtureAccount[] };

const programId = new PublicKey(fixture.program_id);
const [active, resolved] = fixture.accounts.map((a) => ({
  pubkey: new PublicKey(a.address),
  data: Buffer.from(a.data_base64, "base64"),
}));

afterEach(() => vi.restoreAllMocks());

describe("DiscoveredMarket.marketMode (v2.2 devnet fixture)", () => {
  it("fixture sanity: full v2.2 market accounts with mode bytes 0 and 1 at 592 + 674", () => {
    expect(active.data.length).toBe(4059);
    expect(active.data.readUInt16LE(8)).toBe(19);
    expect(active.data[1266]).toBe(0);
    expect(resolved.data[1266]).toBe(1);
  });

  it("tier 3 path (getMarketsByAddress) reports active vs resolved", async () => {
    const conn = {
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([
        { owner: programId, data: active.data, lamports: 1, executable: false },
        { owner: programId, data: resolved.data, lamports: 1, executable: false },
      ]),
    } as unknown as Connection;
    const out = await getMarketsByAddress(conn, programId, [active.pubkey, resolved.pubkey]);
    expect(out.map((m) => [m.slabAddress.toBase58(), m.marketMode])).toEqual([
      [active.pubkey.toBase58(), "active"],
      [resolved.pubkey.toBase58(), "resolved"],
    ]);
    // additive: nothing is filtered out by default
    expect(out).toHaveLength(2);
    expect(out.every((m) => m.configV17 !== undefined && m.wrapperVersion === 19)).toBe(true);
  });

  it("tier 1 path (getProgramAccounts, 1940-byte header slice) reports active vs resolved", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const slice = (b: Buffer) => b.subarray(0, 1940);
    const conn = {
      getProgramAccounts: vi.fn().mockResolvedValue([
        { pubkey: active.pubkey, account: { data: slice(active.data), owner: programId, lamports: 1, executable: false } },
        { pubkey: resolved.pubkey, account: { data: slice(resolved.data), owner: programId, lamports: 1, executable: false } },
      ]),
    } as unknown as Connection;
    const out = await discoverMarkets(conn, programId, { maxTierQueries: 0 });
    const byAddr = new Map(out.map((m) => [m.slabAddress.toBase58(), m.marketMode]));
    expect(out).toHaveLength(2);
    expect(byAddr.get(active.pubkey.toBase58())).toBe("active");
    expect(byAddr.get(resolved.pubkey.toBase58())).toBe("resolved");
  });

  it("mode byte 2 decodes as recovery; an unknown byte leaves marketMode undefined", async () => {
    const recovery = Buffer.from(active.data);
    recovery[1266] = 2;
    const junk = Buffer.from(active.data);
    junk[1266] = 7;
    const conn = {
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([
        { owner: programId, data: recovery, lamports: 1, executable: false },
        { owner: programId, data: junk, lamports: 1, executable: false },
      ]),
    } as unknown as Connection;
    const out = await getMarketsByAddress(conn, programId, [active.pubkey, resolved.pubkey]);
    expect(out.map((m) => m.marketMode)).toEqual(["recovery", undefined]);
  });
});
