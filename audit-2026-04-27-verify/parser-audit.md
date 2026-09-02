# PHASE 5 — parser audit

## Scope

`src/solana/slab.ts` parsers verified against wrapper struct definitions
(by-eye reading; no compile-time probing).

## parseHeader (src/solana/slab.ts:2316)

Reads SlabHeader at offset 0: magic(8), version(4), reserved fields,
admin pubkey, insurance_authority pubkey, insurance_operator pubkey,
total HEADER_LEN.

v12.19 wrapper SlabHeader struct: contains magic, version, admin,
insurance_authority, insurance_operator, plus reserved padding to
HEADER_LEN. Field order matches what SDK reads.

**Status:** VERIFIED-by-spec for v12.17/v12.19 magic + version + admin.
Did not byte-for-byte verify every reserved field.

## parseConfig (src/solana/slab.ts:2485)

Reads MarketConfig starting at HEADER_LEN. Field offsets in SDK comments
include:
- `oracle_price_cap_e2bps` u64 at config-relative offset 192
- `min_oracle_price_cap_e2bps` u64 at offset 224

These are MarketConfig field offsets within the config slot, not engine
offsets. Wrapper MarketConfig struct grew significantly through
v12.15→v12.17→v12.19 syncs. Per audit-2026-04-27 prior session SDK
parseConfig was rewritten in beta.36 for v12.17 layout.

**Status:** Plausibly correct for v12.17 (rewritten then). v12.19
wrapper added `tvl_insurance_cap_mult` u16 to MarketConfig wire format
post-update; SDK parseConfig may not surface it as a field.

ASSUMED-VERIFIED for v12.17 read paths. Not exhaustively walked. A
follow-up phase would byte-by-byte compare SDK reads against
`/path/to/perc-sync/work/percolator/src/state.rs` MarketConfig
field offsets.

## parseEngine (src/solana/slab.ts:2832)

Reads engine struct at engineOff. SDK uses V12_17_OFF constants. v12.19
engine layout shifted (vault offset 600→616) — see slab-layout-audit.md.

**Status v12.17:** ASSUMED-VERIFIED.
**Status v12.19:** **LAYOUT_DRIFT_BLOCKING** (see slab-layout-audit.md).

## parseUsedIndices, parseAccount, parseAllAccounts

These read the bitmap + account array starting at engineOff + bitmap
offset. v12.17 layout structurally OK. v12.19 layout shift breaks this.

**Status v12.17:** ASSUMED-VERIFIED.
**Status v12.19:** **LAYOUT_DRIFT_BLOCKING** (covered).

## parseErrorFromLogs (src/abi/errors.ts:309)

Parses Solana program error logs and looks up via PERCOLATOR_ERRORS map.
Code 28+ has wrong names (see error-audit.md).

**Status:** ERROR_DRIFT_MEDIUM (see error-audit.md).

## parsePositionNftAccount (src/abi/nft.ts:264)

Reads PositionNft state (208 bytes) per nft.ts comment. Verifies magic,
version, slab, user_idx, owner. Wrapper PositionNftState struct at
src/percolator.rs:5476-5495 has matching fields.

**Status:** VERIFIED-by-spec.

## parseAdlEvent (src/solana/adl.ts:435)

Parses ADL event log strings. Not a binary parser; pattern-matches on
log format. Out of scope for byte verification.

**Status:** NOT BYTE-PARSED (string parser).

## Summary

| parser | v12.17 | v12.19 |
|:---|:---|:---|
| parseHeader | VERIFIED-by-spec | VERIFIED-by-spec |
| parseConfig | ASSUMED-VERIFIED | LAYOUT_DRIFT_BLOCKING (tvl_insurance_cap_mult unread) |
| parseEngine | ASSUMED-VERIFIED | LAYOUT_DRIFT_BLOCKING (engineOff shift unmodeled) |
| parseUsedIndices | ASSUMED-VERIFIED | LAYOUT_DRIFT_BLOCKING |
| parseAccount | ASSUMED-VERIFIED | LAYOUT_DRIFT_BLOCKING |
| parseAllAccounts | ASSUMED-VERIFIED | LAYOUT_DRIFT_BLOCKING |
| parseErrorFromLogs | ERROR_DRIFT_MEDIUM (28+) | ERROR_DRIFT_MEDIUM |
| parsePositionNftAccount | VERIFIED-by-spec | VERIFIED-by-spec |
| parseAdlEvent | string parser | string parser |
