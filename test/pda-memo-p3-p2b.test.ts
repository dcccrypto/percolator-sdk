import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { deriveVaultLpStateP3, deriveProgramDataAddressP3, BPF_LOADER_UPGRADEABLE_ID_P3, __pdaMemoSizesP3, __PDA_MEMO_MAX_P3 } from "../src/solana/p3-vault-lp.js";
import { buildSetAdlWindDownMaxSlotsIx, __programDataMemoSizeP2b } from "../src/abi/p2b-lock-exits.js";

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
  it("cap: memo stays bounded and stays correct after eviction", () => {
    const p = kp();
    const ms = Array.from({ length: __PDA_MEMO_MAX_P3 + 50 }, kp);
    for (const m of ms) deriveVaultLpStateP3(p, m);
    for (const x of ms) deriveProgramDataAddressP3(kp());
    const s = __pdaMemoSizesP3();
    expect(s.vaultLp).toBeLessThanOrEqual(__PDA_MEMO_MAX_P3);
    expect(s.programData).toBeLessThanOrEqual(__PDA_MEMO_MAX_P3);
    for (const m of ms.slice(0, 5)) expect(deriveVaultLpStateP3(p, m)[0].equals(oldVault(p, m)[0])).toBe(true);
    const auth = kp(), mk = kp();
    for (let i = 0; i < 1030; i++) buildSetAdlWindDownMaxSlotsIx(kp(), mk, auth, { assetIndex: 0, maxEpisodeSlots: 1 });
    expect(__programDataMemoSizeP2b()).toBeLessThanOrEqual(1024);
  }, 900_000);
});
const PROGS = Array.from({ length: 16 }, kp);
