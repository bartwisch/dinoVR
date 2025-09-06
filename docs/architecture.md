# dinoVR Architecture (MVP)

- Client: Three.js + WebXR (TypeScript, Vite)
- Server: Node + Socket.IO (TypeScript)
- Shared: types across both packages

Networking cadence:
- Client input ~30Hz → server sim 60Hz → snapshots 20Hz → client interpolation 100–150ms.

