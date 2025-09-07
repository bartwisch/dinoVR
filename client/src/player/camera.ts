import * as THREE from 'three';

export interface CameraConfig {
  orbitSpeed: number;     // rad/s per unit
  pitchSpeed: number;     // rad/s per unit
  zoomSpeed: number;      // m/s per unit
  minPitch: number;       // radians
  maxPitch: number;       // radians
  minRadius: number;      // meters
  maxRadius: number;      // meters
  yawDamp: number;        // 1/s
  pitchDamp: number;      // 1/s
  zoomDamp: number;       // 1/s
  panSpeed: number;       // m/s lateral per unit
  panVertSpeed: number;   // m/s vertical per unit
  maxPan: number;         // meters horizontal clamp (radius in XZ)
  minPanY: number;        // meters
  maxPanY: number;        // meters
}

export class CameraController {
  private cam: THREE.Camera;
  private getTarget: () => THREE.Vector3;
  private localToParent = true; // position relative to parent (rig)

  private yaw = Math.PI; // azimuth
  private pitch = Math.PI / 2.2; // elevation
  private radius = 3;

  // target (for damping)
  private yawT = this.yaw;
  private pitchT = this.pitch;
  private radiusT = this.radius;

  private cfg: CameraConfig;
  private panOffsetLocal = new THREE.Vector3(); // offset of the look-at point in rig local space

  constructor(cam: THREE.Camera, getTarget: () => THREE.Vector3, cfg?: Partial<CameraConfig>) {
    this.cam = cam;
    this.getTarget = getTarget;
    this.cfg = {
      orbitSpeed: 2.5,
      pitchSpeed: 1.8,
      zoomSpeed: 3.0,
      minPitch: THREE.MathUtils.degToRad(15),
      maxPitch: THREE.MathUtils.degToRad(85),
      minRadius: 1.5,
      maxRadius: 10,
      yawDamp: 6,
      pitchDamp: 6,
      zoomDamp: 6,
      panSpeed: 2.0,
      panVertSpeed: 1.5,
      maxPan: 2.0,
      minPanY: -0.5,
      maxPanY: 1.5,
      ...cfg,
    };
    this.clampTargets();
    this.updateImmediate();
  }

  configure(cfg: Partial<CameraConfig>) {
    this.cfg = { ...this.cfg, ...cfg };
    this.clampTargets();
  }

  setState(yaw: number, pitch: number, radius: number) {
    this.yaw = yaw; this.pitch = pitch; this.radius = radius;
    this.yawT = yaw; this.pitchT = pitch; this.radiusT = radius;
    this.updateImmediate();
  }

  // cameraMove: [x,y] where x=orbit, y=vertical (+down), also used as zoom input
  update(dt: number, cameraMove: [number, number], panMode = false) {
    const [mx, my] = cameraMove;
    if (mx !== 0 || my !== 0) {
      if (panMode) {
        // Pan: move the look-at pivot instead of orbiting
        this.panOffsetLocal.x += mx * this.cfg.panSpeed * dt;     // left/right
        this.panOffsetLocal.y += -my * this.cfg.panVertSpeed * dt; // up/down (invert y)
        // clamp pan in XZ radius and Y range
        const horiz = Math.hypot(this.panOffsetLocal.x, this.panOffsetLocal.z);
        if (horiz > this.cfg.maxPan) {
          const s = this.cfg.maxPan / horiz;
          this.panOffsetLocal.x *= s;
          this.panOffsetLocal.z *= s;
        }
        this.panOffsetLocal.y = THREE.MathUtils.clamp(this.panOffsetLocal.y, this.cfg.minPanY, this.cfg.maxPanY);
      } else {
        // Orbit / pitch / zoom
        this.yawT += mx * this.cfg.orbitSpeed * dt;
        this.pitchT += -my * this.cfg.pitchSpeed * dt; // invert y
        this.radiusT += my * this.cfg.zoomSpeed * dt;
        this.clampTargets();
      }
    }

    // critically damped-ish smoothing
    const ay = Math.exp(-this.cfg.yawDamp * dt);
    const ap = Math.exp(-this.cfg.pitchDamp * dt);
    const az = Math.exp(-this.cfg.zoomDamp * dt);
    this.yaw = this.yawT + (this.yaw - this.yawT) * ay;
    this.pitch = this.pitchT + (this.pitch - this.pitchT) * ap;
    this.radius = this.radiusT + (this.radius - this.radiusT) * az;

    this.updateImmediate();
  }

  nudgeZoom(dz: number) {
    this.radiusT += dz;
    this.clampTargets();
  }

  private clampTargets() {
    this.pitchT = THREE.MathUtils.clamp(this.pitchT, this.cfg.minPitch, this.cfg.maxPitch);
    this.radiusT = THREE.MathUtils.clamp(this.radiusT, this.cfg.minRadius, this.cfg.maxRadius);
  }

  private updateImmediate() {
    const target = this.getTarget();
    const x = this.radius * Math.sin(this.pitch) * Math.cos(this.yaw);
    const y = this.radius * Math.cos(this.pitch);
    const z = this.radius * Math.sin(this.pitch) * Math.sin(this.yaw);
    if (this.localToParent) {
      // place camera relative to parent (rig local space)
      this.cam.position.set(x, y, z);
      // look at parent's origin in world space
      const parent = this.cam.parent as THREE.Object3D | null;
      const worldTarget = parent ? new THREE.Vector3().setFromMatrixPosition(parent.matrixWorld) : target;
      if (parent) {
        // add pan offset in parent's (rig) local space, transformed to world
        const q = new THREE.Quaternion();
        parent.getWorldQuaternion(q);
        const off = this.panOffsetLocal.clone().applyQuaternion(q);
        worldTarget.add(off);
      }
      this.cam.lookAt(worldTarget);
    } else {
      // absolute world placement around target
      const worldTarget = target.clone();
      // apply pan even in world mode (assume getTarget is rig center in world)
      worldTarget.add(this.panOffsetLocal);
      this.cam.position.set(worldTarget.x + x, worldTarget.y + y, worldTarget.z + z);
      this.cam.lookAt(worldTarget);
    }
  }
}
