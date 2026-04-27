# HEARTBEAT — v12.19-only SDK alignment

**now:** 2026-04-28, PHASE 0 done, starting PHASE 1.

**last 3:**
- recon and rechecked PR state (#88 OPEN BLOCKED-on-review, #271 OPEN CLEAN)
- re-derived 5 account spec drifts at d760fc4 file:line + 2 PDA / payload / layout drifts
- confirmed v12.19 mappings: tags 12 / 22 / 32 / 82 / 83 all present in d760fc4. tag 17 / 31 removed (no encoder needed).

**next 3:**
- PHASE 1: drop src/vanilla.ts, drop v12.17 parity test + fixtures, drop target='v12.17' params from encoders.
- single chore commit, run gates green, record test count drop.
- proceed PHASE 2 (account specs).

**blockers:** none.
