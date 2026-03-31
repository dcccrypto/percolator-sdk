# PERC-8278 — execute_adl TypeScript Binding Spec

**Author:** Conduit (sdk agent)  
**Date:** 2026-03-30  
**Status:** Draft  
**Derived from:** percolator-prog/src/percolator.rs (TAG_EXECUTE_ADL handler) + tags.rs

---

## 1. On-Chain Instruction Definition

### Tag
```
TAG_EXECUTE_ADL = 50  // percolator-prog/src/tags.rs:92
```

### Instruction Data Layout
```
[0]     u8   tag = 50
[1..2]  u16  target_idx  (little-endian)
```
Total: 3 bytes

### Accounts
| Index | Permission | Name | Description |
|-------|-----------|------|-------------|
| 0 | `[signer]` | `caller` | Permissionless — any signer (incentive: unblocking market) |
| 1 | `[writable]` | `slab` | Market slab account |
| 2 | `[]` | `clock` | `SysvarClock1111...` |
| 3 | `[]` | `oracle` | Pyth / chainlink / oracle-authority feed account |
| 4..N | `[]` | `backupOracles` | Optional backup oracle accounts (non-hyperp markets) |

**Minimum account count: 4**

---

## 2. Preconditions (on-chain enforced)

1. `slab.owner == program_id` — slab_guard passes
2. Slab is initialized (magic == "PERCOLAT")
3. `config.max_pnl_cap != 0` — ADL requires the cap to be set; returns `InvalidInstructionData` if 0
4. `pnl_pos_tot > max_pnl_cap` — returns `EngineRiskReductionOnlyMode` if cap not exceeded
5. `target_idx` must be a valid (in-use) account index — `check_idx` validates
6. Oracle freshness check applies (same staleness rules as liquidation)

---

## 3. Instruction Effect

- Engine calls `execute_adl(target_idx, clock.slot, oracle_price, excess)` on the core risk engine
- The target position (highest PnL%) is partially or fully closed at oracle price
- Settlement reduces `pnl_pos_tot` toward `max_pnl_cap`
- Excess = `pnl_pos_tot.saturating_sub(max_pnl_cap)` — amount to unwind

---

## 4. TypeScript SDK Binding

### 4.1 Already implemented in PR#38
`encodeExecuteAdl({ targetIdx: u16 })` — see `src/abi/instructions.ts`

```typescript
/**
 * Encode an ExecuteAdl instruction payload.
 * @param params.targetIdx - Account index (u16) of the position to ADL-close.
 * @returns 3-byte Buffer: [tag=50, targetIdx lo, targetIdx hi]
 */
export function encodeExecuteAdl(params: { targetIdx: number }): Buffer
```

### 4.2 `buildAdlInstruction` (PR#38) — already exported
```typescript
/**
 * Build a TransactionInstruction for ExecuteAdl.
 * @param caller   Signer's public key (permissionless)
 * @param slab     Market slab account
 * @param oracle   Oracle feed account
 * @param programId Percolator program ID
 * @param targetIdx Account index to ADL-close (from rankAdlPositions output)
 * @returns TransactionInstruction ready to submit
 * @example
 * const ix = buildAdlInstruction(wallet.publicKey, slabKey, oracleKey, PROGRAM_ID, ranked[0].idx);
 */
export function buildAdlInstruction(
  caller: PublicKey,
  slab: PublicKey,
  oracle: PublicKey,
  programId: PublicKey,
  targetIdx: number,
): TransactionInstruction
```

### 4.3 Backup oracle support (NOT YET IMPLEMENTED)
When `is_hyperp == false`, the on-chain handler reads `accounts[4..]` for backup oracles.
Current `buildAdlInstruction` only passes 4 accounts. Non-hyperp market ADL will succeed
only if `oracle` (accounts[3]) is sufficient for price resolution.

**Future work:** Add `backupOracles?: PublicKey[]` param to `buildAdlInstruction`.  
This is a follow-on task; all devnet markets are currently hyperp mode.

---

## 5. Client-Side ADL Workflow (buildAdlTransaction — already exported)

```
1. fetchAdlRankedPositions(connection, slabKey)
   → fetches slab on-chain, decodes V_ADL layout, ranks by pnlPct desc
   
2. isAdlTriggered(slabData) → boolean
   → client-side precondition check before submitting tx

3. buildAdlInstruction(caller, slab, oracle, programId, ranked[0].idx)
   → builds the ix for the top-ranked (most profitable) position

4. buildAdlTransaction(connection, caller, slab, oracle, programId)
   → convenience: steps 1-3 + creates/signs Transaction
```

---

## 6. Error Handling

| Error | Meaning | SDK action |
|-------|---------|-----------|
| `InvalidInstructionData` | `max_pnl_cap == 0` or `target_idx` invalid | ADL not configured; skip |
| `EngineRiskReductionOnlyMode` | `pnl_pos_tot <= cap` | ADL condition gone; re-rank and retry next slot |
| `OracleInvalid` | Hyperp oracle stale | Crank oracle first |
| Simulation failure | Anything else | Log + escalate |

---

## 7. Future Tasks (after PERC-8273 merges)

- Verify `target_idx` encoding matches the core `execute_adl(target_idx)` field (u16 little-endian) — **confirmed: matches PR#38 implementation**
- Add `backupOracles` param to `buildAdlInstruction` for non-hyperp support
- Add `buildAdlInstructionHyperp` vs `buildAdlInstructionStandard` variants if needed

---

## 8. References

- `percolator-prog/src/tags.rs:92` — `TAG_EXECUTE_ADL = 50`
- `percolator-prog/src/percolator.rs:15101` — `ExecuteAdl` handler with full account + precondition docs
- `percolator-sdk/src/abi/instructions.ts` — `encodeExecuteAdl` (PR#38)
- `percolator-sdk/src/adl.ts` — `buildAdlInstruction`, `buildAdlTransaction` (PR#38)
- `percolator-prog/specs/adl-migration-plan.md` — T12 (PERC-8273) is percolator-prog CPI update, not instruction interface change
- PERC-8274 (merged PR#30) — V_ADL slab offset tables used by `fetchAdlRankedPositions`
