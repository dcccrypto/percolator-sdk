import { describe, it, expect, afterEach, vi } from "vitest";
import {
  getMatcherProgramId,
  getProgramId,
  getCurrentNetwork,
  PROGRAM_IDS,
  type Network,
} from "../src/config/program-ids.js";

const DEVNET_MATCHER = "AsHvEJ8zNctKmdeS57H5E4w6nkTLi3bPVpd6ZCLc2ayN";
const MAINNET_MATCHER = "GDK8wx38kpiSVSfGTVNiSdptX3Z5R4kQyqh6Q3QX6wmi";
const DEVNET_PERCOLATOR = "6kpg2wi7vwkn7E9rvodXSktYRhna8TWjiZrC1dBek6NM";
const MAINNET_PERCOLATOR = "ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv";

const SAVED = {
  NETWORK: process.env.NETWORK,
  PROGRAM_ID: process.env.PROGRAM_ID,
  MATCHER_PROGRAM_ID: process.env.MATCHER_PROGRAM_ID,
};

afterEach(() => {
  for (const [k, v] of Object.entries(SAVED)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

describe("program-ids: matcher not deployed branch", () => {
  it("throws 'Matcher program not deployed on <network>' when the network entry has no matcher id", () => {
    // PROGRAM_IDS is frozen and only has devnet/mainnet, both with matchers. Reach the
    // `!programId` guard through a prototype-resolved entry for an unknown network key,
    // removed again in finally so no global state leaks.
    const key = "__test_no_matcher_net__";
    (Object.prototype as Record<string, unknown>)[key] = { percolator: DEVNET_PERCOLATOR, matcher: "" };
    try {
      expect(() => getMatcherProgramId(key as unknown as Network)).toThrow(
        `Matcher program not deployed on ${key}`,
      );
    } finally {
      delete (Object.prototype as Record<string, unknown>)[key];
    }
  });
});

describe("program-ids: explicit network is authoritative over env", () => {
  it("returns the canonical ids for explicit networks regardless of ambient env", () => {
    process.env.NETWORK = "mainnet";
    process.env.PROGRAM_ID = "11111111111111111111111111111111";
    process.env.MATCHER_PROGRAM_ID = "11111111111111111111111111111111";
    expect(getProgramId("devnet").toBase58()).toBe(DEVNET_PERCOLATOR);
    expect(getProgramId("mainnet").toBase58()).toBe(MAINNET_PERCOLATOR);
    expect(getMatcherProgramId("devnet").toBase58()).toBe(DEVNET_MATCHER);
    expect(getMatcherProgramId("mainnet").toBase58()).toBe(MAINNET_MATCHER);
  });
});

describe("program-ids: ambient resolution", () => {
  it("unknown NETWORK falls back to devnet ids, never mainnet", () => {
    delete process.env.PROGRAM_ID;
    delete process.env.MATCHER_PROGRAM_ID;
    process.env.NETWORK = "somewhere-else";
    expect(getCurrentNetwork()).toBe("devnet");
    expect(getProgramId().toBase58()).toBe(DEVNET_PERCOLATOR);
    expect(getMatcherProgramId().toBase58()).toBe(DEVNET_MATCHER);
  });

  it("NETWORK=mainnet-beta (case-insensitive) resolves mainnet ids", () => {
    delete process.env.PROGRAM_ID;
    delete process.env.MATCHER_PROGRAM_ID;
    process.env.NETWORK = "Mainnet-Beta";
    expect(getProgramId().toBase58()).toBe(MAINNET_PERCOLATOR);
    expect(getMatcherProgramId().toBase58()).toBe(MAINNET_MATCHER);
  });

  it("known env override is honoured with a warning; unknown override throws", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    delete process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
    process.env.PROGRAM_ID = MAINNET_PERCOLATOR;
    process.env.MATCHER_PROGRAM_ID = MAINNET_MATCHER;
    expect(getProgramId().toBase58()).toBe(MAINNET_PERCOLATOR);
    expect(getMatcherProgramId().toBase58()).toBe(MAINNET_MATCHER);
    expect(warn).toHaveBeenCalledTimes(2);

    process.env.PROGRAM_ID = "11111111111111111111111111111111";
    expect(() => getProgramId()).toThrow(/not a known program address/);
    process.env.MATCHER_PROGRAM_ID = "11111111111111111111111111111111";
    expect(() => getMatcherProgramId()).toThrow(/not a known matcher program address/);
  });

  it("table pins the concrete ids", () => {
    expect(PROGRAM_IDS.devnet.matcher).toBe(DEVNET_MATCHER);
    expect(PROGRAM_IDS.mainnet.matcher).toBe(MAINNET_MATCHER);
  });
});
