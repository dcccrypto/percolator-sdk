# PHASE 4 — wrapper W-1 fix DEFERRED

The single-line wrapper edit (add `UpdateAuthority` tag 83 to
`src/bin/sdk_parity_fixtures.rs`) was blocked by the active permission
policy when attempted from this SDK-focused session. Logging here for
the user to apply manually as a one-line patch on the existing PR #271.

## Patch to apply

In `/Users/khubair/perc-sync/work/percolator-prog/src/bin/sdk_parity_fixtures.rs`,
inside `fn main()` `let tags = [...]` array, after the existing
`("AcceptAdmin", TAG_ACCEPT_ADMIN),` line:

```rust
        ("AcceptAdmin", TAG_ACCEPT_ADMIN),
        ("UpdateAuthority", TAG_UPDATE_AUTHORITY),
    ];
```

`TAG_UPDATE_AUTHORITY` is already defined at `src/tags.rs:202` as `u8 = 83`.
No additional imports needed (the file uses `use crate::tags::*` at top).

## Suggested commit message

```
fix(parity): add UpdateAuthority tag 83 to sdk_parity_fixtures (W-1)

The wrapper parity binary enumerates SDK-visible tags but stopped at
AcceptAdmin (tag 82). UpdateAuthority (tag 83) was added in v12.18.x
(handler at src/percolator.rs:6876) and is in the SDK's
specs/wrapper-tags.json, so pnpm run parity:check exits 1 with a diff.

One-line fix: append entry to tags array. No logic change.

Logged as W-1 in audit-2026-04-27/wrapper-findings.md.
```

## Verification after patch

After committing on `sync/v12.19-wrapper` and pushing to PR #271:

```
cd /Users/khubair/percolator-sdk
pnpm run parity:check
```

Should exit 0 (currently exits 1).

## Impact while deferred

`pnpm run parity:check` returns red until W-1 lands. Other gates
(pnpm test, pnpm lint, pnpm build) all green. CI in the SDK repo will
fail the parity gate until the wrapper PR ships W-1.
