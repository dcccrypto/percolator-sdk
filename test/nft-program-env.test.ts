/**
 * K-5 (2026-10-10): NFT_PROGRAM_ID env resolution follows the #308 opt-in contract instead of throwing at import for
 * every unlisted value. A fresh-ID consumer (the v2.2 fresh devnet NFT 27LWmR72...) sets
 * PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE=1 and can now import the SDK with NFT_PROGRAM_ID set; without the opt-in an
 * unlisted value still fails closed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveNftProgramOverride } from "../src/abi/nft.js";
import { PROGRAM_IDS_V17 } from "../src/config/program-ids.js";

const FRESH_NFT = "27LWmR72Ru1NCkbN2xgxB7BgYcTUrU7qeEJoV3D8sZh1";
const env = (o: Record<string, string>) => (k: string) => o[k];

describe("resolveNftProgramOverride (pure)", () => {
  it("unset / empty -> undefined (the default id is used)", () => {
    expect(resolveNftProgramOverride(env({}))).toBeUndefined();
    expect(resolveNftProgramOverride(env({ NFT_PROGRAM_ID: "  " }))).toBeUndefined();
  });
  it("an allowlisted value is used without the opt-in", () => {
    expect(resolveNftProgramOverride(env({ NFT_PROGRAM_ID: PROGRAM_IDS_V17.nft }))).toBe(PROGRAM_IDS_V17.nft);
  });
  it("an unlisted value is used WITH PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE=1", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveNftProgramOverride(env({ NFT_PROGRAM_ID: FRESH_NFT, PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE: "1" }))).toBe(FRESH_NFT);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(FRESH_NFT));
    warn.mockRestore();
  });
  it("NEGATIVE CONTROL: an unlisted value WITHOUT the opt-in still throws (env poisoning guard)", () => {
    expect(() => resolveNftProgramOverride(env({ NFT_PROGRAM_ID: FRESH_NFT }))).toThrow(/not a known NFT program address/);
    expect(() => resolveNftProgramOverride(env({ NFT_PROGRAM_ID: FRESH_NFT, PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE: "true" }))).toThrow(/PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE=1/);
  });
  it("NEGATIVE CONTROL: a malformed value throws even with the opt-in", () => {
    expect(() => resolveNftProgramOverride(env({ NFT_PROGRAM_ID: "not-a-pubkey", PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE: "1" }))).toThrow();
  });
});

describe("module import with NFT_PROGRAM_ID set (the keeper's failure mode)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  it("imports and exports the fresh id when the opt-in is set", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NFT_PROGRAM_ID", FRESH_NFT);
    vi.stubEnv("PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE", "1");
    vi.resetModules();
    const m = await import("../src/abi/nft.js");
    expect(m.NFT_PROGRAM_ID.toBase58()).toBe(FRESH_NFT);
    expect(m.getNftProgramId().toBase58()).toBe(FRESH_NFT);
  });
  it("NEGATIVE CONTROL: import still fails closed for an unlisted id without the opt-in", async () => {
    vi.stubEnv("NFT_PROGRAM_ID", FRESH_NFT);
    vi.stubEnv("PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE", "");
    vi.resetModules();
    await expect(import("../src/abi/nft.js")).rejects.toThrow(/not a known NFT program address/);
  });
});
