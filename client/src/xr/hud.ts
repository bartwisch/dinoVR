import * as THREE from 'three';
import { ControllerButtonStates, ButtonState } from './input';

export class ControllerHUD {
  private hudGroup: THREE.Group;
  private leftButtonTexts: { [key: string]: THREE.Mesh } = {};
  private rightButtonTexts: { [key: string]: THREE.Mesh } = {};
  
  constructor(camera: THREE.Camera) {
    this.hudGroup = new THREE.Group();
    this.setupHUD();
    camera.add(this.hudGroup);
  }

  private setupHUD() {
    // Create canvas for text rendering
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    
    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    // Create material and geometry for HUD
    const material = new THREE.MeshBasicMaterial({ 
      map: texture, 
      transparent: true,
      alphaTest: 0.1
    });
    const geometry = new THREE.PlaneGeometry(1, 0.5);
    
    // Create mesh and position it in front of camera
    const hudMesh = new THREE.Mesh(geometry, material);
    hudMesh.position.set(0, -0.3, -0.8); // Position below and in front of camera
    hudMesh.name = 'controllerHUD';
    
    this.hudGroup.add(hudMesh);
  }

  private getHUDMesh(): THREE.Mesh {
    return this.hudGroup.getObjectByName('controllerHUD') as THREE.Mesh;
  }

  private drawControllerInfo(context: CanvasRenderingContext2D, buttons: ButtonState | undefined, x: number, y: number, label: string, color: string) {
    const lineHeight = 14;
    let currentY = y;

    // Create default button state for missing controllers
    const defaultButtons: ButtonState = {
      trigger: false,
      squeeze: false,
      thumbstick: false,
      buttonA: false,
      buttonB: false,
      touchpadPressed: false,
      thumbstickX: 0,
      thumbstickY: 0,
    };

    // Controller title
    context.fillStyle = buttons ? color : '#444444';
    const title = buttons ? `${label} ✓` : `${label} ✗`;
    context.strokeText(title, x, currentY);
    context.fillText(title, x, currentY);
    currentY += lineHeight + 2;

    const buttonsToShow = buttons || defaultButtons;
    
    // Show buttons (excluding thumbstick axes)
    Object.entries(buttonsToShow).forEach(([button, value]) => {
      if (button === 'thumbstickX' || button === 'thumbstickY') return; // Skip axes, we'll show them separately
      
      const pressed = typeof value === 'boolean' ? value : false;
      context.fillStyle = buttons && pressed ? '#00ff00' : '#666666';
      const shortName = this.getShortButtonName(button);
      const text = `${shortName}: ${buttons && pressed ? 'ON' : 'OFF'}`;
      context.strokeText(text, x, currentY);
      context.fillText(text, x, currentY);
      currentY += lineHeight;
    });

    // Show thumbstick direction
    if (buttons) {
      const stickX = buttonsToShow.thumbstickX || 0;
      const stickY = buttonsToShow.thumbstickY || 0;
      const magnitude = Math.sqrt(stickX * stickX + stickY * stickY);
      
      context.fillStyle = magnitude > 0.1 ? '#ffff00' : '#666666'; // Yellow when active
      let directionText = 'stick: center';
      
      if (magnitude > 0.1) {
        // Convert to direction
        const angle = Math.atan2(-stickY, stickX) * 180 / Math.PI; // Negative Y for correct direction
        let direction = '';
        
        if (angle >= -22.5 && angle < 22.5) direction = 'right';
        else if (angle >= 22.5 && angle < 67.5) direction = 'up-right';
        else if (angle >= 67.5 && angle < 112.5) direction = 'up';
        else if (angle >= 112.5 && angle < 157.5) direction = 'up-left';
        else if (angle >= 157.5 || angle < -157.5) direction = 'left';
        else if (angle >= -157.5 && angle < -112.5) direction = 'down-left';
        else if (angle >= -112.5 && angle < -67.5) direction = 'down';
        else if (angle >= -67.5 && angle < -22.5) direction = 'down-right';
        
        directionText = `stick: ${direction}`;
      }
      
      context.strokeText(directionText, x, currentY);
      context.fillText(directionText, x, currentY);
    } else {
      context.fillStyle = '#666666';
      context.strokeText('stick: ---', x, currentY);
      context.fillText('stick: ---', x, currentY);
    }
  }

  private getShortButtonName(button: string): string {
    const shortNames: { [key: string]: string } = {
      'trigger': 'trig',
      'squeeze': 'grip',
      'thumbstick': 'stick',
      'buttonA': 'A',
      'buttonB': 'B',
      'touchpadPressed': 'pad'
    };
    return shortNames[button] || button;
  }

  private updateCanvas(leftButtons?: ButtonState, rightButtons?: ButtonState) {
    const hudMesh = this.getHUDMesh();
    if (!hudMesh) return;

    const material = hudMesh.material as THREE.MeshBasicMaterial;
    const texture = material.map as THREE.CanvasTexture;
    const canvas = texture.image as HTMLCanvasElement;
    const context = canvas.getContext('2d')!;

    // Clear canvas
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // Set font and style - smaller text
    context.font = '12px monospace';
    context.strokeStyle = 'black';
    context.lineWidth = 1;

    // Left controller - top left
    this.drawControllerInfo(context, leftButtons, 10, 20, 'LEFT', '#66ccff');
    
    // Right controller - top right
    this.drawControllerInfo(context, rightButtons, canvas.width - 120, 20, 'RIGHT', '#ff66cc');

    // Update texture
    texture.needsUpdate = true;
  }

  update(controllerButtons: ControllerButtonStates) {
    this.updateCanvas(controllerButtons.left, controllerButtons.right);
  }

  setVisible(visible: boolean) {
    this.hudGroup.visible = visible;
  }

  destroy() {
    // Clean up resources
    this.hudGroup.parent?.remove(this.hudGroup);
    
    const hudMesh = this.getHUDMesh();
    if (hudMesh) {
      const material = hudMesh.material as THREE.MeshBasicMaterial;
      if (material.map) {
        material.map.dispose();
      }
      material.dispose();
      hudMesh.geometry.dispose();
    }
  }
}