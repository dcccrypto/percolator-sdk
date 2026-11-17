import { describe, it, expect } from "vitest";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  TX_LEGACY_MAX_BYTES,
  TX_MAX_COMPUTE_UNITS,
  TX_V1_MAX_ADDRESSES,
  TX_V1_MAX_BYTES,
  TX_V1_MAX_INSTRUCTIONS,
  measureTxBytes,
  packInstructionGroups,
  type BudgetParams,
  type PackGroup,
  type PackOptions,
  type PackedTx,
} from "../src/runtime/txv1.js";

/** Verbatim copy of the pre-optimisation (recompile-on-every-append) packer, the oracle. */
function referencePack<T>(groups: readonly PackGroup<T>[], opts: PackOptions): PackedTx<T>[] {
  const maxBytes = (opts.maxBytes ?? (opts.format === "v1" ? TX_V1_MAX_BYTES : TX_LEGACY_MAX_BYTES)) - (opts.byteMargin ?? 0);
  const maxCu = opts.maxComputeUnits ?? TX_MAX_COMPUTE_UNITS;
  const headroom = opts.cuHeadroom ?? 1;
  const budgetFor = (cu: number): BudgetParams => ({
    ...(opts.budget ?? {}),
    computeUnitLimit: Math.min(TX_MAX_COMPUTE_UNITS, Math.max(1, Math.ceil(cu * headroom))),
  });
  const fits = (gs: readonly PackGroup<T>[], cu: number) => {
    const ixs = gs.flatMap((g) => g.instructions);
    const keys = new Set<string>([opts.payer.toBase58()]);
    for (const ix of ixs) {
      keys.add(ix.programId.toBase58());
      for (const m of ix.keys) keys.add(m.pubkey.toBase58());
    }
    if (keys.size > TX_V1_MAX_ADDRESSES) return null;
    if (opts.format === "v1" && ixs.length > TX_V1_MAX_INSTRUCTIONS) return null;
    if (cu > maxCu) return null;
    if (opts.maxGroups !== undefined && gs.length > opts.maxGroups) return null;
    let bytes: number;
    try {
      bytes = measureTxBytes(opts.format, opts.payer, ixs, budgetFor(cu));
    } catch {
      return null;
    }
    if (bytes > maxBytes) return null;
    return { bytes, accounts: keys.size, ixs };
  };
  const plan: PackedTx<T>[] = [];
  let cur: PackGroup<T>[] = [];
  let curCu = 0;
  for (const g of groups) {
    const tryCu = curCu + g.computeUnits;
    if (cur.length > 0 && fits([...cur, g], tryCu)) {
      cur.push(g);
      curCu = tryCu;
      continue;
    }
    if (cur.length > 0) {
      const f = fits(cur, curCu)!;
      plan.push({ groups: cur, instructions: f.ixs, computeUnits: curCu, bytes: f.bytes, accounts: f.accounts });
    }
    cur = [g];
    curCu = g.computeUnits;
    if (!fits(cur, curCu)) throw new Error("packInstructionGroups: a single group does not fit within the limits of the selected format");
  }
  if (cur.length > 0) {
    const f = fits(cur, curCu)!;
    plan.push({ groups: cur, instructions: f.ixs, computeUnits: curCu, bytes: f.bytes, accounts: f.accounts });
  }
  return plan;
}

const payer = Keypair.fromSeed(new Uint8Array(32).fill(7)).publicKey;
const PROGS = [1, 2, 3].map((n) => new PublicKey(new Uint8Array(32).fill(n + 100)));
const pool = Array.from({ length: 40 }, (_, i) => new PublicKey(Uint8Array.from({ length: 32 }, (_, j) => (j === 0 ? i + 1 : 9))));

let seed = 12345;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

function randGroups(): PackGroup<number>[] {
  const n = ri(0, 24);
  return Array.from({ length: n }, (_, gi) => {
    const nix = ri(1, 2);
    return {
      tag: gi,
      computeUnits: ri(1, 300_000),
      instructions: Array.from({ length: nix }, () =>
        new TransactionInstruction({
          programId: PROGS[ri(0, 2)]!,
          keys: Array.from({ length: ri(0, 6) }, () => ({
            pubkey: rnd() < 0.5 ? pool[ri(0, 3)]! : rnd() < 0.7 ? pool[ri(0, 39)]! : Keypair.generate().publicKey,
            isSigner: rnd() < 0.05,
            isWritable: rnd() < 0.5,
          })),
          data: Buffer.alloc(ri(0, 200), 1),
        }),
      ),
    };
  });
}

function randOpts(format: PackOptions["format"]): PackOptions {
  const o: PackOptions = { format, payer };
  if (rnd() < 0.3) o.maxBytes = ri(300, 2000);
  if (rnd() < 0.2) o.byteMargin = ri(0, 50);
  if (rnd() < 0.3) o.maxComputeUnits = ri(100_000, 1_400_000);
  if (rnd() < 0.3) o.maxGroups = ri(1, 12);
  if (rnd() < 0.3) o.cuHeadroom = 1 + rnd();
  if (rnd() < 0.3) o.budget = { priorityMicroLamportsPerCu: ri(1, 100_000), heapBytes: rnd() < 0.5 ? 131072 : undefined };
  return o;
}

const snap = (p: PackedTx<number>[]) =>
  p.map((t) => ({
    tags: t.groups.map((g) => g.tag),
    same: t.groups.every((g, i) => g === t.groups[i]),
    ixs: t.instructions.length,
    cu: t.computeUnits,
    bytes: t.bytes,
    accounts: t.accounts,
  }));

function compare(groups: PackGroup<number>[], opts: PackOptions): boolean {
  let a: PackedTx<number>[] | string, b: PackedTx<number>[] | string;
  try { a = referencePack(groups, opts); } catch (e) { a = (e as Error).message; }
  try { b = packInstructionGroups(groups, opts); } catch (e) { b = (e as Error).message; }
  if (typeof a === "string" || typeof b === "string") return a === b;
  if (JSON.stringify(snap(a)) !== JSON.stringify(snap(b))) return false;
  // identity: same group objects and same instruction objects in the same order
  return a.every((t, i) => t.groups.every((g, j) => g === b[i]!.groups[j]) && t.instructions.every((x, j) => x === b[i]!.instructions[j]));
}

describe("packInstructionGroups differential vs pre-optimisation reference", () => {
  for (const format of ["v1", "legacy", "v0"] as const) {
    it(`fixed shapes (${format})`, () => {
      const mk = (n: number, nk: number, dl: number): PackGroup<number>[] =>
        Array.from({ length: n }, (_, i) => ({
          tag: i,
          computeUnits: 10_000,
          instructions: [
            new TransactionInstruction({
              programId: PROGS[0]!,
              keys: Array.from({ length: nk }, (_, k) => ({ pubkey: k === 0 ? pool[0]! : pool[(i * 7 + k) % 40]!, isSigner: false, isWritable: true })),
              data: Buffer.alloc(dl, 2),
            }),
          ],
        }));
      let mismatches = 0;
      for (const [n, nk, dl] of [[0, 1, 1], [1, 1, 1], [200, 2, 24], [57, 3, 100], [120, 1, 0], [30, 8, 400]] as const) {
        if (!compare(mk(n, nk, dl), { format, payer })) mismatches++;
      }
      expect(mismatches).toBe(0);
    }, 600_000);
    it(`1000 random inputs (${format})`, () => {
      let mismatches = 0;
      for (let i = 0; i < Number(process.env.PACK_DIFF_N ?? 1000); i++) if (!compare(randGroups(), randOpts(format))) mismatches++;
      expect(mismatches).toBe(0);
    }, 600_000);
  }
});
