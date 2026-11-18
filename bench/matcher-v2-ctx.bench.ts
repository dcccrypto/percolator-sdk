import { Keypair } from "@solana/web3.js";
import { buildMatcherConfigureBackingFeeCapIx, isMatcherCtxV2, decodeMatcherCallExt } from "../src/abi/matcher-v2.js";

const k = () => Keypair.generate().publicKey;
const a = { matcherProgramId: k(), wrapperProgramId: k(), market: k(), lpPortfolio: k(), lpOwner: k(), matcherCtx: k() };
const ctx = new Uint8Array(400);
const ext = new Uint8Array(24);
const med = (f: () => void) => {
  const r: number[] = [];
  for (let i = 0; i < 3; i++) { const t = performance.now(); for (let n = 0; n < 1000; n++) f(); r.push(performance.now() - t); }
  return r.sort((x, y) => x - y)[1];
};
console.log("configure ix N=1000 median ms", med(() => buildMatcherConfigureBackingFeeCapIx(a, 100)).toFixed(2));
console.log("isMatcherCtxV2 N=1000 median ms", med(() => isMatcherCtxV2(ctx)).toFixed(3));
console.log("decodeMatcherCallExt N=1000 median ms", med(() => decodeMatcherCallExt(ext)).toFixed(3));
