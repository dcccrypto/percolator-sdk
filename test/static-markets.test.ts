import { describe, it, expect, beforeEach } from "vitest";
import {
  getStaticMarkets,
  registerStaticMarkets,
  clearStaticMarkets,
  type StaticMarketEntry,
} from "../src/solana/static-markets.js";

describe("static-markets", () => {
  beforeEach(() => {
    clearStaticMarkets();
  });

  describe("getStaticMarkets", () => {
    it("returns empty array for mainnet when no entries are registered", () => {
      const result = getStaticMarkets("mainnet");
      expect(result).toEqual([]);
    });

    it("returns empty array for devnet when no entries are registered", () => {
      const result = getStaticMarkets("devnet");
      expect(result).toEqual([]);
    });

    it("returns a copy (not a reference to internal state)", () => {
      registerStaticMarkets("mainnet", [
        { slabAddress: "ABC111111111111111111111111111111111111111111" },
      ]);
      const a = getStaticMarkets("mainnet");
      const b = getStaticMarkets("mainnet");
      expect(a).toEqual(b);
      expect(a).not.toBe(b); // different array references
    });
  });

  describe("registerStaticMarkets", () => {
    it("registers entries and retrieves them", () => {
      const entries: StaticMarketEntry[] = [
        { slabAddress: "ABC111111111111111111111111111111111111111111", symbol: "SOL-PERP" },
        { slabAddress: "DEF222222222222222222222222222222222222222222", symbol: "ETH-PERP" },
      ];
      registerStaticMarkets("mainnet", entries);

      const result = getStaticMarkets("mainnet");
      expect(result).toHaveLength(2);
      expect(result[0].slabAddress).toBe("ABC111111111111111111111111111111111111111111");
      expect(result[0].symbol).toBe("SOL-PERP");
      expect(result[1].slabAddress).toBe("DEF222222222222222222222222222222222222222222");
    });

    it("does not cross-contaminate networks", () => {
      registerStaticMarkets("mainnet", [
        { slabAddress: "ABC111111111111111111111111111111111111111111" },
      ]);
      registerStaticMarkets("devnet", [
        { slabAddress: "DEF222222222222222222222222222222222222222222" },
      ]);

      expect(getStaticMarkets("mainnet")).toHaveLength(1);
      expect(getStaticMarkets("mainnet")[0].slabAddress).toBe(
        "ABC111111111111111111111111111111111111111111",
      );
      expect(getStaticMarkets("devnet")).toHaveLength(1);
      expect(getStaticMarkets("devnet")[0].slabAddress).toBe(
        "DEF222222222222222222222222222222222222222222",
      );
    });

    it("deduplicates by slabAddress", () => {
      registerStaticMarkets("mainnet", [
        { slabAddress: "ABC111111111111111111111111111111111111111111", symbol: "SOL-PERP" },
        { slabAddress: "ABC111111111111111111111111111111111111111111", symbol: "SOL-PERP-DUP" },
      ]);

      const result = getStaticMarkets("mainnet");
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe("SOL-PERP"); // first one wins
    });

    it("deduplicates across multiple register calls", () => {
      registerStaticMarkets("mainnet", [
        { slabAddress: "ABC111111111111111111111111111111111111111111", symbol: "v1" },
      ]);
      registerStaticMarkets("mainnet", [
        { slabAddress: "ABC111111111111111111111111111111111111111111", symbol: "v2" },
      ]);

      const result = getStaticMarkets("mainnet");
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe("v1"); // first registration wins
    });

    it("skips entries with empty slabAddress", () => {
      registerStaticMarkets("mainnet", [
        { slabAddress: "", symbol: "EMPTY" },
        { slabAddress: "ABC111111111111111111111111111111111111111111", symbol: "VALID" },
      ]);

      const result = getStaticMarkets("mainnet");
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe("VALID");
    });
  });

  describe("clearStaticMarkets", () => {
    it("clears entries for a specific network", () => {
      registerStaticMarkets("mainnet", [
        { slabAddress: "ABC111111111111111111111111111111111111111111" },
      ]);
      registerStaticMarkets("devnet", [
        { slabAddress: "DEF222222222222222222222222222222222222222222" },
      ]);

      clearStaticMarkets("mainnet");

      expect(getStaticMarkets("mainnet")).toHaveLength(0);
      expect(getStaticMarkets("devnet")).toHaveLength(1);
    });

    it("clears all networks when no argument", () => {
      registerStaticMarkets("mainnet", [
        { slabAddress: "ABC111111111111111111111111111111111111111111" },
      ]);
      registerStaticMarkets("devnet", [
        { slabAddress: "DEF222222222222222222222222222222222222222222" },
      ]);

      clearStaticMarkets();

      expect(getStaticMarkets("mainnet")).toHaveLength(0);
      expect(getStaticMarkets("devnet")).toHaveLength(0);
    });
  });
});
