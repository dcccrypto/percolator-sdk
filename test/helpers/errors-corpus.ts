import { PROGRAM_IDS, PROGRAM_IDS_DEVNET_V22, NFT_PROGRAM_IDS } from "../../src/config/program-ids.js";
import { STAKE_PROGRAM_IDS } from "../../src/solana/stake.js";

const f = (id: string, hex: string) => `Program ${id} failed: custom program error: 0x${hex}`;
const W = PROGRAM_IDS.devnet.percolator;

export const CORPUS: string[][] = [
  ["Program log: x", f(W, "1b")],
  ["Program log: x", f(W, "8"), "Program log: y"],
  ["Program log: x", f(STAKE_PROGRAM_IDS.devnet, "5")],
  ["Program log: x", f(NFT_PROGRAM_IDS.devnet, "3")],
  ["Program log: x", f(PROGRAM_IDS.devnet.matcher, "1f41")],
  ["Program log: x", f(PROGRAM_IDS_DEVNET_V22.vault, "9")],
  ["Program log: x", f("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "1")],
  ["Program log: x", f("11111111111111111111111111111111", "8")],
  ["Program xyz failed: custom program error: 0x2a"],
  ["Program x failed: custom program error: 0x100000000"],
  ["Program log: nothing", "Program 11111111111111111111111111111111 success", "Program log: more"],
  [],
];

export const ID_POOL = [
  W, PROGRAM_IDS.mainnet.percolator, PROGRAM_IDS.devnet.matcher, PROGRAM_IDS_DEVNET_V22.vault,
  NFT_PROGRAM_IDS.devnet, STAKE_PROGRAM_IDS.mainnet, "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "11111111111111111111111111111111", "xyz", "",
];

export function fuzzLogs(rng: () => number): string[] {
  const n = Math.floor(rng() * 6);
  const out: string[] = [];
  const pick = <T,>(a: T[]) => a[Math.floor(rng() * a.length)];
  for (let i = 0; i < n; i++) {
    const r = rng();
    if (r < 0.6) out.push(`Program ${pick(ID_POOL)} failed: custom program error: 0x${Math.floor(rng() * 0x300).toString(16)}`);
    else if (r < 0.7) out.push(`custom program error: 0x${Math.floor(rng() * 2 ** 33).toString(16)}`);
    else if (r < 0.8) out.push(`Program ${pick(ID_POOL)} failed: custom program error: 0xZZ`);
    else if (r < 0.85) out.push(123 as unknown as string);
    else out.push(`Program log: ${Math.floor(rng() * 1e6)}`);
  }
  return out;
}

export function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
