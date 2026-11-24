import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { parseErrorFromLogs } from "../src/abi/errors.js";
import { PROGRAM_IDS } from "../src/config/program-ids.js";

// Counts every Map constructed while installed as the global `Map`. errors.ts resolves `Map`
// from the global scope at call time, so this sees each program-id map parseErrorFromLogs builds.
let built = 0;
class CountingMap<K, V> extends Map<K, V> {
  constructor(entries?: Iterable<readonly [K, V]> | null) {
    super(entries);
    built++;
  }
}

function countMapsBuilt(fn: () => void): number {
  built = 0;
  vi.stubGlobal("Map", CountingMap);
  try {
    fn();
  } finally {
    vi.unstubAllGlobals();
  }
  return built;
}

afterEach(() => vi.unstubAllGlobals());

const WRAPPER = String(PROGRAM_IDS.devnet.percolator);
// Not a built-in id (the System program id is built in since it got its own error table).
const OTHER = "Unknown111111111111111111111111111111111111";
const wrapperLogs = [`Program ${WRAPPER} failed: custom program error: 0x13`];

describe("parseErrorFromLogs program-id map cache", () => {
  // Fill the built-in cache outside any counting window so each test is order-independent.
  beforeAll(() => {
    parseErrorFromLogs(wrapperLogs);
  });

  it("builds the built-in program-id map at most once across many calls", () => {
    const expected = parseErrorFromLogs(wrapperLogs); // cache already warmed in beforeAll
    expect(expected?.program).toBe("wrapper");

    const results: unknown[] = [];
    const maps = countMapsBuilt(() => {
      for (let i = 0; i < 500; i++) {
        results.push(parseErrorFromLogs(wrapperLogs));
        results.push(parseErrorFromLogs(wrapperLogs, {}));
        results.push(parseErrorFromLogs(wrapperLogs, { context: { action: "trade" } }));
      }
    });

    // Before the cache this was 1500 (one fresh map per call); now the built-in map is reused.
    expect(maps).toBe(0);
    for (const r of results) expect(r).toStrictEqual(expected);
  });

  it("does not build a map for logs without a custom program error", () => {
    const maps = countMapsBuilt(() => {
      for (let i = 0; i < 100; i++) parseErrorFromLogs(["Program log: Instruction: Trade"]);
    });
    expect(maps).toBe(0);
  });

  it("caller-supplied ids are never cached: each call copies the map and sees the caller's current ids", () => {
    const line = [`Program ${OTHER} failed: custom program error: 0x13`];
    const wrapper: string[] = [OTHER];
    const programIds = { wrapper };

    const programs: (string | undefined)[] = [];
    const maps = countMapsBuilt(() => {
      for (let i = 0; i < 50; i++) programs.push(parseErrorFromLogs(line, { programIds })?.program);
    });
    // Assert only after the global Map is restored, so the count cannot depend on matcher internals.
    expect(maps).toBe(50);
    expect(programs).toEqual(Array(50).fill("wrapper"));

    // Mutating the caller's object must take effect on the next call (no stale cache).
    wrapper.length = 0;
    expect(parseErrorFromLogs(line, { programIds })?.program).toBe("unknown");
    // And the extras from earlier calls never leaked into the shared built-in map.
    expect(parseErrorFromLogs(line)?.program).toBe("unknown");
    expect(parseErrorFromLogs(wrapperLogs)?.program).toBe("wrapper");
  });
});
