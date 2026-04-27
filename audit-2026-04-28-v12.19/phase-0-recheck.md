# PHASE 0 — recon + recheck

## PR state (rechecked 2026-04-28)

| pr | state | mergeable | mergeStateStatus | head |
|---|---|---|---|---|
| #88 (engine) | OPEN | MERGEABLE | BLOCKED (review required) | c32bc0b |
| #271 (wrapper) | OPEN | MERGEABLE | CLEAN | d760fc4 |

both still open, no flips. proceed.

## SDK state

- repo: /Users/khubair/percolator-sdk
- branch: sync/v12.19-sdk
- HEAD: 911e879
- version: 2.0.0-rc.0
- working tree: dist/ has uncommitted edits (will be regenerated in PHASE 5). audit-2026-04-27-verify/ untracked. otherwise clean.

## v12.19 wrapper anchors (d760fc4)

instruction tag presence in `pub fn decode` at src/percolator.rs:1784 (sample):

| tag | variant | present in d760fc4 | sdk has encoder | action |
|---|---|---|---|---|
| 11 / 15 | SetRiskThreshold / SetMaintenanceFee | rejected explicitly | thrown | keep |
| 12 | UpdateAdmin | YES | yes | keep |
| 14 | UpdateConfig | YES (5 fields, 35 bytes) | encoder defaults to 33 (4 fields) | fix payload in PHASE 3 |
| 16 / 17 | (reserved) / PushHyperpMark | rejected explicitly | thrown | keep |
| 18 | SetOraclePriceCap | YES | yes | keep |
| 19 | ResolveMarket | YES | yes | keep |
| 22 | SetInsuranceWithdrawPolicy | YES (fork-retained) | yes | keep |
| 31 | CatchupAccrue | NO (no dispatch arm in v12.19) | already removed/throw | keep |
| 32 | SetPythOracle | (verify) | thrown | keep — sdk treats as removed |
| 82 | AcceptAdmin | YES (src/percolator.rs:2139) | yes | keep |
| 83 | UpdateAuthority | YES (src/percolator.rs:2140) | yes | keep |

## account spec drift expectations

| spec | sdk count | wrapper expect_len | wrapper file:line | accounts in order |
|---|---|---|---|---|
| TRADE_NOCPI | 4 | **5** | src/percolator.rs:8484 | user(s+w), lp(s+w), slab(w), clock, oracle |
| TOPUP_INSURANCE | 5 | **6** | src/percolator.rs:9256 | user(s+w), slab(w), userAta(w), vault(w), tokenProgram, clock |
| UPDATE_CONFIG | 2 | **3** OR 4 | src/percolator.rs:9544 | admin(s+w), slab(w), clock, [oracle optional] |
| SET_ORACLE_PRICE_CAP | 2 | **3** | src/percolator.rs:9654 | admin(s+w), slab(w), clock |
| RESOLVE_MARKET | 2 | **4** | src/percolator.rs:9748 | admin(s+w), slab(w), clock, oracle |
| RESOLVE_PERMISSIONLESS | 3 | 3 | src/percolator.rs:10705 | slab(w), clock, oracle | OK already |

## payload drift

`encodeUpdateConfig` v12.17 default:
- emits 33 bytes (1 tag + 4 funding fields)
- v12.19 wrapper at src/percolator.rs:2027-2041 reads 5 fields including `tvl_insurance_cap_mult: u16` = 35 bytes total.
- fix: drop the v12.17 default. always emit 35 bytes with `tvl_insurance_cap_mult` (default 0 if user does not pass).

## PDA drift

`deriveInsuranceLpMint` at src/solana/pda.ts:
- current seeds: `[textEncoder.encode("ins_lp"), slab.toBytes()]`
- wrapper at src/percolator.rs:2543-2545 derive_lp_vault_mint uses `[b"lp_vault_mint", slab_key.as_ref()]`
- fix: change seed to `"lp_vault_mint"`. update jsdoc.

## slab layout

`detectSlabLayout` at src/solana/slab.ts has entries for: V0, V1, V1D, V2, V_ADL, V12_1, V12_15, V12_17.
NO V12_19 entry. fix in PHASE 3:
- V12_19 SLAB_LEN: 1_525_720 (per closeout)
- V12_19 vault offset: 616 (was 600 in V12_17, +16 shift)
- engine field offsets and BITMAP_OFF derived from engine repo at /Users/khubair/perc-sync/work/percolator @ c32bc0b state/engine.rs (or equivalent module)

## wrapper W-1 in PHASE 4

`/Users/khubair/perc-sync/work/percolator-prog/src/bin/sdk_parity_fixtures.rs` enumerates 78 tags but stops at tag 82. missing tag 83 UpdateAuthority. fix is a single line addition in PHASE 4.

## removed encoders worth confirming stay removed

- tag 17 PushHyperpMark: removed in v12.19 dispatcher (16 | 17 => Err InvalidInstructionData). SDK already has it as `removedInstruction` throw. CORRECT.
- tag 31 CatchupAccrue: no dispatch arm in d760fc4. SDK encoder must throw. confirm in PHASE 1.
- tags 11 / 15: explicitly rejected. SDK throws. CORRECT.
- tag 16: explicitly rejected. SDK throws. CORRECT.

## decision summary

scope confirmed: 5 account spec fixes, 1 PDA fix, 1 slab layout addition, 1 payload fix (UpdateConfig), 1 wrapper-side W-1, vanilla + v12.17 paths dropped, dist rebuild, version bump to 2.0.0-rc.1.
