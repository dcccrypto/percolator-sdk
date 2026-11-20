import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import { parseErrorFromLogs as legacy } from "./fixtures/errors-legacy.js";
import { parseErrorFromLogs as current } from "../src/abi/errors.js";
import { PROGRAM_IDS, PROGRAM_IDS_DEVNET_V22, NFT_PROGRAM_IDS } from "../src/config/program-ids.js";

// Deterministic PRNG so failures reproduce.
let seed = 0x9e3779b9;
const rnd = () => {
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed / 0x1_0000_0000;
};
const ri = (n: number) => Math.floor(rnd() * n);
const pick = <T,>(a: readonly T[]): T => a[ri(a.length)];

const extraKey = Keypair.generate().publicKey;
const extraStr = Keypair.generate().publicKey.toBase58();
const IDS = [
  String(PROGRAM_IDS.devnet.percolator), String(PROGRAM_IDS.mainnet.percolator), String(PROGRAM_IDS_DEVNET_V22.percolator),
  String(PROGRAM_IDS.devnet.matcher), String(NFT_PROGRAM_IDS.devnet), String(PROGRAM_IDS_DEVNET_V22.vault),
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  extraKey.toBase58(), extraStr, Keypair.generate().publicKey.toBase58(), "short", "",
];

function hex(): string {
  const style = ri(8);
  let code: number;
  switch (style) {
    case 0: code = ri(60); break;
    case 1: code = 8000 + ri(8); break;
    case 2: code = 0xffff_ffff - ri(3); break;
    case 3: code = Math.floor(rnd() * 0x1_0000_0000); break;
    default: code = ri(0x1_0000);
  }
  let h = code.toString(16);
  if (style === 5) h = h.toUpperCase();
  if (style === 6) h = h.padStart(8 + ri(6), "0"); // overlong (>8 digits)
  if (style === 7) h = rnd() < 0.5 ? "g" + h : h + "zz"; // not-hex / boundary
  return (rnd() < 0.3 ? "0X" : "0x") + h; // regex is case-insensitive, so "0X" matches too
}
const lineNoise = () =>
  pick([
    "Program log: Instruction: Trade",
    "Program consumed 1234 of 200000 compute units",
    "Program return: abc",
    "custom program error: 0x", // no digits
    "Program log: custom program error without code",
  ]);
function errLine(): string {
  const id = pick(IDS);
  const phrase = rnd() < 0.15 ? "CUSTOM PROGRAM ERROR: " : rnd() < 0.1 ? "Custom Program Error: " : "custom program error: ";
  const tail = rnd() < 0.1 ? "." : rnd() < 0.1 ? " extra" : "";
  switch (ri(5)) {
    case 0: return `Program ${id} failed: ${phrase}${hex()}${tail}`;
    case 1: return `Program ${id} failed: ${phrase}${hex()}`;
    case 2: return `  Program ${id} failed: ${phrase}${hex()}`; // leading space: no programId
    case 3: return `Program log: ${phrase}${hex()}`; // no "failed:" => unknown
    default: return `Transaction failed: ${phrase}${hex()}${tail}`;
  }
}
function logs(): unknown {
  if (rnd() < 0.02) return pick([null, undefined, "str", 5, {}]);
  const n = ri(61);
  const a: unknown[] = [];
  for (let i = 0; i < n; i++) {
    const r = rnd();
    a.push(r < 0.15 ? errLine() : r < 0.2 ? pick([null, undefined, 7, {}, [], Symbol.iterator.toString(), 1n]) : lineNoise());
  }
  return a;
}
function opts() {
  switch (ri(7)) {
    case 6: return { programIds: { wrapper: [IDS[5], IDS[6]], matcher: [IDS[0]] } }; // extras override built-in ids
    case 0: return undefined;
    case 1: return { context: { action: pick(["trade", "withdraw", "resolve"] as const), openLegs: ri(3), healthCheckStale: rnd() < 0.5 } };
    case 2: return { programIds: { wrapper: [extraKey, extraStr] } };
    case 3: return { programIds: { stake: [extraStr], nft: [extraKey], matcher: [IDS[10]] }, context: { action: "trade" as const } };
    case 4: return { programIds: {} };
    default: return {};
  }
}

describe("parseErrorFromLogs differential vs frozen pre-perf copy", () => {
  it("matches on 30k generated log arrays (0 mismatches)", () => {
    let mismatches = 0, errors = 0, nulls = 0;
    const N = 30_000;
    for (let i = 0; i < N; i++) {
      const l = logs() as string[];
      const o = opts() as never;
      const a = legacy(l, o);
      const b = current(l, o);
      if (a === null) nulls++; else errors++;
      if (JSON.stringify(b) !== JSON.stringify(a) || Object.keys(b ?? {}).join() !== Object.keys(a ?? {}).join() || (a === null) !== (b === null)) { if (mismatches++ < 3) console.error(JSON.stringify({ l, a, b }, (_k, v) => (typeof v === "bigint" ? `${v}n` : v))); }
    }
    expect(mismatches).toBe(0);
    // sanity: the generator exercises both outcomes
    expect(errors).toBeGreaterThan(3000);
    expect(nulls).toBeGreaterThan(3000);
  }, 120_000);

  it("repeated calls are stateless (no lastIndex leak) and extras do not pollute the cache", () => {
    const line = [`Program ${extraStr} failed: custom program error: 0x13`];
    const plain = current(line);
    expect(plain?.program).toBe("unknown");
    expect(current(line, { programIds: { wrapper: [extraStr] } })?.program).toBe("wrapper");
    expect(current(line)).toStrictEqual(plain); // extras from the previous call must not leak
    for (let i = 0; i < 5; i++) expect(current(line)).toStrictEqual(plain);
  });
});
