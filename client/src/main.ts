import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { initXR } from './xr/session';
import { XRInput } from './xr/input';
import { Locomotion } from './xr/locomotion';
import { RemotesManager, type ServerSnapshot } from './scene/remotes';
import { connectSocket } from './net/client';
import { TimeSync } from './net/time';
import { getFlag } from './util/flags';
import { PlayerController } from './player/controller';
import { ControllerHUD } from './xr/hud';

// Scene & renderer
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101318);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

// Rig: move the rig to locomote; camera is a child
const rig = new THREE.Group();
rig.position.set(0, 1.6, 0); // Center the rig at player position

// Feature flag for new controller path
const USE_NEW_CONTROLLER = getFlag('newController', false);

// Simple camera rotation variables
let cameraYaw = 0;   // Horizontal rotation
let cameraPitch = 0; // Vertical rotation

// Position camera higher and further back from player
camera.position.set(0, 2.5, 4); // x=0 (centered), y=2.5 (higher), z=4 (further back)
camera.lookAt(0, 1.6, 0); // Look at player head height

rig.add(camera);
scene.add(rig);

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(10, 20, 5); 
dir.castShadow = true;
dir.shadow.camera.left = -50;
dir.shadow.camera.right = 50;
dir.shadow.camera.top = 50;
dir.shadow.camera.bottom = -50;
dir.shadow.camera.near = 0.1;
dir.shadow.camera.far = 200;
dir.shadow.mapSize.width = 2048;
dir.shadow.mapSize.height = 2048;
scene.add(dir);

// Enable shadows
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Generate procedural landscape
function generateLandscape() {
  // Create ground plane with grass texture
  const groundSize = 100;
  const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize, 50, 50);
  
  // Add some height variation to the ground
  const groundVertices = groundGeometry.attributes.position;
  for (let i = 0; i < groundVertices.count; i++) {
    const x = groundVertices.getX(i);
    const z = groundVertices.getZ(i);
    const height = Math.sin(x * 0.1) * Math.cos(z * 0.1) * 0.5 + Math.random() * 0.2;
    groundVertices.setY(i, height);
  }
  groundGeometry.computeVertexNormals();
  
  const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x4a5d23 }); // Grass green
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  
  // Generate trees randomly across the landscape
  const treeCount = 50;
  for (let i = 0; i < treeCount; i++) {
    const tree = createTree();
    const x = (Math.random() - 0.5) * groundSize * 0.8;
    const z = (Math.random() - 0.5) * groundSize * 0.8;
    
    // Don't place trees too close to center (where players spawn)
    if (Math.sqrt(x * x + z * z) > 5) {
      tree.position.set(x, 0, z);
      scene.add(tree);
    }
  }
  
  // Add some scattered rocks
  const rockCount = 20;
  for (let i = 0; i < rockCount; i++) {
    const rock = createRock();
    const x = (Math.random() - 0.5) * groundSize * 0.7;
    const z = (Math.random() - 0.5) * groundSize * 0.7;
    rock.position.set(x, Math.random() * 0.3, z);
    scene.add(rock);
  }
}

function createTree() {
  const tree = new THREE.Group();
  
  // Tree trunk
  const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.4, 4, 8);
  const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 }); // Brown
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = 2;
  trunk.castShadow = true;
  tree.add(trunk);
  
  // Tree crown (leaves)
  const crownGeometry = new THREE.SphereGeometry(2.5, 8, 6);
  const crownMaterial = new THREE.MeshLambertMaterial({ color: 0x228b22 }); // Forest green
  const crown = new THREE.Mesh(crownGeometry, crownMaterial);
  crown.position.y = 5;
  crown.castShadow = true;
  crown.scale.setScalar(0.8 + Math.random() * 0.4); // Random size variation
  tree.add(crown);
  
  return tree;
}

function createRock() {
  const rockGeometry = new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.5, 0);
  const rockMaterial = new THREE.MeshLambertMaterial({ color: 0x666666 }); // Gray
  const rock = new THREE.Mesh(rockGeometry, rockMaterial);
  rock.castShadow = true;
  rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  return rock;
}

generateLandscape();

// Global controller state for sharing between render loop and input sampling
let currentControllers: {
  left?: { position: [number, number, number]; quaternion: [number, number, number, number] };
  right?: { position: [number, number, number]; quaternion: [number, number, number, number] };
} | undefined;

// Managers
const input = new XRInput();
const locomotion = new Locomotion(rig); // legacy path
const remotes = new RemotesManager(scene);
const hud = new ControllerHUD(camera);

// HUD toggle functionality
let hudVisible = true;
let hudTogglePressed = false;

// Listen for 'H' key to toggle HUD visibility
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'h' && !hudTogglePressed) {
      hudTogglePressed = true;
      hudVisible = !hudVisible;
      hud.setVisible(hudVisible);
    }
  });
  
  window.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() === 'h') {
      hudTogglePressed = false;
    }
  });
}

// New controller modules (used when flag is on)
let playerCtl: PlayerController | null = null;

if (USE_NEW_CONTROLLER) {
  playerCtl = new PlayerController(rig);
}

// Local player representation (for third-person view)
let localPlayer: THREE.Group | null = null;
let localLeftController: THREE.Mesh | null = null;
let localRightController: THREE.Mesh | null = null;

function createLocalPlayer() {
  localPlayer = new THREE.Group();
  
  // Local player cube (green to distinguish from remotes)
  const cubeGeometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  const cubeMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
  const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
  localPlayer.add(cube);
  
  // Add face indicator for local player - bright yellow to distinguish from white
  const faceGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  const faceMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00 }); // Yellow face indicator
  const faceIndicator = new THREE.Mesh(faceGeometry, faceMaterial);
  faceIndicator.position.set(0, -0.1, 0.2); // Position on front face, slightly down (like a mouth)
  localPlayer.add(faceIndicator);
  
  // Add eyes for local player - dark blue to distinguish from black
  const eyeGeometry = new THREE.BoxGeometry(0.025, 0.025, 0.025);
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000088 }); // Dark blue eyes
  
  const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  leftEye.position.set(-0.05, 0.05, 0.21); // Left eye (slightly forward than mouth)
  localPlayer.add(leftEye);
  
  const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  rightEye.position.set(0.05, 0.05, 0.21); // Right eye (slightly forward than mouth)
  localPlayer.add(rightEye);
  
  // Local controllers
  const leftGeometry = new THREE.BoxGeometry(0.05, 0.15, 0.05);
  const leftMaterial = new THREE.MeshStandardMaterial({ color: 0x0088ff });
  localLeftController = new THREE.Mesh(leftGeometry, leftMaterial);
  localPlayer.add(localLeftController);
  
  const rightGeometry = new THREE.BoxGeometry(0.05, 0.15, 0.05);
  const rightMaterial = new THREE.MeshStandardMaterial({ color: 0xff0088 });
  localRightController = new THREE.Mesh(rightGeometry, rightMaterial);
  localPlayer.add(localRightController);
  
  scene.add(localPlayer);
}

createLocalPlayer();

// Networking (dev)
const wsEl = document.getElementById('ws')!;
const socket = connectSocket();
const time = new TimeSync(socket);
socket.on('connect', () => (wsEl.textContent = `connected:${socket.id}`));
socket.on('disconnect', () => (wsEl.textContent = 'disconnected'));
socket.on('snapshot', (snap: ServerSnapshot) => {
  remotes.applySnapshot(snap, socket.id);
  // Feed local authoritative position to PlayerController for gentle reconciliation
  if (USE_NEW_CONTROLLER && playerCtl) {
    const me = snap.players.find(p => p.id === socket.id);
    if (me) playerCtl.applyAuthoritative(me.position);
  }
});

// XR session init
await initXR(renderer);

// Emit inputs at 30Hz
setInterval(() => {
  const session = renderer.xr.getSession?.();
  const state = input.sample(camera, session || undefined);
  socket.emit('state_input', { 
    t: Date.now(), 
    thrust: state.thrust, 
    fast: state.fast, 
    turn: state.turn, 
    quat: state.quat,
    controllers: currentControllers // Use controllers from render loop
  });
}, 33);

// Animation loop
const last = { t: performance.now() };
renderer.setAnimationLoop((timestamp, frame) => {
  const nowPerf = performance.now();
  const dt = Math.min(0.05, (nowPerf - last.t) / 1000);
  last.t = nowPerf;

  // Update controller positions from XR frame
  const session = renderer.xr.getSession();
  if (session && frame) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    if (referenceSpace) {
      const controllers: typeof currentControllers = {};
      
      for (const inputSource of session.inputSources) {
        if (inputSource.gripSpace) {
          const pose = frame.getPose(inputSource.gripSpace, referenceSpace);
          if (pose) {
            const pos = pose.transform.position;
            const ori = pose.transform.orientation;
            const controllerData = {
              position: [pos.x, pos.y, pos.z] as [number, number, number],
              quaternion: [ori.x, ori.y, ori.z, ori.w] as [number, number, number, number]
            };
            
            if (inputSource.handedness === 'left') {
              controllers.left = controllerData;
            } else if (inputSource.handedness === 'right') {
              controllers.right = controllerData;
            }
          }
        }
      }
      
      currentControllers = Object.keys(controllers).length > 0 ? controllers : undefined;
      
      // Debug logging
      if (currentControllers) {
        console.log('Controllers detected:', {
          left: currentControllers.left ? 'YES' : 'NO',
          right: currentControllers.right ? 'YES' : 'NO'
        });
      }
    }
  } else {
    // Desktop fallback - keep mock controller data (symmetrical positions)
    currentControllers = {
      left: { position: [-0.4, -1.0, -0.2], quaternion: [0, 0, 0, 1] },
      right: { position: [0.4, -1.0, -0.2], quaternion: [0, 0, 0, 1] }
    };
  }

  // Local prediction
  const s = input.sample(camera, renderer.xr.getSession?.() || undefined);
  
  // Update HUD with current button states
  hud.update(s.controllerButtons);
  
  // Debug: Log all inputs
  if (s.thrust[0] !== 0 || s.thrust[1] !== 0 || s.thrust[2] !== 0) {
    console.log('Player movement (from RIGHT stick):', s.thrust);
  }
  if (s.cameraMove[0] !== 0 || s.cameraMove[1] !== 0) {
    console.log('Camera input (from LEFT stick):', s.cameraMove);
  }
  
  if (s.turn) {
    rig.rotateY(THREE.MathUtils.degToRad(s.turn));
  }
  if (USE_NEW_CONTROLLER && playerCtl) {
    playerCtl.step(dt, { thrust: s.thrust, fast: s.fast });
  } else {
    const thrustVec = new THREE.Vector3().fromArray(s.thrust);
    locomotion.step(thrustVec, s.fast, dt);
  }

  // Simple direct camera control with LEFT thumbstick (SWAPPED)
  if (s.cameraMove[0] !== 0 || s.cameraMove[1] !== 0) {
    const sensitivity = 2.0; // Adjust for sensitivity
    const maxPitch = Math.PI / 2 - 0.1; // Prevent looking straight up/down
    
    // Debug logging
    console.log('🎥 CAMERA CONTROL (LEFT stick):', {
      moveX: s.cameraMove[0],
      moveY: s.cameraMove[1],
      oldYaw: cameraYaw,
      oldPitch: cameraPitch
    });
    
    // Apply thumbstick input directly to camera rotation
    cameraYaw += s.cameraMove[0] * sensitivity * dt; // Right = positive yaw
    cameraPitch -= s.cameraMove[1] * sensitivity * dt; // Up = negative pitch (inverted)
    
    // Clamp pitch to prevent camera flip
    cameraPitch = THREE.MathUtils.clamp(cameraPitch, -maxPitch, maxPitch);
    
    // Apply rotations to camera
    camera.rotation.set(cameraPitch, cameraYaw, 0);
    
    console.log('✅ Camera rotation applied:', {
      newYaw: cameraYaw,
      newPitch: cameraPitch,
      cameraRotation: { x: camera.rotation.x, y: camera.rotation.y, z: camera.rotation.z },
      cameraPosition: { x: camera.position.x, y: camera.position.y, z: camera.position.z }
    });
  }

  // Update local player position and controllers
  if (localPlayer) {
    // Position local player at rig position
    localPlayer.position.copy(rig.position);
    localPlayer.rotation.copy(rig.rotation);
    
    // Update local controllers
    if (currentControllers && localLeftController && localRightController) {
      // Left controller
      if (currentControllers.left) {
        localLeftController.visible = true;
        localLeftController.position.set(
          currentControllers.left.position[0],
          currentControllers.left.position[1] - 1.4, // Lower by 1.4 meters
          currentControllers.left.position[2]
        );
        localLeftController.quaternion.set(
          currentControllers.left.quaternion[0],
          currentControllers.left.quaternion[1],
          currentControllers.left.quaternion[2],
          currentControllers.left.quaternion[3]
        );
      } else {
        localLeftController.visible = false;
      }
      
      // Right controller
      if (currentControllers.right) {
        localRightController.visible = true;
        localRightController.position.set(
          currentControllers.right.position[0],
          currentControllers.right.position[1] - 1.4, // Lower by 1.4 meters
          currentControllers.right.position[2]
        );
        localRightController.quaternion.set(
          currentControllers.right.quaternion[0],
          currentControllers.right.quaternion[1],
          currentControllers.right.quaternion[2],
          currentControllers.right.quaternion[3]
        );
      } else {
        localRightController.visible = false;
      }
    } else {
      // Hide controllers if no data
      if (localLeftController) localLeftController.visible = false;
      if (localRightController) localRightController.visible = false;
    }
  }

  // Interpolate remotes with ~120ms delay; server timestamps use Date.now()
  remotes.update(time.now() - 120, dt);

  renderer.render(scene, camera);
});

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
