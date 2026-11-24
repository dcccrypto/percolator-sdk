// Differential test: the SDK's hand-copied stake error tables vs the Rust `StakeError` enum.
//
// Source of truth: percolator-stake commit 53f548034f188ce3a348bfd37a8f51be6cc82802 (the deployed
// v5 commit, the one #726 used), `src/error.rs:5-161` (`pub enum StakeError`, 49 variants with
// explicit values 0..48; e.g. `NoRealLpHolders = 29` at src/error.rs:93, `ConsentRequired = 33` at
// src/error.rs:113, `MultiAssetMarketNotSupported = 48` at src/error.rs:160).
// Checked-in copy: test/fixtures/stake/v5-53f54803/error.rs.txt, a byte-for-byte copy of
// `git show 53f54803:src/error.rs` (sha256 pinned below), so the line numbers above match.
//
// SDK tables under test:
//   - src/abi/v22-stake-errors.ts   STAKE_ERROR_NAMES (codes 0..32, names)
//   - src/abi/v22-stake-errors.ts   STAKE_ERRORS_V5   (codes 33..48, names + hints)
//   - src/solana/stake-errors.ts    STAKE_ERRORS      (codes 0..32, hint text only)
//
// Every code and name is compared both ways: no code missing from the SDK, no extra SDK code, no
// name shifted by one. The one allowed difference is Rust's leading `_` on the two deprecated
// variants (11, 12: `_DeprecatedAdmin...`, the Rust dead-code prefix); the SDK drops it, and that
// is pinned exactly so any other name drift fails.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { STAKE_ERRORS } from "../src/solana/stake-errors.js";
import { STAKE_ERRORS_V5, STAKE_ERROR_NAMES } from "../src/abi/v22-stake-errors.js";

const FIXTURE = path.join(__dirname, "fixtures/stake/v5-53f54803/error.rs.txt");
const FIXTURE_SHA256 = "47d7ad18545b1092a265834759b87db94cb6e3dc1d3b89c6131c79192ed596b1";
const V5_FIRST_CODE = 33;

interface RustVariant {
  name: string;
  code: number;
  line: number; // 1-based line in src/error.rs
}

/** Parse `pub enum StakeError { ... }`. Every non-comment line inside must be `Name = N,`. */
function parseStakeErrorEnum(src: string): RustVariant[] {
  const lines = src.split("\n");
  const start = lines.findIndex((l) => /^pub enum StakeError\s*\{\s*$/.test(l));
  if (start < 0) throw new Error("pub enum StakeError not found");
  const out: RustVariant[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "}") return out;
    if (t === "" || t.startsWith("//")) continue;
    const m = /^(_?[A-Za-z][A-Za-z0-9]*)\s*=\s*(\d+)\s*,$/.exec(t);
    if (!m) throw new Error(`unparsed enum line ${i + 1}: ${t}`);
    out.push({ name: m[1], code: Number(m[2]), line: i + 1 });
  }
  throw new Error("pub enum StakeError not closed");
}

/** SDK name for a Rust variant: Rust's dead-code `_` prefix dropped. */
const sdkName = (rustName: string) => rustName.replace(/^_/, "");

interface Diff {
  missing: number[]; // in Rust, not in the SDK table
  extra: number[]; // in the SDK table, not in Rust
  wrongName: { code: number; rust: string; sdk: string }[];
}

function diffTable(rust: RustVariant[], sdk: Readonly<Record<number, string>>): Diff {
  const rustByCode = new Map(rust.map((v) => [v.code, v]));
  const sdkCodes = Object.keys(sdk).map(Number);
  const missing = rust.filter((v) => !(v.code in sdk)).map((v) => v.code);
  const extra = sdkCodes.filter((c) => !rustByCode.has(c)).sort((a, b) => a - b);
  const wrongName = rust
    .filter((v) => v.code in sdk && sdk[v.code] !== sdkName(v.name))
    .map((v) => ({ code: v.code, rust: v.name, sdk: sdk[v.code] }));
  return { missing, extra, wrongName };
}

const NO_DIFF: Diff = { missing: [], extra: [], wrongName: [] };

const src = fs.readFileSync(FIXTURE, "utf8");
const rust = parseStakeErrorEnum(src);
const rustV21 = rust.filter((v) => v.code < V5_FIRST_CODE);
const rustV5 = rust.filter((v) => v.code >= V5_FIRST_CODE);
const v5Names: Record<number, string> = Object.fromEntries(
  Object.entries(STAKE_ERRORS_V5).map(([c, info]) => [Number(c), info.name]),
);

describe("checked-in Rust StakeError enum (percolator-stake 53f54803 src/error.rs)", () => {
  it("is the exact pinned copy", () => {
    expect(crypto.createHash("sha256").update(src).digest("hex")).toBe(FIXTURE_SHA256);
  });

  it("parses to 49 variants, codes 0..48, unique and in order, at the quoted lines", () => {
    expect(rust).toHaveLength(49);
    expect(rust.map((v) => v.code)).toEqual(Array.from({ length: 49 }, (_, i) => i));
    expect(new Set(rust.map((v) => v.name)).size).toBe(49);
    const at = (name: string) => rust.find((v) => v.name === name);
    expect(at("AlreadyInitialized")).toEqual({ name: "AlreadyInitialized", code: 0, line: 7 });
    expect(at("NoRealLpHolders")).toEqual({ name: "NoRealLpHolders", code: 29, line: 93 });
    expect(at("UnsupportedWrapperLayout")).toEqual({ name: "UnsupportedWrapperLayout", code: 32, line: 109 });
    expect(at("ConsentRequired")).toEqual({ name: "ConsentRequired", code: 33, line: 113 });
    expect(at("MultiAssetMarketNotSupported")).toEqual({ name: "MultiAssetMarketNotSupported", code: 48, line: 160 });
  });
});

describe("SDK stake error tables vs Rust StakeError (both ways)", () => {
  it("STAKE_ERROR_NAMES == Rust codes 0..32: 0 missing, 0 extra, 0 wrong names", () => {
    expect(diffTable(rustV21, STAKE_ERROR_NAMES)).toEqual(NO_DIFF);
  });

  it("the only raw-name difference is Rust's `_` prefix on deprecated codes 11 and 12", () => {
    const raw = rustV21.filter((v) => STAKE_ERROR_NAMES[v.code] !== v.name).map((v) => [v.code, v.name]);
    expect(raw).toEqual([
      [11, "_DeprecatedAdminAlreadyTransferred"],
      [12, "_DeprecatedAdminNotTransferred"],
    ]);
  });

  it("STAKE_ERRORS_V5 == Rust codes 33..48: 0 missing, 0 extra, 0 wrong names (exact, no prefix rule)", () => {
    expect(diffTable(rustV5, v5Names)).toEqual(NO_DIFF);
    for (const v of rustV5) expect(v5Names[v.code]).toBe(v.name);
  });

  it("STAKE_ERRORS (hint text) covers exactly Rust codes 0..32, each with a non-empty hint", () => {
    const codes = Object.keys(STAKE_ERRORS).map(Number).sort((a, b) => a - b);
    expect(codes).toEqual(rustV21.map((v) => v.code));
    for (const v of rustV21) expect(STAKE_ERRORS[v.code]?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it("STAKE_ERROR_NAMES + STAKE_ERRORS_V5 are disjoint and together cover every Rust code", () => {
    const names = Object.keys(STAKE_ERROR_NAMES).map(Number);
    const v5 = Object.keys(STAKE_ERRORS_V5).map(Number);
    expect(names.filter((c) => v5.includes(c))).toEqual([]);
    const union: Record<number, string> = { ...STAKE_ERROR_NAMES, ...v5Names };
    expect(diffTable(rust, union)).toEqual(NO_DIFF);
  });
});

describe("the diff catches the drift it exists for", () => {
  const union: Record<number, string> = { ...STAKE_ERROR_NAMES, ...v5Names };

  it("an off-by-one shift is reported as a wrong name and an extra code", () => {
    const shifted: Record<number, string> = {};
    for (const [c, n] of Object.entries(union)) shifted[Number(c) + 1] = n;
    const d = diffTable(rust, shifted);
    expect(d.missing).toEqual([0]);
    expect(d.extra).toEqual([49]);
    expect(d.wrongName).toHaveLength(48);
  });

  it("a missing code and an extra code are both reported", () => {
    const t: Record<number, string> = { ...union, 49: "Invented" };
    delete t[29];
    expect(diffTable(rust, t)).toEqual({ missing: [29], extra: [49], wrongName: [] });
  });

  it("a Rust enum with a new variant fails the parse-count check", () => {
    const grown = src.replace(
      "    MultiAssetMarketNotSupported = 48,\n",
      "    MultiAssetMarketNotSupported = 48,\n    NewVariant = 49,\n",
    );
    const parsed = parseStakeErrorEnum(grown);
    expect(parsed).toHaveLength(50);
    expect(diffTable(parsed, union).missing).toEqual([49]);
  });

  it("an enum line without an explicit value is refused, not skipped", () => {
    expect(() => parseStakeErrorEnum(src.replace("NoRealLpHolders = 29,", "NoRealLpHolders,"))).toThrow(
      /unparsed enum line 93/,
    );
  });
});
