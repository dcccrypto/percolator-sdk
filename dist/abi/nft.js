import { PublicKey } from "@solana/web3.js";
import { PROGRAM_IDS_V17 } from "../config/program-ids.js";
import { safeEnv } from "../config/program-ids.js";
const KNOWN_NFT_PROGRAM_IDS = /* @__PURE__ */ new Set([
  "FqhKJT9gtScjrmfUuRMjeg7cXNpif1fqsy5Jh65tJmTS",
  // mainnet
  PROGRAM_IDS_V17.nft
  // v17 devnet — the default below
]);
const NFT_PROGRAM_OVERRIDE = safeEnv("NFT_PROGRAM_ID");
if (NFT_PROGRAM_OVERRIDE !== void 0 && !KNOWN_NFT_PROGRAM_IDS.has(NFT_PROGRAM_OVERRIDE)) {
  throw new Error(
    `[percolator-sdk] NFT_PROGRAM_ID env var "${NFT_PROGRAM_OVERRIDE}" is not a known NFT program address. Allowed values: ${[...KNOWN_NFT_PROGRAM_IDS].join(", ")}. Pass the programId argument explicitly to bypass env resolution.`
  );
}
const NFT_PROGRAM_ID = new PublicKey(NFT_PROGRAM_OVERRIDE ?? PROGRAM_IDS_V17.nft);
function getNftProgramId() {
  return NFT_PROGRAM_ID;
}
const NFT_IX_TAG = {
  MintPositionNft: 0,
  BurnPositionNft: 1,
  SettleFunding: 2,
  GetPositionValue: 3,
  ExecuteTransferHook: 4,
  EmergencyBurn: 5,
  RepairExtraMetas: 6,
  ReconcileBurnedNft: 7
};
function encodeNftMint(assetIndex) {
  const assetIndexBuf = u16Buf(assetIndex, "assetIndex");
  const buf = new Uint8Array(3);
  buf[0] = NFT_IX_TAG.MintPositionNft;
  buf.set(assetIndexBuf, 1);
  return buf;
}
function encodeNftBurn() {
  return new Uint8Array([NFT_IX_TAG.BurnPositionNft]);
}
function encodeNftSettleFunding() {
  return new Uint8Array([NFT_IX_TAG.SettleFunding]);
}
function encodeNftEmergencyBurn() {
  return new Uint8Array([NFT_IX_TAG.EmergencyBurn]);
}
function encodeNftReconcile() {
  return new Uint8Array([NFT_IX_TAG.ReconcileBurnedNft]);
}
function buildNftAccountMetas(spec, keys) {
  if (keys.length !== spec.length) {
    throw new Error(
      `buildNftAccountMetas: account count mismatch: expected ${spec.length}, got ${keys.length}`
    );
  }
  return spec.map((code, i) => ({
    pubkey: keys[i],
    isSigner: code === "s" || code === "sw",
    isWritable: code === "w" || code === "sw"
  }));
}
const ACCOUNTS_NFT_MINT = [
  "sw",
  "w",
  "sw",
  "w",
  "w",
  "r",
  "r",
  "r",
  "r",
  "w",
  "r",
  "r"
];
const ACCOUNTS_NFT_BURN = [
  "sw",
  "w",
  "w",
  "w",
  "w",
  "r",
  "r",
  "w",
  "r",
  "r"
];
const ACCOUNTS_NFT_EMERGENCY_BURN = [
  "sw",
  "w",
  "w",
  "w",
  "w",
  "r",
  "r",
  "w",
  "r",
  "r"
];
const ACCOUNTS_NFT_RECONCILE = [
  "w",
  "w",
  "w",
  "r",
  "r",
  "r",
  "w",
  "w",
  "r"
];
const TEXT = new TextEncoder();
function u16Buf(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new Error(`${label} must be a u16`);
  }
  const buf = new Uint8Array(2);
  new DataView(buf.buffer).setUint16(0, value, true);
  return buf;
}
function u64Buf(value, label) {
  const v = typeof value === "bigint" ? value : BigInt(value);
  if (v < 0n || v > 0xffffffffffffffffn) {
    throw new Error(`${label} must be a u64`);
  }
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, v, true);
  return buf;
}
function deriveNftPda(portfolioAccount, marketId, programId = NFT_PROGRAM_ID) {
  return PublicKey.findProgramAddressSync(
    [TEXT.encode("position_nft"), portfolioAccount.toBytes(), u64Buf(marketId, "marketId")],
    programId
  );
}
function deriveNftMint(_portfolioAccount, _assetIndex, _programId = NFT_PROGRAM_ID) {
  throw new Error("deriveNftMint: v16 NFT mint is a fresh signer keypair, not a PDA");
}
function deriveMintAuthority(programId = NFT_PROGRAM_ID) {
  return PublicKey.findProgramAddressSync(
    [TEXT.encode("mint_authority")],
    programId
  );
}
function deriveExtraAccountMetas(nftMint, programId = NFT_PROGRAM_ID) {
  return PublicKey.findProgramAddressSync(
    [TEXT.encode("extra-account-metas"), nftMint.toBytes()],
    programId
  );
}
const POSITION_NFT_STATE_LEN = 199;
const POSITION_NFT_MAGIC = 0x504552434e465400n;
const POSITION_NFT_VERSION = 2;
function readI128FromView(view, offset) {
  const lo = view.getBigUint64(offset, true);
  const hi = view.getBigUint64(offset + 8, true);
  const unsigned = hi << 64n | lo;
  const SIGN_BIT = 1n << 127n;
  if (unsigned >= SIGN_BIT) {
    return unsigned - (1n << 128n);
  }
  return unsigned;
}
function parsePositionNftAccount(data) {
  if (data.length < POSITION_NFT_STATE_LEN) {
    throw new Error(
      `PositionNft account too small: ${data.length} < ${POSITION_NFT_STATE_LEN}`
    );
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = view.getBigUint64(0, true);
  if (magic !== POSITION_NFT_MAGIC) {
    throw new Error("PositionNft account has invalid magic");
  }
  if (data[8] !== POSITION_NFT_VERSION) {
    throw new Error(`PositionNft account has invalid version: ${data[8]}`);
  }
  const positionOwnerAtMint = new PublicKey(data.subarray(127, 159));
  return {
    version: data[8],
    bump: data[9],
    portfolioAccount: new PublicKey(data.subarray(10, 42)),
    nftMint: new PublicKey(data.subarray(42, 74)),
    assetIndex: view.getUint32(74, true),
    sideAtMint: data[78],
    basisPosQAtMint: readI128FromView(view, 79),
    fSnapAtMint: readI128FromView(view, 95),
    marketIdAtMint: view.getBigUint64(111, true),
    epochSnapAtMint: view.getBigUint64(119, true),
    positionOwnerAtMint,
    positionOwner: positionOwnerAtMint,
    mintedAt: view.getBigInt64(159, true),
    lastHolder: new PublicKey(data.subarray(167, 199))
  };
}
export {
  ACCOUNTS_NFT_BURN,
  ACCOUNTS_NFT_EMERGENCY_BURN,
  ACCOUNTS_NFT_MINT,
  ACCOUNTS_NFT_RECONCILE,
  NFT_IX_TAG,
  NFT_PROGRAM_ID,
  POSITION_NFT_STATE_LEN,
  buildNftAccountMetas,
  deriveExtraAccountMetas,
  deriveMintAuthority,
  deriveNftMint,
  deriveNftPda,
  encodeNftBurn,
  encodeNftEmergencyBurn,
  encodeNftMint,
  encodeNftReconcile,
  encodeNftSettleFunding,
  getNftProgramId,
  parsePositionNftAccount
};
//# sourceMappingURL=nft.js.map