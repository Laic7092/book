/**
 * Server API client — frontend plugins access Node capabilities through the proxy server.
 *
 * All calls go through Vite's dev proxy (/api/* → localhost:3001) in development,
 * and a reverse proxy in production.
 *
 * Usage from a frontend plugin:
 *   ctx.server.net.fetch("https://...")
 *   ctx.server.fs.readFile("/data/config.json")
 *   ctx.server.fs.list("/src")
 */

// ── Shared wire contracts (inlined from the former @book/contracts) ──

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

/** Standard error shape returned by all server routes. */
export interface ErrorResponse {
  error: string;
}

// ── Net (HTTP / CORS proxy) ──

export interface NetClient {
  /** Proxy a request to an external URL. Returns the raw Response. */
  fetch(targetUrl: string, init?: NetFetchInit): Promise<Response>;

  /** Convenience: proxy GET + parse JSON. Throws on non-OK. */
  getJson<T = unknown>(targetUrl: string): Promise<T>;
}

async function errorFrom(res: Response, fallback: string): Promise<Error> {
  try {
    const data = (await res.json()) as ErrorResponse;
    if (data && typeof data.error === "string") return new Error(data.error);
  } catch {
    // Non-JSON error body; fall through to the generic message.
  }
  return new Error(`${fallback}: ${res.status} ${res.statusText}`);
}

function createNetClient(): NetClient {
  return {
    async fetch(targetUrl: string, init?: NetFetchInit): Promise<Response> {
      const params = new URLSearchParams({ url: targetUrl });
      return window.fetch(`/api/net/fetch?${params}`, init as RequestInit);
    },

    async getJson<T = unknown>(targetUrl: string): Promise<T> {
      const res = await this.fetch(targetUrl);
      if (!res.ok) {
        throw await errorFrom(res, "net.fetch failed");
      }
      return res.json() as Promise<T>;
    },
  };
}

// ── FS (file system operations) ──

export interface FSClient {
  /** Read file content as text. */
  readFile(path: string): Promise<string>;

  /** Write text content to a file. Creates parent dirs if needed. */
  writeFile(path: string, content: string): Promise<void>;

  /** List directory entries (name + isDirectory). */
  list(dir?: string): Promise<{ name: string; isDirectory: boolean }[]>;

  /** Get file/dir metadata. */
  stat(path: string): Promise<{ size: number; mtime: string; isDirectory: boolean }>;

  /** Delete a file or directory (recursive for dirs). */
  delete(path: string): Promise<void>;
}

function createFSClient(): FSClient {
  return {
    async readFile(path: string): Promise<string> {
      const params = new URLSearchParams({ path });
      const res = await window.fetch(`/api/fs/read?${params}`);
      if (!res.ok) throw new Error(`fs.readFile failed: ${res.status}`);
      const data = await res.json();
      return data.content;
    },

    async writeFile(path: string, content: string): Promise<void> {
      const res = await window.fetch("/api/fs/write", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path, content }),
      });
      if (!res.ok) throw new Error(`fs.writeFile failed: ${res.status}`);
    },

    async list(dir = "."): Promise<{ name: string; isDirectory: boolean }[]> {
      const params = new URLSearchParams({ dir });
      const res = await window.fetch(`/api/fs/list?${params}`);
      if (!res.ok) throw new Error(`fs.list failed: ${res.status}`);
      const data = await res.json();
      return data.items;
    },

    async stat(path: string): Promise<{ size: number; mtime: string; isDirectory: boolean }> {
      const params = new URLSearchParams({ path });
      const res = await window.fetch(`/api/fs/stat?${params}`);
      if (!res.ok) throw new Error(`fs.stat failed: ${res.status}`);
      return res.json();
    },

    async delete(path: string): Promise<void> {
      const res = await window.fetch("/api/fs/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) throw new Error(`fs.delete failed: ${res.status}`);
    },
  };
}

// ── ServerClient (aggregate) ──

export interface ServerClient {
  net: NetClient;
  fs: FSClient;
  /** Fetch capabilities from the server. */
  capabilities(): Promise<CapabilitiesResponse>;
}

export function createServerClient(): ServerClient {
  return {
    net: createNetClient(),
    fs: createFSClient(),
    async capabilities() {
      const res = await window.fetch("/api/capabilities");
      if (!res.ok) return {};
      return res.json();
    },
  };
}
