/**
 * worker_threads shard for test/ata-vs-spltoken.test.ts (booted by the test with tsx's ESM loader registered).
 *
 * For each (owner, mint) pair it runs the same three derivations the test used to run on the main
 * thread: spl.getAssociatedTokenAddressSync(mint, owner, false, program) (the reference), our
 * getAtaSync(owner, mint, false, program) and our async getAta(owner, mint, false, program).
 * It posts back hex strings only; the test does every comparison with expect() on the main thread.
 * A throw is reported as "ERR:<class name>:<message>" so a mismatch still names the pair.
 */
import { parentPort, workerData } from "node:worker_threads";
import { PublicKey } from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import { getAta, getAtaSync } from "../../src/solana/ata.js";

type Job = { program: Uint8Array; pairs: [Uint8Array, Uint8Array][] };

const hex = (k: PublicKey) => Buffer.from(k.toBytes()).toString("hex");
const errTag = (e: unknown) => `ERR:${(e as Error)?.constructor?.name}:${(e as Error)?.message}`;
function tag(f: () => PublicKey): string {
  try {
    return hex(f());
  } catch (e) {
    return errTag(e);
  }
}
async function tagAsync(f: () => Promise<PublicKey>): Promise<string> {
  try {
    return hex(await f());
  } catch (e) {
    return errTag(e);
  }
}

const { program: programBytes, pairs: pairBytes } = workerData as Job;
const program = new PublicKey(programBytes);
const pairs = pairBytes.map(([o, m]) => [new PublicKey(o), new PublicKey(m)] as const);

const theirs: string[] = [];
const sync: string[] = [];
const async_: string[] = [];
for (const [owner, mint] of pairs) {
  theirs.push(tag(() => spl.getAssociatedTokenAddressSync(mint, owner, false, program)));
  sync.push(tag(() => getAtaSync(owner, mint, false, program)));
  async_.push(await tagAsync(() => getAta(owner, mint, false, program)));
}
parentPort!.postMessage({ theirs, sync, async: async_ });
