import { describe, it, expect } from "vitest";
import { Keypair, PublicKey, SystemProgram, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  ACCOUNTS_STAKE_COMMIT_DEPLOY_TARGET_V5,
  ACCOUNTS_STAKE_DEPOSIT_V5,
  CONSENT_VERSION_FIRST_LOSS_V5,
  STAKE_ERRORS_V5,
  STAKE_POOL_FIELD_OFF_V5,
  STAKE_POOL_SIZE_V5,
  STAKE_RISK_MODE,
  closeoutCreatorShare,
  closeoutSplit,
  collateralForLpV5,
  commitSlotForPendingTargetV5,
  consentParamsForPoolV5,
  creatorCollateralAtaV5,
  decodeStakeErrorV5,
  decodeStakePoolV5,
  encodeStakeCommitDeployTargetV5,
  encodeStakeDepositWithConsentV5,
  encodeStakeInitPoolV5,
  encodeStakeProposeDeployTargetV5,
  encodeStakeSyncInsuranceDeploymentV5,
  quoteStakeWithdrawNowV5,
  stakeMetasV5,
  stakePoolValue,
} from "../src/abi/v22-stake.js";

const P = { targetBps: 5000, bufferBps: 3000, hysteresisBps: 500 };
const U64 = (1n << 64n) - 1n;

function poolBytes(over: (d: Uint8Array, v: DataView) => void = () => {}): Uint8Array {
  const d = new Uint8Array(STAKE_POOL_SIZE_V5);
  const v = new DataView(d.buffer);
  d.set([0x53, 0x50, 0x4f, 0x4f, 0x4c, 0x5f, 0x56, 0x31], STAKE_POOL_FIELD_OFF_V5.reserved);
  d[STAKE_POOL_FIELD_OFF_V5.version] = 5;
  d[STAKE_POOL_FIELD_OFF_V5.riskMode] = 1;
  v.setUint16(STAKE_POOL_FIELD_OFF_V5.deployTargetBps, 5000, true);
  v.setUint16(STAKE_POOL_FIELD_OFF_V5.hysteresisBps, 500, true);
  over(d, v);
  return d;
}

describe("v22-stake encoders", () => {
  it("encodes InitPool and rejects bad params", () => {
    const b = encodeStakeInitPoolV5(216_000n, 0n, 1, P);
    expect(b.length).toBe(24);
    expect(b[0]).toBe(0);
    expect(b[17]).toBe(1);
    expect(() => encodeStakeInitPoolV5(1n, 0n, 2, P)).toThrow(/FEE_ONLY/);
    expect(encodeStakeInitPoolV5(1n, 0n, 2, { ...P, targetBps: 0 })[17]).toBe(2);
    expect(() => encodeStakeInitPoolV5(1n, 0n, 1, { ...P, targetBps: 8001 })).toThrow(/targetBps/);
    expect(() => encodeStakeInitPoolV5(1n, 0n, 1, { ...P, targetBps: -1 })).toThrow(/targetBps/);
    expect(() => encodeStakeInitPoolV5(1n, 0n, 1, { ...P, targetBps: 1.5 })).toThrow(/targetBps/);
    expect(() => encodeStakeInitPoolV5(1n, 0n, 1, { ...P, targetBps: NaN })).toThrow(/targetBps/);
    expect(() => encodeStakeInitPoolV5(1n, 0n, 1, { ...P, bufferBps: 10_001 })).toThrow(/bufferBps/);
    expect(() => encodeStakeInitPoolV5(1n, 0n, 1, { ...P, hysteresisBps: 2001 })).toThrow(/hysteresisBps/);
    // boundaries accepted
    expect(() => encodeStakeInitPoolV5(1n, 0n, 1, { targetBps: 8000, bufferBps: 10_000, hysteresisBps: 2000 })).not.toThrow();
    expect(() => encodeStakeInitPoolV5(1n, 0n, 1, { targetBps: 0, bufferBps: 0, hysteresisBps: 0 })).not.toThrow();
  });

  it("encodes deposit consent with default and explicit version, rejects bad versions", () => {
    const b = encodeStakeDepositWithConsentV5(7n, P);
    expect(b.length).toBe(16);
    expect(b[0]).toBe(1);
    expect(b[9]).toBe(CONSENT_VERSION_FIRST_LOSS_V5);
    expect(encodeStakeDepositWithConsentV5(7n, P, 255)[9]).toBe(255);
    expect(encodeStakeDepositWithConsentV5(7n, P, 1)[9]).toBe(1);
    expect(() => encodeStakeDepositWithConsentV5(7n, P, 0)).toThrow(/version/);
    expect(() => encodeStakeDepositWithConsentV5(7n, P, 256)).toThrow(/version/);
    expect(() => encodeStakeDepositWithConsentV5(7n, { ...P, targetBps: 9000 })).toThrow(/targetBps/);
  });

  it("encodes the single-tag instructions and propose bounds", () => {
    expect([...encodeStakeSyncInsuranceDeploymentV5()]).toEqual([31]);
    expect([...encodeStakeCommitDeployTargetV5()]).toEqual([33]);
    expect([...encodeStakeProposeDeployTargetV5(0)]).toEqual([32, 0, 0]);
    expect([...encodeStakeProposeDeployTargetV5(8000)]).toEqual([32, 0x40, 0x1f]);
    expect(() => encodeStakeProposeDeployTargetV5(8001)).toThrow();
    expect(() => encodeStakeProposeDeployTargetV5(-1)).toThrow();
  });
});

describe("v22-stake consentParamsForPoolV5 / commit slot", () => {
  const base = { deployTargetBps: 4000, liquidBufferBps: 3000, hysteresisBps: 500, pendingTargetBps: 6000n, pendingTargetSlot: 0n } as never;
  it("ignores a pending target when slot is 0, takes the larger otherwise", () => {
    expect(consentParamsForPoolV5(base).targetBps).toBe(4000);
    expect(consentParamsForPoolV5({ ...(base as object), pendingTargetSlot: 5n } as never).targetBps).toBe(6000);
    expect(consentParamsForPoolV5({ ...(base as object), pendingTargetSlot: 5n, pendingTargetBps: 1000n } as never).targetBps).toBe(4000);
  });
  it("commit slot: null, cooldown below min, cooldown above min", () => {
    expect(commitSlotForPendingTargetV5({ pendingTargetSlot: 0n, cooldownSlots: 1n })).toBeNull();
    expect(commitSlotForPendingTargetV5({ pendingTargetSlot: 10n, cooldownSlots: 1n })).toBe(216_010n);
    expect(commitSlotForPendingTargetV5({ pendingTargetSlot: 10n, cooldownSlots: 216_000n })).toBe(216_010n);
    expect(commitSlotForPendingTargetV5({ pendingTargetSlot: 10n, cooldownSlots: 300_000n })).toBe(300_010n);
  });
});

describe("stakeMetasV5", () => {
  it("applies defaults, explicit overrides and throws on a missing key", () => {
    const anyone = Keypair.generate().publicKey;
    const pool = Keypair.generate().publicKey;
    const m = stakeMetasV5(ACCOUNTS_STAKE_COMMIT_DEPLOY_TARGET_V5, { anyone, pool });
    expect(m[2]!.pubkey.equals(SYSVAR_CLOCK_PUBKEY)).toBe(true);
    expect(m[0]).toEqual({ pubkey: anyone, isSigner: true, isWritable: false });
    const custom = Keypair.generate().publicKey;
    expect(stakeMetasV5(ACCOUNTS_STAKE_COMMIT_DEPLOY_TARGET_V5, { anyone, pool, clock: custom })[2]!.pubkey.equals(custom)).toBe(true);
    expect(() => stakeMetasV5(ACCOUNTS_STAKE_COMMIT_DEPLOY_TARGET_V5, { pool })).toThrow(/anyone/);
    const keys: Record<string, PublicKey> = {};
    for (const s of ACCOUNTS_STAKE_DEPOSIT_V5) keys[s.name] = Keypair.generate().publicKey;
    delete keys.tokenProgram;
    delete keys.systemProgram;
    const dm = stakeMetasV5(ACCOUNTS_STAKE_DEPOSIT_V5, keys);
    expect(dm.find((x, i) => ACCOUNTS_STAKE_DEPOSIT_V5[i]!.name === "tokenProgram")!.pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(dm.find((x, i) => ACCOUNTS_STAKE_DEPOSIT_V5[i]!.name === "systemProgram")!.pubkey.equals(SystemProgram.programId)).toBe(true);
  });
});

describe("decodeStakePoolV5", () => {
  it("decodes a valid pool and round-trips fields", () => {
    const d = poolBytes((b, v) => {
      v.setBigUint64(168, 111n, true);
      v.setBigUint64(176, 222n, true);
      v.setBigUint64(STAKE_POOL_FIELD_OFF_V5.lastSyncSlot, 9n, true);
      v.setUint16(STAKE_POOL_FIELD_OFF_V5.liquidBufferBps, 3000, true);
      b[STAKE_POOL_FIELD_OFF_V5.consentVersion] = 2;
      b[STAKE_POOL_FIELD_OFF_V5.v5Reserved] = 1;
    });
    const p = decodeStakePoolV5(d);
    expect(p.totalDeposited).toBe(111n);
    expect(p.totalLpSupply).toBe(222n);
    expect(p.lastSyncSlot).toBe(9n);
    expect(p.liquidBufferBps).toBe(3000);
    expect(p.consentVersion).toBe(2);
    expect(p.pendingTargetByProtocol).toBe(true);
    expect(p.creatorSeedAtoms).toBeNull();
    expect(p.unclaimedAtoms).toBe(0n);
    expect(decodeStakePoolV5(poolBytes()).pendingTargetByProtocol).toBe(false);
  });
  it("accepts longer buffers and subarray views", () => {
    const d = poolBytes();
    const big = new Uint8Array(STAKE_POOL_SIZE_V5 + 20);
    big.set(d, 10);
    const sub = decodeStakePoolV5(big.subarray(10));
    expect(sub.riskMode).toBe(1);
    expect(sub.deployTargetBps).toBe(5000);
    expect(sub.hysteresisBps).toBe(500);
    expect(decodeStakePoolV5(poolBytes()).riskMode).toBe(1);
  });
  it("rejects short, bad discriminator, bad version", () => {
    expect(() => decodeStakePoolV5(new Uint8Array(STAKE_POOL_SIZE_V5 - 1))).toThrow(/too short/);
    expect(() => decodeStakePoolV5(new Uint8Array(0))).toThrow(/too short/);
    for (const i of [0, 7]) {
      expect(() => decodeStakePoolV5(poolBytes((b) => { b[STAKE_POOL_FIELD_OFF_V5.reserved + i] ^= 0xff; }))).toThrow(/discriminator/);
    }
    for (const ver of [0, 4, 6]) {
      expect(() => decodeStakePoolV5(poolBytes((b) => { b[STAKE_POOL_FIELD_OFF_V5.version] = ver; }))).toThrow(/version/);
    }
  });
  it("enforces risk bounds at the boundary", () => {
    expect(decodeStakePoolV5(poolBytes((b) => { b[STAKE_POOL_FIELD_OFF_V5.riskMode] = STAKE_RISK_MODE.FeeOnly; })).riskMode).toBe(2);
    expect(() => decodeStakePoolV5(poolBytes((b) => { b[STAKE_POOL_FIELD_OFF_V5.riskMode] = 3; }))).toThrow(/bounds/);
    expect(() => decodeStakePoolV5(poolBytes((_, v) => v.setUint16(STAKE_POOL_FIELD_OFF_V5.deployTargetBps, 8001, true)))).toThrow(/bounds/);
    expect(decodeStakePoolV5(poolBytes((_, v) => v.setUint16(STAKE_POOL_FIELD_OFF_V5.deployTargetBps, 8000, true))).deployTargetBps).toBe(8000);
    expect(() => decodeStakePoolV5(poolBytes((_, v) => v.setUint16(STAKE_POOL_FIELD_OFF_V5.hysteresisBps, 2001, true)))).toThrow(/bounds/);
    expect(decodeStakePoolV5(poolBytes((_, v) => v.setUint16(STAKE_POOL_FIELD_OFF_V5.hysteresisBps, 2000, true))).hysteresisBps).toBe(2000);
  });
  it("reads the close-out seed only when bit 0 of byte 333 is set, and the u64 unclaimed", () => {
    const d = poolBytes((b) => {
      b[333] = 1;
      for (let i = 0; i < 7; i++) b[457 + i] = i + 1;
      for (let i = 0; i < 7; i++) b[281 + i] = 0xff;
      b[334] = 0xff;
    });
    const p = decodeStakePoolV5(d);
    expect(p.creatorSeedAtoms).toBe(0x07060504030201n);
    expect(p.unclaimedAtoms).toBe(U64);
    expect(decodeStakePoolV5(poolBytes((b) => { b[333] = 0xfe; b[457] = 9; })).creatorSeedAtoms).toBeNull();
  });
  it("saturates creatorTotalForwardedAtoms at u64 max", () => {
    const sat = decodeStakePoolV5(poolBytes((_, v) => {
      v.setBigUint64(STAKE_POOL_FIELD_OFF_V5.creatorForwardedAtoms, U64, true);
      v.setBigUint64(STAKE_POOL_FIELD_OFF_V5.v5Reserved + 8, 5n, true);
    }));
    expect(sat.creatorTotalForwardedAtoms).toBe(U64);
    const sum = decodeStakePoolV5(poolBytes((_, v) => {
      v.setBigUint64(STAKE_POOL_FIELD_OFF_V5.creatorForwardedAtoms, 3n, true);
      v.setBigUint64(STAKE_POOL_FIELD_OFF_V5.v5Reserved + 8, 5n, true);
      v.setBigUint64(STAKE_POOL_FIELD_OFF_V5.v5Reserved + 16, 7n, true);
    }));
    expect(sum.creatorTotalForwardedAtoms).toBe(8n);
    expect(sum.s2BacklogOwedAtoms).toBe(7n);
  });
});

describe("close-out math", () => {
  it("closeoutCreatorShare branches", () => {
    expect(closeoutCreatorShare(7_000_000n, 5_000_000n, 0n)).toBe(5_000_000n);
    expect(closeoutCreatorShare(100n, 5_000_000n, 0n)).toBe(100n);
    expect(closeoutCreatorShare(100n, 50n, 50n)).toBe(0n);
    expect(closeoutCreatorShare(100n, 50n, 80n)).toBe(0n);
    expect(closeoutCreatorShare(1000n, 500n, 0n, 200n)).toBe(200n);
    expect(closeoutCreatorShare(1000n, 100n, 0n, 200n)).toBe(100n);
    expect(closeoutCreatorShare(1000n, 100n, 0n, 0n)).toBe(0n);
  });
  it("closeoutSplit conserves surplus", () => {
    const a = closeoutSplit({ surplus: 7_600n, seed: 5_000n, forwarded: 0n, hasRealStakers: false });
    expect(a).toEqual({ creator: 5_000n, stakers: 0n, unclaimed: 2_600n });
    const b = closeoutSplit({ surplus: 7_600n, seed: 5_000n, forwarded: 0n, hasRealStakers: true });
    expect(b).toEqual({ creator: 5_000n, stakers: 2_600n, unclaimed: 0n });
    const c = closeoutSplit({ surplus: 10n, seed: 5n, forwarded: 0n, creatorClassReleased: 2n, hasRealStakers: true });
    expect(c.creator + c.stakers + c.unclaimed).toBe(10n);
    expect(c.creator).toBe(2n);
    expect(c.stakers).toBe(8n);
    expect(c.unclaimed).toBe(0n);
  });
});

describe("errors", () => {
  it("decodes 33..48 and returns undefined elsewhere", () => {
    for (let c = 33; c <= 48; c++) {
      expect(decodeStakeErrorV5(c)).toBe(STAKE_ERRORS_V5[c]);
      expect(decodeStakeErrorV5(c)?.name.length).toBeGreaterThan(0);
      expect(decodeStakeErrorV5(c)?.hint.length).toBeGreaterThan(0);
    }
    expect(Object.keys(STAKE_ERRORS_V5)).toHaveLength(16);
    expect(decodeStakeErrorV5(33)?.name).toBe("ConsentRequired");
    expect(decodeStakeErrorV5(32)).toBeUndefined();
    expect(decodeStakeErrorV5(49)).toBeUndefined();
    expect(decodeStakeErrorV5(-1)).toBeUndefined();
  });
});

describe("stakePoolValue", () => {
  const f = { totalDeposited: 1000n, totalWithdrawn: 100n, totalFlushed: 200n, totalReturned: 50n, totalFeesEarned: 20n, realizedJuniorLoss: 10n };
  it("computes liquid (no deployed when unitsTotal is 0)", () => {
    expect(stakePoolValue(f, { unitsStake: 0n, unitsTotal: 0n }, 999n)).toEqual({ liquid: 760n, deployed: 0n, total: 760n });
  });
  it("computes deployed and withdrawableNow both sides of the min", () => {
    const u = { unitsStake: 1n, unitsTotal: 2n };
    expect(stakePoolValue(f, u, 101n)).toEqual({ liquid: 760n, deployed: 50n, total: 810n });
    expect(stakePoolValue(f, u, 100n, 500n)!.withdrawableNow).toBe(500n);
    expect(stakePoolValue(f, u, 100n, 900n)!.withdrawableNow).toBe(760n);
    expect(stakePoolValue(f, u, 100n, 0n)!.withdrawableNow).toBe(0n);
  });
  it("fails closed", () => {
    expect(stakePoolValue({ ...f, realizedJuniorLoss: 5000n }, { unitsStake: 0n, unitsTotal: 0n }, 0n)).toBeNull();
    expect(stakePoolValue({ ...f, totalDeposited: U64 + 1000n }, { unitsStake: 0n, unitsTotal: 0n }, 0n)).toBeNull();
    expect(stakePoolValue(f, { unitsStake: 3n, unitsTotal: 2n }, 1n)).toBeNull();
    expect(stakePoolValue(f, { unitsStake: 1n << 100n, unitsTotal: 1n << 100n }, 1n << 100n)).toBeNull();
    // deployed = 2^63 fits u64, so this is a valid value
    expect(stakePoolValue(f, { unitsStake: 1n << 64n, unitsTotal: 1n << 64n }, 1n << 63n)!.deployed).toBe(1n << 63n);
    // deployed > u64: units equal, insurance above u64 max
    expect(stakePoolValue(f, { unitsStake: 1n, unitsTotal: 1n }, U64 + 1n)).toBeNull();
    expect(stakePoolValue({ ...f, totalDeposited: 0n, totalWithdrawn: 0n, totalFlushed: 0n, totalReturned: 0n, totalFeesEarned: 0n, realizedJuniorLoss: 0n }, { unitsStake: 2n, unitsTotal: 1n << 1n }, U64 + 5n)).toBeNull();
    // total overflow: liquid at u64 max plus any deployed
    expect(stakePoolValue({ ...f, totalDeposited: U64 + 240n }, { unitsStake: 1n, unitsTotal: 1n }, 1n)).toBeNull();
  });
});

describe("collateralForLpV5", () => {
  it("handles zero supply, normal, overflow", () => {
    expect(collateralForLpV5(1n, 0n, 100n)).toBeNull();
    expect(collateralForLpV5(10n, 99n, 99n)).toBe(10n);
    expect(collateralForLpV5(0n, 5n, 5n)).toBe(0n);
    expect(collateralForLpV5(U64, 1n, U64)).toBeNull();
    expect(collateralForLpV5(1n << 64n, 1n << 64n, U64 - 1n)).toBe(((1n << 64n) * U64) / ((1n << 64n) + 1n));
  });
});

describe("quoteStakeWithdrawNowV5", () => {
  const pool = { totalDeposited: 10_000n, totalWithdrawn: 0n, totalFlushed: 4_000n, totalReturned: 0n, totalFeesEarned: 0n, realizedJuniorLoss: 0n, totalLpSupply: 10_000n };
  const units = { unitsStake: 1n, unitsTotal: 1n };
  it("uncapped when deployed is zero", () => {
    const q = quoteStakeWithdrawNowV5(pool, { unitsStake: 0n, unitsTotal: 0n }, 0n, 6_000n, 1_000n)!;
    expect(q.capBinds).toBe(false);
    expect(q.maxLpNow).toBe(1_000n);
    expect(q.deferred).toBe(0n);
  });
  it("cap binds when deployed insurance inflates redeemable; maxLpNow clamps to balance", () => {
    const q = quoteStakeWithdrawNowV5(pool, units, 4_000n, 6_000n, 10_000n)!;
    expect(q.capBinds).toBe(true);
    expect(q.liquidCap).toBe(6_000n);
    expect(q.maxCollateralNow).toBe(6_000n);
    expect(q.deferred).toBe(q.redeemable - 6_000n);
    expect(q.maxLpNow).toBe(6_000n);
    expect(collateralForLpV5(q.maxLpNow, pool.totalLpSupply, 10_000n)! <= q.liquidCap).toBe(true);
    expect(collateralForLpV5(q.maxLpNow + 1n, pool.totalLpSupply, 10_000n)! > q.liquidCap).toBe(true);
    // userLp smaller than maxLp: fits entirely
    const small = quoteStakeWithdrawNowV5(pool, units, 4_000n, 6_000n, 100n)!;
    expect(small.capBinds).toBe(false);
    expect(small.maxLpNow).toBe(100n);
  });
  it("tiny supply with a binding cap: documents the current dust result (maxLpNow 0 while maxCollateralNow 10)", () => {
    // NOTE: the `maxLpNow > userLp` clamp (src line 715) is unreachable when redeemable > liquidCap.
    const p = { ...pool, totalLpSupply: 1n };
    const q = quoteStakeWithdrawNowV5(p, units, 100_000n, 10n, 1n)!;
    expect(q.capBinds).toBe(true);
    expect(q.maxLpNow).toBe(0n);
    expect(q.maxCollateralNow).toBe(10n);
  });
  it("zero liquid forces maxLpNow 0", () => {
    const q = quoteStakeWithdrawNowV5(pool, units, 4_000n, 0n, 5_000n)!;
    expect(q.maxCollateralNow).toBe(0n);
    expect(q.maxLpNow).toBe(0n);
  });
  it("liveInsurance clamps only downward", () => {
    const hi = quoteStakeWithdrawNowV5(pool, units, 4_000n, 6_000n, 10_000n)!;
    const lo = quoteStakeWithdrawNowV5(pool, units, 4_000n, 6_000n, 10_000n, 1_000n)!;
    const above = quoteStakeWithdrawNowV5(pool, units, 4_000n, 6_000n, 10_000n, 9_000n)!;
    expect(lo.redeemable < hi.redeemable).toBe(true);
    expect(above.redeemable).toBe(hi.redeemable);
  });
  it("returns null on fail-closed value and on zero LP supply", () => {
    expect(quoteStakeWithdrawNowV5(pool, { unitsStake: 2n, unitsTotal: 1n }, 1n, 1n, 1n)).toBeNull();
    expect(quoteStakeWithdrawNowV5({ ...pool, totalLpSupply: 0n }, units, 1n, 1n, 1n)).toBeNull();
  });
});

describe("creatorCollateralAtaV5", () => {
  it("is deterministic and depends on both keys", () => {
    const admin = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const a = creatorCollateralAtaV5({ admin, collateralMint: mint });
    expect(a.equals(creatorCollateralAtaV5({ admin, collateralMint: mint }))).toBe(true);
    expect(a.equals(creatorCollateralAtaV5({ admin: Keypair.generate().publicKey, collateralMint: mint }))).toBe(false);
  });
});
