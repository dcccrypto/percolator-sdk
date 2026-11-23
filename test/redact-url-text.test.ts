/**
 * redactSecretsInText / redactUrlError (src/solana/redact-url.ts): mask a URL's secret parts in free
 * text and in a thrown error's whole chain. Used by fetchAdlRankings; see
 * test/secret-url-error-sweep.test.ts for the path-by-path sweep. Fake secrets only, no network.
 */
import { describe, it, expect } from "vitest";
import { redactSecretsInText, redactUrlError } from "../src/solana/redact-url.js";

const SECRET = "SECRET123";
const FORMS = {
  Q: `https://x.example/?api-key=${SECRET}`,
  P: `https://x.example/v2/${SECRET}abcdefghijklmnop`,
  U: `https://user:${SECRET}@x.example/`,
  M: `https://x .example/?api-key=${SECRET}`,
} as const;

/** message + stack + own props + cause chain, as an error reporter would see it. */
function errorText(e: unknown, depth = 0): string {
  if (depth > 6 || e === undefined || e === null) return "";
  if (!(e instanceof Error)) return typeof e === "string" ? e : JSON.stringify(e) ?? String(e);
  const own = Object.getOwnPropertyNames(e)
    .filter((k) => k !== "cause" && k !== "stack" && k !== "message")
    .map((k) => `${k}=${String((e as unknown as Record<string, unknown>)[k])}`)
    .join(" ");
  return `${e.message}\n${e.stack ?? ""}\n${own}\n${errorText((e as { cause?: unknown }).cause, depth + 1)}`;
}

/** Node's real TypeError for a URL fetch refuses (credentials / unparseable). */
function nodeFetchError(url: string): unknown {
  try {
    new Request(url);
  } catch (e) {
    return e;
  }
  throw new Error(`expected Request to reject ${url}`);
}

describe("redactSecretsInText / redactUrlError", () => {
  it("masks every secret part of the URL wherever it appears, in any form", () => {
    for (const u of Object.values(FORMS)) {
      const part = u === FORMS.P ? `${SECRET}abcdefghijklmnop` : SECRET;
      const text = `x ${u} y ${u.replace(" ", "")} /p/${part}/ ${encodeURIComponent(part)}`;
      expect(redactSecretsInText(text, u)).not.toContain(SECRET);
    }
  });

  it("handles URLs with no path, bare query flags, fragments and bad percent-encoding", () => {
    const cases: [string, string][] = [
      ["https://user:SECRET123@x.example", "SECRET123"],
      ["https://x.example/?flag&api-key=SECRET123", "SECRET123"],
      ["https://x.example/p#SECRET123", "SECRET123"],
      ["https://x.example/?api-key=%ZZSECRET123", "%ZZSECRET123"],
      ["x.example/?token=SECRET123", "SECRET123"],
    ];
    for (const [u, s] of cases) expect(redactSecretsInText(`a ${u} b ${s} c`, u)).not.toContain(s);
    expect(redactSecretsInText("x.example/p", "https://x.example/p")).toBe("x.example/p");
  });

  it("leaves text with no secret in it unchanged", () => {
    expect(redactSecretsInText("HTTP 500 from https://api.example/x", "https://api.example/x")).toBe("HTTP 500 from https://api.example/x");
    expect(redactSecretsInText("", FORMS.Q)).toBe("");
  });

  it("does not mask secret parts shorter than 4 chars (documented limit)", () => {
    expect(redactSecretsInText("a=1 key=ab", "https://h.example/?key=ab")).toBe("a=1 key=ab");
  });

  it("returns the same error when nothing in its chain carries a secret", () => {
    const e = new TypeError("fetch failed", { cause: new Error("ECONNREFUSED") });
    expect(redactUrlError(e, FORMS.Q)).toBe(e);
    expect(redactUrlError("plain", FORMS.Q)).toBe("plain");
  });

  it("rebuilds an error whose message, stack, props or cause carry the secret, keeping prototype/name/code", () => {
    for (const u of [FORMS.U, FORMS.M]) {
      const raw = nodeFetchError(u);
      expect(errorText(raw)).toContain(SECRET);
      const safe = redactUrlError(raw, u) as Error;
      expect(safe).toBeInstanceOf(TypeError);
      expect(safe.name).toBe((raw as Error).name);
      expect(errorText(safe)).not.toContain(SECRET);
    }
    const inner = Object.assign(new Error(`connect ${FORMS.Q}`), { code: "E1", input: FORMS.Q });
    const outer = Object.assign(new Error("wrap", { cause: inner }), { code: "E2" });
    const safe = redactUrlError(outer, FORMS.Q) as Error & { code?: string; cause?: Error & { code?: string } };
    expect(errorText(safe)).not.toContain(SECRET);
    expect(safe.code).toBe("E2");
    expect(safe.cause?.code).toBe("E1");
    expect(safe.cause?.message).toContain("x.example");
    const strCause = new Error("wrap", { cause: `bad ${FORMS.Q}` });
    expect(errorText(redactUrlError(strCause, FORMS.Q))).not.toContain(SECRET);
    const objCause = new Error(`wrap ${FORMS.Q}`, { cause: { url: FORMS.Q } });
    expect(errorText(redactUrlError(objCause, FORMS.Q))).not.toContain(SECRET);
    const cleanObj = { code: 7 };
    const keepsObj = redactUrlError(new Error(`wrap ${FORMS.Q}`, { cause: cleanObj }), FORMS.Q) as Error;
    expect(keepsObj.cause).toBe(cleanObj);
    const undefCause = redactUrlError(new Error(`wrap ${FORMS.Q}`, { cause: undefined }), FORMS.Q) as Error;
    expect(undefCause.message).not.toContain(SECRET);
    expect(undefCause.cause).toBeUndefined();
    expect(redactUrlError({ url: FORMS.Q }, FORMS.Q)).not.toContain(SECRET);
    const cyclic = new Error(`loop ${FORMS.Q}`) as Error & { cause?: unknown };
    cyclic.cause = cyclic;
    expect(errorText(redactUrlError(cyclic, FORMS.Q))).not.toContain(SECRET);
    const ranged = Object.assign(new RangeError(`at ${FORMS.U}`), { code: 3 });
    const safeRanged = redactUrlError(ranged, FORMS.U) as RangeError & { code?: number };
    expect(safeRanged).toBeInstanceOf(RangeError);
    expect(safeRanged.code).toBe(3);
    expect(Object.keys(safeRanged)).toEqual(["code"]);
  });
});
