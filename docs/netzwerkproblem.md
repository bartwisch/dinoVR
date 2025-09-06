# Netzwerkproblem: Socket.IO Verbindung über HTTPS-Proxy

## Problem-Beschreibung

### Symptome
- Server läuft erfolgreich auf Port 5174 (HTTP)
- Client läuft erfolgreich auf Port 5173 (HTTPS)
- Spieler-API zeigt immer 0 Spieler: `{"count": 0, "players": []}`
- Browser-Konsole zeigt WebSocket-Verbindungsfehler:
  ```
  WebSocket connection to 'wss://localhost:5174/socket.io/?EIO=4&transport=websocket' failed
  ```

### Root Cause
Das Problem war ein **HTTPS/HTTP Mixed-Content-Konflikt** in Kombination mit einer **Socket.IO URL-Auflösungslogik**, die den Vite-Proxy umgangen hat.

#### Technische Details:
1. **Client (Vite)**: Läuft über HTTPS (`https://localhost:5173`)
2. **Server (Node.js)**: Läuft über HTTP (`http://localhost:5174`)
3. **Browser-Sicherheit**: HTTPS-Seiten können nur WSS-Verbindungen herstellen, nicht WS
4. **Socket.IO**: Versuchte direkte Verbindung zu `wss://localhost:5174` (fehlgeschlagen)
5. **Vite-Proxy**: Wurde umgangen, obwohl korrekt konfiguriert

## Fehlerhafte Konfiguration

### Problematischer Code in `client/src/net/client.ts`:
```typescript
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
      // PROBLEM: Direkte Verbindung zu Port 5174
      u.port = '5174';
      url = u.origin; // ergibt https://localhost:5174 (nicht erreichbar)
    }
  }

  const opts = { transports: ['websocket'], autoConnect: true } as const;
  const socket = url ? io(url, opts) : io(opts);
  return socket;
}
```

### Was passierte:
- Trotz `VITE_WS_URL=origin` in `.env.local`
- Socket.IO versuchte Verbindung zu: `wss://localhost:5174`
- Server war nur über HTTP erreichbar: `ws://localhost:5174`
- → **Verbindung fehlgeschlagen**

## Lösung

### 1. Code-Vereinfachung in `client/src/net/client.ts`:
```typescript
export function connectSocket(): Socket {
  // Force using the current origin (via Vite proxy) instead of direct connection
  // This ensures HTTPS->HTTPS and proper proxy routing
  const opts = { transports: ['websocket'], autoConnect: true };
  const socket = io(opts); // Always use current origin (no URL parameter)
  return socket;
}
```

### 2. Vite-Proxy-Konfiguration (bereits korrekt in `vite.config.ts`):
```typescript
proxy: {
  '/socket.io': {
    target: 'http://localhost:5174',
    ws: true,
    changeOrigin: true,
  },
}
```

### Wie es jetzt funktioniert:
1. **Socket.IO** verbindet zu: `wss://localhost:5173/socket.io` (current origin)
2. **Vite-Proxy** fängt `/socket.io`-Requests ab
3. **Proxy** leitet weiter zu: `http://localhost:5174` (HTTP Backend)
4. **Verbindung erfolgreich** ✅

## Verifikation

### Test-Commands:
```bash
# 1. Server-Health prüfen
curl http://localhost:5174/healthz
# Erwartung: "ok"

# 2. Proxy-Funktionalität prüfen  
curl -k "https://localhost:5173/socket.io/?EIO=4&transport=polling"
# Erwartung: Socket.IO-Response mit Session-ID

# 3. Spieler-Count prüfen
curl http://localhost:5174/players
# Erwartung: {"count": X, "players": [...]}
```

### Browser-Konsole:
- **Vorher**: `WebSocket connection to 'wss://localhost:5174/socket.io' failed`
- **Nachher**: Keine WebSocket-Fehler, erfolgreiche Socket.IO-Verbindung

## Debugging-Tipps für die Zukunft

### 1. Port-Status prüfen:
```bash
lsof -i :5173  # Client-Port
lsof -i :5174  # Server-Port
```

### 2. Socket.IO Direct-Test:
```bash
# Direkter Server-Test
curl "http://localhost:5174/socket.io/?EIO=4&transport=polling"

# Proxy-Test  
curl -k "https://localhost:5173/socket.io/?EIO=4&transport=polling"
```

### 3. Browser Developer Tools:
- **Network Tab**: Schauen ob WebSocket-Verbindung zu richtigem Port geht
- **Console**: Prüfen auf Socket.IO-Verbindungsfehler
- **Security Tab**: Mixed-Content-Warnungen beachten

## Vorbeugende Maßnahmen

1. **Immer Proxy verwenden** bei HTTPS-Client + HTTP-Backend
2. **Socket.IO URL-Logik einfach halten** (current origin bevorzugen)
3. **Umgebungsvariablen testen** mit verschiedenen Werten
4. **Mixed-Content-Policy** bei Browser-Security beachten

## Verwandte Dateien
- `client/src/net/client.ts` - Socket.IO Client-Konfiguration
- `client/vite.config.ts` - Vite-Proxy-Konfiguration  
- `client/.env.local` - Umgebungsvariablen
- `server/src/index.ts` - Socket.IO Server

---
**Erstellt am**: 6. September 2025  
**Problem gelöst**: ✅ Socket.IO Proxy-Verbindung funktioniert  
**Spieler-Count**: Zeigt korrekte Anzahl verbundener Spieler
