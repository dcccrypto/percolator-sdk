// Generates the Band Safety Law parity rows: each row = an InitMarket config (the pre-check's input) and its
// exact instruction bytes (encodeInitMarketV22). The bytes are sent to the real wrapper .so in LiteSVM by the
// harness `tests/bsl6_initmarket_matrix.rs` (percolator-prog branch bsl6/initmarket-matrix, on rc23
// 178fedc4); `merge-results.ts` folds the answers into `parity.json`.
// Usage: tsx test/fixtures/v22-bsl/gen-rows.ts <out-rows.json>
import fs from "node:fs";
import { encodeInitMarketV22 } from "../../../src/abi/v22-wire.js";
import { bandGenesisFloorE6V22, bandWorstAdverseBpsV22, checkBandSafetyLawV22, maxAcceptedRentE9PerSlotV22, type BandSafetyLawInputV22 } from "../../../src/abi/v22-band-safety-law.js";

interface Row { id: string; slots: number; decimals: number; dataHex: string; input: Record<string, unknown> }
const rows: Row[] = [];
const ser = (i: BandSafetyLawInputV22): Record<string, unknown> =>
  JSON.parse(JSON.stringify(i, (_k, v) => (typeof v === "bigint" ? `${v}n` : v)));

const seen = new Set<string>();

function push(id: string, i: BandSafetyLawInputV22): void {
  if (seen.has(id)) return; // the sweeps meet at the pilot config: one row per id
  seen.add(id);
  const band = i.band && i.band.bandBps !== 0 ? i.band : undefined;
  // r_gap: derived on a band market (0); off-band the growth-1 rule's lowest honest value (pmove x 50).
  const rGapBps = band ? 0 : Math.max(1, Math.min(0xffff, Number(i.maxPriceMoveBpsPerSlot) * 50));
  let data: Uint8Array;
  try {
    data = encodeInitMarketV22(
      {
        maxPortfolioAssets: i.maxPortfolioAssets, hMin: 1_000n, hMax: 100_000n, initialPrice: i.initialPriceE6 ?? 50_000_000n,
        minNonzeroMmReq: i.minNonzeroMmReq, minNonzeroImReq: i.minNonzeroImReq,
        maintenanceMarginBps: i.maintenanceMarginBps, initialMarginBps: i.initialMarginBps,
        maxTradingFeeBps: 700n, tradeFeeBaseBps: 30n, liquidationFeeBps: i.liquidationFeeBps,
        liquidationFeeCap: i.liquidationFeeCap, minLiquidationAbs: i.minLiquidationAbs,
        maxPriceMoveBpsPerSlot: i.maxPriceMoveBpsPerSlot, maxAccrualDtSlots: i.maxAccrualDtSlots,
        maxAbsFundingE9PerSlot: i.maxAbsFundingE9PerSlot, minFundingLifetimeSlots: i.minFundingLifetimeSlots,
        maxAccountBSettlementChunks: 10n, maxBankruptCloseChunks: 10n, maxBankruptCloseLifetimeSlots: 500n,
        publicBChunkAtoms: 1_000_000_000_000n, maintenanceFeePerSlot: i.maintenanceFeePerSlot,
      },
      { rGapBps, lLaunchX100: 100, ...(i.rent ? { rent: i.rent } : {}), ...(band ? { band } : {}) },
    );
  } catch {
    return; // the SDK encoder refuses it (out of the wire's domain): not a program row
  }
  rows.push({ id, slots: i.maxPortfolioAssets, decimals: i.collateralDecimals ?? 6, dataHex: Buffer.from(data).toString("hex"), input: ser(i) });
}

const base = (mm: bigint, over: Partial<BandSafetyLawInputV22> = {}): BandSafetyLawInputV22 => ({
  maxPortfolioAssets: 1, maintenanceMarginBps: mm, initialMarginBps: mm * 2n > 10_000n ? 10_000n : mm * 2n,
  liquidationFeeBps: 50n, liquidationFeeCap: 10_000_000_000n, minLiquidationAbs: 0n,
  minNonzeroMmReq: 1_000_000n, minNonzeroImReq: 2_000_000n, maxPriceMoveBpsPerSlot: 1n, maxAccrualDtSlots: 500n,
  maxAbsFundingE9PerSlot: 111n, minFundingLifetimeSlots: 500n,
  maintenanceFeePerSlot: 0n, initialPriceE6: 50_000_000n, collateralDecimals: 6, ...over,
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
// 3b. The exact limits of the law at every shipped margin: the pre-check's own limit and limit + 1 go to the program.
for (const [name, c] of [
  ["seed-meme", base(1000n)], ["seed-mid", base(600n)],
  ...[500, 501, 550, 600, 750, 1000, 1500, 2000, 2500].map((mm) => [`app-mm${mm}`, base(BigInt(mm), { maxPriceMoveBpsPerSlot: pm(mm), maxAccrualDtSlots: 100n })] as const),
] as const) {
  const m = maxAcceptedRentE9PerSlotV22({ ...c, band: band(130) });
  if (m !== null) for (const r of [m, m + 1n]) push(`limit-${name}-rent${r}`, { ...c, rent: rent(Number(r)), band: band(130) });
  let top = 0;
  for (let d = 1; d <= 2000; d++) if (checkBandSafetyLawV22({ ...c, rent: rent(100), band: band(d) }).ok) top = d;
  for (const d of [top, top + 1]) push(`limit-${name}-band${d}`, { ...c, rent: rent(100), band: band(d) });
}
// 3c. The band refusals after the law: maintenance fee, genesis price, minimum leg (each also on an invalid base: they fire first).
const invalidBase = { liquidationFeeBps: 500n };
push("later-fee1-band", base(1000n, { maintenanceFeePerSlot: 1n, rent: rent(100), band: band(130) }));
push("later-fee1-noband", base(1000n, { maintenanceFeePerSlot: 1n, rent: rent(100) }));
push("later-fee1-norent", base(1000n, { maintenanceFeePerSlot: 1n }));
push("later-fee1-band-rent0", base(1000n, { maintenanceFeePerSlot: 1n, rent: rent(0, 0), band: band(130) }));
push("later-fee1-invalid-base", base(1000n, { ...invalidBase, maintenanceFeePerSlot: 1n, rent: rent(100), band: band(130) }));
for (const d of [1, 2, 3, 5, 6, 7, 8]) {
  const floor = bandGenesisFloorE6V22(BigInt(d))!;
  for (const p of [floor - 1n, floor]) push(`later-genesis-d${d}-p${p}`, base(1000n, { initialPriceE6: p, rent: rent(100), band: band(d) }));
}
push("later-genesis-low-invalid-base", base(1000n, { ...invalidBase, initialPriceE6: 1n, rent: rent(100), band: band(130) }));
for (const [tok, dec] of [[9_999_999n, 6], [10_000_000n, 6], [99_999_999n, 7], [100_000_000n, 7], [100_000_000n, 8], [999_999_999n, 8], [1_000_000_000n, 8]] as const) {
  push(`later-minleg-${tok}-dec${dec}`, base(1000n, { collateralDecimals: dec, rent: rent(100), band: { ...band(130)!, bandMinLegNotional: tok } }));
}
push("later-minleg-low-invalid-base", base(1000n, { ...invalidBase, rent: rent(100), band: { ...band(130)!, bandMinLegNotional: 1n } }));
push("later-norent-invalid-base", base(1000n, invalidBase));
push("later-price0", base(1000n, { initialPriceE6: 0n, rent: rent(100), band: band(130) }));
push("later-price-over-max", base(1000n, { initialPriceE6: 1_000_000_000_001n, rent: rent(100), band: band(130) }));
// 3d. G(d) rounding: with no funding, rent or liq fee and MMR = G(d), the ceiling of G decides the verdict.
for (const d of [130, 131, 200, 201, 300, 301]) {
  const g = bandWorstAdverseBpsV22(BigInt(d))!;
  for (const m of [g - 1n, g, g + 1n]) {
    push(`g-rounding-d${d}-mm${m}`, base(m, { liquidationFeeBps: 0n, maxAbsFundingE9PerSlot: 0n, maxPriceMoveBpsPerSlot: 1n, maxAccrualDtSlots: 1n, rent: rent(0, 0), band: band(d) }));
  }
}
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
