import * as THREE from 'three';

export class Locomotion {
  velocity = new THREE.Vector3();
  maxVel = 3.5; // m/s
  accel = 2.0; // m/s^2 base
  drag = 0.8; // per second (exponential decay coefficient)

  constructor(private rig: THREE.Object3D) {}

  step(thrust: THREE.Vector3, fast: boolean, dt: number) {
    const accel = this.accel * (fast ? 2.0 : 1.0);
    this.velocity.addScaledVector(thrust, accel * dt);
    // Drag
    const dragCoeff = Math.exp(-this.drag * dt);
    this.velocity.multiplyScalar(dragCoeff);
    // Clamp
    const speed = this.velocity.length();
    if (speed > this.maxVel) this.velocity.multiplyScalar(this.maxVel / speed);
    // Integrate
    this.rig.position.addScaledVector(this.velocity, dt);
  }
}

