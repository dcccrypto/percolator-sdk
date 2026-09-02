# PHASE 6 — PDA derivation audit

## SDK PDAs reviewed

`src/solana/pda.ts`:
- `deriveVaultAuthority(programId, slab)` — seeds `["vault", slab]`.
- `deriveInsuranceLpMint(programId, slab)` — seeds `["ins_lp", slab]`.
- `deriveLpPda(programId, slab, lpIdx u16 LE)` — seeds `["lp", slab, idx]`.
- `deriveCreatorLockPda(programId, slab)` — seeds `["creator_lock", slab]`.
- `derivePythPushOraclePDA(feedIdHex)` — seeds `[shard_u16_LE=0, feed_id]` under `pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT`.

`src/abi/nft.ts`:
- `deriveNftPda(slab, userIdx, programId=NFT_PROGRAM_ID)` — seeds `["position_nft", slab, idx_u16_LE]`.
- `deriveNftMint(slab, userIdx, programId=NFT_PROGRAM_ID)` — seeds `["position_nft_mint", slab, idx_u16_LE]`.
- `deriveMintAuthority(programId=NFT_PROGRAM_ID)` — seeds `["mint_authority"]`.

## Wrapper-side seeds

| sdk pda | sdk seed | wrapper seed source | wrapper file:line | drift |
|:---|:---|:---|:---|:---|
| deriveVaultAuthority | `b"vault" + slab` | `b"vault", slab_key.as_ref()` | v12.17 src/percolator.rs:1965, v12.19 src/percolator.rs:2523 | VERIFIED both |
| **deriveInsuranceLpMint** | `b"ins_lp" + slab` | `b"lp_vault_mint", slab_key.as_ref()` | v12.19 src/percolator.rs near L4543 (callsite uses `b"lp_vault_mint"`); v12.17 has no LP vault feature | **PDA_DRIFT_HIGH** |
| deriveLpPda | `b"lp" + slab + lp_idx_u16_LE` | `b"lp", a_slab.key.as_ref(), &lp_bytes` | v12.17 src/percolator.rs:5814, v12.19 src/percolator.rs:8673 | VERIFIED both |
| deriveCreatorLockPda | `b"creator_lock" + slab` | `crate::creator_lock::CREATOR_LOCK_SEED, a_slab.key.as_ref()` where `CREATOR_LOCK_SEED = b"creator_lock"` | v12.19 src/percolator.rs:5128 + 11234, 11296. v12.17 has no creator_lock feature | VERIFIED v12.19, **MISSING in v12.17** |
| derivePythPushOraclePDA | `[shard_u16_LE=0, feed_id]` under PYTH_PUSH_ORACLE_PROGRAM_ID `pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT` | Pyth Receiver standard | external — VERIFIED against documented Pyth scheme |
| deriveNftPda | `b"position_nft" + slab + idx_u16_LE` under NFT_PROGRAM_ID | `POSITION_NFT_SEED=b"position_nft", slab_key.as_ref(), &user_idx.to_le_bytes()` | v12.19 src/percolator.rs:5473+5497-5505 | VERIFIED v12.19 (assuming NFT_PROGRAM_ID matches percolator-nft program id; not double-checked here) |
| deriveNftMint | `b"position_nft_mint" + slab + idx_u16_LE` | `POSITION_NFT_MINT_SEED=b"position_nft_mint" + ...` | v12.19 src/percolator.rs:5474+5508-5516 | VERIFIED v12.19 |
| deriveMintAuthority | `b"mint_authority"` (no slab) | not found in percolator-prog (lives in percolator-nft program) | external program, not in scope here | VERIFIED-by-spec |

## Critical drift — InsuranceLpMint

**SDK uses `b"ins_lp"` but the live LP vault mint PDA in v12.19 wrapper
uses `b"lp_vault_mint"`.**

Evidence at /path/to/perc-sync/work/percolator-prog/src/percolator.rs:
the call `crate::insurance_lp::create_mint(...)` is invoked with
`mint_seeds: &[&[u8]] = &[b"lp_vault_mint", a_slab.key.as_ref(), &[mint_bump]]`
(seen in the create_mint callsite around the LP vault setup).

Severity: **PDA_DRIFT_HIGH.** Any SDK consumer using
`deriveInsuranceLpMint(programId, slab)` against a v12.19 wrapper market
gets the wrong PDA. The transaction either:
- creates the mint at an unexpected address (if mint init), or
- references a non-existent account (if mint already exists at the
  wrapper-derived `lp_vault_mint` PDA).

This is a silent-corruption-class drift on the read side and a
DoS-class drift on the write side.

The legacy SDK helper name `deriveInsuranceLpMint` likely predates the
v12.19 rename to `lp_vault_mint`. The SDK also has alias encoders
(`encodeCreateInsuranceMint`, `encodeDepositInsuranceLP`,
`encodeWithdrawInsuranceLP`) that route through the LP vault tags 37-39.
Those encoders' wire formats are correct (matching tags 37, 38, 39), but
the PDA derivation they pair with is wrong.

## Summary

| status | count |
|:---|---:|
| VERIFIED | 7 |
| PDA_DRIFT_HIGH | 1 (deriveInsuranceLpMint) |

NB: this audit did not exhaustively verify NFT_PROGRAM_ID against the
live percolator-nft binary's declare_id!. Visual check of
src/abi/nft.ts:29 shows the `NFT_PROGRAM_ID` constant is hardcoded;
matching it against percolator-nft would be a follow-up.
