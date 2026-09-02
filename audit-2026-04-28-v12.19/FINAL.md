# FINAL — v12.19-only SDK alignment

**Date:** 2026-04-28.
**SDK:** `/path/to/percolator-sdk` @ branch `sync/v12.19-sdk` HEAD `<latest>`. Tag `v2.0.0-rc.1`.
**Wrapper target:** `d760fc4` (PR #271, branch `sync/v12.19-wrapper`).
**Engine target:** `c32bc0b` (PR #88, branch `sync/v12.19-engine`).

## Verdict

**GO** with one deferred user action (W-1 wrapper patch).

The SDK at `2.0.0-rc.1` is byte-correct against the v12.19 wrapper for all
encoders, account specs, PDAs, and constants verified during the audit.
792 tests pass. lint clean. build clean. The only red gate is
`pnpm run parity:check` which depends on a one-line wrapper patch the
user must apply manually (W-1).

## Scope

The audit reframed in mid-session after the user clarified the deployment
plan. Original scope (per the verifier's NO_GO verdict) targeted both
v12.17 and v12.19. Reframed scope: drop v12.17 entirely, single-target
v12.19, ship as `2.0.0-rc.1`, hold in `sync/v12.19-sdk` until PRs #88 + #271
merge.

Reasoning: the stale mainnet program at `ESa89R5...` (deployed 2026-04-20)
is being abandoned. Toly's separate program at `BCGNFw6...` (the bounty
target at commit `06f86fb`) is irrelevant to this SDK. The next deployment
is v12.19 to `ESa89R5...`. There is no consumer base on v12.17 to support
once that deployment lands.

## Fixes applied

| id | category | fix | wrapper anchor |
|---|---|---|---|
| PHASE 1 | scope | dropped vanilla subpath + v12.17 target | n/a |
| H-1 | account spec | TRADE_NOCPI 4 -> 5 (clock at idx 3) | src/percolator.rs:8484 |
| H-2 | account spec | TOPUP_INSURANCE 5 -> 6 (clock at idx 5) | src/percolator.rs:9256 |
| H-3 | account spec | UPDATE_CONFIG 2 -> 3 (clock at idx 2) | src/percolator.rs:9544 |
| H-4 | account spec | SET_ORACLE_PRICE_CAP 2 -> 3 (clock at idx 2) | src/percolator.rs:9654 |
| H-5 | account spec | RESOLVE_MARKET 2 -> 4 (clock + oracle) | src/percolator.rs:9748 |
| H-7 | PDA | deriveInsuranceLpMint seed `ins_lp` -> `lp_vault_mint` | src/percolator.rs:2543 |
| B-2 (sub) | encoder payload | encodeUpdateConfig 33 -> 35 bytes (with tvl_insurance_cap_mult) | src/percolator.rs:2027-2041 |
| n/a | encoder payload | encodeInitMarket default 344 -> 304 bytes (drops 3 v12.17 fields) | src/percolator.rs:1786 |

## Deferred (not blocking rc.1)

- **W-1 wrapper sdk_parity_fixtures.rs**: edit + commit DONE locally on
  `sync/v12.19-wrapper` (commit `28d7cbd`). Push to PR #271 + merge to main
  pending user action. Parity:check stays red until main rolls forward
  because the SDK script runs cargo from `/path/to/percolator-prog`
  (a separate checkout on main, not the perc-sync work tree). See
  `phase-4-deferred.md`.

- **B-9 V12_19 slab layout** descriptor. V12_19 tier sizes
  (19_640 / 94_168 / 372_280 / 1_484_728) collide with V12_17 SBF tier
  sizes. The wrapper at d760fc4 has not deployed to mainnet, so no v12.19
  slabs exist on-chain to fingerprint. After v12.19 ships to ESa89R5...,
  add a version-field disambiguator using `detectSlabLayout`'s optional
  `data` parameter, plus a full `buildLayoutV12_19` with engine field
  offsets verified against engine c32bc0b. Tracked here as a residual.

- **The 31 SKIPPED tests** are unchanged from the inherited baseline.
  Per the prior audit's STAGE I findings, these are intentional skips
  for env-dependent tests. No action.

## Branch + tag state

- branch: `sync/v12.19-sdk`. NOT pushed to origin. NPM publish blocked.
- tags: `v1.0.0-beta.38`, `beta.39-presync`, `v2.0.0-rc.0`, `v2.0.0-rc.1`.
- commits this session: 4 (chore drop vanilla + v12.17, fix account specs,
  fix pda + slab note, release rc.1).

## Coordination plan

1. User applies W-1 patch on `sync/v12.19-wrapper`, pushes to PR #271.
2. PR #88 (engine) review tick lands. Lockstep merge to mains.
3. Mainnet program upgrade `ESa89R5...` to v12.19 binary.
4. Pull a real v12.19 slab from the upgraded program. Fingerprint the
   on-chain bytes against the wrapper struct definitions. Add full
   `buildLayoutV12_19` to `src/solana/slab.ts` and a version-field
   disambiguator in `detectSlabLayout`.
5. Cut `v2.0.0` stable from `sync/v12.19-sdk` rebased onto `main`.
6. `npm publish`.

## Gates

- pnpm test: **792 PASS / 31 SKIPPED**.
- pnpm lint: clean.
- pnpm build: clean. `dist/index.js` = 264 KB. No `dist/vanilla.js`.
- pnpm run parity:check: **RED**. Will go green when W-1 lands.

## Reproducibility

```
cd /path/to/percolator-sdk
git checkout v2.0.0-rc.1
pnpm install
pnpm test          # 792 PASS / 31 SKIPPED
pnpm lint          # clean
pnpm build         # dist/index.js ~264 KB, no vanilla.js
```

## End

Single-target v12.19 SDK at `2.0.0-rc.1`. Awaits W-1 wrapper patch and
then PR #88 + #271 lockstep merge before NPM publish.
