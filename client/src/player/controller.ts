import * as THREE from 'three';

export interface InputStateLike {
  thrust: [number, number, number];
  fast: boolean;
}

export interface PlayerControllerConfig {
  accel: number;     // m/s^2 walk
  accelFast: number; // m/s^2 run
  drag: number;      // 1/s exponential
  maxVel: number;    // m/s
  reconcileLerp: number; // [0..1] blend per frame toward server
}

export class PlayerController {
  private rig: THREE.Object3D;
  private velocity = new THREE.Vector3();
  private cfg: PlayerControllerConfig;

  // last authoritative we heard (optional)
  private authPos?: THREE.Vector3;

  constructor(rig: THREE.Object3D, cfg?: Partial<PlayerControllerConfig>) {
    this.rig = rig;
    this.cfg = {
      accel: 2.0,
      accelFast: 4.0,
      drag: 0.8,
      maxVel: 3.5,
      reconcileLerp: 0.1,
      ...cfg,
    };
  }

  configure(cfg: Partial<PlayerControllerConfig>) {
    this.cfg = { ...this.cfg, ...cfg };
  }

  step(dt: number, input: InputStateLike) {
    const accel = input.fast ? this.cfg.accelFast : this.cfg.accel;
    const thrust = new THREE.Vector3().fromArray(input.thrust);
    this.velocity.addScaledVector(thrust, accel * dt);
    // drag
    const dragCoeff = Math.exp(-this.cfg.drag * dt);
    this.velocity.multiplyScalar(dragCoeff);
    // clamp
    const speed = this.velocity.length();
    if (speed > this.cfg.maxVel) this.velocity.multiplyScalar(this.cfg.maxVel / speed);
    // integrate
    this.rig.position.addScaledVector(this.velocity, dt);

    // mild reconciliation if we have authoritative
    if (this.authPos) {
      this.rig.position.lerp(this.authPos, this.cfg.reconcileLerp);
    }
  }

  applyAuthoritative(position: [number, number, number]) {
    this.authPos = new THREE.Vector3(position[0], position[1], position[2]);
  }
}

