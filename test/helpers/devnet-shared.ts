import { PublicKey, type Connection } from "@solana/web3.js";
import { inject } from "vitest";
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
