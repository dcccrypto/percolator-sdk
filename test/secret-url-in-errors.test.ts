/**
 * Regression: API keys carried in a URL must not appear in SDK error messages or returned
 * diagnostics. discoverMarketsViaApi, fetchAdlRankings and checkRpcHealth now use the shared
 * redactUrl (src/solana/redact-url.ts), like RpcPool.status()/healthCheck() already did.
 * Fake key only; fetch is stubbed, no network.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { Connection, PublicKey } from "@solana/web3.js";
import { discoverMarketsViaApi } from "../src/solana/discovery.js";
import { fetchAdlRankings } from "../src/solana/adl.js";
import { checkRpcHealth } from "../src/solana/rpc-pool.js";

const KEY = "FAKEKEY123";
const BASE = `https://api.example.invalid/?api-key=${KEY}`;
const SLAB = new PublicKey("11111111111111111111111111111112");

const statusResponse = (status: number) =>
  new Response("Internal Server Error", { status, statusText: status === 429 ? "Too Many Requests" : "Internal Server Error" });

afterEach(() => vi.unstubAllGlobals());

describe("secret URL must not leak into errors", () => {
  for (const status of [429, 500]) {
    it(`discoverMarketsViaApi: HTTP ${status} error message does not contain the api key`, async () => {
      vi.stubGlobal("fetch", vi.fn(async () => statusResponse(status)));
      const conn = new Connection("http://127.0.0.1:1");
      const err = await discoverMarketsViaApi(conn, SLAB, BASE).then(() => null, (e: unknown) => e as Error);
      expect(err).toBeInstanceOf(Error);
      expect(err!.message).toContain(String(status)); // still useful
      expect(err!.message).not.toContain(KEY); // src/solana/discovery.ts:1213
    });

    it(`fetchAdlRankings: HTTP ${status} error message does not contain the api key`, async () => {
      const f = vi.fn(async () => statusResponse(status)) as unknown as typeof fetch;
      const err = await fetchAdlRankings(BASE, SLAB, f).then(() => null, (e: unknown) => e as Error);
      expect(err).toBeInstanceOf(Error);
      expect(err!.message).toContain(String(status));
      expect(err!.message).not.toContain(KEY); // src/solana/adl.ts:630
    });
  }

  it("checkRpcHealth: returned endpoint is redacted like RpcPool.healthCheck()", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => statusResponse(500)));
    const r = await checkRpcHealth(`https://rpc.example.invalid/?api-key=${KEY}`, 500);
    expect(r.healthy).toBe(false);
    expect(JSON.stringify(r)).not.toContain(KEY); // src/solana/rpc-pool.ts:247/252/259/263
  });

  it("fetchAdlRankings: error body is capped so an echoed URL cannot leak through it", async () => {
    const echoed = `${"x".repeat(300)} upstream=${BASE}`;
    const f = vi.fn(async () => new Response(echoed, { status: 502 })) as unknown as typeof fetch;
    const err = await fetchAdlRankings(BASE, SLAB, f).then(() => null, (e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain("HTTP 502");
    expect(err!.message).toContain("x".repeat(200));
    expect(err!.message).not.toContain(KEY);
    expect(err!.message.length).toBeLessThan(400);
  });
});
