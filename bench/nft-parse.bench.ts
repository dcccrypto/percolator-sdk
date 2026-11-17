import { bench, describe } from "vitest";
import { Keypair } from "@solana/web3.js";
import {
  parsePositionNftAccount,
  deriveNftPda,
  deriveMintAuthority,
  deriveExtraAccountMetas,
} from "../src/abi/nft.js";

function mk(len: number, version: number, seed: number): Uint8Array {
  const d = new Uint8Array(len);
  const v = new DataView(d.buffer);
  v.setBigUint64(0, 0x5045_5243_4e46_5400n, true);
  d[8] = version;
  d[9] = 250;
  for (let i = 10; i < len; i++) d[i] = (i * 7 + seed) & 0xff;
  d[78] = seed & 1;
  return d;
}

const accounts: Uint8Array[] = [];
for (let i = 0; i < 1000; i++) accounts.push(i % 2 ? mk(239, 3, i) : mk(199, 2, i));

const owners = Array.from({ length: 1000 }, () => Keypair.generate().publicKey);
const mints = Array.from({ length: 1000 }, () => Keypair.generate().publicKey);

describe("nft parse (1000 accounts)", () => {
  bench("parsePositionNftAccount x1000", () => {
    for (let i = 0; i < accounts.length; i++) parsePositionNftAccount(accounts[i]);
  });
});

describe("nft PDA derivation (1000 keys)", () => {
  bench("deriveNftPda x1000", () => {
    for (let i = 0; i < owners.length; i++) deriveNftPda(owners[i], i);
  });
  bench("deriveExtraAccountMetas x1000", () => {
    for (let i = 0; i < mints.length; i++) deriveExtraAccountMetas(mints[i]);
  });
  bench("deriveMintAuthority x1000", () => {
    for (let i = 0; i < 1000; i++) deriveMintAuthority();
  });
});
