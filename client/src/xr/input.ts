import * as THREE from 'three';

export type Thrust = [number, number, number];

export interface InputState {
  thrust: Thrust; // head-yaw local thrust
  fast: boolean;
  turn: number; // snap turn steps (degrees positive right)
  quat: [number, number, number, number]; // head orientation
  cameraMove: [number, number]; // camera movement from right stick [horizontal, vertical]
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
    let cameraMoveX = 0, cameraMoveY = 0; // right stick for camera movement

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

        // Debug: log all gamepad info for troubleshooting (less verbose)
        if (handed === 'right' && (Math.abs(axX) > 0.1 || Math.abs(axY) > 0.1)) {
          console.log(`Right controller:`, {
            axesCount: axes.length,
            axX: axX.toFixed(3),
            axY: axY.toFixed(3)
          });
        }

        if (handed === 'left' || handed === 'none') {
          // Movement from left stick (standard mapping, corrections applied later in thrust calculation)
          lx = Math.abs(axX) > this.deadzone ? axX : 0;  // Normal X (left/right)
          ly = Math.abs(axY) > this.deadzone ? -axY : 0; // Invert Y (forward/back)
        } else if (handed === 'right') {
          // Camera movement from right stick
          cameraMoveX = Math.abs(axX) > this.deadzone ? axX : 0; // Horizontal camera orbit
          cameraMoveY = Math.abs(axY) > this.deadzone ? axY : 0; // Vertical camera movement
          
          // Debug logging for right stick
          if (Math.abs(axX) > this.deadzone || Math.abs(axY) > this.deadzone) {
            console.log('Right stick detected:', { axX, axY, cameraMoveX, cameraMoveY });
          }
        }

        // Fast when trigger (0) or squeeze (1) pressed, or A/B (4/5 on some)
        if (gp.buttons?.length) {
          const pressed = gp.buttons.some((b, i) => (i === 0 || i === 1 || i === 4 || i === 5) && !!b.pressed);
          fast = fast || pressed;
        }
      }
    }

    // Desktop fallback: WASD + Shift for fast, Arrow keys for camera
    if (this.key.size) {
      lx = (this.key.has('d') ? 1 : 0) + (this.key.has('a') ? -1 : 0);
      ly = (this.key.has('w') ? 1 : 0) + (this.key.has('s') ? -1 : 0);
      fast = this.key.has('shift');
      
      // Camera movement with arrow keys
      cameraMoveX = (this.key.has('arrowright') ? 1 : 0) + (this.key.has('arrowleft') ? -1 : 0);
      cameraMoveY = (this.key.has('arrowup') ? -1 : 0) + (this.key.has('arrowdown') ? 1 : 0);
    }

    // Map to head-yaw local thrust
    (camera as THREE.Object3D).getWorldQuaternion(headYaw);
    tmpEuler.setFromQuaternion(headYaw, 'YXZ');
    tmpEuler.x = 0; tmpEuler.z = 0; // keep yaw only
    headYaw.setFromEuler(tmpEuler);
    fwd.set(0, 0, -1).applyQuaternion(headYaw);
    right.set(1, 0, 0).applyQuaternion(headYaw);

    const thrust: Thrust = [
      -(right.x * lx + fwd.x * ly), // Invert X movement
      right.y * lx + fwd.y * ly,    // Keep Y movement
      -(right.z * lx + fwd.z * ly), // Invert Z movement
    ];

    const q = new THREE.Quaternion();
    (camera as THREE.Object3D).getWorldQuaternion(q);
    const quat: [number, number, number, number] = [q.x, q.y, q.z, q.w];
    
    return { thrust, fast, turn, quat, cameraMove: [cameraMoveX, cameraMoveY] };
  }
}
