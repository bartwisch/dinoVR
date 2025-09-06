import type { WebGLRenderer } from 'three';

export async function initXR(_renderer: WebGLRenderer) {
  void _renderer;
  // Renderer XR already enabled by caller; ensure minimal setup.
  // Some browsers require a user gesture for entering VR; VRButton handles that.
  // No-op placeholder for future feature gating (foveation, features, etc.).
  return Promise.resolve();
}
