/**
 * Vitest globalSetup for vitest.devnet.config.ts.
 *
 * Why: three test files each ran their own `discoverMarkets` (a
 * getProgramAccounts scan) inside a 60 s `beforeAll`, in parallel workers, all
 * against the public devnet RPC. With 429 backoff one scan takes ~90 s, so the
 * hooks timed out and the run exited 1.
 *
 * Now the scan runs ONCE here, read-only, under its own deadline. Workers get
 * the slab addresses via `inject("devnetSlabs")` and fetch them with a single
 * getMultipleAccounts call (getMarketsByAddress).
 *
 * If devnet is unreachable or the scan misses the deadline, `devnetUnavailable`
 * carries the reason; the test files log it and skip their RPC-dependent cases.
 */
import { Connection } from "@solana/web3.js";
import type { TestProject } from "vitest/node";
import { discoverMarkets, getProgramId } from "../src/index.js";

const DEVNET_RPC = "https://api.devnet.solana.com";
const REACHABLE_DEADLINE_MS = 10_000;
export const DISCOVERY_DEADLINE_MS = 150_000;

declare module "vitest" {
  export interface ProvidedContext {
    /** base58 slab addresses discovered once for the whole run ([] if none/unavailable) */
    devnetSlabs: string[];
    /** non-empty reason string when devnet setup failed; "" when healthy */
    devnetUnavailable: string;
  }
}

function withDeadline<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: NodeJS.Timeout;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(`${what} exceeded ${ms} ms deadline`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

export default async function setup(project: TestProject) {
  // The scan only feeds devnet runs; with an explicit alternate RPC the harness does its own.
  if (process.env.SKIP_DEVNET_TESTS === "1" || process.env.MAINNET_RPC_URL) {
    project.provide("devnetSlabs", []);
    project.provide("devnetUnavailable", "");
    return;
  }
  const conn = new Connection(DEVNET_RPC, { commitment: "confirmed" });
  const t0 = Date.now();
  try {
    const slot = await withDeadline(conn.getSlot("confirmed"), REACHABLE_DEADLINE_MS, "getSlot");
    if (!(slot > 0)) throw new Error(`bad slot ${slot}`);
  } catch (e) {
    const reason = `devnet RPC unreachable (${(e as Error).message})`;
    console.warn(`[devnet-global-setup] ${reason} — RPC-dependent cases will skip`);
    project.provide("devnetSlabs", []);
    project.provide("devnetUnavailable", reason);
    return;
  }
  try {
    const markets = await withDeadline(
      discoverMarkets(conn, getProgramId("devnet"), {
        sequential: true,
        interTierDelayMs: 500,
        rateLimitBackoffMs: [2_000, 5_000],
      }),
      DISCOVERY_DEADLINE_MS,
      "discoverMarkets",
    );
    console.log(
      `[devnet-global-setup] discovered ${markets.length} slab(s) in ${Date.now() - t0} ms`,
    );
    project.provide("devnetSlabs", markets.map((m) => m.slabAddress.toBase58()));
    project.provide("devnetUnavailable", "");
  } catch (e) {
    const reason = `devnet discovery failed (${(e as Error).message})`;
    console.warn(`[devnet-global-setup] ${reason} — RPC-dependent cases will skip`);
    project.provide("devnetSlabs", []);
    project.provide("devnetUnavailable", reason);
  }
}
