# Changelog

All notable changes to `@percolator/sdk` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [5.0.0] — unreleased

`package.json` was bumped to 5.0.0 by `3704dfd` without a changelog section;
this collects that change and everything since.

### Fixed

- **`ACCOUNTS_NFT_BURN` / `ACCOUNTS_NFT_EMERGENCY_BURN`: the NFT holder is now
  `[signer, writable]`, not `[signer]`.** The holder is the rent recipient for
  every account those instructions close — the ATA, the mint, the PositionNft
  PDA and the ExtraAccountMetaList — and percolator-nft rejects a read-only
  holder outright via `require_writable_rent_recipient` (`processor.rs:825`,
  `:1000`); its own ABI table documents account 0 as `[signer, writable]`
  (`instruction.rs:44`, `:99`). Every burn built from these templates through
  `buildNftAccountMetas` previously went on the wire with `isWritable: false`
  and was rejected with `InvalidAccountData`. This was a live break against the
  deployed programs. (dcccrypto/percolator-sdk#376)

### Breaking

- **`fix(stake)!`** (`3704dfd`): an ambiguous network now throws instead of
  defaulting to mainnet.

### Changed

- **`ACCOUNTS_NFT_RECONCILE` 7 → 9 accounts**, mirroring
  dcccrypto/percolator-nft#183: `extra_metas` (writable) at index 7 and the
  Token-2022 program at index 8, with the NFT mint at index 1 becoming writable
  because the program now closes it. Recovers 7,676,880 lamports per NFT that
  Reconcile previously abandoned unrecoverably.

  **Ahead of chain, but forward-compatible.** The currently deployed programs
  (`FqhKJT9gtScjrmfUuRMjeg7cXNpif1fqsy5Jh65tJmTS` mainnet,
  `CNGBPZRALk9Xu8BdgWNyrLJ7daQ9eJYFf1GnEEC7YCU3` devnet) pull seven accounts off
  an iterator, never check `accounts.len()`, and never check
  `nft_mint.is_writable` — so a nine-account call behaves identically on them.
  The rent reclamation this documents only takes effect once percolator-nft#183
  is deployed. Callers building the instruction by hand must pass nine keys:
  `buildNftAccountMetas` throws `account count mismatch: expected 9, got 7`.

### Added

- **`PositionNftState.lastHolder`.** Bytes `[167..199]` were documented as
  `_reserved`; #138 claimed them for `last_holder`, the field the transfer hook
  rewrites on every transfer. It is the sole authorisation for
  `ReconcileBurnedNft` — the program releases the escrowed portfolio and all
  rent to whichever account matches it — and it is account 6 of
  `ACCOUNTS_NFT_RECONCILE`, which cannot be derived. Without this the SDK
  shipped the Reconcile account template but no way to obtain the one key in it.

- Account-list drift tests (`test/drift-check.test.ts`) that round-trip each
  `ACCOUNTS_NFT_*` template through `buildNftAccountMetas` and assert the
  resulting `{isSigner, isWritable}` booleans. The previous tests asserted the
  shorthand string codes, at which level the holder defect above was invisible.
  Nothing in this repo consumes these templates, so they had no coverage at all.
`package.json` was bumped to 5.0.0 by `3704dfd` without a changelog section.

### Fixed

- **`EXPECTED_SLAB_VERSION` 16 → 17.** The deployed wrapper writes `VERSION = 17`
  into bytes `[8..10]` of every account it owns and hard-rejects a mismatch in
  `check_header`. Confirmed against the live devnet wrapper
  `DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj`: of 206 wrapper-owned accounts,
  204 carry version 17 and none carries 16. Nothing in this package consumed the
  constant, but it is a public export, and any integrator gating on it rejected
  every live account. percolator-nft needed the same correction in `3e26fe7`.
  (dcccrypto/percolator-sdk#379)
`package.json` was bumped to 5.0.0 by `3704dfd` without a changelog section.

### Added

- **`STAKE_POOL_SIZE_V4 = 408`** and a v4 arm in `decodeStakePool`.
  `percolator-stake` `d0c6ecb` promoted the #242 cooldown timelock out of
  `_reserved` (392 -> 408): `pending_cooldown_slots` and
  `cooldown_proposed_at_slot` are now real struct fields at absolute 392 and
  400. On v3 they were packed into `_reserved[10..26]`, which PERC-313 HWM
  state already owned -- proposing a cooldown flipped `hwm_enabled` off, and an
  HWM refresh rewrote the proposal slot so the timelock read as long-elapsed.

  Before this change a 408-byte pool satisfied `length >= STAKE_POOL_SIZE_V3`,
  so the decoder concluded v3, expected version 3, read 4, and threw
  `StakePool unsupported version: 4 !== 3` -- every stake read failing at once.

  The decoder now reads each pool at the offsets its OWN version wrote, so a
  392-byte v3 pool still decodes bug-for-bug against the deployed program.

- **`StakePoolState.version`** -- the layout version byte, previously read and
  discarded. Exposed because field MEANING depends on it, not just offsets: on
  `version <= 3`, `cooldownProposedAtSlot` can read non-zero on a pool where no
  proposal was ever made (the HWM bytes sit inside its u64), which is the
  interface's own documented "live proposal" sentinel. Gate on `version >= 4`
  before trusting either timelock field.

**NOT YET DEPLOYED.** Devnet `GCHhcgwPyrai8SWHEVWw3odedguFXEtJobNnWSfWBCU3`
holds 25 pools, all 392 bytes / version 3. The wrapper (`STAKE_POOL_LEN = 408`,
`STAKE_POOL_VERSION = 4`) and the stake program pin v4 EXCLUSIVELY and must be
deployed together; `percolator-stake` has no migration path, so the pools are
re-seeded rather than upgraded. This release is ahead of chain.

### Unchanged, deliberately

- **`STAKE_POOL_SIZE` stays 392 and `STAKE_POOL_CURRENT_VERSION` stays 3.**
  `decodeStakePool` accepting v4 is a strict superset -- it widens what decodes
  and changes no existing pool's meaning. The aliases are not: they are bare
  numbers that consumers use as an exact `getProgramAccounts({ dataSize })`
  filter and as a `data.length < SIZE` gate, so re-pointing them to 408 today
  would match and admit ZERO live pools. They flip with the coordinated v4
  deploy. Pin `STAKE_POOL_SIZE_V4` explicitly if you want the new layout now.

### Fixed

- `specs/stake-parity.json` `stake_pool_size` 392 -> 408. The parity fixtures
  mirror percolator-stake **source** (`scripts/update-parity-fixtures.mjs` runs
  `cargo run --bin sdk_parity_fixtures` against the sibling repo's default
  branch), not the deployed program, so 392 was drift against `main`. The
  deployed layout is now pinned separately as a literal in
  `test/parity-fixtures.test.ts`.

- Doc corrections in `src/solana/stake.ts`: the `_reserved` HWM/cooldown
  byte-aliasing block is scoped to "v3 and earlier; FIXED in v4" rather than
  stated as unconditional present-tense reality, and
  `totalRecoveredFromWrapper` is documented as v3 **and** v4 rather than
  "v3 only".

---

## [4.3.0] — 2026-07-24

Creator fee claim: the read side (`creatorFeeClaimableAtoms`) and the write side
(`WithdrawCreatorFee`, tag 90).

Source: `percolator-prog` `src/v16_program.rs`, branch
`feat/protocol-fee-taker-only`, per the 2026-07-23 creator-fee-claim design.

**ADDITIVE ONLY — no existing offset or tag changed.** `V17_WRAPPER_CONFIG_LEN`
is **still 576** and `V17_MARKET_GROUP_OFF` is **still 592**. The new counter was
carved *in place* out of the pre-existing `_padding_split` tail (which shrank
`[u8;10]` → `[u8;2]`) at 568, the only 8-aligned slot inside it. Growing the
config would have shifted every asset-profile offset and bricked the deployed
576-byte markets — a repeat of the 496→576 incident.

### Context — what this fixes

The creator's fee leg used to be credited into the asset's **insurance domain
budget**, which is the market's loss backstop. Two consequences: a "claim fees"
button was really a *withdraw from the loss backstop* button (tag 57), and there
was no on-chain figure for "creator earned X" at all, because creator revenue
was commingled with the backstop. The leg now accrues to its own counter, and
tag 90 is the only thing that drains it.

### Added

- **`WrapperConfigV17.creatorFeeClaimableAtoms`** — the creator's unclaimed
  trade-fee revenue in collateral atoms, parsed by `parseWrapperConfigV17`. This
  is the honest claimable balance for a creator-claim UI.

  ⚠ **Not monotonic, and not an accrued/withdrawn pair** like the protocol / LP
  / insurance legs. It is a single live balance — trades add, tag 90 subtracts —
  so it *cannot* be used to derive lifetime creator revenue, only what is
  claimable right now. Forced by the 10-byte pad budget (`u64`, not `u128`).

- **`V17_CREATOR_FEE_CLAIMABLE_OFF = 568`** — offset relative to the start of the
  `WrapperConfigV16` block; absolute offset in a market-group account is 584.

- **`encodeWithdrawCreatorFee({ amount })`** / **`WithdrawCreatorFeeArgs`** —
  tag 90. Wire: `tag(1) + amount(u128 LE)` = **17 bytes**.

- **`ACCOUNTS_WITHDRAW_CREATOR_FEE`** — 6 accounts, the same shape as
  `ACCOUNTS_WITHDRAW_PROTOCOL_FEE`: `authority` (signer), `market`, `destToken`,
  `vaultToken`, `vaultAuthority`, `tokenProgram`.

- **`IX_TAG.WithdrawCreatorFee = 90`**. The deprecated v12.x `UpdateMarkPrice`
  alias also sits at 90 and is now annotated as colliding; it is not in v17.

### Three ways tag 90 deliberately differs from tag 84

1. **`amount: 0n` is REJECTED** (`InvalidInstruction`) — it is *not* tag 84's
   "withdraw all available" sentinel. Tag 90's contract is an exact debit of the
   counter. To drain, read `creatorFeeClaimableAtoms` and pass that value.
2. **Over-claim is rejected, never clamped**, and there is **no partial fill**.
   Nothing is debited on failure; if the vault's unbudgeted surplus is
   momentarily thin the whole instruction fails closed and the creator retries
   smaller.
3. **Authority is asset 0's `insurance_operator` and ONLY that** — never
   `cfg.marketauth`, and it does not reuse
   `verify_domain_withdrawal_preflight`'s authority check, which accepts
   `marketauth` as an alternate. On a staked market `marketauth` *is* the
   stake-pool PDA, so accepting it would let the pool claim the creator's
   revenue. Since `StakeInitPool` never rotates `insurance_operator`, claiming
   keeps working after staking.

### Compatibility

- **No migration.** Markets created by a pre-upgrade build have bytes 566..576
  zeroed (they were explicit padding), so `creatorFeeClaimableAtoms` reads a
  well-defined `0n` and accrues fresh after an in-place program upgrade.
- **Type note:** `WrapperConfigV17` gained a required property. Code that
  *consumes* `parseWrapperConfigV17` is unaffected; only code that hand-builds a
  `WrapperConfigV17` literal needs the new field.
- Creator fees already sitting in the insurance budget from before the upgrade
  are **not** migrated.

---

## [4.2.0] — 2026-07-22

Keeper read paths: backing-bucket lapse **detection** (the missing half of tag
89) and canonical vault **derivation** (tags 84 / 87).

Source: `percolator-prog@10acb5ae`, engine `percolator/src/v16.rs`. All layout
offsets produced by `offset_of!` against the engine's own `#[repr(C)]` account
structs, and independently re-derived in tests by walking the field
declarations to the struct's separately-sourced length.

4.1.0 shipped the tag-89 *encoder* with no way to tell whether a bucket had
actually lapsed, so a keeper could only crank blindly or not at all. This
release closes that, plus the vault derivation the keeper was carrying as an
env override.

### Added

- **`parseBackingBucketsV17(data, { chainSlot })`** — per-domain backing-bucket
  state from a raw v17 market account: `status`, `expirySlot`, all five u128
  counters, `marketId`, plus derived `lapsed` and `expirable` flags. Also
  reports `mode`, `headerCurrentSlot`, the resolved `nowSlot`, `maxMarketSlots`,
  `physicalAssetSlots` and `addressableDomainCount`.

- **`isBackingBucketExpirable(bucket, ctx)`** — the tag-89 acceptance predicate,
  matching every gate on the on-chain path so a keeper never sends a doomed
  transaction:

  1. `mode === 0` (Live) — else `EngineLockActive` Custom(21).
  2. `domain < max_market_slots * 2` — else `InvalidInstruction` Custom(9).
  3. `assetIndex < physical slot count` — else the engine's `InvalidLeg`.
     A market may be *configured* for more slots than its account was *sized*
     for; (2) and (3) are folded into `addressableDomainCount`.
  4. `status === Fresh && nowSlot >= expirySlot` — else `Stale` Custom(19).
     Note `>=`, not `>`: at `nowSlot === expirySlot` the bucket is both
     deadlocked and expirable, agreeing with the deadlock side's
     `expiry_slot <= current_slot`.

  `nowSlot` is `max(chainSlot, header.current_slot)`, mirroring
  `authenticated_market_slot_or_fallback_view`. Using the chain slot alone is a
  **false negative** whenever the engine counter runs ahead, and a false
  negative leaves a domain bricked. Omitting `chainSlot` collapses to
  `header.current_slot`, the program's own `Clock`-unavailable fallback.

  ⚠ Does **not** model the engine's `CounterUnderflow` arm, which fires only on
  a domain whose `SourceCreditState` has drifted below its own bucket totals —
  a broken-invariant state, not a reachable steady state.

- **`findExpirableBackingDomains(data, { chainSlot })`** — ascending domain
  indices ready to feed `encodeExpireBackingBucket({ domain })`. Returns `[]`
  when there is nothing to do, which is the common case and the case in which a
  keeper must send nothing.

- **`BackingBucketStatus`** enum (`Empty` 0 / `Fresh` 1 / `Expired` 2 /
  `Impaired` 3) and **`backingBucketStatusName()`**, which reports
  `Unknown(n)` rather than guessing at an unmapped byte.

- Layout constants: `V17_GROUP_CONFIG_REL` (32),
  `V17_GROUP_CURRENT_SLOT_REL` (613), `V17_GROUP_MODE_REL` (626),
  `V17_CONFIG_MAX_MARKET_SLOTS_REL` (2), `V17_ASSET_SLOT_WRAPPER_LEN` (512),
  `V17_ENGINE_BACKING_LONG_REL` (947), `V17_ENGINE_BACKING_SHORT_REL` (1044),
  `V17_BACKING_BUCKET_LEN` (97), `V17_MARKET_MODE_LIVE` (0).

- **`deriveCanonicalVault(programId, market, mint)`** — the market's vault token
  account, mirroring `canonical_vault_address` (`v16_program.rs:17404-17415`):

  ```text
  vault_authority = PDA(["vault", market],                     wrapperProgramId)
  vault           = PDA([vault_authority, SPL_TOKEN_ID, mint], ATA_PROGRAM_ID)
  ```

  ⚠ The middle seed is **always** legacy SPL Token, never Token-2022. The
  wrapper hard-pins `spl_token::ID` in both `verify_token_program` and
  `unpack_token_account`, so a Token-2022-derived ATA is simply the wrong
  address and fails with `InvalidVaultAccount` — which reads as "bad vault"
  rather than "wrong derivation". Do not resolve this with `detectTokenProgram`.

  The wrapper pins this single address (finding F-VAULT-FRAG) rather than
  accepting any `vault_authority`-owned token account, so there is exactly one
  correct answer.

- **`deriveCanonicalVaultForAuthority(vaultAuthority, mint)`** — same
  derivation for callers that already hold the authority.

- **`deriveMarketVaultAccounts(programId, market, mint)`** — `vaultAuthority`,
  `vaultToken`, both bumps and `tokenProgram` in one call, for
  `WithdrawProtocolFee` (tag 84, accounts 3/4/5) and
  `WithdrawInsuranceReserveToStake` (tag 87, accounts 4/5/6).

- **`ASSOCIATED_TOKEN_PROGRAM_ID`** and **`PERCOLATOR_VAULT_TOKEN_PROGRAM_ID`**
  — the two program ids the vault derivation depends on, exported so a consumer
  can assert them rather than re-type them.

### Notes

- Tag 87's stake-side accounts needed no new code: `deriveStakePool`,
  `deriveStakeVaultAuth` and `decodeStakePool` already existed in
  `src/solana/stake.ts` and are now pinned by tests against the program's own
  `STAKE_POOL_SEED` / `STAKE_VAULT_AUTHORITY_SEED` constants.
- `deriveVaultAuthority`'s doc now cites its program anchor
  (`v16_program.rs:17339-17341`).

---

## [4.1.0] — 2026-07-22

Backing-bucket lapse recovery (wrapper tag 89) and error ordinal 61.

Source: `percolator-prog@10acb5ae`. Wire format read off the program's own
tag-89 decode arm, `encode()` arm, and `handle_expire_backing_bucket`.

**NOW DEPLOYED.** Devnet wrapper
`DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj` is hash-verified at
`6b2fda2363352aba0ef88abde0d398f9dd477b1208507e7e8393586ed5458931`, which is
this commit. The 4.0.0 fee-collection surface (tags 86/87/88, the 576-byte
config, error ordinals 52-60) is no longer ahead of chain — it is live. The
"NOT YET DEPLOYED" warning on 4.0.0 above is superseded.

### Added

- `encodeExpireBackingBucket` (tag 89) — `tag(1) + domain(u16 LE)` = 3 B.
  **PERMISSIONLESS**: `ACCOUNTS_EXPIRE_BACKING_BUCKET` is a single writable
  market account and NO signer; the handler applies only `expect_writable` +
  `expect_owner`.

  Recovers a domain bricked by a backing-bucket lapse. Once a `Fresh` bucket's
  `expiry_slot` passes, settling a gain fails `Custom(19)`, settling a loss
  fails `Custom(21)`, and even `TopUpBackingBucket` fails `Custom(21)` — the
  bucket cannot be paid to come back. The wrapper previously had no call site
  reaching the engine's `expire_source_backing_bucket_not_atomic` on a LIVE
  market, so the lapse was permanent. Tag 89 is that missing call site.

  ⚠ **This is routine keeper maintenance, not an edge case.** The expiry is
  fixed when the bucket opens and is never extended while it stays `Fresh`, so
  **every backed market lapses eventually** — a longer horizon (even
  `MAX_BACKING_BUCKET_EXPIRY_SLOT`) defers the lapse, it does not avoid it.
  Keepers must scan live markets for `Fresh`-and-lapsed domains and expire
  them, or the first lapse silently bricks the domain.

  Safe to call speculatively: the engine fails closed with `Custom(19)` unless
  the bucket is `Fresh` AND lapsed, and `now_slot` comes from the runtime
  `Clock`, never from the caller, so no caller can force early forfeiture.

- `ACCOUNTS_EXPIRE_BACKING_BUCKET` — 1 account, `[market]` writable, no signer.
- `IX_TAG.ExpireBackingBucket = 89`.
- **Error ordinal 61 `AssetSlotAlreadyConfigured`.** `UpdateAssetLifecycle`
  ACTIVATE against a slot below `max_market_slots` that is already in service.
  Replaces a misleading `Custom(21) EngineLockActive`, which read as "the
  market is locked" and gave no hint the slot was simply already live.

### Changed

- **Error ordinal 61 is no longer free.** `decodeError(61)` /
  `getErrorName(61)` now return `AssetSlotAlreadyConfigured` instead of
  `undefined` / `Unknown(61)`. Consumers that pinned 61 as the table's upper
  boundary — or that carried v12's ADL meaning for `0x3D`
  (`EngineSideBlocked`) — need updating. The v12 meaning is still gone; the
  ordinal has been reused for something unrelated.
- **Ordinal 51 `FeeSplitFloorViolation` hint corrected.** It documented the
  retired tolerance-based `policy_v16::fee_split_floor_ok` on the two-rate
  split raised from tags 51/55. That function has no live call sites. The
  ordinal is now raised only by `policy_v16::validate_fee_split` from
  `UpdateFeeSplit` (tag 86), exactly and with no tolerance, against
  creator ≤ 3600 / LP ≥ 3200 / insurance ≥ 1200 bps.
- Ordinal 49 `EngineInsufficientInitialMargin` confirmed against the program
  enum; the "discriminant tentative — TODO" note is resolved.

---

## [4.0.0] — 2026-07-20

v17 fee-collection split client surface. Wrapper instruction tags 86/87/88,
percolator-stake CPI proxy tags 25-28, error ordinals 52-60, and the
`WrapperConfigV16` growth 496 → 576 bytes.

Sources: `percolator-prog` `feat/protocol-fee-taker-only@2b3a6a65` and
`percolator-stake` `feat/adopt-stake-lineage-plus-n7@474079f`. Wire formats
were read off each program's own decode arms and struct layouts.

**NOT YET DEPLOYED.** The devnet wrapper
`DhSkE7uTb8HBUYYWF1xkxMYBGtLYJEoDq1tfBD7SnHcj` still writes a 496-byte
config and does not accept tags 86/87/88. This release is ahead of chain.

### BREAKING

- **`V17_WRAPPER_CONFIG_LEN` 496 → 576.** `parseWrapperConfigV17` now
  requires 576 config bytes and throws a length error against any market
  created by the currently-deployed wrapper. This is deliberate: a short
  read fails loudly rather than silently misparsing. Every downstream offset
  derives from the constant, so `V17_MARKET_GROUP_OFF` moves 512 → 592 and
  the asset-slot base 1270 → 1350 automatically. Portfolio lengths are
  independent and unchanged (`V17_PORTFOLIO_ACCOUNT_LEN` stays 9347).
- **`WrapperConfigV17` gained seven required fields** — `lpFeeAccruedAtoms`,
  `lpFeeWithdrawnAtoms`, `insuranceReserveAccruedAtoms`,
  `insuranceReserveWithdrawnAtoms` (all `bigint`), then `creatorShareBps`,
  `lpShareBps`, `insuranceShareBps` (all `number`). Anything constructing
  this type literally must be updated.
- **Error table extended 51 → 60.** `decodeError(52..60)` and
  `getErrorName(52..60)` now return real values instead of
  `undefined`/`Unknown(N)`. Consumers asserting the old upper bound will
  need updating.

### Added

- `encodeUpdateFeeSplit` (tag 86) — `tag(1) + u16 × 3` = 7 B, marketauth-gated.
- `encodeWithdrawInsuranceReserveToStake` (tag 87) — `tag(1)` = 1 B,
  permissionless, Live-only. The destination is derived from the pinned stake
  program, never caller-supplied.
- `encodeUpdateMaintenanceFeePerSlot` (tag 88) — `tag(1) + u128` = 17 B.
  **The payload is `u128`, not `u64`**: the wrapper decodes with `read_u128`,
  matching the storage type and InitMarket's own encoding. A `u64` payload
  leaves 8 bytes unconsumed and is rejected outright.
- `encodeUpdateTradeFeePolicy` (tag 55) — `tag(1) + u64` = 9 B. Closes a
  pre-existing gap: `IX_TAG.UpdateTradeFeePolicy` existed with no encoder,
  which left stake tag 28's CPI target unrepresentable. Note the deliberate
  type asymmetry with tag 88.
- Account specs `ACCOUNTS_UPDATE_FEE_SPLIT`,
  `ACCOUNTS_WITHDRAW_INSURANCE_RESERVE_TO_STAKE`,
  `ACCOUNTS_UPDATE_MAINTENANCE_FEE_PER_SLOT`,
  `ACCOUNTS_UPDATE_TRADE_FEE_POLICY`.
- Stake CPI proxy encoders `encodeStakeAdminUpdateFeeSplit` (25 → wrapper 86),
  `encodeStakeAdminUpdateMaintenanceFeePerSlot` (26 → 88),
  `encodeStakeAdminUpdateBackingFeePolicy` (27 → 51),
  `encodeStakeAdminUpdateTradeFeePolicy` (28 → 55), with
  `stakeGroupAProxyAccounts` (4 accounts, pool PDA signs) and
  `stakeGroupBProxyAccounts` (5 accounts, `vault_auth` signs and the pool PDA
  does **not**), plus per-tag aliases.
- `FEE_SPLIT` constants and `validateFeeSplit()`, a client mirror of
  `policy_v16::validate_fee_split`. Convenience only — the wrapper enforces
  the same rules regardless.

### Why these proxies exist

`StakeInitPool` irreversibly rotates `cfg.marketauth` to the stake-pool PDA
and `BindInsuranceAuthority` hands asset 0's `insurance_authority` to
`vault_auth`. A PDA cannot sign a top-level transaction, so the affected
wrapper setters are reachable **only** through a stake-program CPI. Before
tags 25-28 exactly one proxy existed, leaving 1 of 16 marketauth-gated
handlers reachable — the mechanical reason the fee split was unachievable on
a staked market.

### Notes on ordinal 55

Ordinal 55 changed meaning during development
(`StakePoolAssetAdminNotBurned` → `StakePoolOwnerMismatch`). The old variant
existed only on an unmerged branch and never shipped on-chain, so the SDK
carries only the current meaning; a test asserts the dead name is absent from
the table.

### Sequencing (nothing enforces this on-chain)

`InitMarket` (defaults are already correct) → `UpdateFeeSplit` **only if a
non-default split is wanted, and only before `StakeInitPool`** →
`CreateLpVault` + `DepositToLpVault` → `StakeInitPool` →
`BindInsuranceAuthority`, which is **required** or the insurance/staker leg
has no exit.

---

## [3.1.0] — 2026-07-09

PumpSwap (pump.fun AMM) DEX-oracle parser fix. `dex-oracle.ts` had three
compounding bugs that made every PumpSwap-sourced price wrong by ~12.9x.

### Fixed

- **Vault/mint byte offsets** — `parsePumpSwapPool` read `baseMint`/`quoteMint`/
  `baseVault`/`quoteVault` 8 bytes short of the real Anchor `Pool` struct
  layout (`35/67/131/163` instead of `43/75/139/171`), so every field was
  silently pulling from inside the *preceding* field. Verified against the
  live ANSEM pool on mainnet (`FnzKY6x7entQ1eR3D225dQyT7ybfka4PskBMQhb8L3CC`):
  corrected `base_mint` decodes to the real ANSEM mint
  (`9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump`) and corrected
  `pool_quote_token_account` decodes to the pool's actual WSOL vault
  (independently cross-checked via `getTokenAccountsByOwner`).
  `PUMPSWAP_MIN_LEN` raised 195 → 203 to cover the corrected fields.
- **Missing decimal adjustment** — `computePumpSwapPriceE6` computed
  `quote_raw / base_raw` directly on raw token-account amounts, ignoring mint
  decimals. pump.fun base tokens are 6dp and the WSOL quote is 9dp, so every
  price was off by exactly 1000x. `computeDexSpotPriceE6` now REQUIRES
  `decimals: { base, quote }` for `pumpswap`, matching the existing
  `meteora-dlmm` contract.
- **Missing SOL→USD conversion** — PumpSwap pools quote in WSOL, not USD;
  the raw ratio was returned unconverted. `computeDexSpotPriceE6` gained an
  optional 5th parameter `solPriceE6`; for WSOL-quoted PumpSwap pools it is
  now REQUIRED (throws a clear error rather than silently mislabeling a
  token/SOL price as USD) and is multiplied in to produce the final USD e6
  price.

### Verified

- ANSEM + 2 other live PumpSwap pools (TripleT, KINS) computed within
  0.1–0.5% of both Jupiter Price API v3 and DexScreener references. The
  pre-fix formula was ~1186% off on all three (a consistent ~12.9x
  overprice: the missing 1000x decimal correction only partially offset by
  the missing ÷SOL-price conversion).
- `dex-oracle.test.ts` extended with decimal-adjustment cases, a
  WSOL-without-`solPriceE6` throw case, and a real mainnet-fixture regression
  test (frozen ANSEM pool + vault bytes, slot 431709958).
- Full `pnpm test` / `pnpm build` / `tsc --noEmit` clean.

### Impact

Any consumer computing PumpSwap prices via `computeDexSpotPriceE6("pumpswap", ...)`
must now pass `decimals` (and `solPriceE6` for WSOL-quoted pools, the
overwhelming majority) — omitting either now throws instead of silently
returning a wrong price. `parsePumpSwapPool` output (mints/vaults) changes
for identical input bytes (previous output was wrong).

---

## [2.0.9] — 2026-05-02

v12.19 `RiskParams` parser fix for user account creation and trading.

### Fixed

- Corrected the v12.19 engine `RiskParams` block size from 184 bytes to
  168 bytes and added the v12.19 field-order parser. The prior parser reused
  v12.15 offsets, which decoded wrapper-only policy slots as huge bogus u128
  values.
- v12.19 `parseParams()` now returns bounded live values for the mainnet slab:
  `newAccountFee=1`, `minInitialDeposit=0`, `minNonzeroMmReq=21`,
  `minNonzeroImReq=22`, `hMin=1000`, and `hMax=50000`.

### Impact

- Fixes frontend `encU64: value exceeds u64 max` when creating a user account
  before placing a trade. The overflow came from `InitUser.feePayment` being
  derived from the mis-parsed `newAccountFee + minInitialDeposit`.

### Verified

- Live mainnet slab `6ka35x...xe8o` parses with `paramsSize=168` and sane
  v12.19 risk params.
- SDK build and full test suite pass.

---

## [2.0.8] — 2026-05-01

Live v12.19 slab parser fix for the first `af43efc` mainnet market.

### Fixed

- Corrected v12.19 SBF RiskEngine bitmap/free-list/account offsets for the
  live small-tier slab layout:
  - bitmap offset: `engine + 736`
  - `num_used_accounts`: `engine + 768`
  - accounts array: `engine + 1800` (`slab + 2416`)
- Routed v12.19 360-byte accounts through the SBF account-field alignment path.
  Without this, `parseAccount` decoded LP capital/kind correctly but returned
  wrong `matcherProgram`, `matcherContext`, and `owner` public keys.

### Verified

- Live mainnet slab `6ka35x...xe8o` parses with one LP account, capital
  `49.999999` USDC, matcher context `DKkw...bSTw`, and owner
  `7JVQ...V5G`.
- SDK build and full test suite pass.

---

## [2.0.7] — 2026-05-01

`SLAB_TIERS_V12_19` layout bump for the mainnet `af43efc` wrapper redeploy.

### Changed

- Updated v12.19 slab sizes to match the redeployed wrapper's `SLAB_LEN`.
  The small tier used by mainnet is now `96_784` bytes. The prior SDK value
  (`96_760`) causes `InitMarket` to fail with `InvalidSlabLen` (`0x4`) against
  the new binary.
- Derived v12.19 tier sizes now include the same +24 byte layout delta:
  `micro=26_872`, `small=96_784`, `medium=376_432`, `large=1_495_024`.

### Verified

- Mainnet dry-run after the `af43efc` redeploy reached the wrapper and rejected
  only the stale SDK slab size (`expected 0x17a10`, got `0x179f8`).

---

## [2.0.6] — 2026-04-29

`encodeInitMarket` always-ext-tail fix. End-to-end InitMarket simulation against the
deployed mainnet program (ESa89R5..., v12.19 `--features small`) on 2026-04-29
showed every base-only payload (304 bytes) is rejected at the wrapper with
`InvalidInstructionData`. Root cause is a wrapper-side bug in the deployed binary:

`read_risk_params` (percolator-prog/src/percolator.rs:2413) requires
`input.len() >= 40` after consuming `min_liquidation_abs`. For a base-only
304-byte payload, only 32 bytes remain (the two trailing u128s). The check fires
**before** the outer decoder's "rest is empty → use defaults" branch
(percolator.rs:1818-1838) is reached, making that branch dead code.

Since the wrapper is deployed and immutable until next upgrade, the fix is
client-side: the SDK now ALWAYS emits the 66-byte extended tail.

### Changed

- **Breaking-ish (wire format)**: `encodeInitMarket` now always returns a
  370-byte payload (304 base + 66 extended tail), regardless of whether the
  caller provides `extendedTail`. Pre-2.0.6 callers shipping the 304-byte
  base-only payload were silently broken against deployed mainnet — they would
  have hit `InvalidInstructionData` at `handle_init_market`.
- When `extendedTail` is omitted, the SDK fills with values mirroring the
  wrapper's `unwrap_or(DEFAULT_*)` config seeds, so the resulting market
  config is identical to what the (now-dead) wrapper "empty rest → defaults"
  path would have produced:
    - `fundingHorizonSlots: 500`  (`DEFAULT_FUNDING_HORIZON_SLOTS`)
    - `fundingKBps: 100`           (`DEFAULT_FUNDING_K_BPS`)
    - `fundingMaxPremiumBps: 500`  (`DEFAULT_FUNDING_MAX_PREMIUM_BPS`)
    - `fundingMaxBpsPerSlot: 1000` (`DEFAULT_FUNDING_MAX_E9_PER_SLOT`)
    - `forceCloseDelaySlots: 1`    (decoder L1837 default for empty rest)
    - all other tail fields: 0

### Caller impact

- Anyone who was relying on 304-byte payloads working: they were broken on
  mainnet. They will now produce 370-byte payloads that succeed.
- Anyone passing an explicit `extendedTail`: behavior unchanged.

### Verified

End-to-end mainnet simulation (`scripts/init-sim-hyperp-v2.mjs`) of hyperp
InitMarket succeeds at 924k CU with the new default tail. Real-launch tx
should set CU limit to ≥1_000_000.

---

## [2.0.5] — 2026-04-29

`discoverMarkets` gap fix. The keeper+indexer alignment audit on 2026-04-29
flagged that `discoverMarkets` in v2.0.4 was missing `SLAB_TIERS_V12_19` in
its `ALL_TIERS` array, causing v12.19 mainnet slabs (96760-byte for `--features small`,
the only kind the deployed program ESa89R5... produces post-2026-04-28
upgrade) to fall through to the memcmp fallback path with no layout hint.

Same class of bug as the earlier GH#1205 / GH#1237 / GH#1238 missed-tier
issues with V1D / V1D_LEGACY. Fix is symmetric: add the tier set, add to
ALL_TIERS, expose via export.

### Added

- `SLAB_TIERS_V12_19` exported from `src/solana/slab.ts`. Contains the four
  v12.19 SBF tier sizes (probe-confirmed via `cargo build-sbf --features
  small` compile assertions on 2026-04-28):
  - `micro` 26848 bytes (64 accounts)
  - `small` 96760 bytes (256 accounts) — deployed mainnet ESa89R5...
  - `medium` 376408 bytes (1024 accounts)
  - `large` 1495000 bytes (4096 accounts)
- `discoverMarkets` ALL_TIERS now includes `SLAB_TIERS_V12_19` (and
  `SLAB_TIERS_V12_17` explicitly, matching the same pattern). `dataSize`
  filter queries now find v12.19 slabs without falling through to memcmp.

### Workaround that no longer needed

The keeper and indexer services were working around this in v2.0.4 by
running per-cycle `fetchSlab` + `auto-detect parse` instead of relying on
`discoverMarkets`. With v2.0.5, `discoverMarkets` returns v12.19 slabs
correctly with the right layout hint up front. Services can simplify
their discovery code if they want, but the workaround keeps working.

### Gates

- pnpm test 792 PASS / 31 SKIPPED.
- pnpm lint clean.
- pnpm build clean.

### Deprecation

v2.0.4 deprecated. Earlier 2.0.0/2.0.1/2.0.2/2.0.3 already deprecated.

---

## [2.0.4] — 2026-04-28

Independent verifier audit caught a real BYTE_DRIFT_BLOCKING bug missed
by the v2.0.3 ship: `parseAccount` and `parseAllAccounts` had no V12_19
branch in the layout-version dispatch at `src/solana/slab.ts:3408`.
V12_19 layouts (accountSize=360) fell through to the pre-v12.15 V_ADL
path which uses wrong field offsets — capital read as 0 instead of the
written value, pnl read as 2^64-1 instead of -123, kind/owner/etc all
shifted +8 from correct positions.

The verifier reproduced the bug empirically by writing known values to
a synthetic 96760-byte slab buffer and reading back via parseAllAccounts.

### Fix (one-liner)

`src/solana/slab.ts:3408` — added V12_19_ACCOUNT_SIZE_SBF (360) to the
`isV12_17` branch dispatch. v12.19 SBF Account is structurally identical
to v12.17 SBF (same field offsets, same SBF alignment correction
d1=8/d2=16, same struct definition). Only difference is 8 bytes of
trailing padding (352 → 360). The v12.17 SBF fast path applies the
correct field offsets for v12.19 too; just needed routing to it.

```diff
- const isV12_17 = layout.accountSize === V12_17_ACCOUNT_SIZE
-               || layout.accountSize === V12_17_ACCOUNT_SIZE_SBF;
+ const isV12_17 = layout.accountSize === V12_17_ACCOUNT_SIZE
+               || layout.accountSize === V12_17_ACCOUNT_SIZE_SBF
+               || layout.accountSize === V12_19_ACCOUNT_SIZE_SBF;
```

### Verifier-confirmed status post-fix

Every read path probe-verified for v12.19:
- detectSlabLayout: V12_19 size detection (96760 small) ✓
- parseHeader: layout.headerLen=136 ✓
- parseConfig: routes V12_19 to parseConfigV12_19 ✓
- parseEngine: V12_19 offsets via accountSize=360 ✓ (verifier ran 18/18 fields round-trip)
- parseAllAccounts: layout.accountsOff dynamic per tier ✓
- parseAccount: V12_19 routes to V12_17 SBF fast path ✓ (this release)

### Verifier-confirmed independent re-derivation

The independent verifier ran `cargo build-sbf --features small` with
their own deliberately-wrong const assertions on `src/percolator.rs`,
captured 38 small-tier SBF layout constants from compile errors, and
matched them against `slab.ts`. All 38 match exactly. The probe
methodology and offset values shipped in v2.0.2/v2.0.3 reproduce
independently.

### Other verifier observations (non-blocking)

- v2.0.3 git tag is at `sync/v12.19-sdk` HEAD; the LOCAL `main` branch
  is at v1.0.0-beta.38 (origin/main was correctly fast-forwarded via
  `git push origin sync/v12.19-sdk:main`, but the local checkout never
  did `git checkout main && git pull`). v2.0.4 will fast-forward local
  main as part of this release.

### Gates

- pnpm test 792 PASS / 31 SKIPPED.
- pnpm lint clean.
- pnpm build clean.

### Deprecations

v2.0.3 deprecated. v2.0.0/2.0.1/2.0.2 already deprecated.

---

## [2.0.3] — 2026-04-28

Closes the parseConfig + parseAccount V12_19 routing gaps left in v2.0.2.

v2.0.2 fixed parseEngine + buildLayoutV12_19 with probe-confirmed SBF
values, but parseConfig still routed v12.19 layouts (accountSize=360) to
the legacy pre-v12.17 fall-through code, which read fields at completely
wrong offsets. v2.0.3 adds parseConfigV12_19 with V12_19 SBF MarketConfig
offsets and routes accountSize=360 layouts to it.

### Account SBF offsets probe (also captured this round)

V12_19 SBF Account size = 360 bytes. Field offsets all probe-confirmed
via `cargo build-sbf --features small` compile errors:

- capital 0, kind 16, pnl 24, reserved_pnl 40, position_basis_q 56
- adl_a_basis 72, adl_k_snap 88, f_snap 104, adl_epoch_snap 120
- matcher_program 128, matcher_context 160, owner 192, fee_credits 224
- sched_present 248, sched_remaining_q 256, sched_anchor_q 272
- sched_start_slot 288, sched_horizon 296, sched_release_q 304
- pending_present 320, pending_remaining_q 328, pending_horizon 344
- pending_created_slot 352

These match V12_17 SBF Account offsets exactly (Account struct definition
is identical between v12.17 and v12.19). The 8-byte size diff (352 vs 360)
is trailing alignment padding, not a new field. parseAccount works
correctly for both versions without changes.

### Added

- `parseConfigV12_19` reads v12.19 MarketConfig at probe-confirmed
  offsets. Major v12.17 vs v12.19 reorderings:
  - `oracle_authority` renamed to `hyperp_authority` at +144 (same offset)
  - `last_effective_price_e6` shifted from +200 to +192
  - `oracle_price_cap_e2bps` shifted from +192 to +216
  - `dex_pool` shifted from +400 to +368
  - `max_pnl_cap` shifted from +432 to +400
  - `oi_cap_multiplier_bps` shifted from +448 to +416
  - new fields: `tvl_insurance_cap_mult` at +202, `hyperp_mark_e6` at +176
  - `pending_admin` shifted from +480 to +448
- parseConfig dispatches V12_19 layouts (accountSize=360) to
  parseConfigV12_19 before the V12_17 / legacy fallthrough.

### Gates

- pnpm test 792 PASS / 31 SKIPPED.
- pnpm lint clean.
- pnpm build clean.

### Status

After v2.0.3: every v12.19 read path is probe-verified.

- detectSlabLayout: returns V12_19 layout for v12.19 sizes (probe-verified)
- parseHeader: reads via layout.headerLen=136 (probe-verified)
- parseConfig: routes V12_19 → parseConfigV12_19 (this release)
- parseEngine: routes V12_19 via accountSize=360, uses V12_19 offsets (v2.0.2)
- parseAllAccounts: uses layout.accountsOff (computed dynamically per tier in v2.0.2)
- parseAccount: V12_17 SBF offsets work for V12_19 (Account struct identical, this release confirms)

### Deprecations

v2.0.0, v2.0.1, v2.0.2 all have residual v12.19 read-path bugs. Deprecate
all three in favor of v2.0.3. Transaction-building paths in all earlier
versions remain byte-correct.

---

## [2.0.2] — 2026-04-28

V12_19 SBF layout fix using authoritative probe-verified values. v2.0.1's
V12_19 constants were speculative and turned out to be wrong on every
value (engineOff, configLen, accountSize, slab tier sizes). v2.0.2
replaces them with values extracted from `cargo build-sbf --features small`
compile-error messages on deliberately-wrong const assertions in the
wrapper. Every value below was confirmed against the same wrapper code
that produced the deployed mainnet binary (sha256 `205c0e77...`).

### Authoritative v12.19 SBF values (replacing v2.0.1's wrong ones)

| constant | v2.0.1 (wrong) | v2.0.2 (probe-confirmed) |
|---|---|---|
| HEADER_LEN | 72 (V12_17 inheritance) | **136** |
| CONFIG_LEN | 528 | **480** |
| ENGINE_OFF | 600 | **616** |
| ACCOUNT_SIZE | 352 (V12_17 inheritance) | **360** |
| SLAB_LEN small | 94168 (cu_benchmark stale) | **96760** |

V12_19 RiskEngine internal offsets (rel to engine start):

| field | v2.0.1 | v2.0.2 |
|---|---|---|
| current_slot | 216 | **200** |
| market_mode | 224 | **208** |
| c_tot | 328 | **312** |
| pnl_pos_tot | 344 | **328** |
| pnl_matured_pos_tot | 360 | **344** |
| oi_eff_long_q | 488 | **472** |
| oi_eff_short_q | 504 | **488** |
| neg_pnl_count | 608 | **584** |
| rr_cursor_position | 616 | **592** |
| last_oracle_price | 640 | **624** |
| fund_px_last | 648 | **632** |
| last_market_slot | 656 | **640** |
| f_long_num | 664 | **648** |
| f_short_num | 680 | **664** |

Account size grew (352 -> 360) and accounts are now INLINE within
RiskEngine struct (was separate in V12_17). For the small tier
(MAX_ACCOUNTS=256), accounts start at engineOff + 1776.

V12_19 MarketConfig SBF offsets newly added:
- hyperp_authority +144
- last_effective_price_e6 +192
- tvl_insurance_cap_mult +202
- oracle_price_cap_e2bps +216
- min_oracle_price_cap_e2bps +224
- maintenance_fee_per_slot +320
- dex_pool +368
- max_pnl_cap +400
- oi_cap_multiplier_bps +416
- pending_admin +448

### Fixed

- `V12_19_SIZES` now contains correct slab sizes
  (26848/96760/376408/1495000) instead of stale cu_benchmark constants.
- `buildLayoutV12_19` computes accountsOff dynamically per tier (accounts
  are inline within RiskEngine starting after `prev_free` + 8-byte align).
- `parseEngine` V12_19 detection switched from
  `engineOff === V12_19_ENGINE_OFF_SBF` (which never matched anything in
  v2.0.1) to `accountSize === V12_19_ACCOUNT_SIZE_SBF` (matches probe-
  confirmed 360 byte v12.19 SBF Account).

### Methodology

Probe values were extracted by adding `#[cfg(target_arch = "sbf")] const _:
[(); 0] = [(); offset_of!(...)]` blocks to the wrapper, running
`cargo build-sbf --features small`, and reading the compile-error
messages that revealed the actual SBF offsets. The wrapper was then
reverted clean (no source changes shipped). Same source as deployed
binary, so values match the deployed program byte-for-byte.

### Gates

- pnpm test 792 PASS / 31 SKIPPED.
- pnpm lint clean.

### Deprecations

v2.0.0 and v2.0.1 are both incorrect for parsing v12.19 slabs. They are
SAFE for transaction building (encoders, account specs, IX_TAGs are all
still byte-correct). Run `npm deprecate @percolatorct/sdk@2.0.0
"v12.19 layout incorrect, use 2.0.2+"` and same for 2.0.1.

---

## [2.0.1] — 2026-04-28

Correctness fix discovered during post-deploy further-verification. The
v2.0.0 V12_19 slab layout incorrectly inherited engine field offsets from
V12_17 SBF, but the V12_19 RiskEngine struct grew significantly (added
resolved_slot, adl_mult/coeff/epoch_*, side_mode_*, stored_pos_count_*,
phantom_dust_bound_*, rr_cursor_position, sweep_generation,
last_market_slot, etc.; removed last_crank_slot and gc_cursor).

### Fixed

- `buildLayoutV12_19` now uses V12_19-specific engine field offsets
  derived by walking the v12.19 RiskEngine struct definition at
  `/Users/khubair/perc-sync/work/percolator/src/percolator.rs:581`,
  cross-checked against probe constants in
  `/Users/khubair/perc-sync/work/percolator-prog/tests/test_conservation.rs:4574,4586`
  and `/Users/khubair/perc-sync/work/percolator-prog/tests/common/mod.rs:2185`:
  - `c_tot` at engine+328 (was 336 in v2.0.0).
  - `pnl_pos_tot` at engine+344 (was 352).
  - `oi_eff_long/short` at engine+488/504 (was 504/520).
  - `last_market_slot` at engine+656 (replaces V12_17 `last_crank_slot`).
  - `rr_cursor_position` at engine+616 (replaces V12_17 `gc_cursor`).
- `parseEngine` recognises V12_19 explicitly via
  `layout.engineOff === V12_19_ENGINE_OFF_SBF` and routes to V12_19
  field offsets instead of conflating with V12_17 SBF.

### Impact

Consumers of v2.0.0 calling `parseEngine` against any v12.19 slab on
mainnet would have read garbage values for `cTot`, `pnlPosTot`,
`pnlMaturedPosTot`, `longOi`, `shortOi`, `lastCrankSlot`, `gcCursor`.
The bug was latent because no v12.19 slabs exist on the deployed program
yet — no markets created post-2026-04-28 upgrade. v2.0.1 fixes it before
the first market is initialised.

Transaction-building paths (encoders, account specs, IX_TAG bytes,
PDAs) were unaffected and remain byte-correct.

### Gates

- pnpm test 792 PASS / 31 SKIPPED.
- pnpm lint clean.
- pnpm build clean.

---

## [2.0.0] — 2026-04-28

Stable release. Cut after the v12.19 mainnet upgrade landed at slot
416196178 (tx `n6UunJ6a7xB3hCd54CMxPszHgkHKoHyaSUdEyTq8rGEz9tmoycBGsrFRVXt3Wkg6fm1ASRaH1p9SR6wEL5o9DBn`)
and post-merge verification confirmed GO.

### Added

- `buildLayoutV12_19` in `src/solana/slab.ts`. Inherits engine internals
  from V12_17 SBF; differs only in `engineOff` (600 vs 584) and
  `configLen` (528 vs 512). Tier sizes match the wrapper's compile-time
  constants in `tests/cu_benchmark.rs:49-64`:
  - `--features micro`: 19_640 bytes (64 accounts).
  - `--features small`: 94_168 bytes (256 accounts) — currently deployed
    to mainnet program `ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv`.
  - `--features medium`: 372_280 bytes (1024 accounts).
  - default: 1_484_728 bytes (4096 accounts).
- `detectSlabLayout` checks V12_19 sizes before V12_17 SBF. The
  collision (94168 in both) resolves to V12_19 in practice because the
  deployed program produces v12.19 slabs only.
- `parseEngine` recognises `engineOff === 600` as V12_19 SBF (same
  internals as V12_17 SBF).

### Mainnet state at release

- program `ESa89R5...` upgraded to v12.19 `--features small`.
- last deployed slot 416196178.
- new binary 626,136 bytes (sha256 `205c0e77865612bd3a529bd851a956acb712543faede318a79c2765ebaa032ea`).

---

## [2.0.0-rc.1] — 2026-04-28

Single-target SDK aligned to wrapper v12.19 (PR #271, branch
sync/v12.19-wrapper, commit d760fc4). The dual v12.17/v12.19 target shape
introduced in 2.0.0-rc.0 is removed because the stale mainnet program at
ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv is being abandoned and the
v12.19 deployment is the next mainnet upgrade.

### Removed

- `src/vanilla.ts` and the `@percolatorct/sdk/vanilla` subpath export.
- `WrapperTarget` type and every `target?: 'v12.17' | 'v12.19'` parameter.
- v12.17 default branches in `encodeInitMarket` and `encodeUpdateConfig`.
- The throw-without-target gate on `encodeInitSharedVault`,
  `encodeAllocateMarket`, `encodeQueueWithdrawalSV`,
  `encodeClaimEpochWithdrawal`, `encodeAdvanceEpoch`.
- `test/parity/v12.17-encoder-bytes.parity.test.ts` and
  `fixtures/parity/v12.17-encoder-bytes.json`.
- `test/vanilla.test.ts` and `VANILLA.md`.

### Changed

- `encodeInitMarket` always emits the 304-byte v12.19 base payload.
  Previously defaulted to 344-byte v12.17 layout. Wrapper anchor:
  `src/percolator.rs:1786` (handle_init_market decode in d760fc4).
- `encodeUpdateConfig` always emits 35 bytes including
  `tvl_insurance_cap_mult: u16`. Wrapper anchor:
  `src/percolator.rs:2027-2041` (handle_update_config decode).
- 5 PERC-628 shared-vault encoders (tags 59-63) emit valid v12.19 bytes
  unconditionally.

### Fixed

- **H-1 ACCOUNTS_TRADE_NOCPI: 4 -> 5** accounts. Inserts clock at index 3.
  Wrapper: `src/percolator.rs:8484` expect_len(5).
- **H-2 ACCOUNTS_TOPUP_INSURANCE: 5 -> 6**. Appends clock at index 5.
  Wrapper: `src/percolator.rs:9256` expect_len(6).
- **H-3 ACCOUNTS_UPDATE_CONFIG: 2 -> 3**. Appends clock at index 2.
  Wrapper: `src/percolator.rs:9544` accepts 3 OR 4 (canonical 3-form).
- **H-4 ACCOUNTS_SET_ORACLE_PRICE_CAP: 2 -> 3**. Appends clock at index 2.
  Wrapper: `src/percolator.rs:9654` expect_len(3).
- **H-5 ACCOUNTS_RESOLVE_MARKET: 2 -> 4**. Appends clock + oracle.
  Wrapper: `src/percolator.rs:9748` expect_len(4).
- **H-7 deriveInsuranceLpMint** seed `"ins_lp"` -> `"lp_vault_mint"`.
  Wrapper: `src/percolator.rs:2543` derive_lp_vault_mint.

### Deferred

- **B-9 V12_19 slab layout descriptor** — V12_19 tier sizes
  (19_640 / 94_168 / 372_280 / 1_484_728) collide with V12_17 SBF tier
  sizes. Disambiguator + buildLayoutV12_19 land post-mainnet-deploy when
  a real v12.19 slab can be fingerprinted. Tracked in
  `audit-2026-04-28-v12.19/FINAL.md`.
- **W-1 wrapper sdk_parity_fixtures.rs** missing `UpdateAuthority` tag 83.
  One-line wrapper patch deferred to user (see
  `audit-2026-04-28-v12.19/phase-4-deferred.md`). `pnpm run parity:check`
  remains red until that lands on PR #271.

### Gates

- `pnpm test`: 792 PASS / 31 SKIPPED (was 832 in rc.0, lost 40 from
  dropped vanilla + v12.17 parity tests).
- `pnpm lint`: clean.
- `pnpm build`: clean. `dist/index.js` = 264 KB (no `dist/vanilla.js`).
- `pnpm run parity:check`: red until W-1 wrapper patch lands.

---

## [2.0.0-rc.0] — 2026-04-27

Two-track package split. Adds `@percolatorct/sdk/vanilla` subpath with
the minimal v12.17.7 deployed-line encoder surface (27 instructions,
28 KB bundle). The default `@percolatorct/sdk` import is unchanged
and continues to expose the full fork-extended surface.

Major version bump because the new subpath export is part of the
public API surface contract per SemVer §5.

### Added

- `src/vanilla.ts` entry point.
- `package.json` `exports` field maps `./vanilla`.
- `tsup.config.ts` emits `dist/vanilla.js` and `dist/vanilla.d.ts`.
- `test/vanilla.test.ts` enforces export-set invariant against
  `audit-2026-04-27/vanilla-subset.md`.
- `VANILLA.md` documents the subset and when to use it.

### Changed

- README adds "two flavors" section.

### Coverage

Tests: 826 -> 832 PASS. 31 SKIPPED unchanged. Bundle sizes:
`dist/index.js` 265 KB, `dist/vanilla.js` 28 KB.

---

## [1.0.0-beta.39-presync] — 2026-04-27

v12.19 forward-port + v12.20 prep. Cut on `sync/v12.19-sdk` branch
because PR #88 (engine) and PR #271 (wrapper) are still OPEN MERGEABLE
at the time of cut. NPM publish is blocked until both PRs merge.

### Added

- `WrapperTarget` type. Encoders whose wire format diverges between
  v12.17 and v12.19 accept `target?: 'v12.17' | 'v12.19'` defaulting
  to `'v12.17'` for backward compatibility.
- `encodeUpdateConfig({ target: 'v12.19', tvlInsuranceCapMult })`
  appends `u16` field for the v12.19 35-byte payload. Wrapper
  anchor: src/percolator.rs:2027 (decode).
- `encodeInitMarket({ target: 'v12.19', ... })` produces the 304-byte
  base payload (drops `maxInsuranceFloor`, `minOraclePriceCap`,
  `minInitialDeposit`). Wrapper anchor: src/percolator.rs:1789-1893.
- PERC-628 shared vault encoders un-throw under `target: 'v12.19'`:
  `encodeInitSharedVault`, `encodeAllocateMarket`,
  `encodeQueueWithdrawalSV`, `encodeClaimEpochWithdrawal`,
  `encodeAdvanceEpoch`. Wrapper anchors: src/percolator.rs:2249-2263.
- 17 v12.19 byte-parity tests at
  `test/parity/v12.19-encoder-bytes.parity.test.ts`.

### Changed

- README documents the new wrapper-version target convention.

### Deferred

`audit-2026-04-27/v12.20-design-notes.md` covers three upstream wrapper
commits (`c175ec4`, `f04720e`, `5229c1c`) deferred per the freeze
policy. Each has a documented migration plan for the next sync session.

### Coverage

Tests: 809 -> 826 PASS. 31 SKIPPED unchanged.

---

## [1.0.0-beta.38] — 2026-04-27

Coverage and correctness audit on the v12.17.7 deployed line. Audit
artifacts under `audit-2026-04-27/`. Wrapper baseline d760fc4
(tag h-new-1-resolved).

### Added

- `encodeUpdateAuthority` (tag 83). v12.18.x 4-way authority split.
  `AUTHORITY_KIND` const map with `Admin=0`, `HyperpMark=1`,
  `Insurance=2`, `InsuranceOperator=4`. Wrapper anchor:
  `src/percolator.rs:6876`.
- `encodeReclaimEmptyAccount` (tag 25). Wrapper handler at
  `src/percolator.rs:10470`. Permissionless §2.6 / §10.7.
- `encodeSettleAccount` (tag 26). Wrapper handler at
  `src/percolator.rs:10503`. Permissionless §10.2.
- `encodeDepositFeeCredits` (tag 27). Wrapper handler at
  `src/percolator.rs:10557`. Owner-only §10.3.1.
- `encodeConvertReleasedPnl` (tag 28). Wrapper handler at
  `src/percolator.rs:10636`. Owner-only §10.4.1.
- `ACCOUNTS_RECLAIM_EMPTY_ACCOUNT`, `ACCOUNTS_SETTLE_ACCOUNT`,
  `ACCOUNTS_DEPOSIT_FEE_CREDITS`, `ACCOUNTS_CONVERT_RELEASED_PNL`,
  `ACCOUNTS_SET_INSURANCE_WITHDRAW_POLICY`, `ACCOUNTS_UPDATE_AUTHORITY`.
- 27 byte-level parity tests under `test/parity/v12.17-encoder-bytes.parity.test.ts`
  pinning encoder output against wrapper decode positions documented
  in `audit-2026-04-27/borsh-audit.md`.
- Coverage gate test enumerating the v12.17.7 reachable instruction
  set and asserting every name has an `IX_TAG` entry.
- `UpdateAuthority` entry in `specs/wrapper-tags.json` and the
  `parity-fixtures.test.ts` `sdkMap`.

### Changed

- `encodeUpdateConfig` jsdoc now documents the v12.17 vs v12.19
  wire format split. v12.17 stays at 33 bytes (4 funding fields).
  v12.19 adds `tvl_insurance_cap_mult: u16` for 35-byte total per
  wrapper commit `4ec51cc`. The v12.19 SDK target lands in beta.39.

### Audit findings

- 0 BLOCKING issues.
- 2 HIGH (G-1 UpdateConfig drift v12.19-only, G-2 UpdateAuthority encoder
  missing). G-2 fixed here. G-1 deferred to beta.39 (v12.19 target).
- 4 MEDIUM (G-3 missing per-account encoders 25-28, G-5 deprecated-but-
  handler-exists tags 59-63, G-6 wrapper parity binary missing tag 83,
  G-7 zero parity coverage). G-3 + G-7 fixed here. G-5 deferred to
  beta.39. G-6 logged at `audit-2026-04-27/wrapper-findings.md`.
- 1 LOW (G-4 missing `ACCOUNTS_SET_INSURANCE_WITHDRAW_POLICY`). Fixed.
- 11 deprecated-both-sides entries verified correct.

### Wrapper findings

`audit-2026-04-27/wrapper-findings.md` records one wrapper-side issue:
`src/bin/sdk_parity_fixtures.rs` omits tag 83 UpdateAuthority. Cannot
push wrapper from this session. Tracked for the next wrapper sync.

### Coverage

Tests: 782 -> 809 PASS. 31 SKIPPED unchanged.

---

## [1.0.0-beta.33] — 2026-04-19

### Fixed

- Corrected SDK drift against the live `percolator-stake`, `percolator-prog`, and `percolator-nft` programs.
- Stake SDK now treats tombstoned admin proxy tags `5-9` and `11` as removed, keeps tag `10` aligned with `ReturnInsurance`, and adds live tag `18` for `SetMarketResolved`.
- Standalone NFT parsing now decodes `positionOwner` from the current on-chain account layout.
- Wrapper instruction encoders for removed or disabled paths now fail fast instead of serializing dead tags.
- Added missing account-order specs for active wrapper handlers including permissionless resolve, resolved force-close, LP vault flows, dispute flows, LP collateral, offset pairs, and orphan recovery.

### Changed

- Tightened parity tests so they assert current on-chain behavior instead of accepting legacy instruction layouts.

## [1.0.0-beta.29] — 2026-04-17

- **BREAKING**: Removed `encodeSetOracleAuthority` (IX 16) and `encodePushOraclePrice` (IX 17). The on-chain program no longer supports admin-pushed oracle prices; all live markets must use Pyth, Chainlink, or Hyperp DEX-fed oracles. Phase G of pre-audit hardening — see percolator-prog commit 5391dc4.

---

## [1.0.0-beta.1] — 2026-04-04

### Changed

- **Version bump to 1.0.0-beta.1** (PERC-8474): SDK is functionally complete and mainnet-ready.
  All 709 tests passing. Bumped from `0.5.1` to `1.0.0-beta.1` for public release preparation.

- **`package.json` exports condition order fixed**: `types` condition moved before `import`/`require`
  to resolve tsup build warnings and follow TypeScript `moduleResolution: "bundler"` best practice.

### Notes

- Not yet published to npm. Awaiting Helius API key provisioning + mainnet market deployment.
- See `RELEASE.md` for full release notes, install instructions, and migration guide.

---

## [1.0.0-rc.6] — 2026-04-04

### Added

- **RPC connection pool (`RpcPool`)** (PR#123, PERC-8453): Multi-endpoint connection pool
  with configurable failover and weighted round-robin strategies. Automatically retries
  transient errors (429, 502, 503, 504, network errors) with exponential backoff. Marks
  endpoints unhealthy after consecutive failures and recovers them automatically.

- **Configurable retry logic (`withRetry`)** (PERC-8453): Standalone exponential-backoff
  retry wrapper for any async function. Supports `maxRetries` (default 3), `baseDelayMs`
  (default 500ms), `maxDelayMs` (default 10s), configurable `jitterFactor`, and custom
  `retryableStatusCodes`.

- **RPC health probe (`checkRpcHealth`)** (PERC-8453): Utility that probes an RPC endpoint
  by calling `getSlot()` and measuring round-trip latency. Returns `{ healthy, latencyMs,
  slot, error }`. Also available as `pool.healthCheck()` for all endpoints at once.

- **Request timeout configuration** (PERC-8453): `RpcPool` supports `requestTimeoutMs`
  (default 30s) applied to every `call()` via `Promise.race`.

- **Full TypeScript types** (PERC-8453): `RetryConfig`, `RpcEndpointConfig`,
  `RpcPoolConfig`, `SelectionStrategy`, `RpcHealthResult` — all exported.

- **57 unit tests** for retry logic, pool behavior, failover, round-robin, timeout handling,
  and health probing.

---

## [1.0.0-rc.5] — 2026-04-04

### Added

- **Tier-3 static bundle fallback for `discoverMarkets()`** (PR#119, PERC-8435):
  When both `getProgramAccounts` (tier 1) and the REST API (tier 2) are unavailable,
  `discoverMarkets()` now falls back to a bundled static list of known slab addresses.
  Addresses are fetched on-chain via `getMarketsByAddress` (`getMultipleAccounts`),
  ensuring all data is still verified on-chain. Enabled by passing `network: "mainnet"`
  (or `"devnet"`) in `DiscoverMarketsOptions`.

- **`discoverMarketsViaStaticBundle()`** (PERC-8435): Standalone function to discover
  markets from a static address list. Used internally by tier-3 fallback and also
  available as a public API for callers who want direct control.

- **Static market registry** (PERC-8435): `getStaticMarkets()`, `registerStaticMarkets()`,
  and `clearStaticMarkets()` — runtime-extensible registry of known slab addresses per
  network. Bundled lists can be augmented at runtime before calling `discoverMarkets()`.

---

## [1.0.0-rc.4] — 2026-04-04

### Added

- **`discoverMarketsViaApi()`** (PR#118, PERC-8424, GH#59): API-first market discovery —
  queries the Percolator REST API (`GET /markets`) for slab addresses, then fetches full
  on-chain data via `getMarketsByAddress` (`getMultipleAccounts`). Works on any RPC
  endpoint including public mainnet nodes. Recommended for mainnet users without a
  Helius API key.

- **`apiBaseUrl` option for `discoverMarkets()`** (PERC-8424, GH#59): When set,
  `discoverMarkets()` automatically falls back to the REST API if `getProgramAccounts`
  returns 0 results or is rejected by the RPC node. Combined with `apiTimeoutMs` for
  timeout control. Enables graceful degradation on public RPCs.

### Changed

- **`discoverMarkets()` memcmp fallback resilience** (PERC-8424): The memcmp fallback
  path (used when all dataSize tier queries fail) now catches its own errors instead of
  propagating, allowing the API fallback to execute when available.

---

## [1.0.0-rc.3] — 2026-04-04

### Added

- **`getMarketsByAddress()`** (PR#105, PERC-8407, GH#59): Fetch and parse Percolator
  markets by known slab addresses using `getMultipleAccounts`. Unlike `discoverMarkets()`
  (which uses `getProgramAccounts` — blocked on public mainnet RPCs), this works on any
  RPC endpoint including `api.mainnet-beta.solana.com`. Supports batching (max 100 per
  call), inter-batch delay, and graceful skipping of invalid/missing accounts.

---

## [1.0.0-rc.2] — 2026-04-04

Post-merge hardening release. 14 PRs merged since rc.1: 5 new utility functions,
8 security/correctness fixes from extended audit, and 1 regression fix.

### New Exports

| Export | PR | Description |
|--------|-----|-------------|
| `computeMaxWithdrawable` | #88 | Calculate maximum withdrawable amount for a position |
| `isAccountFlat` | #89 | Check if an account has no open positions |
| `filterOpenPositions` | #89 | Filter account list to only accounts with open positions |
| `computeWarmupProgress` | #90 | Track position warmup countdown toward full leverage |
| `getSlabHealth` | #92 | Assess market slab health status (utilization, capacity) |

### Fixed

- **`isAdlTriggered` regression** (PR#103, GH#102): Returns `false` for unrecognized slab
  layouts instead of throwing. Defensive fix — matches catch-all behavior at function bottom.
  (PERC-8402)

- **`encodePushOraclePrice` validation** (PR#91): Input validation added to oracle price
  push instruction — rejects invalid price/exponent/confidence inputs before encoding.

- **`computeWarmupLeverageCap` negative input** (PR#94, medium): Negative warmup progress
  values now throw instead of producing nonsensical leverage caps.

- **`computeEmaMarkPrice` overflow** (PR#95, medium): Divides early to prevent integer
  overflow when EMA inputs approach `BigInt(2^53)` boundary.

- **`computeMeteoraDlmmPriceE6` unbounded loop** (PR#96, medium): Exponentiation loop now
  has iteration limit (256) to prevent DoS on malicious bin step values.

- **ADL event parsing truncation** (PR#97, medium): `targetIdx` validated against u16 range
  before `BigInt`→`Number` conversion to prevent silent truncation.

- **`parseAccount` bounds check** (PR#98, medium): `acctOwnerOff` validated against buffer
  length before read — prevents out-of-bounds access on truncated slab data.

- **Validation function Number truncation** (PR#99, low): `Number.MAX_SAFE_INTEGER` checks
  added to all validation utility functions that convert BigInt to Number.

- **ADL ranking sign convention** (PR#100, low): Explicit validation that long-side PnL > 0
  and short-side PnL < 0 in ADL ranking — rejects reversed-sign positions.

### Known Issues

- **GH#59**: `discoverMarkets()` requires a Helius (or equivalent) paid-tier RPC on mainnet.
  Public `api.mainnet-beta.solana.com` rejects `getProgramAccounts`. The `sequential: true`
  mode with retry also fails because the public RPC blocks the call entirely, not just
  rate-limits it. **Workaround for public RPC users**: not currently possible for market
  discovery. Consumers must use a paid RPC provider that supports `getProgramAccounts`.
  A future `getMarketsByAddress()` function using `getMultipleAccounts` (which public RPCs
  do support) is planned as an alternative for callers who already know market addresses.

---

## [1.0.0-rc.1] — 2026-03-31

This is the first release-candidate for `@percolator/sdk` v1. It targets the Percolator V_ADL
on-chain program (mainnet + devnet) and includes every breaking change and new API introduced
since the `0.2.0` baseline.

### Breaking Changes

- **`parseSlab` / `detectSlabLayout` now throw on unrecognized slab sizes.**
  Previously, unrecognized sizes silently returned a null layout or fell back to a best-guess
  parse. Now `detectSlabLayout` returns `null` and callers (including `parseEngine`) throw
  a descriptive error. Update any catch logic that expected a silent fallback.

- **`readNonce` / `readLastThrUpdateSlot` throw on null layout.**
  Both functions now throw `Error("slab layout is null — cannot read nonce/slot")` when
  called with a buffer that has no recognized layout, instead of returning `0n` silently.

- **`computePnlPercent` now throws on BigInt-to-Number precision loss.**
  When `capital` exceeds `Number.MAX_SAFE_INTEGER` the function now throws rather than
  silently returning an inaccurate float. Use the BigInt-based path or scale inputs down.

- **`encodeExecuteAdl` validates `targetIdx` range.**
  Passing a `targetIdx < 0` or `targetIdx > 65535` now throws immediately with a clear message
  instead of silently encoding a truncated u16.

- **`buildIx` / `simulateOrSend` validate `signers` array.**
  Passing an empty signers array now throws before hitting the RPC, rather than causing an
  opaque "missing signature" RPC error.

- **`getProgramId` / `getMatcherProgramId` / `getCurrentNetwork` default to `"devnet"`.**
  The default is intentionally devnet for safety (PERC-697). Pass `"mainnet"` explicitly or set
  `NETWORK=mainnet` in the environment for mainnet operations. Production deployments (Railway)
  always set `NETWORK` explicitly.

- **`encodeSetOiImbalanceHardBlock` / `encodeSetOracleAuthority` tag slots changed.**
  These were emitted with incorrect tags in `0.1.x`. Tags are now correct:
  `SetOiImbalanceHardBlock = 71`, `SetOracleAuthority = 16`.

### New Exports

The following symbols are now part of the public API (all re-exported from the root index):

#### ADL types and functions (PERC-8278 / PERC-8312)

| Export | Description |
|--------|-------------|
| `AdlRankedPosition` | Ranked position record (idx, pnl, pnlPct, side, adl_rank) |
| `AdlRankingResult` | Full ranking snapshot: `ranked[]`, top `longs`/`shorts`, `isTriggered` |
| `AdlEvent` | Decoded on-chain `ExecuteAdl` event log entry |
| `AdlApiRanking` | Single ranked position from `/api/adl/rankings` HTTP endpoint |
| `AdlApiResult` | Full HTTP API response including trigger flags and insurance state |
| `AdlSide` | `"long" \| "short"` |
| `fetchAdlRankedPositions` | Fetch slab, rank all open positions by PnL% (requires RPC) |
| `rankAdlPositions` | Pure (no-RPC) ranking of already-fetched slab bytes |
| `isAdlTriggered` | Check if slab's `pnl_pos_tot` exceeds `max_pnl_cap` |
| `buildAdlInstruction` | Build a single `ExecuteAdl` `TransactionInstruction` |
| `buildAdlTransaction` | Fetch + rank + pick top target + return instruction |
| `parseAdlEvent` | Decode `AdlEvent` from transaction log lines |
| `fetchAdlRankings` | Fetch ADL rankings from `/api/adl/rankings` HTTP endpoint |

#### Error codes 61–65

| Code | Name | Trigger |
|------|------|---------|
| 61 | `EngineSideBlocked` | Trade blocked — dominant side in DrainOnly/ResetPending mode |
| 62 | `EngineCorruptState` | Critical: slab state invariant violated |
| 63 | `InsuranceFundNotDepleted` | ADL rejected — insurance fund still has balance > 0 |
| 64 | `NoAdlCandidates` | ADL rejected — no eligible positions to deleverage |
| 65 | `BankruptPositionAlreadyClosed` | ADL rejected — target position already closed |

All five codes are included in `PERCOLATOR_ERRORS`, returned by `decodeError(code)`,
and parsed automatically by `parseErrorFromLogs(logs)`.

#### Admin instruction helpers (PERC-8110 / PERC-8180)

| Export | Description |
|--------|-------------|
| `encodeSetOiImbalanceHardBlock` | Encode `SetOiImbalanceHardBlock` instruction data (tag=71) |
| `ACCOUNTS_SET_OI_IMBALANCE_HARD_BLOCK` | Account descriptor for the instruction |
| `encodeSetOracleAuthority` | Encode `SetOracleAuthority` instruction data (tag=16) |
| `ACCOUNTS_SET_ORACLE_AUTHORITY` | Account descriptor for the instruction |
| `IX_TAG` | Instruction tag enum — all 65+ instruction tags |

#### Shared vault instructions (PERC-628)

`QueueWithdrawalSV`, `ClaimEpochWithdrawal`, `AdvanceEpoch` are now exported instruction tags.

#### Slab layout constants (PERC-8271)

| Export | Description |
|--------|-------------|
| `SLAB_TIERS_V_ADL` | ADL-upgraded slab tier sizes (SLAB_LEN = 1,288,304 bytes) |
| `ALL_TIERS` | All known slab tier sizes for multi-tier market discovery |
| `validateSlabDataSize` | Returns true if size matches a known tier |

### Fixed

- **Security audit (0x-SquidSol, PR#82):** 20 hardening fixes merged from independent audit:
  - `encU8` / `encU16` / `encU32`: range-check before encode — prevents silent truncation
  - `encPubkey`: descriptive error for invalid inputs (null, wrong length, non-base58)
  - `computePnlPercent`: BigInt-to-Number precision guard
  - `parseErrorFromLogs`: hex string bounded to 8 chars to prevent ReDoS
  - `buildAdlInstruction`: signer array and `targetIdx` validation
  - `stake.ts`: Buffer removed — fully browser-compatible via `DataView`
  - `price-router`: removed `as any` casts; added URL-encode for token mint; default fetch timeout
  - `dex-oracle`: `decimals` and `binStep` validated to prevent arithmetic DoS
  - `config`: `process.env` reads guarded for browser environments
  - `slab`: `postBitmap` guard to prevent misreading V1D engine fields
  - `slab`: bitmap–capacity mismatch warning logged when `usedAccounts > slabCapacity`
  - `discovery`: unrecognized slab layouts skipped with warning instead of fallback parse
  - `simulateOrSend`: non-ok HTTP response handled before null-deref

- **RPC concurrency cap** (PR#50): `discoverMarkets()` now caps parallel tier queries at 6
  (configurable via `maxParallelTiers`). This prevents accidental RPC storms when using public
  or free-tier endpoints. On a Helius Starter plan, pass `sequential: true` to serialize
  tier queries with exponential backoff.

- **Market discovery memcmp fallback** (PR#9): If the primary `getProgramAccounts` with
  `dataSize` filter returns empty, the SDK now retries with a memcmp magic-byte filter.

- **V1 slab layout** (PR#12): `SLAB_TIERS` updated to match deployed V1 on-chain values.

- **V_ADL slab SLAB_LEN** (PERC-8271): Updated from 1,025,880 to 1,288,304 bytes after
  `Account` and `RiskEngine` struct additions for ADL state fields.

- **Mainnet program IDs** (GH#1689): `getProgramId("mainnet")` and `getMatcherProgramId("mainnet")`
  now return the correct deployed mainnet addresses.

- **`parseEngine` exception handling:** Wrapped in try/catch — malformed slab data logs a
  warning and returns `null` instead of crashing the caller.

### Deprecated

- `discoverMarkets()` called without `maxParallelTiers` on public RPC endpoints may return
  partial results or 429 errors. Pass `{ sequential: true }` or use a Helius paid-tier key.
  This behaviour will be enforced in `1.0.0` final.

---

## [0.2.0] — 2026-01-10

Initial public release. See git history for full commit log.
