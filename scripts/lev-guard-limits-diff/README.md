# lev-guard-limits differential harness

`src/ref_.rs` is lines of percolator-prog `src/lev_guard_v22.rs` (burst_*, short_users_cap_notional, l_trader_x100, l_overlay_x100,
n_overlay_q, age band, mul_div_floor_sat) and `growth_v19::isqrt_ceil_u128`, extracted verbatim from
`origin/feat/v22-rc23-2026-10-22` @ d27f3d73 (read-only `git show`). `src/main.rs` prints seeded rows (`<fn> <inputs...> <rust output>`).

```
cd scripts/lev-guard-limits-diff && cargo build -j 4 && ./target/debug/lgdiff 50000 > /tmp/rows.txt
LEV_DIFF_ROWS=/tmp/rows.txt npx vitest run test/lev-guard-limits-diff-v22.test.ts --maxWorkers=4
```

`fixtures/v22/lev-guard-limits-diff-d27f3d73.txt` is the first 2 000 rows per function (what CI runs by default).
