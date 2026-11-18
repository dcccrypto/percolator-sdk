/**
 * buildAccountMetas benchmark: 10 most-used ACCOUNTS_* specs, array and named-map forms.
 *
 *   pnpm exec tsx scripts/bench-account-metas.ts [iters=1000000]
 *
 * Prints ns/call (median of 5) for the shipped buildAccountMetas, and a
 * "trade ix build" share: buildAccountMetas(ACCOUNTS_TRADE_CPI) inside a full
 * TransactionInstruction build (encodeTradeCpi + metas + new TransactionInstruction).
 */
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import * as A from "../src/abi/accounts.js";
import { encodeTradeCpi } from "../src/abi/instructions.js";

const iters = Number(process.argv[2] ?? 1_000_000);
const names = [
  "ACCOUNTS_TRADE_CPI", "ACCOUNTS_TRADE_NOCPI", "ACCOUNTS_PERMISSIONLESS_CRANK_BASE",
  "ACCOUNTS_KEEPER_CRANK", "ACCOUNTS_SET_RISK_THRESHOLD", "ACCOUNTS_UPDATE_ADMIN",
  "ACCOUNTS_LP_VAULT_DEPOSIT", "ACCOUNTS_NFT_HOLDER_AUTH", "ACCOUNTS_ACCEPT_ADMIN", "ACCOUNTS_CLOSE_RESOLVED",
].filter((n) => (A as Record<string, unknown>)[n]);

const pk = () => Keypair.generate().publicKey;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
function time(fn: () => void, n: number): number {
  const r: number[] = [];
  for (let k = 0; k < 5; k++) {
    const t = process.hrtime.bigint();
    for (let i = 0; i < n; i++) fn();
    r.push(Number(process.hrtime.bigint() - t) / n);
  }
  return median(r);
}

let sink = 0;
for (const n of names) {
  const spec = (A as unknown as Record<string, readonly A.AccountSpec[]>)[n];
  const arr = spec.map(pk);
  const map: Record<string, PublicKey> = {};
  spec.forEach((s, i) => (map[s.name] = arr[i]));
  const a = time(() => { sink += A.buildAccountMetas(spec, arr).length; }, iters);
  const m = time(() => { sink += A.buildAccountMetas(spec, map).length; }, iters);
  console.log(`${n.padEnd(40)} array ${a.toFixed(1)} ns  map ${m.toFixed(1)} ns`);
}

// trade ix build share
const spec = A.ACCOUNTS_TRADE_CPI;
const keys: Record<string, PublicKey> = {};
for (const s of spec) keys[s.name] = pk();
const pid = pk();
const args = {
  accountAPortfolioId: 1n, accountAPositionEpoch: 2n, accountBPortfolioId: 3n, accountBPositionEpoch: 4n,
  accountBMatcherSequence: 5n, assetIndex: 0, marketId: 7n, sizeQ: 1000n, feeBps: 10n, limitPrice: 0n, backingFeeCapBps: 0,
};
const full = time(() => {
  const data = encodeTradeCpi(args);
  const ix = new TransactionInstruction({ programId: pid, keys: A.buildAccountMetas(spec, keys), data: Buffer.from(data) });
  sink += ix.keys.length;
}, iters / 5);
const metas = time(() => { sink += A.buildAccountMetas(spec, keys).length; }, iters / 5);
console.log(`trade ix build ${full.toFixed(1)} ns, metas ${metas.toFixed(1)} ns = ${((metas / full) * 100).toFixed(1)}%`);
if (sink === -1) console.log(sink);
