---
name: WebSocket upgrade conflicts & dev routing
description: Why WS connections failed with HTTP 400 and how dev-mode WS URLs must be built in this monorepo
---

## Rule 1: Never attach multiple `WebSocketServer({ server, path })` to one HTTP server
**Why:** Each instance adds its own `upgrade` listener; a non-matching path makes the *other* instance abort the handshake with HTTP 400. This silently broke the call-funnel WS even on direct localhost connections.
**How to apply:** Use `WebSocketServer({ noServer: true })` and a single `server.on("upgrade")` router that dispatches by pathname. The API server currently has an exclusive upgrade handler for `/api/call-funnel-ws` that 404s other paths — centralize routing there if adding more WS endpoints.

## Rule 2: Browser WS/API URLs must stay under the artifact base path in dev
**Why:** Replit's shared proxy routes by path prefix. A root `/api/...` request from the browser never reaches the artifact's Vite dev server, so a Vite `/api` proxy alone is useless. In production the deployment proxy DOES route root `/api/*` to the API server.
**How to apply:** Client builds URL as `import.meta.env.DEV ? BASE_URL + "api/..." : "/api/..."`; Vite proxies `<base>/api` (with rewrite stripping the base) to the API server with `ws: true`.
