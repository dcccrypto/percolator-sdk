# J-20261121-SDK-GATE-PR650b (try 2) — STOPPED: rebase needed
Date: 2026-11-21. PR #650 head 51364ec68a4afbda9ea3366ca18069c959529693 (unchanged).
New base feat/v22-sdk-growth = f58043c525cc (after #651 merged). PR head is NOT based on it.

gh pr view 650: mergeable=CONFLICTING, mergeStateStatus=DIRTY.
git merge-tree --write-tree origin/feat/v22-sdk-growth 51364ec6 -> exit 1:
  Auto-merging dist/index.js
  Auto-merging dist/index.js.map
  CONFLICT (content): Merge conflict in dist/index.js.map
  Auto-merging src/runtime/tx.ts
Only conflict is the generated sourcemap; src/runtime/tx.ts (touched by both #651 and #650) auto-merges.
Fix: rebase #650 onto f58043c5, rebuild dist (pnpm build), push a new head, then re-gate that new head.
Per goal ("if it needs a rebase, stop and report") merge-gate.mjs was NOT run and nothing was merged.
Reusable from try 1: review-pr650.txt (APPROVE 8/10, 0 high/medium, head 51364ec6) and
fail-before 0/20 -> pass-after 20/20 on test/hung-rpc.test.ts. A rebased head needs a fresh review file.
