/**
 * Shared wire contracts between the PWA (packages/app) and the local server
 * (packages/server). Single source of truth for request/response shapes that
 * previously drifted between two hand-written copies.
 */

/** Server version reported by /api/health and /api/capabilities. */
export const SERVER_VERSION = "0.1.0";

/**
 * What a client may send to the server's net.fetch proxy. Deliberately
 * narrower than RequestInit: the server only forwards a whitelisted header
 * set and a body/method.
 */
export interface NetFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit;
}

export interface CapabilitiesResponse {
  version: string;
  net: boolean;
  fs: boolean;
}

export interface HealthResponse {
  status: string;
  version: string;
}

/** Standard error shape returned by all server routes. */
export interface ErrorResponse {
  error: string;
}
