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
        { slabAddress: "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd" },
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
        { slabAddress: "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd", symbol: "SOL-PERP" },
        { slabAddress: "J5GZs2NiS5Ne4eABr78EvjG8heQbkUyUykFxKu6arwSD", symbol: "ETH-PERP" },
      ];
      registerStaticMarkets("mainnet", entries);

      const result = getStaticMarkets("mainnet");
      expect(result).toHaveLength(2);
      expect(result[0].slabAddress).toBe("5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd");
      expect(result[0].symbol).toBe("SOL-PERP");
      expect(result[1].slabAddress).toBe("J5GZs2NiS5Ne4eABr78EvjG8heQbkUyUykFxKu6arwSD");
    });

    it("does not cross-contaminate networks", () => {
      registerStaticMarkets("mainnet", [
        { slabAddress: "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd" },
      ]);
      registerStaticMarkets("devnet", [
        { slabAddress: "J5GZs2NiS5Ne4eABr78EvjG8heQbkUyUykFxKu6arwSD" },
      ]);

      expect(getStaticMarkets("mainnet")).toHaveLength(1);
      expect(getStaticMarkets("mainnet")[0].slabAddress).toBe(
        "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd",
      );
      expect(getStaticMarkets("devnet")).toHaveLength(1);
      expect(getStaticMarkets("devnet")[0].slabAddress).toBe(
        "J5GZs2NiS5Ne4eABr78EvjG8heQbkUyUykFxKu6arwSD",
      );
    });

    it("deduplicates by slabAddress", () => {
      registerStaticMarkets("mainnet", [
        { slabAddress: "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd", symbol: "SOL-PERP" },
        { slabAddress: "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd", symbol: "SOL-PERP-DUP" },
      ]);

      const result = getStaticMarkets("mainnet");
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe("SOL-PERP"); // first one wins
    });

    it("deduplicates across multiple register calls", () => {
      registerStaticMarkets("mainnet", [
        { slabAddress: "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd", symbol: "v1" },
      ]);
      registerStaticMarkets("mainnet", [
        { slabAddress: "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd", symbol: "v2" },
      ]);

      const result = getStaticMarkets("mainnet");
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe("v1"); // first registration wins
    });

    it("skips entries with empty slabAddress", () => {
      registerStaticMarkets("mainnet", [
        { slabAddress: "", symbol: "EMPTY" },
        { slabAddress: "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd", symbol: "VALID" },
      ]);

      const result = getStaticMarkets("mainnet");
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe("VALID");
    });
  });

  describe("clearStaticMarkets", () => {
    it("clears entries for a specific network", () => {
      registerStaticMarkets("mainnet", [
        { slabAddress: "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd" },
      ]);
      registerStaticMarkets("devnet", [
        { slabAddress: "J5GZs2NiS5Ne4eABr78EvjG8heQbkUyUykFxKu6arwSD" },
      ]);

      clearStaticMarkets("mainnet");

      expect(getStaticMarkets("mainnet")).toHaveLength(0);
      expect(getStaticMarkets("devnet")).toHaveLength(1);
    });

    it("clears all networks when no argument", () => {
      registerStaticMarkets("mainnet", [
        { slabAddress: "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd" },
      ]);
      registerStaticMarkets("devnet", [
        { slabAddress: "J5GZs2NiS5Ne4eABr78EvjG8heQbkUyUykFxKu6arwSD" },
      ]);

      clearStaticMarkets();

      expect(getStaticMarkets("mainnet")).toHaveLength(0);
      expect(getStaticMarkets("devnet")).toHaveLength(0);
    });
  });
});
