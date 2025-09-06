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
rig.position.set(0, 1.6, 3);

// Position camera for third-person view (behind and above the player)
camera.position.set(0, 1.5, 3); // Slightly behind and up
camera.lookAt(0, 1.2, 0); // Look at player height

rig.add(camera);
scene.add(rig);

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dir = new THREE.DirectionalLight(0xffffff, 0.6);
dir.position.set(1, 2, 1); scene.add(dir);

// Reference grid
const grid = new THREE.GridHelper(20, 20, 0x224466, 0x223344); grid.position.y = 0; scene.add(grid);

// Managers
const input = new XRInput();
const locomotion = new Locomotion(rig);
const remotes = new RemotesManager(scene);

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
  socket.emit('state_input', { t: Date.now(), thrust: state.thrust, fast: state.fast, turn: state.turn, quat: state.quat });
}, 33);

// Animation loop
const last = { t: performance.now() };
renderer.setAnimationLoop(() => {
  const nowPerf = performance.now();
  const dt = Math.min(0.05, (nowPerf - last.t) / 1000);
  last.t = nowPerf;

  // Local prediction
  const s = input.sample(camera, renderer.xr.getSession?.() || undefined);
  if (s.turn) {
    rig.rotateY(THREE.MathUtils.degToRad(s.turn));
  }
  const thrustVec = new THREE.Vector3().fromArray(s.thrust);
  locomotion.step(thrustVec, s.fast, dt);

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
