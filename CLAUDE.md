# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Development:**
- `npm run dev` - Start both client and server in development mode
- `npm run dev:client` - Start only the client (Vite dev server)
- `npm run dev:server` - Start only the server (tsx watch)

**Build & Quality:**
- `npm run build` - Build all workspaces
- `npm run lint` - Lint all workspaces (if lint scripts exist)
- `npm run test` - Run tests for all workspaces (if test scripts exist)

**Individual workspace commands:**
- `npm --workspace client run dev` - Client development
- `npm --workspace server run dev` - Server development
- `npm --workspace client run lint` - Lint client code
- `npm --workspace server run lint` - Lint server code

**Deployment:**
- `npm run proxy:caddy` - Run Caddy reverse proxy for HTTPS in development

## Architecture

This is a multiplayer VR application built with:

- **Client**: Three.js + WebXR (TypeScript, Vite)
- **Server**: Node.js + Socket.IO (TypeScript)
- **Shared**: Common types and utilities

**Project Structure:**
```
client/src/
├── main.ts          # Entry point
├── assets/          # 3D models (.glb files)
├── net/             # Networking code
├── player/          # Player-related code
├── scene/           # Scene management
├── util/            # Utilities
└── xr/              # WebXR input, locomotion, session management

server/src/
└── index.ts         # Server entry point

shared/src/
└── types.ts         # Shared TypeScript types
```

**Networking Architecture:**
- Client input ~30Hz → Server simulation 60Hz → Snapshots 20Hz → Client interpolation 100-150ms
- Uses Socket.IO for real-time communication
- Shared types in `shared/src/types.ts` define the networking protocol

**Performance Targets (Quest 2/3):**
- Target 72/90 FPS
- No dynamic shadows; minimize draw calls
- Use `renderer.xr.setFoveation(2)` if available
- Avoid per-frame allocations; pool math objects

**Key Technologies:**
- TypeScript throughout
- Three.js for 3D rendering
- WebXR API for VR functionality
- Socket.IO for networking
- Vite for client bundling
- tsx for server development

## Development Notes

The project uses npm workspaces with three packages: client, server, and shared. Always run commands from the root directory and use workspace-specific commands when needed.

The shared package contains TypeScript types that are used by both client and server for type-safe networking.