import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import * as pda from "../src/solana/pda.js";

const enc = new TextEncoder();
const u16 = (n: number) => {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
};
const direct = (seeds: Uint8Array[], pid: PublicKey) => PublicKey.findProgramAddressSync(seeds, pid);

// Small deterministic PRNG so failures are reproducible.
let s = 0x9e3779b9;
const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const mkKey = () => {
  const b = new Uint8Array(32);
  for (let i = 0; i < 32; i++) b[i] = Math.floor(rnd() * 256);
  return new PublicKey(b);
};

const programs = Array.from({ length: 4 }, mkKey);
const hot = Array.from({ length: 24 }, mkKey);
// Half the picks come from the hot pool (cache hits), half are fresh (misses + eviction past the cap).
const key = () => (rnd() < 0.5 ? hot[Math.floor(rnd() * hot.length)] : mkKey());
const prog = () => programs[Math.floor(rnd() * programs.length)];

type Case = () => { got: [PublicKey, number]; want: [PublicKey, number] };
const cases: Case[] = [
  () => { const p = prog(), m = key(); return { got: pda.deriveVaultAuthority(p, m), want: direct([enc.encode("vault"), m.toBytes()], p) }; },
  () => { const a = key(), mint = key(); return { got: pda.deriveCanonicalVaultForAuthority(a, mint), want: direct([a.toBytes(), pda.PERCOLATOR_VAULT_TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()], pda.ASSOCIATED_TOKEN_PROGRAM_ID) }; },
  () => { const p = prog(), m = key(), mint = key(); const [va] = direct([enc.encode("vault"), m.toBytes()], p); return { got: pda.deriveCanonicalVault(p, m, mint), want: direct([va.toBytes(), pda.PERCOLATOR_VAULT_TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()], pda.ASSOCIATED_TOKEN_PROGRAM_ID) }; },
  () => { const p = prog(), m = key(); return { got: pda.deriveInsuranceLpMint(p, m), want: direct([enc.encode("lp_vault_mint"), m.toBytes()], p) }; },
  () => { const p = prog(), m = key(), i = Math.floor(rnd() * 65536); return { got: pda.deriveLpPda(p, m, i), want: direct([enc.encode("lp"), m.toBytes(), u16(i)], p) }; },
  () => { const p = prog(), m = key(); return { got: pda.deriveCreatorLockPda(p, m), want: direct([enc.encode(pda.CREATOR_LOCK_SEED), m.toBytes()], p) }; },
  () => { const p = prog(), m = key(); return { got: pda.deriveLpVaultRegistry(p, m), want: direct([enc.encode("lp_vault"), m.toBytes()], p) }; },
  () => { const p = prog(), r = key(), u = key(); return { got: pda.deriveLpRedemption(p, r, u), want: direct([enc.encode("lp_redemption"), r.toBytes(), u.toBytes()], p) }; },
  () => { const p = prog(), m = key(), d = Math.floor(rnd() * 65536); return { got: pda.deriveLpBackingLedger(p, m, d), want: direct([enc.encode("lp_backing_ledger"), m.toBytes(), u16(d)], p) }; },
  () => { const p = prog(), m = key(); return { got: pda.deriveLpEscrow(p, m), want: direct([enc.encode("lp_escrow"), m.toBytes()], p) }; },
  () => { const p = prog(), m = key(); return { got: pda.deriveNftRegistry(p, m), want: direct([enc.encode("nft_registry"), m.toBytes()], p) }; },
  () => { const p = prog(), a = key(), b = key(), c = key(), d = key(), e = key(); return { got: pda.deriveMatcherDelegate(p, a, b, c, d, e), want: direct([enc.encode("matcher"), a.toBytes(), b.toBytes(), c.toBytes(), d.toBytes(), e.toBytes()], p) }; },
  () => {
    const feed = new Uint8Array(32).map(() => Math.floor(rnd() * 256));
    const hex = Buffer.from(feed).toString("hex");
    return { got: pda.derivePythPushOraclePDA(rnd() < 0.5 ? "0x" + hex : hex), want: direct([new Uint8Array(2), feed], pda.PYTH_PUSH_ORACLE_PROGRAM_ID) };
  },
];

describe("core PDA memo == direct findProgramAddressSync", () => {
  it("20k random inputs identical [pubkey, bump] (hits, misses, eviction)", () => {
    for (let n = 0; n < 20_000; n++) {
      const { got, want } = cases[n % cases.length]();
      if (!got[0].equals(want[0]) || got[1] !== want[1]) {
        throw new Error(`mismatch at n=${n} case=${n % cases.length}`);
      }
    }
  }, 600_000);

  it("returns a fresh tuple per call (cache not corruptible)", () => {
    const m = hot[0], p = programs[0];
    const a = pda.deriveVaultAuthority(p, m);
    const want = direct([enc.encode("vault"), m.toBytes()], p);
    a[1] = 0;
    const b = pda.deriveVaultAuthority(p, m);
    expect(b[1]).toBe(want[1]);
    expect(b[0].equals(want[0])).toBe(true);
  });

  it("distinct seed layouts never alias", () => {
    const p = programs[0];
    expect(pda.deriveLpEscrow(p, hot[1])[0].equals(pda.deriveLpVaultRegistry(p, hot[1])[0])).toBe(false);
    expect(pda.deriveLpPda(p, hot[1], 1)[0].equals(pda.deriveLpPda(p, hot[1], 256)[0])).toBe(false);
  });

  it("errors preserved", () => {
    expect(() => pda.deriveLpPda(programs[0], hot[0], -1)).toThrow(/lpIdx/);
    expect(() => pda.derivePythPushOraclePDA("zz")).toThrow(/feedIdHex/);
  });
});
