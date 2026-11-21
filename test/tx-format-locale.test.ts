/**
 * Regression test:
 * host's default locale (src/runtime/tx.ts:398 and :408, `unitsConsumed.toLocaleString()` with no
 * locale). The rest of the SDK pins "en-US" (errors.ts:889, growth-v19.ts:1397). In LANG=de_DE the line
 * reads "Compute Units: 1.234.567" (looks like 1.2 CU) and in hi_IN "12,34,567".
 *
 * The ICU default locale is fixed at process start, so this test stands in for a de-DE host by
 * making the no-argument toLocaleString() behave like de-DE. The fix is toLocaleString("en-US") at both lines.
 * Run: npx vitest run test/tx-format-locale.test.ts --maxWorkers=4
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { formatResult } from "../src/runtime/tx.js";

const orig = Number.prototype.toLocaleString;

afterEach(() => vi.restoreAllMocks());

function asGermanHost() {
  vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(function (
    this: number,
    locales?: string | string[],
    options?: Intl.NumberFormatOptions,
  ) {
    return orig.call(this, locales ?? "de-DE", options);
  });
}

describe("formatResult compute units do not depend on host locale", () => {
  it("error branch (tx.ts:398) prints 1,234,567 on a de-DE host", () => {
    asGermanHost();
    const text = formatResult({ signature: "", slot: 0, err: "x", logs: [], unitsConsumed: 1234567 }, false);
    expect(text).toContain("Compute Units: 1,234,567");
  });

  it("success branch (tx.ts:408) prints 1,234,567 on a de-DE host", () => {
    asGermanHost();
    const text = formatResult(
      { signature: "(simulated)", slot: 3, err: null, logs: [], unitsConsumed: 1234567 },
      false,
    );
    expect(text).toContain("Compute Units: 1,234,567");
  });
});
