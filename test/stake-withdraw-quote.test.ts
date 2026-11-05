/**
 * quoteStakeWithdrawNowV5 against the E2E-A FCAFL recorded numbers (2026-10-17 steps 62-64): liquid 10.96M, deployed 5.48M after the
 * 30.48M loss (units 10.96M -> 5.48M), full redeem 16,439,178 refused Custom 36, a 10M LP partial paid 8.22M.
 */
import { describe, it, expect } from "vitest";
import { quoteStakeWithdrawNowV5, collateralForLpV5 } from "../src/abi/v22-stake.js";

const pool = { totalDeposited: 21_920_000n, totalWithdrawn: 0n, totalFlushed: 10_960_000n, totalReturned: 0n, totalFeesEarned: 0n, realizedJuniorLoss: 0n, totalLpSupply: 20_000_000n };
const units = { unitsStake: 10_960_000n, unitsTotal: 65_280_000n }; // 10.96M of 65.28M units; insurance 36.30M -> 6.09M? pinned below via exitInsurance
describe("quoteStakeWithdrawNowV5", () => {
  // exit reading chosen so deployed = 5.48M exactly: 10.96M * ins / 65.28M = 5.48M -> ins = 32.64M
  const ins = 32_640_000n;
  it("cap binds after a loss: max now = liquid, rest deferred; the quoted LP burn fits the cap and +1 LP does not", () => {
    const q = quoteStakeWithdrawNowV5(pool, units, ins, 10_960_000n, 20_000_000n)!;
    expect(q.liquidCap).toBe(10_960_000n);
    expect(q.redeemable).toBeGreaterThan(q.liquidCap);
    expect(q.capBinds).toBe(true);
    expect(q.maxCollateralNow).toBe(10_960_000n);
    expect(q.deferred).toBe(q.redeemable - 10_960_000n);
    const pv = 10_960_000n + 5_480_000n;
    expect(collateralForLpV5(q.maxLpNow, pool.totalLpSupply, pv)! <= q.liquidCap).toBe(true);
    expect(collateralForLpV5(q.maxLpNow + 1n, pool.totalLpSupply, pv)! > q.liquidCap).toBe(true);
    // the recorded partial: 10M LP paid 8.22M (<= liquid), so it is within maxLpNow
    expect(collateralForLpV5(10_000_000n, pool.totalLpSupply, pv)).toBe(8_220_000n);
    expect(q.maxLpNow >= 10_000_000n).toBe(true);
  });
  it("no loss: cap does not bind, max = balance", () => {
    const q = quoteStakeWithdrawNowV5({ ...pool, totalFlushed: 0n }, { unitsStake: 0n, unitsTotal: 0n }, 0n, 21_920_000n, 5_000_000n)!;
    expect(q.capBinds).toBe(false);
    expect(q.maxLpNow).toBe(5_000_000n);
    expect(q.deferred).toBe(0n);
  });
  it("vault balance below liquid also caps; empty supply is null", () => {
    expect(quoteStakeWithdrawNowV5({ ...pool, totalFlushed: 0n }, { unitsStake: 0n, unitsTotal: 0n }, 0n, 1_000_000n, 20_000_000n)!.liquidCap).toBe(1_000_000n);
    expect(quoteStakeWithdrawNowV5({ ...pool, totalLpSupply: 0n }, units, ins, 1n, 1n)).toBeNull();
  });
  it("liquid 0: maxLpNow is 0 and pays 0 (no dust burn); just above dust it is non-zero and pays > 0", () => {
    const dust = quoteStakeWithdrawNowV5(pool, units, ins, 0n, 20_000_000n)!;
    expect(dust.liquidCap).toBe(0n);
    expect(dust.maxCollateralNow).toBe(0n);
    expect(dust.maxLpNow).toBe(0n);
    expect(dust.capBinds).toBe(true);
    // cap of 1 atom: a burn paying 1 atom exists (pv 16.44M / supply 20M => ~25 LP atoms per collateral atom)
    const one = quoteStakeWithdrawNowV5(pool, units, ins, 1n, 20_000_000n)!;
    expect(one.maxCollateralNow).toBe(1n);
    expect(one.maxLpNow > 0n).toBe(true);
    expect(collateralForLpV5(one.maxLpNow, pool.totalLpSupply, 10_960_000n + 5_480_000n)! >= 1n).toBe(true);
  });
  it("FGSFL devnet 2026-10-20: a stale units snapshot (60M) after a -30M loss over-quotes; clamping to the live free reading (30M = Σ domain withdraw capacity) matches what the program paid", () => {
    const p = { totalDeposited: 20_000_000n, totalWithdrawn: 0n, totalFlushed: 10_000_000n, totalReturned: 0n, totalFeesEarned: 960_000n, realizedJuniorLoss: 0n, totalLpSupply: 20_000_000n };
    const u = { unitsStake: 10_000_000n, unitsTotal: 60_000_000n };
    const stale = quoteStakeWithdrawNowV5(p, u, 60_000_000n, 10_960_000n, 19_999_000n)!;
    expect(stale.maxCollateralNow).toBe(10_960_000n); // what the old call said
    const live = quoteStakeWithdrawNowV5(p, u, 60_000_000n, 10_960_000n, 19_999_000n, 30_000_000n)!;
    // deployed = 10M * 30M / 60M = 5.0M (the program log said deployed 5000000); the on-chain payout for 10,458,016 LP was 8,345,496
    expect(collateralForLpV5(10_458_016n, p.totalLpSupply, 10_960_000n + 5_000_000n)).toBe(8_345_496n);
    expect(live.deferred).toBe(live.redeemable - live.maxCollateralNow);
    expect(live.redeemable).toBeLessThan(stale.redeemable);
  });
  it("a stale-LOW snapshot (30M) under a live reading of 60M: the quote prices at live, since Withdraw refreshes to live before pricing", () => {
    const p = { totalDeposited: 20_000_000n, totalWithdrawn: 0n, totalFlushed: 10_000_000n, totalReturned: 0n, totalFeesEarned: 960_000n, realizedJuniorLoss: 0n, totalLpSupply: 20_000_000n };
    const u = { unitsStake: 10_000_000n, unitsTotal: 60_000_000n };
    const atLive = 10_960_000n + 10_000_000n; // deployed = 10M * 60M / 60M
    // priced at the snapshot, the capped burn pays more than the liquid 10.96M once the program prices it at live: refused 36
    const atSnap = quoteStakeWithdrawNowV5(p, u, 30_000_000n, 10_960_000n, 19_999_000n)!;
    expect(atSnap.maxLpNow).toBe(13_734_336n);
    expect(collateralForLpV5(atSnap.maxLpNow, p.totalLpSupply, atLive)).toBe(14_393_584n);
    const q = quoteStakeWithdrawNowV5(p, u, 30_000_000n, 10_960_000n, 19_999_000n, 60_000_000n)!;
    expect(q).toEqual(quoteStakeWithdrawNowV5(p, u, 60_000_000n, 10_960_000n, 19_999_000n));
    expect(q.capBinds).toBe(true);
    expect(q.maxLpNow).toBe(10_458_016n);
    expect(collateralForLpV5(q.maxLpNow, p.totalLpSupply, atLive)).toBe(10_960_000n);
    expect(collateralForLpV5(q.maxLpNow + 1n, p.totalLpSupply, atLive)! > 10_960_000n).toBe(true);
  });
});
