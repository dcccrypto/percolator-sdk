/**
 * Shared URL redaction (#350), used wherever the SDK puts an endpoint or API URL into an error
 * message or a returned diagnostic: RpcPool status/healthCheck, checkRpcHealth,
 * discoverMarketsViaApi and fetchAdlRankings.
 */
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
export declare function redactUrl(raw: string): string;
