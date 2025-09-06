/// <reference types="vite/client" />
import { io, Socket } from 'socket.io-client';

export function connectSocket(): Socket {
  const fallback = (() => {
    const u = new URL(window.location.href);
    u.port = '5174';
    return u.origin;
  })();
  const url = import.meta.env?.VITE_WS_URL || fallback;
  const socket = io(url, {
    transports: ['websocket'],
    autoConnect: true,
  });
  return socket;
}
