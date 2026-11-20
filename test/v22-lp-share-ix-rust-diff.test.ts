/**
 * Differential test: SDK tag 122 `InitLpShareMetadata` builder (`src/solana/v22-lp-share.ts`) vs the program side.
 *
 * Source of truth: percolator-prog `feat/v22-rc23-2026-10-22` @ d27f3d73.
 *   - decode            src/v16_program.rs:10915-10924 (`[122][n u8][n bytes]`, n > LP_SHARE_TICKER_MAX(8) refused)
 *   - handler           src/v16_program.rs:39896 `handle_init_lp_share_metadata` (accounts :39903-39909, :39958-39959)
 *   - seeds             src/lp_share_meta_v22.rs:90 LP_SHARE_META_PAYER_SEED, :103 MPL_METADATA_SEED;
 *                       src/v16_program.rs:1014 LP_VAULT_REGISTRY_SEED, :1015 LP_VAULT_MINT_SEED, :658 MPL program id
 *   - reference builder tests/v22_lp_share_mint.rs:937-951 `metadata_accounts`, wire :1003-1014 `tag_122_wire`
 *
 * Every expected value below is rebuilt from those Rust lines with raw `findProgramAddressSync` and literal seeds;
 * none of the SDK's own derive helpers or account specs are used to build the expectation.
 */
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { buildInitLpShareMetadataIxV22 } from "../src/solana/v22-lp-share.js";
import { deriveInsuranceLpMint, deriveLpVaultRegistry } from "../src/solana/pda.js";

const RS = "src/v16_program.rs";
const RS_META = "src/lp_share_meta_v22.rs";
const RS_TEST = "tests/v22_lp_share_mint.rs";

/** `MPL_TOKEN_METADATA_PROGRAM_ID` (src/v16_program.rs:658-659). */
const MPL = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const SYSTEM = new PublicKey("11111111111111111111111111111111");
const b = (s: string) => Buffer.from(s, "utf8");

type Ctx = { programId: PublicKey; market: PublicKey; payer: PublicKey; marketauth: PublicKey };
type Seeds = { seeds: (c: Ctx) => Buffer[]; owner: (c: Ctx) => PublicKey; text: string };

/** Rust-side mint: `derive_lp_vault_mint` = `["lp_vault_mint", market]` (src/v16_program.rs:6995-7003, seed :1015). */
const rustMint = (c: Ctx) => PublicKey.findProgramAddressSync([b("lp_vault_mint"), c.market.toBuffer()], c.programId)[0];

interface Row {
  index: number;
  name: string;
  signer: boolean;
  writable: boolean;
  /** Fixed key (program ids), the caller's key, or a PDA. */
  key: { fixed: PublicKey } | { arg: "payer" | "market" | "marketauth" } | { pda: Seeds };
  /** Where the Rust side pins this row (account index, signer / writable checks, key / PDA check). */
  rust: string[];
}

/** The tag 122 account table, row by row from the Rust handler. Rows 7 and 8 exist only when n > 0. */
const TABLE: readonly Row[] = [
  {
    index: 0, name: "payer", signer: true, writable: true, key: { arg: "payer" },
    rust: [`${RS}:39903 account(accounts, 0)`, `${RS}:39911 expect_signer(payer)`, `${RS}:39912 expect_writable(payer)`, `${RS_TEST}:939 AccountMeta::new(payer, true)`],
  },
  {
    index: 1, name: "registry", signer: false, writable: false,
    key: { pda: { seeds: (c) => [b("lp_vault"), c.market.toBuffer()], owner: (c) => c.programId, text: `["lp_vault", market] @ program` } },
    rust: [`${RS}:39904 account(accounts, 1)`, `${RS}:39915 expect_owner(registry_ai, program_id)`, `${RS}:39926-39928 derive_lp_vault_registry + expect_key`, `${RS}:1014 LP_VAULT_REGISTRY_SEED`, `${RS_TEST}:940 new_readonly(registry)`],
  },
  {
    index: 2, name: "lpMint", signer: false, writable: false,
    key: { pda: { seeds: (c) => [b("lp_vault_mint"), c.market.toBuffer()], owner: (c) => c.programId, text: `["lp_vault_mint", market] @ program` } },
    rust: [`${RS}:39905 account(accounts, 2)`, `${RS}:39929-39930 derive_lp_vault_mint + expect_key`, `${RS}:39931 == registry.lp_mint`, `${RS}:1015 LP_VAULT_MINT_SEED`, `${RS_TEST}:941 new_readonly(lp_mint)`],
  },
  {
    index: 3, name: "metadata", signer: false, writable: true,
    key: { pda: { seeds: (c) => [b("metadata"), MPL.toBuffer(), rustMint(c).toBuffer()], owner: () => MPL, text: `["metadata", MPL, mint] @ MPL` } },
    rust: [`${RS}:39906 account(accounts, 3)`, `${RS}:39913 expect_writable(metadata_ai)`, `${RS}:39941-39945 find_program_address + expect_key`, `${RS_META}:103 MPL_METADATA_SEED`, `${RS_TEST}:942 AccountMeta::new(metadata_pda)`],
  },
  {
    index: 4, name: "metaplexProgram", signer: false, writable: false, key: { fixed: MPL },
    rust: [`${RS}:39907 account(accounts, 4)`, `${RS}:39919 key == MPL && executable`, `${RS}:658-659 MPL_TOKEN_METADATA_PROGRAM_ID`, `${RS_TEST}:943 new_readonly(MPL)`],
  },
  {
    index: 5, name: "systemProgram", signer: false, writable: false, key: { fixed: SYSTEM },
    rust: [`${RS}:39908 account(accounts, 5)`, `${RS}:39916 key == system_program::ID`, `${RS_TEST}:944 new_readonly(system_program)`],
  },
  {
    index: 6, name: "feePayerPda", signer: false, writable: true,
    key: { pda: { seeds: (c) => [b("lp_share_meta_payer"), rustMint(c).toBuffer()], owner: (c) => c.programId, text: `["lp_share_meta_payer", mint] @ program` } },
    rust: [`${RS}:39909 account(accounts, 6)`, `${RS}:39914 expect_writable(meta_payer_ai)`, `${RS}:39946-39950 find_program_address + expect_key`, `${RS_META}:90 LP_SHARE_META_PAYER_SEED`, `${RS_TEST}:945 AccountMeta::new(meta_payer_pda)`],
  },
  {
    index: 7, name: "market", signer: false, writable: false, key: { arg: "market" },
    rust: [`${RS}:39958 account(accounts, 7) (n > 0 only)`, `${RS}:39960 expect_key(market_ai, registry.market_group)`, `${RS}:39961 expect_owner(market_ai, program_id)`, `${RS_TEST}:948 new_readonly(market)`],
  },
  {
    index: 8, name: "marketauth", signer: true, writable: false, key: { arg: "marketauth" },
    rust: [`${RS}:39959 account(accounts, 8) (n > 0 only)`, `${RS}:39962 expect_signer(marketauth_ai)`, `${RS}:39965 key == cfg.marketauth`, `${RS_TEST}:949 new_readonly(auth, true)`],
  },
];

function expectedKey(r: Row, c: Ctx): PublicKey {
  if ("fixed" in r.key) return r.key.fixed;
  if ("arg" in r.key) return c[r.key.arg];
  return PublicKey.findProgramAddressSync(r.key.pda.seeds(c), r.key.pda.owner(c))[0];
}

/** Wire per Rust decode (src/v16_program.rs:10915-10924) and `tag_122_wire` (tests/v22_lp_share_mint.rs:1003-1014). */
function rustWire(ticker: string): Buffer {
  const t = Buffer.from(ticker, "ascii");
  if (t.length > 8) throw new Error("decode refuses n > 8");
  return Buffer.concat([Buffer.from([122, t.length]), t]);
}

function ctx(seed: number, sameAuth = false): Ctx {
  const k = (n: number) => Keypair.fromSeed(new Uint8Array(32).fill((seed * 7 + n) & 0xff)).publicKey;
  const payer = k(3);
  return { programId: k(1), market: k(2), payer, marketauth: sameAuth ? payer : k(4) };
}

const FORMS = [
  { label: "generic (n = 0)", ticker: "", rows: 7 },
  { label: "ticker n = 1", ticker: "A", rows: 9 },
  { label: "ticker n = 8", ticker: "ABCDEFG8", rows: 9 },
] as const;

describe("tag 122 InitLpShareMetadata: SDK builder vs Rust handler (prog d27f3d73)", () => {
  it("the table has one row per handler index, each citing the Rust file:line", () => {
    expect(TABLE.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    for (const r of TABLE) {
      expect(r.rust.length).toBeGreaterThan(0);
      for (const ref of r.rust) expect(ref).toMatch(/^(src|tests)\/[\w/]+\.rs:\d+/);
    }
  });

  for (const f of FORMS) {
    for (const sameAuth of f.ticker === "" ? [false] : [false, true]) {
      for (const seed of [1, 2, 3]) {
        const tag = `${f.label}${sameAuth ? ", payer == marketauth" : ""}, ctx ${seed}`;
        it(`${tag}: every account row matches (index, key, signer, writable)`, () => {
          const c = ctx(seed, sameAuth);
          const ix = buildInitLpShareMetadataIxV22({ programId: c.programId, market: c.market, payer: c.payer, ticker: f.ticker, marketauth: f.ticker === "" ? undefined : c.marketauth });
          expect(ix.programId.equals(c.programId)).toBe(true);
          expect(ix.keys.length).toBe(f.rows);
          for (const r of TABLE.slice(0, f.rows)) {
            const got = ix.keys[r.index];
            const want = expectedKey(r, c);
            expect({ row: r.name, key: got.pubkey.toBase58(), signer: got.isSigner, writable: got.isWritable }, r.rust.join(" | ")).toEqual({
              row: r.name, key: want.toBase58(), signer: r.signer, writable: r.writable,
            });
          }
          expect(ix.data.equals(rustWire(f.ticker))).toBe(true);
        });
      }
    }
  }

  it("payer == marketauth: [0] and [8] carry the same key, [0] signer+writable and [8] signer read-only (tests/v22_lp_share_mint.rs:1504)", () => {
    const c = ctx(9, true);
    const ix = buildInitLpShareMetadataIxV22({ programId: c.programId, market: c.market, payer: c.payer, ticker: "SOL", marketauth: c.payer });
    expect(ix.keys[0].pubkey.equals(ix.keys[8].pubkey)).toBe(true);
    expect([ix.keys[0].isSigner, ix.keys[0].isWritable, ix.keys[8].isSigner, ix.keys[8].isWritable]).toEqual([true, true, true, false]);
  });

  it("lpMint / registry equal the SDK helpers deriveInsuranceLpMint / deriveLpVaultRegistry AND the Rust seeds", () => {
    for (const seed of [1, 2, 3, 4]) {
      const c = ctx(seed);
      const ix = buildInitLpShareMetadataIxV22({ programId: c.programId, market: c.market, payer: c.payer });
      expect(ix.keys[1].pubkey.equals(deriveLpVaultRegistry(c.programId, c.market)[0])).toBe(true);
      expect(ix.keys[2].pubkey.equals(deriveInsuranceLpMint(c.programId, c.market)[0])).toBe(true);
      expect(ix.keys[1].pubkey.equals(expectedKey(TABLE[1], c))).toBe(true);
      expect(ix.keys[2].pubkey.equals(rustMint(c))).toBe(true);
      // The metadata and fee-payer PDAs hang off the MINT, not the market (src/v16_program.rs:39942, :39947).
      expect(ix.keys[3].pubkey.equals(PublicKey.findProgramAddressSync([b("metadata"), MPL.toBuffer(), c.market.toBuffer()], MPL)[0])).toBe(false);
      expect(ix.keys[6].pubkey.equals(PublicKey.findProgramAddressSync([b("lp_share_meta_payer"), c.market.toBuffer()], c.programId)[0])).toBe(false);
    }
  });

  it("data bytes for ticker lengths 0, 1 and 8 equal the Rust wire literally", () => {
    const c = ctx(5);
    const build = (ticker: string) => buildInitLpShareMetadataIxV22({ programId: c.programId, market: c.market, payer: c.payer, ticker, marketauth: c.marketauth }).data;
    expect([...build("")]).toEqual([122, 0]);
    expect([...build("Z")]).toEqual([122, 1, 0x5a]);
    expect([...build("ABCDEFGH")]).toEqual([122, 8, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48]);
    expect([...build("SOL")]).toEqual([122, 3, 0x53, 0x4f, 0x4c]); // tests/v22_lp_share_mint.rs:1005
    expect(build("ABCDEFGH").length).toBe(10); // tests/v22_lp_share_mint.rs:1006
  });

  it("refuses what the program refuses: n > 8 (decode :10917), non A-Z0-9 (ticker_ok lp_share_meta_v22.rs:143), ticker without marketauth (:39959)", () => {
    const c = ctx(6);
    const build = (ticker: string, marketauth?: PublicKey) => () => buildInitLpShareMetadataIxV22({ programId: c.programId, market: c.market, payer: c.payer, ticker, marketauth });
    expect(build("ABCDEFGHI", c.marketauth)).toThrow();
    expect(build("sol", c.marketauth)).toThrow();
    expect(build("SO-L", c.marketauth)).toThrow();
    expect(build("SOL")).toThrow(/marketauth/);
    // Generic form: marketauth is ignored, so the tail is never appended (Rust reads [7]/[8] only when n > 0).
    expect(buildInitLpShareMetadataIxV22({ programId: c.programId, market: c.market, payer: c.payer, marketauth: c.marketauth }).keys.length).toBe(7);
  });

  it("the system program constant is the one web3.js exposes", () => {
    expect(SystemProgram.programId.equals(SYSTEM)).toBe(true);
  });
});
