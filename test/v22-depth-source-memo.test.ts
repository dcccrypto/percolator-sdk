import { describe, it, expect, beforeEach } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { deriveDepthSourceV22, derivePoolClaimV22, programDataAddressV22, _depthSourceMemoV22, DEPTH_SOURCE_PDA_MEMO_CAP_V22, DEPTH_SOURCE_SEED_V22, POOL_CLAIM_SEED_V22 } from "../src/abi/v22-depth-source.js";

const LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const rk = () => Keypair.generate().publicKey;

describe("v22-depth-source PDA memo", () => {
  beforeEach(() => _depthSourceMemoV22.clear());

  it("10k random derivations: memoised == direct, cold and warm", () => {
    const progs = Array.from({ length: 20 }, rk);
    const progData = progs.map((p) => PublicKey.findProgramAddressSync([p.toBytes()], LOADER));
    let mismatches = 0;
    for (let i = 0; i < 10000; i++) {
      const prog = progs[i % 20];
      const key = i % 3 === 0 ? progs[(i * 7) % 20] : rk();
      const d = PublicKey.findProgramAddressSync([Buffer.from(DEPTH_SOURCE_SEED_V22), key.toBuffer()], prog);
      const c = PublicKey.findProgramAddressSync([Buffer.from(POOL_CLAIM_SEED_V22), key.toBuffer()], prog);
      const g = progData[i % 20];
      for (let pass = 0; pass < 2; pass++) {
        const md = deriveDepthSourceV22(prog, key), mc = derivePoolClaimV22(prog, key);
        if (!md[0].equals(d[0]) || md[1] !== d[1]) mismatches++;
        if (!mc[0].equals(c[0]) || mc[1] !== c[1]) mismatches++;
        if (!programDataAddressV22(prog).equals(g[0])) mismatches++;
      }
    }
    expect(mismatches).toBe(0);
  }, 900_000);

  it("returned tuples are copies (caller mutation cannot poison the memo)", () => {
    const p = rk(), m = rk();
    const a = deriveDepthSourceV22(p, m);
    const orig = a[0];
    a[0] = rk(); a[1] = 0;
    const b = deriveDepthSourceV22(p, m);
    expect(b[0].equals(orig)).toBe(true);
  });

  it("is bounded: size never exceeds the cap and oldest entries evict", () => {
    const p = rk();
    const first = rk();
    deriveDepthSourceV22(p, first);
    for (let i = 0; i < DEPTH_SOURCE_PDA_MEMO_CAP_V22 + 50; i++) {
      deriveDepthSourceV22(p, rk());
      derivePoolClaimV22(p, rk());
      expect(_depthSourceMemoV22.sizes().depthSource).toBeLessThanOrEqual(DEPTH_SOURCE_PDA_MEMO_CAP_V22);
    }
    expect(_depthSourceMemoV22.sizes().depthSource).toBe(DEPTH_SOURCE_PDA_MEMO_CAP_V22);
    expect(_depthSourceMemoV22.sizes().poolClaim).toBe(DEPTH_SOURCE_PDA_MEMO_CAP_V22);
    // evicted entry still derives correctly
    const direct = PublicKey.findProgramAddressSync([Buffer.from(DEPTH_SOURCE_SEED_V22), first.toBuffer()], p);
    expect(deriveDepthSourceV22(p, first)[0].equals(direct[0])).toBe(true);
  }, 600_000);
});
