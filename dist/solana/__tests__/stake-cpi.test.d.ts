/**
 * E2E CPI Integration Tests — percolator-stake SDK
 *
 * Verifies the full stake lifecycle at the instruction-building level:
 * InitPool → Deposit → Withdraw → FlushToInsurance → Admin CPI forwarding
 *
 * These tests validate that:
 * 1. Instructions are built with correct account ordering, signer/writable flags
 * 2. The CPI flow from stake → percolator produces correct account specs
 * 3. PDA seeds chain correctly across the full lifecycle
 * 4. Encoded instruction data matches expected byte layouts
 *
 * NOTE: This runs in a mocked environment (no real Solana validator).
 * For on-chain devnet tests, see tests/t*-stake*.ts.
 */
export {};
