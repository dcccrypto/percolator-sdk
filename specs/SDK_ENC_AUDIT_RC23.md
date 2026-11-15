# SDK encoder audit vs percolator-prog v2.2 (J-20261115-SDK-ENC)

Program: `feat/v22-rc23-2026-10-22` @ `d27f3d73`, `src/v16_program.rs` (`Instruction::decode` 10065-10963, engine pinned to `db019142`).
Method: the real `Instruction::decode`/`encode` run on the bytes of all 112 SDK encoder rows in `test/wire-size-v22/table.ts`
(`scripts/v22-parity/gen-wire-table-vectors.ts` + `sdk_wire_table_parity.rs`), plus the program's own `sdk_parity_fixtures` tag probe.
The full per-tag layout table (tag, len, field offsets, program line) is `specs/WIRE_SIZES_V22.md`.

## Result

- 111 of 112 encoder rows decode OK and re-encode byte-identical. The one that does not: tag 76, legacy 17 B (`encodeRequestRedeemLpShares`):
  program `v16_program.rs:10565` returns InvalidInstructionData; SDK `instructions.ts` (`@deprecated`, known). Expected 26 B (`encodeRequestRedeemLpSharesV22`).
- Tags: program probe lists 101 tags vs 102 in `specs/wrapper-tags-v22.json`. The only difference is tag 76, which the probe
  cannot reach (it never tries a 26-byte payload); not SDK drift. No tag value differs; no new tag outside the spec (106-112, 116-125 are all in the v22 spec).
- #711 (`b370b7e1`): no wire change. `Instruction::decode` is unchanged between `ab85662` and `d27f3d73`. #711 lets a Hybrid oracle
  profile carry `lot_exp` (`state::profile_lot_and_p4_bytes_ok`, `carried_profile_padding0`), and moves oracle composition to e12
  (`compose_price_e12_to_e6`). SDK has no client-side guard that refuses lot + Hybrid, so nothing to relax. Profile byte +19 is unchanged.
- InitMarket `lot_exp` trailer: SDK `encodeInitMarketV22` forms (224/230/248 B with lot) all decode; lot byte 0 is refused both sides.

## Doc drift fixed (expected vs actual)

| item | stale doc | program |
|---|---|---|
| adl.ts:420,435,455 event tag | 2970353665 | 0xAD1E_0001 = 2904424449 |
| IX_TAG 32 UpdateAuthority | no epoch | 41 B (+authority_epoch) :10329 |
| IX_TAG 57 WithdrawInsuranceAsset | tag+u16+u128 | 35 B (+market_id, +authority_epoch) :10507 |
| IX_TAG 65 UpdateAssetAuthority | 36 B | 52 B :10333 |
| IX_TAG 66 BatchTradeNoCpi | legs w/o market_id, no account trailer | 1+1+42n+32 :10224 |
| IX_TAG 67 BatchTradeCpi | legs w/o market_id, no trailer | 1+1+42n+72 :10244 |
| IX_TAG 68 SetMatcherConfig | 2 B | 36 B :10269 (no SDK encoder) |
| IX_TAG 69 RestartAssetOracle | 19 B | 35 B :10428 (no SDK encoder) |
| IX_TAG 76 RequestRedeemLpShares | 17 B | 26 B, 17 B retired :10557 |
| IX_TAG 77 ExecuteRedemption | 3 B only | 3 B legacy / 12 B v2.2 :10583 |
| IX_TAG 86 UpdateFeeSplit | 7 B | 15 B :10709 |
| table.ts / WIRE_SIZES_V22.md program lines | ab85662 (all +13 stale) | refreshed to d27f3d73 |

Already correct: TradeCpi 85 B, TradeNoCpi 77 B, CreateLpVault 15 B, DepositToLpVault 19 B, tags 72/73/74-82.
