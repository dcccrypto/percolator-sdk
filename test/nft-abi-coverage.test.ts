/**
 * Coverage for src/abi/nft.ts encoders, meta builder, u16/u64 guards, PDA derivation and the
 * state-parse guards. Tests only; env is injected via resolveNftProgramOverride's reader
 * (process.env is never mutated).
 *
 * Byte pins: the NFT program's wire tags are fixed by the SDK's own tag table (NFT_IX_TAG) and its
 * header doc (src/abi/nft.ts:5-12: Mint=0, Burn=1, SettleFunding=2, GetPositionValue=3,
 * ExecuteTransferHook=4, EmergencyBurn=5, RepairExtraMetas=6, ReconcileBurnedNft=7; Mint data =
 * tag + asset_index u16 LE, src/abi/nft.ts:107). The percolator-nft program source is not
 * checked out in this environment, so the pins below are literal bytes (not derived from
 * NFT_IX_TAG) to catch a drifted tag table.
 */
import { describe, expect, it, vi } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  ACCOUNTS_NFT_BURN,
  ACCOUNTS_NFT_EMERGENCY_BURN,
  ACCOUNTS_NFT_MINT,
  ACCOUNTS_NFT_RECONCILE,
  NFT_IX_TAG,
  NFT_PROGRAM_ID,
  buildNftAccountMetas,
  deriveExtraAccountMetas,
  deriveMintAuthority,
  deriveNftMint,
  deriveNftPda,
  encodeNftBurn,
  encodeNftEmergencyBurn,
  encodeNftMint,
  encodeNftReconcile,
  encodeNftSettleFunding,
  getNftProgramId,
  parsePositionNftAccount,
  resolveNftProgramOverride,
} from "../src/abi/nft.js";
import { PROGRAM_IDS_DEVNET_V1, PROGRAM_IDS_V17 } from "../src/config/program-ids.js";

const env = (o: Record<string, string>) => (k: string) => o[k];
const k = () => Keypair.generate().publicKey;
const OTHER_PROGRAM = PROGRAM_IDS_DEVNET_V1.nft === PROGRAM_IDS_V17.nft ? k().toBase58() : PROGRAM_IDS_DEVNET_V1.nft;

describe("NFT encoders (literal byte pins)", () => {
  it("tag table", () => {
    expect(NFT_IX_TAG).toEqual({
      MintPositionNft: 0, BurnPositionNft: 1, SettleFunding: 2, GetPositionValue: 3,
      ExecuteTransferHook: 4, EmergencyBurn: 5, RepairExtraMetas: 6, ReconcileBurnedNft: 7,
    });
  });
  it("encodeNftMint = [0, u16 LE]", () => {
    expect([...encodeNftMint(0)]).toEqual([0, 0, 0]);
    expect([...encodeNftMint(0x0102)]).toEqual([0, 0x02, 0x01]);
    expect([...encodeNftMint(0xffff)]).toEqual([0, 0xff, 0xff]);
  });
  it("single-byte encoders", () => {
    expect([...encodeNftBurn()]).toEqual([1]);
    expect([...encodeNftSettleFunding()]).toEqual([2]);
    expect([...encodeNftEmergencyBurn()]).toEqual([5]);
    expect([...encodeNftReconcile()]).toEqual([7]);
  });
  it("encodeNftMint rejects non-u16 (negative controls)", () => {
    for (const bad of [-1, 0x10000, 1.5, NaN, Infinity]) {
      expect(() => encodeNftMint(bad)).toThrow(/assetIndex must be a u16/);
    }
  });
});

describe("buildNftAccountMetas", () => {
  it("maps shorthand codes to signer/writable flags", () => {
    const keys = [k(), k(), k(), k()];
    const m = buildNftAccountMetas(["s", "w", "sw", "r"], keys);
    expect(m.map((x) => [x.isSigner, x.isWritable])).toEqual([
      [true, false], [false, true], [true, true], [false, false],
    ]);
    expect(m.map((x) => x.pubkey)).toEqual(keys);
  });
  it("throws on count mismatch (both directions)", () => {
    expect(() => buildNftAccountMetas(["s", "w"], [k()])).toThrow(/expected 2, got 1/);
    expect(() => buildNftAccountMetas(["s"], [k(), k()])).toThrow(/expected 1, got 2/);
  });
  it("template lengths match the documented account counts", () => {
    expect(ACCOUNTS_NFT_MINT).toHaveLength(12);
    expect(ACCOUNTS_NFT_BURN).toHaveLength(10);
    expect(ACCOUNTS_NFT_EMERGENCY_BURN).toHaveLength(10);
    expect(ACCOUNTS_NFT_RECONCILE).toHaveLength(9);
    const m = buildNftAccountMetas(ACCOUNTS_NFT_MINT, Array.from({ length: 12 }, k));
    expect(m[0]).toMatchObject({ isSigner: true, isWritable: true });
    expect(m[2]).toMatchObject({ isSigner: true, isWritable: true });
  });
});

describe("PDA derivation", () => {
  const portfolio = k();
  it("default program id and getNftProgramId agree", () => {
    expect(getNftProgramId().equals(NFT_PROGRAM_ID)).toBe(true);
  });
  it("deriveNftPda matches manual seeds; bigint === number; programId changes the PDA", () => {
    const seed = Buffer.alloc(8);
    seed.writeBigUInt64LE(77n);
    const [expected, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("position_nft"), portfolio.toBuffer(), seed], NFT_PROGRAM_ID);
    const [a, ab] = deriveNftPda(portfolio, 77n);
    expect(a.equals(expected)).toBe(true);
    expect(ab).toBe(bump);
    expect(deriveNftPda(portfolio, 77)[0].equals(a)).toBe(true);
    const other = new PublicKey(OTHER_PROGRAM);
    const [b] = deriveNftPda(portfolio, 77n, other);
    expect(b.equals(a)).toBe(false);
    const [exp2] = PublicKey.findProgramAddressSync(
      [Buffer.from("position_nft"), portfolio.toBuffer(), seed], other);
    expect(b.equals(exp2)).toBe(true);
  });
  it("u64 guard: boundaries and negative controls", () => {
    expect(() => deriveNftPda(portfolio, 0xffff_ffff_ffff_ffffn)).not.toThrow();
    expect(() => deriveNftPda(portfolio, 0)).not.toThrow();
    expect(() => deriveNftPda(portfolio, -1n)).toThrow(/marketId must be a u64/);
    expect(() => deriveNftPda(portfolio, 0x1_0000_0000_0000_0000n)).toThrow(/marketId must be a u64/);
  });
  it("mint authority and extra metas derive under the given program", () => {
    const mint = k();
    const other = new PublicKey(OTHER_PROGRAM);
    const [ma] = deriveMintAuthority();
    expect(ma.equals(PublicKey.findProgramAddressSync([Buffer.from("mint_authority")], NFT_PROGRAM_ID)[0])).toBe(true);
    expect(deriveMintAuthority(other)[0].equals(ma)).toBe(false);
    const [em] = deriveExtraAccountMetas(mint);
    expect(em.equals(PublicKey.findProgramAddressSync(
      [Buffer.from("extra-account-metas"), mint.toBuffer()], NFT_PROGRAM_ID)[0])).toBe(true);
    expect(deriveExtraAccountMetas(mint, other)[0].equals(em)).toBe(false);
  });
  it("deprecated deriveNftMint always throws", () => {
    expect(() => deriveNftMint(portfolio, 0)).toThrow(/fresh signer keypair/);
  });
});

describe("resolveNftProgramOverride (injected env)", () => {
  it("default reader (process.env) returns undefined or a valid value without throwing in a clean env", () => {
    expect(() => resolveNftProgramOverride()).not.toThrow();
  });
  it("allowlisted devnet-v1 and mainnet ids pass with no opt-in", () => {
    expect(resolveNftProgramOverride(env({ NFT_PROGRAM_ID: PROGRAM_IDS_DEVNET_V1.nft }))).toBe(PROGRAM_IDS_DEVNET_V1.nft);
  });
  it("trims whitespace around an allowlisted value", () => {
    expect(resolveNftProgramOverride(env({ NFT_PROGRAM_ID: ` ${PROGRAM_IDS_V17.nft} ` }))).toBe(PROGRAM_IDS_V17.nft);
  });
  it("unlisted + opt-in '1' but invalid base58 throws and does not warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => resolveNftProgramOverride(env({ NFT_PROGRAM_ID: "0OIl", PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE: "1" }))).toThrow();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it("unlisted without opt-in throws (listing the allowlist)", () => {
    const fresh = k().toBase58();
    expect(() => resolveNftProgramOverride(env({ NFT_PROGRAM_ID: fresh }))).toThrow(/Allowed values:/);
  });
});

describe("parsePositionNftAccount guards", () => {
  it("too small", () => {
    expect(() => parsePositionNftAccount(new Uint8Array(10))).toThrow(/too small/);
  });
  it("bad magic", () => {
    expect(() => parsePositionNftAccount(new Uint8Array(239))).toThrow(/invalid magic/);
  });
  it("bad version", () => {
    const d = new Uint8Array(239);
    new DataView(d.buffer).setBigUint64(0, 0x5045_5243_4e46_5400n, true);
    d[8] = 9;
    expect(() => parsePositionNftAccount(d)).toThrow(/invalid version: 9/);
  });
});
