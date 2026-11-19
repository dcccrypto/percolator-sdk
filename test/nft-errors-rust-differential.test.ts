/**
 * Differential test: src/abi/nft-errors.ts NFT_ERRORS vs the Rust `NftError` enum in percolator-nft.
 * The enum is parsed from checked-in snapshots of error.rs (sha in each file's first line), so a
 * renamed / renumbered / added / dropped variant fails here.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { NFT_ERRORS } from "../src/abi/nft-errors.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "percolator-nft");

/** Parse `pub enum NftError { ... }` -> code => variant name (explicit or implicit discriminants). */
export function parseNftErrorEnum(src: string): Map<number, string> {
  const m = /pub\s+enum\s+NftError\s*\{([\s\S]*?)\n\}/.exec(src);
  if (!m) throw new Error("NftError enum not found");
  const body = m[1]
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trim()) // strip line + doc comments
    .filter(Boolean)
    .join(" ");
  const out = new Map<number, string>();
  const names = new Set<string>();
  let next = 0;
  for (const raw of body.split(",")) {
    const v = raw.trim();
    if (!v) continue;
    const vm = /^([A-Za-z_][A-Za-z0-9_]*)(?:\s*=\s*(0x[0-9a-fA-F]+|\d+))?$/.exec(v);
    if (!vm) throw new Error(`unparseable variant: ${v}`);
    const code = vm[2] !== undefined ? Number(vm[2]) : next;
    if (out.has(code)) throw new Error(`duplicate discriminant ${code}`);
    if (names.has(vm[1])) throw new Error(`duplicate variant ${vm[1]}`);
    names.add(vm[1]);
    out.set(code, vm[1]);
    next = code + 1;
  }
  return out;
}

const load = (f: string) => readFileSync(join(dir, f), "utf8");

function diff(rust: Map<number, string>): string[] {
  const problems: string[] = [];
  for (const [code, name] of rust) {
    const ts = NFT_ERRORS[code];
    if (!ts) problems.push(`code ${code} (${name}) missing from TS`);
    else if (ts.name !== name) problems.push(`code ${code}: rust ${name} != ts ${ts.name}`);
  }
  for (const k of Object.keys(NFT_ERRORS)) {
    if (!rust.has(Number(k))) problems.push(`TS has extra code ${k} (${NFT_ERRORS[Number(k)].name})`);
  }
  return problems;
}

describe("NFT_ERRORS vs percolator-nft error.rs (95dcece)", () => {
  const rust = parseNftErrorEnum(load("error.95dcece.rs"));

  it("snapshot header carries the commit sha", () => {
    expect(load("error.95dcece.rs").split("\n")[0]).toContain("95dcece42e79da1ce8e36eb534a8d473b629dfdc");
  });
  it("parses codes 0..28 contiguously", () => {
    expect([...rust.keys()]).toEqual(Array.from({ length: 29 }, (_, i) => i));
  });
  it("every code maps to the same variant name; no missing, no extra", () => {
    expect(diff(rust)).toEqual([]);
  });
  it("every entry has a non-empty hint", () => {
    for (const [c, e] of Object.entries(NFT_ERRORS)) expect(e.hint.length, `code ${c}`).toBeGreaterThan(0);
  });
  it("detects a hand-mutated copy (rename, renumber, drop, add)", () => {
    const src = load("error.95dcece.rs");
    const renamed = parseNftErrorEnum(src.replace("NotNftHolder = 7", "NotTheHolder = 7"));
    expect(diff(renamed)).toEqual(["code 7: rust NotTheHolder != ts NotNftHolder"]);
    const swapped = parseNftErrorEnum(src.replace("FundingOverflow = 8", "FundingOverflow = 30"));
    expect(diff(swapped).length).toBeGreaterThan(0);
    const dropped = parseNftErrorEnum(src.replace(/StalePortfolioIncarnation = 28,/, ""));
    expect(diff(dropped)).toEqual(["TS has extra code 28 (StalePortfolioIncarnation)"]);
    const added = parseNftErrorEnum(src.replace("StalePortfolioIncarnation = 28,", "StalePortfolioIncarnation = 28,\n    Brand = 29,"));
    expect(diff(added)).toEqual(["code 29 (Brand) missing from TS"]);
  });
});

describe("deployed v2.2 devnet NFT build (b257417)", () => {
  const rust = parseNftErrorEnum(load("error.b257417.rs"));
  it("is a strict prefix of the TS map: every deployed code matches by name", () => {
    expect([...rust.keys()]).toEqual(Array.from({ length: 28 }, (_, i) => i));
    for (const [code, name] of rust) expect(NFT_ERRORS[code]?.name).toBe(name);
  });
  it("TS 28 (StalePortfolioIncarnation) postdates b257417; append-only so 0..27 are unaffected", () => {
    expect(rust.has(28)).toBe(false);
    expect(NFT_ERRORS[28].name).toBe("StalePortfolioIncarnation");
  });
});
