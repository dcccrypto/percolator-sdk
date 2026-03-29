/**
 * Admin Instruction Examples
 *
 * Shows how to construct and send the two admin instructions added in PERC-8110 / PERC-8180:
 *   - SetOiImbalanceHardBlock (tag=71) — set the OI skew hard-block threshold per market
 *   - SetOracleAuthority (tag=16)      — delegate or revoke the oracle price authority
 *
 * Both instructions are admin-only and must be signed by the market admin key.
 *
 * @module examples/admin-instructions
 */

import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  encodeSetOiImbalanceHardBlock,
  encodeSetOracleAuthority,
  ACCOUNTS_SET_OI_IMBALANCE_HARD_BLOCK,
  ACCOUNTS_SET_ORACLE_AUTHORITY,
  buildAccountMetas,
  buildIx,
  getProgramId,
  simulateOrSend,
} from "@percolator/sdk";

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

// Admin keypair (never hardcode a real key — load from env or a wallet adapter)
const admin = Keypair.generate(); // replace with your real admin keypair
const PROGRAM_ID = getProgramId("devnet");

// The on-chain slab / market account you want to configure
const slabPubkey = new PublicKey("3Eq3G6fiPFkvqQdUXNMGRrgqVCcNV74Mo7Td9qhvq3HR");

// ---------------------------------------------------------------------------
// 1. SetOiImbalanceHardBlock
// ---------------------------------------------------------------------------
//
// Prevents new trades from pushing the long/short OI skew above a threshold.
//
//   threshold_bps = 0       → hard block disabled (default)
//   threshold_bps = 5_000   → block trades that would push skew above 50%
//   threshold_bps = 8_000   → block trades that would push skew above 80%
//   threshold_bps = 10_000  → effectively locks the dominant side once any OI exists
//
// When the guard fires, the on-chain error `OiImbalanceHardBlock` (code 59) is returned.
// ---------------------------------------------------------------------------

/**
 * Builds a SetOiImbalanceHardBlock instruction.
 *
 * @param thresholdBps - Skew threshold in basis points (0–10 000). 0 = disabled.
 * @returns TransactionInstruction ready to include in a Transaction / VersionedTransaction.
 *
 * @example
 * ```ts
 * // Set 80% skew hard-block on a market
 * const ix = buildSetOiImbalanceHardBlockIx({
 *   admin: admin.publicKey,
 *   slab: slabPubkey,
 *   thresholdBps: 8_000,
 * });
 * ```
 */
export function buildSetOiImbalanceHardBlockIx(params: {
  admin: PublicKey;
  slab: PublicKey;
  thresholdBps: number;
}): TransactionInstruction {
  const { admin, slab, thresholdBps } = params;

  const data = encodeSetOiImbalanceHardBlock({ thresholdBps });
  const keys = buildAccountMetas(ACCOUNTS_SET_OI_IMBALANCE_HARD_BLOCK, [admin, slab]);

  return buildIx({ programId: PROGRAM_ID, keys, data });
}

/** End-to-end example: set 80% OI skew hard-block and send to devnet. */
export async function exampleSetOiImbalanceHardBlock(): Promise<void> {
  const ix = buildSetOiImbalanceHardBlockIx({
    admin: admin.publicKey,
    slab: slabPubkey,
    thresholdBps: 8_000, // 80% skew limit
  });

  const result = await simulateOrSend({
    connection,
    ix,
    signers: [admin],
    simulate: false,       // set true to dry-run without paying fees
    computeUnitLimit: 50_000,
  });

  console.log("SetOiImbalanceHardBlock signature:", result.signature);
}

// ---------------------------------------------------------------------------
// 2. SetOracleAuthority
// ---------------------------------------------------------------------------
//
// Delegates the right to call PushOraclePrice to a specific keypair (e.g. a
// crank bot). Pass PublicKey.default (all zeros) to revoke — the program then
// falls back to Pyth / Chainlink feeds only.
// ---------------------------------------------------------------------------

/**
 * Builds a SetOracleAuthority instruction.
 *
 * @param newAuthority - Public key of the new oracle authority.
 *                       Pass `PublicKey.default` to revoke (disable custom oracle).
 * @returns TransactionInstruction ready to include in a Transaction / VersionedTransaction.
 *
 * @example
 * ```ts
 * // Delegate to a crank bot
 * const ix = buildSetOracleAuthorityIx({
 *   admin: admin.publicKey,
 *   slab: slabPubkey,
 *   newAuthority: crankBot.publicKey,
 * });
 *
 * // Revoke — fall back to Pyth/Chainlink
 * const revokeIx = buildSetOracleAuthorityIx({
 *   admin: admin.publicKey,
 *   slab: slabPubkey,
 *   newAuthority: PublicKey.default,
 * });
 * ```
 */
export function buildSetOracleAuthorityIx(params: {
  admin: PublicKey;
  slab: PublicKey;
  newAuthority: PublicKey;
}): TransactionInstruction {
  const { admin, slab, newAuthority } = params;

  const data = encodeSetOracleAuthority({ newAuthority });
  const keys = buildAccountMetas(ACCOUNTS_SET_ORACLE_AUTHORITY, [admin, slab]);

  return buildIx({ programId: PROGRAM_ID, keys, data });
}

/** End-to-end example: set oracle authority to a crank bot and send to devnet. */
export async function exampleSetOracleAuthority(): Promise<void> {
  const crankBot = Keypair.generate(); // replace with your actual crank keypair

  const ix = buildSetOracleAuthorityIx({
    admin: admin.publicKey,
    slab: slabPubkey,
    newAuthority: crankBot.publicKey,
  });

  const result = await simulateOrSend({
    connection,
    ix,
    signers: [admin],
    simulate: false,
    computeUnitLimit: 50_000,
  });

  console.log("SetOracleAuthority signature:", result.signature);
}

/** End-to-end example: revoke oracle authority (revert to Pyth/Chainlink). */
export async function exampleRevokeOracleAuthority(): Promise<void> {
  const ix = buildSetOracleAuthorityIx({
    admin: admin.publicKey,
    slab: slabPubkey,
    newAuthority: PublicKey.default, // zero pubkey = disable custom oracle
  });

  const result = await simulateOrSend({
    connection,
    ix,
    signers: [admin],
    simulate: false,
    computeUnitLimit: 50_000,
  });

  console.log("OracleAuthority revoked:", result.signature);
}
