import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getStaticMarkets,
  registerStaticMarkets,
  clearStaticMarkets,
  type StaticMarketEntry,
} from "../src/solana/static-markets.js";

const A = "7psyeWRts4pRX2cyAWD1NH87bR9ugXP7pe6ARgfG79Do";
const B = "11111111111111111111111111111111";

describe("static-markets aliasing (characterisation)", () => {
  beforeEach(() => clearStaticMarkets());

  it("lead 1: getStaticMarkets returns shared entry objects (builtin)", () => {
    const first = getStaticMarkets("mainnet");
    first[0].symbol = "MUTATED";
    expect(getStaticMarkets("mainnet")[0].symbol).toBe("MUTATED");
    first[0].symbol = "SOL-PERP"; // restore for other tests
  });

  it("lead 2: registered entry is held by reference", () => {
    const input: StaticMarketEntry = { slabAddress: B, symbol: "X" };
    registerStaticMarkets("devnet", [input]);
    input.symbol = "CHANGED";
    expect(getStaticMarkets("devnet")[0].symbol).toBe("CHANGED");
  });

  it("lead 3: whitespace-padded address is rejected (not normalised)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerStaticMarkets("devnet", [{ slabAddress: ` ${B} ` }]);
    expect(getStaticMarkets("devnet")).toHaveLength(0);
    warn.mockRestore();
  });

  it("lead 2b: mutating slabAddress after register bypasses validation/dedupe", () => {
    const input: StaticMarketEntry = { slabAddress: B };
    registerStaticMarkets("devnet", [input]);
    input.slabAddress = "not-a-key";
    expect(getStaticMarkets("devnet")[0].slabAddress).toBe("not-a-key");
  });
});
