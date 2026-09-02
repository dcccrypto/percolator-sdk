# Wrapper findings discovered during SDK audit

These are wrapper-side issues observed via the SDK audit. Per brief I cannot push wrapper changes. Logging here for the wrapper repo's next sync.

## W-1: sdk_parity_fixtures.rs missing tag 83 UpdateAuthority

**File:** /path/to/perc-sync/work/percolator-prog/src/bin/sdk_parity_fixtures.rs
**Lines:** 5-85 (the `tags` array stops at AcceptAdmin / tag 82)

The parity binary enumerates every wrapper tag. Tag 83 UpdateAuthority was added in v12.18.x (handler at src/percolator.rs:6876) but the parity binary was not updated.

**Effect:** `pnpm run parity:check` would NOT detect the SDK omitting tag 83 because both sides are stale together.

**Fix on wrapper side:** add `("UpdateAuthority", TAG_UPDATE_AUTHORITY)` to the array. Also remove tag 83 from `gaps` if present (it is not currently in `gaps`).

Severity: MEDIUM (audit hygiene). Not exploitable.

## No BLOCKING wrapper bugs found in this audit.
