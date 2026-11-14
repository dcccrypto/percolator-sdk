/**
 * DEX pool decoders: exact-byte tests against the real account layouts.
 *
 * Offsets are literals here, not imported, so a drift in dex-oracle.ts fails.
 * Where each offset comes from (8-byte Anchor discriminator first in all three):
 *
 * Raydium CLMM `PoolState`, raydium-io/raydium-clmm
 *   programs/amm/src/states/pool.rs (repr(C, packed), LEN sums to 1544):
 *   bump@8, amm_config@9, owner@41, token_mint_0@73, token_mint_1@105,
 *   token_vault_0@137, token_vault_1@169, observation_key@201,
 *   mint_decimals_0@233, mint_decimals_1@234, tick_spacing u16@235,
 *   liquidity u128@237, sqrt_price_x64 u128@253, tick_current i32@269.
 *
 * PumpSwap `Pool`, pump-fun/pump-public-docs idl/pump_amm.json (Borsh):
 *   pool_bump@8, index u16@9, creator@11, base_mint@43, quote_mint@75,
 *   lp_mint@107, pool_base_token_account@139, pool_quote_token_account@171,
 *   lp_supply u64@203, coin_creator@211. Later fields were appended over time,
 *   so live accounts are longer; the decoder needs only the first 203 bytes.
 *
 * Meteora DLMM `LbPair`, MeteoraAg/dlmm-sdk idls/dlmm.json (bytemuck, 904 bytes):
 *   parameters(32)@8, v_parameters(32)@40, bump_seed@72, bin_step_seed [u8;2]@73,
 *   pair_type@75, active_id i32@76, bin_step u16@80, status@82, ...,
 *   token_x_mint@88, token_y_mint@120, reserve_x@152, reserve_y@184.
 *
 * SPL Token (spl-token state.rs): Account = mint@0, owner@32, amount u64@64
 *   (165 bytes). Mint = mint_authority COption(36)@0, supply u64@36,
 *   decimals u8@44 (82 bytes).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  computeDexSpotPriceE6,
  detectDexType,
  fetchMintDecimals,
  parseDexPool,
  SPL_MINT_DECIMALS_OFFSET,
  WSOL_MINT,
} from "../src/solana/dex-oracle.js";
import {
  METEORA_DLMM_PROGRAM_ID,
  PUMPSWAP_PROGRAM_ID,
  RAYDIUM_CLMM_PROGRAM_ID,
} from "../src/solana/pda.js";

const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
const POOL = key(1);
const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

function put(buf: Uint8Array, off: number, pk: PublicKey) {
  buf.set(pk.toBytes(), off);
}

// ---------------------------------------------------------------- builders

function raydium(o: { d0?: number; d1?: number; sqrt?: bigint; liquidity?: bigint; len?: number } = {}) {
  const b = new Uint8Array(o.len ?? 1544);
  if (b.length < 269) return b;
  const dv = new DataView(b.buffer);
  put(b, 9, key(0xa1)); // amm_config
  put(b, 41, key(0xa2)); // owner
  put(b, 73, key(0x10)); // token_mint_0
  put(b, 105, key(0x20)); // token_mint_1
  put(b, 137, key(0xa3)); // token_vault_0
  put(b, 169, key(0xa4)); // token_vault_1
  put(b, 201, key(0xa5)); // observation_key
  b[233] = o.d0 ?? 9;
  b[234] = o.d1 ?? 6;
  dv.setUint16(235, 1, true);
  const liq = o.liquidity ?? 1n << 70n;
  dv.setBigUint64(237, liq & 0xffff_ffff_ffff_ffffn, true);
  dv.setBigUint64(245, liq >> 64n, true);
  const s = o.sqrt ?? 1n << 64n;
  dv.setBigUint64(253, s & 0xffff_ffff_ffff_ffffn, true);
  dv.setBigUint64(261, s >> 64n, true);
  return b;
}

function pumpPool(o: { quoteMint?: PublicKey; len?: number } = {}) {
  const b = new Uint8Array(o.len ?? 301);
  if (b.length < 203) return b;
  put(b, 11, key(0xb1)); // creator
  put(b, 43, key(0x30)); // base_mint
  put(b, 75, o.quoteMint ?? WSOL_MINT); // quote_mint
  put(b, 107, key(0xb2)); // lp_mint
  put(b, 139, key(0x31)); // pool_base_token_account
  put(b, 171, key(0x32)); // pool_quote_token_account
  return b;
}

function tokenAccount(amount: bigint, len = 165) {
  const b = new Uint8Array(len);
  if (len >= 72) {
    put(b, 0, key(0xc1)); // mint
    put(b, 32, key(0xc2)); // owner
    new DataView(b.buffer).setBigUint64(64, amount, true);
  }
  return b;
}

function lbPair(o: { activeId?: number; binStep?: number; binStepSeed?: number; len?: number } = {}) {
  const b = new Uint8Array(o.len ?? 904);
  if (b.length < 152) return b;
  const dv = new DataView(b.buffer);
  b.fill(0xee, 8, 72); // parameters + v_parameters: junk, must not be read
  dv.setUint16(73, o.binStepSeed ?? 0xffff, true); // bin_step_seed, NOT bin_step
  dv.setInt32(76, o.activeId ?? 0, true);
  dv.setUint16(80, o.binStep ?? 100, true);
  b.fill(0xdd, 82, 88);
  put(b, 88, key(0x40)); // token_x_mint
  put(b, 120, key(0x41)); // token_y_mint
  if (b.length >= 216) {
    put(b, 152, key(0x42)); // reserve_x
    put(b, 184, key(0x43)); // reserve_y
  }
  return b;
}

const meteora = (data: Uint8Array, base: number, quote: number) =>
  computeDexSpotPriceE6("meteora-dlmm", data, undefined, { base, quote });

// ---------------------------------------------------------------- tests

describe("detectDexType", () => {
  it("maps each program id and returns null otherwise", () => {
    expect(detectDexType(PUMPSWAP_PROGRAM_ID)).toBe("pumpswap");
    expect(detectDexType(RAYDIUM_CLMM_PROGRAM_ID)).toBe("raydium-clmm");
    expect(detectDexType(METEORA_DLMM_PROGRAM_ID)).toBe("meteora-dlmm");
    expect(detectDexType(key(9))).toBeNull();
  });
});

describe("Raydium CLMM PoolState", () => {
  it("reads token_mint_0 @73 and token_mint_1 @105", () => {
    const info = parseDexPool("raydium-clmm", POOL, raydium());
    expect(info).toEqual({ dexType: "raydium-clmm", poolAddress: POOL, baseMint: key(0x10), quoteMint: key(0x20) });
  });

  it("269 bytes (through sqrt_price_x64) is enough; 268 throws in both paths", () => {
    const full = raydium();
    expect(parseDexPool("raydium-clmm", POOL, full.slice(0, 269)).quoteMint).toEqual(key(0x20));
    expect(computeDexSpotPriceE6("raydium-clmm", full.slice(0, 269))).toBe(1_000_000_000n);
    expect(() => parseDexPool("raydium-clmm", POOL, full.slice(0, 268))).toThrow(/too short: 268 < 269/);
    expect(() => computeDexSpotPriceE6("raydium-clmm", full.slice(0, 268))).toThrow(/too short: 268 < 269/);
    expect(() => computeDexSpotPriceE6("raydium-clmm", new Uint8Array(0))).toThrow(/too short/);
  });

  it("sqrt 2^64, decimals 9/6 (SOL/USDC shape) -> 1000.000000", () => {
    expect(computeDexSpotPriceE6("raydium-clmm", raydium({ d0: 9, d1: 6, sqrt: 1n << 64n }))).toBe(1_000_000_000n);
  });

  it("sqrt 2^63, decimals 9/6 -> raw 0.25 * 1e3 = 250.000000", () => {
    expect(computeDexSpotPriceE6("raydium-clmm", raydium({ d0: 9, d1: 6, sqrt: 1n << 63n }))).toBe(250_000_000n);
  });

  it("negative decimal diff: decimals 6/9, sqrt 2^64 -> 0.001000", () => {
    expect(computeDexSpotPriceE6("raydium-clmm", raydium({ d0: 6, d1: 9, sqrt: 1n << 64n }))).toBe(1_000n);
  });

  it("reads the high u64 of sqrt_price_x64 (sqrt 2^65 -> 4.0)", () => {
    expect(computeDexSpotPriceE6("raydium-clmm", raydium({ d0: 6, d1: 6, sqrt: 1n << 65n }))).toBe(4_000_000n);
  });

  it("decimals > 24 throw", () => {
    expect(() => computeDexSpotPriceE6("raydium-clmm", raydium({ d0: 25, d1: 6 }))).toThrow(/decimals out of range/);
    expect(() => computeDexSpotPriceE6("raydium-clmm", raydium({ d0: 6, d1: 25 }))).toThrow(/decimals out of range/);
  });

  it("works on a subarray with a non-zero byteOffset", () => {
    const outer = new Uint8Array(1544 + 7);
    outer.fill(0xff);
    outer.set(raydium({ d0: 9, d1: 6, sqrt: 1n << 63n }), 7);
    expect(computeDexSpotPriceE6("raydium-clmm", outer.subarray(7))).toBe(250_000_000n);
  });

  it("does not read liquidity: a zero-liquidity pool still prices from sqrt_price_x64", () => {
    // Documents current behavior. PoolState.liquidity (@237) is the in-range
    // liquidity; the decoder ignores it, so callers must check depth themselves.
    expect(computeDexSpotPriceE6("raydium-clmm", raydium({ liquidity: 0n }))).toBe(1_000_000_000n);
  });

  it("sqrt so small the price rounds to zero throws instead of returning 0n", () => {
    // sqrt_price_x64 = 1 -> (1 * 1 * 1e6) >> 128 = 0
    expect(() => computeDexSpotPriceE6("raydium-clmm", raydium({ d0: 6, d1: 6, sqrt: 1n }))).toThrow(/price/i);
  });
});

describe("PumpSwap Pool", () => {
  it("reads base_mint @43, quote_mint @75 and the two vaults @139/@171, not creator @11", () => {
    const info = parseDexPool("pumpswap", POOL, pumpPool());
    expect(info).toEqual({
      dexType: "pumpswap",
      poolAddress: POOL,
      baseMint: key(0x30),
      quoteMint: WSOL_MINT,
      baseVault: key(0x31),
      quoteVault: key(0x32),
    });
  });

  it("203 bytes is enough; 202 throws in both paths", () => {
    const pool = pumpPool().slice(0, 203);
    expect(parseDexPool("pumpswap", POOL, pool).quoteVault).toEqual(key(0x32));
    expect(() => parseDexPool("pumpswap", POOL, pool.slice(0, 202))).toThrow(/too short: 202 < 203/);
    const v = { base: tokenAccount(1n), quote: tokenAccount(1n) };
    expect(() => computeDexSpotPriceE6("pumpswap", pool.slice(0, 202), v, { base: 6, quote: 9 }, 1n)).toThrow(
      /pool data too short: 202 < 203/,
    );
  });

  it("vault accounts need 72 bytes (amount u64 @64)", () => {
    const pool = pumpPool();
    const ok = tokenAccount(1_000_000n);
    const d = { base: 6, quote: 9 };
    expect(() => computeDexSpotPriceE6("pumpswap", pool, { base: tokenAccount(1n, 71), quote: ok }, d, 1n)).toThrow(
      /base vault data too short: 71 < 72/,
    );
    expect(() => computeDexSpotPriceE6("pumpswap", pool, { base: ok, quote: tokenAccount(1n, 71) }, d, 1n)).toThrow(
      /quote vault data too short: 71 < 72/,
    );
    // exactly 72 bytes is enough
    expect(
      computeDexSpotPriceE6(
        "pumpswap",
        pumpPool({ quoteMint: USDC }),
        { base: ok.slice(0, 72), quote: ok.slice(0, 72) },
        { base: 6, quote: 6 },
      ),
    ).toBe(1_000_000n);
  });

  it("WSOL-quoted: 1M tokens (6dp) vs 30 SOL (9dp) at $150 -> $0.004500", () => {
    const v = { base: tokenAccount(1_000_000_000_000n), quote: tokenAccount(30_000_000_000n) };
    expect(computeDexSpotPriceE6("pumpswap", pumpPool(), v, { base: 6, quote: 9 }, 150_000_000n)).toBe(4_500n);
  });

  it("WSOL-quoted without solPriceE6 throws", () => {
    const v = { base: tokenAccount(1_000_000n), quote: tokenAccount(1_000_000_000n) };
    expect(() => computeDexSpotPriceE6("pumpswap", pumpPool(), v, { base: 6, quote: 9 })).toThrow(/solPriceE6/);
  });

  it("non-WSOL quote is returned without SOL conversion (solPriceE6 ignored)", () => {
    const v = { base: tokenAccount(2_000_000n), quote: tokenAccount(3_000_000n) };
    const pool = pumpPool({ quoteMint: USDC });
    expect(computeDexSpotPriceE6("pumpswap", pool, v, { base: 6, quote: 6 })).toBe(1_500_000n);
    expect(computeDexSpotPriceE6("pumpswap", pool, v, { base: 6, quote: 6 }, 999n)).toBe(1_500_000n);
  });

  it("reads the high u32 of the vault amount", () => {
    const v = { base: tokenAccount(1n << 40n), quote: tokenAccount(3n << 40n) };
    expect(computeDexSpotPriceE6("pumpswap", pumpPool({ quoteMint: USDC }), v, { base: 6, quote: 6 })).toBe(3_000_000n);
  });

  it("works on vault subarrays with a non-zero byteOffset", () => {
    const outer = new Uint8Array(400).fill(0xff);
    outer.set(tokenAccount(2_000_000n), 3);
    outer.set(tokenAccount(3_000_000n), 200);
    const v = { base: outer.subarray(3, 168), quote: outer.subarray(200, 365) };
    expect(computeDexSpotPriceE6("pumpswap", pumpPool({ quoteMint: USDC }), v, { base: 6, quote: 6 })).toBe(1_500_000n);
  });

  it("requires vaultData and decimals, and validates decimals", () => {
    const v = { base: tokenAccount(1n), quote: tokenAccount(1n) };
    expect(() => computeDexSpotPriceE6("pumpswap", pumpPool())).toThrow(/requires vaultData/);
    expect(() => computeDexSpotPriceE6("pumpswap", pumpPool(), v)).toThrow(/requires decimals/);
    for (const bad of [-1, 25, 1.5, NaN]) {
      expect(() => computeDexSpotPriceE6("pumpswap", pumpPool(), v, { base: bad, quote: 9 }, 1n)).toThrow(
        /base decimals out of range/,
      );
      expect(() => computeDexSpotPriceE6("pumpswap", pumpPool(), v, { base: 6, quote: bad }, 1n)).toThrow(
        /quote decimals out of range/,
      );
    }
  });

  it("zero base reserves throws", () => {
    const v = { base: tokenAccount(0n), quote: tokenAccount(1_000_000_000n) };
    expect(() => computeDexSpotPriceE6("pumpswap", pumpPool(), v, { base: 6, quote: 9 }, 150_000_000n)).toThrow(
      /zero base reserves/,
    );
  });

  it("zero quote reserves throws instead of returning 0n", () => {
    const v = { base: tokenAccount(1_000_000_000_000n), quote: tokenAccount(0n) };
    expect(() => computeDexSpotPriceE6("pumpswap", pumpPool(), v, { base: 6, quote: 9 }, 150_000_000n)).toThrow(
      /price/i,
    );
  });

  it("a price that rounds below 1e-6 throws instead of returning 0n", () => {
    // 1 lamport against 1e12 tokens: 1e-9 SOL / 1e6 tokens, far below 1e-6 USD
    const v = { base: tokenAccount(1_000_000_000_000_000_000n), quote: tokenAccount(1n) };
    expect(() => computeDexSpotPriceE6("pumpswap", pumpPool(), v, { base: 6, quote: 9 }, 150_000_000n)).toThrow(
      /price/i,
    );
  });
});

describe("Meteora DLMM LbPair", () => {
  it("reads token_x_mint @88 and token_y_mint @120", () => {
    const info = parseDexPool("meteora-dlmm", POOL, lbPair());
    expect(info).toEqual({ dexType: "meteora-dlmm", poolAddress: POOL, baseMint: key(0x40), quoteMint: key(0x41) });
  });

  it("152 bytes is enough; 151 throws in both paths", () => {
    const b = lbPair({ len: 152 });
    expect(parseDexPool("meteora-dlmm", POOL, b).quoteMint).toEqual(key(0x41));
    expect(meteora(b, 6, 6)).toBe(1_000_000n);
    expect(() => parseDexPool("meteora-dlmm", POOL, b.slice(0, 151))).toThrow(/too short: 151 < 152/);
    expect(() => meteora(b.slice(0, 151), 6, 6)).toThrow(/too short: 151 < 152/);
  });

  it("requires decimals and validates them", () => {
    expect(() => computeDexSpotPriceE6("meteora-dlmm", lbPair())).toThrow(/requires decimals/);
    for (const bad of [-1, 25, 1.5, NaN]) {
      expect(() => meteora(lbPair(), bad, 6)).toThrow(/base decimals out of range/);
      expect(() => meteora(lbPair(), 6, bad)).toThrow(/quote decimals out of range/);
    }
  });

  it("bin_step comes from @80 (u16), not bin_step_seed @73", () => {
    // seed says 10000 (2x per bin), field says 100 (1%): 1.01, not 2.0
    expect(meteora(lbPair({ activeId: 1, binStep: 100, binStepSeed: 10_000 }), 6, 6)).toBe(1_010_000n);
  });

  it("active_id 0 -> 1.0, scaled by 10^(base-quote)", () => {
    expect(meteora(lbPair({ activeId: 0 }), 6, 6)).toBe(1_000_000n);
    expect(meteora(lbPair({ activeId: 0 }), 9, 6)).toBe(1_000_000_000n);
    expect(meteora(lbPair({ activeId: 0 }), 6, 9)).toBe(1_000n);
  });

  it("positive active_id: (1 + step/1e4)^id, by squaring", () => {
    expect(meteora(lbPair({ activeId: 2, binStep: 10_000 }), 6, 6)).toBe(4_000_000n);
    expect(meteora(lbPair({ activeId: 3, binStep: 10_000 }), 6, 6)).toBe(8_000_000n);
    expect(meteora(lbPair({ activeId: 10, binStep: 10_000 }), 6, 6)).toBe(1_024_000_000n);
  });

  it("negative active_id is the inverse, both decimal directions", () => {
    expect(meteora(lbPair({ activeId: -1, binStep: 100 }), 6, 6)).toBe(990_099n); // 1/1.01
    expect(meteora(lbPair({ activeId: -1, binStep: 10_000 }), 9, 6)).toBe(500_000_000n);
    expect(meteora(lbPair({ activeId: -1, binStep: 10_000 }), 6, 9)).toBe(500n);
  });

  it("reads active_id as signed i32 LE", () => {
    const b = lbPair({ binStep: 10_000 });
    b.set([0xfe, 0xff, 0xff, 0xff], 76); // -2
    expect(meteora(b, 6, 6)).toBe(250_000n);
  });

  it("bin_step 0 and bin_step > 10000 throw; 10000 is allowed", () => {
    expect(() => meteora(lbPair({ binStep: 0 }), 6, 6)).toThrow(/binStep = 0/);
    expect(() => meteora(lbPair({ binStep: 10_001 }), 6, 6)).toThrow(/binStep 10001 exceeds max 10000/);
    expect(meteora(lbPair({ activeId: 1, binStep: 10_000 }), 6, 6)).toBe(2_000_000n);
  });

  it("|active_id| > 500000 throws; 500000 is allowed", () => {
    expect(() => meteora(lbPair({ activeId: 500_001, binStep: 1 }), 6, 6)).toThrow(/exceeds max 500000/);
    expect(() => meteora(lbPair({ activeId: -500_001, binStep: 1 }), 6, 6)).toThrow(/exceeds max 500000/);
    expect(meteora(lbPair({ activeId: 500_000, binStep: 1 }), 6, 6)).toBeGreaterThan(0n);
  });

  it("an inverse price that rounds below 1e-6 throws instead of returning 0n", () => {
    // 1.0001^-500000 ~ 2e-22
    expect(() => meteora(lbPair({ activeId: -500_000, binStep: 1 }), 6, 6)).toThrow(/price/i);
  });

  it("a positive-id price that rounds below 1e-6 throws instead of returning 0n", () => {
    // 1.0 * 10^(0-24)
    expect(() => meteora(lbPair({ activeId: 0 }), 0, 24)).toThrow(/price/i);
  });
});

describe("no staleness in the DEX path", () => {
  afterEach(() => vi.useRealTimers());

  it("the same bytes give the same price at any wall-clock time", () => {
    // Pool accounts carry no publish time the decoder can check. Staleness is
    // the caller's job (slot of the fetched account); this pins that the
    // decoder doesn't pretend otherwise.
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const a = computeDexSpotPriceE6("raydium-clmm", raydium());
    vi.setSystemTime(4_000_000_000_000);
    expect(computeDexSpotPriceE6("raydium-clmm", raydium())).toBe(a);
  });
});

describe("fetchMintDecimals", () => {
  const conn = (data: Uint8Array | null) =>
    ({ getAccountInfo: async () => (data ? { data } : null) }) as unknown as Connection;

  it("reads byte 44 of an 82-byte SPL mint", async () => {
    expect(SPL_MINT_DECIMALS_OFFSET).toBe(44);
    const mint = new Uint8Array(82).fill(0x77);
    mint[44] = 9;
    expect(await fetchMintDecimals(conn(mint), WSOL_MINT)).toBe(9);
  });

  it("45 bytes is enough; 44 bytes and a missing account throw", async () => {
    const m = new Uint8Array(45);
    m[44] = 6;
    expect(await fetchMintDecimals(conn(m), USDC)).toBe(6);
    await expect(fetchMintDecimals(conn(new Uint8Array(44)), USDC)).rejects.toThrow(/too short \(44 bytes\)/);
    await expect(fetchMintDecimals(conn(null), USDC)).rejects.toThrow(/account not found/);
  });
});
