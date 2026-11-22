import { PublicKey, type Connection } from "@solana/web3.js";
import { inject, it } from "vitest";
import { getMarketsByAddress } from "../../src/index.js";

/** Per-call deadline so one slow RPC call cannot eat the whole hook budget. */
export function withDeadline<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: NodeJS.Timeout;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(`${what} exceeded ${ms} ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

/** Reason devnet setup failed in globalSetup, or "" when healthy. */
export function devnetUnavailableReason(): string {
  return inject("devnetUnavailable");
}

/** Slab addresses discovered once by globalSetup. */
export function sharedSlabAddresses(): PublicKey[] {
  return inject("devnetSlabs").map((s) => new PublicKey(s));
}

/** Load the markets for the shared slab list with one bounded batch read. */
export async function loadSharedMarkets(
  conn: Connection,
  programId: PublicKey,
  deadlineMs = 40_000,
) {
  const addrs = sharedSlabAddresses();
  return withDeadline(getMarketsByAddress(conn, programId, addrs), deadlineMs, "getMarketsByAddress");
}

/**
 * KNOWN-STALE live-devnet case: it asserts the legacy slab shape (parseHeader /
 * parseEngine / detectSlabLayout / header+engine fields), but every program
 * account on devnet is a v17 "PERCV16" market (wrapperVersion 19), which those
 * legacy APIs reject. See J-20261119-SDK-REPORT-DEVNETREALPATH finding B2.
 *
 * Declared with `it.fails`: the suite stays green while the case still fails,
 * turns RED the moment it starts passing (so the marker gets removed), and
 * skips with a reason when devnet is unavailable. Rewrite the assertions for
 * the v17 shape, then change `itStale(` back to `it(`.
 */
export function itStale(name: string, fn: (ctx: any) => unknown, timeout?: number) {
  it.fails(
    `[known-stale: legacy parser vs v17 devnet slab] ${name}`,
    async (ctx) => {
      if (process.env.SKIP_DEVNET_TESTS === "1" || devnetUnavailableReason()) {
        ctx.skip(`devnet unavailable: ${devnetUnavailableReason() || "SKIP_DEVNET_TESTS=1"}`);
      }
      await fn(ctx);
    },
    timeout,
  );
}
