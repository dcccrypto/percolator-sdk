import { PublicKey } from "@solana/web3.js";
/**
 * Derive vault authority PDA.
 * Seeds: ["vault", slab_key]
 *
 * Mirrors `derive_vault_authority(program_id, market_key)` in
 * `percolator-prog/src/v16_program.rs:17339-17341`.
 */
export declare function deriveVaultAuthority(programId: PublicKey, slab: PublicKey): [PublicKey, number];
/**
 * SPL Associated Token Account program.
 *
 * Mirrors `ASSOCIATED_TOKEN_PROGRAM_ID` in `v16_program.rs:17400-17401`, which the
 * wrapper declares locally for exactly one purpose: deriving the canonical vault.
 */
export declare const ASSOCIATED_TOKEN_PROGRAM_ID: PublicKey;
/**
 * The legacy SPL Token program — the ONLY token program the v17 wrapper accepts.
 *
 * This is not a default that a Token-2022 mint can override. `verify_token_program`
 * (`v16_program.rs:17436-17441`) rejects any `token_program` account whose key is not
 * `spl_token::ID`, and `unpack_token_account` (`17443-17455`) rejects any token account
 * not *owned* by `spl_token::ID`. Token-2022 collateral is unusable end to end, so the
 * ATA's middle seed is always this program id.
 */
export declare const PERCOLATOR_VAULT_TOKEN_PROGRAM_ID: PublicKey;
/**
 * Derive the CANONICAL vault token account for a market + collateral mint.
 *
 * The vault is the Associated Token Account of the market's `vault_authority` PDA:
 *
 * ```text
 * vault_authority = PDA(["vault", market],                          wrapperProgramId)
 * vault           = PDA([vault_authority, SPL_TOKEN_ID, mint],      ATA_PROGRAM_ID)
 * ```
 *
 * Mirrors `canonical_vault_address(vault_authority, mint)`
 * (`v16_program.rs:17404-17415`). The wrapper PINS this single address rather than
 * accepting any `vault_authority`-owned token account: `verify_vault_token_account`
 * (`17543-17563`) rejects a token account whose key is not exactly this, on top of the
 * mint/owner/state/delegate/close-authority checks. That pin is finding F-VAULT-FRAG —
 * without it an attacker could route deposits to a second `vault_authority`-owned account
 * and strand honest withdrawals against the canonical one.
 *
 * ⚠ The middle seed is ALWAYS the legacy SPL Token program
 * ({@link PERCOLATOR_VAULT_TOKEN_PROGRAM_ID}), never Token-2022 — the wrapper hard-pins
 * `spl_token::ID` in both `verify_token_program` and `unpack_token_account`. Deriving this
 * address with a detected token program would produce a key the program rejects with
 * `InvalidVaultAccount`, which reads as "bad vault" rather than "wrong derivation".
 *
 * Required by `WithdrawProtocolFee` (tag 84) at accounts[3] and
 * `WithdrawInsuranceReserveToStake` (tag 87) at accounts[4], plus every deposit/withdraw
 * token path.
 *
 * @param programId - The Percolator wrapper program ID (the market's owner).
 * @param market    - The v17 market group (slab) public key.
 * @param mint      - The market's collateral mint (`WrapperConfigV16::collateral_mint`).
 * @returns `[vaultTokenAccount, bump]` — the ATA address and its bump.
 *
 * @example
 * ```ts
 * const cfg = parseWrapperConfigV17(marketData);
 * const [vaultToken] = deriveCanonicalVault(WRAPPER_ID, marketPk, cfg.collateralMint);
 * ```
 */
export declare function deriveCanonicalVault(programId: PublicKey, market: PublicKey, mint: PublicKey): [PublicKey, number];
/**
 * Derive the canonical vault ATA from an already-derived `vault_authority`.
 *
 * Split out from {@link deriveCanonicalVault} so callers that already hold the authority
 * (e.g. because they must also pass it as an account) do not re-run the "vault" PDA search.
 * Same derivation, same program pins — see {@link deriveCanonicalVault} for the rationale.
 *
 * @param vaultAuthority - The `["vault", market]` PDA under the wrapper program.
 * @param mint           - The market's collateral mint.
 * @returns `[vaultTokenAccount, bump]`
 *
 * @example
 * ```ts
 * const [auth] = deriveVaultAuthority(WRAPPER_ID, marketPk);
 * const [vault] = deriveCanonicalVaultForAuthority(auth, mintPk);
 * ```
 */
export declare function deriveCanonicalVaultForAuthority(vaultAuthority: PublicKey, mint: PublicKey): [PublicKey, number];
/** Both halves of a market's vault, as required by tags 84 and 87. */
export interface MarketVaultAccounts {
    /** `PDA(["vault", market], wrapperProgramId)` — SPL owner of the vault, and CPI signer. */
    vaultAuthority: PublicKey;
    /** Bump for `vaultAuthority`. The program re-derives it; callers never pass it. */
    vaultAuthorityBump: number;
    /** The canonical vault token account — `ATA(vaultAuthority, SPL_TOKEN, mint)`. */
    vaultToken: PublicKey;
    /** Bump for `vaultToken`. */
    vaultTokenBump: number;
    /** The token program that must be passed alongside — always legacy SPL Token. */
    tokenProgram: PublicKey;
}
/**
 * Derive every vault-side account a fee-withdrawal instruction needs, in one call.
 *
 * `WithdrawProtocolFee` (tag 84) and `WithdrawInsuranceReserveToStake` (tag 87) each take
 * the vault token account, the vault authority PDA and the token program as three separate
 * accounts that must agree with one another; deriving them together makes disagreement
 * impossible.
 *
 * Account positions:
 * - tag 84 (`v16_program.rs:10796-10815`): `[3] vaultToken (w)`, `[4] vaultAuthority`, `[5] tokenProgram`
 * - tag 87 (`v16_program.rs:11238-11258`): `[4] vaultToken (w)`, `[5] vaultAuthority`, `[6] tokenProgram`
 *
 * @param programId - The Percolator wrapper program ID.
 * @param market    - The v17 market group (slab) public key.
 * @param mint      - The market's collateral mint.
 * @returns The vault authority, the canonical vault token account, both bumps, and the token program.
 *
 * @example
 * ```ts
 * const v = deriveMarketVaultAccounts(WRAPPER_ID, marketPk, cfg.collateralMint);
 * const keys = [
 *   { pubkey: cranker.publicKey, isSigner: true,  isWritable: false },
 *   { pubkey: marketPk,          isSigner: false, isWritable: true  },
 *   { pubkey: destToken,         isSigner: false, isWritable: true  },
 *   { pubkey: v.vaultToken,      isSigner: false, isWritable: true  },
 *   { pubkey: v.vaultAuthority,  isSigner: false, isWritable: false },
 *   { pubkey: v.tokenProgram,    isSigner: false, isWritable: false },
 * ];
 * ```
 */
export declare function deriveMarketVaultAccounts(programId: PublicKey, market: PublicKey, mint: PublicKey): MarketVaultAccounts;
/**
 * Derive insurance LP mint PDA (a.k.a. LP vault mint PDA).
 * Seeds: ["lp_vault_mint", slab_key]
 * Wrapper anchor: src/percolator.rs:2543 derive_lp_vault_mint.
 */
export declare function deriveInsuranceLpMint(programId: PublicKey, slab: PublicKey): [PublicKey, number];
/**
 * Derive LP PDA for TradeCpi.
 * Seeds: ["lp", slab_key, lp_idx as u16 LE]
 */
export declare function deriveLpPda(programId: PublicKey, slab: PublicKey, lpIdx: number): [PublicKey, number];
/** PumpSwap AMM program ID. */
export declare const PUMPSWAP_PROGRAM_ID: PublicKey;
/** Raydium CLMM (Concentrated Liquidity) program ID. */
export declare const RAYDIUM_CLMM_PROGRAM_ID: PublicKey;
/** Meteora DLMM (Dynamic Liquidity Market Maker) program ID. */
export declare const METEORA_DLMM_PROGRAM_ID: PublicKey;
/** Pyth Push Oracle program on mainnet. */
export declare const PYTH_PUSH_ORACLE_PROGRAM_ID: PublicKey;
/**
 * Seed used to derive the creator lock PDA.
 * Matches `creator_lock::CREATOR_LOCK_SEED` in percolator-prog.
 */
export declare const CREATOR_LOCK_SEED = "creator_lock";
/**
 * Derive the creator lock PDA for a given slab.
 * Seeds: ["creator_lock", slab_key]
 *
 * This PDA is required as accounts[9] in every LpVaultWithdraw instruction
 * since percolator-prog PR#170 (GH#1926 / PERC-8287).
 * Non-creator withdrawers must pass this key; if no lock exists on-chain the
 * enforcement is a no-op. The SDK must ALWAYS include it — passing it is mandatory.
 *
 * @param programId - The percolator program ID.
 * @param slab      - The slab (market) public key.
 * @returns [pda, bump]
 *
 * @example
 * ```ts
 * const [creatorLockPda] = deriveCreatorLockPda(PROGRAM_ID, slabKey);
 * ```
 */
export declare function deriveCreatorLockPda(programId: PublicKey, slab: PublicKey): [PublicKey, number];
/**
 * Derive the LP Vault registry PDA.
 * Seeds: ["lp_vault", marketGroup]
 *
 * Required by: CreateLpVault (tag 74), DepositToLpVault (tag 75),
 * RequestRedeemLpShares (tag 76), ExecuteRedemption (tag 77),
 * LpVaultCrankFees (tag 78), SetLpVaultPaused (tag 79), CloseLpVault (tag 80).
 *
 * Matches `constants::LP_VAULT_REGISTRY_SEED = b"lp_vault"` in v16_program.rs.
 *
 * @param programId   - The Percolator program ID.
 * @param marketGroup - The market group (slab) public key.
 * @returns [pda, bump]
 *
 * @example
 * ```ts
 * const [registryPda] = deriveLpVaultRegistry(PROGRAM_ID, marketGroupKey);
 * ```
 */
export declare function deriveLpVaultRegistry(programId: PublicKey, marketGroup: PublicKey): [PublicKey, number];
/**
 * Derive the LP redemption ticket PDA for a specific redeemer.
 * Seeds: ["lp_redemption", registry, redeemer]
 *
 * Required by: RequestRedeemLpShares (tag 76), ExecuteRedemption (tag 77).
 *
 * Matches `constants::LP_REDEMPTION_SEED = b"lp_redemption"` in v16_program.rs
 * and `derive_lp_redemption(program_id, registry, redeemer)` at line 3111.
 *
 * @param programId - The Percolator program ID.
 * @param registry  - The LP Vault registry PDA (from deriveLpVaultRegistry).
 * @param redeemer  - The wallet public key of the redeemer.
 * @returns [pda, bump]
 *
 * @example
 * ```ts
 * const [registryPda] = deriveLpVaultRegistry(PROGRAM_ID, marketGroupKey);
 * const [redemptionPda] = deriveLpRedemption(PROGRAM_ID, registryPda, walletKey);
 * ```
 */
export declare function deriveLpRedemption(programId: PublicKey, registry: PublicKey, redeemer: PublicKey): [PublicKey, number];
/**
 * Derive the LP backing-domain ledger PDA.
 * Seeds: ["lp_backing_ledger", marketGroup, u16LE(domainIdx)]
 *
 * Required by: DepositToLpVault (tag 75) at accounts[7],
 * LpVaultCrankFees (tag 78) at accounts[3].
 *
 * Matches `constants::LP_BACKING_LEDGER_SEED = b"lp_backing_ledger"` and
 * `derive_lp_backing_ledger(program_id, market_group, domain: u16)` in v16_program.rs
 * (line 3127) — domain is encoded as 2-byte little-endian.
 *
 * @param programId   - The Percolator program ID.
 * @param marketGroup - The market group (slab) public key.
 * @param domainIdx   - The backing domain index as a u16 integer (0–65535).
 * @returns [pda, bump]
 *
 * @example
 * ```ts
 * const [ledgerPda] = deriveLpBackingLedger(PROGRAM_ID, marketGroupKey, 0);
 * ```
 */
export declare function deriveLpBackingLedger(programId: PublicKey, marketGroup: PublicKey, domainIdx: number): [PublicKey, number];
/**
 * Derive the LP escrow SPL token account PDA.
 * Seeds: ["lp_escrow", marketGroup]
 *
 * The escrow is owned by the registry PDA and holds LP tokens during the
 * redemption window. Required by ExecuteRedemption (tag 77).
 *
 * Matches `constants::LP_ESCROW_SEED = b"lp_escrow"` and
 * `derive_lp_escrow(program_id, market_group)` in v16_program.rs (line 3157).
 *
 * @param programId   - The Percolator program ID.
 * @param marketGroup - The market group (slab) public key.
 * @returns [pda, bump]
 *
 * @example
 * ```ts
 * const [escrowPda] = deriveLpEscrow(PROGRAM_ID, marketGroupKey);
 * ```
 */
export declare function deriveLpEscrow(programId: PublicKey, marketGroup: PublicKey): [PublicKey, number];
/**
 * Derive the per-market NFT program-id registry PDA.
 * Seeds: ["nft_registry", marketGroup]
 *
 * Required by: SetNftProgramId (tag 73) and the wrapper's NFT B-3 CPI path
 * (TransferPortfolioOwnership, tag 72).
 *
 * Matches `constants::NFT_REGISTRY_SEED = b"nft_registry"` and
 * `derive_nft_registry(program_id, market_group)` in v16_program.rs (line 3274).
 *
 * @param programId   - The Percolator program ID.
 * @param marketGroup - The market group (slab) public key.
 * @returns [pda, bump]
 *
 * @example
 * ```ts
 * const [nftRegistryPda] = deriveNftRegistry(PROGRAM_ID, marketGroupKey);
 * ```
 */
export declare function deriveNftRegistry(programId: PublicKey, marketGroup: PublicKey): [PublicKey, number];
/**
 * Derive the matcher delegate PDA.
 * Seeds: ["matcher", market, accountB, accountBOwner, matcherProg, matcherCtx]
 * (all six seed segments are 32-byte public keys)
 *
 * Required by TradeCpi (tag 10) at accounts[6] and BatchTradeCpi (tag 67).
 * The program signs CPI calls to the external matcher program using this PDA.
 *
 * Matches `derive_matcher_delegate(program_id, market_key, maker_account,
 * maker_owner, matcher_program, matcher_context)` in v16_program.rs (line 13642).
 *
 * @param programId     - The Percolator program ID.
 * @param market        - The market (slab) public key.
 * @param accountB      - The maker/LP portfolio account public key.
 * @param accountBOwner - The owner of accountB.
 * @param matcherProg   - The external matcher program public key.
 * @param matcherCtx    - The matcher context account public key.
 * @returns [pda, bump]
 *
 * @example
 * ```ts
 * const [delegatePda] = deriveMatcherDelegate(
 *   PROGRAM_ID,
 *   marketKey,
 *   accountBKey,
 *   accountBOwnerKey,
 *   matcherProgKey,
 *   matcherCtxKey,
 * );
 * ```
 */
export declare function deriveMatcherDelegate(programId: PublicKey, market: PublicKey, accountB: PublicKey, accountBOwner: PublicKey, matcherProg: PublicKey, matcherCtx: PublicKey): [PublicKey, number];
export declare function derivePythPushOraclePDA(feedIdHex: string): [PublicKey, number];
