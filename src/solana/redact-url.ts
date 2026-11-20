/**
 * Shared URL redaction (#350), used wherever the SDK puts an endpoint or API URL into an error
 * message or a returned diagnostic: RpcPool status/healthCheck, checkRpcHealth,
 * discoverMarketsViaApi and fetchAdlRankings.
 */

/** Placeholder returned when a URL cannot be parsed: never echo the raw string. */
const REDACTED_URL_PLACEHOLDER = "[unparseable-url]";

/** An opaque secret-looking token: 20+ chars of a URL-safe alphabet (API keys, JWT segments, base58/hex tokens). */
const OPAQUE_TOKEN = /^[A-Za-z0-9_\-.~%]{20,}$/;

/**
 * Redact credentials from a URL so it is safe for logging / `status()` output (#350).
 *
 * - `username` / `password` (userinfo) are removed.
 * - Query parameters whose name looks like a credential (`api-key`, `token`, `secret`, `key`,
 *   `password`, ...) are replaced with `***`, as are query values that look like opaque tokens.
 * - Path segments that look like opaque tokens (Alchemy `/v2/<key>`, QuickNode `/<key>/`, Helius
 *   `/<key>`) are replaced with `***`.
 * - The fragment is dropped.
 * - If the input is not a parseable http(s)/ws(s) URL a fixed placeholder is returned, NEVER the raw string.
 *
 * @param raw - Endpoint URL as configured.
 * @returns A redacted URL string, or `"[unparseable-url]"`.
 * @example
 * ```ts
 * redactUrl("https://user:pw@rpc.example.com/v2/abcdefghijklmnopqrstuv?api-key=zzz");
 * // "https://rpc.example.com/v2/***?api-key=***"
 * ```
 */
export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    // `new URL("user:pass@host/x")` parses as an opaque "user:" scheme and would echo the secret.
    if (!/^(https?|wss?):$/.test(u.protocol)) return REDACTED_URL_PLACEHOLDER;
    u.username = "";
    u.password = "";
    u.hash = "";
    const sensitive = /^(api[-_]?key|access[-_]?token|auth[-_]?token|token|secret|key|password|bearer|credential|jwt)$/i;
    for (const [k, v] of [...u.searchParams.entries()]) {
      if (sensitive.test(k) || OPAQUE_TOKEN.test(v)) {
        u.searchParams.set(k, "***");
      }
    }
    u.pathname = u.pathname
      .split("/")
      .map((seg) => (OPAQUE_TOKEN.test(seg) ? "***" : seg))
      .join("/");
    return u.toString();
  } catch {
    return REDACTED_URL_PLACEHOLDER;
  }
}
