import { describe, expect, it } from "vitest";
import {
  requireAdminKeypairPath,
  requireEnvironmentVariable,
  requireRpcUrl,
} from "../scripts/config.mjs";

describe("script environment configuration", () => {
  it("fails clearly when RPC configuration is absent", () => {
    expect(() => requireRpcUrl({})).toThrow("PERCOLATOR_RPC_URL is not set.");
  });

  it("fails clearly when admin keypair configuration is absent", () => {
    expect(() => requireAdminKeypairPath({})).toThrow(
      "PERCOLATOR_ADMIN_KEYPAIR is not set.",
    );
  });

  it("accepts configured values without transforming them", () => {
    const environment = {
      PERCOLATOR_RPC_URL: "https://rpc.example.invalid/path",
      PERCOLATOR_ADMIN_KEYPAIR: "/secure/admin.json",
    };

    expect(requireRpcUrl(environment)).toBe(environment.PERCOLATOR_RPC_URL);
    expect(requireAdminKeypairPath(environment)).toBe(
      environment.PERCOLATOR_ADMIN_KEYPAIR,
    );
  });

  it("rejects whitespace-only values", () => {
    expect(() => requireEnvironmentVariable("REQUIRED_VALUE", { REQUIRED_VALUE: "  " }))
      .toThrow("REQUIRED_VALUE is not set.");
  });
});