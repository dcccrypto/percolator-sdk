# P3 parity oracle

Checks the SDK's P3 (vault-owned LP) surface against the **real** P3 crate
(percolator-prog `feat/p3-vault-owned-lp`, pinned SHA in `test/fixtures/p3-parity.json`).

1. `npx tsx scripts/p3-parity/gen-vectors.ts > vectors.txt` — SDK encoder hex for every tag
   94..=102 plus tag 5, each with a `__short` / `__long` negative variant.
2. In a scratch checkout of the P3 branch (engine sibling at `ENGINE_CI_SIBLING`), copy
   `sdk_p3_parity.rs` to `src/bin/` (never commit it there) and run
   `cargo run --quiet --bin sdk_p3_parity -- vectors.txt > p3-parity.json`.
3. Pretty-print into `test/fixtures/p3-parity.json`; `test/p3.test.ts` asserts it.

The oracle uses `ix::Instruction::decode`, rustc `offset_of!` on `state::VaultLpStateV18` /
`state::AssetVaultLpV18`, `PercolatorError::X as u32`, `state::read_asset_vault_lp` on a
correctly-sized market buffer (proves the SDK's per-asset offset formula), and
`state::init_vault_lp_state` (a program-written account for the decoder test).
Re-run whenever the P3 branch moves.
