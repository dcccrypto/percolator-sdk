/** v2.2 share token identity, tag 122 builder, ticker rules, metadata record reader (wrapper docs/v22-lp-share-mint.md). */
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import * as S from "../src/abi/v22-lp-share.js";
import { ACCOUNTS_CREATE_LP_VAULT, ACCOUNTS_CREATE_LP_VAULT_V21, ACCOUNTS_INIT_LP_SHARE_METADATA, ACCOUNTS_INIT_LP_SHARE_METADATA_TICKER_TAIL } from "../src/abi/accounts.js";
import { ACCOUNTS_CREATE_LP_VAULT_V22 } from "../src/abi/v22-wire.js";
import * as B from "../src/solana/v22-lp-share.js";
import { encodeInitLpShareMetadataV22 } from "../src/abi/v22-wire.js";
import { deriveInsuranceLpMint, deriveLpVaultRegistry } from "../src/solana/pda.js";

const P = Keypair.generate().publicKey;
const M1 = new PublicKey(new Uint8Array(32).fill(1)); // 4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi (independent python base58)
const M2 = new PublicKey(new Uint8Array(32).fill(2)); // 8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR

describe("ticker derivation (client side: the program refuses, never truncates)", () => {
  it("uppercases, drops everything outside A-Z 0-9, keeps the first 8", () => {
    expect(S.lpShareTickerFromSymbolV22("1000pepe")).toBe("1000PEPE");
    expect(S.lpShareTickerFromSymbolV22("$wif-2")).toBe("WIF2");
    expect(S.lpShareTickerFromSymbolV22("VERYLONGSYMBOL")).toBe("VERYLONG");
    expect(S.lpShareTickerFromSymbolV22("a.b c_d")).toBe("ABCD");
    expect(S.lpShareTickerFromSymbolV22("日本")).toBe("");
    expect(S.lpShareTickerFromSymbolV22("")).toBe("");
    expect(S.lpShareTickerFromSymbolV22(undefined)).toBe("");
    // the app's own symbol limit is 20 chars of [A-Za-z0-9._-]
    expect(S.lpShareTickerFromSymbolV22("abc.def-ghi_jklmnopq")).toBe("ABCDEFGH");
  });
  it("every derived non-empty ticker passes the program check, and the check rejects what the program rejects", () => {
    for (const s of ["x", "SOL", "1000pepe", "a-b-c-d-e-f-g-h-i"]) {
      const t = S.lpShareTickerFromSymbolV22(s);
      if (t !== "") expect(S.isLpShareTickerV22(t)).toBe(true);
    }
    for (const bad of ["", "abc", "A B", "A.B", "A-B", "$A", "ABCDEFGHI", "A\0", "É"]) expect(S.isLpShareTickerV22(bad)).toBe(false);
  });
});

describe("identity = what the wrapper writes", () => {
  it("generic: `Percolator Earn Share ` + 8 market chars / pEARN", () => {
    const i = S.lpShareIdentityV22(M1, "");
    expect(i).toEqual({ name: "Percolator Earn Share 4vJ9JU1b", symbol: "pEARN", uri: "https://play.percolator.trade/api/earn-share/4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi", ticker: false });
    expect(i.name.length).toBe(30);
  });
  it("ticker, maximum length: framing leads, market fragment keeps two markets with one ticker apart (31 / 10 bytes)", () => {
    const a = S.lpShareIdentityV22(M1, "1000PEPE"), b = S.lpShareIdentityV22(M2, "1000PEPE");
    expect(a.name).toBe("Percolator Earn 1000PEPE 4vJ9JU");
    expect(b.name).toBe("Percolator Earn 1000PEPE 8qbHbw");
    expect(a.symbol).toBe("pe1000PEPE");
    expect(a.symbol).toBe(b.symbol); // same-ticker markets share a symbol (accepted, doc F6)
    expect(a.name.length).toBe(31);
    expect(a.symbol.length).toBe(10);
    expect(a.ticker).toBe(true);
    for (const t of ["A", "ABCDEFGH"]) {
      const i = S.lpShareIdentityV22(M1, t);
      expect(i.name.length).toBeLessThanOrEqual(S.MPL_MAX_NAME_LEN_V22);
      expect(i.symbol.length).toBeLessThanOrEqual(S.MPL_MAX_SYMBOL_LEN_V22);
      expect(i.uri.length).toBeLessThanOrEqual(S.MPL_MAX_URI_LEN_V22);
      expect(i.name.startsWith("Percolator Earn ")).toBe(true);
    }
  });
  it("the uri base is the build's: devnet / mainnet", () => {
    expect(S.lpShareIdentityV22(M1, "", S.LP_SHARE_URI_BASE_MAINNET_V22).uri).toBe("https://percolator.trade/api/earn-share/4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi");
  });
  it("a ticker the program would refuse throws", () => {
    expect(() => S.lpShareIdentityV22(M1, "abc")).toThrow();
    expect(() => S.lpShareIdentityV22(M1, "ABCDEFGHI")).toThrow();
  });
});

describe("tag 122 builder: accounts and data exactly as the document's table", () => {
  const payer = Keypair.generate().publicKey, auth = Keypair.generate().publicKey;
  const [registry] = deriveLpVaultRegistry(P, M1), [mint] = deriveInsuranceLpMint(P, M1);
  it("generic form: 7 accounts, data [122, 0], payer signer+writable, metadata and fee payer writable", () => {
    const ix = B.buildInitLpShareMetadataIxV22({ programId: P, market: M1, payer });
    expect([...ix.data]).toEqual([122, 0]);
    expect(ix.keys).toHaveLength(7);
    const [md] = B.deriveLpShareMetadataPdaV22(mint), [fp] = B.deriveLpShareMetaPayerPdaV22(P, mint);
    expect(ix.keys.map((k) => k.pubkey.toBase58())).toEqual([payer, registry, mint, md, S.METAPLEX_TOKEN_METADATA_PROGRAM_ID_V22, SystemProgram.programId, fp].map((k) => k.toBase58()));
    expect(ix.keys.map((k) => [k.isSigner, k.isWritable])).toEqual([[true, true], [false, false], [false, false], [false, true], [false, false], [false, false], [false, true]]);
  });
  it("ticker form: 9 accounts, [7] market read-only, [8] marketauth signer; data [122, n, ticker]", () => {
    const ix = B.buildInitLpShareMetadataIxV22({ programId: P, market: M1, payer, ticker: "BURNIE", marketauth: auth });
    expect(Buffer.from(ix.data).toString("hex")).toBe("7a06" + Buffer.from("BURNIE").toString("hex"));
    expect(ix.keys).toHaveLength(9);
    expect(ix.keys[7]).toMatchObject({ isSigner: false, isWritable: false });
    expect(ix.keys[7].pubkey.equals(M1)).toBe(true);
    expect(ix.keys[8]).toMatchObject({ isSigner: true, isWritable: false });
    expect(ix.keys[8].pubkey.equals(auth)).toBe(true);
    // marketauth may be the payer (the launch flow): same wallet in [0] and [8]
    const same = B.buildInitLpShareMetadataIxV22({ programId: P, market: M1, payer: auth, ticker: "X", marketauth: auth });
    expect(same.keys[0].pubkey.equals(same.keys[8].pubkey)).toBe(true);
  });
  it("refuses a bad ticker and a ticker without marketauth; the wire matches the v2.2 encoder", () => {
    expect(() => B.buildInitLpShareMetadataIxV22({ programId: P, market: M1, payer, ticker: "bad", marketauth: auth })).toThrow();
    expect(() => B.buildInitLpShareMetadataIxV22({ programId: P, market: M1, payer, ticker: "OK" })).toThrow(/marketauth/);
    expect(() => encodeInitLpShareMetadataV22("ABCDEFGHI")).toThrow();
    expect([...encodeInitLpShareMetadataV22("")]).toEqual([122, 0]);
  });
  it("the fee-payer PDA is [\"lp_share_meta_payer\", mint] under the wrapper (lp_share_meta_v22.rs LP_SHARE_META_PAYER_SEED)", () => {
    expect(B.deriveLpShareMetaPayerPdaV22(P, mint)[0].equals(PublicKey.findProgramAddressSync([Buffer.from("lp_share_meta_payer"), mint.toBuffer()], P)[0])).toBe(true);
  });
  it("the Metaplex metadata PDA is the canonical seeds", () => {
    const mpl = S.METAPLEX_TOKEN_METADATA_PROGRAM_ID_V22;
    expect(mpl.toBase58()).toBe("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
    expect(B.deriveLpShareMetadataPdaV22(mint)[0].equals(PublicKey.findProgramAddressSync([Buffer.from("metadata"), mpl.toBuffer(), mint.toBuffer()], mpl)[0])).toBe(true);
  });
});

const REC = "BAcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAggAAAAUGVyY29sYXRvciBFYXJuIEJVUk5JRSBCZXVtUUsAAAAKAAAAcGVCVVJOSUUAAMgAAABodHRwczovL3BsYXkucGVyY29sYXRvci50cmFkZS9hcGkvZWFybi1zaGFyZS9YAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAA=="; // mutable (generic-shaped) record, NUL-padded as after a Metaplex update
const REC_FROZEN = "BAcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAggAAAAUGVyY29sYXRvciBFYXJuIEJVUk5JRSBCZXVtUUsAAAAKAAAAcGVCVVJOSUUAAMgAAABodHRwczovL3BsYXkucGVyY29sYXRvci50cmFkZS9hcGkvZWFybi1zaGFyZS9YAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
describe("metadata record reader (NUL padding trimmed, strict)", () => {
  const raw = () => new Uint8Array(Buffer.from(REC, "base64"));
  it("parses an updated (padded) record", () => {
    const r = S.parseLpShareMetadataRecordV22(raw());
    expect(r).not.toBeNull();
    expect(r!.name).toBe("Percolator Earn BURNIE BeumQK");
    expect(r!.symbol).toBe("peBURNIE");
    expect(r!.uri).toBe("https://play.percolator.trade/api/earn-share/X");
    expect(r!.isMutable).toBe(true);
    expect(r!.updateAuthority.equals(new PublicKey(new Uint8Array(32).fill(7)))).toBe(true);
    expect(r!.mint.equals(new PublicKey(new Uint8Array(32).fill(8)))).toBe(true);
  });
  it("frozen record: is_mutable false", () => {
    const r = S.parseLpShareMetadataRecordV22(new Uint8Array(Buffer.from(REC_FROZEN, "base64")));
    expect(r).not.toBeNull();
    expect(r!.isMutable).toBe(false);
    expect(r!.symbol).toBe("peBURNIE");
  });
  it("anything that does not parse is null, never a throw", () => {
    const b = raw();
    const wrongKey = b.slice(); wrongKey[0] = 5;
    expect(S.parseLpShareMetadataRecordV22(wrongKey)).toBeNull();
    expect(S.parseLpShareMetadataRecordV22(b.slice(0, 40))).toBeNull();
    expect(S.parseLpShareMetadataRecordV22(new Uint8Array(0))).toBeNull();
    const long = b.slice(); long[65] = 255; long[66] = 255; // name length 65,535 > 32
    expect(S.parseLpShareMetadataRecordV22(long)).toBeNull();
    for (let i = 0; i < b.length; i += 7) expect(() => S.parseLpShareMetadataRecordV22(b.slice(0, i))).not.toThrow();
  });
});

describe("tag 74 on v2.2: the 7th account (collateral mint)", () => {
  it("ACCOUNTS_CREATE_LP_VAULT_V22 == ACCOUNTS_CREATE_LP_VAULT, 7 entries, [6] read-only collateralMint; the six-account list is not it", () => {
    expect(ACCOUNTS_CREATE_LP_VAULT_V22).toEqual(ACCOUNTS_CREATE_LP_VAULT);
    expect(ACCOUNTS_CREATE_LP_VAULT_V22).toHaveLength(7);
    expect(ACCOUNTS_CREATE_LP_VAULT_V22[6]).toEqual({ name: "collateralMint", signer: false, writable: false });
    expect(ACCOUNTS_CREATE_LP_VAULT_V22.slice(0, 6).map((a) => a.name)).toEqual(["admin", "market", "registry", "lpMint", "systemProgram", "tokenProgram"]);
  });
  it("tag 122 specs are the ones accounts.ts exports (one definition)", () => {
    expect(ACCOUNTS_INIT_LP_SHARE_METADATA).toBe(S.ACCOUNTS_INIT_LP_SHARE_METADATA);
    expect(ACCOUNTS_INIT_LP_SHARE_METADATA_TICKER_TAIL).toBe(S.ACCOUNTS_INIT_LP_SHARE_METADATA_TICKER_TAIL);
  });
});


describe("S1: tag 74 for the deployed v2.1 wrapper", () => {
  it("ACCOUNTS_CREATE_LP_VAULT_V21 is the first six entries of the seven-entry v2.2 list (no collateral mint)", () => {
    expect(ACCOUNTS_CREATE_LP_VAULT_V21).toHaveLength(6);
    expect(ACCOUNTS_CREATE_LP_VAULT_V21.map((a) => a.name)).toEqual(["admin", "market", "registry", "lpMint", "systemProgram", "tokenProgram"]);
    expect(ACCOUNTS_CREATE_LP_VAULT_V21).toEqual(ACCOUNTS_CREATE_LP_VAULT.slice(0, 6));
    expect(ACCOUNTS_CREATE_LP_VAULT).toHaveLength(7);
    expect(ACCOUNTS_CREATE_LP_VAULT_V21.some((a) => a.name === "collateralMint")).toBe(false);
  });
  it("the changelog calls the 6 -> 7 change breaking", async () => {
    const { readFileSync } = await import("node:fs");
    const c = readFileSync("CHANGELOG.md", "utf8");
    expect(c).toMatch(/BREAKING[\s\S]*ACCOUNTS_CREATE_LP_VAULT[\s\S]*SEVEN[\s\S]*ACCOUNTS_CREATE_LP_VAULT_V21/);
  });
});
