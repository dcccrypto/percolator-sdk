import { requireAdminKeypairPath, requireRpcUrl } from "./config.mjs";
// Jupiter SOL -> USDC swap for admin wallet.
// Authorized params: 0.85 SOL ExactIn, 1% slippage.

import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import fs from 'fs';

const RPC = requireRpcUrl();
const ADMIN_KEYPAIR_PATH = requireAdminKeypairPath();

const SOL_MINT  = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const AMOUNT_LAMPORTS = 850_000_000; // 0.85 SOL
const SLIPPAGE_BPS = 100;            // 1%

const conn = new Connection(RPC, 'confirmed');
const admin = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(ADMIN_KEYPAIR_PATH, 'utf8'))));

console.log(`Admin: ${admin.publicKey.toBase58()}`);
const balLam = await conn.getBalance(admin.publicKey);
console.log(`SOL before: ${(balLam / 1e9).toFixed(6)}`);
console.log();

console.log(`Quoting: ${AMOUNT_LAMPORTS/1e9} SOL -> USDC, ${SLIPPAGE_BPS} bps slippage...`);
const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}&outputMint=${USDC_MINT}&amount=${AMOUNT_LAMPORTS}&slippageBps=${SLIPPAGE_BPS}&swapMode=ExactIn`;
const quoteResp = await fetch(quoteUrl);
if (!quoteResp.ok) throw new Error(`Quote failed: ${quoteResp.status} ${await quoteResp.text()}`);
const quote = await quoteResp.json();

const outAmount = Number(quote.outAmount) / 1e6;
const minOutAmount = Number(quote.otherAmountThreshold) / 1e6;
const priceImpact = Number(quote.priceImpactPct) * 100;
console.log(`  Expected out: ${outAmount.toFixed(4)} USDC`);
console.log(`  Min out (post-slippage): ${minOutAmount.toFixed(4)} USDC`);
console.log(`  Price impact: ${priceImpact.toFixed(4)}%`);
console.log(`  Route: ${quote.routePlan.map(r => r.swapInfo.label).join(' -> ')}`);
console.log();

console.log('Building swap tx...');
const swapResp = await fetch('https://quote-api.jup.ag/v6/swap', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    quoteResponse: quote,
    userPublicKey: admin.publicKey.toBase58(),
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: 'auto',
  }),
});
if (!swapResp.ok) throw new Error(`Swap build failed: ${swapResp.status} ${await swapResp.text()}`);
const { swapTransaction } = await swapResp.json();

const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
tx.sign([admin]);

console.log('Sending...');
const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
console.log(`  Sig: ${sig}`);
console.log(`  Solscan: https://solscan.io/tx/${sig}`);

console.log('Confirming...');
const blockhash = await conn.getLatestBlockhash('confirmed');
const conf = await conn.confirmTransaction({
  signature: sig,
  blockhash: blockhash.blockhash,
  lastValidBlockHeight: blockhash.lastValidBlockHeight,
}, 'confirmed');
if (conf.value.err) throw new Error(`Confirmation error: ${JSON.stringify(conf.value.err)}`);

console.log('Confirmed.');
console.log();

const solAfter = await conn.getBalance(admin.publicKey);
const usdcAtaResp = await fetch(RPC, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner',
    params: [admin.publicKey.toBase58(), { mint: USDC_MINT }, { encoding: 'jsonParsed' }],
  }),
});
const usdcAta = await usdcAtaResp.json();
const usdcAfter = usdcAta.result.value[0]?.account.data.parsed.info.tokenAmount.uiAmount ?? 0;

console.log(`SOL after:  ${(solAfter / 1e9).toFixed(6)}`);
console.log(`USDC after: ${usdcAfter.toFixed(6)}`);
console.log(`Net SOL spent: ${((balLam - solAfter) / 1e9).toFixed(6)} SOL`);
