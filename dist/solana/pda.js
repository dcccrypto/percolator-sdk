import { PublicKey } from "@solana/web3.js";
const textEncoder = new TextEncoder();
function u16LE(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 65535) {
    throw new Error(`u16LE: value must be an integer in [0, 65535], got ${value}`);
  }
  const buf = new Uint8Array(2);
  new DataView(buf.buffer).setUint16(
    0,
    value,
    /*littleEndian=*/
    true
  );
  return buf;
}
function deriveVaultAuthority(programId, slab) {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("vault"), slab.toBytes()],
    programId
  );
}
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);
const PERCOLATOR_VAULT_TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
function deriveCanonicalVault(programId, market, mint) {
  const [vaultAuthority] = deriveVaultAuthority(programId, market);
  return deriveCanonicalVaultForAuthority(vaultAuthority, mint);
}
function deriveCanonicalVaultForAuthority(vaultAuthority, mint) {
  return PublicKey.findProgramAddressSync(
    [
      vaultAuthority.toBytes(),
      PERCOLATOR_VAULT_TOKEN_PROGRAM_ID.toBytes(),
      mint.toBytes()
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
}
function deriveMarketVaultAccounts(programId, market, mint) {
  const [vaultAuthority, vaultAuthorityBump] = deriveVaultAuthority(programId, market);
  const [vaultToken, vaultTokenBump] = deriveCanonicalVaultForAuthority(
    vaultAuthority,
    mint
  );
  return {
    vaultAuthority,
    vaultAuthorityBump,
    vaultToken,
    vaultTokenBump,
    tokenProgram: PERCOLATOR_VAULT_TOKEN_PROGRAM_ID
  };
}
function deriveInsuranceLpMint(programId, slab) {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("lp_vault_mint"), slab.toBytes()],
    programId
  );
}
const LP_INDEX_U16_MAX = 65535;
function deriveLpPda(programId, slab, lpIdx) {
  if (typeof lpIdx !== "number" || !Number.isInteger(lpIdx) || lpIdx < 0 || lpIdx > LP_INDEX_U16_MAX) {
    throw new Error(
      `deriveLpPda: lpIdx must be an integer in [0, ${LP_INDEX_U16_MAX}], got ${lpIdx}`
    );
  }
  const idxBuf = new Uint8Array(2);
  new DataView(idxBuf.buffer).setUint16(0, lpIdx, true);
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("lp"), slab.toBytes(), idxBuf],
    programId
  );
}
const PUMPSWAP_PROGRAM_ID = new PublicKey(
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
);
const RAYDIUM_CLMM_PROGRAM_ID = new PublicKey(
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK"
);
const METEORA_DLMM_PROGRAM_ID = new PublicKey(
  "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo"
);
const PYTH_PUSH_ORACLE_PROGRAM_ID = new PublicKey(
  "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT"
);
const CREATOR_LOCK_SEED = "creator_lock";
function deriveCreatorLockPda(programId, slab) {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode(CREATOR_LOCK_SEED), slab.toBytes()],
    programId
  );
}
function deriveLpVaultRegistry(programId, marketGroup) {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("lp_vault"), marketGroup.toBytes()],
    programId
  );
}
function deriveLpRedemption(programId, registry, redeemer) {
  return PublicKey.findProgramAddressSync(
    [
      textEncoder.encode("lp_redemption"),
      registry.toBytes(),
      redeemer.toBytes()
    ],
    programId
  );
}
function deriveLpBackingLedger(programId, marketGroup, domainIdx) {
  return PublicKey.findProgramAddressSync(
    [
      textEncoder.encode("lp_backing_ledger"),
      marketGroup.toBytes(),
      u16LE(domainIdx)
    ],
    programId
  );
}
function deriveLpEscrow(programId, marketGroup) {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("lp_escrow"), marketGroup.toBytes()],
    programId
  );
}
function deriveNftRegistry(programId, marketGroup) {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("nft_registry"), marketGroup.toBytes()],
    programId
  );
}
function deriveMatcherDelegate(programId, market, accountB, accountBOwner, matcherProg, matcherCtx) {
  return PublicKey.findProgramAddressSync(
    [
      textEncoder.encode("matcher"),
      market.toBytes(),
      accountB.toBytes(),
      accountBOwner.toBytes(),
      matcherProg.toBytes(),
      matcherCtx.toBytes()
    ],
    programId
  );
}
const PYTH_FEED_ID_HEX_LEN = 64;
function normalizePythFeedIdHex(feedIdHex) {
  let s = feedIdHex.trim();
  if (s.startsWith("0x") || s.startsWith("0X")) {
    s = s.slice(2);
  }
  return s;
}
const FEED_HEX_RE = /^[0-9a-fA-F]{64}$/;
function derivePythPushOraclePDA(feedIdHex) {
  const normalized = normalizePythFeedIdHex(feedIdHex);
  if (!FEED_HEX_RE.test(normalized)) {
    throw new Error(
      `derivePythPushOraclePDA: feedIdHex must be 64 hex digits (32 bytes); got ${normalized.length === 64 ? "non-hexadecimal characters" : normalized.length + " chars"}`
    );
  }
  const feedId = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    feedId[i] = parseInt(normalized.substring(i * 2, i * 2 + 2), 16);
  }
  const shardBuf = new Uint8Array(2);
  return PublicKey.findProgramAddressSync(
    [shardBuf, feedId],
    PYTH_PUSH_ORACLE_PROGRAM_ID
  );
}
export {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  CREATOR_LOCK_SEED,
  METEORA_DLMM_PROGRAM_ID,
  PERCOLATOR_VAULT_TOKEN_PROGRAM_ID,
  PUMPSWAP_PROGRAM_ID,
  PYTH_PUSH_ORACLE_PROGRAM_ID,
  RAYDIUM_CLMM_PROGRAM_ID,
  deriveCanonicalVault,
  deriveCanonicalVaultForAuthority,
  deriveCreatorLockPda,
  deriveInsuranceLpMint,
  deriveLpBackingLedger,
  deriveLpEscrow,
  deriveLpPda,
  deriveLpRedemption,
  deriveLpVaultRegistry,
  deriveMarketVaultAccounts,
  deriveMatcherDelegate,
  deriveNftRegistry,
  derivePythPushOraclePDA,
  deriveVaultAuthority
};
//# sourceMappingURL=pda.js.map