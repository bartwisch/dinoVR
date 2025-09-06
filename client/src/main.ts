import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { initXR } from './xr/session';
import { connectSocket } from './net/client';

// Basic scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101318);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 3);

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

// Lights
const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);
const dir = new THREE.DirectionalLight(0xffffff, 0.6);
dir.position.set(1, 2, 1);
scene.add(dir);

// Floor grid (reference)
const grid = new THREE.GridHelper(20, 20, 0x224466, 0x223344);
grid.position.y = 0;
scene.add(grid);

// Local player cube (centered)
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(0.4, 0.4, 0.4),
  new THREE.MeshStandardMaterial({ color: 0x4cc3ff })
);
cube.position.set(0, 1.2, 0);
scene.add(cube);

// Resize handling
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Networking (dev): connect and show status
const wsEl = document.getElementById('ws')!;
const socket = connectSocket();
socket.on('connect', () => (wsEl.textContent = `connected:${socket.id}`));
socket.on('disconnect', () => (wsEl.textContent = 'disconnected'));

// XR session init
await initXR(renderer);

// Animate
renderer.setAnimationLoop(() => {
  // idle spin for the cube, just to show rendering
  cube.rotation.y += 0.01;
  renderer.render(scene, camera);
});

