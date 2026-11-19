import { PublicKey } from "@solana/web3.js";
import { wrapperEventTokensV22 } from "../../src/abi/v22-fill-events.js";

const wrapper = new PublicKey("11111111111111111111111111111112");
const inner = Array.from({ length: 6 }, (_, i) => new PublicKey(new Uint8Array(32).fill(i + 3)).toBase58());
const w = wrapper.toBase58();
const logs: string[] = [`Program ${w} invoke [1]`];
for (const id of inner) {
  logs.push(`Program ${id} invoke [2]`, `Program ${id} consumed 1200 of 200000 compute units`, `Program ${id} success`);
}
logs.push(`Program data: ${Buffer.alloc(64, 7).toString("base64")}`, `Program ${w} consumed 5000 of 200000 compute units`, `Program ${w} success`);

for (let i = 0; i < 2000; i++) wrapperEventTokensV22(logs, wrapper);
const N = 20000;
const t0 = process.hrtime.bigint();
for (let i = 0; i < N; i++) wrapperEventTokensV22(logs, wrapper);
const us = Number(process.hrtime.bigint() - t0) / 1000 / N;
console.log(`lines=${logs.length} wrapperEventTokensV22: ${us.toFixed(2)} us/call`);
