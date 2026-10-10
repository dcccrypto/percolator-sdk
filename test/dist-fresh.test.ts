/**
 * K-5 (2026-10-10): the TRACKED dist/ must match src/. A git pin (`github:dcccrypto/percolator-sdk#<sha>`) installs the
 * committed dist as-is (package.json has no prepare/build step), so a stale dist ships stale code: at e8c4421 the
 * committed dist lacked the stake floor helpers (stakeRealLpSupply, ...) that src exported.
 */
import { describe, expect, it } from "vitest";
import * as src from "../src/index.js";
import * as dist from "../dist/index.js";

describe("tracked dist/ is not stale", () => {
  it("dist exports exactly the runtime names src exports", () => {
    const s = Object.keys(src).sort();
    const d = Object.keys(dist).sort();
    expect(d.filter((k) => !s.includes(k))).toEqual([]);
    expect(s.filter((k) => !d.includes(k))).toEqual([]);
  });
  it("the stake floor helpers and the NFT override resolver are in dist", () => {
    for (const k of ["stakeRealLpSupply", "stakeHasRealLpHolders", "decodeStakePoolV5", "lotExpOfMarketV22", "resolveNftProgramOverride"]) {
      expect(typeof (dist as Record<string, unknown>)[k], k).toBe("function");
    }
  });
});
