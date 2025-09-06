export type Vec3 = [number, number, number];

export interface PlayerState {
  id: string;
  position: Vec3;
  quaternion?: [number, number, number, number];
  color: number;
  name: string;
}

export interface ClientInput {
  t: number; // client timestamp ms
  thrust: Vec3; // head-local thrust vector
  fast?: boolean;
  turn?: number; // snap turn steps
}

export interface ServerSnapshot {
  t: number;
  players: PlayerState[];
}

