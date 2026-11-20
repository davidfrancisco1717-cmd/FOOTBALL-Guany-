import * as THREE from 'three';
import { BALL_RADIUS } from './types';

export class Ball {
  public readonly group = new THREE.Group();
  public readonly mesh: THREE.Mesh;
  public readonly shadowMesh: THREE.Mesh;
  private texture: THREE.CanvasTexture;

  constructor(maxAnisotropy: number) {
    this.texture = this.createSoccerBallTexture(maxAnisotropy);

    const geo = new THREE.SphereGeometry(BALL_RADIUS, 24, 24);
    const mat = new THREE.MeshStandardMaterial({
      map: this.texture,
      roughness: 0.42,
      metalness: 0.05,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.position.y = BALL_RADIUS;

    // Grounded contact shadow disc directly beneath the ball
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 64;
    shadowCanvas.height = 64;
    const sCtx = shadowCanvas.getContext('2d')!;
    const grad = sCtx.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 64, 64);

    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowGeo = new THREE.PlaneGeometry(BALL_RADIUS * 2.7, BALL_RADIUS * 2.7);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.65,
    });
    this.shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowMesh.position.y = 0.015;

    this.group.add(this.mesh, this.shadowMesh);
  }

  private createSoccerBallTexture(maxAnisotropy: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 512, 256);

    // Classic pentagon pattern across equirectangular UV
    const drawPentagon = (cx: number, cy: number, r: number, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    };

    // Panel seam lines
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    for (let x = 0; x <= 512; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
    for (let y = 0; y <= 256; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }

    const centers: [number, number, number][] = [
      [64, 64, 22],
      [192, 64, 22],
      [320, 64, 22],
      [448, 64, 22],
      [128, 128, 24],
      [256, 128, 24],
      [384, 128, 24],
      [0, 128, 24],
      [512, 128, 24],
      [64, 192, 22],
      [192, 192, 22],
      [320, 192, 22],
      [448, 192, 22],
    ];
    centers.forEach(([cx, cy, r]) => drawPentagon(cx, cy, r, '#0f172a'));

    // Accent stripe band
    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 128);
    ctx.lineTo(512, 128);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    return tex;
  }

  public syncTransform(position: THREE.Vector3, quaternion: THREE.Quaternion): void {
    this.mesh.position.copy(position);
    this.mesh.quaternion.copy(quaternion);

    this.shadowMesh.position.set(position.x, 0.015, position.z);
    const heightFactor = THREE.MathUtils.clamp(1 - (position.y - BALL_RADIUS) * 0.16, 0.35, 1);
    this.shadowMesh.scale.setScalar(heightFactor);
    (this.shadowMesh.material as THREE.MeshBasicMaterial).opacity = 0.65 * heightFactor;
  }
}
