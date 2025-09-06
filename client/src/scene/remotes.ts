import * as THREE from 'three';

type Vec3 = [number, number, number];

export interface RemotePlayerState {
  id: string;
  position: Vec3;
  quaternion?: [number, number, number, number];
  color: number;
  name: string;
}

export interface ServerSnapshot {
  t: number; // ms
  players: RemotePlayerState[];
}

type Sample = { t: number; position: THREE.Vector3; quat?: THREE.Quaternion };

class Remote {
  mesh: THREE.Mesh;
  samples: Sample[] = [];
  nameSprite?: THREE.Sprite;
  color: number;
  constructor(public id: string, color: number) {
    this.color = color;
    const mat = new THREE.MeshStandardMaterial({ color });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mat);
  }
}

export class RemotesManager {
  private remotes = new Map<string, Remote>();
  private scene: THREE.Scene;
  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  applySnapshot(snap: ServerSnapshot, excludeId?: string) {
    const ids = new Set(snap.players.filter(p => p.id !== excludeId).map((p) => p.id));

    // Remove stale
    for (const [id, r] of this.remotes) {
      if (!ids.has(id)) {
        this.scene.remove(r.mesh);
        this.remotes.delete(id);
      }
    }

    // Upsert
    for (const p of snap.players) {
      if (p.id === excludeId) continue;
      if (!this.remotes.has(p.id)) {
        const r = new Remote(p.id, p.color);
        this.remotes.set(p.id, r);
        this.scene.add(r.mesh);
        // Add simple name sprite
        r.nameSprite = makeNameSprite(p.name);
        r.nameSprite.position.set(0, 0.4 + 0.12, 0);
        r.mesh.add(r.nameSprite);
      }
      const r = this.remotes.get(p.id)!;
      const v = new THREE.Vector3(p.position[0], p.position[1], p.position[2]);
      const q = p.quaternion ? new THREE.Quaternion(p.quaternion[0], p.quaternion[1], p.quaternion[2], p.quaternion[3]) : undefined;
      r.samples.push({ t: snap.t, position: v, quat: q });
      if (r.samples.length > 10) r.samples.shift();
    }
  }

  update(renderTime: number) {
    for (const r of this.remotes.values()) {
      // Find two samples around renderTime
      const s = r.samples;
      if (s.length === 0) continue;
      // Ensure monotonic
      s.sort((a, b) => a.t - b.t);
      let a = s[0], b = s[s.length - 1];
      for (let i = 0; i < s.length - 1; i++) {
        if (s[i].t <= renderTime && s[i + 1].t >= renderTime) {
          a = s[i]; b = s[i + 1]; break;
        }
      }
      const span = Math.max(1, b.t - a.t);
      const t = THREE.MathUtils.clamp((renderTime - a.t) / span, 0, 1);
      r.mesh.position.lerpVectors(a.position, b.position, t);
      // Orientation slerp (if samples have quat)
      if (a.quat || b.quat) {
        const qa = a.quat ?? b.quat ?? new THREE.Quaternion();
        const qb = b.quat ?? a.quat ?? new THREE.Quaternion();
        r.mesh.quaternion.copy(qa).slerp(qb, t);
      }
    }
  }
}

function makeNameSprite(text: string) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = 40;
  ctx.font = `${font}px sans-serif`;
  const metrics = ctx.measureText(text);
  canvas.width = Math.ceil(metrics.width + 20);
  canvas.height = font + 16;
  // Re-get context after resizing canvas
  const ctx2 = canvas.getContext('2d')!;
  ctx2.font = `${font}px sans-serif`;
  ctx2.fillStyle = 'rgba(10,10,10,0.6)';
  ctx2.fillRect(0, 0, canvas.width, canvas.height);
  ctx2.fillStyle = '#eaeaea';
  ctx2.textBaseline = 'middle';
  ctx2.fillText(text, 10, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  const scale = 0.0035; // convert px → meters
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
  return sprite;
}
