import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  safeEnv,
  getProgramId,
  getMatcherProgramId,
  getCurrentNetwork,
  PROGRAM_IDS,
} from "../src/config/program-ids.js";

describe("safeEnv", () => {
  it("reads an existing env var", () => {
    const path = safeEnv("PATH") ?? safeEnv("Path");
    expect(path).toBeDefined();
    expect(typeof path).toBe("string");
  });

  it("returns undefined for a non-existent var", () => {
    expect(safeEnv("__PERCOLATOR_NONEXISTENT_VAR__")).toBeUndefined();
  });
});

describe("getProgramId", () => {
  it("returns a valid PublicKey for devnet", () => {
    const pk = getProgramId("devnet");
    expect(pk).toBeInstanceOf(PublicKey);
    expect(pk.toBase58()).toBe(PROGRAM_IDS.devnet.percolator);
  });

  it("returns a valid PublicKey for mainnet", () => {
    const pk = getProgramId("mainnet");
    expect(pk).toBeInstanceOf(PublicKey);
    expect(pk.toBase58()).toBe(PROGRAM_IDS.mainnet.percolator);
  });

  it("defaults to devnet when no network is specified", () => {
    const pk = getProgramId();
    expect(pk.toBase58()).toBe(PROGRAM_IDS.devnet.percolator);
  });
});

describe("getMatcherProgramId", () => {
  it("returns a valid PublicKey for devnet", () => {
    const pk = getMatcherProgramId("devnet");
    expect(pk).toBeInstanceOf(PublicKey);
    expect(pk.toBase58()).toBe(PROGRAM_IDS.devnet.matcher);
  });
});

describe("getCurrentNetwork", () => {
  it("returns devnet by default when NETWORK env is not set", () => {
    const saved = process.env.NETWORK;
    delete process.env.NETWORK;
    try {
      expect(getCurrentNetwork()).toBe("devnet");
    } finally {
      if (saved !== undefined) process.env.NETWORK = saved;
    }
  });
});
