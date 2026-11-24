/**
 * redactUrl perf regression (src/solana/redact-url.ts). The query used to be masked with one
 * `searchParams.set` per hit, and each `set` re-serializes the whole query, so a URL with N masked
 * params cost O(N^2): a 100k-char URL took ~0.95 s in redactUrl and ~2.7-4.5 s in redactUrlError.
 * The one-pass version takes a few ms. Also pins the duplicate-name semantics the one-pass code
 * must keep.
 *
 * No wall-clock limit: under `vitest --coverage` on a loaded box the linear code took 1.1-1.2 s for
 * what takes 33 ms idle, so a fixed 1000 ms bound flaked. Instead each test times one call on an
 * input SCALE times bigger against SCALE calls on the small input, in the same run, interleaved,
 * median of ROUNDS. Load and coverage slow both sides alike. Linear code gives ~1-1.5; the old
 * quadratic code gives ~SCALE (8), so the bound of 3 has room on both sides. (The key=v case was
 * never quadratic in the old code; it is a generic linear-scaling check, not that regression's guard.)
 */
import { describe, it, expect } from "vitest";
import { redactUrl, redactUrlError } from "../src/solana/redact-url.js";

const SCALE = 8;
const ROUNDS = 5;
const MAX_RATIO = 3;
/** ~13 big-input calls of work per test: under coverage + load that can pass vitest's 5 s default. */
const PERF_TIMEOUT_MS = 60_000;

/** n distinct names with 24-char (opaque, so masked) values. */
const distinctUrl = (n: number) =>
  `https://h.example/?${Array.from(
    { length: n },
    (_, i) => `p${i.toString().padStart(5, "0")}=${i.toString().padStart(24, "x")}&`,
  ).join("")}`;

/** ~100k chars. */
const N_PARAMS = 3200;
const BIG_URL = distinctUrl(N_PARAMS);
const SMALL_URL = distinctUrl(N_PARAMS / SCALE);

/**
 * time(f(big)) / time(SCALE x f(small)), median of ROUNDS interleaved pairs after one warm-up of
 * each. Both sides do the same work if f is linear, so the ratio is ~1 whatever the load.
 */
function scalingRatio<T>(f: (x: T) => unknown, small: T, big: T): number {
  f(small);
  f(big);
  const ratios: number[] = [];
  for (let r = 0; r < ROUNDS; r++) {
    let t = performance.now();
    for (let i = 0; i < SCALE; i++) f(small);
    const smallMs = performance.now() - t;
    t = performance.now();
    f(big);
    ratios.push((performance.now() - t) / smallMs);
  }
  ratios.sort((a, b) => a - b);
  return ratios[ROUNDS >> 1];
}

const errFor = (url: string) => new Error(`Failed to fetch ${url}`, { cause: new Error(`at ${url}`) });

describe("redactUrl: linear in the number of masked query params", () => {
  it("100k-char URL with distinct opaque params: redactUrl scales linearly", () => {
    expect(BIG_URL.length).toBeGreaterThanOrEqual(100_000);
    const out = redactUrl(BIG_URL);
    // every value masked, every name kept once, in order
    expect(out).toBe(
      `https://h.example/?${Array.from({ length: N_PARAMS }, (_, i) => `p${i.toString().padStart(5, "0")}=***`).join("&")}`,
    );
    expect(scalingRatio(redactUrl, SMALL_URL, BIG_URL)).toBeLessThan(MAX_RATIO);
  }, PERF_TIMEOUT_MS);

  it("100k-char URL through redactUrlError (message + cause): scales linearly, no secret left", () => {
    const err = errFor(BIG_URL);
    const out = redactUrlError(err, BIG_URL) as Error;
    expect(out.message).not.toContain("x".repeat(19) + "1");
    expect(out.message).not.toContain(BIG_URL.slice(19, 60));
    const run = ([e, u]: [Error, string]) => redactUrlError(e, u);
    expect(scalingRatio(run, [errFor(SMALL_URL), SMALL_URL], [err, BIG_URL])).toBeLessThan(MAX_RATIO);
  }, PERF_TIMEOUT_MS);

  it("10k credential-named params (key=v&...): scales linearly", () => {
    const keyUrl = (n: number) => `https://h.example/?${"key=v&".repeat(n)}`;
    const url = keyUrl(10_000);
    expect(redactUrl(url)).toBe("https://h.example/?key=***");
    expect(scalingRatio(redactUrl, keyUrl(10_000 / SCALE), url)).toBeLessThan(MAX_RATIO);
  }, PERF_TIMEOUT_MS);
});

describe("redactUrl: duplicate-name semantics kept by the one-pass mask", () => {
  it("a name with any hit collapses to one name=*** at its first position", () => {
    const opaque = "z".repeat(20);
    expect(redactUrl(`https://h.example/?a=1&b=2&a=${opaque}&c=3&a=4`)).toBe("https://h.example/?a=***&b=2&c=3");
    expect(redactUrl("https://h.example/?x=1&API_KEY=s1&y=2&api_key=s2")).toBe(
      "https://h.example/?x=1&API_KEY=***&y=2&api_key=***",
    );
  });

  it("non-hit duplicates are left as they were", () => {
    expect(redactUrl("https://h.example/?a=1&a=2&b=3")).toBe("https://h.example/?a=1&a=2&b=3");
  });

  it("nothing masked: the query is not re-serialized", () => {
    // URLSearchParams would turn %20 into + and ~ into %7E; an untouched query keeps its spelling.
    expect(redactUrl("https://h.example/?a=%20x&b=~q")).toBe("https://h.example/?a=%20x&b=~q");
  });

  it("masked query is re-serialized form-encoded, as the old per-hit set did", () => {
    expect(redactUrl("https://h.example/?a=%20x&key=s")).toBe("https://h.example/?a=+x&key=***");
  });
});
