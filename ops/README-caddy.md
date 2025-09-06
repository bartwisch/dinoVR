# Caddy HTTPS Proxy (port 443)

This proxy terminates TLS on port 443 and forwards:
- `/socket.io` → `http://localhost:5174` (Node server)
- everything else → `http://localhost:5173` (Vite dev client)

It pairs well with `VITE_WS_URL=origin` so the client connects to the same origin.

## Prereqs
- Install Caddy v2 (`brew install caddy` on macOS).
- Start your dev servers:
  - `npm --workspace server run dev`
  - `npm --workspace client run dev` (or `dev:https`; either is fine when using Caddy)
- In `client/.env.local` set:
  - `VITE_WS_URL=origin`

## Run Caddy
Pick the LAN IP or local hostname of your PC (visible from the headset). Then run:

SITE=192.168.1.50 caddy run --config ops/Caddyfile

Open on the headset:

https://192.168.1.50

## Certificates (Caddy internal CA)
This config uses `tls internal`, which creates a local CA and issues a cert for the site. To avoid warnings on the headset, import the root CA:
- macOS: `~/Library/Application Support/Caddy/pki/authorities/local/root.crt`
- Linux: `~/.local/share/caddy/pki/authorities/local/root.crt`
- Windows: `%AppData%/Caddy/pki/authorities/local/root.crt`

Transfer that file to the headset and install it under Settings → Security → Install certificates from storage.

Alternative: Use a public DNS name with a publicly trusted cert (e.g., via a tunnel or a public domain), then switch to automatic HTTPS without `tls internal`.

## Notes
- WebSockets are proxied automatically by Caddy; no extra flags needed.
- If you change ports, adjust `ops/Caddyfile` accordingly.
- When using this proxy, your page origin is `https://<SITE>`. The Socket.IO path is `/socket.io` on the same origin; no mixed content.
