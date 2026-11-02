// Generates the Band Safety Law parity rows: each row = an InitMarket config (the pre-check's input) and its
// exact instruction bytes (encodeInitMarketV22). The bytes are sent to the real wrapper .so in LiteSVM by the
// harness `tests/bsl6_initmarket_matrix.rs` (percolator-prog branch bsl6/initmarket-matrix), once per program
// (rc23 34996503 and bbaa0e7b); `merge-results.ts` folds the answers into `parity.json`.
// Usage: tsx test/fixtures/v22-bsl/gen-rows.ts <out-rows.json>
import fs from "node:fs";
import { encodeInitMarketV22 } from "../../../src/abi/v22-wire.js";
import type { BandSafetyLawInputV22 } from "../../../src/abi/v22-band-safety-law.js";

interface Row { id: string; slots: number; decimals: number; dataHex: string; input: Record<string, unknown> }
const rows: Row[] = [];
const ser = (i: BandSafetyLawInputV22): Record<string, unknown> =>
  JSON.parse(JSON.stringify(i, (_k, v) => (typeof v === "bigint" ? `${v}n` : v)));

function push(id: string, i: BandSafetyLawInputV22): void {
  const band = i.band && i.band.bandBps !== 0 ? i.band : undefined;
  // r_gap: derived on a band market (0); off-band the growth-1 rule's lowest honest value (pmove x 50).
  const rGapBps = band ? 0 : Math.max(1, Math.min(0xffff, Number(i.maxPriceMoveBpsPerSlot) * 50));
  let data: Uint8Array;
  try {
    data = encodeInitMarketV22(
      {
        maxPortfolioAssets: i.maxPortfolioAssets, hMin: 1_000n, hMax: 100_000n, initialPrice: 50_000_000n,
        minNonzeroMmReq: i.minNonzeroMmReq, minNonzeroImReq: i.minNonzeroImReq,
        maintenanceMarginBps: i.maintenanceMarginBps, initialMarginBps: i.initialMarginBps,
        maxTradingFeeBps: 700n, tradeFeeBaseBps: 30n, liquidationFeeBps: i.liquidationFeeBps,
        liquidationFeeCap: i.liquidationFeeCap, minLiquidationAbs: i.minLiquidationAbs,
        maxPriceMoveBpsPerSlot: i.maxPriceMoveBpsPerSlot, maxAccrualDtSlots: i.maxAccrualDtSlots,
        maxAbsFundingE9PerSlot: i.maxAbsFundingE9PerSlot, minFundingLifetimeSlots: i.minFundingLifetimeSlots,
        maxAccountBSettlementChunks: 10n, maxBankruptCloseChunks: 10n, maxBankruptCloseLifetimeSlots: 500n,
        publicBChunkAtoms: 1_000_000_000_000n, maintenanceFeePerSlot: 0n,
      },
      { rGapBps, lLaunchX100: 100, ...(i.rent ? { rent: i.rent } : {}), ...(band ? { band } : {}) },
    );
  } catch {
    return; // the SDK encoder refuses it (out of the wire's domain): not a program row
  }
  rows.push({ id, slots: i.maxPortfolioAssets, decimals: 6, dataHex: Buffer.from(data).toString("hex"), input: ser(i) });
}

const base = (mm: bigint, over: Partial<BandSafetyLawInputV22> = {}): BandSafetyLawInputV22 => ({
  maxPortfolioAssets: 1, maintenanceMarginBps: mm, initialMarginBps: mm * 2n > 10_000n ? 10_000n : mm * 2n,
  liquidationFeeBps: 50n, liquidationFeeCap: 10_000_000_000n, minLiquidationAbs: 0n,
  minNonzeroMmReq: 1_000_000n, minNonzeroImReq: 2_000_000n, maxPriceMoveBpsPerSlot: 1n, maxAccrualDtSlots: 500n,
  maxAbsFundingE9PerSlot: 111n, minFundingLifetimeSlots: 500n, ...over,
});
const band = (d: number, e = 600, pmax = 9_000): BandSafetyLawInputV22["band"] => ({ bandBps: d, bandMaxEpochSlots: e, bandMaxPinSlots: pmax, bandMinLegNotional: 100_000_000n });
const rent = (r: number, k = 5_000): BandSafetyLawInputV22["rent"] => ({ rentMaxE9PerSlot: r, rentKinkBps: k });

// 1. The seed kit's tiers (markets.v22.json @ feat/v22-seed b4ec6525): meme 2000/1000, mid+major 1000/600.
for (const [t, mm] of [["meme", 1000n], ["mid", 600n]] as const) {
  push(`seed-${t}-plain`, base(mm));
  push(`seed-${t}-band-pilot`, base(mm, { rent: rent(100), band: band(130) }));
  for (const r of [0, 9, 10, 23, 100, 500, 749, 750, 1000, 1499, 1500, 1999, 2000, 2001, 5000, 10_000, 10_001]) push(`seed-${t}-band130-rent${r}`, base(mm, { rent: rent(r), band: band(130) }));
  for (const r of [10, 100, 2000, 2001, 10_000]) push(`seed-${t}-noband-rent${r}`, base(mm, { rent: rent(r) }));
  for (const d of [1, 50, 100, 129, 130, 150, 200, 250, 260, 270, 280, 290, 300, 350, 400, 2000, 2001]) push(`seed-${t}-band${d}-rent100`, base(mm, { rent: rent(100), band: band(d) }));
  for (const k of [0, 8_000, 8_001, 10_000, 10_001]) push(`seed-${t}-band130-kink${k}`, base(mm, { rent: rent(100, k), band: band(130) }));
  for (const [e, p] of [[149, 9_000], [150, 1_200], [150, 1_199], [600, 4_800], [600, 4_799], [5_000, 40_000], [20_000, 160_000]] as const) push(`seed-${t}-E${e}-P${p}`, base(mm, { rent: rent(100), band: band(130, e, p) }));
  push(`seed-${t}-band-multiasset`, base(mm, { maxPortfolioAssets: 2, rent: rent(100), band: band(130) }));
}
// 2. The app wizard: MMR 500..2500, price move from MAX_PRICE_MOVE_BY_MARGIN, dt 100, funding 111, rent 0/23, band 130.
const pm = (mm: number): bigint => BigInt(mm >= 2000 ? 15 : mm >= 1500 ? 12 : mm >= 1250 ? 10 : mm >= 1000 ? 8 : mm >= 750 ? 6 : mm >= 600 ? 5 : 4);
for (const mm of [500, 501, 550, 600, 749, 750, 1000, 1250, 1500, 2000, 2500]) {
  const a = (over: Partial<BandSafetyLawInputV22>): BandSafetyLawInputV22 => base(BigInt(mm), { maxPriceMoveBpsPerSlot: pm(mm), maxAccrualDtSlots: 100n, ...over });
  push(`app-mm${mm}-fee`, a({ rent: rent(23) }));
  push(`app-mm${mm}-prot`, a({ rent: rent(0, 0), band: band(130) }));
  push(`app-mm${mm}-prot-fee`, a({ rent: rent(23), band: band(130) }));
  for (const r of [100, 500, 1000, 1500, 2000]) push(`app-mm${mm}-prot-rent${r}`, a({ rent: rent(r), band: band(130) }));
}
// 3. Boundaries of the envelope itself (funding, liq fee, min liq abs, mm floor, accrual window).
for (const f of [0n, 1_000n, 5_000n, 10_000n, 10_001n]) push(`edge-funding${f}`, base(1000n, { maxAbsFundingE9PerSlot: f, rent: rent(100), band: band(130) }));
for (const l of [0n, 500n, 1_000n, 5_000n]) push(`edge-liq${l}`, base(1000n, { liquidationFeeBps: l, rent: rent(100), band: band(130) }));
for (const a of [1n, 1_000_000n, 10_000_000_000n]) push(`edge-minliq${a}`, base(1000n, { minLiquidationAbs: a, rent: rent(100), band: band(130) }));
for (const m of [1n, 10n, 1_000_000_000_000n]) push(`edge-minmm${m}`, base(1000n, { minNonzeroMmReq: m, minNonzeroImReq: m * 2n, rent: rent(100), band: band(130) }));
for (const [p, dt] of [[1n, 1n], [10n, 500n], [20n, 500n], [2n, 400n]] as const) push(`edge-pm${p}-dt${dt}`, base(1000n, { maxPriceMoveBpsPerSlot: p, maxAccrualDtSlots: dt, rent: rent(100), band: band(130) }));
for (const mm of [400n, 450n, 470n, 480n, 490n]) push(`edge-mm${mm}-band130`, base(mm, { rent: rent(10), band: band(130) }));
// 4. Seeded random configs around the boundaries (xorshift; deterministic).
let s = 0x2f05df8cn;
const rnd = (n: number): number => { s ^= (s << 13n) & 0xffff_ffffn; s ^= s >> 17n; s ^= (s << 5n) & 0xffff_ffffn; return Number(s % BigInt(n)); };
for (let i = 0; i < 1500; i++) {
  const mm = BigInt(300 + rnd(2700));
  const d = [0, 1 + rnd(400), 50 + rnd(250), 130][rnd(4)]!;
  const r = [0, 10 + rnd(100), 10 + rnd(2_500), 10 + rnd(10_100)][rnd(4)]!;
  const e = [150, 600, 150 + rnd(3000)][rnd(3)]!;
  push(`rand-${i}`, base(mm, {
    liquidationFeeBps: BigInt([0, 50, rnd(300)][rnd(3)]!), maxPriceMoveBpsPerSlot: BigInt(1 + rnd(8)),
    maxAccrualDtSlots: BigInt([100, 500, 1 + rnd(600)][rnd(3)]!), minFundingLifetimeSlots: 600n,
    maxAbsFundingE9PerSlot: BigInt([0, 111, rnd(3000)][rnd(3)]!),
    rent: rent(r, rnd(10) === 0 ? 9_000 : 5_000),
    ...(d ? { band: band(d, e, e * 8 + rnd(100)) } : {}),
  }));
}
fs.writeFileSync(process.argv[2]!, JSON.stringify(rows));
console.log(`${rows.length} rows`);
