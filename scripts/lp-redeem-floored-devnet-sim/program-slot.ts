// Read-only: last deploy slot of the devnet v2.2 wrapper (programdata header) and the current slot.
import { Connection, PublicKey } from "@solana/web3.js";
import { PROGRAM_IDS_DEVNET_V22 } from "../../src/index.js";

const conn = new Connection(process.env.LPSIM_RPC ?? "https://api.devnet.solana.com", "confirmed");
const prog = new PublicKey(PROGRAM_IDS_DEVNET_V22.percolator);
const p = await conn.getAccountInfo(prog);
const programData = new PublicKey(p!.data.subarray(4, 36));
const pd = await conn.getAccountInfo(programData, { dataSlice: { offset: 0, length: 45 } });
const b = Buffer.from(pd!.data);
const lastDeploySlot = b.readBigUInt64LE(4);
const slot = await conn.getSlot("confirmed");
const t = await conn.getBlockTime(Number(lastDeploySlot)).catch(() => null);
console.log(JSON.stringify({ program: prog.toBase58(), programData: programData.toBase58(), lastDeploySlot: lastDeploySlot.toString(), lastDeployTime: t ? new Date(t * 1000).toISOString() : null, currentSlot: slot }));
