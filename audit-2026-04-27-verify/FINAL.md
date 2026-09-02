# Independent drift verification — FINAL

Date: 2026-04-27.
SDK: /path/to/percolator-sdk @ sync/v12.19-sdk (HEAD ~911e879). READ-ONLY throughout.
Wrapper v12.17 mainnet pin: 06f86fb (worktree at /tmp/wrapper-v12.17, removed in cleanup).
Wrapper v12.19: d760fc4 at /path/to/perc-sync/work/percolator-prog.
Engine v12.17: 3f55f87 (worktree at /tmp/engine-v12.17, removed).
Engine v12.19: c32bc0b at /path/to/perc-sync/work/percolator.

## Verdict

**NO_GO for mainnet publication.** See VERDICT.md.

10 BLOCKING + 8 HIGH drifts vs v12.17.7 deployed line. SDK builds
broken transactions for InitMarket, UpdateConfig, UpdateAdmin,
SetInsuranceWithdrawPolicy, AcceptAdmin, UpdateAuthority — most
of the admin/market lifecycle path. Account specs for UpdateConfig,
SetOraclePriceCap, ResolveMarket, TopUpInsurance, TradeNoCpi,
ResolvePermissionless are wrong (missing or extra accounts).

## Findings by severity

| severity | count |
|:---|---:|
| BLOCKING | 10 |
| HIGH | 8 |
| MEDIUM | 5 |
| LOW | 3 |
| VERIFIED | ~130 individual claims |

## Top 10 highest-severity items

1. **B-7** InitMarket wire-format excess on v12.17 default. Mainnet rejects.
2. **B-2** UpdateConfig wire-format short on v12.17 default. Mainnet rejects.
3. **B-1** UpdateAdmin tag 12 deleted on v12.17. SDK encoder broken on mainnet.
4. **B-3** SetInsuranceWithdrawPolicy tag 22 deleted on v12.17. SDK encoder broken.
5. **B-4 + B-5** UpdateAuthority tag-byte drift (32 vs 83). SDK has no working encoder for v12.17.
6. **B-6** AcceptAdmin tag 82 absent on v12.17. SDK encoder broken.
7. **B-8** dist/ stale relative to src/. Bundled artifact lacks v12.19 target branches; consumers using committed dist get v12.17 default for both target options.
8. **B-9** detectSlabLayout missing v12.19 layouts. Read paths return null/stale layout.
9. **B-10** parity:check red. Wrapper-side parity binary missing tag 83.
10. **H-3** ACCOUNTS_UPDATE_CONFIG missing clock + oracle. Runtime rejects with NotEnoughAccountKeys regardless of wire format.

## Reports

```
audit-2026-04-27-verify/
├── HEARTBEAT.md
├── phase-0-checkouts.md
├── claim-inventory.csv
├── ix-tag-drift.md
├── encoder-field-audit.md
├── account-spec-audit.md
├── slab-layout-audit.md
├── parser-audit.md
├── pda-audit.md
├── error-audit.md
├── oracle-disc-audit.md
├── const-audit.md
├── gates-output.md
├── DRIFT_REPORT.md
├── VERDICT.md
└── FINAL.md  ← this file
```

No BLOCKER.md or wrapper-findings.md generated as separate artifacts;
the wrapper-side W-1 (sdk_parity_fixtures.rs missing tag 83) is already
documented in the existing audit-2026-04-27/wrapper-findings.md from the
prior session and reflected here as B-10.

## Cleanup

Worktrees `/tmp/wrapper-v12.17` and `/tmp/engine-v12.17` removed.

## What this audit did NOT verify

- Exhaustive byte-by-byte parseConfig/parseEngine/parseAccount field
  walks against engine struct definitions. Spot-checked only.
- SBF binary probing for SLAB_LEN tier sizes.
- DexOracle PumpSwap/Raydium CLMM/Meteora DLMM byte layouts.
- NFT_PROGRAM_ID matches percolator-nft declare_id! at runtime.
- TYPE_NARROWING for every encoder (sample-checked).
- Discovery / RPC pool / Lighthouse / runtime helpers.

These are recommended follow-up scopes if the SDK is to be re-audited
post-fix.

## Reproduction

The audit can be reproduced from any clean state by:
1. Recreating the wrapper v12.17 worktree at 06f86fb.
2. Recreating the engine v12.17 worktree at 3f55f87.
3. Reading SDK at sync/v12.19-sdk HEAD and the two wrapper sources.
4. Walking the per-phase scripts in this directory's reports.

The verification was source-level (no compilation, no on-chain probing).
Findings can be cross-checked against the cited file:line anchors in any
commit-reachable state of the wrapper.

## End

Independent verification complete. Verdict NO_GO. Stopping per brief.
