import { defineConfig } from 'vite';

// Vite dev server with HTTPS enabled and a WebSocket proxy so that
// the browser can connect to Socket.IO via the same origin (5173)
// while traffic is forwarded to the Node server on 5174.
//
// Tip: Install and trust a local CA for clean HTTPS on devices:
//   npm i -D vite-plugin-mkcert
//   npx mkcert -install (mkcert must be installed on your system)
// When the plugin is present, we enable it automatically; otherwise
// Vite will fall back to a self-signed certificate.

export default defineConfig(async () => {
  const plugins: any[] = [];
  try {
    // Optional: use mkcert if available for trusted certs on LAN
    const mod = await import('vite-plugin-mkcert');
    const mkcert = (mod as any).default ?? (mod as any);
    if (mkcert) plugins.push(mkcert());
  } catch {
    // plugin not installed; continue without it
    console.warn('[vite] vite-plugin-mkcert not installed; using default HTTPS cert.');
  }

  const useHttps = process.env.DEV_HTTPS !== 'false';

  return {
    plugins,
    server: {
      https: useHttps,
      host: true, // listen on LAN so headsets can reach it
      proxy: {
        // Forward Socket.IO to the Node server on 5174
        '/socket.io': {
          target: 'http://localhost:5174',
          ws: true,
          changeOrigin: true,
        },
      },
    },
    build: {
      target: 'esnext', // allow top-level await in client code
    },
  };
});
