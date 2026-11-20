/**
 * Differential test: src/abi/v22-lp-share.ts against percolator-prog `src/lp_share_meta_v22.rs` and `tests/v22_lp_share_mint.rs`,
 * pinned to percolator-prog `d27f3d73` (branch feat/v22-rc23-2026-10-22).
 *
 *   ticker_ok        lp_share_meta_v22.rs:143  <-> isLpShareTickerV22         src/abi/v22-lp-share.ts:51
 *   ticker_name      lp_share_meta_v22.rs:160  <-> lpShareIdentityV22 (name)  src/abi/v22-lp-share.ts:67
 *   ticker_symbol    lp_share_meta_v22.rs:174  <-> lpShareIdentityV22 (symbol)
 *   share_identity   lp_share_meta_v22.rs:201  <-> lpShareIdentityV22
 *   take_str         lp_share_meta_v22.rs:328  <-> parseLpShareMetadataRecordV22 takeStr src/abi/v22-lp-share.ts:106
 *   record_state     lp_share_meta_v22.rs:343  <-> parseLpShareMetadataRecordV22 (layout half; owner / authority / mint checks are the caller's)
 *
 * Part 1 reads the Rust consts textually with `git show d27f3d73:<path>` from a local percolator-prog checkout
 * (`PERCOLATOR_PROG_DIR`, else `../percolator-prog` or `../../percolator-prog` from this repo). It is skipped when no checkout with that
 * commit is found (CI); the pinned literal table in part 1b always runs, and part 1 also proves that table equals the Rust source.
 * Part 2 ports every expected string / byte vector of the Rust tests. Part 3 adds edge rows.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  LP_SHARE_GENERIC_SYMBOL_V22,
  LP_SHARE_META_FUND_LAMPORTS_V22,
  LP_SHARE_NAME_MARKET_CHARS_V22,
  LP_SHARE_NAME_PREFIX_V22,
  LP_SHARE_SYMBOL_PREFIX_V22,
  LP_SHARE_TICKER_MAX_V22,
  LP_SHARE_TICKER_NAME_MARKET_CHARS_V22,
  LP_SHARE_TICKER_NAME_PREFIX_V22,
  LP_SHARE_URI_BASE_DEVNET_V22,
  LP_SHARE_URI_BASE_MAINNET_V22,
  LP_SHARE_URI_PATH_V22,
  METAPLEX_TOKEN_METADATA_PROGRAM_ID_V22,
  MPL_MAX_NAME_LEN_V22,
  MPL_MAX_SYMBOL_LEN_V22,
  MPL_MAX_URI_LEN_V22,
  isLpShareTickerV22,
  lpShareIdentityV22,
  parseLpShareMetadataRecordV22,
} from "../src/abi/v22-lp-share.js";
import { deriveLpShareMetaPayerPdaV22, deriveLpShareMetadataPdaV22 } from "../src/solana/v22-lp-share.js";

const PROG_COMMIT = "d27f3d73";
const RS_META = "src/lp_share_meta_v22.rs";
const RS_TESTS = "tests/v22_lp_share_mint.rs";
const RS_V16 = "src/v16_program.rs";

const te = new TextEncoder();
const bytes = (s: string) => te.encode(s);
const latin1 = (b: Uint8Array) => String.fromCharCode(...b);

// ── part 1b: the Rust consts at d27f3d73, as literals (line numbers in lp_share_meta_v22.rs) ─────────────────────────────────────────
// `[line, rust name, rust value, TS value]`. Part 1 proves each `rust value` against `git show`.
const PINNED: ReadonlyArray<readonly [number, string, string | number | bigint, string | number | bigint]> = [
  [38, "LP_SHARE_NAME_PREFIX", "Percolator Earn Share ", LP_SHARE_NAME_PREFIX_V22],
  [40, "LP_SHARE_NAME_MARKET_CHARS", 8, LP_SHARE_NAME_MARKET_CHARS_V22],
  [44, "LP_SHARE_GENERIC_SYMBOL", "pEARN", LP_SHARE_GENERIC_SYMBOL_V22],
  [47, "LP_SHARE_TICKER_NAME_PREFIX", "Percolator Earn ", LP_SHARE_TICKER_NAME_PREFIX_V22],
  [49, "LP_SHARE_TICKER_NAME_MARKET_CHARS", 6, LP_SHARE_TICKER_NAME_MARKET_CHARS_V22],
  [51, "LP_SHARE_SYMBOL_PREFIX", "pe", LP_SHARE_SYMBOL_PREFIX_V22],
  [53, "LP_SHARE_TICKER_MAX", 8, LP_SHARE_TICKER_MAX_V22],
  [56, "MPL_MAX_NAME_LEN", 32, MPL_MAX_NAME_LEN_V22],
  [57, "MPL_MAX_SYMBOL_LEN", 10, MPL_MAX_SYMBOL_LEN_V22],
  [58, "MPL_MAX_URI_LEN", 200, MPL_MAX_URI_LEN_V22],
  [69, "LP_SHARE_URI_BASE_DEVNET", "https://play.percolator.trade", LP_SHARE_URI_BASE_DEVNET_V22],
  [75, "LP_SHARE_URI_BASE_MAINNET", "https://percolator.trade", LP_SHARE_URI_BASE_MAINNET_V22],
  [82, "LP_SHARE_URI_PATH", "/api/earn-share/", LP_SHARE_URI_PATH_V22],
  [94, "LP_SHARE_META_FUND_LAMPORTS", 30_000_000n, LP_SHARE_META_FUND_LAMPORTS_V22],
];
/** Consts the TS module keeps private or encodes as behaviour; part 1 still proves the Rust value. */
const PINNED_BEHAVIOUR: ReadonlyArray<readonly [number, string, string | number]> = [
  [42, "LP_SHARE_GENERIC_NAME_LEN", "22 + LP_SHARE_NAME_MARKET_CHARS"],
  [90, "LP_SHARE_META_PAYER_SEED", "lp_share_meta_payer"],
  [103, "MPL_METADATA_SEED", "metadata"],
  [105, "MPL_KEY_METADATA_V1", 4],
];
/** The Rust functions this file diffs, by line at d27f3d73. */
const RUST_FN_LINES: ReadonlyArray<readonly [number, string]> = [
  [143, "pub fn ticker_ok(ticker: &[u8]) -> bool {"],
  [160, "pub fn ticker_name(market: &[u8; 32], ticker: &[u8]) -> Option<Vec<u8>> {"],
  [174, "pub fn ticker_symbol(ticker: &[u8]) -> Option<Vec<u8>> {"],
  [201, "pub fn share_identity(market: &[u8; 32], ticker: &[u8]) -> Option<(Vec<u8>, Vec<u8>, Vec<u8>)> {"],
  [328, "fn take_str<'a>(data: &'a [u8], o: &mut usize, max: usize) -> Option<&'a [u8]> {"],
  [343, "pub fn record_state(data: &[u8], registry: &[u8; 32], mint: &[u8; 32], market: &[u8; 32]) -> RecordState {"],
];

// ── part 1: textual read of the Rust source ───────────────────────────────────────────────────────────────────────────────────────
function findProg(): string | null {
  const repo = fileURLToPath(new URL("..", import.meta.url));
  const cands = [process.env.PERCOLATOR_PROG_DIR, resolve(repo, "../percolator-prog"), resolve(repo, "../../percolator-prog")];
  for (const c of cands) {
    if (!c || !existsSync(c)) continue;
    try {
      execFileSync("git", ["-C", c, "cat-file", "-e", `${PROG_COMMIT}^{commit}`], { stdio: "ignore" });
      return c;
    } catch {
      /* not this one */
    }
  }
  return null;
}
const PROG = findProg();
const gitShow = (path: string) => execFileSync("git", ["-C", PROG!, "show", `${PROG_COMMIT}:${path}`], { encoding: "utf8", maxBuffer: 1 << 26 });

/** `pub const NAME: T = VALUE;` on one line -> VALUE as a JS value (`b"..."` / `"..."` -> string, integer -> number or bigint for u64). */
function rustConst(src: string, name: string): { line: number; value: string | number | bigint } {
  const lines = src.split("\n");
  const re = new RegExp(`^pub const ${name}: ([^=]+) = (.+);$`);
  const hits = lines.map((l, i) => [i + 1, re.exec(l)] as const).filter(([, m]) => m);
  if (hits.length !== 1) throw new Error(`${name}: ${hits.length} definitions`);
  const [line, m] = hits[0];
  const [ty, raw] = [m![1].trim(), m![2].trim()];
  const s = /^b?"((?:[^"\\]|\\.)*)"$/.exec(raw);
  if (s) return { line, value: s[1] };
  if (/^[0-9_]+$/.test(raw)) return { line, value: ty === "u64" ? BigInt(raw.replace(/_/g, "")) : Number(raw.replace(/_/g, "")) };
  return { line, value: raw };
}

describe.skipIf(!PROG)(`Rust source at percolator-prog ${PROG_COMMIT} (git show)`, () => {
  const src = PROG ? gitShow(RS_META) : "";

  it.each(PINNED)(`lp_share_meta_v22.rs:%i %s == the pinned literal == the TS const`, (line, name, pinned, ts) => {
    const r = rustConst(src, name);
    expect(r.line).toBe(line);
    expect(r.value).toStrictEqual(pinned);
    expect(ts).toStrictEqual(r.value);
  });

  it.each(PINNED_BEHAVIOUR)(`lp_share_meta_v22.rs:%i %s == the pinned literal`, (line, name, pinned) => {
    const r = rustConst(src, name);
    expect(r.line).toBe(line);
    expect(r.value).toStrictEqual(pinned);
  });

  it("byte-array types match the literal lengths (Rust `&[u8; N]`)", () => {
    for (const [name, n, ts] of [
      ["LP_SHARE_NAME_PREFIX", 22, LP_SHARE_NAME_PREFIX_V22],
      ["LP_SHARE_GENERIC_SYMBOL", 5, LP_SHARE_GENERIC_SYMBOL_V22],
      ["LP_SHARE_TICKER_NAME_PREFIX", 16, LP_SHARE_TICKER_NAME_PREFIX_V22],
      ["LP_SHARE_SYMBOL_PREFIX", 2, LP_SHARE_SYMBOL_PREFIX_V22],
    ] as const) {
      expect(src).toContain(`pub const ${name}: &[u8; ${n}] = b"`);
      expect(bytes(ts).length).toBe(n);
    }
  });

  it.each(RUST_FN_LINES)(`lp_share_meta_v22.rs:%i is the diffed function`, (line, sig) => {
    expect(src.split("\n")[line - 1]).toBe(sig);
  });

  it("the rules the TS mirrors are still the Rust bodies (charset, NUL trim, creators cap, is_mutable)", () => {
    expect(src).toContain("&& ticker.iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())");
    expect(src).toContain("let end = s.iter().rposition(|b| *b != 0).map(|p| p + 1).unwrap_or(0);");
    expect(src).toContain("if n > 5 {");
    expect(src).toMatch(/let is_mutable = match take\(data, &mut o, 1\)\? \{\s+\[0\] => false,\s+\[1\] => true,\s+_ => return None,/);
    expect(src).toContain("let name = take_str(data, &mut o, MPL_MAX_NAME_LEN)?;");
    expect(src).toContain("let symbol = take_str(data, &mut o, MPL_MAX_SYMBOL_LEN)?;");
    expect(src).toContain("let uri = take_str(data, &mut o, MPL_MAX_URI_LEN)?;");
  });

  it("Metaplex program id and the PDA seeds (v16_program.rs, tests/v22_lp_share_mint.rs)", () => {
    expect(src).toContain("pub const MPL_PROGRAM_ID: Pubkey = crate::constants::MPL_TOKEN_METADATA_PROGRAM_ID;");
    const v16 = gitShow(RS_V16);
    const m = /pub const MPL_TOKEN_METADATA_PROGRAM_ID: solana_program::pubkey::Pubkey =\s+solana_program::pubkey!\("([1-9A-HJ-NP-Za-km-z]+)"\);/.exec(v16);
    expect(m?.[1]).toBe(METAPLEX_TOKEN_METADATA_PROGRAM_ID_V22.toBase58());
    const tests = gitShow(RS_TESTS);
    expect(tests).toContain('&[b"metadata", MPL_TOKEN_METADATA_PROGRAM_ID.as_ref(), mint.as_ref()],');
    expect(tests).toContain('Pubkey::find_program_address(&[b"lp_share_meta_payer", env.lp_mint.as_ref()], &env.program_id).0');
  });

  it("every ported vector list in part 2 is still verbatim in the Rust tests", () => {
    const tests = gitShow(RS_TESTS);
    expect(src).toContain(`for ok in ["A", "Z", "0", "9", "SOL", "BURNIE", "1000PEPE", "ABCDEFGH"] {`);
    expect(src).toContain(`for bad in ["", "ABCDEFGHI", "sol", "Sol", "SO L", "SOL ", " SOL", "SOL-", "SO.L", "$SOL", "SOL\\0", "S\\u{00d6}L", "USDC\\n"] {`);
    expect(src).toContain(`for t in ["A", "SOL", "USDC", "BURNIE", "ABCDEFGH", "99999999"] {`);
    expect(tests).toContain(
      `for bad in [&b"sol"[..], b"Sol", b"SO L", b"SOL ", b" SOL", b"SOL-", b"SO.L", b"$SOL", b"SOL\\0", b"\\xc3\\x96L", b"A\\n", b"USDC\\xc2\\xb7"] {`,
    );
    expect(tests).toContain(`format!("https://play.percolator.trade/api/earn-share/{}", env.market)`);
    expect(tests).toContain(`name: format!("Percolator Earn Share {}", &env.market.to_string()[..8]),`);
    expect(tests).toContain(`name: format!("Percolator Earn {t} {}", &env.market.to_string()[..6]),`);
    expect(tests).toContain(`for f in [&b"USD Coin"[..], b"USDC", b"https://evil.example/usdc.json"] {`);
  });
});

describe("pinned Rust consts (d27f3d73) == TS consts (runs without a percolator-prog checkout)", () => {
  it.each(PINNED)(`lp_share_meta_v22.rs:%i %s`, (_line, _name, pinned, ts) => {
    expect(ts).toStrictEqual(pinned);
  });
  it("seeds: metadata PDA and fee-payer PDA use the Rust seeds", () => {
    const mint = new PublicKey(new Uint8Array(32).fill(2));
    const prog = new PublicKey(new Uint8Array(32).fill(3));
    expect(deriveLpShareMetadataPdaV22(mint)).toEqual(
      PublicKey.findProgramAddressSync([bytes("metadata"), METAPLEX_TOKEN_METADATA_PROGRAM_ID_V22.toBytes(), mint.toBytes()], METAPLEX_TOKEN_METADATA_PROGRAM_ID_V22),
    );
    expect(deriveLpShareMetaPayerPdaV22(prog, mint)).toEqual(PublicKey.findProgramAddressSync([bytes("lp_share_meta_payer"), mint.toBytes()], prog));
    expect(METAPLEX_TOKEN_METADATA_PROGRAM_ID_V22.toBase58()).toBe("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
  });
});

// ── part 2: Rust test vectors ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** Port of `base58_encode` (lp_share_meta_v22.rs:111), so the expected names do not depend on web3.js's encoder. */
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function rustBase58(key: Uint8Array): string {
  const digits = new Array<number>(45).fill(0);
  let len = 0;
  for (const byte of key) {
    let carry = byte;
    for (let i = 0; i < len; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits[len++] = carry % 58;
      carry = Math.floor(carry / 58);
    }
  }
  let zeros = 0;
  while (zeros < key.length && key[zeros] === 0) zeros++;
  let out = "1".repeat(zeros);
  for (let d = len - 1; d >= 0; d--) out += B58[digits[d]];
  return out;
}
const fill = (b: number) => new Uint8Array(32).fill(b);
const pk = (k: Uint8Array) => new PublicKey(k);
function xorshiftKeys(n: number): Uint8Array[] {
  // lp_share_meta_v22.rs:419-428 (base58_matches_pubkey_display)
  let st = 0x9e3779b97f4a7c15n;
  const M = (1n << 64n) - 1n;
  const out: Uint8Array[] = [];
  for (let j = 0; j < n; j++) {
    const k = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      st ^= (st << 13n) & M;
      st ^= st >> 7n;
      st ^= (st << 17n) & M;
      k[i] = Number(st & 0xffn);
    }
    out.push(k);
  }
  return out;
}

/** Literal base58 pins for the markets the vectors use (Pubkey::to_string). */
const MARKETS: ReadonlyArray<readonly [string, Uint8Array, string]> = [
  ["[0;32]", fill(0), "11111111111111111111111111111111"],
  ["[0xff;32]", fill(0xff), "JEKNVnkbo3jma5nREBBJCDoXFVeKkD56V3xKrvRmWxFG"],
  ["[1;32] (ticker_charset_and_length market)", fill(1), "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi"],
  ["[0xaa;32] (same_ticker market a)", fill(0xaa), "CVDFLCAjXhVWiPXH9nTCTpCgVzmDVoiPzNJYuccr1dqB"],
  ["[0x55;32] (same_ticker market b)", fill(0x55), "6k78AbasGMFFrhG95Pj6jQbqkVt7FQMhVgemxJovWKR6"],
  ["[9;32] (record_state other market)", fill(9), "cGfHiC6Kgg3FpFZvgwGcswsCRtp4aBP2fzuXRQPizuN"],
  ["[0..0,1]", Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? 1 : 0)), "11111111111111111111111111111112"],
];

describe("part 2: vectors from lp_share_meta_v22.rs #[cfg(test)] and tests/v22_lp_share_mint.rs", () => {
  it.each(MARKETS)("base58 %s: Rust port == literal == web3.js", (_n, key, b58) => {
    expect(rustBase58(key)).toBe(b58);
    expect(pk(key).toBase58()).toBe(b58);
  });

  it("base58_matches_pubkey_display (lp_share_meta_v22.rs:408): leading-zero sweep and 2000 xorshift keys", () => {
    for (let z = 1; z <= 31; z++) {
      const k = fill(0xab);
      k.fill(0, 0, z);
      expect(pk(k).toBase58()).toBe(rustBase58(k));
    }
    for (const k of xorshiftKeys(2000)) expect(pk(k).toBase58()).toBe(rustBase58(k));
  });

  // ticker_charset_and_length (lp_share_meta_v22.rs:461-475)
  it.each(["A", "Z", "0", "9", "SOL", "BURNIE", "1000PEPE", "ABCDEFGH"])("ticker_ok(%j) = true (rs:462)", (t) => {
    expect(isLpShareTickerV22(t)).toBe(true);
    expect(lpShareIdentityV22(pk(fill(1)), t).ticker).toBe(true);
  });
  it.each(["", "ABCDEFGHI", "sol", "Sol", "SO L", "SOL ", " SOL", "SOL-", "SO.L", "$SOL", "SOL\0", "SÖL", "USDC\n"])(
    "ticker_ok(%j) = false; share_identity None for non-empty (rs:465)",
    (t) => {
      expect(isLpShareTickerV22(t)).toBe(false);
      if (t !== "") expect(() => lpShareIdentityV22(pk(fill(1)), t)).toThrow(/ticker must be/);
    },
  );
  it("ticker_ok on every single byte 0..=255 (rs:472): only A-Z and 0-9", () => {
    for (let b = 0; b <= 255; b++) {
      const want = (b >= 0x41 && b <= 0x5a) || (b >= 0x30 && b <= 0x39);
      expect(isLpShareTickerV22(String.fromCharCode(b)), `byte ${b}`).toBe(want);
    }
  });

  // bad_tickers_are_refused_even_from_marketauth (tests/v22_lp_share_mint.rs:1158): raw bytes, read as UTF-8 and as latin1
  const BAD_BYTES: Uint8Array[] = [
    "sol", "Sol", "SO L", "SOL ", " SOL", "SOL-", "SO.L", "$SOL", "SOL\0",
  ].map(bytes).concat([Uint8Array.of(0xc3, 0x96, 0x4c), Uint8Array.of(0x41, 0x0a), Uint8Array.of(0x55, 0x53, 0x44, 0x43, 0xc2, 0xb7)]);
  it.each(BAD_BYTES.map((b) => [Array.from(b).join(","), b] as const))("marketauth bad ticker bytes [%s] refused (v22_lp_share_mint.rs:1158)", (_s, b) => {
    for (const t of [new TextDecoder().decode(b), latin1(b)]) {
      expect(isLpShareTickerV22(t)).toBe(false);
      expect(() => lpShareIdentityV22(pk(fill(1)), t)).toThrow();
    }
  });

  // framing_leads_and_names_fit (lp_share_meta_v22.rs:480-503) on every pinned market (Rust uses Pubkey::new_unique)
  const FRAMING = ["A", "SOL", "USDC", "BURNIE", "ABCDEFGH", "99999999"];
  it.each(MARKETS)("framing_leads_and_names_fit (rs:483) on market %s", (_n, key, m) => {
    for (const t of FRAMING) {
      const id = lpShareIdentityV22(pk(key), t);
      expect(id.name).toBe(`Percolator Earn ${t} ${m.slice(0, 6)}`);
      expect(id.symbol).toBe(`pe${t}`);
      expect(id.name.startsWith("Percolator Earn ")).toBe(true);
      expect(id.symbol.startsWith("pe")).toBe(true);
      expect(bytes(id.name).length).toBeLessThanOrEqual(32);
      expect(bytes(id.symbol).length).toBeLessThanOrEqual(10);
      expect(isLpShareTickerV22(id.symbol)).toBe(false);
      expect(id.uri).toBe(`https://play.percolator.trade/api/earn-share/${m}`);
    }
    const max = lpShareIdentityV22(pk(key), "ABCDEFGH");
    expect(bytes(max.name).length).toBe(31); // rs:494
    expect(bytes(max.symbol).length).toBe(10); // rs:495
    const g = lpShareIdentityV22(pk(key), "");
    expect(g.name).toBe(`Percolator Earn Share ${m.slice(0, 8)}`); // rs:498
    expect(g.name.startsWith(LP_SHARE_TICKER_NAME_PREFIX_V22)).toBe(true);
    expect(g.symbol).toBe("pEARN"); // rs:500
    expect(g.ticker).toBe(false);
    expect(bytes(g.name).length).toBe(30); // LP_SHARE_GENERIC_NAME_LEN rs:42
  });

  it("same_ticker_on_two_markets_gives_different_names (rs:507)", () => {
    const na = lpShareIdentityV22(pk(fill(0xaa)), "1000PEPE").name;
    const nb = lpShareIdentityV22(pk(fill(0x55)), "1000PEPE").name;
    expect(na).not.toBe(nb);
    expect(na).toBe("Percolator Earn 1000PEPE CVDFLC");
    expect(nb).toBe("Percolator Earn 1000PEPE 6k78Ab");
    expect(bytes(na).length).toBe(31);
  });

  it("uri_is_exactly_base_path_market_and_fits (rs:450) for both bases", () => {
    for (const [, key, m] of MARKETS) {
      expect(lpShareIdentityV22(pk(key), "", LP_SHARE_URI_BASE_DEVNET_V22).uri).toBe(`https://play.percolator.trade/api/earn-share/${m}`);
      expect(lpShareIdentityV22(pk(key), "SOL", LP_SHARE_URI_BASE_MAINNET_V22).uri).toBe(`https://percolator.trade/api/earn-share/${m}`);
    }
    for (const base of [LP_SHARE_URI_BASE_DEVNET_V22, LP_SHARE_URI_BASE_MAINNET_V22]) {
      expect(base.startsWith("https://") && !base.endsWith("/")).toBe(true); // rs:444
      expect(base.length + LP_SHARE_URI_PATH_V22.length + 44).toBeLessThanOrEqual(MPL_MAX_URI_LEN_V22); // rs:96-97
    }
  });

  it("ticker_record / generic (tests/v22_lp_share_mint.rs:1222-1238, 1317-1319): devnet uri, 8-char ticker", () => {
    const market = pk(fill(0xff));
    const m = market.toBase58();
    expect(lpShareIdentityV22(market, "")).toEqual({ name: `Percolator Earn Share ${m.slice(0, 8)}`, symbol: "pEARN", uri: `https://play.percolator.trade/api/earn-share/${m}`, ticker: false });
    for (const t of ["BURNIE", "ABCDEFGH", "SOL", "ABCDEFG8"]) {
      expect(lpShareIdentityV22(market, t)).toEqual({ name: `Percolator Earn ${t} ${m.slice(0, 6)}`, symbol: `pe${t}`, uri: `https://play.percolator.trade/api/earn-share/${m}`, ticker: true });
    }
    expect(lpShareIdentityV22(market, "ABCDEFGH").symbol).toBe("peABCDEFGH");
  });
});

// Port of `rec` (lp_share_meta_v22.rs:585): MetadataV1 bytes + 60 trailing zero bytes.
const u32le = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; };
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((a, x) => a + x.length, 0)); let k = 0; for (const x of p) { o.set(x, k); k += x.length; } return o; };
function rec(auth: Uint8Array, mint: Uint8Array, name: Uint8Array, symbol: Uint8Array, uri: Uint8Array, fee: number, creators: number, mutable: number): Uint8Array {
  const parts: Uint8Array[] = [Uint8Array.of(4), auth, mint];
  for (const f of [name, symbol, uri]) parts.push(u32le(f.length), f);
  parts.push(Uint8Array.of(fee & 0xff, fee >> 8));
  if (creators === 0) parts.push(Uint8Array.of(0));
  else parts.push(Uint8Array.of(1), u32le(creators), new Uint8Array(creators * 34).fill(7));
  parts.push(Uint8Array.of(0), Uint8Array.of(mutable), new Uint8Array(60));
  return cat(...parts);
}

describe("part 2: record_state_classification (lp_share_meta_v22.rs:608) on the reader", () => {
  const reg = fill(1), mint = fill(2), marketKey = fill(0xaa);
  const id = lpShareIdentityV22(pk(marketKey), "");
  const g = bytes(id.name), gs = bytes("pEARN"), u = bytes(id.uri);
  const ok = (d: Uint8Array, want: { name: string; symbol: string; uri: string; isMutable: boolean }, auth = reg, m = mint) => {
    const r = parseLpShareMetadataRecordV22(d);
    expect(r).not.toBeNull();
    expect(r!.updateAuthority.toBase58()).toBe(pk(auth).toBase58());
    expect(r!.mint.toBase58()).toBe(pk(m).toBase58());
    expect({ name: r!.name, symbol: r!.symbol, uri: r!.uri, isMutable: r!.isMutable }).toEqual(want);
  };
  const canon = { name: id.name, symbol: "pEARN", uri: id.uri, isMutable: true };

  it("canonical generic (rs:612)", () => ok(rec(reg, mint, g, gs, u, 0, 0, 1), canon));
  it("NUL-padded strings read as canonical (rs:614-616)", () => {
    ok(rec(reg, mint, cat(g, Uint8Array.of(0, 0)), bytes("pEARN\0\0\0\0\0"), u, 0, 0, 1), canon);
  });
  it("stale rows parse with their own content (rs:618-623)", () => {
    ok(rec(reg, mint, bytes("USDC"), gs, u, 0, 0, 1), { ...canon, name: "USDC" });
    ok(rec(reg, mint, g, bytes("USDC"), u, 0, 0, 1), { ...canon, symbol: "USDC" });
    ok(rec(reg, mint, g, gs, bytes("https://evil.example/x"), 0, 0, 1), { ...canon, uri: "https://evil.example/x" });
    ok(rec(reg, mint, g, gs, u, 500, 0, 1), canon); // fee is not surfaced
    ok(rec(reg, mint, g, gs, u, 0, 2, 1), canon); // 2 creators: parses
    const other = lpShareIdentityV22(pk(fill(9)), "").name;
    expect(other).toBe("Percolator Earn Share cGfHiC6K");
    ok(rec(reg, mint, bytes(other), gs, u, 0, 0, 1), { ...canon, name: other });
  });
  it("frozen rows (rs:626-627)", () => {
    ok(rec(reg, mint, g, gs, u, 0, 0, 0), { ...canon, isMutable: false });
    ok(rec(reg, mint, bytes("USDC"), bytes("USDC"), bytes(""), 0, 0, 0), { name: "USDC", symbol: "USDC", uri: "", isMutable: false });
  });
  it("NotOurs by authority / mint (rs:629-630): layout parses, the caller's authority / mint check is what rejects", () => {
    ok(rec(fill(7), mint, g, gs, u, 0, 0, 1), canon, fill(7));
    ok(rec(reg, fill(7), g, gs, u, 0, 0, 1), canon, reg, fill(7));
  });
  it("NotOurs by layout (rs:631-635): key byte 0, is_mutable 2, 6 creators -> null", () => {
    const bad = rec(reg, mint, g, gs, u, 0, 0, 1);
    bad[0] = 0;
    expect(parseLpShareMetadataRecordV22(bad)).toBeNull();
    expect(parseLpShareMetadataRecordV22(rec(reg, mint, g, gs, u, 0, 0, 2))).toBeNull();
    expect(parseLpShareMetadataRecordV22(rec(reg, mint, g, gs, u, 0, 6, 1))).toBeNull();
  });
  it("every truncation is null, the exact end parses (rs:637-642)", () => {
    const full = rec(reg, mint, g, gs, u, 0, 0, 1);
    const end = 1 + 64 + 4 + g.length + 4 + gs.length + 4 + u.length + 2 + 1 + 1 + 1;
    for (let n = 0; n < end; n++) expect(parseLpShareMetadataRecordV22(full.subarray(0, n)), `len ${n}`).toBeNull();
    ok(full.subarray(0, end), canon);
  });
  it("absurd u32::MAX lengths at the name and symbol prefixes are null (rs:643-647)", () => {
    const full = rec(reg, mint, g, gs, u, 0, 0, 1);
    for (const off of [65, 69 + g.length]) {
      const huge = full.slice();
      huge.set(u32le(0xffffffff), off);
      expect(parseLpShareMetadataRecordV22(huge)).toBeNull();
    }
  });
  it("plant_foreign_record (tests/v22_lp_share_mint.rs:1365) parses with its hostile content", () => {
    const parts: Uint8Array[] = [Uint8Array.of(4), reg, mint];
    for (const f of ["USD Coin", "USDC", "https://evil.example/usdc.json"]) parts.push(u32le(f.length), bytes(f));
    parts.push(Uint8Array.of(0xf4, 0x01), Uint8Array.of(0), Uint8Array.of(0), Uint8Array.of(1));
    const d = new Uint8Array(607);
    d.set(cat(...parts));
    ok(d, { name: "USD Coin", symbol: "USDC", uri: "https://evil.example/usdc.json", isMutable: true });
  });
});

// ── part 3: edge rows ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("part 3: edge rows", () => {
  const reg = fill(1), mint = fill(2);

  it("8-char ticker name is 31 bytes on every market, <= MPL_MAX_NAME_LEN 32 (const assert rs:62-65)", () => {
    expect(LP_SHARE_TICKER_NAME_PREFIX_V22.length + LP_SHARE_TICKER_MAX_V22 + 1 + LP_SHARE_TICKER_NAME_MARKET_CHARS_V22).toBe(31);
    expect(LP_SHARE_SYMBOL_PREFIX_V22.length + LP_SHARE_TICKER_MAX_V22).toBe(MPL_MAX_SYMBOL_LEN_V22);
    for (const k of [...MARKETS.map(([, key]) => key), ...xorshiftKeys(200)]) {
      for (const t of ["ABCDEFGH", "99999999", "ZZZZZZZZ"]) {
        const id = lpShareIdentityV22(pk(k), t);
        expect(bytes(id.name).length).toBe(31);
        expect(bytes(id.symbol).length).toBe(10);
        // the name the wrapper writes round-trips through the reader at its Metaplex limits
        const r = parseLpShareMetadataRecordV22(rec(reg, mint, bytes(id.name), bytes(id.symbol), bytes(id.uri), 0, 0, 0));
        expect(r && { n: r.name, s: r.symbol, u: r.uri, m: r.isMutable }).toEqual({ n: id.name, s: id.symbol, u: id.uri, m: false });
      }
    }
  });

  it("take_str limits: exactly MPL_MAX parses, MPL_MAX + 1 is null (name 32/33, symbol 10/11, uri 200/201)", () => {
    const A = (n: number) => bytes("A".repeat(n));
    expect(parseLpShareMetadataRecordV22(rec(reg, mint, A(32), A(10), A(200), 0, 0, 1))).not.toBeNull();
    expect(parseLpShareMetadataRecordV22(rec(reg, mint, A(33), A(10), A(200), 0, 0, 1))).toBeNull();
    expect(parseLpShareMetadataRecordV22(rec(reg, mint, A(32), A(11), A(200), 0, 0, 1))).toBeNull();
    expect(parseLpShareMetadataRecordV22(rec(reg, mint, A(32), A(10), A(201), 0, 0, 1))).toBeNull();
  });

  it("NUL padding: Metaplex update pads to 32 / 10 / 200 (v22_lp_share_mint.rs:1403-1405); trailing NULs trimmed, interior NULs kept, all-NUL -> empty", () => {
    const id = lpShareIdentityV22(pk(fill(0xaa)), "ABCDEFGH");
    const pad = (s: string, n: number) => { const o = new Uint8Array(n); o.set(bytes(s)); return o; };
    const r = parseLpShareMetadataRecordV22(rec(reg, mint, pad(id.name, 32), pad(id.symbol, 10), pad(id.uri, 200), 0, 0, 0));
    expect(r && [r.name, r.symbol, r.uri]).toEqual([id.name, id.symbol, id.uri]);
    // padding counts against the limit (Rust checks n before trimming)
    expect(parseLpShareMetadataRecordV22(rec(reg, mint, pad(id.name, 33), pad(id.symbol, 10), pad(id.uri, 200), 0, 0, 0))).toBeNull();
    const r2 = parseLpShareMetadataRecordV22(rec(reg, mint, bytes("A\0B\0\0"), new Uint8Array(10), bytes("\0u"), 0, 0, 1));
    expect(r2 && [r2.name, r2.symbol, r2.uri]).toEqual(["A\0B", "", "\0u"]);
  });

  it("creators: n = 5 parses, n = 6 is null (rs:361 `if n > 5`); tag 2 is null; truncated creator array is null", () => {
    expect(parseLpShareMetadataRecordV22(rec(reg, mint, bytes("n"), bytes("s"), bytes("u"), 0, 5, 1))).not.toBeNull();
    expect(parseLpShareMetadataRecordV22(rec(reg, mint, bytes("n"), bytes("s"), bytes("u"), 0, 6, 1))).toBeNull();
    const d = rec(reg, mint, bytes("n"), bytes("s"), bytes("u"), 0, 0, 1);
    const tagAt = 1 + 64 + 5 * 3 + 2;
    d[tagAt] = 2;
    expect(parseLpShareMetadataRecordV22(d)).toBeNull();
    const five = rec(reg, mint, bytes("n"), bytes("s"), bytes("u"), 0, 5, 1);
    const fiveEnd = tagAt + 1 + 4 + 5 * 34 + 2;
    expect(parseLpShareMetadataRecordV22(five.subarray(0, fiveEnd))).not.toBeNull();
    expect(parseLpShareMetadataRecordV22(five.subarray(0, fiveEnd - 1))).toBeNull();
    expect(parseLpShareMetadataRecordV22(five.subarray(0, tagAt + 1 + 4 + 5 * 34 - 1))).toBeNull();
    // a u32::MAX creator count is refused by the cap, not by an overflowing multiply
    const huge = rec(reg, mint, bytes("n"), bytes("s"), bytes("u"), 0, 1, 1);
    huge.set(u32le(0xffffffff), tagAt + 1);
    expect(parseLpShareMetadataRecordV22(huge)).toBeNull();
  });

  it("isMutable byte: 0 -> false, 1 -> true, 2 / 0xff -> null (rs:370-374)", () => {
    const at = (b: number) => parseLpShareMetadataRecordV22(rec(reg, mint, bytes("n"), bytes("s"), bytes("u"), 0, 0, b));
    expect(at(0)?.isMutable).toBe(false);
    expect(at(1)?.isMutable).toBe(true);
    expect(at(2)).toBeNull();
    expect(at(0xff)).toBeNull();
  });

  it("primary_sale_happened is any byte (Rust does not check it)", () => {
    const d = rec(reg, mint, bytes("n"), bytes("s"), bytes("u"), 0, 0, 1);
    d[1 + 64 + 15 + 2 + 1] = 0x77;
    expect(parseLpShareMetadataRecordV22(d)?.isMutable).toBe(true);
  });
});
