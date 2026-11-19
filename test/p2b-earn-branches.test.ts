/**
 * Branch-coverage tests for src/abi/p2b-earn.ts and src/solana/p2b-earn.ts: the guards the
 * parity suite (p2b-earn.test.ts) does not reach. Tests only; no src change.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cushionSplitP2b, decodeSeniorFloorRecordP2b, entryVsExitP2b, nonboundVaultPricingP2b, vaultLpAllocSplitP2b } from "../src/abi/p2b-earn.js";
import { decodeBackingDomainLedgerP2b, readPotEngineRecordsP2b } from "../src/solana/p2b-earn.js";
import { stampMarket } from "./helpers/stamp.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/p2b-parity.json", import.meta.url), "utf8")) as { ledgerAccountHex: string; potLayout: { marketGroupOff: number; marketGroupHeaderLen: number; assetSlotLen: number } };
const unhex = (h: string): Uint8Array => new Uint8Array(Buffer.from(h, "hex"));
const pot = (principal: bigint, physicalNet: bigint) => ({ totalPrincipalAtoms: principal, totalEarningsAtoms: 0n, totalEarningsWithdrawnAtoms: 0n, physicalNetAtoms: physicalNet });

describe("p2b-earn branch gaps", () => {
  it("decodeSeniorFloorRecordP2b rejects a record that is not exactly 64 bytes", () => {
    expect(() => decodeSeniorFloorRecordP2b(new Uint8Array(63))).toThrow(/must be 64 bytes, got 63/);
    expect(() => decodeSeniorFloorRecordP2b(new Uint8Array(65))).toThrow(/must be 64 bytes, got 65/);
  });

  it("decodeBackingDomainLedgerP2b rejects a wrong v17 magic", () => {
    const bad = unhex(FX.ledgerAccountHex);
    bad[0] ^= 0xff;
    expect(() => decodeBackingDomainLedgerP2b(bad)).toThrow(/invalid v17 magic/);
  });

  it("readPotEngineRecordsP2b rejects a negative or non-integer domain", () => {
    const L = FX.potLayout;
    const m = new Uint8Array(L.marketGroupOff + L.marketGroupHeaderLen + 2 * L.assetSlotLen);
    stampMarket(m);
    expect(() => readPotEngineRecordsP2b(m, -1)).toThrow(/bad domain -1/);
    expect(() => readPotEngineRecordsP2b(m, 1.5)).toThrow(/bad domain 1\.5/);
    expect(() => readPotEngineRecordsP2b(m, Number.NaN)).toThrow(/bad domain NaN/);
  });

  it("cushionSplitP2b: share below need takes the share; need below share takes the need; zero dials skip", () => {
    // share = 1000*1000/10000 = 100; need = ceil(10000*5000/10000)=5000 - juniorLevel 0 = 5000 -> cushion = share
    expect(cushionSplitP2b(1_000n, 1_000, 5_000, 10_000n, 0n)).toEqual([900n, 100n]);
    // share = 500; need = 1000 - 900 = 100 -> cushion = need
    expect(cushionSplitP2b(1_000n, 5_000, 1_000, 10_000n, 900n)).toEqual([900n, 100n]);
    expect(cushionSplitP2b(1_000n, 0, 1_000, 10_000n, 0n)).toEqual([1_000n, 0n]);
    expect(cushionSplitP2b(1_000n, 5_000, 0, 10_000n, 0n)).toEqual([1_000n, 0n]);
  });

  it("entryVsExitP2b: zero entry value reports 0 bps haircut", () => {
    const p = nonboundVaultPricingP2b(pot(10_000n, 9_000n), pot(0n, 0n), 10_000);
    const v = entryVsExitP2b(0n, 10_000n, p);
    expect(v).toEqual({ entryValueAtoms: 0n, exitValueAtoms: 0n, haircutAtoms: 0n, haircutBps: 0 });
  });

  it("vaultLpAllocSplitP2b: both pot orderings conserve `moved` and stay within each drawable", () => {
    for (const [d0, d1] of [[300n, 100n], [100n, 300n], [7n, 7n], [1n, 1_000_003n]] as const) {
      for (const moved of [0n, 1n, 2n, (d0 + d1) / 2n, d0 + d1]) {
        const r = vaultLpAllocSplitP2b(moved, d0, d1);
        expect(r).not.toBeNull();
        const [a, b] = r!;
        expect(a + b).toBe(moved);
        expect(a <= d0 && b <= d1).toBe(true);
      }
    }
    expect(vaultLpAllocSplitP2b(401n, 300n, 100n)).toBeNull();
  });
});
