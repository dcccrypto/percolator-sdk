/**
 * FAILING-FIRST draft (J-20261123-SDK-REPORT-ACCOUNTDECODETESTMUT). Fails on ec8ba67d.
 *
 * The captured devnet V1D slab (2swBcS47..., 65088 B, postBitmap=2) decodes to values that
 * contradict each other. Every engine field lines up if RiskParams start at engine+80 instead of
 * the SDK's V1D_ENGINE_PARAMS_OFF = 96 (InsuranceFund 64 B, not 80 B):
 *   engine+80.. : warmup 0, mm 500, im 1000, fee 30, max_accounts 256, new_account_fee 1e6
 *   engine+368  : current_slot 444844114 (SDK reads +384 -> 0)
 *   engine+408  : mark 1_000_000 (SDK reads +424 -> 0)
 * The SDK comment says the V1D offsets were probed on slab 6ZytbpV4 (65104 B, postBitmap=18);
 * this 65088 B variant may be a different program revision.
 *
 * These tests use only the SDK's own output plus invariants any correct decode must meet,
 * so they do not presume where the fix lands.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { detectSlabLayout, parseEngine, parseParams } from "../src/solana/slab.js";

const dir = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "fixtures", "accounts");
const fx = JSON.parse(readFileSync(resolve(dir, "devnet-wrapper-slab-v1d.json"), "utf8")) as {
  data_base64: string;
  total_data_length: number;
};
const data = new Uint8Array(fx.total_data_length);
data.set(Buffer.from(fx.data_base64, "base64"), 0);

describe("V1D captured slab: decoded engine must be self-consistent", () => {
  it("RiskParams.maxAccounts equals the slab's own account capacity (256)", () => {
    const layout = detectSlabLayout(data.length, data)!;
    expect(layout.maxAccounts).toBe(256);
    expect(parseParams(data).maxAccounts).toBe(BigInt(layout.maxAccounts)); // SDK: 0n
  });

  it("trading fee is a bps value (<= 10_000)", () => {
    expect(parseParams(data).tradingFeeBps <= 10_000n).toBe(true); // SDK: 1_000_000n
  });

  it("insurance fund balance cannot exceed the vault that holds it", () => {
    const e = parseEngine(data);
    // SDK: balance = 18446744073709551616010000n (~1.8e25) against vault 1_000_000n
    expect(e.insuranceFund.balance <= e.vault).toBe(true);
  });
});
