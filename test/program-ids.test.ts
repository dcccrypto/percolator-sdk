import { describe, it, expect, vi } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  safeEnv,
  getProgramId,
  getMatcherProgramId,
  getCurrentNetwork,
  PROGRAM_IDS_V17,
} from "../src/config/program-ids.js";

const V17_PERCOLATOR = "69VUZ7a2BeXBTpRRManLamF5UWTaNR9B1hy5Se3cdXy9";
const V17_MATCHER = "4seJWjv3R5qfXY8R5ntuPHWsoqcVvaxvfFSnU2AnGMhT";
const V17_STAKE = "51CeUNpbXovK2BRADPyssuf3Q1xWGabEK9pYkp5mqVhQ";
const V17_NFT = "5TnritLtHS76s5iV8axqDmqhcmJKMRUekMGrk9rBTqSP";

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

describe("PROGRAM_IDS_V17 shape", () => {
  it("exposes all four v17 addresses", () => {
    expect(PROGRAM_IDS_V17.percolator).toBe(V17_PERCOLATOR);
    expect(PROGRAM_IDS_V17.matcher).toBe(V17_MATCHER);
    expect(PROGRAM_IDS_V17.stake).toBe(V17_STAKE);
    expect(PROGRAM_IDS_V17.nft).toBe(V17_NFT);
  });
});

describe("getProgramId", () => {
  it("returns the v17 devnet percolator address for devnet", () => {
    const pk = getProgramId("devnet");
    expect(pk).toBeInstanceOf(PublicKey);
    expect(pk.toBase58()).toBe(V17_PERCOLATOR);
  });

  it("still fails closed for mainnet (mainnet cutover not done)", () => {
    expect(() => getProgramId("mainnet")).toThrow(/not deployed on mainnet yet/i);
  });

  it("defaults to devnet (no NETWORK set) and returns v17 devnet address", () => {
    const saved = process.env.NETWORK;
    delete process.env.NETWORK;
    try {
      const pk = getProgramId();
      expect(pk.toBase58()).toBe(V17_PERCOLATOR);
    } finally {
      if (saved !== undefined) process.env.NETWORK = saved;
    }
  });

  it("allows a v17 percolator address as PROGRAM_ID env override WITHOUT the opt-in (now in allowlist)", () => {
    const saved = process.env.PROGRAM_ID;
    const savedOptIn = process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.PROGRAM_ID = V17_PERCOLATOR;
    delete process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
    try {
      const pk = getProgramId();
      expect(pk.toBase58()).toBe(V17_PERCOLATOR);
    } finally {
      warn.mockRestore();
      if (saved === undefined) delete process.env.PROGRAM_ID;
      else process.env.PROGRAM_ID = saved;
      if (savedOptIn !== undefined) process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE = savedOptIn;
    }
  });

  it("allows an explicit PROGRAM_ID override for trusted v17 deployments (with opt-in)", () => {
    const saved = process.env.PROGRAM_ID;
    const savedOptIn = process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const override = PublicKey.unique().toBase58();
    process.env.PROGRAM_ID = override;
    process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE = "1"; // #308 explicit opt-in
    try {
      const pk = getProgramId();
      expect(pk).toBeInstanceOf(PublicKey);
      expect(pk.toBase58()).toBe(override);
    } finally {
      warn.mockRestore();
      if (saved === undefined) delete process.env.PROGRAM_ID;
      else process.env.PROGRAM_ID = saved;
      if (savedOptIn === undefined) delete process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
      else process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE = savedOptIn;
    }
  });

  it("#308: rejects an unlisted PROGRAM_ID override WITHOUT the explicit opt-in", () => {
    const saved = process.env.PROGRAM_ID;
    const savedOptIn = process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
    process.env.PROGRAM_ID = PublicKey.unique().toBase58();
    delete process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
    try {
      expect(() => getProgramId()).toThrow(/not a known program address/i);
    } finally {
      if (saved === undefined) delete process.env.PROGRAM_ID;
      else process.env.PROGRAM_ID = saved;
      if (savedOptIn !== undefined) process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE = savedOptIn;
    }
  });
});

describe("getMatcherProgramId", () => {
  it("returns the v17 devnet matcher address for devnet", () => {
    const pk = getMatcherProgramId("devnet");
    expect(pk).toBeInstanceOf(PublicKey);
    expect(pk.toBase58()).toBe(V17_MATCHER);
  });

  it("still fails closed for mainnet (mainnet cutover not done)", () => {
    expect(() => getMatcherProgramId("mainnet")).toThrow(/not deployed on mainnet yet/i);
  });

  it("defaults to devnet (no NETWORK set) and returns v17 devnet matcher address", () => {
    const saved = process.env.NETWORK;
    delete process.env.NETWORK;
    try {
      const pk = getMatcherProgramId();
      expect(pk.toBase58()).toBe(V17_MATCHER);
    } finally {
      if (saved !== undefined) process.env.NETWORK = saved;
    }
  });

  it("allows a v17 matcher address as MATCHER_PROGRAM_ID env override WITHOUT the opt-in (now in allowlist)", () => {
    const saved = process.env.MATCHER_PROGRAM_ID;
    const savedOptIn = process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.MATCHER_PROGRAM_ID = V17_MATCHER;
    delete process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
    try {
      const pk = getMatcherProgramId();
      expect(pk.toBase58()).toBe(V17_MATCHER);
    } finally {
      warn.mockRestore();
      if (saved === undefined) delete process.env.MATCHER_PROGRAM_ID;
      else process.env.MATCHER_PROGRAM_ID = saved;
      if (savedOptIn !== undefined) process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE = savedOptIn;
    }
  });

  it("allows an explicit MATCHER_PROGRAM_ID override for trusted v17 deployments (with opt-in)", () => {
    const saved = process.env.MATCHER_PROGRAM_ID;
    const savedOptIn = process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const override = PublicKey.unique().toBase58();
    process.env.MATCHER_PROGRAM_ID = override;
    process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE = "1"; // #308 explicit opt-in
    try {
      const pk = getMatcherProgramId();
      expect(pk).toBeInstanceOf(PublicKey);
      expect(pk.toBase58()).toBe(override);
    } finally {
      warn.mockRestore();
      if (saved === undefined) delete process.env.MATCHER_PROGRAM_ID;
      else process.env.MATCHER_PROGRAM_ID = saved;
      if (savedOptIn === undefined) delete process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
      else process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE = savedOptIn;
    }
  });

  it("#308: rejects an unlisted MATCHER_PROGRAM_ID override WITHOUT the explicit opt-in", () => {
    const saved = process.env.MATCHER_PROGRAM_ID;
    const savedOptIn = process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
    process.env.MATCHER_PROGRAM_ID = PublicKey.unique().toBase58();
    delete process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
    try {
      expect(() => getMatcherProgramId()).toThrow(/not a known matcher program address/i);
    } finally {
      if (saved === undefined) delete process.env.MATCHER_PROGRAM_ID;
      else process.env.MATCHER_PROGRAM_ID = saved;
      if (savedOptIn !== undefined) process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE = savedOptIn;
    }
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
