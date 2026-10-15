import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { safeEnv } from "../config/program-ids.js";
import { concatBytes } from "../abi/encode.js";
const STAKE_PROGRAM_IDS = {
  devnet: "VmpVUArRnVkrjaPXQ2qaqCQa3ZrZFgsz7rjeALitF5w",
  mainnet: "DC5fovFQD5SZYsetwvEqd4Wi4PFY1Yfnc669VMe6oa7F"
};
Object.freeze(STAKE_PROGRAM_IDS);
const KNOWN_STAKE_PROGRAM_IDS = new Set(Object.values(STAKE_PROGRAM_IDS));
function getStakeProgramId(network) {
  if (!network) {
    const override = safeEnv("STAKE_PROGRAM_ID");
    if (override) {
      if (!KNOWN_STAKE_PROGRAM_IDS.has(override) && safeEnv("PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE") !== "1") {
        throw new Error(
          `[percolator-sdk] STAKE_PROGRAM_ID env var "${override}" is not a known stake program address. Allowed values: ${[...KNOWN_STAKE_PROGRAM_IDS].join(", ")}. Pass an explicit network argument, or set PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE=1 to intentionally allow an unlisted program (e.g. a fresh pre-deploy address).`
        );
      }
      console.warn(
        `[percolator-sdk] STAKE_PROGRAM_ID env override active: ${override}`
      );
      return new PublicKey(override);
    }
  }
  const detectedNetwork = network ?? (() => {
    const n = safeEnv("NEXT_PUBLIC_DEFAULT_NETWORK")?.toLowerCase() ?? safeEnv("NETWORK")?.toLowerCase() ?? "";
    if (n === "mainnet" || n === "mainnet-beta") return "mainnet";
    if (n === "devnet") return "devnet";
    throw new Error(
      "getStakeProgramId: cannot determine the network. Neither NETWORK nor NEXT_PUBLIC_DEFAULT_NETWORK is set (in a browser bundle process.env is empty, so this is expected there; in Node it means the variable is unset). Pass an explicit network argument \u2014 getStakeProgramId('devnet') or getStakeProgramId('mainnet') \u2014 or set STAKE_PROGRAM_ID to override the address directly. Refusing to guess: this resolves a fund-custody program address, and callers that derive PDAs from it (deriveStakePool, deriveStakeVaultAuth, deriveDepositPda) would otherwise produce addresses for the wrong network."
    );
  })();
  const id = STAKE_PROGRAM_IDS[detectedNetwork];
  if (!id) {
    throw new Error(
      `Stake program not deployed on ${detectedNetwork}. Set STAKE_PROGRAM_ID env var or wait for DevOps to deploy and update STAKE_PROGRAM_IDS.mainnet.`
    );
  }
  return new PublicKey(id);
}
const STAKE_PROGRAM_ID = new PublicKey(STAKE_PROGRAM_IDS.devnet);
const STAKE_IX = {
  InitPool: 0,
  Deposit: 1,
  Withdraw: 2,
  FlushToInsurance: 3,
  UpdateConfig: 4,
  /**
   * ProposeAdmin (tag 5) — step 1 of two-step `pool.admin` rotation. The
   * CURRENT admin proposes a new admin (written to `pool.pending_admin`); the
   * proposed admin gains no authority until AcceptAdmin (tag 6). Proposing the
   * zero pubkey CANCELS an outstanding proposal.
   *
   * BREAKING vs the deployed percolator-vault program: tag 5 there is the
   * removed `TransferAdmin` (one-step, rejects on-chain). Do NOT confuse with
   * wrapper marketauth rotation (a completely different key, done via the
   * wrapper's own UpdateAuthority tag 32, CPI'd from stake InitPool).
   *
   * Wire: tag(1) + new_admin(32) = 33 bytes.
   * Accounts: [currentAdmin(signer), poolPda(writable)]
   */
  ProposeAdmin: 5,
  /**
   * AcceptAdmin (tag 6) — step 2 of two-step `pool.admin` rotation. The
   * PENDING admin signs to take ownership; requires an outstanding proposal
   * and the signer to equal `pool.pending_admin`.
   *
   * BREAKING vs the deployed percolator-vault program: tag 6 there is the
   * removed `AdminSetOracleAuthority` (rejects on-chain).
   *
   * Wire: tag(1) — no payload.
   * Accounts: [pendingAdmin(signer), poolPda(writable)]
   */
  AcceptAdmin: 6,
  /**
   * ProposeCooldownIncrease (tag 7) — step 1 of the #242 cooldown-increase
   * timelock. Proposes a NEW (larger) `cooldown_slots`; takes effect only
   * after CommitCooldownIncrease is called >= TIMELOCK_SLOTS later, guaranteeing
   * LP holders an exit window. A decrease/unchanged value is rejected here
   * (use UpdateConfig, which applies decreases immediately).
   *
   * BREAKING vs the deployed percolator-vault program: tag 7 there is the
   * removed `AdminSetRiskThreshold` (rejects on-chain).
   *
   * Wire: tag(1) + new_cooldown_slots(u64) = 9 bytes.
   * Accounts: [admin(signer), poolPda(writable), clockSysvar]
   */
  ProposeCooldownIncrease: 7,
  /**
   * CommitCooldownIncrease (tag 8) — step 2 of the #242 timelock. Applies the
   * pending cooldown increase; rejects if TIMELOCK_SLOTS has not elapsed.
   *
   * BREAKING vs the deployed percolator-vault program: tag 8 there is the
   * removed `AdminSetMaintenanceFee` (rejects on-chain).
   *
   * Wire: tag(1) — no payload.
   * Accounts: [admin(signer), poolPda(writable), clockSysvar]
   */
  CommitCooldownIncrease: 8,
  /**
   * CancelCooldownIncrease (tag 9) — withdraws an outstanding #242 cooldown
   * proposal.
   *
   * BREAKING vs the deployed percolator-vault program: tag 9 there is the
   * removed `AdminResolveMarket` (rejects on-chain).
   *
   * Wire: tag(1) — no payload.
   * Accounts: [admin(signer), poolPda(writable)]
   */
  CancelCooldownIncrease: 9,
  /** @deprecated Alias for ProposeAdmin — the OLD percolator-vault semantics
   *  (one-step TransferAdmin) no longer apply; tag 5 is now ProposeAdmin. */
  TransferAdmin: 5,
  /** @deprecated Alias for AcceptAdmin — the OLD percolator-vault semantics
   *  (AdminSetOracleAuthority) no longer apply; tag 6 is now AcceptAdmin. */
  AdminSetOracleAuthority: 6,
  /** @deprecated Alias for ProposeCooldownIncrease — the OLD percolator-vault
   *  semantics (AdminSetRiskThreshold) no longer apply; tag 7 is now
   *  ProposeCooldownIncrease with a DIFFERENT wire format (u64, not removed-stub). */
  AdminSetRiskThreshold: 7,
  /** @deprecated Alias for CommitCooldownIncrease — the OLD percolator-vault
   *  semantics (AdminSetMaintenanceFee) no longer apply; tag 8 is now
   *  CommitCooldownIncrease. */
  AdminSetMaintenanceFee: 8,
  /** @deprecated Alias for CancelCooldownIncrease — the OLD percolator-vault
   *  semantics (AdminResolveMarket) no longer apply; tag 9 is now
   *  CancelCooldownIncrease. */
  AdminResolveMarket: 9,
  /**
   * ReturnInsurance (tag 10) — unchanged wire/semantics vs the deployed
   * percolator-vault program: transfer withdrawn insurance back into the pool
   * vault (admin calls wrapper WithdrawInsurance directly first, then this
   * books admin-ATA -> pool-vault).
   */
  ReturnInsurance: 10,
  /** @deprecated Legacy alias for ReturnInsurance. */
  AdminWithdrawInsurance: 10,
  /** @deprecated Tombstoned in BOTH lineages (was an admin CPI proxy —
   *  SetInsurancePolicy). This tag rejects on-chain in the adopted lineage too. */
  AdminSetInsurancePolicy: 11,
  /** PERC-272: Accrue trading fees to LP vault. Unchanged vs deployed vault. */
  AccrueFees: 12,
  /** PERC-272: Init pool in trading LP mode. Unchanged vs deployed vault. */
  InitTradingPool: 13,
  /** PERC-313: Set HWM config (enable + floor bps). Unchanged vs deployed vault. */
  AdminSetHwmConfig: 14,
  /**
   * AdminSetTrancheConfig (tag 15) — enable/configure senior-junior LP
   * tranches. Sets `junior_fee_mult_bps`.
   *
   * BREAKING vs the deployed percolator-vault program: tag 15 there is
   * BindInsuranceAuthority (moved to tag 19 in the adopted lineage — see
   * below). Sending this payload against the DEPLOYED vault program would
   * execute BindInsuranceAuthority instead; only send it against the
   * ADOPTED percolator-stake lineage.
   *
   * Wire: tag(1) + junior_fee_mult_bps(u16) = 3 bytes.
   * Accounts: [admin(signer), poolPda(writable)]
   */
  AdminSetTrancheConfig: 15,
  /**
   * DepositJunior (tag 16) — deposit into the junior (first-loss) tranche.
   * Same account shape as Deposit (tag 1).
   *
   * BREAKING vs the deployed percolator-vault program: tag 16 is UNHANDLED
   * there (rejects). Live only on the adopted lineage.
   *
   * Wire: tag(1) + amount(u64) = 9 bytes.
   */
  DepositJunior: 16,
  /**
   * BindInsuranceAuthority (tag 19 / 0x13) — FIND-4 fix, MOVED from tag 15
   * (0x0F) in the deployed percolator-vault program.
   *
   * Binds the vault_auth PDA as BOTH the wrapper's asset-0 insurance_authority
   * AND insurance_operator via two CPIs to UpdateAssetAuthority (tag 65,
   * kind=1 INSURANCE then kind=2 INSURANCE_OPERATOR) — the adopted lineage
   * binds both in one call, unlike the deployed vault program which only
   * bound insurance_authority. The human admin signs the outer tx as the
   * current authority/operator; vault_auth signs via invoke_signed.
   *
   * Wire: tag(1) = 0x13 — no payload beyond the tag byte.
   * Accounts: [admin(signer), poolPda, vaultAuth, slab(writable), percolatorProgram]
   */
  BindInsuranceAuthority: 19,
  /**
   * RotateInsuranceAuthority (tag 20) — admin-gated migration/incident
   * escape that moves the market's `insurance_authority` OFF our vault_auth
   * PDA to an admin-specified `newTarget`. The PDA signs as the CURRENT
   * authority (invoke_signed); newTarget co-signs the outer tx as the NEW
   * authority. NEW in the adopted lineage — no equivalent in the deployed
   * percolator-vault program (which has no un-bind escape at all).
   *
   * Wire: tag(1) — no payload.
   * Accounts: [admin(signer), poolPda, vaultAuth, newTarget(signer), slab(writable), percolatorProgram]
   */
  RotateInsuranceAuthority: 20,
  /**
   * BurnAssetAdmin (tag 21) — IRREVERSIBLE removal of the admin's rotate-back
   * capability. CPIs UpdateAssetAuthority(kind=0 ASSET_ADMIN, new_pubkey=[0;32]).
   * After this, no key can rotate ANY per-asset authority back to an
   * admin-controlled key. Call ONCE per market, only after BindInsuranceAuthority
   * has completed. NEW in the adopted lineage.
   *
   * Wire: tag(1) — no payload.
   * Accounts: [admin(signer, writable), poolPda(writable), vaultAuth(placeholder), slab(writable), percolatorProgram]
   */
  BurnAssetAdmin: 21,
  /**
   * RotateInsuranceOperator (tag 22) — analogous to RotateInsuranceAuthority
   * (tag 20) but for `insurance_operator` (kind=2). Part of the no-lockout
   * migration sequence before a final BurnAssetAdmin. NEW in the adopted
   * lineage.
   *
   * Wire: tag(1) — no payload.
   * Accounts: [admin(signer), poolPda, vaultAuth, newTarget(signer), slab(writable), percolatorProgram]
   */
  RotateInsuranceOperator: 22,
  /**
   * RecoverFlushedInsurance (tag 23) — PERMISSIONLESS recovery of tokens from
   * the wrapper's insurance fund back into the stake pool vault, via a CPI to
   * wrapper tag 57 `WithdrawInsuranceAsset` (gated on insurance_operator ==
   * vault_auth PDA). Survives BurnAssetAdmin because tag 57 gates on
   * insurance_operator, not asset_admin. `amount` capped to
   * `total_flushed - total_returned`; funds can only land in `pool.vault`.
   * NEW in the adopted lineage.
   *
   * Wire: tag(1) + amount(u64) = 9 bytes.
   * Accounts: [caller(no signer check), poolPda(writable), poolVault(writable),
   *   vaultAuth, wrapperMarket(writable), wrapperVault(writable), wrapperVaultAuth,
   *   tokenProgram, percolatorProgram]
   */
  RecoverFlushedInsurance: 23,
  /**
   * AdminResolveMarketCpi (tag 24) — CPI proxy for the wrapper's ResolveMarket
   * (wrapper tag 19). InitPool rotates `cfg.marketauth` to this pool's PDA, so
   * only a CPI signed by that PDA can ever call the wrapper's ResolveMarket;
   * without this proxy every stake-initialized market would be permanently
   * stuck in Live mode. The pool PDA signs the wrapper CPI via
   * `invoke_signed`; no local stake-side state is mutated (SetMarketResolved,
   * tag 18, remains the separate, explicit local bookkeeping step). NEW in
   * percolator-stake (see src/instruction.rs / src/processor.rs
   * `process_admin_resolve_market`, tag 24).
   *
   * NOTE on the name: the on-chain enum variant is literally
   * `AdminResolveMarket` (matching the DEPRECATED tag-9 name from the OLD
   * percolator-vault lineage, see `AdminResolveMarket: 9` above / its throwing
   * `encodeStakeAdminResolveMarket()` alias). This key is suffixed `Cpi` to
   * avoid re-using that already-claimed object key/export name — the tag-9
   * alias and this tag-24 instruction are unrelated aside from sharing an
   * on-chain name across two different lineages.
   *
   * Wire: tag(1) = 24 — no payload beyond the tag byte.
   * Accounts: [admin(signer), poolPda, slab(writable), percolatorProgram]
   */
  AdminResolveMarketCpi: 24,
  /**
   * SetMarketResolved (tag 18) — admin marks the pool as market-resolved
   * (blocks new deposits). Call after resolving the market on the wrapper
   * directly.
   *
   * BREAKING vs the deployed percolator-vault program: tag 18 is UNHANDLED
   * there (rejects). Live only on the adopted lineage.
   *
   * Wire: tag(1) — no payload.
   * Accounts: [admin(signer), poolPda(writable)]
   */
  SetMarketResolved: 18,
  /**
   * AdminUpdateFeeSplit (tag 25) — CPI proxy for the wrapper's UpdateFeeSplit
   * (wrapper tag 86). GROUP A: the wrapper gate is `cfg.marketauth`, which
   * `StakeInitPool` irreversibly rotates to the pool PDA, so the pool PDA
   * signs the CPI via invoke_signed.
   *
   * Wire: tag(1) + creator_share_bps(u16) + lp_share_bps(u16) +
   * insurance_share_bps(u16) = 7 bytes.
   * Accounts: [admin(signer), poolPda, slab(writable), percolatorProgram]
   *
   * Share validation is the WRAPPER's (`policy_v16::validate_fee_split`) and is
   * deliberately not duplicated stake-side — a bad split surfaces as wrapper
   * Custom(52)/Custom(51) through the CPI.
   */
  AdminUpdateFeeSplit: 25,
  /**
   * AdminUpdateMaintenanceFeePerSlot (tag 26) — CPI proxy for the wrapper's
   * UpdateMaintenanceFeePerSlot (wrapper tag 88). GROUP A, same accounts and
   * signer model as tag 25.
   *
   * Wire: tag(1) + maintenance_fee_per_slot(u128) = 17 bytes.
   * Accounts: [admin(signer), poolPda, slab(writable), percolatorProgram]
   *
   * ⚠ THE PAYLOAD IS u128, NOT u64 — the stake program itself rejects a
   * payload whose `rest.len() != 16`, and the wrapper decodes tag 88 with
   * `read_u128`.
   */
  AdminUpdateMaintenanceFeePerSlot: 26,
  /**
   * AdminUpdateBackingFeePolicy (tag 27) — CPI proxy for the wrapper's
   * UpdateBackingFeePolicy (wrapper tag 51). GROUP B: the wrapper gate is
   * ASSET 0's `insurance_authority`, which `BindInsuranceAuthority` moves to
   * the `vault_auth` PDA, so `vault_auth` (not the pool PDA) signs the CPI.
   *
   * THE FEE-SPLIT UNBLOCKER: wrapper tag 51 is the setter for
   * `backing_trade_fee_bps`. Once bound, this CPI is the only way to reach it.
   *
   * Wire: tag(1) + domain(u16) + fee_bps(u16) + insurance_share_bps(u16) = 7 bytes.
   * Accounts: [admin(signer), poolPda, vaultAuth, slab(writable), percolatorProgram]
   */
  AdminUpdateBackingFeePolicy: 27,
  /**
   * AdminUpdateTradeFeePolicy (tag 28) — CPI proxy for the wrapper's
   * UpdateTradeFeePolicy (wrapper tag 55). GROUP B, same accounts and signer
   * model as tag 27.
   *
   * Wire: tag(1) + trade_fee_base_bps(u64) = 9 bytes.
   * Accounts: [admin(signer), poolPda, vaultAuth, slab(writable), percolatorProgram]
   *
   * ⚠ Note the type asymmetry with tag 26: wrapper tag 55 decodes with
   * `read_u64`, wrapper tag 88 with `read_u128`.
   */
  AdminUpdateTradeFeePolicy: 28,
  /**
   * RecoverTerminalInsurance (F-9, percolator-stake #301 `d13b5a9`). PERMISSIONLESS:
   * returns a stake-bound market's insurance budget to stakers once the wrapper
   * market is Resolved (or a CloseSlab tombstone). CPIs wrapper tag 41 with
   * `vault_auth` as authority and `pool.vault` as the only destination, sweeps an
   * optional stray `vault_auth`-owned token account, and books the vault surplus.
   *
   * Wire: tag(1) + amount(u64) = 9 bytes. `amount` = 0 books/sweeps only (also
   * valid after CloseSlab). Accounts: {@link recoverTerminalInsuranceAccounts}.
   * Errors: 30 MarketNotTerminal, 31 NothingToRecover (treat as done), wrapper 21
   * (over capacity / cooldown / portfolios remain — retry later), 15 CpiFailed,
   * 32 UnsupportedWrapperLayout (non-retryable). Relaunch stake: F-9 head `d13b5a9`.
   */
  RecoverTerminalInsurance: 29,
  /**
   * AdminCloseSlab (F-9). `pool.admin`-signed CPI proxy for the wrapper's
   * CloseSlab (tag 13); the pool PDA is the marketauth and signs. The sweep
   * lands in a pool-PDA-owned token account (index 5, the caller creates it)
   * and is booked into `pool.vault`; the rent refund goes to the admin. Requires
   * a Resolved market (30 MarketNotTerminal). On a P1 wrapper it may return Ok
   * WITHOUT closing — repeat until the market is a tombstone.
   *
   * Wire: tag(1) = 1 byte. Accounts: {@link adminCloseSlabAccounts}. Also returns
   * 32 UnsupportedWrapperLayout (non-retryable). Relaunch stake: F-9 head `d13b5a9`.
   */
  AdminCloseSlab: 30
};
Object.freeze(STAKE_IX);
const STAKE_ERRORS = {
  0: "Pool already initialized \u2014 use a different slab address or check if InitPool was already called",
  1: "Pool not initialized \u2014 call InitPool first to create the stake pool",
  2: "Unauthorized \u2014 you must be the pool admin to perform this action",
  3: "Cooldown not elapsed \u2014 wait for the cooldown period before withdrawing again",
  4: "Insufficient LP tokens \u2014 you don't have enough LP tokens to burn",
  5: "Zero amount \u2014 deposit and withdrawal amounts must be greater than zero",
  6: "Arithmetic overflow \u2014 pool values exceeded u64 bounds, operation blocked",
  7: "Invalid mint \u2014 LP mint doesn't match the pool's LP mint",
  8: "Market is resolved \u2014 no new deposits allowed after resolution",
  9: "Deposit cap exceeded \u2014 pool has reached its maximum deposit limit",
  10: "Invalid PDA \u2014 account is not a valid PDA for the expected seed",
  11: "Deprecated (was AdminAlreadyTransferred) \u2014 code kept for stable numbering; should not occur",
  12: "Deprecated (was AdminNotTransferred) \u2014 code kept for stable numbering; should not occur",
  13: "Insufficient vault balance \u2014 vault doesn't have enough collateral for this withdrawal",
  14: "Invalid percolator program \u2014 percolator program ID doesn't match",
  15: "CPI to percolator failed \u2014 the cross-program invoke to percolator failed",
  16: "Invalid account \u2014 account is not owned by the expected program or is not writable",
  17: "Pool mode mismatch \u2014 operation not valid for this pool's mode (e.g., AccrueFees on insurance pool)",
  18: "Withdrawal blocked \u2014 would breach high-water mark floor protection",
  19: "Tranches not enabled \u2014 senior/junior tranches are not enabled on this pool",
  20: "Junior balance insufficient \u2014 junior tranche doesn't have enough balance for this operation",
  21: "Wrong tranche \u2014 deposit already belongs to a different tranche",
  22: "Zero shares minted \u2014 deposit amount too small to mint any LP at the current share price; increase the amount",
  23: "No pending admin \u2014 there is no admin transfer to accept (propose one first, or it was cancelled)",
  24: "Insurance loss outstanding \u2014 junior tranche deposits are paused until the flushed insurance is returned (total_flushed > total_returned)",
  25: "Cooldown increase requires timelock \u2014 a cooldown_slots INCREASE must go through ProposeCooldownIncrease -> wait -> CommitCooldownIncrease, not UpdateConfig (decreases are still immediate via UpdateConfig)",
  26: "Timelock not elapsed \u2014 CommitCooldownIncrease was called before the required timelock window had passed since ProposeCooldownIncrease; LP holders are still inside their exit window",
  27: "No pending cooldown proposal \u2014 CommitCooldownIncrease / CancelCooldownIncrease called with no active ProposeCooldownIncrease proposal outstanding",
  28: "Deposit below minimum liquidity \u2014 the pool's first-ever deposit must exceed MINIMUM_LIQUIDITY so a permanent dead-share floor can be locked (N7 anti-inflation hardening); deposit a larger amount",
  29: "No real LP holders \u2014 AccrueFees refused because the pool's LP supply is only the N7 MINIMUM_LIQUIDITY dead-share floor (total_lp_supply <= MINIMUM_LIQUIDITY). Fees booked now would belong to shares nobody can redeem; nothing is booked and the fee tokens stay in the vault until the first accrual after a real staker deposits (F3 dead-share guard, percolator-stake feat/p1-stake-f3-dead-share-guard).",
  30: "Market not terminal (F-9) \u2014 RecoverTerminalInsurance (tag 29) needs the wrapper market Resolved or a CloseSlab tombstone, and a non-zero amount needs Resolved (not Closed); AdminCloseSlab (tag 30) needs Resolved. While Live, use RecoverFlushedInsurance (tag 23)",
  32: "Unsupported wrapper layout (F-9, NOT retryable) \u2014 the bound wrapper market account is not the layout this stake program pins (magic, VERSION 18, kind, minimum length, a known mode byte), so its engine mode cannot be trusted. RecoverTerminalInsurance (29), AdminCloseSlab (30) and the mode-0 Deposit/DepositJunior path refuse. A wrapper layout bump needs a coordinated stake upgrade; retrying will not help",
  31: "Nothing to recover (F-9) \u2014 RecoverTerminalInsurance moved no tokens and booked nothing (amount 0, no stray account, no unbooked vault surplus). Keepers should treat this as done"
};
Object.freeze(STAKE_ERRORS);
const TEXT = new TextEncoder();
function deriveStakePool(slab, programId) {
  return PublicKey.findProgramAddressSync(
    [TEXT.encode("stake_pool"), slab.toBytes()],
    programId ?? getStakeProgramId()
  );
}
function deriveStakeVaultAuth(pool, programId) {
  return PublicKey.findProgramAddressSync(
    [TEXT.encode("vault_auth"), pool.toBytes()],
    programId ?? getStakeProgramId()
  );
}
function deriveDepositPda(pool, user, programId) {
  return PublicKey.findProgramAddressSync(
    [TEXT.encode("stake_deposit"), pool.toBytes(), user.toBytes()],
    programId ?? getStakeProgramId()
  );
}
function readU64LE(data, off) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getBigUint64(
    off,
    /* littleEndian= */
    true
  );
}
function readU16LE(data, off) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getUint16(
    off,
    /* littleEndian= */
    true
  );
}
function requireDiscriminator(accountName, data, offset, expected) {
  for (let i = 0; i < expected.length; i += 1) {
    if (data[offset + i] !== expected[i]) {
      throw new Error(`${accountName} invalid discriminator`);
    }
  }
}
function u64Le(v) {
  if (typeof v === "number" && !Number.isSafeInteger(v)) {
    throw new Error(`u64Le: number ${v} exceeds Number.MAX_SAFE_INTEGER \u2014 use BigInt`);
  }
  const big = BigInt(v);
  if (big < 0n) throw new Error(`u64Le: value must be non-negative, got ${big}`);
  if (big > 0xFFFFFFFFFFFFFFFFn) throw new Error(`u64Le: value exceeds u64 max`);
  const arr = new Uint8Array(8);
  new DataView(arr.buffer).setBigUint64(0, big, true);
  return arr;
}
function u128Le(v) {
  if (typeof v === "number" && !Number.isSafeInteger(v)) {
    throw new Error(`u128Le: number ${v} exceeds Number.MAX_SAFE_INTEGER \u2014 use BigInt`);
  }
  const big = BigInt(v);
  if (big < 0n) throw new Error(`u128Le: value must be non-negative, got ${big}`);
  if (big > (1n << 128n) - 1n) throw new Error(`u128Le: value exceeds u128 max`);
  const arr = new Uint8Array(16);
  const view = new DataView(arr.buffer);
  view.setBigUint64(0, big & 0xFFFFFFFFFFFFFFFFn, true);
  view.setBigUint64(8, big >> 64n, true);
  return arr;
}
function u16Le(v) {
  if (!Number.isInteger(v) || v < 0 || v > 65535) throw new Error(`u16Le: value out of u16 range (0..65535), got ${v}`);
  const arr = new Uint8Array(2);
  new DataView(arr.buffer).setUint16(0, v, true);
  return arr;
}
function encodeStakeInitPool(cooldownSlots, depositCap) {
  return concatBytes(
    new Uint8Array([STAKE_IX.InitPool]),
    u64Le(cooldownSlots),
    u64Le(depositCap)
  );
}
function encodeStakeDeposit(amount) {
  return concatBytes(new Uint8Array([STAKE_IX.Deposit]), u64Le(amount));
}
function encodeStakeWithdraw(lpAmount) {
  return concatBytes(new Uint8Array([STAKE_IX.Withdraw]), u64Le(lpAmount));
}
function encodeStakeFlushToInsurance(amount) {
  return concatBytes(new Uint8Array([STAKE_IX.FlushToInsurance]), u64Le(amount));
}
function encodeStakeUpdateConfig(newCooldownSlots, newDepositCap) {
  return concatBytes(
    new Uint8Array([STAKE_IX.UpdateConfig]),
    new Uint8Array([newCooldownSlots != null ? 1 : 0]),
    u64Le(newCooldownSlots ?? 0n),
    new Uint8Array([newDepositCap != null ? 1 : 0]),
    u64Le(newDepositCap ?? 0n)
  );
}
function removedStakeInstruction(name, tag) {
  throw new Error(
    `${name} (stake tag ${tag}) was removed on-chain in percolator-stake v3 and must not be sent.`
  );
}
function encodeStakeProposeAdmin(newAdmin) {
  return concatBytes(
    new Uint8Array([STAKE_IX.ProposeAdmin]),
    newAdmin.toBytes()
  );
}
function encodeStakeAcceptAdmin() {
  return new Uint8Array([STAKE_IX.AcceptAdmin]);
}
function encodeStakeProposeCooldownIncrease(newCooldownSlots) {
  return concatBytes(
    new Uint8Array([STAKE_IX.ProposeCooldownIncrease]),
    u64Le(newCooldownSlots)
  );
}
function encodeStakeCommitCooldownIncrease() {
  return new Uint8Array([STAKE_IX.CommitCooldownIncrease]);
}
function encodeStakeCancelCooldownIncrease() {
  return new Uint8Array([STAKE_IX.CancelCooldownIncrease]);
}
function encodeStakeTransferAdmin() {
  throw new Error(
    "encodeStakeTransferAdmin: tag 5 is ProposeAdmin (two-step rotation) in the adopted percolator-stake lineage \u2014 use encodeStakeProposeAdmin(newAdmin) + encodeStakeAcceptAdmin() instead."
  );
}
function encodeStakeAdminSetOracleAuthority(newAuthority) {
  void newAuthority;
  throw new Error(
    "encodeStakeAdminSetOracleAuthority: tag 6 is AcceptAdmin in the adopted percolator-stake lineage \u2014 use encodeStakeAcceptAdmin() instead."
  );
}
function encodeStakeAdminSetRiskThreshold(newThreshold) {
  void newThreshold;
  throw new Error(
    "encodeStakeAdminSetRiskThreshold: tag 7 is ProposeCooldownIncrease in the adopted percolator-stake lineage \u2014 use encodeStakeProposeCooldownIncrease(newCooldownSlots) instead."
  );
}
function encodeStakeAdminSetMaintenanceFee(newFee) {
  void newFee;
  throw new Error(
    "encodeStakeAdminSetMaintenanceFee: tag 8 is CommitCooldownIncrease in the adopted percolator-stake lineage \u2014 use encodeStakeCommitCooldownIncrease() instead."
  );
}
function encodeStakeAdminResolveMarket() {
  throw new Error(
    "encodeStakeAdminResolveMarket: tag 9 is CancelCooldownIncrease in the adopted percolator-stake lineage \u2014 use encodeStakeCancelCooldownIncrease() instead."
  );
}
function encodeStakeReturnInsurance(amount) {
  return concatBytes(
    new Uint8Array([STAKE_IX.ReturnInsurance]),
    u64Le(amount)
  );
}
function encodeStakeAdminWithdrawInsurance(amount) {
  return encodeStakeReturnInsurance(amount);
}
function encodeStakeAccrueFees() {
  return new Uint8Array([STAKE_IX.AccrueFees]);
}
function encodeStakeInitTradingPool(cooldownSlots, depositCap) {
  return concatBytes(
    new Uint8Array([STAKE_IX.InitTradingPool]),
    u64Le(cooldownSlots),
    u64Le(depositCap)
  );
}
function encodeStakeAdminSetHwmConfig(enabled, hwmFloorBps) {
  return concatBytes(
    new Uint8Array([STAKE_IX.AdminSetHwmConfig]),
    new Uint8Array([enabled ? 1 : 0]),
    u16Le(hwmFloorBps)
  );
}
function encodeStakeAdminSetTrancheConfig(juniorFeeMultBps) {
  return concatBytes(
    new Uint8Array([STAKE_IX.AdminSetTrancheConfig]),
    u16Le(juniorFeeMultBps)
  );
}
function encodeStakeDepositJunior(amount) {
  return concatBytes(new Uint8Array([STAKE_IX.DepositJunior]), u64Le(amount));
}
function encodeStakeSetMarketResolved() {
  return new Uint8Array([STAKE_IX.SetMarketResolved]);
}
function encodeStakeBindInsuranceAuthority() {
  return new Uint8Array([STAKE_IX.BindInsuranceAuthority]);
}
function bindInsuranceAuthorityAccounts(a) {
  return [
    { pubkey: a.admin, isSigner: true, isWritable: false },
    { pubkey: a.poolPda, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.slab, isSigner: false, isWritable: true },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false }
  ];
}
function encodeStakeRotateInsuranceAuthority() {
  return new Uint8Array([STAKE_IX.RotateInsuranceAuthority]);
}
function encodeStakeRotateInsuranceOperator() {
  return new Uint8Array([STAKE_IX.RotateInsuranceOperator]);
}
function rotateInsuranceAccounts(a) {
  return [
    { pubkey: a.admin, isSigner: true, isWritable: false },
    { pubkey: a.poolPda, isSigner: false, isWritable: false },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.newTarget, isSigner: true, isWritable: false },
    { pubkey: a.slab, isSigner: false, isWritable: true },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false }
  ];
}
function encodeStakeBurnAssetAdmin() {
  return new Uint8Array([STAKE_IX.BurnAssetAdmin]);
}
function burnAssetAdminAccounts(a) {
  return [
    { pubkey: a.admin, isSigner: true, isWritable: true },
    { pubkey: a.poolPda, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.slab, isSigner: false, isWritable: true },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false }
  ];
}
function encodeStakeRecoverFlushedInsurance(amount) {
  return concatBytes(
    new Uint8Array([STAKE_IX.RecoverFlushedInsurance]),
    u64Le(amount)
  );
}
function recoverFlushedInsuranceAccounts(a) {
  return [
    { pubkey: a.caller, isSigner: false, isWritable: false },
    { pubkey: a.poolPda, isSigner: false, isWritable: true },
    { pubkey: a.poolVault, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.wrapperMarket, isSigner: false, isWritable: true },
    { pubkey: a.wrapperVault, isSigner: false, isWritable: true },
    { pubkey: a.wrapperVaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.tokenProgram, isSigner: false, isWritable: false },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false }
  ];
}
function encodeStakeAdminResolveMarketCpi() {
  return new Uint8Array([STAKE_IX.AdminResolveMarketCpi]);
}
function adminResolveMarketCpiAccounts(a) {
  return [
    { pubkey: a.admin, isSigner: true, isWritable: false },
    { pubkey: a.poolPda, isSigner: false, isWritable: false },
    { pubkey: a.slab, isSigner: false, isWritable: true },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false }
  ];
}
function encodeStakeAdminUpdateFeeSplit(creatorShareBps, lpShareBps, insuranceShareBps) {
  return concatBytes(
    new Uint8Array([STAKE_IX.AdminUpdateFeeSplit]),
    u16Le(creatorShareBps),
    u16Le(lpShareBps),
    u16Le(insuranceShareBps)
  );
}
function encodeStakeAdminUpdateMaintenanceFeePerSlot(maintenanceFeePerSlot) {
  return concatBytes(
    new Uint8Array([STAKE_IX.AdminUpdateMaintenanceFeePerSlot]),
    u128Le(maintenanceFeePerSlot)
  );
}
function encodeStakeAdminUpdateBackingFeePolicy(domain, feeBps, insuranceShareBps) {
  return concatBytes(
    new Uint8Array([STAKE_IX.AdminUpdateBackingFeePolicy]),
    u16Le(domain),
    u16Le(feeBps),
    u16Le(insuranceShareBps)
  );
}
function encodeStakeAdminUpdateTradeFeePolicy(tradeFeeBaseBps) {
  return concatBytes(
    new Uint8Array([STAKE_IX.AdminUpdateTradeFeePolicy]),
    u64Le(tradeFeeBaseBps)
  );
}
function stakeGroupAProxyAccounts(a) {
  return [
    { pubkey: a.admin, isSigner: true, isWritable: false },
    { pubkey: a.poolPda, isSigner: false, isWritable: false },
    { pubkey: a.slab, isSigner: false, isWritable: true },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false }
  ];
}
const adminUpdateFeeSplitAccounts = stakeGroupAProxyAccounts;
const adminUpdateMaintenanceFeePerSlotAccounts = stakeGroupAProxyAccounts;
function stakeGroupBProxyAccounts(a) {
  return [
    { pubkey: a.admin, isSigner: true, isWritable: false },
    { pubkey: a.poolPda, isSigner: false, isWritable: false },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.slab, isSigner: false, isWritable: true },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false }
  ];
}
const adminUpdateBackingFeePolicyAccounts = stakeGroupBProxyAccounts;
const adminUpdateTradeFeePolicyAccounts = stakeGroupBProxyAccounts;
function encodeStakeAdminSetInsurancePolicy(authority, minWithdrawBase, maxWithdrawBps, cooldownSlots) {
  void authority;
  void minWithdrawBase;
  void maxWithdrawBps;
  void cooldownSlots;
  return removedStakeInstruction("encodeStakeAdminSetInsurancePolicy", STAKE_IX.AdminSetInsurancePolicy);
}
const STAKE_POOL_SIZE_V1 = 352;
const STAKE_POOL_SIZE_V2 = 384;
const STAKE_POOL_SIZE_V3 = 392;
const STAKE_POOL_SIZE_V4 = 408;
const STAKE_POOL_SIZE = STAKE_POOL_SIZE_V4;
const STAKE_POOL_DISCRIMINATOR = new Uint8Array([83, 80, 79, 79, 76, 95, 86, 49]);
const STAKE_POOL_CURRENT_VERSION = 4;
function decodeStakePool(data) {
  const isV4 = data.length >= STAKE_POOL_SIZE_V4;
  const isV3 = !isV4 && data.length >= STAKE_POOL_SIZE_V3;
  const isV2 = !isV4 && !isV3 && data.length >= STAKE_POOL_SIZE_V2;
  const isV1 = !isV4 && !isV3 && !isV2 && data.length >= STAKE_POOL_SIZE_V1;
  if (!isV4 && !isV3 && !isV2 && !isV1) {
    throw new Error(`StakePool data too short: ${data.length} < ${STAKE_POOL_SIZE_V1}`);
  }
  const reservedOffset = isV1 ? 288 : 320;
  requireDiscriminator("StakePool", data, reservedOffset, STAKE_POOL_DISCRIMINATOR);
  const version = data[reservedOffset + 8];
  const expectedVersion = isV4 ? 4 : isV3 ? 3 : isV2 ? 2 : 1;
  if (version !== expectedVersion) {
    throw new Error(`StakePool unsupported version: ${version} !== ${expectedVersion}`);
  }
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let off = 0;
  const isInitialized = bytes[off] === 1;
  off += 1;
  const bump = bytes[off];
  off += 1;
  const vaultAuthorityBump = bytes[off];
  off += 1;
  const adminTransferred = bytes[off] === 1;
  off += 1;
  off += 4;
  const slab = new PublicKey(bytes.subarray(off, off + 32));
  off += 32;
  const admin = new PublicKey(bytes.subarray(off, off + 32));
  off += 32;
  const collateralMint = new PublicKey(bytes.subarray(off, off + 32));
  off += 32;
  const lpMint = new PublicKey(bytes.subarray(off, off + 32));
  off += 32;
  const vault = new PublicKey(bytes.subarray(off, off + 32));
  off += 32;
  const totalDeposited = readU64LE(bytes, off);
  off += 8;
  const totalLpSupply = readU64LE(bytes, off);
  off += 8;
  const cooldownSlots = readU64LE(bytes, off);
  off += 8;
  const depositCap = readU64LE(bytes, off);
  off += 8;
  const totalFlushed = readU64LE(bytes, off);
  off += 8;
  const totalReturned = readU64LE(bytes, off);
  off += 8;
  const totalWithdrawn = readU64LE(bytes, off);
  off += 8;
  const percolatorProgram = new PublicKey(bytes.subarray(off, off + 32));
  off += 32;
  const totalFeesEarned = readU64LE(bytes, off);
  off += 8;
  const lastFeeAccrualSlot = readU64LE(bytes, off);
  off += 8;
  const lastVaultSnapshot = readU64LE(bytes, off);
  off += 8;
  const poolMode = bytes[off];
  off += 1;
  off += 7;
  let pendingAdmin = null;
  if (isV2 || isV3 || isV4) {
    const pendingAdminBytes = bytes.subarray(off, off + 32);
    off += 32;
    pendingAdmin = pendingAdminBytes.every((b) => b === 0) ? null : new PublicKey(pendingAdminBytes);
  }
  const reservedStart = off;
  const marketResolved = bytes[reservedStart + 9] === 1;
  const hwmEnabled = bytes[reservedStart + 10] === 1;
  const hwmFloorBps = readU16LE(bytes, reservedStart + 11);
  const epochHighWaterTvl = readU64LE(bytes, reservedStart + 16);
  const hwmLastEpoch = readU64LE(bytes, reservedStart + 24);
  const trancheEnabled = bytes[reservedStart + 32] === 1;
  const juniorBalance = readU64LE(bytes, reservedStart + 33);
  const juniorTotalLp = readU64LE(bytes, reservedStart + 41);
  const juniorFeeMultBps = readU16LE(bytes, reservedStart + 49);
  const pendingCooldownSlots = isV4 ? readU64LE(bytes, reservedStart + 72) : readU64LE(bytes, reservedStart + 10);
  const cooldownProposedAtSlot = isV4 ? readU64LE(bytes, reservedStart + 80) : readU64LE(bytes, reservedStart + 18);
  const realizedJuniorLoss = readU64LE(bytes, reservedStart + 51);
  const assetAdminBurned = bytes[reservedStart + 59] === 1;
  const feeAttributionArmed = bytes[reservedStart + 60] === 1;
  const totalRecoveredFromWrapper = isV4 || isV3 ? readU64LE(bytes, reservedStart + 64) : null;
  return {
    version,
    isInitialized,
    bump,
    vaultAuthorityBump,
    adminTransferred,
    marketResolved,
    slab,
    admin,
    collateralMint,
    lpMint,
    vault,
    totalDeposited,
    totalLpSupply,
    cooldownSlots,
    depositCap,
    totalFlushed,
    totalReturned,
    totalWithdrawn,
    percolatorProgram,
    pendingAdmin,
    totalFeesEarned,
    lastFeeAccrualSlot,
    lastVaultSnapshot,
    mode0FeesAttributed: lastVaultSnapshot,
    feeAttributionArmed,
    poolMode,
    hwmEnabled,
    epochHighWaterTvl,
    hwmFloorBps,
    hwmLastEpoch,
    trancheEnabled,
    juniorBalance,
    juniorTotalLp,
    juniorFeeMultBps,
    pendingCooldownSlots,
    cooldownProposedAtSlot,
    realizedJuniorLoss,
    assetAdminBurned,
    totalRecoveredFromWrapper
  };
}
const STAKE_DEPOSIT_SIZE = 152;
const STAKE_DEPOSIT_DISCRIMINATOR = new Uint8Array([83, 68, 69, 80, 95, 86, 49, 0]);
const STAKE_DEPOSIT_RESERVED_OFFSET = 88;
function decodeDepositPda(data) {
  if (data.length < STAKE_DEPOSIT_SIZE) {
    throw new Error(`StakeDeposit data too short: ${data.length} < ${STAKE_DEPOSIT_SIZE}`);
  }
  requireDiscriminator("StakeDeposit", data, STAKE_DEPOSIT_RESERVED_OFFSET, STAKE_DEPOSIT_DISCRIMINATOR);
  return {
    isInitialized: data[0] === 1,
    bump: data[1],
    pool: new PublicKey(data.subarray(8, 40)),
    user: new PublicKey(data.subarray(40, 72)),
    lastDepositSlot: readU64LE(data, 72),
    lpAmount: readU64LE(data, 80)
  };
}
function initPoolAccounts(a, tokenProgramId = TOKEN_PROGRAM_ID) {
  return [
    { pubkey: a.admin, isSigner: true, isWritable: true },
    { pubkey: a.slab, isSigner: false, isWritable: true },
    // writable: InitPool CPIs UpdateAuthority which writes the slab
    { pubkey: a.pool, isSigner: false, isWritable: true },
    { pubkey: a.lpMint, isSigner: false, isWritable: true },
    { pubkey: a.vault, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.collateralMint, isSigner: false, isWritable: false },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false },
    { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }
  ];
}
function depositAccounts(a, tokenProgramId = TOKEN_PROGRAM_ID) {
  return [
    { pubkey: a.user, isSigner: true, isWritable: false },
    { pubkey: a.pool, isSigner: false, isWritable: true },
    { pubkey: a.userCollateralAta, isSigner: false, isWritable: true },
    { pubkey: a.vault, isSigner: false, isWritable: true },
    { pubkey: a.lpMint, isSigner: false, isWritable: true },
    { pubkey: a.userLpAta, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.depositPda, isSigner: false, isWritable: true },
    { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: a.slab, isSigner: false, isWritable: false }
  ];
}
function depositJuniorAccounts(a, tokenProgramId = TOKEN_PROGRAM_ID) {
  return depositAccounts(a, tokenProgramId);
}
function withdrawAccounts(a, tokenProgramId = TOKEN_PROGRAM_ID) {
  return [
    { pubkey: a.user, isSigner: true, isWritable: false },
    { pubkey: a.pool, isSigner: false, isWritable: true },
    { pubkey: a.userLpAta, isSigner: false, isWritable: true },
    { pubkey: a.lpMint, isSigner: false, isWritable: true },
    { pubkey: a.vault, isSigner: false, isWritable: true },
    { pubkey: a.userCollateralAta, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.depositPda, isSigner: false, isWritable: true },
    { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    ...a.slab ? [{ pubkey: a.slab, isSigner: false, isWritable: false }] : []
  ];
}
function accrueFeesAccounts(a) {
  return [
    { pubkey: a.caller, isSigner: true, isWritable: false },
    { pubkey: a.pool, isSigner: false, isWritable: true },
    { pubkey: a.vault, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: a.slab, isSigner: false, isWritable: false }
  ];
}
function flushToInsuranceAccounts(a, tokenProgramId = TOKEN_PROGRAM_ID) {
  return [
    { pubkey: a.caller, isSigner: true, isWritable: false },
    { pubkey: a.pool, isSigner: false, isWritable: true },
    { pubkey: a.vault, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.slab, isSigner: false, isWritable: true },
    { pubkey: a.wrapperVault, isSigner: false, isWritable: true },
    { pubkey: a.percolatorProgram, isSigner: false, isWritable: false },
    { pubkey: tokenProgramId, isSigner: false, isWritable: false }
  ];
}
function encodeStakeRecoverTerminalInsurance(amount) {
  return concatBytes(new Uint8Array([STAKE_IX.RecoverTerminalInsurance]), u64Le(amount));
}
function encodeStakeAdminCloseSlab() {
  return new Uint8Array([STAKE_IX.AdminCloseSlab]);
}
function recoverTerminalInsuranceAccounts(a) {
  return [
    { pubkey: a.caller, isSigner: false, isWritable: false },
    { pubkey: a.pool, isSigner: false, isWritable: true },
    { pubkey: a.poolVault, isSigner: false, isWritable: true },
    { pubkey: a.vaultAuth, isSigner: false, isWritable: false },
    { pubkey: a.market, isSigner: false, isWritable: true },
    { pubkey: a.wrapperVault, isSigner: false, isWritable: true },
    { pubkey: a.wrapperVaultAuthority, isSigner: false, isWritable: false },
    { pubkey: a.tokenProgram ?? TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: a.wrapperProgram, isSigner: false, isWritable: false },
    ...a.stray ? [{ pubkey: a.stray, isSigner: false, isWritable: true }] : []
  ];
}
function adminCloseSlabAccounts(a) {
  return [
    { pubkey: a.admin, isSigner: true, isWritable: true },
    { pubkey: a.pool, isSigner: false, isWritable: true },
    { pubkey: a.market, isSigner: false, isWritable: true },
    { pubkey: a.wrapperVault, isSigner: false, isWritable: true },
    { pubkey: a.wrapperVaultAuthority, isSigner: false, isWritable: false },
    { pubkey: a.poolDestToken, isSigner: false, isWritable: true },
    { pubkey: a.tokenProgram ?? TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: a.collateralMint, isSigner: false, isWritable: true },
    { pubkey: a.poolVault, isSigner: false, isWritable: true },
    { pubkey: a.wrapperProgram, isSigner: false, isWritable: false }
  ];
}
export {
  STAKE_DEPOSIT_DISCRIMINATOR,
  STAKE_DEPOSIT_SIZE,
  STAKE_ERRORS,
  STAKE_IX,
  STAKE_POOL_CURRENT_VERSION,
  STAKE_POOL_DISCRIMINATOR,
  STAKE_POOL_SIZE,
  STAKE_POOL_SIZE_V1,
  STAKE_POOL_SIZE_V2,
  STAKE_POOL_SIZE_V3,
  STAKE_POOL_SIZE_V4,
  STAKE_PROGRAM_ID,
  STAKE_PROGRAM_IDS,
  TOKEN_2022_PROGRAM_ID,
  accrueFeesAccounts,
  adminCloseSlabAccounts,
  adminResolveMarketCpiAccounts,
  adminUpdateBackingFeePolicyAccounts,
  adminUpdateFeeSplitAccounts,
  adminUpdateMaintenanceFeePerSlotAccounts,
  adminUpdateTradeFeePolicyAccounts,
  bindInsuranceAuthorityAccounts,
  burnAssetAdminAccounts,
  decodeDepositPda,
  decodeStakePool,
  depositAccounts,
  depositJuniorAccounts,
  deriveDepositPda,
  deriveStakePool,
  deriveStakeVaultAuth,
  encodeStakeAcceptAdmin,
  encodeStakeAccrueFees,
  encodeStakeAdminCloseSlab,
  encodeStakeAdminResolveMarket,
  encodeStakeAdminResolveMarketCpi,
  encodeStakeAdminSetHwmConfig,
  encodeStakeAdminSetInsurancePolicy,
  encodeStakeAdminSetMaintenanceFee,
  encodeStakeAdminSetOracleAuthority,
  encodeStakeAdminSetRiskThreshold,
  encodeStakeAdminSetTrancheConfig,
  encodeStakeAdminUpdateBackingFeePolicy,
  encodeStakeAdminUpdateFeeSplit,
  encodeStakeAdminUpdateMaintenanceFeePerSlot,
  encodeStakeAdminUpdateTradeFeePolicy,
  encodeStakeAdminWithdrawInsurance,
  encodeStakeBindInsuranceAuthority,
  encodeStakeBurnAssetAdmin,
  encodeStakeCancelCooldownIncrease,
  encodeStakeCommitCooldownIncrease,
  encodeStakeDeposit,
  encodeStakeDepositJunior,
  encodeStakeFlushToInsurance,
  encodeStakeInitPool,
  encodeStakeInitTradingPool,
  encodeStakeProposeAdmin,
  encodeStakeProposeCooldownIncrease,
  encodeStakeRecoverFlushedInsurance,
  encodeStakeRecoverTerminalInsurance,
  encodeStakeReturnInsurance,
  encodeStakeRotateInsuranceAuthority,
  encodeStakeRotateInsuranceOperator,
  encodeStakeSetMarketResolved,
  encodeStakeTransferAdmin,
  encodeStakeUpdateConfig,
  encodeStakeWithdraw,
  flushToInsuranceAccounts,
  getStakeProgramId,
  initPoolAccounts,
  recoverFlushedInsuranceAccounts,
  recoverTerminalInsuranceAccounts,
  rotateInsuranceAccounts,
  stakeGroupAProxyAccounts,
  stakeGroupBProxyAccounts,
  withdrawAccounts
};
//# sourceMappingURL=stake.js.map