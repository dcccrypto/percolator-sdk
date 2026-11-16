/** Seeded generators of VALID matcher-v2 inputs (shared by the differential test and the bench). */
import { Keypair } from "@solana/web3.js";
import type { MatcherSetParams, MatcherV2Config, MatcherCallExt, MatcherBatchLeg, MatcherOwnerProof } from "../../src/abi/matcher-v2.js";

export function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  const u32 = (): number => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
  const int = (lo: number, hi: number): number => lo + (u32() % (hi - lo + 1));
  const big = (bits: number): bigint => {
    let r = 0n;
    for (let i = 0; i < Math.ceil(bits / 32); i++) r = (r << 32n) | BigInt(u32());
    return r & ((1n << BigInt(bits)) - 1n);
  };
  const bool = (): boolean => (u32() & 1) === 1;
  const bytes = (n: number): Uint8Array => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = u32() & 0xff; return b; };
  return { u32, int, big, bool, bytes };
}
export type Rng = ReturnType<typeof makeRng>;

const ZERO: MatcherV2Config = {
  flags: 0, feeLoBps: 0, feeHiBps: 0, feeColdBps: 0, volAMilli: 0, volBDen: 0, volAlphaBps: 0, volWarmup: 0,
  volMoveCap10bps: 0, volRefSlots: 0, thinRebateMultBps: 0, skewCapBps: 0, rebateCapBps: 0, maxMarkAgeSlots: 0,
  observedStaleSlots: 0, skewRefInventory: 0n,
};

export function genSetParams(r: Rng): MatcherSetParams {
  const kind = r.int(0, 2) as 0 | 1 | 2;
  const tradingFeeBps = r.int(0, 1000);
  const maxTotalBps = r.int(tradingFeeBps, 9000);
  const baseSpreadBps = r.int(0, maxTotalBps - tradingFeeBps);
  const liquidity = kind === 1 ? r.big(128) | 1n : r.big(128);
  const common = {
    kind, tradingFeeBps, baseSpreadBps, maxTotalBps, impactKBps: 0,
    liquidityNotionalE6: liquidity, maxFillAbs: r.big(128), maxInventoryAbs: r.big(128),
    feeToInsuranceBps: r.int(0, 10000), skewSpreadMultBps: r.int(0, 10000),
  };
  if (kind === 2) {
    const room = maxTotalBps - baseSpreadBps;
    const feeHi = r.int(0, Math.min(room, 1000));
    const feeCold = r.int(0, feeHi);
    const feeLo = r.int(0, feeCold);
    const skewCap = r.int(0, 5000);
    const skewMult = common.skewSpreadMultBps;
    const thin = r.int(0, skewMult);
    const skewRef = (skewMult > 0 || thin > 0) ? (r.big(64) | 1n) : r.big(64);
    const v2: MatcherV2Config = {
      flags: r.int(0, 1), feeLoBps: feeLo, feeHiBps: feeHi, feeColdBps: feeCold, volAMilli: r.int(0, 65535),
      volBDen: r.int(0, 65535), volAlphaBps: r.int(1, 10000), volWarmup: r.int(0, 255), volMoveCap10bps: r.int(1, 255),
      volRefSlots: r.int(1, 65535), thinRebateMultBps: thin, skewCapBps: skewCap, rebateCapBps: r.int(0, skewCap),
      maxMarkAgeSlots: r.int(0, 65535), observedStaleSlots: r.int(0, 65535), skewRefInventory: skewRef,
    };
    const impactKBps = liquidity > 0n ? r.int(0, 100000) : 0;
    return { ...common, impactKBps, enableV2: true, v2 };
  }
  const enableV2 = r.bool();
  const v2: MatcherV2Config = { ...ZERO, flags: enableV2 ? r.int(0, 1) : r.int(0, 255) & 0xff, maxMarkAgeSlots: r.int(0, 65535), observedStaleSlots: r.int(0, 65535) };
  if (!enableV2) v2.flags = r.int(0, 255);
  return { ...common, impactKBps: r.int(0, 0xffffffff), enableV2, v2 };
}

export function genOwnerProof(r: Rng): MatcherOwnerProof {
  const pk = () => Keypair.fromSeed(r.bytes(32)).publicKey;
  return { wrapperProgramId: pk(), market: pk(), lpPortfolio: pk(), bump: r.int(0, 255) };
}

export function genCallExt(r: Rng): MatcherCallExt {
  return {
    headroomQ: r.bool() ? r.big(64) : undefined, markSlot: r.bool() ? r.big(64) : undefined,
    acceptsFeeRequest: r.bool(), takerReducing: r.bool(), execBandBps: r.bool() ? r.int(0, 65535) : undefined,
  };
}

export function genLegs(r: Rng): { legs: MatcherBatchLeg[]; exts?: Uint8Array[] } {
  const n = r.int(1, 16);
  const legs: MatcherBatchLeg[] = [];
  for (let i = 0; i < n; i++) {
    const mag = r.big(127);
    legs.push({ assetIndex: r.int(0, 65535), oraclePriceE6: r.big(64), reqSize: r.bool() ? -mag : mag });
  }
  const exts = r.bool() ? legs.map(() => r.bytes(24)) : undefined;
  return { legs, exts };
}
