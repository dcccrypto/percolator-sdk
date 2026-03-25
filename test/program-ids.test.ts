import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  PROGRAM_IDS,
  getProgramId,
  getMatcherProgramId,
  getCurrentNetwork,
} from "../src/config/program-ids.js";

const KNOWN_MAINNET_MATCHER = "DHP6DtwXP1yJsz8YzfoeigRFPB979gzmumkmCxDLSkUX";
const KNOWN_MAINNET_PERCOLATOR = "GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24";
const KNOWN_DEVNET_MATCHER = "GTRgyTDfrMvBubALAqtHuQwT8tbGyXid7svXZKtWfC9k";
const KNOWN_DEVNET_PERCOLATOR = "FxfD37s1AZTeWfFQps9Zpebi2dNQ9QSSDtfMKdbsfKrD";

describe("PROGRAM_IDS constants", () => {
  it("mainnet matcher is the deployed Matcher program — not empty (GH#1689)", () => {
    expect(PROGRAM_IDS.mainnet.matcher).toBe(KNOWN_MAINNET_MATCHER);
    expect(PROGRAM_IDS.mainnet.matcher).not.toBe("");
  });

  it("mainnet percolator is the deployed Percolator program", () => {
    expect(PROGRAM_IDS.mainnet.percolator).toBe(KNOWN_MAINNET_PERCOLATOR);
  });

  it("devnet matcher is set", () => {
    expect(PROGRAM_IDS.devnet.matcher).toBe(KNOWN_DEVNET_MATCHER);
    expect(PROGRAM_IDS.devnet.matcher).not.toBe("");
  });

  it("devnet percolator is set", () => {
    expect(PROGRAM_IDS.devnet.percolator).toBe(KNOWN_DEVNET_PERCOLATOR);
  });
});

describe("getMatcherProgramId", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {
      MATCHER_PROGRAM_ID: process.env.MATCHER_PROGRAM_ID,
      NETWORK: process.env.NETWORK,
    };
    delete process.env.MATCHER_PROGRAM_ID;
    delete process.env.NETWORK;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("returns correct mainnet matcher PublicKey (GH#1689)", () => {
    const pk = getMatcherProgramId("mainnet");
    expect(pk).toBeInstanceOf(PublicKey);
    expect(pk.toBase58()).toBe(KNOWN_MAINNET_MATCHER);
  });

  it("returns correct devnet matcher PublicKey", () => {
    const pk = getMatcherProgramId("devnet");
    expect(pk).toBeInstanceOf(PublicKey);
    expect(pk.toBase58()).toBe(KNOWN_DEVNET_MATCHER);
  });

  it("defaults to mainnet when no env set (fail-closed)", () => {
    const pk = getMatcherProgramId();
    expect(pk.toBase58()).toBe(KNOWN_MAINNET_MATCHER);
  });

  it("respects MATCHER_PROGRAM_ID env override", () => {
    const override = "GTRgyTDfrMvBubALAqtHuQwT8tbGyXid7svXZKtWfC9k";
    process.env.MATCHER_PROGRAM_ID = override;
    const pk = getMatcherProgramId("mainnet");
    expect(pk.toBase58()).toBe(override);
  });

  it("respects NETWORK=devnet env var", () => {
    process.env.NETWORK = "devnet";
    const pk = getMatcherProgramId();
    expect(pk.toBase58()).toBe(KNOWN_DEVNET_MATCHER);
  });
});

describe("getProgramId", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {
      PROGRAM_ID: process.env.PROGRAM_ID,
      NETWORK: process.env.NETWORK,
    };
    delete process.env.PROGRAM_ID;
    delete process.env.NETWORK;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("returns mainnet percolator by default (fail-closed)", () => {
    const pk = getProgramId();
    expect(pk.toBase58()).toBe(KNOWN_MAINNET_PERCOLATOR);
  });

  it("returns devnet percolator when network=devnet", () => {
    const pk = getProgramId("devnet");
    expect(pk.toBase58()).toBe(KNOWN_DEVNET_PERCOLATOR);
  });
});

describe("getCurrentNetwork", () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env.NETWORK;
    delete process.env.NETWORK;
  });

  afterEach(() => {
    if (savedEnv === undefined) delete process.env.NETWORK;
    else process.env.NETWORK = savedEnv;
  });

  it("defaults to mainnet", () => {
    expect(getCurrentNetwork()).toBe("mainnet");
  });

  it("returns devnet when NETWORK=devnet", () => {
    process.env.NETWORK = "devnet";
    expect(getCurrentNetwork()).toBe("devnet");
  });
});
