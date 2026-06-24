import { describe, it, expect, vi } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  safeEnv,
  getProgramId,
  getMatcherProgramId,
  getCurrentNetwork,
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
  it("fails closed for devnet while v17 program ids are placeholders", () => {
    expect(() => getProgramId("devnet")).toThrow(/v17 program is not deployed/i);
  });

  it("fails closed for mainnet while v17 program ids are placeholders", () => {
    expect(() => getProgramId("mainnet")).toThrow(/v17 program is not deployed/i);
  });

  it("defaults to devnet but refuses to return a legacy program id", () => {
    const saved = process.env.NETWORK;
    delete process.env.NETWORK;
    try {
      expect(() => getProgramId()).toThrow(/devnet/);
    } finally {
      if (saved !== undefined) process.env.NETWORK = saved;
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
  it("fails closed for devnet while v17 matcher program ids are placeholders", () => {
    expect(() => getMatcherProgramId("devnet")).toThrow(/v17 matcher program is not deployed/i);
  });

  it("fails closed for mainnet while v17 matcher program ids are placeholders", () => {
    expect(() => getMatcherProgramId("mainnet")).toThrow(/v17 matcher program is not deployed/i);
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
