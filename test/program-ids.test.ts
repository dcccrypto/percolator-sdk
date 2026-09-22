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
// Devnet wrapper id + v17 stake/nft/matcher record.
// These assertions are pinned to literal, hardcoded expected values (not
// self-referential comparisons against the module's own constants) so that
// a regression fails loudly instead of silently passing.
//
// v18 coordinated fresh-ID redeploy (2026-09-22): the ACTIVE devnet wrapper
// moved to a brand-new address (GnwdeQr…). PROGRAM_IDS_V17.percolator / PROGRAM_ID_V17
// were CUT OVER to that same fresh id (single source of truth with PROGRAM_IDS.devnet;
// deprecated back-compat aliases), so all wrapper-id pins below are GnwdeQr…. The
// stake/vault (GCHhcgw…) and nft (CNGBPZR…) v17 ids are unaffected by the wrapper-only
// cutover. The abandoned v17 wrapper (DhSkE7u…) must appear nowhere as an active id.
// ===========================================================================
describe("devnet wrapper id (v18 fresh-ID cutover) + v17 record", () => {
  it("getProgramId('devnet') resolves to the fresh v18 wrapper GnwdeQrAh4qzChJeVLrM21CXXWC1akjLH3DiijwzEEYZ", () => {
    const pk = getProgramId("devnet");
    expect(pk.toBase58()).toBe("GnwdeQrAh4qzChJeVLrM21CXXWC1akjLH3DiijwzEEYZ");
  });

  it("PROGRAM_IDS.devnet.percolator is the fresh v18 wrapper (active cutover default)", () => {
    expect(PROGRAM_IDS.devnet.percolator).toBe(
      "GnwdeQrAh4qzChJeVLrM21CXXWC1akjLH3DiijwzEEYZ",
    );
  });

  it("PROGRAM_IDS_V17.percolator is cut over to the fresh v18 wrapper (deprecated alias, single source of truth)", () => {
    expect(PROGRAM_IDS_V17.percolator).toBe(
      "GnwdeQrAh4qzChJeVLrM21CXXWC1akjLH3DiijwzEEYZ",
    );
  });

  it("PROGRAM_ID_V17 PublicKey is the fresh v18 wrapper (deprecated alias of the active id)", () => {
    expect(PROGRAM_ID_V17.toBase58()).toBe(
      "GnwdeQrAh4qzChJeVLrM21CXXWC1akjLH3DiijwzEEYZ",
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

  // Negative control for the v18 cutover: the ACTIVE devnet resolution must have moved
  // OFF the abandoned v17 wrapper. If this ever passes-as-DhSkE7u again the cutover regressed.
  it("does NOT resolve to the abandoned v17 wrapper (DhSkE7u…) after the v18 cutover", () => {
    const pk = getProgramId("devnet");
    expect(pk.toBase58()).not.toBe("DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj");
  });

  // Negative control: the deprecated PROGRAM_ID_V17 alias must ALSO have moved off DhSkE7u,
  // or a consumer still importing it would target the abandoned wrapper.
  it("PROGRAM_ID_V17 no longer equals the abandoned v17 wrapper (DhSkE7u…)", () => {
    expect(PROGRAM_ID_V17.toBase58()).not.toBe("DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj");
  });

  // The abandoned v17 wrapper must no longer be an ALLOWLISTED id: an env PROGRAM_ID override
  // set to DhSkE7u WITHOUT the explicit opt-in must now be REJECTED (it dropped from
  // KNOWN_PROGRAM_IDS at the cutover). Proves DhSkE7u is not silently accepted anywhere.
  it("#308: env PROGRAM_ID=DhSkE7u (abandoned v17) is rejected without opt-in", () => {
    const saved = process.env.PROGRAM_ID;
    const savedOptIn = process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
    process.env.PROGRAM_ID = "DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj";
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
