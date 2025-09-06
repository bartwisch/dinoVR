import * as THREE from 'three';

export type Thrust = [number, number, number];

export interface InputState {
  thrust: Thrust; // head-yaw local thrust
  fast: boolean;
  turn: number; // snap turn steps (degrees positive right)
  quat: [number, number, number, number]; // head orientation
}

const tmpEuler = new THREE.Euler();
const headYaw = new THREE.Quaternion();
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();

export class XRInput {
  private key = new Set<string>();
  private snapReady = true; // gate snap turns until stick returns to deadzone

  // Tunables
  private deadzone = 0.15;
  private snapThreshold = 0.7;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => this.key.add(e.key.toLowerCase()));
      window.addEventListener('keyup', (e) => this.key.delete(e.key.toLowerCase()));
    }
  }

  // Compute input from XR gamepads (if present) with desktop keyboard fallback
  sample(camera: THREE.Camera, session?: XRSession): InputState {
    let lx = 0, ly = 0; // left stick X (strafe), Y (forward)
    let fast = false;
    let turn = 0;

    if (session) {
      for (const src of session.inputSources) {
        const gp = src.gamepad as Gamepad | undefined;
        if (!gp) continue;
        const handed = src.handedness as ('left' | 'right' | 'none' | undefined);
        const axes = gp.axes || [];
        
        // xr-standard: prefer thumbstick axes [2,3] when present, else [0,1]
        const axIndex = axes.length >= 4 ? 2 : 0;
        const axX = axes[axIndex] || 0;
        const axY = axes[axIndex + 1] || 0;

        if (handed === 'left' || handed === 'none') {
          // Movement from left stick (invert Y so up is positive forward)
          lx = Math.abs(axX) > this.deadzone ? axX : 0;
          ly = Math.abs(axY) > this.deadzone ? -axY : 0;
        } else if (handed === 'right') {
          // Snap turn from right stick X with gating
          const rx = Math.abs(axX) > this.deadzone ? axX : 0;
          if (this.snapReady && Math.abs(rx) >= this.snapThreshold) {
            turn = rx > 0 ? 30 : -30; // 30-degree step
            this.snapReady = false;
          }
          if (!this.snapReady && Math.abs(rx) < 0.3) this.snapReady = true;
        }

        // Fast when trigger (0) or squeeze (1) pressed, or A/B (4/5 on some)
        if (gp.buttons?.length) {
          const pressed = gp.buttons.some((b, i) => (i === 0 || i === 1 || i === 4 || i === 5) && !!b.pressed);
          fast = fast || pressed;
        }
      }
    }

    // Desktop fallback: WASD + Shift for fast, QE for snap turn
    if (this.key.size) {
      lx = (this.key.has('d') ? 1 : 0) + (this.key.has('a') ? -1 : 0);
      ly = (this.key.has('w') ? 1 : 0) + (this.key.has('s') ? -1 : 0);
      fast = this.key.has('shift');
      if (this.key.has('e')) turn = 30; else if (this.key.has('q')) turn = -30;
    }

    // Map to head-yaw local thrust
    (camera as THREE.Object3D).getWorldQuaternion(headYaw);
    tmpEuler.setFromQuaternion(headYaw, 'YXZ');
    tmpEuler.x = 0; tmpEuler.z = 0; // keep yaw only
    headYaw.setFromEuler(tmpEuler);
    fwd.set(0, 0, -1).applyQuaternion(headYaw);
    right.set(1, 0, 0).applyQuaternion(headYaw);

    const thrust: Thrust = [
      right.x * lx + fwd.x * ly,
      right.y * lx + fwd.y * ly,
      right.z * lx + fwd.z * ly,
    ];

    const q = new THREE.Quaternion();
    (camera as THREE.Object3D).getWorldQuaternion(q);
    const quat: [number, number, number, number] = [q.x, q.y, q.z, q.w];
    
    return { thrust, fast, turn, quat };
  }
}
