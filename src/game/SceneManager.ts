import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GameSettings, StadiumTime } from './types';

export function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class SceneManager {
  public readonly scene: THREE.Scene;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly isSoftwareGl: boolean;
  public readonly maxAnisotropy: number;

  private sunLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private envTexture: THREE.Texture | null = null;
  private container: HTMLElement;
  private currentStadiumTime: StadiumTime = 'day';

  constructor(container: HTMLElement, settings: GameSettings) {
    this.container = container;
    this.isSoftwareGl = detectSoftwareWebGL();

    this.scene = new THREE.Scene();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && settings.quality !== 'low',
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    this.maxAnisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    container.appendChild(this.renderer.domElement);

    // Mandatory studio environment reflection (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTexture;
    pmremGenerator.dispose();

    // 3-point stadium lighting rig (only 1 shadow caster for mobile performance)
    this.hemiLight = new THREE.HemisphereLight(0xa5d8ff, 0x2b5a27, 0.72);
    this.hemiLight.position.set(0, 50, 0);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff4d6, 1.9);
    this.sunLight.position.set(28, 42, 22);
    this.sunLight.castShadow = true;
    const d = 44;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = 32;
    this.sunLight.shadow.camera.bottom = -32;
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 120;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.03;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.fillLight = new THREE.DirectionalLight(0xbbe0ff, 0.55);
    this.fillLight.position.set(-28, 24, -24);
    this.scene.add(this.fillLight);

    this.applySettings(settings);
    this.setStadiumTime('day', settings);
  }

  public applySettings(settings: GameSettings): void {
    const qualityRatio =
      settings.quality === 'high' ? 2 : settings.quality === 'medium' ? 1.5 : 1;
    const pixelRatio = this.isSoftwareGl
      ? 1
      : Math.min(window.devicePixelRatio || 1, qualityRatio);
    this.renderer.setPixelRatio(pixelRatio);

    const shadowsEnabled = !this.isSoftwareGl && settings.shadows && settings.quality !== 'low';
    this.renderer.shadowMap.enabled = shadowsEnabled;
    this.sunLight.castShadow = shadowsEnabled;

    const shadowSize =
      settings.quality === 'high' ? 2048 : settings.quality === 'medium' ? 1024 : 512;
    if (this.sunLight.shadow.mapSize.width !== shadowSize) {
      this.sunLight.shadow.mapSize.set(shadowSize, shadowSize);
      this.sunLight.shadow.map?.dispose();
      this.sunLight.shadow.map = null;
    }

    this.updateFog(this.currentStadiumTime, settings.renderDistance);
  }

  public setStadiumTime(time: StadiumTime, settings: GameSettings): void {
    this.currentStadiumTime = time;
    if (time === 'day') {
      const skyColor = new THREE.Color('#7ec2f4');
      this.scene.background = skyColor;
      this.hemiLight.color.set('#bce3ff');
      this.hemiLight.groundColor.set('#275422');
      this.hemiLight.intensity = 0.85;

      this.sunLight.color.set('#fff1d0');
      this.sunLight.intensity = 2.05;
      this.sunLight.position.set(28, 44, 24);

      this.fillLight.color.set('#c4e3ff');
      this.fillLight.intensity = 0.55;
      this.renderer.toneMappingExposure = 1.08;
    } else {
      const nightSky = new THREE.Color('#091322');
      this.scene.background = nightSky;
      this.hemiLight.color.set('#38598a');
      this.hemiLight.groundColor.set('#142a1a');
      this.hemiLight.intensity = 0.62;

      // Crisp stadium floodlight illumination
      this.sunLight.color.set('#e8f3ff');
      this.sunLight.intensity = 2.15;
      this.sunLight.position.set(22, 38, 28);

      this.fillLight.color.set('#9ec5ff');
      this.fillLight.intensity = 0.85;
      this.renderer.toneMappingExposure = 1.15;
    }

    this.updateFog(time, settings.renderDistance);
  }

  private updateFog(time: StadiumTime, distance: GameSettings['renderDistance']): void {
    const color = time === 'day' ? 0x7ec2f4 : 0x091322;
    const near = distance === 'short' ? 52 : distance === 'medium' ? 75 : 105;
    const far = distance === 'short' ? 125 : distance === 'medium' ? 175 : 240;
    this.scene.fog = new THREE.Fog(color, near, far);
  }

  public resize(camera: THREE.PerspectiveCamera): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    if (width <= 0 || height <= 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public render(camera: THREE.PerspectiveCamera): void {
    this.renderer.render(this.scene, camera);
  }

  public dispose(): void {
    this.envTexture?.dispose();
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
