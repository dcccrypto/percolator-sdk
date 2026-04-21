import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  ACCOUNTS_INIT_MARKET,
  ACCOUNTS_INIT_USER,
  ACCOUNTS_INIT_LP,
  ACCOUNTS_DEPOSIT_COLLATERAL,
  ACCOUNTS_WITHDRAW_COLLATERAL,
  ACCOUNTS_KEEPER_CRANK,
  ACCOUNTS_TRADE_NOCPI,
  ACCOUNTS_LIQUIDATE_AT_ORACLE,
  ACCOUNTS_CLOSE_ACCOUNT,
  ACCOUNTS_TOPUP_INSURANCE,
  ACCOUNTS_TRADE_CPI,
  ACCOUNTS_SET_RISK_THRESHOLD,
  ACCOUNTS_UPDATE_ADMIN,
  ACCOUNTS_CLOSE_SLAB,
  ACCOUNTS_UPDATE_CONFIG,
  ACCOUNTS_SET_MAINTENANCE_FEE,
  ACCOUNTS_RESOLVE_MARKET,
  ACCOUNTS_WITHDRAW_INSURANCE,
  ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_LIVE,
  ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_RESOLVED,
  ACCOUNTS_SET_ORACLE_PRICE_CAP,
  ACCOUNTS_PAUSE_MARKET,
  ACCOUNTS_UNPAUSE_MARKET,
  ACCOUNTS_ACCEPT_ADMIN,
  ACCOUNTS_ADMIN_FORCE_CLOSE,
  ACCOUNTS_RESOLVE_PERMISSIONLESS,
  ACCOUNTS_FORCE_CLOSE_RESOLVED,
  ACCOUNTS_EXECUTE_ADL,
  ACCOUNTS_CREATE_LP_VAULT,
  ACCOUNTS_LP_VAULT_DEPOSIT,
  ACCOUNTS_LP_VAULT_CRANK_FEES,
  ACCOUNTS_CHALLENGE_SETTLEMENT,
  ACCOUNTS_RESOLVE_DISPUTE,
  ACCOUNTS_DEPOSIT_LP_COLLATERAL,
  ACCOUNTS_WITHDRAW_LP_COLLATERAL,
  ACCOUNTS_SET_OFFSET_PAIR,
  ACCOUNTS_ATTEST_CROSS_MARGIN,
  ACCOUNTS_UPDATE_HYPERP_MARK,
  ACCOUNTS_TRANSFER_OWNERSHIP_CPI,
  ACCOUNTS_RESCUE_ORPHAN_VAULT,
  ACCOUNTS_CLOSE_ORPHAN_SLAB,
  ACCOUNTS_SET_MAX_PNL_CAP,
  ACCOUNTS_SET_OI_CAP_MULTIPLIER,
  ACCOUNTS_SET_DISPUTE_PARAMS,
  ACCOUNTS_SET_LP_COLLATERAL_PARAMS,
  ACCOUNTS_LP_VAULT_WITHDRAW,
  ACCOUNTS_MINT_POSITION_NFT,
  buildAccountMetas,
  WELL_KNOWN,
  type AccountSpec,
} from "../src/abi/accounts.js";
import { detectSlabLayout, SLAB_TIERS_V12_17 } from "../src/solana/slab.js";

// ============================================================================
// Helper
// ============================================================================
function makeKeys(n: number): PublicKey[] {
  return Array.from({ length: n }, () => PublicKey.unique());
}

// ============================================================================
// Account spec structure tests
// ============================================================================

describe("Account orderings", () => {
  const allSpecs: [string, readonly AccountSpec[]][] = [
    ["ACCOUNTS_INIT_MARKET", ACCOUNTS_INIT_MARKET],
    ["ACCOUNTS_INIT_USER", ACCOUNTS_INIT_USER],
    ["ACCOUNTS_INIT_LP", ACCOUNTS_INIT_LP],
    ["ACCOUNTS_DEPOSIT_COLLATERAL", ACCOUNTS_DEPOSIT_COLLATERAL],
    ["ACCOUNTS_WITHDRAW_COLLATERAL", ACCOUNTS_WITHDRAW_COLLATERAL],
    ["ACCOUNTS_KEEPER_CRANK", ACCOUNTS_KEEPER_CRANK],
    ["ACCOUNTS_TRADE_NOCPI", ACCOUNTS_TRADE_NOCPI],
    ["ACCOUNTS_LIQUIDATE_AT_ORACLE", ACCOUNTS_LIQUIDATE_AT_ORACLE],
    ["ACCOUNTS_CLOSE_ACCOUNT", ACCOUNTS_CLOSE_ACCOUNT],
    ["ACCOUNTS_TOPUP_INSURANCE", ACCOUNTS_TOPUP_INSURANCE],
    ["ACCOUNTS_TRADE_CPI", ACCOUNTS_TRADE_CPI],
    ["ACCOUNTS_SET_RISK_THRESHOLD", ACCOUNTS_SET_RISK_THRESHOLD],
    ["ACCOUNTS_UPDATE_ADMIN", ACCOUNTS_UPDATE_ADMIN],
    ["ACCOUNTS_CLOSE_SLAB", ACCOUNTS_CLOSE_SLAB],
    ["ACCOUNTS_UPDATE_CONFIG", ACCOUNTS_UPDATE_CONFIG],
    ["ACCOUNTS_SET_MAINTENANCE_FEE", ACCOUNTS_SET_MAINTENANCE_FEE],
    ["ACCOUNTS_RESOLVE_MARKET", ACCOUNTS_RESOLVE_MARKET],
    ["ACCOUNTS_WITHDRAW_INSURANCE", ACCOUNTS_WITHDRAW_INSURANCE],
    ["ACCOUNTS_SET_ORACLE_PRICE_CAP", ACCOUNTS_SET_ORACLE_PRICE_CAP],
    ["ACCOUNTS_PAUSE_MARKET", ACCOUNTS_PAUSE_MARKET],
    ["ACCOUNTS_UNPAUSE_MARKET", ACCOUNTS_UNPAUSE_MARKET],
  ];

  it.each(allSpecs)("%s has valid structure", (_name, spec) => {
    expect(spec.length).toBeGreaterThan(0);
    for (const account of spec) {
      expect(account).toHaveProperty("name");
      expect(account).toHaveProperty("signer");
      expect(account).toHaveProperty("writable");
      expect(typeof account.name).toBe("string");
      expect(typeof account.signer).toBe("boolean");
      expect(typeof account.writable).toBe("boolean");
    }
  });

  it.each(allSpecs)("%s has unique account names", (_name, spec) => {
    const names = spec.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  // Verify expected account counts match Rust processor
  it("ACCOUNTS_INIT_MARKET has 9 accounts", () => {
    expect(ACCOUNTS_INIT_MARKET).toHaveLength(9);
  });

  it("ACCOUNTS_INIT_USER has 6 accounts (v12.17: clock added)", () => {
    expect(ACCOUNTS_INIT_USER).toHaveLength(6);
  });

  it("ACCOUNTS_INIT_LP has 6 accounts (S-NEW-A: clock added at index 5)", () => {
    expect(ACCOUNTS_INIT_LP).toHaveLength(6);
  });

  it("ACCOUNTS_DEPOSIT_COLLATERAL has 6 accounts", () => {
    expect(ACCOUNTS_DEPOSIT_COLLATERAL).toHaveLength(6);
  });

  it("ACCOUNTS_WITHDRAW_COLLATERAL has 8 accounts", () => {
    expect(ACCOUNTS_WITHDRAW_COLLATERAL).toHaveLength(8);
  });

  it("ACCOUNTS_KEEPER_CRANK has 4 accounts", () => {
    expect(ACCOUNTS_KEEPER_CRANK).toHaveLength(4);
  });

  it("ACCOUNTS_TRADE_NOCPI has 4 accounts (PERC-199: clock removed)", () => {
    expect(ACCOUNTS_TRADE_NOCPI).toHaveLength(4);
  });

  it("ACCOUNTS_LIQUIDATE_AT_ORACLE has 4 accounts", () => {
    expect(ACCOUNTS_LIQUIDATE_AT_ORACLE).toHaveLength(4);
  });

  it("ACCOUNTS_CLOSE_ACCOUNT has 8 accounts", () => {
    expect(ACCOUNTS_CLOSE_ACCOUNT).toHaveLength(8);
  });

  it("ACCOUNTS_TOPUP_INSURANCE has 5 accounts", () => {
    expect(ACCOUNTS_TOPUP_INSURANCE).toHaveLength(5);
  });

  it("ACCOUNTS_TRADE_CPI has 8 accounts (v12.17: lpPda added)", () => {
    expect(ACCOUNTS_TRADE_CPI).toHaveLength(8);
  });

  it("ACCOUNTS_SET_RISK_THRESHOLD has 2 accounts", () => {
    expect(ACCOUNTS_SET_RISK_THRESHOLD).toHaveLength(2);
  });

  it("ACCOUNTS_WITHDRAW_INSURANCE has 6 accounts", () => {
    expect(ACCOUNTS_WITHDRAW_INSURANCE).toHaveLength(6);
  });


  it("ACCOUNTS_SET_ORACLE_PRICE_CAP has 2 accounts", () => {
    expect(ACCOUNTS_SET_ORACLE_PRICE_CAP).toHaveLength(2);
  });

  it("ACCOUNTS_PAUSE_MARKET has 2 accounts", () => {
    expect(ACCOUNTS_PAUSE_MARKET).toHaveLength(2);
  });

  it("ACCOUNTS_UNPAUSE_MARKET has 2 accounts", () => {
    expect(ACCOUNTS_UNPAUSE_MARKET).toHaveLength(2);
  });
});

// ============================================================================
// Signer / writable invariants
// ============================================================================

describe("Signer / writable invariants", () => {
  it("InitMarket admin[0] is signer+writable", () => {
    expect(ACCOUNTS_INIT_MARKET[0].name).toBe("admin");
    expect(ACCOUNTS_INIT_MARKET[0].signer).toBe(true);
    expect(ACCOUNTS_INIT_MARKET[0].writable).toBe(true);
  });

  it("InitUser user[0] is signer+writable", () => {
    expect(ACCOUNTS_INIT_USER[0].name).toBe("user");
    expect(ACCOUNTS_INIT_USER[0].signer).toBe(true);
    expect(ACCOUNTS_INIT_USER[0].writable).toBe(true);
  });

  it("TradeNoCpi has two signers (user and lp)", () => {
    const signers = ACCOUNTS_TRADE_NOCPI.filter((a) => a.signer);
    expect(signers).toHaveLength(2);
    expect(signers[0].name).toBe("user");
    expect(signers[1].name).toBe("lp");
  });

  it("TradeCpi has only user as signer (lpOwner is not signer)", () => {
    const signers = ACCOUNTS_TRADE_CPI.filter((a) => a.signer);
    expect(signers).toHaveLength(1);
    expect(signers[0].name).toBe("user");
  });

  it("LiquidateAtOracle account[0] is not signer and not writable (unused)", () => {
    expect(ACCOUNTS_LIQUIDATE_AT_ORACLE[0].name).toBe("unused");
    expect(ACCOUNTS_LIQUIDATE_AT_ORACLE[0].signer).toBe(false);
    expect(ACCOUNTS_LIQUIDATE_AT_ORACLE[0].writable).toBe(false);
  });

  it("slab is writable in all trading/state-changing instructions", () => {
    const stateChanging = [
      ACCOUNTS_INIT_MARKET,
      ACCOUNTS_INIT_USER,
      ACCOUNTS_INIT_LP,
      ACCOUNTS_DEPOSIT_COLLATERAL,
      ACCOUNTS_WITHDRAW_COLLATERAL,
      ACCOUNTS_KEEPER_CRANK,
      ACCOUNTS_TRADE_NOCPI,
      ACCOUNTS_LIQUIDATE_AT_ORACLE,
      ACCOUNTS_CLOSE_ACCOUNT,
      ACCOUNTS_TOPUP_INSURANCE,
      ACCOUNTS_TRADE_CPI,
      ACCOUNTS_SET_RISK_THRESHOLD,
      ACCOUNTS_PAUSE_MARKET,
      ACCOUNTS_UNPAUSE_MARKET,
    ];
    for (const spec of stateChanging) {
      const slab = spec.find((a) => a.name === "slab");
      expect(slab, `slab missing in spec`).toBeDefined();
      expect(slab!.writable).toBe(true);
    }
  });

  it("admin-only instructions require admin/authority as signer", () => {
    const adminInstructions = [
      ACCOUNTS_SET_RISK_THRESHOLD,
      ACCOUNTS_UPDATE_ADMIN,
      ACCOUNTS_CLOSE_SLAB,
      ACCOUNTS_UPDATE_CONFIG,
      ACCOUNTS_SET_MAINTENANCE_FEE,
      ACCOUNTS_RESOLVE_MARKET,
      ACCOUNTS_PAUSE_MARKET,
      ACCOUNTS_UNPAUSE_MARKET,
    ];
    for (const spec of adminInstructions) {
      expect(spec[0].signer).toBe(true);
    }
  });

});

// ============================================================================
// buildAccountMetas
// ============================================================================

describe("buildAccountMetas", () => {
  it("builds correct metas for a 2-account spec", () => {
    const keys = makeKeys(2);
    const metas = buildAccountMetas(ACCOUNTS_SET_RISK_THRESHOLD, keys);

    expect(metas).toHaveLength(2);
    expect(metas[0].pubkey.equals(keys[0])).toBe(true);
    expect(metas[0].isSigner).toBe(true);
    expect(metas[0].isWritable).toBe(true);
    expect(metas[1].pubkey.equals(keys[1])).toBe(true);
    expect(metas[1].isSigner).toBe(false);
    expect(metas[1].isWritable).toBe(true);
  });

  it("builds correct metas for InitMarket (9 accounts)", () => {
    const keys = makeKeys(9);
    const metas = buildAccountMetas(ACCOUNTS_INIT_MARKET, keys);

    expect(metas).toHaveLength(9);
    // admin
    expect(metas[0].isSigner).toBe(true);
    expect(metas[0].isWritable).toBe(true);
    // slab
    expect(metas[1].isSigner).toBe(false);
    expect(metas[1].isWritable).toBe(true);
    // mint (read-only)
    expect(metas[2].isSigner).toBe(false);
    expect(metas[2].isWritable).toBe(false);
    // All keys match
    for (let i = 0; i < 9; i++) {
      expect(metas[i].pubkey.equals(keys[i])).toBe(true);
    }
  });

  it("throws on key count mismatch (too few keys)", () => {
    const keys = makeKeys(1);
    expect(() => buildAccountMetas(ACCOUNTS_SET_RISK_THRESHOLD, keys)).toThrow(
      "Account count mismatch: expected 2, got 1"
    );
  });

  it("throws on key count mismatch (too many keys)", () => {
    const keys = makeKeys(10);
    expect(() => buildAccountMetas(ACCOUNTS_INIT_MARKET, keys)).toThrow(
      "Account count mismatch: expected 9, got 10"
    );
  });

  it("handles zero-key spec (empty)", () => {
    const emptySpec: readonly AccountSpec[] = [];
    const metas = buildAccountMetas(emptySpec, []);
    expect(metas).toHaveLength(0);
  });

  it("preserves pubkey identity (not just equals)", () => {
    const key = PublicKey.unique();
    const metas = buildAccountMetas(
      [{ name: "test", signer: false, writable: false }],
      [key]
    );
    expect(metas[0].pubkey).toBe(key);
  });

  // Named-map form (Record<string, PublicKey>)
  it("accepts a named-map object for CloseSlab (6 accounts — S-1)", () => {
    const [dest, slab, vault, vaultAuthority, destAta, tokenProgram] = makeKeys(6);
    const metas = buildAccountMetas(ACCOUNTS_CLOSE_SLAB, {
      dest, slab, vault, vaultAuthority, destAta, tokenProgram,
    });
    expect(metas).toHaveLength(6);
    expect(metas[0].pubkey.equals(dest)).toBe(true);
    expect(metas[0].isSigner).toBe(true);
    expect(metas[0].isWritable).toBe(true);
    expect(metas[1].pubkey.equals(slab)).toBe(true);
    expect(metas[1].isSigner).toBe(false);
    expect(metas[1].isWritable).toBe(true);
    expect(metas[2].pubkey.equals(vault)).toBe(true);
    expect(metas[2].isWritable).toBe(true);
    expect(metas[3].pubkey.equals(vaultAuthority)).toBe(true);
    expect(metas[3].isWritable).toBe(false);
    expect(metas[4].pubkey.equals(destAta)).toBe(true);
    expect(metas[4].isWritable).toBe(true);
    expect(metas[5].pubkey.equals(tokenProgram)).toBe(true);
    expect(metas[5].isWritable).toBe(false);
  });

  it("accepts a named-map object for InitMarket (9 accounts)", () => {
    const [admin, slab, mint, vault, tokenProgram, clock, rent, dummyAta, systemProgram] = makeKeys(9);
    const metas = buildAccountMetas(ACCOUNTS_INIT_MARKET, {
      admin, slab, mint, vault, tokenProgram, clock, rent, dummyAta, systemProgram,
    });
    expect(metas).toHaveLength(9);
    expect(metas[0].pubkey.equals(admin)).toBe(true);
    expect(metas[1].pubkey.equals(slab)).toBe(true);
    expect(metas[8].pubkey.equals(systemProgram)).toBe(true);
  });

  it("throws a clear error when a named-map is missing a required key", () => {
    const [dest] = makeKeys(1);
    // ACCOUNTS_CLOSE_SLAB needs 6 accounts; providing only "dest" triggers error on "slab"
    expect(() => buildAccountMetas(ACCOUNTS_CLOSE_SLAB, { dest } as Record<string, PublicKey>)).toThrow(
      'buildAccountMetas: missing key for account "slab"'
    );
  });
});

// ============================================================================
// WELL_KNOWN
// ============================================================================

describe("WELL_KNOWN program/sysvar keys", () => {
  it("tokenProgram is SPL Token program ID", () => {
    expect(WELL_KNOWN.tokenProgram.toBase58()).toBe(
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    );
  });

  it("clock is SYSVAR_CLOCK_PUBKEY", () => {
    expect(WELL_KNOWN.clock.toBase58()).toBe(
      "SysvarC1ock11111111111111111111111111111111"
    );
  });

  it("rent is SYSVAR_RENT_PUBKEY", () => {
    expect(WELL_KNOWN.rent.toBase58()).toBe(
      "SysvarRent111111111111111111111111111111111"
    );
  });

  it("systemProgram is SystemProgram.programId", () => {
    expect(WELL_KNOWN.systemProgram.toBase58()).toBe(
      "11111111111111111111111111111111"
    );
  });
});

// ============================================================================
// Pre-audit account count assertions (S-1, S-NEW-A, S-5 + roundtrips)
// ============================================================================

describe("Pre-audit account count fixes", () => {
  // S-1: CloseSlab 2 → 6
  it("ACCOUNTS_CLOSE_SLAB has 6 accounts (S-1: was 2)", () => {
    expect(ACCOUNTS_CLOSE_SLAB).toHaveLength(6);
  });

  it("ACCOUNTS_CLOSE_SLAB account names match program handler (S-1)", () => {
    const names = ACCOUNTS_CLOSE_SLAB.map((a) => a.name);
    expect(names).toEqual(["dest", "slab", "vault", "vaultAuthority", "destAta", "tokenProgram"]);
  });

  it("ACCOUNTS_CLOSE_SLAB roundtrip through buildAccountMetas (S-1)", () => {
    const keys = makeKeys(6);
    const metas = buildAccountMetas(ACCOUNTS_CLOSE_SLAB, keys);
    expect(metas).toHaveLength(6);
    // dest: signer+writable
    expect(metas[0].isSigner).toBe(true);
    expect(metas[0].isWritable).toBe(true);
    // vaultAuthority: read-only
    expect(metas[3].isSigner).toBe(false);
    expect(metas[3].isWritable).toBe(false);
    // tokenProgram: read-only
    expect(metas[5].isSigner).toBe(false);
    expect(metas[5].isWritable).toBe(false);
  });

  // S-NEW-A: InitLP 5 → 6 (clock added at index 5)
  it("ACCOUNTS_INIT_LP has 6 accounts (S-NEW-A: clock was missing)", () => {
    expect(ACCOUNTS_INIT_LP).toHaveLength(6);
  });

  it("ACCOUNTS_INIT_LP[5] is clock, read-only (S-NEW-A)", () => {
    expect(ACCOUNTS_INIT_LP[5].name).toBe("clock");
    expect(ACCOUNTS_INIT_LP[5].signer).toBe(false);
    expect(ACCOUNTS_INIT_LP[5].writable).toBe(false);
  });

  it("ACCOUNTS_INIT_LP roundtrip through buildAccountMetas (S-NEW-A)", () => {
    const keys = makeKeys(6);
    const metas = buildAccountMetas(ACCOUNTS_INIT_LP, keys);
    expect(metas).toHaveLength(6);
    // user: signer+writable
    expect(metas[0].isSigner).toBe(true);
    expect(metas[0].isWritable).toBe(true);
    // clock: not signer, not writable
    expect(metas[5].isSigner).toBe(false);
    expect(metas[5].isWritable).toBe(false);
  });

  // S-NEW-B: ACCOUNTS_MINT_POSITION_NFT — deferred.
  // The program handler at percolator.rs:11873 uses `if accounts.len() < 10`
  // (minimum 10 required, optional 11th ATA program) — NOT expect_len(accounts, 9).
  // The task spec references line 9654 which is LpVaultDeposit (9 accounts), not
  // MintPositionNft. The SDK's 10-account spec matches the actual program minimum.
  // Keeping 10 accounts as-is; removing `rent` would break the program.
  it("ACCOUNTS_MINT_POSITION_NFT has 10 accounts (S-NEW-B: deferred, 10 is correct)", () => {
    expect(ACCOUNTS_MINT_POSITION_NFT).toHaveLength(10);
  });

  // S-5: AcceptAdmin (tag 82) — new constant
  it("ACCOUNTS_ACCEPT_ADMIN has 2 accounts (S-5)", () => {
    expect(ACCOUNTS_ACCEPT_ADMIN).toHaveLength(2);
  });

  it("ACCOUNTS_ACCEPT_ADMIN[0] is pendingAdmin — signer+writable (S-5)", () => {
    expect(ACCOUNTS_ACCEPT_ADMIN[0].name).toBe("pendingAdmin");
    expect(ACCOUNTS_ACCEPT_ADMIN[0].signer).toBe(true);
    expect(ACCOUNTS_ACCEPT_ADMIN[0].writable).toBe(true);
  });

  it("ACCOUNTS_ACCEPT_ADMIN[1] is slab — writable (S-5)", () => {
    expect(ACCOUNTS_ACCEPT_ADMIN[1].name).toBe("slab");
    expect(ACCOUNTS_ACCEPT_ADMIN[1].signer).toBe(false);
    expect(ACCOUNTS_ACCEPT_ADMIN[1].writable).toBe(true);
  });

  it("ACCOUNTS_ACCEPT_ADMIN roundtrip through buildAccountMetas (S-5)", () => {
    const [pendingAdmin, slab] = makeKeys(2);
    const metas = buildAccountMetas(ACCOUNTS_ACCEPT_ADMIN, { pendingAdmin, slab });
    expect(metas).toHaveLength(2);
    expect(metas[0].pubkey.equals(pendingAdmin)).toBe(true);
    expect(metas[0].isSigner).toBe(true);
    expect(metas[1].pubkey.equals(slab)).toBe(true);
    expect(metas[1].isSigner).toBe(false);
  });

  // WITHDRAW_INSURANCE_LIMITED roundtrips
  it("ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_RESOLVED has 7 accounts", () => {
    expect(ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_RESOLVED).toHaveLength(7);
  });

  it("ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_LIVE has 8 accounts (RESOLVED + oracle)", () => {
    expect(ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_LIVE).toHaveLength(8);
    expect(ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_LIVE[7].name).toBe("oracle");
  });

  it("ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_RESOLVED roundtrip through buildAccountMetas", () => {
    const keys = makeKeys(7);
    const metas = buildAccountMetas(ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_RESOLVED, keys);
    expect(metas).toHaveLength(7);
    expect(metas[0].isSigner).toBe(true);
    expect(metas[0].isWritable).toBe(true);
  });

  it("ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_LIVE roundtrip through buildAccountMetas", () => {
    const keys = makeKeys(8);
    const metas = buildAccountMetas(ACCOUNTS_WITHDRAW_INSURANCE_LIMITED_LIVE, keys);
    expect(metas).toHaveLength(8);
  });

  // LP_VAULT_WITHDRAW roundtrip
  it("ACCOUNTS_LP_VAULT_WITHDRAW has 10 accounts", () => {
    expect(ACCOUNTS_LP_VAULT_WITHDRAW).toHaveLength(10);
  });

  it("ACCOUNTS_LP_VAULT_WITHDRAW roundtrip through buildAccountMetas", () => {
    const keys = makeKeys(10);
    const metas = buildAccountMetas(ACCOUNTS_LP_VAULT_WITHDRAW, keys);
    expect(metas).toHaveLength(10);
    // creatorLockPda at index 9: writable
    expect(metas[9].isWritable).toBe(true);
  });

  // EXECUTE_ADL roundtrip
  it("ACCOUNTS_EXECUTE_ADL has 4 accounts", () => {
    expect(ACCOUNTS_EXECUTE_ADL).toHaveLength(4);
  });

  it("ACCOUNTS_EXECUTE_ADL roundtrip through buildAccountMetas", () => {
    const keys = makeKeys(4);
    const metas = buildAccountMetas(ACCOUNTS_EXECUTE_ADL, keys);
    expect(metas).toHaveLength(4);
    expect(metas[0].isSigner).toBe(true);
    expect(metas[1].isWritable).toBe(true);
  });

  it("live wrapper account specs added for recent handlers have the expected lengths", () => {
    expect(ACCOUNTS_ADMIN_FORCE_CLOSE).toHaveLength(8);
    expect(ACCOUNTS_RESOLVE_PERMISSIONLESS).toHaveLength(3);
    expect(ACCOUNTS_FORCE_CLOSE_RESOLVED).toHaveLength(7);
    expect(ACCOUNTS_CREATE_LP_VAULT).toHaveLength(8);
    expect(ACCOUNTS_LP_VAULT_DEPOSIT).toHaveLength(9);
    expect(ACCOUNTS_LP_VAULT_CRANK_FEES).toHaveLength(2);
    expect(ACCOUNTS_CHALLENGE_SETTLEMENT).toHaveLength(7);
    expect(ACCOUNTS_RESOLVE_DISPUTE).toHaveLength(7);
    expect(ACCOUNTS_DEPOSIT_LP_COLLATERAL).toHaveLength(7);
    expect(ACCOUNTS_WITHDRAW_LP_COLLATERAL).toHaveLength(8);
    expect(ACCOUNTS_SET_OFFSET_PAIR).toHaveLength(5);
    expect(ACCOUNTS_ATTEST_CROSS_MARGIN).toHaveLength(6);
    expect(ACCOUNTS_UPDATE_HYPERP_MARK).toHaveLength(3);
    expect(ACCOUNTS_TRANSFER_OWNERSHIP_CPI).toHaveLength(3);
    expect(ACCOUNTS_RESCUE_ORPHAN_VAULT).toHaveLength(6);
    expect(ACCOUNTS_CLOSE_ORPHAN_SLAB).toHaveLength(3);
    expect(ACCOUNTS_SET_MAX_PNL_CAP).toHaveLength(2);
    expect(ACCOUNTS_SET_OI_CAP_MULTIPLIER).toHaveLength(2);
    expect(ACCOUNTS_SET_DISPUTE_PARAMS).toHaveLength(2);
    expect(ACCOUNTS_SET_LP_COLLATERAL_PARAMS).toHaveLength(2);
  });

  it("recent wrapper account specs roundtrip through buildAccountMetas", () => {
    for (const spec of [
      ACCOUNTS_ADMIN_FORCE_CLOSE,
      ACCOUNTS_RESOLVE_PERMISSIONLESS,
      ACCOUNTS_FORCE_CLOSE_RESOLVED,
      ACCOUNTS_CREATE_LP_VAULT,
      ACCOUNTS_LP_VAULT_DEPOSIT,
      ACCOUNTS_LP_VAULT_CRANK_FEES,
      ACCOUNTS_CHALLENGE_SETTLEMENT,
      ACCOUNTS_RESOLVE_DISPUTE,
      ACCOUNTS_DEPOSIT_LP_COLLATERAL,
      ACCOUNTS_WITHDRAW_LP_COLLATERAL,
      ACCOUNTS_SET_OFFSET_PAIR,
      ACCOUNTS_ATTEST_CROSS_MARGIN,
      ACCOUNTS_UPDATE_HYPERP_MARK,
      ACCOUNTS_TRANSFER_OWNERSHIP_CPI,
      ACCOUNTS_RESCUE_ORPHAN_VAULT,
      ACCOUNTS_CLOSE_ORPHAN_SLAB,
      ACCOUNTS_SET_MAX_PNL_CAP,
      ACCOUNTS_SET_OI_CAP_MULTIPLIER,
      ACCOUNTS_SET_DISPUTE_PARAMS,
      ACCOUNTS_SET_LP_COLLATERAL_PARAMS,
    ]) {
      const metas = buildAccountMetas(spec, makeKeys(spec.length));
      expect(metas).toHaveLength(spec.length);
    }
  });
});

// ============================================================================
// Layout-verify: buildLayoutV12_17 configLen must be 512 (S-2)
// TODO: replace hardcoded 512 with a value read from a reference fixture once
// the fixture generation pipeline is set up.
// ============================================================================

describe("Layout verify: v12.17 configLen matches MarketConfig SBF size", () => {
  it("detectSlabLayout on a v12.17 tier returns configLen === 512", () => {
    // Use the small v12.17 tier (256 accounts) to get a layout without
    // allocating a full buffer — we only need the configLen field.
    const tier = SLAB_TIERS_V12_17["small"];
    expect(tier).toBeDefined();
    const layout = detectSlabLayout(tier.dataSize);
    expect(layout).not.toBeNull();
    // 512 = SBF-aligned MarketConfig size after Phase A/B/E.
    // Verified field-by-field against percolator-prog/src/percolator.rs MarketConfig.
    // Missing 80 bytes from prior value 432: max_pnl_cap, last_audit_pause_slot,
    // oi_cap_multiplier_bps, dispute_window_slots, dispute_bond_amount,
    // lp_collateral_enabled, lp_collateral_ltv_bps, _new_fields_pad, pending_admin.
    expect(layout!.configLen).toBe(512);
  });

  // v12.17 dropped the engine.mark_price field — trades used to let the indexer
  // read engine.mark_price from the slab's post-state for fill-price recovery;
  // now it's -1. The fallback is MarketConfig.mark_ewma_e6 at offset 304 within
  // the config struct (= absolute slab offset 72 + 304 = 376). Without this
  // the indexer writes price=0 for every v12.17 trade and the chart renders as
  // a flat line at 0.
  it("v12.17 exposes configMarkEwmaOff=376 for fill-price recovery", () => {
    const tier = SLAB_TIERS_V12_17["small"];
    const layout = detectSlabLayout(tier.dataSize);
    expect(layout).not.toBeNull();
    expect(layout!.engineMarkPriceOff).toBe(-1);
    expect(layout!.configMarkEwmaOff).toBe(376);
  });
});
