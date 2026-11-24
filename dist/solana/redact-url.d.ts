/**
 * Shared URL redaction (#350), used wherever the SDK puts an endpoint or API URL into an error
 * message or a returned diagnostic: RpcPool status/healthCheck, checkRpcHealth,
 * discoverMarketsViaApi and fetchAdlRankings.
 */
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
export declare function redactUrl(raw: string): string;
/**
 * Mask every secret part of `rawUrls` wherever it appears in `text`: the whole URL verbatim (Node's
 * fetch puts it in "Failed to parse URL from <url>" / "...includes credentials: <url>"), a normalized
 * href, or a bare echo such as a gateway's `Cannot GET /v2/<key>`. Text without a secret part is
 * returned unchanged. Limits: a bare echo of a part under 4 chars (`?key=abc`) is not masked (the
 * whole URL verbatim still is), nor is a part echoed in an encoding other than raw, decoded or
 * `encodeURIComponent`. Non-string own properties of an error (e.g. `AggregateError.errors`) are
 * not walked.
 *
 * @param text - Message, log line or response body.
 * @param rawUrls - The URL(s) as configured / fetched.
 * @returns `text` with secrets replaced: the whole URL by {@link redactUrl}, any leftover part by `***`.
 * @example
 * ```ts
 * redactSecretsInText("Cannot GET /v2/abcdefghijklmnopqrstuv", "https://h.example/v2/abcdefghijklmnopqrstuv");
 * // "Cannot GET /v2/***"
 * ```
 */
export declare function redactSecretsInText(text: string, ...rawUrls: string[]): string;
/**
 * Return `err` with every secret part of `rawUrls` masked in its message, stack, own string
 * properties and whole `cause` chain (see {@link redactSecretsInText}). If nothing in the chain
 * carries a secret the same object is returned; otherwise a copy with the same prototype (so
 * `instanceof`, `name` and `code` survive; a DOMException is rebuilt as a new DOMException) is
 * returned. Use it on errors thrown by `fetch(url)`.
 *
 * @param err - Anything thrown.
 * @param rawUrls - The URL(s) that were fetched.
 * @returns `err` itself, or a redacted copy.
 */
export declare function redactUrlError(err: unknown, ...rawUrls: string[]): unknown;
