/**
 * #352: the stake program accepts ONLY the classic SPL Token program (percolator-stake
 * `verify_token_program`, processor.rs:17). The builders must refuse Token-2022 at build time.
 */
import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  assertClassicTokenProgram,
  initPoolAccounts,
  depositAccounts,
  depositJuniorAccounts,
  withdrawAccounts,
  flushToInsuranceAccounts,
  recoverFlushedInsuranceAccounts,
  recoverTerminalInsuranceAccounts,
  adminCloseSlabAccounts,
} from "../src/solana/stake.js";

const k = (): PublicKey => Keypair.generate().publicKey;
const initPool = { admin: k(), slab: k(), pool: k(), lpMint: k(), vault: k(), vaultAuth: k(), collateralMint: k(), percolatorProgram: k() };
const deposit = { user: k(), pool: k(), userCollateralAta: k(), vault: k(), lpMint: k(), userLpAta: k(), vaultAuth: k(), depositPda: k(), slab: k() };
const withdraw = { user: k(), pool: k(), userLpAta: k(), lpMint: k(), vault: k(), userCollateralAta: k(), vaultAuth: k(), depositPda: k() };
const flush = { caller: k(), pool: k(), vault: k(), vaultAuth: k(), slab: k(), wrapperVault: k(), percolatorProgram: k() };
const rfi = { caller: k(), poolPda: k(), poolVault: k(), vaultAuth: k(), wrapperMarket: k(), wrapperVault: k(), wrapperVaultAuth: k(), percolatorProgram: k() };
const rti = { caller: k(), pool: k(), poolVault: k(), vaultAuth: k(), market: k(), wrapperVault: k(), wrapperVaultAuthority: k(), wrapperProgram: k() };
const acs = { admin: k(), pool: k(), market: k(), wrapperVault: k(), wrapperVaultAuthority: k(), poolDestToken: k(), collateralMint: k(), poolVault: k(), wrapperProgram: k() };

describe("#352 stake builders reject Token-2022", () => {
  it("assertClassicTokenProgram accepts classic, rejects Token-2022 and arbitrary ids", () => {
    expect(assertClassicTokenProgram(TOKEN_PROGRAM_ID).equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(() => assertClassicTokenProgram(TOKEN_2022_PROGRAM_ID)).toThrow(/Token-2022 is not supported/);
    expect(() => assertClassicTokenProgram(k())).toThrow(/unsupported token program/);
  });

  it("defaults still build with the classic program", () => {
    expect(initPoolAccounts(initPool).some((m) => m.pubkey.equals(TOKEN_PROGRAM_ID))).toBe(true);
    expect(depositAccounts(deposit)[8].pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(depositJuniorAccounts(deposit)[8].pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(withdrawAccounts(withdraw)[8].pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(flushToInsuranceAccounts(flush)[7].pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(recoverTerminalInsuranceAccounts(rti)[7].pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(adminCloseSlabAccounts(acs)[6].pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(recoverFlushedInsuranceAccounts({ ...rfi, tokenProgram: TOKEN_PROGRAM_ID })[7].pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
  });

  const re = /Token-2022 is not supported/;
  it("every token-program-taking builder throws for TOKEN_2022_PROGRAM_ID", () => {
    expect(() => initPoolAccounts(initPool, TOKEN_2022_PROGRAM_ID)).toThrow(re);
    expect(() => depositAccounts(deposit, TOKEN_2022_PROGRAM_ID)).toThrow(re);
    expect(() => depositJuniorAccounts(deposit, TOKEN_2022_PROGRAM_ID)).toThrow(re);
    expect(() => withdrawAccounts(withdraw, TOKEN_2022_PROGRAM_ID)).toThrow(re);
    expect(() => flushToInsuranceAccounts(flush, TOKEN_2022_PROGRAM_ID)).toThrow(re);
    expect(() => recoverFlushedInsuranceAccounts({ ...rfi, tokenProgram: TOKEN_2022_PROGRAM_ID })).toThrow(re);
    expect(() => recoverTerminalInsuranceAccounts({ ...rti, tokenProgram: TOKEN_2022_PROGRAM_ID })).toThrow(re);
    expect(() => adminCloseSlabAccounts({ ...acs, tokenProgram: TOKEN_2022_PROGRAM_ID })).toThrow(re);
  });
});
