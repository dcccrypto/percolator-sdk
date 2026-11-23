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

/** Query parameter names whose value is a credential whatever its length. */
const SENSITIVE_PARAM =
  /^((x[-_]?)?api[-_]?key|access[-_]?token|auth([-_]?token)?|dkey|token|secret|key|password|bearer|credential|jwt)$/i;

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
    for (const [k, v] of [...u.searchParams.entries()]) {
      if (SENSITIVE_PARAM.test(k) || looksOpaque(v)) {
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

/** Secret parts shorter than this are not masked in free text (masking "1" or "ab" would wreck the message). */
const MIN_SECRET_CHARS = 4;

/** A value as written, percent-decoded and re-encoded: an echo may use any of the three. */
function spellings(v: string): string[] {
  let decoded = v;
  try {
    decoded = decodeURIComponent(v.replace(/\+/g, " "));
  } catch {
    /* keep raw */
  }
  return [v, decoded, encodeURIComponent(decoded)];
}

/**
 * The secret parts of a URL by the same rules as {@link redactUrl} (userinfo, credential-named or
 * opaque query values, opaque path segments, fragment), split by hand so an unparseable URL still
 * yields them. Longest first so a part never masks only the inside of a longer one.
 */
function secretParts(raw: string): string[] {
  const rest = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const [beforeHash, fragment = ""] = splitOnce(rest, "#");
  const [beforeQuery, query = ""] = splitOnce(beforeHash, "?");
  const slash = beforeQuery.indexOf("/");
  const authority = slash < 0 ? beforeQuery : beforeQuery.slice(0, slash);
  const path = slash < 0 ? "" : beforeQuery.slice(slash);
  const at = authority.lastIndexOf("@");
  const found: string[] = [fragment];
  if (at >= 0) found.push(...authority.slice(0, at).split(":"));
  for (const seg of path.split("/")) if (looksOpaque(seg)) found.push(seg);
  for (const pair of query.split("&")) {
    const [k, v = ""] = splitOnce(pair, "=");
    if (SENSITIVE_PARAM.test(spellings(k)[1]) || looksOpaque(v)) found.push(v);
  }
  const all = new Set(found.flatMap(spellings).filter((s) => s.length >= MIN_SECRET_CHARS));
  return [...all].sort((a, b) => b.length - a.length);
}

function splitOnce(s: string, sep: string): [string, string?] {
  const i = s.indexOf(sep);
  return i < 0 ? [s] : [s.slice(0, i), s.slice(i + sep.length)];
}

/**
 * Mask every secret part of `rawUrls` wherever it appears in `text`: the whole URL verbatim (Node's
 * fetch puts it in "Failed to parse URL from <url>" / "...includes credentials: <url>"), a normalized
 * href, or a bare echo such as a gateway's `Cannot GET /v2/<key>`. Text without a secret part is
 * returned unchanged.
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
export function redactSecretsInText(text: string, ...rawUrls: string[]): string {
  let out = text;
  for (const raw of rawUrls) {
    const safe = redactUrl(raw);
    if (safe !== raw) out = out.split(raw).join(safe);
    for (const part of secretParts(raw)) out = out.split(part).join("***");
  }
  return out;
}

/**
 * Return `err` with every secret part of `rawUrls` masked in its message, stack, own string
 * properties and whole `cause` chain (see {@link redactSecretsInText}). If nothing in the chain
 * carries a secret the same object is returned; otherwise a copy with the same prototype (so
 * `instanceof`, `name` and `code` survive) is returned. Use it on errors thrown by `fetch(url)`.
 *
 * @param err - Anything thrown.
 * @param rawUrls - The URL(s) that were fetched.
 * @returns `err` itself, or a redacted copy.
 */
export function redactUrlError(err: unknown, ...rawUrls: string[]): unknown {
  const scrub = (s: string) => redactSecretsInText(s, ...rawUrls);
  const copy = (e: unknown, depth: number): unknown => {
    if (typeof e === "string") return scrub(e);
    if (!(e instanceof Error)) {
      const json = JSON.stringify(e);
      return json !== undefined && scrub(json) !== json ? scrub(json) : e;
    }
    const out = Object.create(Object.getPrototypeOf(e)) as Error;
    for (const key of Object.getOwnPropertyNames(e)) {
      const v = (e as unknown as Record<string, unknown>)[key];
      const safe = key === "cause" ? (depth < 8 ? copy(v, depth + 1) : undefined) : typeof v === "string" ? scrub(v) : v;
      Object.defineProperty(out, key, { value: safe, writable: true, configurable: true, enumerable: key !== "message" && key !== "stack" && key !== "cause" });
    }
    return out;
  };
  const text = (e: unknown, depth: number): string =>
    e instanceof Error
      ? Object.getOwnPropertyNames(e)
          .map((k) => (k === "cause" ? (depth < 8 ? text(e.cause, depth + 1) : "") : String((e as unknown as Record<string, unknown>)[k])))
          .join("\n")
      : typeof e === "string" ? e : String(JSON.stringify(e));
  const all = text(err, 0);
  return scrub(all) === all ? err : copy(err, 0);
}
