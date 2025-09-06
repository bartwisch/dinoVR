/// <reference types="vite/client" />
import { io, Socket } from 'socket.io-client';

// Connect to Socket.IO.
// Defaults:
// - If VITE_WS_URL is 'origin' or '/', use the current page origin
//   (works with Vite's proxy for HTTPS dev over LAN).
// - Otherwise, fall back to http://<host>:5174 (classic dev setup).
export function connectSocket(): Socket {
  // Force using the current origin (via Vite proxy) instead of direct connection
  // This ensures HTTPS->HTTPS and proper proxy routing
  const opts = { transports: ['websocket'], autoConnect: true };
  const socket = io(opts); // Always use current origin (no URL parameter)
  return socket;
}
