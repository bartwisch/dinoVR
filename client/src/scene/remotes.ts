import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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

// Global loader and model cache
const gltfLoader = new GLTFLoader();
let cowboyModel: THREE.Group | null = null;
let cowboyAnimations: THREE.AnimationClip[] = [];

// Load the cowboy model once
async function loadCowboyModel(): Promise<{ model: THREE.Group; animations: THREE.AnimationClip[] }> {
  if (cowboyModel) {
    return { model: cowboyModel.clone(), animations: cowboyAnimations };
  }
  
  try {
    // Import the GLB file - Vite will handle the path resolution
    const gltf = await gltfLoader.loadAsync(new URL('../assets/cowboy1.glb', import.meta.url).href);
    cowboyModel = gltf.scene;
    cowboyAnimations = gltf.animations || [];
    
    // Scale and position the model appropriately
    cowboyModel.scale.setScalar(0.01); // Adjust scale as needed
    
    return { model: cowboyModel.clone(), animations: cowboyAnimations };
  } catch (error) {
    console.error('Failed to load cowboy model:', error);
    // Fallback to cube if model fails to load
    const fallback = new THREE.Group();
    fallback.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x888888 })));
    return { model: fallback, animations: [] };
  }
}

class Remote {
  mesh: THREE.Group;
  samples: Sample[] = [];
  nameSprite?: THREE.Sprite;
  color: number;
  mixer?: THREE.AnimationMixer;
  walkAction?: THREE.AnimationAction;
  lastPosition = new THREE.Vector3();
  isMoving = false;

  constructor(public id: string, color: number) {
    this.color = color;
    this.mesh = new THREE.Group();
    
    // Initialize with a placeholder until model loads
    const placeholder = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.4, 0.4), 
      new THREE.MeshStandardMaterial({ color })
    );
    this.mesh.add(placeholder);
    
    // Load the cowboy model asynchronously
    this.loadModel(color);
  }

  private async loadModel(color: number) {
    const { model, animations } = await loadCowboyModel();
    
    // Remove placeholder
    this.mesh.clear();
    
    // Add the loaded model
    this.mesh.add(model);
    
    // Apply color tint to the model materials
    model.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(mat => {
            if (mat instanceof THREE.MeshStandardMaterial) {
              mat.color.multiplyScalar(0.7).add(new THREE.Color(color).multiplyScalar(0.3));
            }
          });
        } else if (child.material instanceof THREE.MeshStandardMaterial) {
          child.material.color.multiplyScalar(0.7).add(new THREE.Color(color).multiplyScalar(0.3));
        }
      }
    });
    
    // Set up animations
    if (animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(model);
      
      // Find walk animation (look for common names)
      const walkClip = animations.find(clip => 
        clip.name.toLowerCase().includes('walk') || 
        clip.name.toLowerCase().includes('run') ||
        clip.name.toLowerCase().includes('move')
      ) || animations[0]; // fallback to first animation
      
      if (walkClip) {
        this.walkAction = this.mixer.clipAction(walkClip);
        this.walkAction.setLoop(THREE.LoopRepeat, Infinity);
      }
    }
  }

  update(deltaTime: number) {
    if (this.mixer) {
      // Check if player is moving
      const currentPosition = this.mesh.position;
      const movement = currentPosition.distanceTo(this.lastPosition);
      const isMoving = movement > 0.01; // Threshold for movement detection
      
      if (isMoving !== this.isMoving) {
        this.isMoving = isMoving;
        
        if (this.walkAction) {
          if (isMoving) {
            this.walkAction.play();
          } else {
            this.walkAction.stop();
          }
        }
      }
      
      this.lastPosition.copy(currentPosition);
      this.mixer.update(deltaTime);
    }
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

  update(renderTime: number, deltaTime: number = 0.016) {
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
      
      // Update animations
      r.update(deltaTime);
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
