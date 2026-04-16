import { Connection, PublicKey } from "@solana/web3.js";

const SLAB = new PublicKey("6akNPYQLyg2nGLDtGAoykB8ZtuoAEwGhxreXaDWncya2");
const WALLET = new PublicKey("GnjCwHLm9bWdPrJ6z2frMf5kYmRh1qCb9otBEXUuSpUd");
const PROGRAM = new PublicKey("ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv");
const rpc = "https://mainnet.helius-rpc.com/?api-key=2a089bfd-18ae-48b5-abbe-36b0383ecad3";

async function main() {
  const conn = new Connection(rpc, "confirmed");
  
  // Get ALL transactions on the slab
  const allSigs = await conn.getSignaturesForAddress(SLAB, { limit: 50 });
  console.log(`Total slab transactions: ${allSigs.length}\n`);

  // Find the InitUser tx from GnjCwH and surrounding cranks
  for (const s of allSigs) {
    const tx = await conn.getTransaction(s.signature, { 
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed"
    });
    if (!tx) continue;
    
    const keys = tx.transaction.message.staticAccountKeys?.map(k => k.toBase58()) ?? [];
    const logs = tx.meta?.logMessages ?? [];
    
    const isFromGnjCwH = keys.includes(WALLET.toBase58());
    const isFromEzuos = keys.includes("EzuosBXLtHMVumpQQZfqDuDzLqRCkLP3ZnUo8kWNqAqy");
    
    // Get instruction data to determine tag
    const ixs = tx.transaction.message.compiledInstructions ?? [];
    let tag = -1;
    for (const ix of ixs) {
      const progIdx = ix.programIdIndex;
      if (keys[progIdx] === PROGRAM.toBase58()) {
        tag = ix.data[0];
        break;
      }
    }
    
    // Parse crank log for details
    const crankLog = logs.find(l => l.includes("0xc8a4c5"));
    const transferLog = logs.find(l => l.includes("Instruction: Transfer"));
    const updateMark = logs.find(l => l.includes("UpdateHyperpMark"));
    
    const slotTime = tx.blockTime ? new Date(tx.blockTime * 1000).toISOString().slice(11,19) : "?";
    
    if (isFromGnjCwH || isFromEzuos || tag === 1) {
      // User transaction
      const who = isFromGnjCwH ? "GnjCwH" : isFromEzuos ? "EzuosB" : "other";
      console.log(`[${s.slot}] ${slotTime} USER(${who}) tag=${tag} sig=${s.signature.slice(0,16)}...`);
      // Print all program logs
      for (const l of logs.filter(l => l.includes("ESa89") || l.includes("Program log") || l.includes("Transfer") || l.includes("Error"))) {
        console.log(`    ${l}`);
      }
    } else if (crankLog) {
      // Crank — decode the hex values
      const match = crankLog.match(/0xc8a4c5, (0x[0-9a-f]+), (0x[0-9a-f]+), (0x[0-9a-f]+), (0x[0-9a-f]+)/);
      if (match) {
        const [, v1, v2, v3, v4] = match;
        console.log(`[${s.slot}] ${slotTime} CRANK num_used=${parseInt(v1,16)} max=${parseInt(v2,16)} vault=${parseInt(v3,16)} insurance=${parseInt(v4,16)}`);
      } else {
        console.log(`[${s.slot}] ${slotTime} CRANK ${crankLog.slice(0,80)}`);
      }
    } else if (updateMark) {
      // Just oracle update, skip for brevity
    } else {
      console.log(`[${s.slot}] ${slotTime} OTHER tag=${tag} sig=${s.signature.slice(0,16)}...`);
    }
  }
}
main().catch(console.error);
