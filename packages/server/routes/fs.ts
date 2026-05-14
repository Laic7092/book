import { readFile, writeFile, readdir, stat, unlink, rm, mkdir } from "node:fs/promises";
import { statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Hono } from "hono";

// Restrict file access to within the project root (basic safeguard)
const ROOT = resolve(fileURLToPath(import.meta.url), "../..");

function safePath(input: string): string | null {
  const absolute = resolve(ROOT, input);
  if (!absolute.startsWith(ROOT)) return null;
  return absolute;
}

function badPath(c: any): Response {
  return c.json({ error: "Path traversal denied" }, 403);
}

/** Map node:fs error codes to generic messages — never leak server paths. */
function fsError(err: Error & { code?: string }, defaultStatus = 404): Response {
  const status =
    err.code === "ENOENT"
      ? 404
      : err.code === "EACCES" || err.code === "EPERM"
        ? 403
        : defaultStatus;
  const message =
    err.code === "ENOENT"
      ? "File or directory not found"
      : err.code === "EACCES" || err.code === "EPERM"
        ? "Access denied"
        : err.code === "EISDIR"
          ? "Expected a file but got a directory"
          : err.code === "ENOTDIR"
            ? "Expected a directory but got a file"
            : err.code === "EEXIST"
              ? "File already exists"
              : err.code === "ENOSPC"
                ? "No space left on device"
                : `Operation failed: ${err.code || "unknown"}`;
  return c.json({ error: message }, status);
}

export function registerFsRoutes(app: Hono): void {
  // ── Read file ──
  app.get("/api/fs/read", async (c) => {
    const raw = c.req.query("path");
    if (!raw) return c.json({ error: "Missing 'path' query" }, 400);
    const path = safePath(raw);
    if (!path) return badPath(c);
    try {
      const content = await readFile(path, "utf-8");
      return c.json({ content });
    } catch (err: any) {
      return fsError(err);
    }
  });

  // ── Write file ──
  app.post("/api/fs/write", async (c) => {
    const { path: raw, content } = await c.req.json();
    if (!raw) return c.json({ error: "Missing 'path'" }, 400);
    const path = safePath(raw);
    if (!path) return badPath(c);
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content ?? "", "utf-8");
      return c.json({ ok: true });
    } catch (err: any) {
      return fsError(err, 500);
    }
  });

  // ── List directory ──
  app.get("/api/fs/list", async (c) => {
    const raw = c.req.query("dir") || ".";
    const path = safePath(raw);
    if (!path) return badPath(c);
    try {
      const entries = await readdir(path, { withFileTypes: true });
      const items = entries.map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
      }));
      return c.json({ items });
    } catch (err: any) {
      return fsError(err);
    }
  });

  // ── Stat file/dir ──
  app.get("/api/fs/stat", async (c) => {
    const raw = c.req.query("path");
    if (!raw) return c.json({ error: "Missing 'path' query" }, 400);
    const path = safePath(raw);
    if (!path) return badPath(c);
    try {
      const s = await stat(path);
      return c.json({
        size: s.size,
        mtime: s.mtime.toISOString(),
        isDirectory: s.isDirectory(),
      });
    } catch (err: any) {
      return fsError(err);
    }
  });

  // ── Delete file/dir ──
  app.post("/api/fs/delete", async (c) => {
    const { path: raw } = await c.req.json();
    if (!raw) return c.json({ error: "Missing 'path'" }, 400);
    const path = safePath(raw);
    if (!path) return badPath(c);
    try {
      const isDir = statSync(path).isDirectory();
      if (isDir) {
        await rm(path, { recursive: true, force: true });
      } else {
        await unlink(path);
      }
      return c.json({ ok: true });
    } catch (err: any) {
      return fsError(err, 500);
    }
  });
}
