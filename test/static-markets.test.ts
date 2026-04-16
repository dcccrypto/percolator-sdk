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
    it("returns only built-in entries for mainnet when no user entries are registered", () => {
      const result = getStaticMarkets("mainnet");
      // Built-in MAINNET_MARKETS has one entry (SOL-PERP)
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result.some(e => e.symbol === "SOL-PERP")).toBe(true);
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
      // Built-in mainnet entries + user entries (deduped by slabAddress)
      const userAddrs = entries.map(e => e.slabAddress);
      for (const addr of userAddrs) {
        expect(result.some(e => e.slabAddress === addr)).toBe(true);
      }
      expect(result.some(e => e.slabAddress === "J5GZs2NiS5Ne4eABr78EvjG8heQbkUyUykFxKu6arwSD")).toBe(true);
    });

    it("does not cross-contaminate networks", () => {
      registerStaticMarkets("mainnet", [
        { slabAddress: "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd" },
      ]);
      registerStaticMarkets("devnet", [
        { slabAddress: "J5GZs2NiS5Ne4eABr78EvjG8heQbkUyUykFxKu6arwSD" },
      ]);

      const mainnet = getStaticMarkets("mainnet");
      const devnet = getStaticMarkets("devnet");
      // Mainnet has built-in entries + the user entry
      expect(mainnet.some(e => e.slabAddress === "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd")).toBe(true);
      // Devnet has only the user entry (no built-in devnet entries)
      expect(devnet).toHaveLength(1);
      expect(devnet[0].slabAddress).toBe(
        "J5GZs2NiS5Ne4eABr78EvjG8heQbkUyUykFxKu6arwSD",
      );
      // No cross-contamination: devnet entry not in mainnet, mainnet user entry not in devnet
      expect(mainnet.some(e => e.slabAddress === "J5GZs2NiS5Ne4eABr78EvjG8heQbkUyUykFxKu6arwSD")).toBe(false);
      expect(devnet.some(e => e.slabAddress === "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd")).toBe(false);
    });

    it("deduplicates by slabAddress", () => {
      registerStaticMarkets("mainnet", [
        { slabAddress: "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd", symbol: "SOL-PERP" },
        { slabAddress: "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd", symbol: "SOL-PERP-DUP" },
      ]);

      const result = getStaticMarkets("mainnet");
      // Only one entry with this address (built-in entries + 1 user entry, deduped)
      const matching = result.filter(e => e.slabAddress === "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd");
      expect(matching).toHaveLength(1);
      expect(matching[0].symbol).toBe("SOL-PERP"); // first one wins
    });

    it("deduplicates across multiple register calls", () => {
      registerStaticMarkets("mainnet", [
        { slabAddress: "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd", symbol: "v1" },
      ]);
      registerStaticMarkets("mainnet", [
        { slabAddress: "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd", symbol: "v2" },
      ]);

      const result = getStaticMarkets("mainnet");
      // Only one entry with this address (deduped across register calls)
      const matching = result.filter(e => e.slabAddress === "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd");
      expect(matching).toHaveLength(1);
      expect(matching[0].symbol).toBe("v1"); // first registration wins
    });

    it("skips entries with empty slabAddress", () => {
      registerStaticMarkets("mainnet", [
        { slabAddress: "", symbol: "EMPTY" },
        { slabAddress: "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd", symbol: "VALID" },
      ]);

      const result = getStaticMarkets("mainnet");
      // Should include built-in entries + VALID (empty skipped)
      expect(result.some(e => e.symbol === "VALID")).toBe(true);
      expect(result.some(e => e.symbol === "EMPTY")).toBe(false);
    });
  });

  describe("clearStaticMarkets", () => {
    it("clears user entries for a specific network", () => {
      registerStaticMarkets("mainnet", [
        { slabAddress: "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd" },
      ]);
      registerStaticMarkets("devnet", [
        { slabAddress: "J5GZs2NiS5Ne4eABr78EvjG8heQbkUyUykFxKu6arwSD" },
      ]);

      const beforeClear = getStaticMarkets("mainnet");
      clearStaticMarkets("mainnet");
      const afterClear = getStaticMarkets("mainnet");

      // clearStaticMarkets removes user entries; built-in entries remain
      expect(afterClear.length).toBeLessThan(beforeClear.length);
      expect(afterClear.some(e => e.slabAddress === "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd")).toBe(false);
      // Devnet unaffected
      expect(getStaticMarkets("devnet")).toHaveLength(1);
    });

    it("clears all user entries when no argument", () => {
      registerStaticMarkets("mainnet", [
        { slabAddress: "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd" },
      ]);
      registerStaticMarkets("devnet", [
        { slabAddress: "J5GZs2NiS5Ne4eABr78EvjG8heQbkUyUykFxKu6arwSD" },
      ]);

      clearStaticMarkets();

      // After clearing, only built-in entries remain (mainnet has built-in, devnet does not)
      expect(getStaticMarkets("mainnet").some(e => e.slabAddress === "5U8K4DGwK8vBoAz8BY9QMCgo43JJbHCoDvJa2ECGVHFd")).toBe(false);
      expect(getStaticMarkets("devnet")).toHaveLength(0);
    });
  });
});
