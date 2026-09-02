# Drift Report — independent verification 2026-04-27

SDK at /path/to/percolator-sdk @ sync/v12.19-sdk (HEAD ~911e879).
Wrapper v12.17 at /tmp/wrapper-v12.17 @ 06f86fb (mainnet pin, dated
2026-04-22).
Wrapper v12.19 at /path/to/perc-sync/work/percolator-prog @ d760fc4.

## BLOCKING (10 findings)

### B-1 Tag 12 UpdateAdmin DELETED on v12.17 mainnet
- **severity:** BYTE_DRIFT_BLOCKING
- **target:** v12.17 mainnet pin
- **sdk:** `IX_TAG.UpdateAdmin = 12` (src/abi/instructions.ts:30); `encodeUpdateAdmin` (src/abi/instructions.ts:713) sends tag 12 + Pubkey = 33 bytes.
- **wrapper:** /tmp/wrapper-v12.17/src/percolator.rs:1672 comment "Tag 12 (UpdateAdmin) deleted — use UpdateAuthority { kind: AUTHORITY_ADMIN } (tag 32)". Decode arm absent → InvalidInstructionData.
- **expected:** wrapper accepts tag 12.
- **actual:** wrapper rejects.
- **impact:** every SDK call to encodeUpdateAdmin against mainnet fails with InvalidInstructionData.

### B-2 Tag 14 UpdateConfig wire-format short on v12.17 default
- **severity:** BYTE_DRIFT_BLOCKING
- **target:** v12.17 mainnet pin AND v12.19
- **sdk:** `encodeUpdateConfig({...})` v12.17 default produces 33 bytes (4 funding fields).
- **wrapper:** v12.17 src/percolator.rs:1678-1693 reads 5 fields: 4 funding + `tvl_insurance_cap_mult: u16` = 35 bytes. Trailing-byte guard rejects 33-byte payload. v12.19 same shape at src/percolator.rs:2027-2041.
- **expected:** SDK default emits 35 bytes.
- **actual:** SDK default emits 33 bytes; wrapper rejects.
- **impact:** every SDK call to encodeUpdateConfig (without explicit `target: 'v12.19'`) fails on both v12.17 mainnet and v12.19 wrapper.
- The audit-2026-04-27 STAGE I report claimed "v12.17 = 33 bytes correct" based on a misread of when tvl_insurance_cap_mult was added (commit 4ec51cc, 2026-04-21). Mainnet pin (06f86fb, 2026-04-22) is AFTER 4ec51cc.

### B-3 Tag 22 SetInsuranceWithdrawPolicy DELETED on v12.17 mainnet
- **severity:** BYTE_DRIFT_BLOCKING
- **target:** v12.17 mainnet pin
- **sdk:** `IX_TAG.SetInsuranceWithdrawPolicy = 22` (src/abi/instructions.ts:41); `encodeSetInsuranceWithdrawPolicy` (src/abi/instructions.ts:1891) sends tag 22 + payload = 51 bytes.
- **wrapper:** v12.17 src/percolator.rs:1715 comment "Tag 22 (SetInsuranceWithdrawPolicy) deleted — policy was folded into config fields set at init/via UpdateConfig". Decode arm absent.
- **impact:** every SDK call fails on mainnet.

### B-4 Tag 32 SetPythOracle / UpdateAuthority collision on v12.17
- **severity:** BYTE_DRIFT_BLOCKING
- **target:** v12.17 mainnet pin
- **sdk:** `IX_TAG.SetPythOracle = 32` (src/abi/instructions.ts:59) → encoder throws (deprecated).
- **wrapper:** v12.17 src/percolator.rs:1759-1764 — tag 32 is **UpdateAuthority { kind: u8, new_pubkey: Pubkey }**.
- **impact:** SDK has no encoder targeting tag 32 with the UpdateAuthority payload. SDK's `encodeUpdateAuthority` instead targets tag 83 which mainnet rejects. The instruction IS reachable on mainnet but the SDK has no working encoder for it.

### B-5 Tag 83 UpdateAuthority not in v12.17 wrapper
- **severity:** BYTE_DRIFT_BLOCKING
- **target:** v12.17 mainnet pin
- **sdk:** `IX_TAG.UpdateAuthority = 83` (src/abi/instructions.ts:159); `encodeUpdateAuthority` sends tag 83 + kind + pubkey = 34 bytes.
- **wrapper v12.17:** tag 83 unmapped; `_ => InvalidInstructionData`.
- **wrapper v12.19:** tag 83 = UpdateAuthority (correct).
- **impact:** SDK encodeUpdateAuthority is broken on mainnet (B-4 + B-5 are the same root cause from different angles).

### B-6 Tag 82 AcceptAdmin not in v12.17 wrapper
- **severity:** BYTE_DRIFT_BLOCKING
- **target:** v12.17 mainnet pin
- **sdk:** `IX_TAG.AcceptAdmin = 82`; encoder tag-only.
- **wrapper v12.17:** tag 82 unmapped (v12.17 wrapper uses single-shot UpdateAuthority instead of two-step Accept).
- **impact:** SDK encodeAcceptAdmin fails on mainnet.

### B-7 Tag 0 InitMarket wire-format excess on v12.17 default
- **severity:** BYTE_DRIFT_BLOCKING
- **target:** v12.17 mainnet pin
- **sdk:** `encodeInitMarket({...})` default mode emits 344 bytes (header 120 + maxInsuranceFloor 16 + minOraclePriceCap 8 + RiskParams 184 + minInitialDeposit 16).
- **wrapper v12.17:** decode at /tmp/wrapper-v12.17/src/percolator.rs:1465-1556 expects 296 bytes minimal (header 144 incl. min_oracle_price_cap_e2bps + risk_params 152 WITHOUT insurance_floor and WITHOUT min_initial_deposit) or 296+66=362 with extended tail.
- **diff:** SDK +48 bytes (maxInsuranceFloor 16 + insurance_floor 16 + min_initial_deposit 16). 48 < 66 extended-tail threshold, ≠ 0 → wrapper rejects with InvalidInstructionData.
- **impact:** every SDK call to encodeInitMarket (without `target: 'v12.19'`) fails on mainnet.

### B-8 dist/ stale relative to src/
- **severity:** BYTE_DRIFT_BLOCKING (per Phase 10 brief rule)
- **target:** consumers of bundled `dist/`
- **sdk:** `dist/index.js` does not contain the v12.19 target branches in `encodeInitMarket` or `encodeUpdateConfig` from sync/v12.19-sdk source.
- **impact:** anyone importing `@percolatorct/sdk` from npm or the committed dist gets the v12.17 default behavior even when passing `target: 'v12.19'`. This makes the audit-2026-04-27 STAGE II "fix" effectively unshippable from the committed bundle.

### B-9 v12.19 slab layout missing in detectSlabLayout
- **severity:** LAYOUT_DRIFT_BLOCKING
- **target:** v12.19 read paths
- **sdk:** `detectSlabLayout` (src/solana/slab.ts:1841) enumerates V12_17 sizes only.
- **wrapper v12.19:** vault offset shifted +16 bytes; tier sizes changed (per closeout note).
- **impact:** SDK consumers reading a v12.19 slab account get either `null` or a stale V12_17 layout. parseHeader/parseConfig/parseAllAccounts return wrong fields.
- This is acknowledged-and-deferred in audit-2026-04-27/STAGE_II_FINAL.md but for mainnet upgrade purposes is BLOCKING.

### B-10 parity:check red
- **severity:** BYTE_DRIFT_BLOCKING (per Phase 10 brief rule)
- **target:** CI / wrapper-side parity binary
- **issue:** wrapper's `src/bin/sdk_parity_fixtures.rs` does not enumerate tag 83 UpdateAuthority. SDK's `specs/wrapper-tags.json` does. `pnpm run parity:check` exits 1 with diff. CI gate red.

## HIGH (8 findings)

### H-1 ACCOUNTS_TRADE_NOCPI undercount
- **severity:** ACCOUNT_SPEC_DRIFT_HIGH
- **target:** both v12.17 and v12.19
- **sdk:** ACCOUNTS_TRADE_NOCPI = 4 accounts.
- **wrapper:** expect_len 5 (both versions).
- **impact:** solana runtime rejects with NotEnoughAccountKeys.

### H-2 ACCOUNTS_TOPUP_INSURANCE missing clock
- **severity:** ACCOUNT_SPEC_DRIFT_HIGH
- **target:** both v12.17 and v12.19
- **sdk:** 5 accounts (user, slab, userAta, vault, tokenProgram).
- **wrapper:** 6 (adds clock at index 5).
- **impact:** runtime rejects.

### H-3 ACCOUNTS_UPDATE_CONFIG missing clock + oracle
- **severity:** ACCOUNT_SPEC_DRIFT_HIGH
- **target:** both
- **sdk:** 2 accounts (admin, slab).
- **wrapper v12.17:** 4 accounts (admin, slab, clock, oracle).
- **wrapper v12.19:** 3 OR 4 accounts (handle_update_config accepts both per L9542).
- **impact:** runtime rejects on v12.17; rejects on v12.19 (since SDK 2 ≠ 3 or 4).

### H-4 ACCOUNTS_SET_ORACLE_PRICE_CAP missing clock
- **severity:** ACCOUNT_SPEC_DRIFT_HIGH
- **target:** both
- **sdk:** 2 (admin, slab).
- **wrapper:** 3 (admin, slab, clock).
- **impact:** runtime rejects.

### H-5 ACCOUNTS_RESOLVE_MARKET missing clock + oracle
- **severity:** ACCOUNT_SPEC_DRIFT_HIGH
- **target:** both
- **sdk:** 2 (admin, slab).
- **wrapper:** 4 (admin, slab, clock, oracle).
- **impact:** runtime rejects.

### H-6 ACCOUNTS_RESOLVE_PERMISSIONLESS overcount on v12.17
- **severity:** ACCOUNT_SPEC_DRIFT_HIGH
- **target:** v12.17 mainnet pin
- **sdk:** 3 accounts.
- **wrapper v12.17:** 2 (slab, clock).
- **wrapper v12.19:** 3 (matches SDK).
- **impact:** runtime rejects on v12.17 only.

### H-7 deriveInsuranceLpMint wrong PDA seed
- **severity:** PDA_DRIFT_HIGH
- **target:** v12.19 (LP vault feature not in v12.17)
- **sdk:** seeds `[b"ins_lp", slab]` at src/solana/pda.ts:23-30.
- **wrapper:** `[b"lp_vault_mint", slab, &[bump]]` (LP vault create_mint callsite).
- **impact:** SDK derives the wrong PDA. LP vault transactions reference a non-existent account.

### H-8 PushHyperpMark + CatchupAccrue missing encoders for live v12.17 tags
- **severity:** ACCOUNT_SPEC_DRIFT_HIGH (treated as missing-coverage)
- **target:** v12.17 mainnet pin
- **sdk:** no encoder for tag 17 PushHyperpMark or tag 31 CatchupAccrue. SDK comments claim both removed.
- **wrapper v12.17:** both live (decode arms at /tmp/wrapper-v12.17/src/percolator.rs:1695-1702 and 1758).
- **impact:** SDK consumers cannot drive Hyperp mark updates or trigger catchup-accrue on mainnet.

## MEDIUM (5 findings)

### M-1 Error code map drifted from position 28
- **severity:** ERROR_DRIFT_MEDIUM
- **target:** both
- **detail:** SDK PERCOLATOR_ERRORS positions 28-31+ name old InsuranceLP errors; wrapper enum has EngineCorruptState (28), MarketPaused (29), LpVaultInvalidFeeShare (30), LpVaultAlreadyExists (31), etc. Likely 30+ misalignment.

### M-2 PHASE transition thresholds inert
- **severity:** CONST_DRIFT_MEDIUM
- **target:** both
- **detail:** SDK exports PHASE1_MIN_SLOTS / PHASE1_VOLUME_MIN_SLOTS / PHASE2_VOLUME_THRESHOLD / PHASE2_MATURITY_SLOTS and `checkPhaseTransition`. Wrapper's `check_phase_transition` is a no-op returning ORACLE_PHASE_MATURE always. SDK helper produces an answer the chain ignores.

### M-3 ~40 v12.19-only encoders TAG-NOT-LIVE on v12.17
- **severity:** TAG-NOT-LIVE (encoder exists, mainnet rejects)
- **target:** v12.17 mainnet pin
- **detail:** Tag 34 UpdateHyperpMark, tags 37-41 LP vault, tags 43-46 dispute/LP collateral, tags 47-50 queue/ADL, 51-56 audit/cross-margin/oracle phase, 59-83 (most). All wired in SDK and v12.19 wrapper, all rejected by v12.17 mainnet wrapper. Calling them produces InvalidInstructionData (benign rejection, not corruption) but no useful operation.

### M-4 wrapper-tags.json spec ahead of cargo binary
- **severity:** see B-10 (already covered)

### M-5 InitMarket v12.19 target produces correct length but consumers use stale dist
- **severity:** see B-8

## LOW (3 findings)

### L-1 RENOUNCE_ADMIN_CONFIRMATION + UNRESOLVE_CONFIRMATION dead constants
- **severity:** DOC_DRIFT_LOW
- **target:** both
- **detail:** SDK exports these confirmation constants but the corresponding instructions (RenounceAdmin, UnresolveMarket) were removed. Encoders throw `removedInstruction(...)`. Constants are dead.

### L-2 encodeFundMarketInsurance arg type lacks string union
- **severity:** TYPE_NARROWING_HIGH-related but trivial
- **target:** both
- **detail:** `encodeFundMarketInsurance(args: { amount: bigint })` at src/abi/instructions.ts:1087 takes `amount: bigint` only, not `bigint | string`. UX inconsistency vs other encoders. Underlying `encU64` accepts both.

### L-3 SDK comment "// 16, 17 — removed in v1.0.0-beta.29 (Phase G admin-push oracle removal)" is wrong for v12.17 mainnet
- **severity:** DOC_DRIFT_LOW (related to H-8 missing PushHyperpMark encoder)
- **target:** v12.17 mainnet pin
- **detail:** Tag 17 PushHyperpMark IS live on mainnet. SDK comment claims it's removed.

## VERIFIED (counts only)

| category | verified count |
|:---|---:|
| IX_TAG byte values matching wrapper variant decode arm | 33 (over both versions) |
| Encoder field-by-field match wrapper read order/widths | 21 v12.17 reachable + ~40 v12.19-only |
| Account specs match wrapper expect_len | 14+ |
| Slab MAGIC = 0x504552434f4c4154 ("PERCOLAT") | 1 |
| LiquidationPolicy enum (FullClose=0, ExactPartial=1, TouchOnly=0xFF) | 3 |
| AUTHORITY_KIND constants (Admin=0, HyperpMark=1, Insurance=2, InsuranceOperator=4) | 4 |
| MARK_PRICE_EMA_WINDOW_SLOTS / ALPHA_E6 | 2 |
| ORACLE_PHASE_NASCENT/GROWING/MATURE | 3 |
| Matcher constants (MATCHER_MAGIC, sizes, offsets) | 8 |
| PDA derivations (vault, lp, creator_lock, position_nft, position_nft_mint, mint_authority, pyth) | 7 |
| Error codes positions 0-27 | 28 |
| Encoding primitives (encU8/16/32/64/128, encI64/128, encPubkey, encBool, concatBytes) — endianness, signedness | 10 |

## Total

| severity | count |
|:---|---:|
| BLOCKING | 10 |
| HIGH | 8 |
| MEDIUM | 5 |
| LOW | 3 |
| VERIFIED | ~130 individual claims |
