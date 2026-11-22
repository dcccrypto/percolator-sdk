/**
 * Differential / fuzz test for redactUrl (src/solana/redact-url.ts, #640): a secret embedded in a
 * real provider URL shape must never come back out of redactUrl, raw or percent-decoded.
 *
 * - PROVIDERS: the public, documented endpoint shapes of Solana RPC providers. Every key is fake.
 * - LEAKS: the concrete shapes that leaked on feat/v22-sdk-growth 6625cfea (exact old output quoted).
 * - Fuzz: a seeded generator builds 10k URLs from PROVIDERS with a random secret in the slot.
 *   Seed is printed; override with REDACT_URL_FUZZ_SEED=<uint32> to replay a failure.
 *
 * Masking rule being tested: a value is masked when it sits under a credential-looking query name
 * (any length), or when it is an opaque 20+ char token (path segment or any query value).
 * Below 20 chars in an unnamed slot is a documented limit (see "documented limits"), so the fuzz
 * only puts 20+ char secrets in unnamed slots. Real keys for those providers are 32-64 chars.
 */
import { describe, it, expect } from "vitest";
import { redactUrl } from "../src/solana/redact-url.js";

type Slot = "named" | "path" | "query";
interface Shape {
  provider: string;
  /** Build the URL with `s` (already URL-encoded for its position) in the secret slot. */
  build: (s: string) => string;
  slot: Slot;
}

/** Documented public URL formats. `named` = under a credential query name; others are unnamed. */
const PROVIDERS: Shape[] = [
  { provider: "Helius https", build: (s) => `https://mainnet.helius-rpc.com/?api-key=${s}`, slot: "named" },
  { provider: "Helius wss", build: (s) => `wss://mainnet.helius-rpc.com/?api-key=${s}`, slot: "named" },
  { provider: "Helius devnet", build: (s) => `https://devnet.helius-rpc.com/?api-key=${s}`, slot: "named" },
  { provider: "Shyft", build: (s) => `https://rpc.shyft.to?api_key=${s}`, slot: "named" },
  { provider: "dRPC", build: (s) => `https://lb.drpc.org/ogrpc?network=solana&dkey=${s}`, slot: "named" },
  { provider: "gateway ?x-api-key", build: (s) => `https://solana-mainnet.gateway.example.com/?x-api-key=${s}`, slot: "named" },
  { provider: "generic ?auth", build: (s) => `https://rpc.example.com/solana?auth=${s}`, slot: "named" },
  { provider: "generic ?apikey", build: (s) => `https://rpc.example.com/?apikey=${s}&commitment=confirmed`, slot: "named" },
  { provider: "userinfo password", build: (s) => `https://user:${s}@rpc.example.com/`, slot: "named" },
  { provider: "userinfo token-only", build: (s) => `https://${s}@rpc.example.com/`, slot: "named" },
  { provider: "Alchemy /v2/<key>", build: (s) => `https://solana-mainnet.g.alchemy.com/v2/${s}`, slot: "path" },
  { provider: "Alchemy wss", build: (s) => `wss://solana-mainnet.g.alchemy.com/v2/${s}`, slot: "path" },
  { provider: "QuickNode", build: (s) => `https://my-endpoint.solana-mainnet.quiknode.pro/${s}/`, slot: "path" },
  { provider: "QuickNode wss", build: (s) => `wss://my-endpoint.solana-mainnet.quiknode.pro/${s}/`, slot: "path" },
  { provider: "Triton /<token>", build: (s) => `https://my-endpoint.mainnet.rpcpool.com/${s}`, slot: "path" },
  { provider: "Ankr /solana/<key>", build: (s) => `https://rpc.ankr.com/solana/${s}`, slot: "path" },
  { provider: "Chainstack", build: (s) => `https://solana-mainnet.core.chainstack.com/${s}`, slot: "path" },
  { provider: "GetBlock", build: (s) => `https://go.getblock.io/${s}/`, slot: "path" },
  { provider: "Syndica /api-key/<key>", build: (s) => `https://solana-mainnet.api.syndica.io/api-key/${s}`, slot: "path" },
  { provider: "unnamed ?sig=", build: (s) => `https://rpc.example.com/?cluster=mainnet&sig=${s}`, slot: "query" },
];

// ---------------------------------------------------------------------------------------------
// Seeded generator
// ---------------------------------------------------------------------------------------------

const DEFAULT_SEED = 0x5eed2026;
const SEED = Number(process.env.REDACT_URL_FUZZ_SEED ?? DEFAULT_SEED) >>> 0;
const N = 10_000;

/** mulberry32: tiny deterministic PRNG. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABETS: Record<string, string> = {
  hex: "0123456789abcdef",
  base58: "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz",
  base62: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  base64url: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",
  base64: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
  punct: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!$&'()*+,;=:@~.-_",
};

function makeSecret(r: () => number, minLen: number): { secret: string; kind: string } {
  const kinds = [...Object.keys(ALPHABETS), "uuid"];
  const kind = kinds[Math.floor(r() * kinds.length)];
  const len = minLen + Math.floor(r() * (64 - minLen + 1));
  if (kind === "uuid") {
    const h = () => ALPHABETS.hex[Math.floor(r() * 16)];
    const g = (n: number) => Array.from({ length: n }, h).join("");
    return { secret: `${g(8)}-${g(4)}-${g(4)}-${g(4)}-${g(12)}`, kind };
  }
  const a = ALPHABETS[kind];
  let s = Array.from({ length: len }, () => a[Math.floor(r() * a.length)]).join("");
  if (kind === "base64") s = s.slice(0, Math.max(minLen, s.length - 2)) + "=".repeat(1 + Math.floor(r() * 2));
  return { secret: s, kind };
}

/** How the secret is written into the URL. Raw only where the characters are legal as-is. */
function place(r: () => number, secret: string, slot: Slot): { text: string; enc: string } {
  const rawSafe =
    slot === "path" ? /^[A-Za-z0-9\-._~!$&'()*+,;=:@]+$/.test(secret) : /^[A-Za-z0-9\-._~!$'()*+,:@/]+$/.test(secret);
  if (rawSafe && r() < 0.5) return { text: secret, enc: "raw" };
  return { text: encodeURIComponent(secret), enc: "pct" };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** True if any form of `secret` (raw, percent- or form-encoded) is visible in `out`, raw or decoded. */
function leaks(out: string, secret: string): boolean {
  const views = [out, safeDecode(out), safeDecode(out.replace(/\+/g, "%20"))];
  const forms = [secret, encodeURIComponent(secret), new URLSearchParams({ x: secret }).toString().slice(2), secret.replace(/\+/g, " ")];
  return views.some((v) => forms.some((f) => v.includes(f)));
}

// ---------------------------------------------------------------------------------------------

describe("redactUrl provider table", () => {
  it("has at least 10 documented provider shapes", () => {
    expect(PROVIDERS.length).toBeGreaterThanOrEqual(10);
  });

  it.each(PROVIDERS)("$provider: a realistic fake key is masked", ({ build }) => {
    // 32-char base62: the length/alphabet of Alchemy, QuickNode, Chainstack, Ankr-style keys.
    const key = "Fk3yAAAAbbbbCCCCddddEEEEffff9999";
    const out = redactUrl(build(key));
    expect(out).not.toBe("[unparseable-url]");
    expect(leaks(out, key)).toBe(false);
  });

  it("keeps benign parts readable (host, /v2/, network=solana, commitment)", () => {
    expect(redactUrl("https://solana-mainnet.g.alchemy.com/v2/Fk3yAAAAbbbbCCCCddddEEEEffff9999")).toBe(
      "https://solana-mainnet.g.alchemy.com/v2/***",
    );
    expect(redactUrl("https://lb.drpc.org/ogrpc?network=solana&dkey=Fk3yAAAAbbbbCCCCddddEEEEffff9999")).toBe(
      "https://lb.drpc.org/ogrpc?network=solana&dkey=***",
    );
    expect(redactUrl("https://rpc.example.com/?apikey=Fk3y&commitment=confirmed&cluster=mainnet-beta")).toBe(
      "https://rpc.example.com/?apikey=***&commitment=confirmed&cluster=mainnet-beta",
    );
  });
});

/**
 * Every shape that leaked before the fix. `before` is the exact redactUrl output on base 6625cfea.
 */
const LEAKS: { name: string; url: string; secret: string; before: string }[] = [
  {
    name: "?auth=<short key> (name not in the credential list)",
    url: "https://rpc.example.com/?auth=Sh0rtS3cretKey1",
    secret: "Sh0rtS3cretKey1",
    before: "https://rpc.example.com/?auth=Sh0rtS3cretKey1",
  },
  {
    name: "?x-api-key=<short key> (name not in the credential list)",
    url: "https://rpc.example.com/?x-api-key=Sh0rtS3cretKey1",
    secret: "Sh0rtS3cretKey1",
    before: "https://rpc.example.com/?x-api-key=Sh0rtS3cretKey1",
  },
  {
    name: "dRPC ?dkey=<short key> (name not in the credential list)",
    url: "https://lb.drpc.org/ogrpc?network=solana&dkey=Sh0rtS3cretKey1",
    secret: "Sh0rtS3cretKey1",
    before: "https://lb.drpc.org/ogrpc?network=solana&dkey=Sh0rtS3cretKey1",
  },
  {
    name: "base64 key with + / = in an unnamed query value",
    url: "https://rpc.example.com/?sig=QUJD+REVG/R0hJSktMTU5PUFFSU1RV==",
    secret: "QUJD+REVG/R0hJSktMTU5PUFFSU1RV==",
    before: "https://rpc.example.com/?sig=QUJD+REVG/R0hJSktMTU5PUFFSU1RV==",
  },
  {
    name: "percent-encoded base64 key in an unnamed query value (decoded value has / + =)",
    url: "https://rpc.example.com/?sig=QUJD%2BREVG%2FR0hJSktMTU5PUFFSU1RV%3D%3D",
    secret: "QUJD+REVG/R0hJSktMTU5PUFFSU1RV==",
    before: "https://rpc.example.com/?sig=QUJD%2BREVG%2FR0hJSktMTU5PUFFSU1RV%3D%3D",
  },
  {
    name: "base64 key with + = as a path segment (Triton/QuickNode slot)",
    url: "https://my-endpoint.mainnet.rpcpool.com/QUJD+REVGR0hJSktMTU5PUFFSU1RV==",
    secret: "QUJD+REVGR0hJSktMTU5PUFFSU1RV==",
    before: "https://my-endpoint.mainnet.rpcpool.com/QUJD+REVGR0hJSktMTU5PUFFSU1RV==",
  },
  {
    name: "20+ char key with sub-delims ( : ~ $ & as a path segment (Chainstack slot)",
    url: "https://solana-mainnet.core.chainstack.com/(d:0sZGgg9XGvs~$WPip2&q_VcI",
    secret: "(d:0sZGgg9XGvs~$WPip2&q_VcI",
    before: "https://solana-mainnet.core.chainstack.com/(d:0sZGgg9XGvs~$WPip2&q_VcI",
  },
];

describe("redactUrl: shapes that leaked on the base branch", () => {
  it.each(LEAKS)("$name", ({ url, secret, before }) => {
    const out = redactUrl(url);
    expect(out, `was: ${before}`).not.toBe(before);
    expect(leaks(out, secret)).toBe(false);
  });
});

describe("redactUrl: documented limits (not provider shapes; pinned so a change is deliberate)", () => {
  it("a key under 20 chars in an unnamed path slot is indistinguishable from a path word", () => {
    // Real Alchemy / QuickNode / Triton keys are 32-40+ chars, so this is not a real provider shape.
    expect(redactUrl("https://solana-mainnet.g.alchemy.com/v2/Sh0rtS3cretKey1")).toBe(
      "https://solana-mainnet.g.alchemy.com/v2/Sh0rtS3cretKey1",
    );
  });

  it("userinfo, fragment and non-http schemes never echo the secret", () => {
    expect(redactUrl("wss://user:Sh0rtS3cretKey1@rpc.example.com/")).toBe("wss://rpc.example.com/");
    expect(redactUrl("https://rpc.example.com/#api-key=Sh0rtS3cretKey1")).toBe("https://rpc.example.com/");
    expect(redactUrl("ftp://rpc.example.com/?api-key=Sh0rtS3cretKey1")).toBe("[unparseable-url]");
  });
});

describe(`redactUrl seeded fuzz (${N} URLs, seed ${SEED})`, () => {
  it("never returns the embedded secret, raw or percent-decoded", () => {
    // eslint-disable-next-line no-console
    console.log(`[redact-url-providers] seed=${SEED} (replay: REDACT_URL_FUZZ_SEED=${SEED})`);
    const r = rng(SEED);
    const failures: string[] = [];
    const perShape = new Map<string, number>();
    let generated = 0;
    while (generated < N) {
      const shape = PROVIDERS[Math.floor(r() * PROVIDERS.length)];
      const { secret, kind } = makeSecret(r, shape.slot === "named" ? 8 : 20);
      const { text, enc } = place(r, secret, shape.slot);
      // The template alone must not already contain the secret (else "leak" is meaningless).
      if (leaks(shape.build(""), secret)) continue;
      const url = shape.build(text);
      const out = redactUrl(url);
      generated++;
      perShape.set(shape.provider, (perShape.get(shape.provider) ?? 0) + 1);
      if (out === "[unparseable-url]") continue; // fixed placeholder: nothing echoed
      if (leaks(out, secret) && failures.length < 20) {
        failures.push(`${shape.provider} [${kind}/${enc}] ${url} -> ${out}`);
      }
    }
    expect(generated).toBe(N);
    expect(perShape.size).toBe(PROVIDERS.length);
    expect(failures, `seed=${SEED}\n${failures.join("\n")}`).toEqual([]);
  });
});
