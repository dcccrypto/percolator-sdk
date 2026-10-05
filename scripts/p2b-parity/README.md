# P2b parity oracle

Checks the SDK's P2b surface (tag 103, the tag-99 dials trailer, `VaultLpExtV19`, the senior floor code,
`p2b_flags`, the par/E3 rules, plus the #524 growth trailers and #525 tags 104/105 against the same head)
against the **real** wrapper crate (percolator-prog #526 `feat/p2b-earn-allocation`, SHA pinned in
`test/fixtures/p2b-parity.json`).

1. `npx tsx scripts/p2b-parity/gen-vectors.ts > vectors.txt` — SDK encoder hex for every vector in
   `test/p2b-vector-inputs.ts`, each with `__short` / `__long` negative variants.
2. In a scratch checkout of the #526 head (engine sibling `../percolator` at `feat/p2b-lock-exits`), copy
   `sdk_p2b_parity.rs` to `src/bin/` (never commit it there) and run
   `cargo run --quiet --bin sdk_p2b_parity -- vectors.txt > p2b-parity.json` (use `CARGO_BUILD_JOBS=3`).
3. Pretty-print into `test/fixtures/p2b-parity.json`; `test/p2b-earn.test.ts` asserts it.

The oracle uses `ix::Instruction::decode` and `encode` (a vector must decode AND re-encode byte-identically),
rustc `offset_of!` on `VaultLpExtV19` / `AssetRiskLimitsV17` / `AssetGrowthV19` / `AssetVaultLpV18`,
`state::init_vault_lp_ext` (program-written ext accounts) and `read_vault_lp_ext` (what the program rejects),
`state::derive_vault_lp_ext`, `PercolatorError::X as u32`, and the pure rules of `vault_lp_v18`.
Also regenerate `test/fixtures/wrapper-errors.json` (`scripts/wrapper-errors/gen.py`) and `specs/wrapper-tags.json`
(`cargo run --bin sdk_parity_fixtures`) whenever the wrapper head moves.
