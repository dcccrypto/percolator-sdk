import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  deriveBondTrancheV22,
  deriveBondPositionV22,
  deriveInsuranceUnitsV22,
  deriveG9FeedAllowlistV22,
  SEEDS_V22,
} from "../src/abi/v22-wire.js";

const raw = (seeds: Uint8Array[], pid: PublicKey) => PublicKey.findProgramAddressSync(seeds, pid);
const same = (a: [PublicKey, number], b: [PublicKey, number]) => a[0].equals(b[0]) && a[1] === b[1];

describe("v22-wire PDA memo", () => {
  it("differential: 2000 random inputs (each called twice) match uncached findProgramAddressSync", { timeout: 600_000 }, () => {
    let mismatches = 0;
    const pids = Array.from({ length: 4 }, () => Keypair.generate().publicKey);
    for (let i = 0; i < 2000; i++) {
      const pid = pids[i % 4];
      const m = Keypair.generate().publicKey;
      const o = Keypair.generate().publicKey;
      const exp = [
        raw([Buffer.from(SEEDS_V22.bondTranche), m.toBuffer()], pid),
        raw([Buffer.from(SEEDS_V22.bondPosition), m.toBuffer(), o.toBuffer()], pid),
        raw([Buffer.from(SEEDS_V22.insuranceUnits), m.toBuffer()], pid),
        raw([Buffer.from(SEEDS_V22.g9Feeds)], pid),
      ];
      for (let pass = 0; pass < 2; pass++) {
        const got = [
          deriveBondTrancheV22(pid, m),
          deriveBondPositionV22(pid, m, o),
          deriveInsuranceUnitsV22(pid, m),
          deriveG9FeedAllowlistV22(pid),
        ];
        got.forEach((g, k) => { if (!same(g, exp[k])) mismatches++; });
      }
    }
    expect(mismatches).toBe(0);
  });

  it("returns fresh tuples/keys so callers cannot poison the cache", () => {
    const pid = Keypair.generate().publicKey;
    const m = Keypair.generate().publicKey;
    const a = deriveBondTrancheV22(pid, m);
    const expected = a[0].toBase58();
    a[1] = 0;
    a[0].toBytes().fill(0);
    (a[0] as unknown as { _bn: unknown })._bn = null;
    const b = deriveBondTrancheV22(pid, m);
    expect(b).not.toBe(a);
    expect(b[0].toBase58()).toBe(expected);
    expect(b[1]).not.toBe(0);
  });

  it("different programId / owner never collide", () => {
    const p1 = Keypair.generate().publicKey, p2 = Keypair.generate().publicKey;
    const m = Keypair.generate().publicKey;
    const o1 = Keypair.generate().publicKey, o2 = Keypair.generate().publicKey;
    expect(deriveBondTrancheV22(p1, m)[0].equals(deriveBondTrancheV22(p2, m)[0])).toBe(false);
    expect(deriveBondPositionV22(p1, m, o1)[0].equals(deriveBondPositionV22(p1, m, o2)[0])).toBe(false);
  });
});
