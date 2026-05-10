import type { Hono } from "hono";

/**
 * Capabilities endpoint — lets the frontend discover what the server supports.
 *
 *   GET /api/capabilities → { version: "0.1.0", net: true, fs: true }
 */

export function registerCapabilitiesRoutes(app: Hono): void {
  app.get("/api/capabilities", (c) => {
    return c.json({
      version: "0.1.0",
      net: true,
      fs: true,
    });
  });
}
