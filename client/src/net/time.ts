import type { Socket } from 'socket.io-client';

export class TimeSync {
  private socket: Socket;
  private offset = 0; // serverTime - clientTime
  private alpha = 0.2; // EMA smoothing

  constructor(socket: Socket) {
    this.socket = socket;
    this.setup();
  }

  now(): number {
    return Date.now() + this.offset;
  }

  private setup() {
    const ping = () => {
      const c = Date.now();
      this.socket.emit('ts', { c });
    };
    this.socket.on('connect', () => {
      ping();
    });
    this.socket.on('ts', (msg: { c: number; s: number }) => {
      const t1 = Date.now();
      const rtt = Math.max(0, t1 - msg.c);
      const oneWay = rtt / 2;
      const sampleOffset = msg.s - (msg.c + oneWay);
      // EMA smoothing
      this.offset = this.offset === 0 ? sampleOffset : (1 - this.alpha) * this.offset + this.alpha * sampleOffset;
    });
    // Periodic pings
    setInterval(ping, 3000);
  }
}

