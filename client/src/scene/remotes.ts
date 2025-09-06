import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

type Vec3 = [number, number, number];

export interface RemotePlayerState {
  id: string;
  position: Vec3;
  quaternion?: [number, number, number, number];
  color: number;
  name: string;
  controllers?: {
    left?: { position: Vec3; quaternion: [number, number, number, number] };
    right?: { position: Vec3; quaternion: [number, number, number, number] };
  };
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
    // Return a proper deep clone of the model
    return { 
      model: cowboyModel.clone(true), // true = recursive clone
      animations: cowboyAnimations 
    };
  }
  
  try {
    // Import the GLB file - Vite will handle the path resolution
    const gltf = await gltfLoader.loadAsync(new URL('../assets/cowboy1.glb', import.meta.url).href);
    cowboyModel = gltf.scene;
    cowboyAnimations = gltf.animations || [];
    
    console.log('Cowboy model loaded with animations:', cowboyAnimations.map(clip => clip.name));
    
    // Scale and position the model appropriately
    cowboyModel.scale.setScalar(0.01); // Adjust scale as needed
    
    return { 
      model: cowboyModel.clone(true), // true = recursive clone
      animations: cowboyAnimations 
    };
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
  
  // Controller visual representations
  leftController?: THREE.Mesh;
  rightController?: THREE.Mesh;

  constructor(public id: string, color: number) {
    this.color = color;
    this.mesh = new THREE.Group();
    
    // Use simple cube for debugging instead of GLB model
    const cubeGeometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const cubeMaterial = new THREE.MeshStandardMaterial({ color });
    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    this.mesh.add(cube);
    
    // Add face indicator - small cube on the front face
    const faceGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    const faceMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff }); // White face indicator
    const faceIndicator = new THREE.Mesh(faceGeometry, faceMaterial);
    faceIndicator.position.set(0, -0.1, 0.2); // Position on front face, slightly down (like a mouth)
    this.mesh.add(faceIndicator);
    
    // Add eyes - two small black cubes
    const eyeGeometry = new THREE.BoxGeometry(0.025, 0.025, 0.025);
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 }); // Black eyes
    
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.05, 0.05, 0.21); // Left eye (slightly forward than mouth)
    this.mesh.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.05, 0.05, 0.21); // Right eye (slightly forward than mouth)
    this.mesh.add(rightEye);
    
    // Create controller representations
    this.createControllers();
    
    console.log(`Player ${this.id} created as cube with color ${color.toString(16)}`);
    
    // Skip loading the cowboy model for debugging
    // this.loadModel(color);
  }

  private createControllers() {
    // Left controller (slightly different color - more blue)
    const leftGeometry = new THREE.BoxGeometry(0.05, 0.15, 0.05);
    const leftMaterial = new THREE.MeshStandardMaterial({ 
      color: new THREE.Color(this.color).multiplyScalar(0.8).add(new THREE.Color(0x0000ff).multiplyScalar(0.2))
    });
    this.leftController = new THREE.Mesh(leftGeometry, leftMaterial);
    this.mesh.add(this.leftController);
    
    // Right controller (slightly different color - more red)
    const rightGeometry = new THREE.BoxGeometry(0.05, 0.15, 0.05);
    const rightMaterial = new THREE.MeshStandardMaterial({ 
      color: new THREE.Color(this.color).multiplyScalar(0.8).add(new THREE.Color(0xff0000).multiplyScalar(0.2))
    });
    this.rightController = new THREE.Mesh(rightGeometry, rightMaterial);
    this.mesh.add(this.rightController);
    
    // Initially hide controllers
    this.leftController.visible = false;
    this.rightController.visible = false;
  }

  updateControllers(controllers?: RemotePlayerState['controllers']) {
    if (!controllers) {
      // Hide controllers if no data
      if (this.leftController) this.leftController.visible = false;
      if (this.rightController) this.rightController.visible = false;
      return;
    }

    // Show both controllers if any controller data exists
    const hasControllerData = (controllers.left || controllers.right);
    
    // Update left controller (swap: use right controller data for left visual, or fallback)
    if (this.leftController) {
      if (hasControllerData) {
        this.leftController.visible = true;
        const sourceData = controllers.right || controllers.left; // Use right data, or fallback to left
        const distance = 0.4; // Fixed distance from center
        this.leftController.position.set(
          -distance, // Left side at fixed distance
          sourceData!.position[1] - 1.4, // Lower by 1.4 meters
          sourceData!.position[2]  // Keep relative Z position
        );
        this.leftController.quaternion.set(
          sourceData!.quaternion[0],
          sourceData!.quaternion[1],
          sourceData!.quaternion[2],
          sourceData!.quaternion[3]
        );
      } else {
        this.leftController.visible = false;
      }
    }

    // Update right controller (swap: use left controller data for right visual, or fallback)
    if (this.rightController) {
      if (hasControllerData) {
        this.rightController.visible = true;
        const sourceData = controllers.left || controllers.right; // Use left data, or fallback to right
        const distance = 0.4; // Fixed distance from center
        this.rightController.position.set(
          distance, // Right side at fixed distance
          sourceData!.position[1] - 1.4, // Lower by 1.4 meters
          sourceData!.position[2]  // Keep relative Z position
        );
        this.rightController.quaternion.set(
          sourceData!.quaternion[0],
          sourceData!.quaternion[1],
          sourceData!.quaternion[2],
          sourceData!.quaternion[3]
        );
      } else {
        this.rightController.visible = false;
      }
    }
  }

  private async loadModel(color: number) {
    // Disabled for debugging - using cubes instead
    /* 
    const { model, animations } = await loadCowboyModel();
    
    // Remove placeholder
    this.mesh.clear();
    
    // Add the loaded model
    this.mesh.add(model);
    
    // Apply color tint to the model materials (clone materials to avoid shared references)
    model.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map(mat => {
            const clonedMat = mat.clone();
            if (clonedMat instanceof THREE.MeshStandardMaterial) {
              clonedMat.color.multiplyScalar(0.7).add(new THREE.Color(color).multiplyScalar(0.3));
            }
            return clonedMat;
          });
        } else {
          const clonedMat = child.material.clone();
          if (clonedMat instanceof THREE.MeshStandardMaterial) {
            clonedMat.color.multiplyScalar(0.7).add(new THREE.Color(color).multiplyScalar(0.3));
          }
          child.material = clonedMat;
        }
      }
    });
    
    // Set up animations
    if (animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(model);
      
      // Debug: log available animations
      console.log(`Player ${this.id} animations:`, animations.map(clip => clip.name));
      
      // Find walk animation (look for common names)
      const walkClip = animations.find(clip => 
        clip.name.toLowerCase().includes('walk') || 
        clip.name.toLowerCase().includes('run') ||
        clip.name.toLowerCase().includes('move') ||
        clip.name.toLowerCase().includes('idle')
      ) || animations[0]; // fallback to first animation
      
      if (walkClip) {
        console.log(`Player ${this.id} using animation:`, walkClip.name);
        this.walkAction = this.mixer.clipAction(walkClip);
        this.walkAction.setLoop(THREE.LoopRepeat, Infinity);
        // Start with a default pose or idle animation
        this.walkAction.play();
      }
    }
    */
  }

  update(deltaTime: number) {
    // Simplified update for cube debugging - no animations
    /*
    if (this.mixer) {
      // Update mixer regardless of movement
      this.mixer.update(deltaTime);
      
      // Check if player is moving (simple movement detection)
      const currentPosition = this.mesh.position;
      const movement = currentPosition.distanceTo(this.lastPosition);
      const isMoving = movement > 0.01; // Threshold for movement detection
      
      if (isMoving !== this.isMoving) {
        this.isMoving = isMoving;
        
        if (this.walkAction) {
          if (isMoving) {
            // Speed up animation when moving
            this.walkAction.setEffectiveTimeScale(1.0);
            console.log(`Player ${this.id} started walking`);
          } else {
            // Slow down animation when idle
            this.walkAction.setEffectiveTimeScale(0.5);
            console.log(`Player ${this.id} stopped walking`);
          }
        }
      }
      
      this.lastPosition.copy(currentPosition);
    }
    */
  }
}

export class RemotesManager {
  private remotes = new Map<string, Remote>();
  private scene: THREE.Scene;
  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  applySnapshot(snap: ServerSnapshot, excludeId?: string) {
    // Include all players including the local player for third-person view
    const ids = new Set(snap.players.map((p) => p.id));

    // Remove stale
    for (const [id, r] of this.remotes) {
      if (!ids.has(id)) {
        this.scene.remove(r.mesh);
        this.remotes.delete(id);
      }
    }

    // Upsert all players (including local player)
    for (const p of snap.players) {
      if (!this.remotes.has(p.id)) {
        const r = new Remote(p.id, p.color);
        this.remotes.set(p.id, r);
        this.scene.add(r.mesh);
        // Add simple name sprite
        r.nameSprite = makeNameSprite(p.name);
        r.nameSprite.position.set(0, 0.4 + 0.12, 0);
        r.mesh.add(r.nameSprite);
        
        // Mark local player for special treatment
        if (p.id === excludeId) {
          console.log(`Local player ${p.name} (${p.id}) added to scene for third-person view`);
          // Optionally add a special marker or different behavior for local player
        }
      }
      const r = this.remotes.get(p.id)!;
      const v = new THREE.Vector3(p.position[0], p.position[1], p.position[2]);
      const q = p.quaternion ? new THREE.Quaternion(p.quaternion[0], p.quaternion[1], p.quaternion[2], p.quaternion[3]) : undefined;
      r.samples.push({ t: snap.t, position: v, quat: q });
      if (r.samples.length > 10) r.samples.shift();
      
      // Update controllers
      r.updateControllers(p.controllers);
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
        const interpolatedQuat = new THREE.Quaternion().copy(qa).slerp(qb, t);
        
        // Apply coordinate system correction for VR -> Three.js
        // 1. Rotate 180° around Y axis to flip front/back and left/right
        const yCorrection = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
        
        // 2. Extract and invert pitch (X rotation) only
        const euler = new THREE.Euler().setFromQuaternion(interpolatedQuat, 'YXZ');
        euler.x = -euler.x; // Invert pitch only
        const pitchCorrectedQuat = new THREE.Quaternion().setFromEuler(euler);
        
        r.mesh.quaternion.copy(yCorrection).multiply(pitchCorrectedQuat);
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
