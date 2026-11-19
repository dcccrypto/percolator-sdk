// Read-only devnet capture for test/token-program-real-mints.test.ts (run once).
// Usage: node scripts/capture-token-program-fixtures.mjs > test/fixtures/token-program-real-mints.json
// RPC: PERCOLATOR_RPC_URL or public devnet. Only getAccountInfo / getTokenLargestAccounts.
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

const URL_ = process.env.PERCOLATOR_RPC_URL ?? "https://api.devnet.solana.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function rpc(method, params) {
  for (let i = 0; ; i++) {
    const r = await fetch(URL_, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const j = r.ok ? await r.json() : { error: { message: String(r.status) } };
    if (!j.error) return j.result;
    if (i >= 20) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
    await sleep(15000);
  }
}
const acct = (k) => rpc("getAccountInfo", [k, { encoding: "base64", commitment: "confirmed" }]);

// ERe2nVet… is the collateral mint of 71 of the 588 v2.2 devnet wrapper (6kpg2wi7…) accounts.
// CXk2AMBf… is the devnet PYUSD mint (Token-2022 with extensions).
const MINTS = {
  v22_collateral_spl: "ERe2nVetnKFH4Am7hh1cVWXd52s7uhWjorwFkU61kwan",
  token2022_extensions: "CXk2AMBfi3TwaEL2468s6zP8xq9NxTXjp9gjMgzeUynM",
};
const out = { network: "devnet", capturedAt: new Date().toISOString(), cases: {} };
for (const [name, mintStr] of Object.entries(MINTS)) {
  const mint = new PublicKey(mintStr);
  const res = await acct(mintStr);
  if (!res.value) throw new Error(`missing ${mintStr}`);
  const info = res.value;
  const progId = new PublicKey(info.owner);
  let owner = null, ata = null;
  // Candidate owners: mint authority (COption at byte 0..36), then top holders' owners.
  const raw = Buffer.from(info.data[0], "base64");
  const cands = [];
  if (raw.readUInt32LE(0) === 1) cands.push(new PublicKey(raw.subarray(4, 36)));
  for (const o of cands) {
    for (const off of [true]) {
      const a = getAssociatedTokenAddressSync(mint, o, off, progId);
      const ta = await acct(a.toBase58());
      if (ta.value && ta.value.owner === info.owner) { owner = o; ata = a.toBase58(); break; }
    }
    if (ata) break;
  }
  if (!ata) {
    // Holders via recent transactions that touched the mint (getTokenLargestAccounts is blocked on public devnet).
    const sigs = await rpc("getSignaturesForAddress", [mintStr, { limit: 15, commitment: "confirmed" }]);
    outer: for (const sg of sigs) {
      if (sg.err) continue;
      const tx = await rpc("getTransaction", [sg.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }]);
      const keys = tx?.transaction.message.accountKeys.map((k) => k.pubkey) ?? [];
      for (const tb of tx?.meta?.postTokenBalances ?? []) {
        if (tb.mint !== mintStr || !tb.owner) continue;
        const o = new PublicKey(tb.owner);
        const d = getAssociatedTokenAddressSync(mint, o, true, progId).toBase58();
        if (d === keys[tb.accountIndex]) {
          const ta = await acct(d);
          if (ta.value && ta.value.owner === info.owner) { owner = o; ata = d; break outer; }
        }
      }
    }
  }
  out.cases[name] = {
    mint: mintStr,
    slot: res.context.slot,
    owner: info.owner,
    lamports: info.lamports,
    executable: info.executable,
    dataBase64: info.data[0],
    ataOwner: owner?.toBase58() ?? null,
    chainAta: ata,
  };
}
console.log(JSON.stringify(out, null, 2));
