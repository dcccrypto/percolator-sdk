# PHASE 4 — wrapper W-1 fix DONE locally, push pending

The single-line wrapper edit was applied locally on the v12.19 branch.
What remains is pushing it and waiting for PR #271 to merge to main.

## Status

| step | state |
|---|---|
| edit applied to `src/bin/sdk_parity_fixtures.rs` | DONE |
| commit on `sync/v12.19-wrapper` | DONE (`28d7cbd`) |
| push to `origin/sync/v12.19-wrapper` (PR #271) | PENDING (needs user) |
| `pnpm run parity:check` green | PENDING (waits for PR #271 merge to main) |

## Why parity:check still reads red

The SDK's `scripts/check-parity-fixtures.mjs` runs `cargo run --bin sdk_parity_fixtures` from `resolve(sdkRoot, "..", "percolator-prog")` which is `/path/to/percolator-prog`. That checkout is on `main` at `f1d63ef`, 198 commits behind the v12.19 PR head and missing the `TAG_UPDATE_AUTHORITY` constant entirely. So the SDK spec is ahead of what main can produce.

This is structurally correct: the SDK already encodes UpdateAuthority, and the spec correctly lists it. The wrapper main needs to roll forward (by merging PR #271 which now includes commit 28d7cbd) before parity goes green.

## What the user does next

1. Push the wrapper W-1 commit to PR #271:

```
cd /path/to/perc-sync/work/percolator-prog
git push -u origin sync/v12.19-wrapper
```

2. After PR #271 merges to `dcccrypto/percolator-prog` main:

```
cd /path/to/percolator-prog
git pull origin main
```

Parity:check goes green automatically once main has UpdateAuthority.

## Verification (post-merge)

```
cd /path/to/percolator-sdk
pnpm run parity:check   # all 4 programs OK, exit 0
```

## Commit detail

```
28d7cbd fix(parity): add UpdateAuthority tag 83 to sdk_parity_fixtures (W-1).
```

Single-line addition: `("UpdateAuthority", TAG_UPDATE_AUTHORITY),` appended to the tags array in `fn main()`. `TAG_UPDATE_AUTHORITY` is defined at `src/tags.rs:202` as `u8 = 83`. No imports needed.
