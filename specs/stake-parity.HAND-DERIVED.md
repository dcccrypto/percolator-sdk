# stake-parity.json: hand-derived entries

Tags **29 `RecoverTerminalInsurance`** and **30 `AdminCloseSlab`** were added by hand on
2026-09-30. They come from percolator-stake `fix/stake-f9-terminal-insurance@f9b9190`
(draft #301), not from a `cargo run --bin sdk_parity_fixtures`. That build was not run, to
avoid a heavy cargo job during the fork rehearsals.

How they were derived:
- The generator probes `StakeInstruction::unpack` for tags 0..=63 with payloads of 0..=40
  bytes, and prints each live tag in the fixed format `src/bin/sdk_parity_fixtures.rs` uses.
- At f9b9190, `unpack` accepts tag 29 with an 8-byte payload and tag 30 with an empty one.
  `variant_name` maps them to the names above.
- `removed_tags` keeps only gaps below the highest live tag, so it stays `[11, 17]`.
- f9b9190 adds no `StakePool` field (state.rs has additions only, outside the struct), so the
  layout offsets and sizes are unchanged.

The file is written to be byte-identical to the generator's output at f9b9190.
**CI `parity:check` compares against stake's DEFAULT branch.** So the stake target reports
drift until #301 merges to stake main. Once it has merged, run `pnpm update-parity-fixtures`
to replace these entries with generated ones, then delete this note.
