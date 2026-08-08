import { setDefaultResultOrder } from "node:dns";
import { serve } from "@hono/node-server";
import { Hono } from "hono";

// WSL2 / dual-stack environments: IPv6 may be unreachable, causing Node's
// Happy Eyeballs to fail before IPv4 can complete. Prefer IPv4 explicitly.
setDefaultResultOrder("ipv4first");
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { netFetch, isInternalUrl } from "./net";
import { registerFsRoutes } from "./routes/fs";
import { registerCapabilitiesRoutes } from "./routes/capabilities";

const PORT = parseInt(process.env.PORT || "3001", 10);

const app = new Hono();

// ── Global middleware ──
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://localhost:4173", "http://127.0.0.1:5173"],
  }),
);
app.use("*", logger());

// ── Health ──
app.get("/api/health", (c) => c.json({ status: "ok", version: "0.1.0" }));

// ── Net: CORS proxy for external HTTP requests ──
app.get("/api/net/fetch", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.json({ error: "Missing 'url' query parameter" }, 400);
  if (await isInternalUrl(url)) return c.json({ error: "Internal URLs are not allowed" }, 403);
  // Build request with minimal safe headers, not forwarding client headers
  const upstream = new Request(url, {
    method: "GET",
    headers: { accept: c.req.header("accept") || "*/*" },
  });
  return netFetch(url, upstream);
});

// ── Route modules ──
registerCapabilitiesRoutes(app);
registerFsRoutes(app);

// ── Start ──
serve({ fetch: app.fetch, port: PORT }, (info) =>
  console.log(`[server] Running on http://localhost:${info.port}`),
);
