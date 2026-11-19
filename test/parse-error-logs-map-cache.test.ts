import { describe, it, expect, vi, afterEach } from "vitest";
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
const OTHER = "11111111111111111111111111111111";
const wrapperLogs = [`Program ${WRAPPER} failed: custom program error: 0x13`];

describe("parseErrorFromLogs program-id map cache", () => {
  it("builds the built-in program-id map at most once across many calls", () => {
    const expected = parseErrorFromLogs(wrapperLogs); // first call may build the cache
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

    const maps = countMapsBuilt(() => {
      for (let i = 0; i < 50; i++) expect(parseErrorFromLogs(line, { programIds })?.program).toBe("wrapper");
    });
    expect(maps).toBe(50);

    // Mutating the caller's object must take effect on the next call (no stale cache).
    wrapper.length = 0;
    expect(parseErrorFromLogs(line, { programIds })?.program).toBe("unknown");
    // And the extras from earlier calls never leaked into the shared built-in map.
    expect(parseErrorFromLogs(line)?.program).toBe("unknown");
    expect(parseErrorFromLogs(wrapperLogs)?.program).toBe("wrapper");
  });
});
