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

// ── Net (HTTP / CORS proxy) ──

export interface NetClient {
  /** Proxy a GET request to an external URL. Returns the raw Response. */
  fetch(targetUrl: string, init?: RequestInit): Promise<Response>;

  /** Convenience: proxy GET + parse JSON. Throws on non-OK. */
  getJson<T = unknown>(targetUrl: string): Promise<T>;
}

function createNetClient(): NetClient {
  return {
    async fetch(targetUrl: string, init?: RequestInit): Promise<Response> {
      const params = new URLSearchParams({ url: targetUrl });
      return window.fetch(`/api/net/fetch?${params}`, init);
    },

    async getJson<T = unknown>(targetUrl: string): Promise<T> {
      const res = await this.fetch(targetUrl);
      if (!res.ok) {
        throw new Error(`net.fetch failed: ${res.status} ${res.statusText}`);
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
  capabilities(): Promise<Record<string, boolean | string>>;
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
