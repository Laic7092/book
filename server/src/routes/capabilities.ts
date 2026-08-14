import type { Hono } from "hono";
import { SERVER_VERSION } from "../version";

/**
 * Capabilities endpoint — lets the frontend discover what the server supports.
 *
 *   GET /api/capabilities → { version: "0.1.0", net: true, fs: true }
 */

export function registerCapabilitiesRoutes(app: Hono): void {
  app.get("/api/capabilities", (c) => {
    return c.json({
      version: SERVER_VERSION,
      net: true,
      fs: true,
    });
  });
}
