import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { deriveVaultLpStateP3, deriveProgramDataAddressP3, BPF_LOADER_UPGRADEABLE_ID_P3 } from "../src/solana/p3-vault-lp.js";
import { makePdaMemo, pdaMemoKey } from "../src/abi/pda-memo.js";
import { buildSetAdlWindDownMaxSlotsIx } from "../src/abi/p2b-lock-exits.js";

const ITER = process.env.PDA_MEMO_FULL ? 10_000 : 400;
const kp = () => Keypair.generate().publicKey;
const oldVault = (p: PublicKey, m: PublicKey) => PublicKey.findProgramAddressSync([new TextEncoder().encode("vault_lp"), m.toBytes()], p);
const oldPd = (p: PublicKey) => PublicKey.findProgramAddressSync([p.toBytes()], BPF_LOADER_UPGRADEABLE_ID_P3);

describe("PDA memo differential", () => {
  it("vault_lp: random keys (10k with PDA_MEMO_FULL=1) old == new (cold + warm)", () => {
    let mismatches = 0;
    for (let i = 0; i < ITER; i++) {
      const p = i % 7 === 0 ? kp() : PROGS[i % PROGS.length], m = kp();
      const want = oldVault(p, m);
      for (let r = 0; r < 2; r++) {
        const got = deriveVaultLpStateP3(p, m);
        if (!got[0].equals(want[0]) || got[1] !== want[1]) mismatches++;
      }
    }
    expect(mismatches).toBe(0);
  }, 900_000);
  it("programData: random keys (10k with PDA_MEMO_FULL=1) old == new for p3 and p2b builder", () => {
    let mismatches = 0;
    const auth = kp(), market = kp();
    for (let i = 0; i < ITER; i++) {
      const p = PROGS[i % PROGS.length] && i % 3 ? PROGS[i % PROGS.length] : kp();
      const want = oldPd(p);
      for (let r = 0; r < 2; r++) {
        const got = deriveProgramDataAddressP3(p);
        if (!got[0].equals(want[0]) || got[1] !== want[1]) mismatches++;
      }
      if (i % 50 === 0) {
        const ix = buildSetAdlWindDownMaxSlotsIx(p, market, auth, { assetIndex: 0, maxEpisodeSlots: 300 });
        if (!ix.keys[1].pubkey.equals(want[0])) mismatches++;
      }
    }
    expect(mismatches).toBe(0);
  }, 900_000);
  it("caller mutation cannot corrupt cache", () => {
    const p = kp(), m = kp();
    const a = deriveVaultLpStateP3(p, m);
    a[1] = 0;
    expect(deriveVaultLpStateP3(p, m)[1]).toBe(oldVault(p, m)[1]);
  });
  it("cap: memo stays bounded and recomputes correctly after eviction", () => {
    const memo = makePdaMemo(4);
    let calls = 0;
    const pk = kp();
    const compute = (n: number) => () => { calls++; return [pk, n] as [PublicKey, number]; };
    for (let i = 0; i < 100; i++) {
      expect(memo.get(pdaMemoKey(new Uint8Array([i])), compute(i))[1]).toBe(i);
      expect(memo.size()).toBeLessThanOrEqual(4);
    }
    expect(calls).toBe(100);
    memo.get(pdaMemoKey(new Uint8Array([99])), compute(99)); // warm hit
    expect(calls).toBe(100);
    expect(memo.get(pdaMemoKey(new Uint8Array([0])), compute(0))[1]).toBe(0); // evicted -> recomputed
    expect(calls).toBe(101);
  });
});
const PROGS = Array.from({ length: 16 }, kp);
