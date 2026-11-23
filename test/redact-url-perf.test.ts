/**
 * redactUrl perf regression (src/solana/redact-url.ts). The query used to be masked with one
 * `searchParams.set` per hit, and each `set` re-serializes the whole query, so a URL with N masked
 * params cost O(N^2): a 100k-char URL took ~0.95 s in redactUrl and ~2.7-4.5 s in redactUrlError.
 * The one-pass version takes a few ms. The bounds below are loose on purpose (CI noise); the old
 * code misses them by about 5x. Also pins the duplicate-name semantics the one-pass code must keep.
 */
import { describe, it, expect } from "vitest";
import { redactUrl, redactUrlError } from "../src/solana/redact-url.js";

/** ~100k chars of distinct names with 24-char (opaque, so masked) values. */
const N_PARAMS = 3125;
const BIG_URL = `https://h.example/?${Array.from(
  { length: N_PARAMS },
  (_, i) => `p${i.toString().padStart(5, "0")}=${i.toString().padStart(24, "x")}&`,
).join("")}`;

/** Best of 3 runs, in ms, so one GC pause or scheduler hiccup does not fail the test. */
function bestMs(f: () => unknown): number {
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    f();
    best = Math.min(best, performance.now() - t);
  }
  return best;
}

describe("redactUrl: linear in the number of masked query params", () => {
  it("100k-char URL with distinct opaque params: redactUrl under 200 ms", () => {
    expect(BIG_URL.length).toBeGreaterThanOrEqual(100_000);
    const out = redactUrl(BIG_URL);
    // every value masked, every name kept once, in order
    expect(out).toBe(
      `https://h.example/?${Array.from({ length: N_PARAMS }, (_, i) => `p${i.toString().padStart(5, "0")}=***`).join("&")}`,
    );
    expect(bestMs(() => redactUrl(BIG_URL))).toBeLessThan(200);
  });

  it("100k-char URL through redactUrlError (message + cause): under 1000 ms, no secret left", () => {
    const err = new Error(`Failed to fetch ${BIG_URL}`, { cause: new Error(`at ${BIG_URL}`) });
    const out = redactUrlError(err, BIG_URL) as Error;
    expect(out.message).not.toContain("x".repeat(19) + "1");
    expect(out.message).not.toContain(BIG_URL.slice(19, 60));
    expect(bestMs(() => redactUrlError(err, BIG_URL))).toBeLessThan(1000);
  });

  it("10k credential-named params (key=v&...): under 200 ms", () => {
    const url = `https://h.example/?${"key=v&".repeat(10_000)}`;
    expect(redactUrl(url)).toBe("https://h.example/?key=***");
    expect(bestMs(() => redactUrl(url))).toBeLessThan(200);
  });
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
