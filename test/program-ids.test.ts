import { describe, it, expect, vi } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  safeEnv,
  getProgramId,
  getMatcherProgramId,
  getCurrentNetwork,
  PROGRAM_IDS,
  PROGRAM_IDS_V17,
  PROGRAM_ID_V17,
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

  // #309 (CRITICAL) — env PROGRAM_ID override is validated against the SDK allowlist.
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
  it("returns a valid PublicKey for devnet", () => {
    const pk = getMatcherProgramId("devnet");
    expect(pk).toBeInstanceOf(PublicKey);
    expect(pk.toBase58()).toBe(PROGRAM_IDS.devnet.matcher);
  });

  // #309 (CRITICAL) — env MATCHER_PROGRAM_ID override is validated against the allowlist.
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

// ===========================================================================
// Fresh v17 devnet triple — deployed + upgraded 2026-07-17, hash-verified.
// These assertions are pinned to literal, hardcoded expected values (not
// self-referential comparisons against the module's own constants) so that
// a regression to the stale 2026-06-26 triple (69VUZ7a2..., 51CeUNpb...,
// 5TnritLt...) fails loudly instead of silently passing.
// ===========================================================================
describe("v17 fresh devnet triple (2026-07-17)", () => {
  it("getProgramId('devnet') resolves to the fresh wrapper DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj", () => {
    const pk = getProgramId("devnet");
    expect(pk.toBase58()).toBe("DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj");
  });

  it("PROGRAM_IDS.devnet.percolator is the fresh wrapper (cutover default)", () => {
    expect(PROGRAM_IDS.devnet.percolator).toBe(
      "DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj",
    );
  });

  it("PROGRAM_IDS_V17.percolator is the fresh wrapper", () => {
    expect(PROGRAM_IDS_V17.percolator).toBe(
      "DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj",
    );
  });

  it("PROGRAM_ID_V17 PublicKey matches the fresh wrapper", () => {
    expect(PROGRAM_ID_V17.toBase58()).toBe(
      "DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj",
    );
  });

  it("PROGRAM_IDS_V17.vault is the fresh stake/vault program GCHhcgwPyrai8SWHEVWw3odedguFXEtJobNnWSfWBCU3", () => {
    expect(PROGRAM_IDS_V17.vault).toBe(
      "GCHhcgwPyrai8SWHEVWw3odedguFXEtJobNnWSfWBCU3",
    );
  });

  it("PROGRAM_IDS_V17.nft is the fresh nft program CNGBPZRALk9Xu8BdgWNyrLJ7daQ9eJYFf1GnEEC7YCU3", () => {
    expect(PROGRAM_IDS_V17.nft).toBe(
      "CNGBPZRALk9Xu8BdgWNyrLJ7daQ9eJYFf1GnEEC7YCU3",
    );
  });

  it("PROGRAM_IDS_V17.matcher is unchanged (upgraded in place, same address)", () => {
    expect(PROGRAM_IDS_V17.matcher).toBe(
      "4seJWjv3R5qfXY8R5ntuPHWsoqcVvaxvfFSnU2AnGMhT",
    );
  });

  it("does NOT resolve to the superseded 2026-06-26 wrapper address", () => {
    const pk = getProgramId("devnet");
    expect(pk.toBase58()).not.toBe("69VUZ7a2BeXBTpRRManLamF5UWTaNR9B1hy5Se3cdXy9");
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
