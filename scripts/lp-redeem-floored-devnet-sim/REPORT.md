# Tag 76 RequestRedeemLpShares on the deployed devnet v2.2 program: floored (26-byte) vs legacy (17-byte)

Job J-20261123-SDK-REPORT-LPREDEEMFLOOREDDEVNETSIM, 2026-11-23. SDK base `feat/v22-sdk-growth` fc375ac6.
Everything here ran through `simulateTransaction` only (`sigVerify: false`, `replaceRecentBlockhash: true`). Nothing was sent.

## Verdict

1. **The SDK floored form works on the deployed program.** `buildRequestRedeemLpSharesIxV22` (26 bytes) gets past decode on 6/6 vaults.
   With a real holder it **succeeds** and creates a **128-byte** redemption PDA, the v2.2 extended layout with the stored floor.
2. **The deployed devnet program does NOT refuse the legacy 17-byte form.** On 6/6 vaults the legacy form also **succeeds** and creates a
   **112-byte** (floorless, legacy) redemption PDA. The expected `InvalidInstructionData` refusal does not happen.
   - Cause: the deployed wrapper `6kpg2wi7…` was last deployed at slot 511471118 (**2026-10-15T20:33:10Z**), about an hour after
     `percolator-prog` `devnet/v22-fresh-ids` 0c2406d4 (2026-10-15 18:18Z). Its tag-76 decode maps an empty tail to
     `RequestRedeemLpShares { shares }`. The retirement of the legacy form, prog #616 / 97da3408
     "fix(AUD-S1-18): retire the floorless legacy 17-byte tag 76 at decode", landed **2026-10-29** and is **not deployed** on devnet.
   - This is a **deployment lag, not an SDK encoding bug**, so no SDK PR. The SDK docs that say "the v2.2 program refuses it since rc23"
     (`src/abi/v22-wire.ts:440`, `src/abi/instructions.ts:4449`) are true of the rc23 source but not of the deployed devnet binary.
   - Risk note for the program side: until devnet (or any target) gets #616, a client still using the deprecated encoder makes floorless requests.
     Bound / Resolved tag 77 is permissionless, so anyone can execute those requests with no payout bound. That is the AUD-S1-18 scenario.
3. **The slippage refusal works.** Tag 77 runs on the existing on-chain v2.2 (128-byte) requests, with the redeemer impersonated and the bound-vault tail attached.
   A wire floor of 1 gives the quote. A wire floor of quote+1 is refused with **Custom(117) `RedemptionBelowMinPayout`** on 2/2 executable requests.
   The third request is blocked earlier, at Custom(84) `VaultLpHarvestPending`, on both floors: that vault needs a harvest first, which has nothing to do with the floor.
   - Every vault has `redemption_cooldown_slots = 150`, so 76 and 77 cannot share one simulated transaction. That is why the slippage case uses existing requests.

## Per vault: tag 76 (`out/summary-tag76.txt`, raw logs in `out/simulate.json`)

T = fresh throwaway redeemer (no SOL, no LP ATA; fee payer is the holder wallet, impersonated). H = real LP holder (impersonated), shares = 1e6, floor = 1.

| vault registry | market | T-floored | T-legacy | H-floored | H-legacy |
|---|---|---|---|---|---|
| 3hLePQZB… | 294orabC… | Custom(11) InvalidTokenAccount, 6357 CU | Custom(11), 6344 CU | **ok**, PDA 128 B, 23016 CU | **ok**, PDA 112 B, 22977 CU |
| 6WrBoUJr… | 5KDWvRc4… | Custom(11), 7857 CU | Custom(11), 7844 CU | **ok**, 128 B, 21516 CU | **ok**, 112 B, 21477 CU |
| 6deq4xSc… | B5b7qwAL… | Custom(11), 4857 CU | Custom(11), 4844 CU | **ok**, 128 B, 18516 CU | **ok**, 112 B, 18477 CU |
| 7baPebpn… | 819p1NhM… | Custom(11), 6357 CU | Custom(11), 6344 CU | **ok**, 128 B, 21516 CU | **ok**, 112 B, 21477 CU |
| 7jYf3b6Z… | FGYv3PzC… | Custom(11), 6357 CU | Custom(11), 6344 CU | **ok**, 128 B, 20016 CU | **ok**, 112 B, 19977 CU |
| 7sXRsTmM… | H9uGY9Qm… | Custom(11), 7857 CU | Custom(11), 7844 CU | **ok**, 128 B, 23016 CU | **ok**, 112 B, 22977 CU |

Program logs per case are `invoke [1]`, `consumed N`, then `success` or `failed: custom program error: 0xb`. The deployed
program emits no `Program log:` lines on this path. Custom(11) on the throwaway is `verify_user_token_account` refusing the missing LP ATA,
which is past decode for both forms. The ~13 CU gap between the forms is the extra 9 decoded bytes.

## Slippage: tag 77 on existing v2.2 requests (`out/summary-tag77-slippage.txt`, raw in `out/simulate-pending.json`)

| request PDA | stored floor | wire floor 1 | wire floor quote+1 |
|---|---|---|---|
| DT2MAJmF… (bound) | 90000000 | **ok**, quote 101360104, 165369 CU | **Custom(117)** RedemptionBelowMinPayout, 142873 CU |
| GT4YakWX… (bound) | 900000600 | **ok**, quote 1000232586, 108889 CU | **Custom(117)**, 86399 CU |
| GCoR9R6F… (bound) | 1 | Custom(84) VaultLpHarvestPending | Custom(84) |

The SDK's `classifyRedemptionSimulationV22` labels both 117 results `belowMinPayout`.
The first P attempt, without the bound tail `[13] vault_lp_state`, `[14] LP portfolio`, gave `NotEnoughAccountKeys`, as expected for bound vaults (`out/simulate.json` `pending`).

## Reproduce (read-only)

```
npx tsx scripts/lp-redeem-floored-devnet-sim/discover.ts > scripts/lp-redeem-floored-devnet-sim/out/discover.json      # 55 registries, 4 pending requests
cd scripts/lp-redeem-floored-devnet-sim
npx tsx holders.ts out/discover.json > out/holders.json                                  # pending requests + holders (Token gPA)
LPSIM_MAX_VAULTS=6 npx tsx simulate.ts out/discover.json out/holders.json > out/simulate.json
LPSIM_ONLY_PENDING=1 npx tsx simulate.ts out/discover.json out/holders.json > out/simulate-pending.json
npx tsx program-slot.ts > out/program-slot.json
node summarize.mjs out/simulate.json
```

## Tests

`npx vitest run test/lp-redeem-floored.test.ts --maxWorkers=4`: before 3/3 pass, after 3/3 pass. No SDK source changed.
