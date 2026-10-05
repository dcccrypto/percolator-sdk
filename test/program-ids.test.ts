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
  PROGRAM_IDS_DEVNET_V1,
} from "../src/config/program-ids.js";
import { STAKE_PROGRAM_IDS, STAKE_PROGRAM_ID, getStakeProgramId } from "../src/solana/stake.js";
import { NFT_PROGRAM_ID } from "../src/abi/nft.js";
import { CANONICAL_VAULT_LP_MATCHER_PROGRAM_DEVNET_P3 } from "../src/abi/p3.js";

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
// Devnet wrapper id + "v17"-named stake/nft/matcher record.
// These assertions are pinned to literal, hardcoded expected values (not
// self-referential comparisons against the module's own constants) so that
// a regression fails loudly instead of silently passing.
//
// v2.1 fresh-ID deploy (SDK 9.0.0, mode ii): the ACTIVE devnet set moved to brand-new
// addresses — wrapper 5NGgnU2j…, matcher DfTxJUT5…, nft DWUNq2iY…, stake/vault A6DVNubv….
// PROGRAM_IDS_V17 / PROGRAM_ID_V17 are single-source-of-truth aliases of that set. The
// SDK 8.x ETDLAdi… world is v1 / close-only (PROGRAM_IDS_DEVNET_V1, see the block below).
// The abandoned wrappers (GnwdeQr…, DhSkE7u…) must appear nowhere as an active id.
// ===========================================================================
describe("devnet wrapper id (v2.1 fresh-ID cutover) + v17-named record", () => {
  it("getProgramId('devnet') resolves to the v2.1 wrapper 5NGgnU2j315Ci2tso8VJDEthaVExuiKG3tn4xnur28xe", () => {
    const pk = getProgramId("devnet");
    expect(pk.toBase58()).toBe("5NGgnU2j315Ci2tso8VJDEthaVExuiKG3tn4xnur28xe");
  });

  it("PROGRAM_IDS.devnet.percolator is the v2.1 wrapper (active default)", () => {
    expect(PROGRAM_IDS.devnet.percolator).toBe(
      "5NGgnU2j315Ci2tso8VJDEthaVExuiKG3tn4xnur28xe",
    );
  });

  it("PROGRAM_IDS_V17.percolator is the v2.1 wrapper (deprecated alias, single source of truth)", () => {
    expect(PROGRAM_IDS_V17.percolator).toBe(
      "5NGgnU2j315Ci2tso8VJDEthaVExuiKG3tn4xnur28xe",
    );
  });

  it("PROGRAM_ID_V17 PublicKey is the v2.1 wrapper (deprecated alias of the active id)", () => {
    expect(PROGRAM_ID_V17.toBase58()).toBe(
      "5NGgnU2j315Ci2tso8VJDEthaVExuiKG3tn4xnur28xe",
    );
  });

  it("PROGRAM_IDS_V17.vault is the v2.1 stake/vault program A6DVNubvzMMETQinK6bipekkaTTrkUu2RMw2kBoJrdkE", () => {
    expect(PROGRAM_IDS_V17.vault).toBe(
      "A6DVNubvzMMETQinK6bipekkaTTrkUu2RMw2kBoJrdkE",
    );
  });

  it("PROGRAM_IDS_V17.nft is the v2.1 nft program DWUNq2iYh6Sdgdv3qv7aWJNJGhoK25FqyQrqDUrDD9zs", () => {
    expect(PROGRAM_IDS_V17.nft).toBe(
      "DWUNq2iYh6Sdgdv3qv7aWJNJGhoK25FqyQrqDUrDD9zs",
    );
  });

  it("PROGRAM_IDS_V17.matcher is the v2.1 matcher DfTxJUT5BbERs1tR33dP82kaUJ1NLymRxXErXAYXcDam", () => {
    expect(PROGRAM_IDS_V17.matcher).toBe(
      "DfTxJUT5BbERs1tR33dP82kaUJ1NLymRxXErXAYXcDam",
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

// SDK 8.0.0 negative controls: the v18.0–v18.2 wrapper GnwdeQr… is ABANDONED. Devnet
// resolution must not return it, and an env override to it must be rejected without the
// explicit opt-in (rollback to GnwdeQr… = pin @percolatorct/sdk@7.0.0, not an env var).
describe("abandoned v18.0–v18.2 wrapper GnwdeQr… (SDK 8.0.0 cutover)", () => {
  const ABANDONED_V18 = "GnwdeQrAh4qzChJeVLrM21CXXWC1akjLH3DiijwzEEYZ";

  it("getProgramId('devnet') and PROGRAM_ID_V17 no longer resolve to GnwdeQr…", () => {
    expect(getProgramId("devnet").toBase58()).not.toBe(ABANDONED_V18);
    expect(PROGRAM_ID_V17.toBase58()).not.toBe(ABANDONED_V18);
  });

  it("#308: env PROGRAM_ID=GnwdeQr… is rejected without opt-in", () => {
    const saved = process.env.PROGRAM_ID;
    const savedOptIn = process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
    process.env.PROGRAM_ID = ABANDONED_V18;
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

// ===========================================================================
// v2.1 (default) vs v1 / close-only (PROGRAM_IDS_DEVNET_V1) devnet sets — SDK 9.0.0.
// Literal pins on both sides, so reverting ANY default to its v1 value fails here.
// ===========================================================================
const V21_LITERALS = {
  percolator: "5NGgnU2j315Ci2tso8VJDEthaVExuiKG3tn4xnur28xe",
  matcher: "DfTxJUT5BbERs1tR33dP82kaUJ1NLymRxXErXAYXcDam",
  nft: "DWUNq2iYh6Sdgdv3qv7aWJNJGhoK25FqyQrqDUrDD9zs",
  vault: "A6DVNubvzMMETQinK6bipekkaTTrkUu2RMw2kBoJrdkE",
} as const;
const V1_LITERALS = {
  percolator: "ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB",
  matcher: "EDKKgRaVHna6FCxiY1kgMzegD9rpaN1nwJNSzAzeBUBX",
  nft: "EMYT15LZWaP7Mmmm245kQPbrTyVjG16yZiU9kfNTF3GZ",
  vault: "VmpVUArRnVkrjaPXQ2qaqCQa3ZrZFgsz7rjeALitF5w",
} as const;

describe("devnet v2.1 default set vs PROGRAM_IDS_DEVNET_V1 (v1 / close-only)", () => {
  it("PROGRAM_IDS_DEVNET_V1 is exactly the four ETDLAdi-world literals", () => {
    expect({ ...PROGRAM_IDS_DEVNET_V1 }).toEqual(V1_LITERALS);
    expect(Object.isFrozen(PROGRAM_IDS_DEVNET_V1)).toBe(true);
  });

  it("PROGRAM_IDS_V17 is exactly the four v2.1 literals", () => {
    expect({ ...PROGRAM_IDS_V17 }).toEqual(V21_LITERALS);
  });

  it("every devnet default equals its v2.1 literal", () => {
    const saved = { p: process.env.PROGRAM_ID, m: process.env.MATCHER_PROGRAM_ID, s: process.env.STAKE_PROGRAM_ID };
    delete process.env.PROGRAM_ID;
    delete process.env.MATCHER_PROGRAM_ID;
    delete process.env.STAKE_PROGRAM_ID;
    try {
      expect(PROGRAM_IDS.devnet.percolator).toBe(V21_LITERALS.percolator);
      expect(PROGRAM_IDS.devnet.matcher).toBe(V21_LITERALS.matcher);
      expect(getProgramId("devnet").toBase58()).toBe(V21_LITERALS.percolator);
      expect(getMatcherProgramId("devnet").toBase58()).toBe(V21_LITERALS.matcher);
      expect(PROGRAM_ID_V17.toBase58()).toBe(V21_LITERALS.percolator);
      expect(STAKE_PROGRAM_IDS.devnet).toBe(V21_LITERALS.vault);
      expect(STAKE_PROGRAM_ID.toBase58()).toBe(V21_LITERALS.vault);
      expect(getStakeProgramId("devnet").toBase58()).toBe(V21_LITERALS.vault);
      expect(NFT_PROGRAM_ID.toBase58()).toBe(V21_LITERALS.nft);
      expect(CANONICAL_VAULT_LP_MATCHER_PROGRAM_DEVNET_P3).toBe(V21_LITERALS.matcher);
    } finally {
      if (saved.p !== undefined) process.env.PROGRAM_ID = saved.p;
      if (saved.m !== undefined) process.env.MATCHER_PROGRAM_ID = saved.m;
      if (saved.s !== undefined) process.env.STAKE_PROGRAM_ID = saved.s;
    }
  });

  it("the v2.1 and v1 sets are disjoint (no id shared between worlds)", () => {
    const v21 = new Set<string>(Object.values(PROGRAM_IDS_V17));
    const v1 = new Set<string>(Object.values(PROGRAM_IDS_DEVNET_V1));
    expect(v21.size).toBe(4);
    expect(v1.size).toBe(4);
    for (const id of v1) expect(v21.has(id)).toBe(false);
    // and no default resolves into the v1 set
    for (const id of [
      PROGRAM_IDS.devnet.percolator,
      PROGRAM_IDS.devnet.matcher,
      STAKE_PROGRAM_IDS.devnet,
      NFT_PROGRAM_ID.toBase58(),
      CANONICAL_VAULT_LP_MATCHER_PROGRAM_DEVNET_P3,
    ]) {
      expect(v1.has(id)).toBe(false);
    }
  });

  it("mainnet ids are unchanged and outside both devnet sets", () => {
    expect(PROGRAM_IDS.mainnet.percolator).toBe("ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv");
    expect(PROGRAM_IDS.mainnet.matcher).toBe("GDK8wx38kpiSVSfGTVNiSdptX3Z5R4kQyqh6Q3QX6wmi");
    expect(STAKE_PROGRAM_IDS.mainnet).toBe("DC5fovFQD5SZYsetwvEqd4Wi4PFY1Yfnc669VMe6oa7F");
  });

  it("#308: env PROGRAM_ID / MATCHER_PROGRAM_ID / STAKE_PROGRAM_ID = a v1 id is accepted without opt-in (close-only world stays reachable)", () => {
    const saved = {
      p: process.env.PROGRAM_ID, m: process.env.MATCHER_PROGRAM_ID, s: process.env.STAKE_PROGRAM_ID,
      o: process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE, n: process.env.NETWORK,
    };
    delete process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
    process.env.NETWORK = "devnet";
    process.env.PROGRAM_ID = V1_LITERALS.percolator;
    process.env.MATCHER_PROGRAM_ID = V1_LITERALS.matcher;
    process.env.STAKE_PROGRAM_ID = V1_LITERALS.vault;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(getProgramId().toBase58()).toBe(V1_LITERALS.percolator);
      expect(getMatcherProgramId().toBase58()).toBe(V1_LITERALS.matcher);
      expect(getStakeProgramId().toBase58()).toBe(V1_LITERALS.vault);
    } finally {
      warn.mockRestore();
      for (const [k, v] of [
        ["PROGRAM_ID", saved.p], ["MATCHER_PROGRAM_ID", saved.m], ["STAKE_PROGRAM_ID", saved.s],
        ["PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE", saved.o], ["NETWORK", saved.n],
      ] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
