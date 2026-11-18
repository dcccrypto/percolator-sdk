/**
 * Branch coverage for src/abi/v22-stake.ts (guards, optional tail fields, u64 saturation).
 *
 * Offsets are pinned against the StakePool v5 struct in percolator-stake `feat/v22-growth-stake`
 * src/state.rs:294..297 (`offset_of!(StakePool, risk_mode) == 408`, `deploy_target_bps == 410`,
 * `last_sync_slot == 416`, `creator_forwarded_atoms == 448`) and the earlier asserts at state.rs:211..225
 * (`is_initialized 0`, `slab 8`, `vault 136`, `percolator_program 224`, `pool_mode 280`, `_reserved 320`, version at 328).
 */
import { describe, it, expect } from "vitest";
import { Keypair, PublicKey, SystemProgram, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  STAKE_POOL_FIELD_OFF_V5,
  STAKE_POOL_SIZE_V5,
  STAKE_ERRORS_V5,
  ACCOUNTS_STAKE_COMMIT_DEPLOY_TARGET_V5,
  ACCOUNTS_STAKE_DEPOSIT_V5,
  decodeStakePoolV5,
  decodeStakeErrorV5,
  consentParamsForPoolV5,
  closeoutCreatorShare,
  closeoutSplit,
  commitSlotForPendingTargetV5,
  collateralForLpV5,
  stakePoolValue,
  quoteStakeWithdrawNowV5,
  stakeMetasV5,
  creatorCollateralAtaV5,
  encodeStakeInitPoolV5,
  encodeStakeDepositWithConsentV5,
  encodeStakeProposeDeployTargetV5,
  type StakePoolV5,
} from "../src/abi/v22-stake.js";

const F = STAKE_POOL_FIELD_OFF_V5;
const U64_MAX = (1n << 64n) - 1n;

function mk(): Uint8Array {
  const d = new Uint8Array(STAKE_POOL_SIZE_V5);
  d.set([0x53, 0x50, 0x4f, 0x4f, 0x4c, 0x5f, 0x56, 0x31], F.reserved); // "SPOOL_V1"
  d[F.version] = 5;
  return d;
}
const dv = (d: Uint8Array) => new DataView(d.buffer, d.byteOffset, d.byteLength);

describe("v22-stake offsets", () => {
  it("pins the v5 offsets to state.rs", () => {
    expect(F.riskMode).toBe(408);
    expect(F.deployTargetBps).toBe(410);
    expect(F.lastSyncSlot).toBe(416);
    expect(F.creatorForwardedAtoms).toBe(448);
    expect(F.reserved).toBe(320);
    expect(F.version).toBe(328);
    expect(STAKE_POOL_SIZE_V5).toBe(480);
  });
});

describe("decodeStakePoolV5 guards", () => {
  it("rejects short buffers", () => {
    expect(() => decodeStakePoolV5(new Uint8Array(479))).toThrow(/too short/);
  });
  it("rejects a bad discriminator at every byte", () => {
    for (let i = 0; i < 8; i++) {
      const d = mk();
      d[F.reserved + i] ^= 0xff;
      expect(() => decodeStakePoolV5(d)).toThrow(/discriminator/);
    }
  });
  it("rejects wrong versions", () => {
    const d = mk();
    d[F.version] = 4;
    expect(() => decodeStakePoolV5(d)).toThrow(/unsupported pool version 4/);
  });
  it("rejects out-of-bounds risk settings", () => {
    let d = mk();
    d[F.riskMode] = 3;
    expect(() => decodeStakePoolV5(d)).toThrow(/bounds/);
    d = mk();
    dv(d).setUint16(F.deployTargetBps, 8_001, true);
    expect(() => decodeStakePoolV5(d)).toThrow(/bounds/);
    d = mk();
    dv(d).setUint16(F.hysteresisBps, 2_001, true);
    expect(() => decodeStakePoolV5(d)).toThrow(/bounds/);
  });
  it("accepts the exact upper bounds and a subarray view", () => {
    const d = mk();
    d[F.riskMode] = 2;
    dv(d).setUint16(F.deployTargetBps, 8_000, true);
    dv(d).setUint16(F.hysteresisBps, 2_000, true);
    const wrapped = new Uint8Array(500);
    wrapped.set(d, 10);
    const p = decodeStakePoolV5(wrapped.subarray(10));
    expect(p.riskMode).toBe(2);
    expect(p.deployTargetBps).toBe(8_000);
    expect(p.hysteresisBps).toBe(2_000);
  });
});

describe("decodeStakePoolV5 optional tail", () => {
  it("creatorSeedAtoms is null when byte 333 bit 0 is clear, a u56 when set", () => {
    const d = mk();
    for (let i = 0; i < 7; i++) d[457 + i] = i + 1;
    expect(decodeStakePoolV5(d).creatorSeedAtoms).toBeNull();
    d[333] = 1;
    expect(decodeStakePoolV5(d).creatorSeedAtoms).toBe(0x07060504030201n);
    d[333] = 0xfe;
    expect(decodeStakePoolV5(d).creatorSeedAtoms).toBeNull();
  });
  it("unclaimed is the full u64 (low 7 bytes at 281, high byte at 334)", () => {
    const d = mk();
    for (let i = 0; i < 7; i++) d[281 + i] = i + 1;
    d[334] = 8;
    expect(decodeStakePoolV5(d).unclaimedAtoms).toBe(0x0807060504030201n);
    for (let i = 0; i < 7; i++) d[281 + i] = 0xff;
    d[334] = 0xff;
    expect(decodeStakePoolV5(d).unclaimedAtoms).toBe(U64_MAX);
  });
  it("pendingTargetByProtocol only for the byte value 1", () => {
    const d = mk();
    expect(decodeStakePoolV5(d).pendingTargetByProtocol).toBe(false);
    d[F.v5Reserved] = 1;
    expect(decodeStakePoolV5(d).pendingTargetByProtocol).toBe(true);
    d[F.v5Reserved] = 2;
    expect(decodeStakePoolV5(d).pendingTargetByProtocol).toBe(false);
  });
  it("creatorTotalForwardedAtoms adds and saturates at u64::MAX", () => {
    const d = mk();
    dv(d).setBigUint64(F.creatorForwardedAtoms, 5n, true);
    dv(d).setBigUint64(F.v5Reserved + 8, 7n, true);
    expect(decodeStakePoolV5(d).creatorTotalForwardedAtoms).toBe(12n);
    dv(d).setBigUint64(F.creatorForwardedAtoms, U64_MAX, true);
    expect(decodeStakePoolV5(d).creatorTotalForwardedAtoms).toBe(U64_MAX);
  });
  it("reads the identity keys and counters", () => {
    const d = mk();
    const k = Keypair.generate().publicKey;
    d.set(k.toBytes(), F.slab);
    dv(d).setBigUint64(F.lastSyncSlot, 99n, true);
    dv(d).setBigUint64(F.v5Reserved + 16, 3n, true);
    const p = decodeStakePoolV5(d);
    expect(p.slab.equals(k)).toBe(true);
    expect(p.lastSyncSlot).toBe(99n);
    expect(p.s2BacklogOwedAtoms).toBe(3n);
  });
});

describe("consentParamsForPoolV5 / commit slot", () => {
  const base = { deployTargetBps: 3000, liquidBufferBps: 1000, hysteresisBps: 100 };
  it("ignores pendingTargetBps when no slot is pending", () => {
    const r = consentParamsForPoolV5({ ...base, pendingTargetSlot: 0n, pendingTargetBps: 7000n } as never);
    expect(r).toEqual({ targetBps: 3000, bufferBps: 1000, hysteresisBps: 100 });
  });
  it("takes the larger of committed and pending", () => {
    expect(consentParamsForPoolV5({ ...base, pendingTargetSlot: 1n, pendingTargetBps: 7000n } as never).targetBps).toBe(7000);
    expect(consentParamsForPoolV5({ ...base, pendingTargetSlot: 1n, pendingTargetBps: 1000n } as never).targetBps).toBe(3000);
  });
  it("commitSlot: null, min timelock, or cooldown when larger", () => {
    expect(commitSlotForPendingTargetV5({ pendingTargetSlot: 0n, cooldownSlots: 1n })).toBeNull();
    expect(commitSlotForPendingTargetV5({ pendingTargetSlot: 10n, cooldownSlots: 5n })).toBe(216_010n);
    expect(commitSlotForPendingTargetV5({ pendingTargetSlot: 10n, cooldownSlots: 216_000n })).toBe(216_010n);
    expect(commitSlotForPendingTargetV5({ pendingTargetSlot: 10n, cooldownSlots: 300_000n })).toBe(300_010n);
  });
});

describe("encoders", () => {
  const ok = { targetBps: 5000, bufferBps: 3000, hysteresisBps: 500 };
  it("InitPool FEE_ONLY needs target 0; FIRST_LOSS ok", () => {
    expect(() => encodeStakeInitPoolV5(1n, 0n, 2, ok)).toThrow(/FEE_ONLY/);
    expect(encodeStakeInitPoolV5(1n, 0n, 2, { ...ok, targetBps: 0 }).length).toBe(24);
    expect(encodeStakeInitPoolV5(1n, 0n, 1, ok).length).toBe(24);
  });
  it("validates every bps bound", () => {
    expect(() => encodeStakeInitPoolV5(1n, 0n, 1, { ...ok, targetBps: 8001 })).toThrow(/targetBps/);
    expect(() => encodeStakeInitPoolV5(1n, 0n, 1, { ...ok, bufferBps: 10_001 })).toThrow(/bufferBps/);
    expect(() => encodeStakeInitPoolV5(1n, 0n, 1, { ...ok, hysteresisBps: 2001 })).toThrow(/hysteresisBps/);
    expect(() => encodeStakeInitPoolV5(1n, 0n, 1, { ...ok, targetBps: 1.5 })).toThrow(/integer/);
    expect(() => encodeStakeInitPoolV5(1n, 0n, 1, { ...ok, targetBps: -1 })).toThrow(/targetBps/);
  });
  it("deposit consent version bounds and default", () => {
    expect(encodeStakeDepositWithConsentV5(1n, ok)[9]).toBe(2);
    expect(encodeStakeDepositWithConsentV5(1n, ok, 255)[9]).toBe(255);
    expect(() => encodeStakeDepositWithConsentV5(1n, ok, 0)).toThrow(/version/);
    expect(() => encodeStakeDepositWithConsentV5(1n, ok, 256)).toThrow(/version/);
    expect(() => encodeStakeDepositWithConsentV5(1n, { ...ok, targetBps: 9000 })).toThrow(/targetBps/);
  });
  it("propose bounds", () => {
    expect(encodeStakeProposeDeployTargetV5(8000).length).toBe(3);
    expect(() => encodeStakeProposeDeployTargetV5(8001)).toThrow(/targetBps/);
  });
});

describe("stakeMetasV5", () => {
  it("uses defaults, overrides and throws on a missing key", () => {
    const anyone = Keypair.generate().publicKey;
    const pool = Keypair.generate().publicKey;
    const m = stakeMetasV5(ACCOUNTS_STAKE_COMMIT_DEPLOY_TARGET_V5, { anyone, pool });
    expect(m[2]!.pubkey.equals(SYSVAR_CLOCK_PUBKEY)).toBe(true);
    const other = Keypair.generate().publicKey;
    expect(stakeMetasV5(ACCOUNTS_STAKE_COMMIT_DEPLOY_TARGET_V5, { anyone, pool, clock: other })[2]!.pubkey.equals(other)).toBe(true);
    expect(() => stakeMetasV5(ACCOUNTS_STAKE_COMMIT_DEPLOY_TARGET_V5, { pool })).toThrow(/missing key for account "anyone"/);
    const keys: Record<string, PublicKey> = {};
    for (const s of ACCOUNTS_STAKE_DEPOSIT_V5) keys[s.name] = pool;
    delete keys.tokenProgram;
    delete keys.systemProgram;
    const dm = stakeMetasV5(ACCOUNTS_STAKE_DEPOSIT_V5, keys);
    expect(dm[8]!.pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(dm[10]!.pubkey.equals(SystemProgram.programId)).toBe(true);
  });
});

describe("closeout", () => {
  it("creatorShare covers every min branch", () => {
    expect(closeoutCreatorShare(100n, 50n, 0n)).toBe(50n);
    expect(closeoutCreatorShare(100n, 50n, 0n, 80n)).toBe(50n);
    expect(closeoutCreatorShare(100n, 50n, 0n, 20n)).toBe(20n);
    expect(closeoutCreatorShare(10n, 50n, 0n)).toBe(10n);
    expect(closeoutCreatorShare(100n, 50n, 50n)).toBe(0n);
    expect(closeoutCreatorShare(100n, 50n, 70n)).toBe(0n);
  });
  it("split routes the rest by hasRealStakers", () => {
    expect(closeoutSplit({ surplus: 100n, seed: 50n, forwarded: 0n, hasRealStakers: true })).toEqual({ creator: 50n, stakers: 50n, unclaimed: 0n });
    expect(closeoutSplit({ surplus: 100n, seed: 50n, forwarded: 0n, hasRealStakers: false })).toEqual({ creator: 50n, stakers: 0n, unclaimed: 50n });
  });
});

describe("errors", () => {
  it("decodeStakeErrorV5 owns 33..48 only", () => {
    expect(decodeStakeErrorV5(33)?.name).toBe("ConsentRequired");
    expect(decodeStakeErrorV5(32)).toBeUndefined();
    expect(decodeStakeErrorV5(48)?.name).toBe("MultiAssetMarketNotSupported");
    expect(decodeStakeErrorV5(49)).toBeUndefined();
    expect(Object.keys(STAKE_ERRORS_V5).length).toBe(16);
  });
});

describe("pool value and quote", () => {
  const pool = { totalDeposited: 1000n, totalWithdrawn: 0n, totalFlushed: 200n, totalReturned: 0n, totalFeesEarned: 0n, realizedJuniorLoss: 0n, totalLpSupply: 1000n };
  const units = { unitsStake: 1n, unitsTotal: 2n };
  it("stakePoolValue fail-closed branches", () => {
    expect(stakePoolValue({ ...pool, totalWithdrawn: 5000n }, units, 0n)).toBeNull();
    expect(stakePoolValue({ ...pool, totalDeposited: U64_MAX + 500n }, units, 0n)).toBeNull();
    expect(stakePoolValue(pool, { unitsStake: 3n, unitsTotal: 2n }, 10n)).toBeNull();
    expect(stakePoolValue(pool, { unitsStake: 1n << 100n, unitsTotal: 1n << 100n }, 1n << 100n)).toBeNull();
    expect(stakePoolValue(pool, { unitsStake: 1n, unitsTotal: 1n }, U64_MAX + 1n)).toBeNull();
    expect(stakePoolValue({ ...pool, totalDeposited: U64_MAX }, { unitsStake: 1n, unitsTotal: 1n }, 1_000n)).toBeNull();
    expect(stakePoolValue(pool, { unitsStake: 0n, unitsTotal: 0n }, 99n)).toEqual({ liquid: 800n, deployed: 0n, total: 800n });
  });
  it("stakePoolValue withdrawableNow min both ways", () => {
    expect(stakePoolValue(pool, units, 100n, 10n)?.withdrawableNow).toBe(10n);
    expect(stakePoolValue(pool, units, 100n, 10_000n)?.withdrawableNow).toBe(800n);
    expect(stakePoolValue(pool, units, 100n)).toEqual({ liquid: 800n, deployed: 50n, total: 850n });
  });
  it("collateralForLpV5 null cases", () => {
    expect(collateralForLpV5(1n, 0n, 1n)).toBeNull();
    expect(collateralForLpV5(U64_MAX, 1n, U64_MAX)).toBeNull();
    expect(collateralForLpV5(10n, 9n, 99n)).toBe(100n);
  });
  it("quote: null paths", () => {
    expect(quoteStakeWithdrawNowV5({ ...pool, totalWithdrawn: 5000n }, units, 0n, 100n, 10n)).toBeNull();
    expect(quoteStakeWithdrawNowV5({ ...pool, totalLpSupply: 0n }, units, 0n, 100n, 10n)).toBeNull();
  });
  it("quote: uncapped, capped, live clamp, zero liquid", () => {
    const free = quoteStakeWithdrawNowV5(pool, { unitsStake: 0n, unitsTotal: 0n }, 0n, 10_000n, 500n)!;
    expect(free.capBinds).toBe(false);
    expect(free.maxLpNow).toBe(500n);
    expect(free.deferred).toBe(0n);
    const capped = quoteStakeWithdrawNowV5(pool, units, 100n, 100n, 1000n)!;
    expect(capped.capBinds).toBe(true);
    expect(capped.liquidCap).toBe(100n);
    expect(capped.maxLpNow < 1000n).toBe(true);
    // live insurance lower than the exit reading shrinks the redeemable value
    const live = quoteStakeWithdrawNowV5(pool, units, 100n, 10_000n, 1000n, 0n)!;
    const stale = quoteStakeWithdrawNowV5(pool, units, 100n, 10_000n, 1000n, 500n)!;
    expect(live.redeemable < stale.redeemable).toBe(true);
    // live higher than exit does not raise it
    expect(quoteStakeWithdrawNowV5(pool, units, 100n, 10_000n, 1000n, 900n)!.redeemable).toBe(stale.redeemable);
    // nothing liquid -> maxLpNow forced to 0
    const none = quoteStakeWithdrawNowV5(pool, units, 100n, 0n, 1000n)!;
    expect(none.maxCollateralNow).toBe(0n);
    expect(none.maxLpNow).toBe(0n);
  });
  it("quote: cap one atom below redeemable gives an exact maxLpNow", () => {
    // (cap+1)(S+1)-1)/(pv+1) = (1000*1001-1)/1001 = 999 (the `> userLp` clamp at v22-stake.ts:715 is unreachable defensive code)
    const p = { ...pool, totalDeposited: 1000n, totalFlushed: 0n, totalLpSupply: 1000n };
    const q = quoteStakeWithdrawNowV5(p, { unitsStake: 0n, unitsTotal: 0n }, 0n, 999n, 1000n)!;
    expect(q.maxLpNow).toBe(999n);
    expect(q.capBinds).toBe(true);
  });
});

describe("creatorCollateralAtaV5", () => {
  it("derives a deterministic ATA", () => {
    const admin = Keypair.generate().publicKey;
    const collateralMint = Keypair.generate().publicKey;
    const a = creatorCollateralAtaV5({ admin, collateralMint } as Pick<StakePoolV5, "admin" | "collateralMint">);
    expect(a.equals(getAssociatedTokenAddressSync(collateralMint, admin, true, TOKEN_PROGRAM_ID))).toBe(true);
  });
});

import {
  encodeStakeSyncInsuranceDeploymentV5,
  encodeStakeCommitDeployTargetV5,
} from "../src/abi/v22-stake.js";

describe("v22-stake zero-arg encoders", () => {
  it("encodes tags 31 and 33", () => {
    expect(Array.from(encodeStakeSyncInsuranceDeploymentV5())).toEqual([31]);
    expect(Array.from(encodeStakeCommitDeployTargetV5())).toEqual([33]);
  });
});
