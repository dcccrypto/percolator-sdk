/**
 * K-5 (2026-10-10): NFT_PROGRAM_ID env resolution follows the #308 opt-in contract instead of throwing at import for
 * every unlisted value. A fresh-ID consumer sets PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE=1 and can now import the SDK
 * with NFT_PROGRAM_ID set; without the opt-in an unlisted value still fails closed.
 * Q-5 (2026-10-11): the v2.2 fresh devnet NFT 27LWmR72... is now the allowlisted DEFAULT, so the "unlisted fresh id"
 * here is the never-deployed v2.1 RC NFT id DWUNq2iY... (removed from the allowlist).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveNftProgramOverride } from "../src/abi/nft.js";
import { NFT_PROGRAM_IDS, PROGRAM_IDS_DEVNET_V1, PROGRAM_IDS_V17 } from "../src/config/program-ids.js";

const FRESH_NFT = "DWUNq2iYh6Sdgdv3qv7aWJNJGhoK25FqyQrqDUrDD9zs"; // unlisted (never-deployed v2.1 RC id)
const env = (o: Record<string, string>) => (k: string) => o[k];
const UNKNOWN = /not a known NFT program address/;

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

/**
 * Exact-match contract (J-20261123 mutation report, 16/25 -> 25/25 for this file alone): the opt-in is the literal
 * string "1", the allowlist is exact (case-sensitive, whole string), padding is trimmed, and every allowlist entry
 * resolves to itself without the opt-in. Each looser variant is the fail-open direction.
 */
describe("resolveNftProgramOverride exact-match contract", () => {
  // kills M04 (opt-in trimmed) and M05 (loose != 1)
  it.each([" 1", "1 ", "01", "1.0", "+1", "1\n"])("opt-in %j is NOT the opt-in: unlisted id still throws", (opt) => {
    expect(() =>
      resolveNftProgramOverride(env({ NFT_PROGRAM_ID: FRESH_NFT, PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE: opt })),
    ).toThrow(UNKNOWN);
  });

  // kills M08 (allowlist compared case-insensitively)
  it("a case-variant of an allowlisted id is NOT allowlisted (base58 is case-sensitive)", () => {
    const variant = PROGRAM_IDS_V17.nft.replace("m", "M"); // 27LWMR72… — a different string, all chars base58
    expect(variant).not.toBe(PROGRAM_IDS_V17.nft);
    expect(() => resolveNftProgramOverride(env({ NFT_PROGRAM_ID: variant }))).toThrow(UNKNOWN);
    expect(() => resolveNftProgramOverride(env({ NFT_PROGRAM_ID: PROGRAM_IDS_V17.nft.toLowerCase() }))).toThrow(UNKNOWN);
  });

  // kills M09 (prefix match)
  it("an id sharing a prefix with an allowlisted id is NOT allowlisted", () => {
    const lookalike = PROGRAM_IDS_V17.nft.slice(0, 8) + FRESH_NFT.slice(8);
    expect(() => resolveNftProgramOverride(env({ NFT_PROGRAM_ID: lookalike }))).toThrow(UNKNOWN);
  });

  // kills M10 (padded value returned raw) and M12 (trimStart only)
  it.each([`  ${PROGRAM_IDS_V17.nft}  `, `${PROGRAM_IDS_V17.nft} `, `\t${PROGRAM_IDS_V17.nft}\n`])(
    "padded allowlisted id %j resolves to the exact trimmed id without the opt-in",
    (padded) => {
      expect(resolveNftProgramOverride(env({ NFT_PROGRAM_ID: padded }))).toBe(PROGRAM_IDS_V17.nft);
    },
  );

  // kills M18 (allowlisted mapped to default), M19 (mainnet dropped), M20 (devnet v1 dropped)
  it.each([
    ["mainnet", NFT_PROGRAM_IDS.mainnet],
    ["devnet v1", PROGRAM_IDS_DEVNET_V1.nft],
    ["devnet v2.2", PROGRAM_IDS_V17.nft],
  ])("allowlisted %s id resolves to ITSELF without the opt-in", (_n, id) => {
    expect(resolveNftProgramOverride(env({ NFT_PROGRAM_ID: id }))).toBe(id);
  });
});
