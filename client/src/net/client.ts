/// <reference types="vite/client" />
import { io, Socket } from 'socket.io-client';

// Connect to Socket.IO.
// Defaults:
// - If VITE_WS_URL is 'origin' or '/', use the current page origin
//   (works with Vite's proxy for HTTPS dev over LAN).
// - Otherwise, fall back to http://<host>:5174 (classic dev setup).
export function connectSocket(): Socket {
  const envUrl = (import.meta as any)?.env?.VITE_WS_URL as string | undefined;

  let url: string | undefined;
  if (envUrl) {
    const normalized = envUrl.trim();
    if (normalized === '' || normalized === '/' || normalized === 'origin') {
      url = undefined; // let socket.io use the current origin
    } else {
      url = normalized; // explicit override
    }
  } else {
    const u = new URL(window.location.href);
    if (u.protocol === 'file:') {
      url = 'http://localhost:5174';
    } else {
      // Default to the Node server port for non-proxied dev
      u.port = '5174';
      url = u.origin;
    }
  }

  const opts = { transports: ['websocket'], autoConnect: true } as const;
  const socket = url ? io(url, opts) : io(opts);
  return socket;
}
