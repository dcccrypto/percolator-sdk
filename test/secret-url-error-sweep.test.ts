/**
 * Sweep (J-20261123-SDK-REPORT-SECRETURLERRORSWEEP): every src/ path that builds an error, log line
 * or returned diagnostic from an endpoint, fetch URL or RPC response, driven with a fake secret URL.
 * SECRET123 must not show up in err.message, err.stack or anywhere in the err.cause chain.
 *
 * URL forms:
 *   Q  `https://x.example/?api-key=SECRET123`            (the goal's form; Helius-style)
 *   P  `https://x.example/v2/SECRET123abcdefghijklmnop`  (path token, Alchemy-style, 20+ chars)
 *   U  `https://user:SECRET123@x.example/`               (userinfo; redactUrl strips it)
 *   M  `https://x .example/?api-key=SECRET123`           (malformed: a typo'd config value)
 *
 * Node's fetch (undici) rejects U and M with a TypeError whose message repeats the raw URL:
 * "Request cannot be constructed from a URL that includes credentials: <url>" and
 * "Failed to parse URL from <url>". Q and P only give "fetch failed" (cause: ENOTFOUND <host>).
 * The fetch stub below runs `new Request(url)` first, so U/M errors are Node's real ones.
 * No network: the stub never connects.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { Connection, PublicKey } from "@solana/web3.js";
import { discoverMarkets, discoverMarketsViaApi } from "../src/solana/discovery.js";
import { fetchAdlRankings } from "../src/solana/adl.js";
import { checkRpcHealth, RpcPool } from "../src/solana/rpc-pool.js";
import { simulateV1 } from "../src/runtime/txv1.js";

const SECRET = "SECRET123";
const FORMS = {
  Q: `https://x.example/?api-key=${SECRET}`,
  P: `https://x.example/v2/${SECRET}abcdefghijklmnop`,
  U: `https://user:${SECRET}@x.example/`,
  M: `https://x .example/?api-key=${SECRET}`,
} as const;
type Form = keyof typeof FORMS;
const SLAB = new PublicKey("11111111111111111111111111111112");

/** Everything an error reporter (Sentry, console) can see: message, stack, own props, cause chain. */
function errorText(e: unknown, depth = 0): string {
  if (depth > 6 || e === undefined || e === null) return "";
  if (!(e instanceof Error)) return typeof e === "string" ? e : JSON.stringify(e) ?? String(e);
  const own = Object.getOwnPropertyNames(e)
    .filter((k) => k !== "cause" && k !== "stack" && k !== "message")
    .map((k) => `${k}=${String((e as unknown as Record<string, unknown>)[k])}`)
    .join(" ");
  return `${e.message}\n${e.stack ?? ""}\n${own}\n${errorText((e as { cause?: unknown }).cause, depth + 1)}`;
}

/** A stand-in for global fetch: Node's own URL/credential validation, then a DNS-style failure. */
const failingFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  new Request(input, init); // throws Node's real TypeError for U / M
  const cause = Object.assign(new Error("getaddrinfo ENOTFOUND x.example"), { code: "ENOTFOUND", hostname: "x.example" });
  throw new TypeError("fetch failed", { cause });
}) as unknown as typeof fetch;

/** An upstream that answers 404 and echoes the request path, like Express's "Cannot GET <path>". */
const echo404Fetch = vi.fn(async (input: string | URL | Request) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const at = raw.indexOf("/", raw.indexOf("//") + 2);
  return new Response(`Cannot GET ${at >= 0 ? raw.slice(at) : "/"}`, { status: 404, statusText: "Not Found" });
}) as unknown as typeof fetch;

/** An RPC that answers a JSON-RPC error which echoes the endpoint it was reached on. */
const rpcEchoFetch = vi.fn(async (input: string | URL | Request) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: `bad request to ${raw}` } }), { status: 200 });
}) as unknown as typeof fetch;

async function settle(p: Promise<unknown>): Promise<unknown> {
  return p.then((v) => v, (e: unknown) => e);
}

/** A Connection whose transport is never used (raw-fetch paths read only `rpcEndpoint`). */
function connFor(url: string): Connection {
  try {
    return new Connection(url);
  } catch {
    return { rpcEndpoint: url } as unknown as Connection;
  }
}

interface PathCase {
  id: string;
  /** Returns everything the caller / a logger sees for this path. */
  run: (url: string) => Promise<string>;
}

const PATHS: PathCase[] = [
  {
    id: "checkRpcHealth fetch reject (rpc-pool.ts:265-270 .error)",
    run: async (u) => {
      vi.stubGlobal("fetch", failingFetch);
      return JSON.stringify(await checkRpcHealth(u, 500));
    },
  },
  {
    id: "checkRpcHealth HTTP status (rpc-pool.ts:249-250)",
    run: async (u) => {
      vi.stubGlobal("fetch", echo404Fetch);
      return JSON.stringify(await checkRpcHealth(u, 500));
    },
  },
  {
    id: "checkRpcHealth RPC error echo (rpc-pool.ts:252-259 json.error.message)",
    run: async (u) => {
      vi.stubGlobal("fetch", rpcEchoFetch);
      return JSON.stringify(await checkRpcHealth(u, 500));
    },
  },
  {
    id: "discoverMarketsViaApi fetch reject (discovery.ts:1203 unwrapped)",
    run: async (u) => {
      vi.stubGlobal("fetch", failingFetch);
      return errorText(await settle(discoverMarketsViaApi(connFor("http://127.0.0.1:1"), SLAB, u)));
    },
  },
  {
    id: "discoverMarketsViaApi HTTP status (discovery.ts:1212-1214)",
    run: async (u) => {
      vi.stubGlobal("fetch", echo404Fetch);
      return errorText(await settle(discoverMarketsViaApi(connFor("http://127.0.0.1:1"), SLAB, u)));
    },
  },
  {
    id: "discoverMarkets API-fallback console.warn (discovery.ts:806-810)",
    run: async (u) => {
      vi.stubGlobal("fetch", failingFetch);
      const warns: unknown[][] = [];
      const spy = vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => void warns.push(a));
      const conn = { rpcEndpoint: "http://127.0.0.1:1", getProgramAccounts: async () => [], getMultipleAccountsInfo: async () => [] } as unknown as Connection;
      try {
        await settle(discoverMarkets(conn, SLAB, { apiBaseUrl: u, interTierDelayMs: 0, rateLimitBackoffMs: [] }));
      } finally {
        spy.mockRestore();
      }
      return warns.map((a) => a.map((x) => errorText(x)).join(" ")).join("\n");
    },
  },
  {
    id: "fetchAdlRankings fetchFn reject (adl.ts:629)",
    run: async (u) => errorText(await settle(fetchAdlRankings(u, SLAB, failingFetch))),
  },
  {
    id: "fetchAdlRankings HTTP body echo (adl.ts:630-637)",
    run: async (u) => errorText(await settle(fetchAdlRankings(u, SLAB, echo404Fetch))),
  },
  {
    id: "simulateV1 raw fetch reject (txv1.ts:817 fetch(connection.rpcEndpoint))",
    run: async (u) => errorText(await settle(simulateV1(connFor(u), new Uint8Array(8), { fetchImpl: failingFetch }))),
  },
  {
    id: "simulateV1 RPC error echo (txv1.ts:824 V1RpcError)",
    run: async (u) => errorText(await settle(simulateV1(connFor(u), new Uint8Array(8), { fetchImpl: rpcEchoFetch }))),
  },
  {
    id: "RpcPool.status()/label (rpc-pool.ts:305-311, 748-750)",
    run: async (u) => {
      const pool = new RpcPool({ endpoints: [u], retry: false });
      return JSON.stringify(pool.status());
    },
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Leaks left on purpose: their fix belongs in files open PRs #638/#650/#655 own (see PR body). */
const KNOWN_UNFIXED = new Set([
  "checkRpcHealth fetch reject (rpc-pool.ts:265-270 .error) :: U",
  "checkRpcHealth fetch reject (rpc-pool.ts:265-270 .error) :: M",
  "checkRpcHealth RPC error echo (rpc-pool.ts:252-259 json.error.message) :: Q",
  "checkRpcHealth RPC error echo (rpc-pool.ts:252-259 json.error.message) :: P",
  "checkRpcHealth RPC error echo (rpc-pool.ts:252-259 json.error.message) :: U",
  "checkRpcHealth RPC error echo (rpc-pool.ts:252-259 json.error.message) :: M",
  "discoverMarketsViaApi fetch reject (discovery.ts:1203 unwrapped) :: U",
  "discoverMarketsViaApi fetch reject (discovery.ts:1203 unwrapped) :: M",
  "discoverMarkets API-fallback console.warn (discovery.ts:806-810) :: U",
  "discoverMarkets API-fallback console.warn (discovery.ts:806-810) :: M",
  "simulateV1 raw fetch reject (txv1.ts:817 fetch(connection.rpcEndpoint)) :: U",
  "simulateV1 raw fetch reject (txv1.ts:817 fetch(connection.rpcEndpoint)) :: M",
  "simulateV1 RPC error echo (txv1.ts:824 V1RpcError) :: Q",
  "simulateV1 RPC error echo (txv1.ts:824 V1RpcError) :: P",
  "simulateV1 RPC error echo (txv1.ts:824 V1RpcError) :: U",
  "simulateV1 RPC error echo (txv1.ts:824 V1RpcError) :: M",
]);

describe("secret URL error sweep", () => {
  it("records every path x form; fetchAdlRankings never leaks; the rest match the known-unfixed list", async () => {
    const rows: string[] = [];
    const leaks: string[] = [];
    for (const p of PATHS) {
      for (const f of Object.keys(FORMS) as Form[]) {
        const seen = await p.run(FORMS[f]);
        const leaked = seen.includes(SECRET);
        rows.push(`${leaked ? "LEAK" : "ok  "} ${p.id} :: ${f}`);
        if (leaked) leaks.push(`${p.id} :: ${f}`);
      }
    }
    console.log(rows.join("\n"));
    expect(leaks.filter((l) => l.startsWith("fetchAdlRankings"))).toEqual([]);
    expect(leaks.filter((l) => !KNOWN_UNFIXED.has(l))).toEqual([]);
    expect([...KNOWN_UNFIXED].filter((k) => !leaks.includes(k))).toEqual([]);
  });
});
