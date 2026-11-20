#!/usr/bin/env node
// Capture one active and one resolved devnet v2.2 market account (public data, no keys) into
// fixtures/accounts/devnet-v22-market-modes.json. One getMultipleAccounts call, read-only.
// Usage: node scripts/capture-market-mode-fixture.mjs [rpcUrl]
import { writeFileSync } from "node:fs";

const RPC = process.argv[2] ?? "https://api.devnet.solana.com";
const PROGRAM = "6kpg2wi7vwkn7E9rvodXSktYRhna8TWjiZrC1dBek6NM";
const ACTIVE = "J2pz2HFpfjPqEwxxV7CiohPo14j3ifZWxR6qEKZQWVK7";
const RESOLVED = "25xGmJg5ZaAckSXCnnvhSwsvzJqi82UqpR82UFtsZiNC";

const res = await fetch(RPC, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getMultipleAccounts", params: [[ACTIVE, RESOLVED], { encoding: "base64", commitment: "confirmed" }] }),
});
const j = await res.json();
if (j.error) throw new Error(JSON.stringify(j.error));
const slot = j.result.context.slot;
const accounts = [ACTIVE, RESOLVED].map((address, i) => {
  const v = j.result.value[i];
  if (!v) throw new Error(`missing ${address}`);
  if (v.owner !== PROGRAM) throw new Error(`owner mismatch ${address}: ${v.owner}`);
  const data = Buffer.from(v.data[0], "base64");
  return { address, owner: v.owner, lamports: v.lamports, data_length: data.length, mode_byte_at_1266: data[1266], data_base64: data.toString("base64") };
});
const out = {
  source: "devnet",
  cluster_slot: slot,
  captured_at: new Date().toISOString().slice(0, 10),
  program_id: PROGRAM,
  _note: "Two full v2.2 (wrapper VERSION 19) market accounts: [0] active (mode 0), [1] resolved (mode 1). Public on-chain data, no keys. mode = u8 at MARKET_GROUP_OFF 592 + MarketGroupV16HeaderAccount.mode 674 (engine src/v16.rs: current_slot@661 + 3 u8 + recovery_reason 2 B).",
  accounts,
};
writeFileSync(new URL("../fixtures/accounts/devnet-v22-market-modes.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(accounts.map(({ data_base64, ...rest }) => rest)));
