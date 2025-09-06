import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { initXR } from './xr/session';
import { XRInput } from './xr/input';
import { Locomotion } from './xr/locomotion';
import { RemotesManager, type ServerSnapshot } from './scene/remotes';
import { connectSocket } from './net/client';
import { TimeSync } from './net/time';

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

// Position camera for third-person view (behind and above the player)
camera.position.set(0, 0.4, -3); // Behind and slightly above relative to rig
camera.lookAt(0, -0.4, 0); // Look forward at player height

rig.add(camera);
scene.add(rig);

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dir = new THREE.DirectionalLight(0xffffff, 0.6);
dir.position.set(1, 2, 1); scene.add(dir);

// Reference grid
const grid = new THREE.GridHelper(20, 20, 0x224466, 0x223344); grid.position.y = 0; scene.add(grid);

// Global controller state for sharing between render loop and input sampling
let currentControllers: {
  left?: { position: [number, number, number]; quaternion: [number, number, number, number] };
  right?: { position: [number, number, number]; quaternion: [number, number, number, number] };
} | undefined;

// Managers
const input = new XRInput();
const locomotion = new Locomotion(rig);
const remotes = new RemotesManager(scene);

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
  faceIndicator.position.set(0, 0.1, 0.2); // Position on front face, slightly up
  localPlayer.add(faceIndicator);
  
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
  if (s.turn) {
    rig.rotateY(THREE.MathUtils.degToRad(s.turn));
  }
  const thrustVec = new THREE.Vector3().fromArray(s.thrust);
  locomotion.step(thrustVec, s.fast, dt);

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
