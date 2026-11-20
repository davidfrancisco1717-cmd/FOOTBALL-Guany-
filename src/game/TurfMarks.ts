import * as THREE from 'three';
import { Player } from './Player';
import { HALF_LENGTH, HALF_WIDTH } from './types';

const MAX_SCARS = 240;
const MAX_CLODS = 160;

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

interface ScarSlot {
  active: boolean;
  x: number;
  z: number;
  angle: number;
  width: number;
  length: number;
  age: number;
  maxAge: number;
  baseOpacity: number;
}

interface ClodSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  spinX: number;
  spinY: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  age: number;
  maxAge: number;
}

interface PlayerTrackState {
  lastStampX: number;
  lastStampZ: number;
  prevDirX: number;
  prevDirZ: number;
  hadDir: boolean;
  cooldown: number;
  wasTackling: boolean;
}

export class TurfMarks {
  public readonly group = new THREE.Group();

  private readonly scarGeo: THREE.PlaneGeometry;
  private readonly scarMat: THREE.MeshStandardMaterial;
  private readonly scarMesh: THREE.InstancedMesh;
  private readonly scarOpacityArray: Float32Array;
  private readonly scarOpacityAttr: THREE.InstancedBufferAttribute;
  private readonly scarTex: THREE.CanvasTexture;

  private readonly clodGeo: THREE.DodecahedronGeometry;
  private readonly clodMat: THREE.MeshStandardMaterial;
  private readonly clodMesh: THREE.InstancedMesh;

  private readonly scars: ScarSlot[] = [];
  private readonly clods: ClodSlot[] = [];
  private readonly trackMap = new Map<string, PlayerTrackState>();

  private scarCursor = 0;
  private clodCursor = 0;

  constructor(maxAnisotropy: number) {
    this.scarTex = this.createTurfScarTexture(maxAnisotropy);

    this.scarGeo = new THREE.PlaneGeometry(1, 1);
    this.scarGeo.rotateX(-Math.PI / 2);

    this.scarOpacityArray = new Float32Array(MAX_SCARS);
    this.scarOpacityAttr = new THREE.InstancedBufferAttribute(this.scarOpacityArray, 1);
    this.scarOpacityAttr.setUsage(THREE.DynamicDrawUsage);
    this.scarGeo.setAttribute('aOpacity', this.scarOpacityAttr);

    this.scarMat = new THREE.MeshStandardMaterial({
      map: this.scarTex,
      transparent: true,
      depthWrite: false,
      roughness: 0.96,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.scarMat.customProgramCacheKey = () => 'turf-scar-opacity-v1';
    this.scarMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float aOpacity;\nvarying float vInstanceOpacity;',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvInstanceOpacity = aOpacity;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying float vInstanceOpacity;',
        )
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\ndiffuseColor.a *= vInstanceOpacity;',
        );
    };

    this.scarMesh = new THREE.InstancedMesh(this.scarGeo, this.scarMat, MAX_SCARS);
    this.scarMesh.receiveShadow = true;
    this.scarMesh.frustumCulled = false;
    this.scarMesh.renderOrder = 2;

    for (let i = 0; i < MAX_SCARS; i++) {
      this.scars.push({
        active: false,
        x: 0,
        z: 0,
        angle: 0,
        width: 0.6,
        length: 0.9,
        age: 0,
        maxAge: 12,
        baseOpacity: 0.9,
      });
      _dummy.position.set(0, -5, 0);
      _dummy.scale.set(0, 0, 0);
      _dummy.updateMatrix();
      this.scarMesh.setMatrixAt(i, _dummy.matrix);
      this.scarMesh.setColorAt(i, _color.setHex(0xffffff));
    }
    this.scarMesh.instanceMatrix.needsUpdate = true;
    if (this.scarMesh.instanceColor) this.scarMesh.instanceColor.needsUpdate = true;

    // 3D displaced soil & torn turf clods
    this.clodGeo = new THREE.DodecahedronGeometry(0.052, 0);
    this.clodMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.94,
      metalness: 0.0,
    });
    this.clodMesh = new THREE.InstancedMesh(this.clodGeo, this.clodMat, MAX_CLODS);
    this.clodMesh.castShadow = true;
    this.clodMesh.receiveShadow = true;
    this.clodMesh.frustumCulled = false;

    for (let i = 0; i < MAX_CLODS; i++) {
      this.clods.push({
        active: false,
        x: 0,
        y: -5,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        ry: 0,
        rz: 0,
        spinX: 0,
        spinY: 0,
        scaleX: 1,
        scaleY: 0.6,
        scaleZ: 1,
        age: 0,
        maxAge: 4,
      });
      _dummy.position.set(0, -5, 0);
      _dummy.scale.set(0, 0, 0);
      _dummy.updateMatrix();
      this.clodMesh.setMatrixAt(i, _dummy.matrix);
      this.clodMesh.setColorAt(i, _color.setHex(0x3a2614));
    }
    this.clodMesh.instanceMatrix.needsUpdate = true;
    if (this.clodMesh.instanceColor) this.clodMesh.instanceColor.needsUpdate = true;

    this.group.add(this.scarMesh, this.clodMesh);
  }

  private createTurfScarTexture(maxAnisotropy: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 256);

    // Outer crushed turf border (subtle darker/trampled grass edges)
    const outerGrad = ctx.createRadialGradient(128, 128, 22, 128, 128, 122);
    outerGrad.addColorStop(0, 'rgba(32, 22, 12, 0.92)');
    outerGrad.addColorStop(0.55, 'rgba(48, 34, 18, 0.72)');
    outerGrad.addColorStop(0.82, 'rgba(26, 68, 28, 0.32)');
    outerGrad.addColorStop(1, 'rgba(26, 68, 28, 0.0)');

    ctx.save();
    ctx.translate(128, 128);
    ctx.scale(0.82, 1.0);
    ctx.fillStyle = outerGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 122, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Dual parallel stud/boot furrows along Z length
    const drawFurrow = (cx: number, width: number, alpha: number) => {
      const grad = ctx.createLinearGradient(0, 16, 0, 240);
      grad.addColorStop(0, 'rgba(44, 29, 15, 0.0)');
      grad.addColorStop(0.18, `rgba(42, 27, 14, ${alpha})`);
      grad.addColorStop(0.5, `rgba(30, 19, 10, ${Math.min(1, alpha + 0.14)})`);
      grad.addColorStop(0.82, `rgba(45, 30, 16, ${alpha * 0.85})`);
      grad.addColorStop(1, 'rgba(45, 30, 16, 0.0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, 128, width, 106, 0, 0, Math.PI * 2);
      ctx.fill();
    };

    drawFurrow(98, 22, 0.85);
    drawFurrow(158, 22, 0.85);
    drawFurrow(128, 28, 0.65);

    // Torn grass blade & soil striations inside the scar
    for (let i = 0; i < 65; i++) {
      const rx = 68 + Math.random() * 120;
      const ry = 28 + Math.random() * 200;
      const edgeFade = 1 - Math.abs(ry - 128) / 115;
      if (edgeFade <= 0.1) continue;
      ctx.fillStyle =
        i % 3 === 0
          ? `rgba(22, 54, 24, ${0.42 * edgeFade})`
          : `rgba(24, 15, 7, ${0.52 * edgeFade})`;
      ctx.fillRect(rx, ry, 2 + Math.random() * 4, 10 + Math.random() * 22);
    }

    // Subtle crushed lighter grass ridge pushed aside on outer borders
    ctx.fillStyle = 'rgba(72, 128, 56, 0.28)';
    for (let i = 0; i < 24; i++) {
      const side = i % 2 === 0 ? 58 + Math.random() * 14 : 184 + Math.random() * 14;
      const ry = 46 + Math.random() * 164;
      ctx.fillRect(side, ry, 3, 12 + Math.random() * 14);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    return tex;
  }

  public clear(): void {
    this.trackMap.clear();
    for (let i = 0; i < MAX_SCARS; i++) {
      this.scars[i].active = false;
      this.scarOpacityArray[i] = 0;
      _dummy.position.set(0, -5, 0);
      _dummy.scale.set(0, 0, 0);
      _dummy.updateMatrix();
      this.scarMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.scarOpacityAttr.needsUpdate = true;
    this.scarMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < MAX_CLODS; i++) {
      this.clods[i].active = false;
      _dummy.position.set(0, -5, 0);
      _dummy.scale.set(0, 0, 0);
      _dummy.updateMatrix();
      this.clodMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.clodMesh.instanceMatrix.needsUpdate = true;
  }

  public spawnScar(
    x: number,
    z: number,
    angle: number,
    kind: 'tackle' | 'turn' | 'brake',
  ): void {
    // Only stamp inside pitch grass bounds
    if (Math.abs(x) > HALF_LENGTH + 1.4 || Math.abs(z) > HALF_WIDTH + 1.4) return;

    const slot = this.scars[this.scarCursor];
    this.scarCursor = (this.scarCursor + 1) % MAX_SCARS;

    const isTackle = kind === 'tackle';
    const isBrake = kind === 'brake';
    slot.active = true;
    slot.x = x;
    slot.z = z;
    slot.angle = angle + (Math.random() - 0.5) * 0.08;
    slot.width = isTackle ? 0.68 + Math.random() * 0.14 : 0.44 + Math.random() * 0.1;
    slot.length = isTackle
      ? 1.12 + Math.random() * 0.25
      : isBrake
        ? 0.78 + Math.random() * 0.18
        : 0.64 + Math.random() * 0.16;
    slot.age = 0;
    slot.maxAge = isTackle ? 15.0 : 9.5;
    slot.baseOpacity = isTackle ? 0.92 : isBrake ? 0.72 : 0.64;

    // Rich dark soil for tackles, subtle crushed turf-earth for sharp turns
    _color.setHex(isTackle ? 0xf5e9dc : isBrake ? 0xd9d0c1 : 0xc7ccba);
    const idx = (this.scarCursor + MAX_SCARS - 1) % MAX_SCARS;
    this.scarMesh.setColorAt(idx, _color);
    if (this.scarMesh.instanceColor) this.scarMesh.instanceColor.needsUpdate = true;
  }

  public spawnClods(
    x: number,
    z: number,
    moveDirX: number,
    moveDirZ: number,
    count: number,
    intensity: number,
  ): void {
    if (Math.abs(x) > HALF_LENGTH + 1.4 || Math.abs(z) > HALF_WIDTH + 1.4) return;

    for (let i = 0; i < count; i++) {
      const idx = this.clodCursor;
      this.clodCursor = (this.clodCursor + 1) % MAX_CLODS;
      const clod = this.clods[idx];

      // Kick clods slightly backward & laterally outward from boot/slide spray
      const spreadAngle = (Math.random() - 0.5) * 1.9;
      const cosA = Math.cos(spreadAngle);
      const sinA = Math.sin(spreadAngle);
      const bx = -(moveDirX * cosA - moveDirZ * sinA);
      const bz = -(moveDirX * sinA + moveDirZ * cosA);

      const horizSpeed = (0.9 + Math.random() * 2.1) * intensity;
      clod.active = true;
      clod.x = x + (Math.random() - 0.5) * 0.32;
      clod.y = 0.04;
      clod.z = z + (Math.random() - 0.5) * 0.32;
      clod.vx = bx * horizSpeed;
      clod.vy = (1.35 + Math.random() * 1.65) * intensity;
      clod.vz = bz * horizSpeed;
      clod.rx = Math.random() * Math.PI;
      clod.ry = Math.random() * Math.PI;
      clod.rz = Math.random() * Math.PI;
      clod.spinX = (Math.random() - 0.5) * 14;
      clod.spinY = (Math.random() - 0.5) * 14;
      clod.scaleX = 0.8 + Math.random() * 0.7;
      clod.scaleY = 0.45 + Math.random() * 0.45;
      clod.scaleZ = 0.75 + Math.random() * 0.75;
      clod.age = 0;
      clod.maxAge = 3.2 + Math.random() * 1.6;

      // Alternate between damp dark soil and torn green grass tufts
      _color.setHex(i % 3 === 0 ? 0x266b2d : i % 2 === 0 ? 0x3b2714 : 0x2a1b0d);
      this.clodMesh.setColorAt(idx, _color);
    }
    if (this.clodMesh.instanceColor) this.clodMesh.instanceColor.needsUpdate = true;
  }

  public update(players: Player[], dt: number): void {
    // 1. Sample player movement to emit turf marks on slide tackles & sharp cuts/brakes
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      let track = this.trackMap.get(p.id);
      if (!track) {
        track = {
          lastStampX: p.position.x,
          lastStampZ: p.position.z,
          prevDirX: Math.sin(p.facingAngle),
          prevDirZ: Math.cos(p.facingAngle),
          hadDir: false,
          cooldown: 0,
          wasTackling: false,
        };
        this.trackMap.set(p.id, track);
      }

      if (track.cooldown > 0) track.cooldown = Math.max(0, track.cooldown - dt);

      const speed = Math.hypot(p.velocity.x, p.velocity.z);
      const isTackling = p.tackleTimer > 0.04;

      if (isTackling && speed > 1.8) {
        const dirX = p.velocity.x / speed;
        const dirZ = p.velocity.z / speed;
        const distSinceStamp = Math.hypot(
          p.position.x - track.lastStampX,
          p.position.z - track.lastStampZ,
        );

        if (!track.wasTackling || distSinceStamp >= 0.38) {
          const angle = Math.atan2(dirX, dirZ);
          this.spawnScar(p.position.x, p.position.z, angle, 'tackle');
          this.spawnClods(
            p.position.x,
            p.position.z,
            dirX,
            dirZ,
            track.wasTackling ? 2 : 4,
            1.15,
          );
          track.lastStampX = p.position.x;
          track.lastStampZ = p.position.z;
        }
        track.wasTackling = true;
        track.prevDirX = dirX;
        track.prevDirZ = dirZ;
        track.hadDir = true;
        continue;
      }

      track.wasTackling = false;

      if (speed > 3.6) {
        const dirX = p.velocity.x / speed;
        const dirZ = p.velocity.z / speed;

        if (track.hadDir && track.cooldown <= 0) {
          const dot = track.prevDirX * dirX + track.prevDirZ * dirZ;
          const distSinceStamp = Math.hypot(
            p.position.x - track.lastStampX,
            p.position.z - track.lastStampZ,
          );

          // Sharp directional cut or hard sprint-to-reverse braking skids the turf
          const isSharpTurn = dot < 0.87 && speed > 4.1;
          const isHardBrake = p.isBraking && speed > 3.8;

          if ((isSharpTurn || isHardBrake) && distSinceStamp >= 0.42) {
            const angle = Math.atan2(dirX, dirZ);
            this.spawnScar(
              p.position.x,
              p.position.z,
              angle,
              isHardBrake ? 'brake' : 'turn',
            );
            this.spawnClods(p.position.x, p.position.z, dirX, dirZ, 2, 0.78);
            track.lastStampX = p.position.x;
            track.lastStampZ = p.position.z;
            track.cooldown = 0.22;
          }
        }

        // Smooth direction reference so gradual jogging curves don't trigger marks, only sharp cuts
        const blend = Math.min(1, dt * 6.5);
        const bx = THREE.MathUtils.lerp(track.prevDirX, dirX, blend);
        const bz = THREE.MathUtils.lerp(track.prevDirZ, dirZ, blend);
        const bLen = Math.hypot(bx, bz) || 1;
        track.prevDirX = bx / bLen;
        track.prevDirZ = bz / bLen;
        track.hadDir = true;
      } else if (speed < 1.2) {
        track.hadDir = false;
      }
    }

    // 2. Advance scar lifetimes & smooth opacity fade-out
    let scarsDirty = false;
    for (let i = 0; i < MAX_SCARS; i++) {
      const s = this.scars[i];
      if (!s.active) continue;
      scarsDirty = true;
      s.age += dt;
      if (s.age >= s.maxAge) {
        s.active = false;
        this.scarOpacityArray[i] = 0;
        _dummy.position.set(0, -5, 0);
        _dummy.scale.set(0, 0, 0);
        _dummy.updateMatrix();
        this.scarMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      const life = s.age / s.maxAge;
      // Hold full scar visibility for first 55% of life, then fade smoothly to 0
      const fade = life < 0.55 ? 1.0 : Math.max(0, 1 - (life - 0.55) / 0.45);
      this.scarOpacityArray[i] = s.baseOpacity * fade * fade;

      // Subtle ground elevation + slight depth depression feel via scale settle
      _dummy.position.set(s.x, 0.015, s.z);
      _dummy.rotation.set(0, s.angle, 0);
      _dummy.scale.set(s.width, 1, s.length);
      _dummy.updateMatrix();
      this.scarMesh.setMatrixAt(i, _dummy.matrix);
    }
    if (scarsDirty) {
      this.scarOpacityAttr.needsUpdate = true;
      this.scarMesh.instanceMatrix.needsUpdate = true;
    }

    // 3. Advance 3D displaced turf clods (ballistic spray + ground settle + shrink fade)
    let clodsDirty = false;
    for (let i = 0; i < MAX_CLODS; i++) {
      const c = this.clods[i];
      if (!c.active) continue;
      clodsDirty = true;
      c.age += dt;
      if (c.age >= c.maxAge) {
        c.active = false;
        _dummy.position.set(0, -5, 0);
        _dummy.scale.set(0, 0, 0);
        _dummy.updateMatrix();
        this.clodMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      if (c.y > 0.026 || c.vy > 0) {
        c.vy -= 18.0 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.z += c.vz * dt;
        c.rx += c.spinX * dt;
        c.ry += c.spinY * dt;
        if (c.y <= 0.026) {
          c.y = 0.026;
          if (c.vy < -1.2) {
            c.vy = -c.vy * 0.25;
            c.vx *= 0.45;
            c.vz *= 0.45;
          } else {
            c.vy = 0;
            c.vx = 0;
            c.vz = 0;
          }
        }
      }

      const life = c.age / c.maxAge;
      const shrink = life > 0.72 ? Math.max(0, 1 - (life - 0.72) / 0.28) : 1.0;

      _dummy.position.set(c.x, c.y, c.z);
      _dummy.rotation.set(c.rx, c.ry, c.rz);
      _dummy.scale.set(c.scaleX * shrink, c.scaleY * shrink, c.scaleZ * shrink);
      _dummy.updateMatrix();
      this.clodMesh.setMatrixAt(i, _dummy.matrix);
    }
    if (clodsDirty) {
      this.clodMesh.instanceMatrix.needsUpdate = true;
    }
  }

  public dispose(): void {
    this.scarGeo.dispose();
    this.scarMat.dispose();
    this.scarTex.dispose();
    this.clodGeo.dispose();
    this.clodMat.dispose();
  }
}
