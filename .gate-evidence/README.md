# J-20261121-SDK-GATE-PR648-649 gate evidence

Base feat/v22-sdk-growth @ f0ee6d85bea0372f770c2d0526d9bb1bd9adb303. Both PRs are tests-only (one new file each).

## #648 head b7f8a87a5657b1acdfa0b1567d4e86f6c603ca4b — merge-gate PASS (exit 0)
- Gate result.json: /Users/khubair/agent-worker/logs/gate/percolator-sdk-pr648-2026-11-21T19344989-48477/result.json (copy: merge-gate-pr648.result.json)
- Full suite (gate, same command head/base): `npx -y pnpm@10 run test --maxWorkers=4 --testTimeout=60000` head 3547 passed / 0 failed / 2 skipped
- Coverage (gate vitest v8): lines 98.41% base -> 98.41% head; branches 92.75% -> 92.75%; funcs 99.17% -> 99.17%
- Fail-before/pass-after proof (pr648-mutation.txt): 4/4 encoder mutations fail the new test, 14/14 pass after each revert
- Fresh review (review-pr648.txt): APPROVE, 3 nits
- NOT merged by this agent (hard rule: agents never merge). Merge outside the agent shell:
  gh pr merge 648 -R dcccrypto/percolator-sdk --merge --match-head-commit b7f8a87a5657b1acdfa0b1567d4e86f6c603ca4b
  Note: the gate prints --merge. The job brief says --squash, but `git revert -m1` only works on a merge commit, so --merge keeps the logged revert valid.
- Ledger line (fill in MERGE_SHA after the merge): see merge-gate-pr648.log "Ledger line template"; revert = git revert -m1 <MERGE_SHA>

## #649 head d5955bd0a3ebd58aaef5106c0fb719b071abd008 — merge-gate FAIL (exit 1), do not merge
- Gate result.json: /Users/khubair/agent-worker/logs/gate/percolator-sdk-pr649-2026-11-21T20160351-25486/result.json (copy: merge-gate-pr649.result.json)
- Check 4 FAIL: fresh review REQUEST_CHANGES with a medium finding. The account tests never assert an exact key count (test:397-400).
  Independently confirmed in pr649-mutation.txt SPLIT A/B: Tighten builder dropping the optional holder [6], or LpStop dropping the
  last opposing portfolio, both still pass 24/24.
- Checks 1/3: the local suite was skipped after a 10-min lock wait (lane queue). CI does not run on PRs into this base, so there was no CI fallback (infra, not a code failure).
- Encoder mutation proof (pr649-mutation.txt): 5/5 wire mutations fail the new test, 24/24 pass after each revert
- Fix for the builder: give each account case an expected length and assert k.ix.keys.length === expectedLen (7 for Tighten+holder, 6+victims.length for LpStop), then re-gate.
