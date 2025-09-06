import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true,
    port: 5173
  },
  build: {
    target: 'es2020',
    sourcemap: false
  }
});

