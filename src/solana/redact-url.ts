/**
 * Shared URL redaction (#350), used wherever the SDK puts an endpoint or API URL into an error
 * message or a returned diagnostic: RpcPool status/healthCheck, checkRpcHealth,
 * discoverMarketsViaApi and fetchAdlRankings.
 */

/** Placeholder returned when a URL cannot be parsed: never echo the raw string. */
const REDACTED_URL_PLACEHOLDER = "[unparseable-url]";

/**
 * An opaque secret-looking token: any path segment or query value of 20+ chars (API keys, JWT
 * segments, base58/base64/hex tokens). No alphabet filter: base64 `+/=` and sub-delims like
 * `( ) $ & , ; : @` used to slip through (test/redact-url-providers.test.ts).
 */
const looksOpaque = (s: string): boolean => s.length >= 20;

/**
 * Redact credentials from a URL so it is safe for logging / `status()` output (#350).
 *
 * - `username` / `password` (userinfo) are removed.
 * - Query parameters whose name looks like a credential (`api-key`, `x-api-key`, `auth`, `dkey`,
 *   `token`, `secret`, `key`, `password`, ...) are replaced with `***`, as are query values that
 *   look like opaque tokens.
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
    const sensitive = /^((x[-_]?)?api[-_]?key|access[-_]?token|auth([-_]?token)?|dkey|token|secret|key|password|bearer|credential|jwt)$/i;
    for (const [k, v] of [...u.searchParams.entries()]) {
      if (sensitive.test(k) || looksOpaque(v)) {
        u.searchParams.set(k, "***");
      }
    }
    u.pathname = u.pathname
      .split("/")
      .map((seg) => (looksOpaque(seg) ? "***" : seg))
      .join("/");
    return u.toString();
  } catch {
    return REDACTED_URL_PLACEHOLDER;
  }
}
