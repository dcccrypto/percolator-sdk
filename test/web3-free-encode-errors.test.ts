// encode.ts and errors.ts must not import @solana/web3.js at runtime, so a bundler can drop
// web3.js (~268 KB raw / ~83 KB gzip) for consumers that only encode instructions or parse
// errors. This file pins (1) the runtime import graph and (2) that encPubkey's own base58
// decode gives the same bytes and errors as `new PublicKey(str)`.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { PublicKey } from "@solana/web3.js";
import { encPubkey } from "../src/abi/encode.js";
import * as sdk from "../src/index.js";
import * as stake from "../src/solana/stake.js";
import * as v22Stake from "../src/abi/v22-stake.js";
import * as matcherV2 from "../src/abi/matcher-v2.js";
import * as programIds from "../src/config/program-ids.js";
import { STAKE_ERRORS, STAKE_PROGRAM_IDS } from "../src/solana/stake-errors.js";
import { STAKE_ERRORS_V5, STAKE_ERROR_NAMES } from "../src/abi/v22-stake-errors.js";
import { MATCHER_V2_ERRORS } from "../src/abi/matcher-v2-errors.js";
import * as idStrings from "../src/config/program-id-strings.js";

const SRC = path.resolve(__dirname, "../src");

/** Module specifiers a file imports or re-exports at runtime (type-only imports are skipped). */
function runtimeImports(file: string): string[] {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) {
      const c = st.importClause;
      if (c?.isTypeOnly) continue;
      // `import { type A, type B } from "x"` is type-only too (no default, all named specifiers typed)
      if (c && !c.name && c.namedBindings && ts.isNamedImports(c.namedBindings)
        && c.namedBindings.elements.length > 0 && c.namedBindings.elements.every((e) => e.isTypeOnly)) continue;
      out.push((st.moduleSpecifier as ts.StringLiteral).text);
    } else if (ts.isExportDeclaration(st) && st.moduleSpecifier && !st.isTypeOnly) {
      out.push((st.moduleSpecifier as ts.StringLiteral).text);
    }
  }
  return out;
}

/** Every package reachable from `entry` through runtime imports, with one path to each. */
function reachablePackages(entry: string): Map<string, string[]> {
  const pkgs = new Map<string, string[]>();
  const seen = new Set<string>();
  const walk = (file: string, trail: string[]) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const spec of runtimeImports(file)) {
      if (spec.startsWith(".")) {
        walk(path.resolve(path.dirname(file), spec.replace(/\.js$/, ".ts")), [...trail, path.relative(SRC, file)]);
      } else if (!pkgs.has(spec)) {
        pkgs.set(spec, [...trail, path.relative(SRC, file)]);
      }
    }
  };
  walk(path.join(SRC, entry), []);
  return pkgs;
}

// Static (top-level) imports only. instructions.ts keeps its existing lazy
// `await import("@solana/web3.js")` inside derivePythPriceUpdateAccount; that runs only when called.
describe("static runtime import graph: no @solana/web3.js", () => {
  for (const entry of ["abi/encode.ts", "abi/errors.ts", "abi/instructions.ts"]) {
    it(`${entry} has no static runtime path to @solana/web3.js`, () => {
      const pkgs = reachablePackages(entry);
      expect(pkgs.get("@solana/web3.js"), `path: ${pkgs.get("@solana/web3.js")?.join(" -> ")}`).toBeUndefined();
    }, 30_000);
  }

  it("the walker does see web3.js where it is imported (control)", () => {
    expect(reachablePackages("solana/stake.ts").has("@solana/web3.js")).toBe(true);
    expect(reachablePackages("config/program-ids.ts").has("@solana/web3.js")).toBe(true);
  });
});

describe("moved tables keep their identity and public exports", () => {
  it("stake.ts / v22-stake.ts / matcher-v2.ts / program-ids.ts re-export the same objects", () => {
    expect(stake.STAKE_ERRORS).toBe(STAKE_ERRORS);
    expect(stake.STAKE_PROGRAM_IDS).toBe(STAKE_PROGRAM_IDS);
    expect(v22Stake.STAKE_ERRORS_V5).toBe(STAKE_ERRORS_V5);
    expect(v22Stake.STAKE_ERROR_NAMES).toBe(STAKE_ERROR_NAMES);
    expect(matcherV2.MATCHER_V2_ERRORS).toBe(MATCHER_V2_ERRORS);
    for (const k of ["safeEnv", "PROGRAM_IDS", "PROGRAM_IDS_DEVNET_V22", "PROGRAM_IDS_V17", "PROGRAM_IDS_DEVNET_V1", "NFT_PROGRAM_IDS"] as const) {
      expect(programIds[k]).toBe(idStrings[k]);
    }
  });

  it("the root entry still exports every moved name", () => {
    const s = sdk as Record<string, unknown>;
    expect(s.STAKE_ERRORS).toBe(STAKE_ERRORS);
    expect(s.STAKE_PROGRAM_IDS).toBe(STAKE_PROGRAM_IDS);
    expect(s.STAKE_ERRORS_V5).toBe(STAKE_ERRORS_V5);
    expect(s.STAKE_ERROR_NAMES).toBe(STAKE_ERROR_NAMES);
    expect(s.MATCHER_V2_ERRORS).toBe(MATCHER_V2_ERRORS);
    expect(s.PROGRAM_IDS).toBe(idStrings.PROGRAM_IDS);
    expect(s.NFT_PROGRAM_IDS).toBe(idStrings.NFT_PROGRAM_IDS);
    expect(s.safeEnv).toBe(idStrings.safeEnv);
  });

  it("the moved tables are still frozen", () => {
    for (const t of [STAKE_ERRORS, STAKE_PROGRAM_IDS, STAKE_ERRORS_V5, STAKE_ERROR_NAMES, MATCHER_V2_ERRORS,
      idStrings.PROGRAM_IDS, idStrings.PROGRAM_IDS.devnet, idStrings.PROGRAM_IDS.mainnet,
      idStrings.PROGRAM_IDS_DEVNET_V22, idStrings.PROGRAM_IDS_DEVNET_V1, idStrings.NFT_PROGRAM_IDS]) {
      expect(Object.isFrozen(t)).toBe(true);
    }
  });
});

/** What encPubkey(str) did before: web3.js's own decode, or its error message. */
function viaWeb3(str: string): Uint8Array | string {
  try { return new PublicKey(str).toBytes(); } catch (e) { return (e as Error).message; }
}
function viaEnc(str: string): Uint8Array | string {
  try { return encPubkey(str); } catch (e) {
    const m = (e as Error).message;
    const prefix = `encPubkey: invalid public key "${str}" — `;
    expect(m.startsWith(prefix)).toBe(true);
    return m.slice(prefix.length);
  }
}

describe("encPubkey(string) matches new PublicKey(string)", () => {
  // deterministic xorshift so failures reproduce
  let seed = 0x9e3779b9;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 2 ** 32; };
  const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

  it("same bytes for 2,000 random 32-byte keys, including leading-zero-byte keys", () => {
    for (let i = 0; i < 2000; i++) {
      const bytes = Uint8Array.from({ length: 32 }, () => Math.floor(rnd() * 256));
      const lead = i % 7; // 0..6 leading zero bytes -> leading '1's in base58
      bytes.fill(0, 0, lead);
      const str = new PublicKey(bytes).toBase58();
      const got = encPubkey(str);
      expect(got).toBeInstanceOf(Uint8Array);
      expect(Array.from(got)).toEqual(Array.from(bytes));
    }
  }, 60_000);

  it("same bytes and errors on fixed edge strings", () => {
    const cases = [
      "", "1", "11111111111111111111111111111111", "111111111111111111111111111111111",
      "1111111111111111111111111111111", "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
      "JEKNVnkbo3jma5nREBBJCDoXFVeKkD56V3xKrvRmWxFG", "JEKNVnkbo3jma5nREBBJCDoXFVeKkD56V3xKrvRmWxFF",
      "4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM", "4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM0",
      "not-a-key!", "0OIl", " 4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM", "4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM ",
      "11111111111111111111111111111112", "ébc", "日本", "2".repeat(44), "2".repeat(45), "1".repeat(100),
      idStrings.PROGRAM_IDS_DEVNET_V22.percolator, STAKE_PROGRAM_IDS.mainnet,
    ];
    for (const s of cases) {
      const want = viaWeb3(s);
      const got = viaEnc(s);
      if (typeof want === "string") expect(got, s).toBe(want);
      else expect(Array.from(got as Uint8Array), s).toEqual(Array.from(want));
    }
  });

  it("same result on 5,000 random strings of length 0..50", () => {
    let ok = 0;
    for (let i = 0; i < 5000; i++) {
      const n = rnd() < 0.5 ? 42 + Math.floor(rnd() * 4) : Math.floor(rnd() * 51);
      let s = "";
      for (let j = 0; j < n; j++) s += rnd() < 0.02 ? "0Il+" [Math.floor(rnd() * 4)] : ALPHA[Math.floor(rnd() * 58)];
      if (rnd() < 0.3) s = "1".repeat(Math.floor(rnd() * 4)) + s;
      const want = viaWeb3(s);
      const got = viaEnc(s);
      if (typeof want === "string") expect(got, s).toBe(want);
      else { expect(Array.from(got as Uint8Array), s).toEqual(Array.from(want)); ok++; }
    }
    expect(ok).toBeGreaterThan(100); // the generator does hit valid 32-byte keys
  }, 60_000);
});
