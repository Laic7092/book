/**
 * Core net utility — proxies HTTP requests via Node's native http/https.
 *
 * Uses the system resolver (getaddrinfo) which respects dns.setDefaultResultOrder,
 * avoiding undici's Happy Eyeballs that fails behind certain NAT / WSL2 setups.
 */

import https from "node:https";
import http from "node:http";
import { lookup } from "node:dns/promises";

const SAFE_HEADERS = ["accept", "accept-language", "user-agent", "cache-control"];
const MAX_REDIRECT = 8;

// Internal IP ranges blocked for SSRF prevention
const BLOCKED_IP_PATTERNS = [
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
];

function isInternalIp(ip: string): boolean {
  // Normalize IPv4-mapped IPv6 (::ffff:127.0.0.1 -> 127.0.0.1) and strip
  // URL's brackets around IPv6 literals ([::1] -> ::1).
  const host = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return BLOCKED_IP_PATTERNS.some((p) => p.test(mapped ? mapped[1] : host));
}

/**
 * SSRF guard: reject anything that resolves to a private/loopback address,
 * including hostnames like `localhost` that would bypass numeric-IP checks.
 * Unresolvable hostnames are blocked too — an unverifiable target must not
 * be fetched.
 */
export async function isInternalUrl(raw: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return true;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return true;
  const hostname = url.hostname;
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local"))
    return true;
  if (isInternalIp(hostname)) return true;
  try {
    const addrs = await lookup(hostname, { all: true });
    return addrs.some((a) => isInternalIp(a.address));
  } catch {
    return true;
  }
}

function nodeHeadersToWeb(raw: Record<string, string | string[] | undefined>): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(raw)) {
    if (!v) continue;
    if (
      ["transfer-encoding", "connection", "keep-alive", "content-encoding"].includes(
        k.toLowerCase(),
      )
    )
      continue;
    if (Array.isArray(v)) {
      for (const item of v) h.append(k, item);
    } else {
      h.set(k, v);
    }
  }
  return h;
}

function nodeRequest(
  targetUrl: URL,
  method: string,
  reqHeaders: Record<string, string>,
  body: Buffer | undefined,
  signal: AbortSignal,
): Promise<{
  status: number;
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
  redirect?: string;
}> {
  const mod = targetUrl.protocol === "https:" ? https : http;

  // Accept-Encoding: identity tells the upstream NOT to compress, so we
  // don't have to decompress — we proxy the raw bytes.
  const merged = { ...reqHeaders, "accept-encoding": "identity" };

  return new Promise((resolve, reject) => {
    const req = mod.request(targetUrl, { method, headers: merged, signal, family: 4 }, (res) => {
      const status = res.statusCode ?? 200;
      // Follow redirects
      if (status >= 300 && status < 400 && res.headers.location) {
        const redir = new URL(res.headers.location, targetUrl.href).href;
        res.resume();
        resolve({ status, headers: new Headers(), body: null, redirect: redir });
        return;
      }

      // No body for these statuses
      if (status === 204 || status === 304 || method === "HEAD") {
        res.resume();
        resolve({ status, headers: nodeHeadersToWeb(res.headers), body: null });
        return;
      }

      const stream = new ReadableStream<Uint8Array>({
        start(ctrl) {
          res.on("data", (chunk: Buffer) => ctrl.enqueue(new Uint8Array(chunk)));
          res.on("end", () => ctrl.close());
          res.on("error", (e) => ctrl.error(e));
        },
        cancel() {
          res.destroy();
        },
      });

      resolve({ status, headers: nodeHeadersToWeb(res.headers), body: stream });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

export async function netFetch(targetUrl: string, request: Request): Promise<Response> {
  // Defense in depth: every caller goes through the SSRF guard, not just
  // the route handler that remembers to call it.
  if (await isInternalUrl(targetUrl)) {
    return new Response(JSON.stringify({ error: "net.fetch failed: internal address blocked" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
  // Collect safe headers
  const reqHeaders: Record<string, string> = {};
  for (const name of SAFE_HEADERS) {
    const val = request.headers.get(name);
    if (val) reqHeaders[name] = val;
  }

  const body =
    request.method !== "GET" && request.method !== "HEAD"
      ? Buffer.from(await request.arrayBuffer())
      : undefined;

  try {
    let url = new URL(targetUrl);
    let currentBody = body;
    let method = request.method;

    for (let i = 0; i <= MAX_REDIRECT; i++) {
      const signal = AbortSignal.timeout(30_000);
      const result = await nodeRequest(url, method, reqHeaders, currentBody, signal);

      if (result.redirect) {
        const nextUrl = new URL(result.redirect);
        // Re-check every hop: an external 302 could point back at an
        // internal address that the initial request never touched.
        if (await isInternalUrl(nextUrl.href)) {
          return new Response(
            JSON.stringify({ error: "net.fetch failed: redirect to internal address blocked" }),
            { status: 502, headers: { "content-type": "application/json" } },
          );
        }
        url = nextUrl;
        // Standard: POST → GET after 301/302, keep method on 307/308
        if (result.status === 307 || result.status === 308) {
          // keep method + body
        } else {
          method = "GET";
          currentBody = undefined;
        }
        continue;
      }

      return new Response(result.body, {
        status: result.status,
        headers: result.headers,
      });
    }

    return new Response("Too many redirects", { status: 502 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: `net.fetch failed: ${message}` }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}
