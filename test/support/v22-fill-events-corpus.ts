import { PublicKey } from "@solana/web3.js";

/** Real wrapper event tokens (document worked examples, same strings as test/v22-fill-events.test.ts). */
export const REAL_TOKENS: string[] = [
  "AQEKAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAQAABwAAAAAAAAAJwOHkAAAAAAAAAAAAAAAAAICWmAAAAAAAAAAAAAAAAAAA4fUFAAAAAADh9QUAAAAA6AMAAAAAAAAAAAAAAAAAAA==",
  "AQEKAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAQAABwAAAAAAAAANwMYtAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4fUFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
  "AQFDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAgAABwAAAAAAAAAIQEIPAAAAAAAAAAAAAAAAAEBCDwAAAAAAAAAAAAAAAAAA4fUFAAAAAADh9QUAAAAAAAAAAAAAAAAAAAAAAAAAAAEACAAAAAAAAAAKgIQeAAAAAAAAAAAAAAAAACChBwAAAAAAAAAAAAAAAACAsuYOAAAAAEBw1w4AAAAAAAAAAAAAAAAAAAAAAAAAAA==",
  "AgEsAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAAAAAAAAAEA98L/////////////////AOH1BQAAAAA=",
  "AwFNAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB//9AVIkAAAAAANASEwAAAAAAgJaYAAAAAAA=",
  "AwFvAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEE//9grgoAAAAAAOCTBAAAAAAAoCUmAAAAAAA=",
  "AwFvAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEC//9AQg8AAAAAAAAJPQAAAAAAAAAAAAAAAAA=",
  "AwFvAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEC//9AQg8AAAAAAMDGLQAAAAAAAQAAAAAAAAA=",
  "AwFqAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEDAAA5MAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  "AgEFAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAJAAAAAAAAAANAOdL/////////////////wDtHAwAAAAA=",
  "AgF3AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAAAHAAAAAAAAAAUAEnoAAAAAAAAAAAAAAAAAAOH1BQAAAAA=",
  "AQFDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDBAAABwAAAAAAAAAIwL3w/////////////////8C98P////////////////8A4fUFAAAAAMCe5gUAAAAA9AEAAAAAAAAAAAAAAAAAAAEACAAAAAAAAAAKgIQeAAAAAAAAAAAAAAAAACChBwAAAAAAAAAAAAAAAACAsuYOAAAAAEBw1w4AAAAAAAAAAAAAAAAAAAAAAAAAAAIACQAAAAAAAAAJwMYtAAAAAAAAAAAAAAAAAICEHgAAAAAAAAAAAAAAAABAS0wAAAAAAEBLTAAAAAAA//////////8AAAAAAAAAAAMACgAAAAAAAAAIAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAA==",
];

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CORPUS_WRAPPER = new PublicKey(new Uint8Array(32).fill(9));
const INNER = Array.from({ length: 4 }, (_, i) => new PublicKey(new Uint8Array(32).fill(i + 20)).toBase58());

/** A realistic tx log array: wrapper frame with 1-3 real (lightly mutated) tokens plus a few inner-program frames. */
export function realisticLogs(r: () => number, wrapper: PublicKey = CORPUS_WRAPPER): string[] {
  const w = wrapper.toBase58();
  const logs: string[] = [];
  const prog = INNER[Math.floor(r() * INNER.length)];
  logs.push(`Program ${prog} invoke [1]`, `Program ${prog} consumed 300 of 200000 compute units`, `Program ${prog} success`);
  logs.push(`Program ${w} invoke [1]`, "Program log: Instruction: TradeCpi");
  const cpi = INNER[Math.floor(r() * INNER.length)];
  logs.push(`Program ${cpi} invoke [2]`, `Program ${cpi} consumed 1200 of 190000 compute units`, `Program ${cpi} success`);
  const n = 1 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const tok = REAL_TOKENS[Math.floor(r() * REAL_TOKENS.length)];
    logs.push(`Program data: ${tok}`);
  }
  logs.push(`Program ${w} consumed 50000 of 200000 compute units`, `Program ${w} success`);
  return logs;
}

/** Mutated token: random byte flips / truncation / extension, re-encoded as base64 (sometimes non-canonical or non-base64). */
export function fuzzToken(r: () => number): string {
  const base = Buffer.from(REAL_TOKENS[Math.floor(r() * REAL_TOKENS.length)], "base64");
  let b = Buffer.from(base);
  const mode = r();
  if (mode < 0.25) {
    for (let k = 0, n = 1 + Math.floor(r() * 4); k < n; k++) b[Math.floor(r() * b.length)] = Math.floor(r() * 256);
  } else if (mode < 0.4) {
    b = b.subarray(0, Math.floor(r() * b.length));
  } else if (mode < 0.5) {
    b = Buffer.concat([b, Buffer.alloc(1 + Math.floor(r() * 80), Math.floor(r() * 256))]);
  } else if (mode < 0.6) {
    b[0] = Math.floor(r() * 6);
    b[1] = Math.floor(r() * 3);
  } else if (mode < 0.7) {
    // header bytes the length checks key on
    if (b.length > 99) b[99] = Math.floor(r() * 14);
    if (b.length > 109) b[109] = Math.floor(r() * 8);
    if (b.length > 35) b[35] = Math.floor(r() * 7);
  } else if (mode < 0.75) {
    // stress i128/u64 sign + high bits
    for (let o = 35; o < b.length; o++) if (r() < 0.3) b[o] = r() < 0.5 ? 0xff : 0x80;
  }
  let s = b.toString("base64");
  const x = r();
  if (x < 0.04) s = s.replace(/=+$/, "") + "=";
  else if (x < 0.07) s = s + "!";
  else if (x < 0.1) s = "";
  return s;
}

const WEIRD = [
  "Program log: hi",
  "Log truncated",
  "Program data: ",
  "Program data:",
  "Program 11111111111111111111111111111111 invoke [1]",
  "Program 1111 invoke [1]",
  "Program 00000000000000000000000000000000 invoke [1]",
];

/** A hostile log array: random frame structure, random programs (including wrapper), fuzzed tokens. */
export function fuzzLogs(r: () => number, wrapper: PublicKey = CORPUS_WRAPPER): string[] {
  const w = wrapper.toBase58();
  const ids = [w, ...INNER, "1" + w.slice(1, 40), w.slice(0, 31), w.slice(0, 31) + "0"];
  const pick = () => ids[Math.floor(r() * ids.length)];
  const n = Math.floor(r() * 14);
  const out: string[] = [];
  let depth = 0;
  const stack: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = r();
    if (x < 0.25) {
      const id = pick();
      const d = r() < 0.9 ? depth + 1 : 1 + Math.floor(r() * 5);
      out.push(`Program ${id} invoke [${d}]`);
      stack.push(id);
      depth = stack.length;
    } else if (x < 0.4 && stack.length) {
      const id = r() < 0.9 ? stack.pop()! : pick();
      out.push(`Program ${id} ${r() < 0.8 ? "success" : "failed: custom program error: 0x1"}`);
      depth = stack.length;
    } else if (x < 0.75) {
      const toks = Array.from({ length: 1 + Math.floor(r() * 3) }, () => fuzzToken(r));
      out.push(`Program data: ${toks.join(r() < 0.9 ? " " : "  ")}`);
    } else if (x < 0.85) {
      out.push(`Program ${pick()} consumed 1 of 2 compute units`);
    } else {
      out.push(WEIRD[Math.floor(r() * WEIRD.length)]);
    }
  }
  while (stack.length && r() < 0.9) out.push(`Program ${stack.pop()} success`);
  return out;
}
