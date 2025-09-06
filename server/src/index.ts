import http from 'node:http';
import { Server } from 'socket.io';

const PORT = Number(process.env.PORT || 5174);

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];
type InputState = { t: number; thrust: Vec3; fast?: boolean; turn?: number; quat?: Quat };
type Player = { id: string; pos: Vec3; vel: Vec3; quat: Quat; color: number; name: string; input: InputState };

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
  const player: Player = { id: socket.id, pos: [0, 1.2, 0], vel: [0,0,0], quat: [0,0,0,1], color, name, input: { t: Date.now(), thrust: [0,0,0], fast: false, turn: 0 } };
  players.set(socket.id, player);

  socket.emit('welcome', { id: socket.id, name, color });
  io.emit('snapshot', snapshot());

  socket.on('state_input', (msg: InputState) => {
    const p = players.get(socket.id);
    if (!p) return;
    p.input = msg;
    if (msg.quat) p.quat = msg.quat;
  });

  // Simple time sync: echo back server time
  socket.on('ts', (msg: { c: number }) => {
    socket.emit('ts', { c: msg.c, s: Date.now() });
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);
    io.emit('snapshot', snapshot());
  });
});

// Simulation at 60Hz
const STEP = 1/60;
setInterval(() => {
  const drag = 0.8; // per second
  for (const p of players.values()) {
    const a = (p.input.fast ? 4.0 : 2.0); // m/s^2
    p.vel[0] += p.input.thrust[0] * a * STEP;
    p.vel[1] += p.input.thrust[1] * a * STEP;
    p.vel[2] += p.input.thrust[2] * a * STEP;
    const dragCoeff = Math.exp(-drag * STEP);
    p.vel[0] *= dragCoeff; p.vel[1] *= dragCoeff; p.vel[2] *= dragCoeff;
    // clamp speed
    const speed = Math.hypot(p.vel[0], p.vel[1], p.vel[2]);
    const maxVel = 3.5;
    if (speed > maxVel) {
      const s = maxVel / speed;
      p.vel[0] *= s; p.vel[1] *= s; p.vel[2] *= s;
    }
    // integrate
    p.pos[0] += p.vel[0] * STEP;
    p.pos[1] += p.vel[1] * STEP;
    p.pos[2] += p.vel[2] * STEP;
  }
}, Math.round(STEP * 1000));

// Snapshots at 20Hz
setInterval(() => {
  io.emit('snapshot', snapshot());
}, 50);

function snapshot() {
  return { t: Date.now(), players: Array.from(players.values()).map(p => ({ id: p.id, position: p.pos, quaternion: p.quat, color: p.color, name: p.name })) };
}

httpServer.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
});
