# HTTPS Dev for Headsets (Quest 2/3)

This enables opening the app on `https://<PC-IP>:5173` from a headset and proxying Socket.IO (`/socket.io`) to the Node server on port 5174.

## What’s in this repo
- `client/vite.config.ts`: HTTPS on Vite dev server, `host: true` (LAN), and proxy for `/socket.io → http://localhost:5174`.
- `client/src/net/client.ts`: If `VITE_WS_URL=origin` (or `/`), the client connects to the current page origin. Otherwise it defaults to `http://<host>:5174`.

## Option A — Quick USB test (no HTTPS)
If you want the fastest path without certificates:
- Enable Developer Mode on the Quest and install ADB.
- Connect via USB then run on your PC:
  - `adb reverse tcp:5173 tcp:5173`
  - `adb reverse tcp:5174 tcp:5174`
- Start dev: `npm run dev`
- Open `http://localhost:5173` on the headset. WebXR works because `localhost` is a secure context on-device.

## Option B — HTTPS over LAN (recommended for Wi‑Fi)
1) Install mkcert and the Vite plugin (on your PC):
- Install mkcert for your OS and run `mkcert -install` to trust the local CA.
- Add the plugin (already declared in `client/package.json`):
  - `npm --workspace client install` (installs `vite-plugin-mkcert`)

2) Start the dev server with HTTPS + proxy:
- `npm --workspace client run dev:https`
- Or simply `npm --workspace client run dev` (config is applied automatically)

3) Configure the client to use same-origin WebSocket:
- Create `client/.env.local` with:
  - `VITE_WS_URL=origin`

4) On the headset, open:
- `https://<PC-IP>:5173`
  - The certificate must be trusted on the headset. With mkcert, import the generated root CA on the device (Settings → Security → Install certificates from storage). Alternatively, use a reverse proxy (e.g., Caddy) with a certificate the device already trusts.

## Option C — Caddy on :443 (single origin)
If you prefer a single clean URL on `https://<PC-IP>` with TLS terminated by a proxy, use the provided Caddy setup.

1) Install Caddy and start your dev servers (client over HTTP):
- `npm --workspace server run dev`
- `npm --workspace client run dev` (NOT `dev:https`)

2) Configure the client for same-origin sockets:
- `client/.env.local` → `VITE_WS_URL=origin`

3) Run Caddy with your LAN IP:
- `SITE=<PC-IP> caddy run --config ops/Caddyfile`

4) Open on the headset:
- `https://<PC-IP>`

Notes:
- Caddy config: `ops/Caddyfile`, docs: `ops/README-caddy.md`.
- Uses `tls internal`; import Caddy’s root CA on the headset to avoid warnings (see README for path).

## Troubleshooting
- WebXR needs HTTPS: Use Option A (ADB reverse) or ensure you are using `https://` with a trusted cert.
- Disconnected WebSocket: Confirm `VITE_WS_URL=origin` is set when using the HTTPS proxy, and that `/socket.io` shows 101 Switching Protocols in DevTools. Also check that the Node server is running on 5174.
- Certificate warnings: If mkcert isn’t installed on the headset, you’ll see warnings. Import the mkcert root CA or use a publicly trusted certificate via a reverse proxy.

## Notes
- When using the HTTPS proxy, the page origin is 5173. The Socket.IO path is `/socket.io` on the same origin, so no mixed-content issues.
- Without `VITE_WS_URL=origin`, the client tries to connect directly to port 5174, which is fine on desktop HTTP but will be blocked from an HTTPS page.
