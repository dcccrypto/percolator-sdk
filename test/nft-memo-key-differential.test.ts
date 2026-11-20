import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import * as cur from "../src/abi/nft.js";

// Reference: the single-level memoPda as it was before the two-level hex key
// (String.fromCharCode spread of programId + seeds), same 4096-entry clear-when-full
// bound, so eviction happens at the same points in both.
const TEXT = new TextEncoder();
const EMPTY = new Uint8Array(0);
const oldCache = new Map<string, [PublicKey, number]>();
function oldMemo(kind: string, programId: PublicKey, a: Uint8Array, b: Uint8Array, compute: () => [PublicKey, number]): [PublicKey, number] {
  const key = kind + String.fromCharCode(...programId.toBytes()) + String.fromCharCode(...a) + String.fromCharCode(...b);
  const hit = oldCache.get(key);
  if (hit) return [hit[0], hit[1]];
  const res = compute();
  if (oldCache.size >= 4096) oldCache.clear();
  oldCache.set(key, res);
  return [res[0], res[1]];
}
function oldU64(value: bigint | number, label: string): Uint8Array {
  const v = typeof value === "bigint" ? value : BigInt(value);
  if (v < 0n || v > 0xffff_ffff_ffff_ffffn) throw new Error(`${label} must be a u64`);
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, v, true);
  return buf;
}
const old = {
  deriveNftPda(p: PublicKey, id: bigint | number, programId = cur.NFT_PROGRAM_ID) {
    const s = oldU64(id, "marketId");
    const pb = p.toBytes();
    return oldMemo("n", programId, pb, s, () => PublicKey.findProgramAddressSync([TEXT.encode("position_nft"), pb, s], programId));
  },
  deriveExtraAccountMetas(m: PublicKey, programId = cur.NFT_PROGRAM_ID) {
    const mb = m.toBytes();
    return oldMemo("x", programId, mb, EMPTY, () => PublicKey.findProgramAddressSync([TEXT.encode("extra-account-metas"), mb], programId));
  },
  deriveMintAuthority(programId = cur.NFT_PROGRAM_ID) {
    return oldMemo("m", programId, EMPTY, EMPTY, () => PublicKey.findProgramAddressSync([TEXT.encode("mint_authority")], programId));
  },
};

// Deterministic PRNG (mulberry32) so a failure is reproducible.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Outcome = { ok: true; key: string; bump: number } | { ok: false; name: string; message: string };
function run(f: () => [PublicKey, number]): Outcome {
  try {
    const [k, b] = f();
    return { ok: true, key: k.toBase58(), bump: b };
  } catch (e) {
    return { ok: false, name: (e as Error).name, message: (e as Error).message };
  }
}

describe("nft memo key: two-level hex key == old fromCharCode key", () => {
  it("5k random PDA inputs incl. repeats, evictions, alt/equal program ids and errors", () => {
    const r = rng(20261120);
    const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
    // Seeded 32-byte keys (any bytes are a valid PublicKey / seed / program id).
    const key = () => new PublicKey(Uint8Array.from({ length: 32 }, () => Math.floor(r() * 256)));
    const owners = Array.from({ length: 3000 }, () => key());
    const mints = Array.from({ length: 3000 }, () => key());
    const programs: (PublicKey | undefined)[] = [
      undefined,
      cur.NFT_PROGRAM_ID,
      new PublicKey(cur.NFT_PROGRAM_ID.toBytes()), // equal value, different instance
      key(),
      key(),
    ];
    const badIds: (bigint | number)[] = [-1, -1n, 2n ** 64n, 1.5, Number.NaN];
    const ops: { label: string; c: () => [PublicKey, number]; o: () => [PublicKey, number] }[] = [];
    const distinct = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      if (i > 0 && r() < 0.06) { ops.push(ops[Math.floor(r() * ops.length)]); continue; } // repeat
      const prog = pick(programs);
      const pTag = (prog ?? cur.NFT_PROGRAM_ID).toBase58();
      const t = r();
      if (t < 0.6) {
        const p = pick(owners);
        const id: bigint | number = r() < 0.03 ? pick(badIds) : r() < 0.5 ? Math.floor(r() * 4) : BigInt(Math.floor(r() * 2 ** 53)) * 1000n;
        distinct.add(`n${pTag}${p.toBase58()}${String(id)}`);
        ops.push({ label: `nft ${p.toBase58()} ${String(id)} ${pTag}`,
          c: () => (prog ? cur.deriveNftPda(p, id, prog) : cur.deriveNftPda(p, id)),
          o: () => (prog ? old.deriveNftPda(p, id, prog) : old.deriveNftPda(p, id)) });
      } else if (t < 0.97) {
        const m = pick(mints);
        distinct.add(`x${pTag}${m.toBase58()}`);
        ops.push({ label: `xmeta ${m.toBase58()} ${pTag}`,
          c: () => (prog ? cur.deriveExtraAccountMetas(m, prog) : cur.deriveExtraAccountMetas(m)),
          o: () => (prog ? old.deriveExtraAccountMetas(m, prog) : old.deriveExtraAccountMetas(m)) });
      } else {
        ops.push({ label: `mintauth ${pTag}`,
          c: () => (prog ? cur.deriveMintAuthority(prog) : cur.deriveMintAuthority()),
          o: () => (prog ? old.deriveMintAuthority(prog) : old.deriveMintAuthority()) });
      }
    }
    // Enough distinct keys to overflow the 4096 bound at least once.
    expect(distinct.size).toBeGreaterThan(4096);
    let errors = 0;
    for (const op of ops) {
      const a = run(op.c);
      const b = run(op.o);
      if (!a.ok) errors++;
      expect(a, op.label).toEqual(b);
    }
    expect(errors).toBeGreaterThan(0);
    // Second pass after evictions: warm, re-derived and evicted keys all still match.
    for (const op of ops.slice(0, 1000)) expect(run(op.c), op.label).toEqual(run(op.o));
  }, 600_000);

  it("default id and an equal-value instance share a result; the returned tuple is not the cache entry", () => {
    const p = Keypair.generate().publicKey;
    const twin = new PublicKey(cur.NFT_PROGRAM_ID.toBytes());
    const a = cur.deriveNftPda(p, 7);
    expect(cur.deriveNftPda(p, 7, twin)).toEqual(a);
    a[1] = -1;
    expect(cur.deriveNftPda(p, 7)[1]).toBe(old.deriveNftPda(p, 7)[1]);
    // A non-default id never aliases the default-id entry.
    const other = Keypair.generate().publicKey;
    expect(cur.deriveNftPda(p, 7, other)[0].equals(cur.deriveNftPda(p, 7)[0])).toBe(false);
  });
});
