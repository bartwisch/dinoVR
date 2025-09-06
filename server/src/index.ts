import http from 'node:http';
import { Server } from 'socket.io';

const PORT = Number(process.env.PORT || 5174);

type Vec3 = [number, number, number];
type Player = { id: string; pos: Vec3; color: number; name: string };

const players = new Map<string, Player>();

const httpServer = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('dinoVR server');
});

const io = new Server(httpServer, {
  cors: { origin: '*'}, // dev only; tighten in prod
});

io.on('connection', (socket) => {
  const color = Math.floor(Math.random() * 0xffffff);
  const name = `cube_${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`;
  const player: Player = { id: socket.id, pos: [0, 1.2, 0], color, name };
  players.set(socket.id, player);

  socket.emit('welcome', { id: socket.id, name, color });
  io.emit('snapshot', { t: Date.now(), players: Array.from(players.values()) });

  socket.on('disconnect', () => {
    players.delete(socket.id);
    io.emit('snapshot', { t: Date.now(), players: Array.from(players.values()) });
  });
});

// Broadcast periodic snapshots (idle demo)
setInterval(() => {
  io.emit('snapshot', { t: Date.now(), players: Array.from(players.values()) });
}, 1000);

httpServer.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
});

