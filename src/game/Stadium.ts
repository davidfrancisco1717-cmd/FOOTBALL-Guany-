import * as THREE from 'three';
import { HALF_LENGTH, HALF_WIDTH, StadiumTime } from './types';

export class Stadium {
  public readonly group = new THREE.Group();

  private floodlightPanels: THREE.MeshStandardMaterial[] = [];
  private adMaterials: THREE.MeshStandardMaterial[] = [];
  private scoreboardCanvas: HTMLCanvasElement;
  private scoreboardCtx: CanvasRenderingContext2D;
  private scoreboardTex: THREE.CanvasTexture;
  private scoreboardMat: THREE.MeshStandardMaterial;

  private crowdMesh: THREE.InstancedMesh | null = null;
  private crowdBaseMatrices: THREE.Matrix4[] = [];
  private crowdBasePositions: THREE.Vector3[] = [];
  private crowdPhases: number[] = [];
  private cheerIntensity = 0;
  private lastScoreboardKey = '';

  constructor(maxAnisotropy: number) {
    this.scoreboardCanvas = document.createElement('canvas');
    this.scoreboardCanvas.width = 512;
    this.scoreboardCanvas.height = 192;
    this.scoreboardCtx = this.scoreboardCanvas.getContext('2d')!;
    this.scoreboardTex = new THREE.CanvasTexture(this.scoreboardCanvas);
    this.scoreboardTex.colorSpace = THREE.SRGBColorSpace;
    this.scoreboardTex.anisotropy = maxAnisotropy;
    this.scoreboardMat = new THREE.MeshStandardMaterial({
      map: this.scoreboardTex,
      emissiveMap: this.scoreboardTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.7,
      roughness: 0.35,
    });

    this.buildOuterGround();
    this.buildPerimeterAds(maxAnisotropy);
    this.buildGrandstands();
    this.buildCrowd();
    this.buildBenches();
    this.buildTunnels();
    this.buildScoreboard();
    this.buildFloodlights();
    this.updateScoreboard('DRA', 'LEO', 0, 0, '00:00', false);
  }

  private buildOuterGround(): void {
    // Extended horizon ground so the stadium sits in a natural landscape, never a void
    const horizonGeo = new THREE.PlaneGeometry(420, 420);
    horizonGeo.rotateX(-Math.PI / 2);
    const horizonMat = new THREE.MeshStandardMaterial({
      color: 0x1b3a24,
      roughness: 0.96,
      metalness: 0,
    });
    const horizon = new THREE.Mesh(horizonGeo, horizonMat);
    horizon.position.y = -0.04;
    horizon.receiveShadow = true;
    this.group.add(horizon);

    // Stadium track / technical apron around pitch
    const apronGeo = new THREE.PlaneGeometry(86, 58);
    apronGeo.rotateX(-Math.PI / 2);
    const apronMat = new THREE.MeshStandardMaterial({
      color: 0x264b3b,
      roughness: 0.9,
      metalness: 0.04,
    });
    const apron = new THREE.Mesh(apronGeo, apronMat);
    apron.position.y = -0.02;
    apron.receiveShadow = true;
    this.group.add(apron);
  }

  private createAdTexture(text: string, bg: string, fg: string, maxAnisotropy: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 96);

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 504, 88);

    ctx.fillStyle = fg;
    ctx.font = 'bold 42px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 50);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    return tex;
  }

  private buildPerimeterAds(maxAnisotropy: number): void {
    const ads = [
      { text: 'COPA PSP 3D · LIGA', bg: '#0f172a', fg: '#38bdf8' },
      { text: 'ENERGIA PRO · DESPORTO', bg: '#7f1d1d', fg: '#fef08a' },
      { text: 'ESTÁDIO NACIONAL', bg: '#064e3b', fg: '#ecfdf5' },
      { text: 'TRANSMISSÃO DIRETA HD', bg: '#1e1b4b', fg: '#f8fafc' },
    ];

    this.adMaterials = ads.map((a) => {
      const tex = this.createAdTexture(a.text, a.bg, a.fg, maxAnisotropy);
      return new THREE.MeshStandardMaterial({
        map: tex,
        emissiveMap: tex,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.12,
        roughness: 0.45,
      });
    });

    const boardGeo = new THREE.BoxGeometry(7.2, 0.95, 0.18);

    // North & South sideline boards
    for (let i = 0; i < 8; i++) {
      const x = -26.5 + i * 7.55;
      const matN = this.adMaterials[i % this.adMaterials.length];
      const boardN = new THREE.Mesh(boardGeo, matN);
      boardN.position.set(x, 0.48, -(HALF_WIDTH + 2.2));
      boardN.castShadow = true;
      this.group.add(boardN);

      const matS = this.adMaterials[(i + 2) % this.adMaterials.length];
      const boardS = new THREE.Mesh(boardGeo, matS);
      boardS.position.set(x, 0.48, HALF_WIDTH + 2.2);
      boardS.castShadow = true;
      this.group.add(boardS);
    }

    // East & West endline boards (leaving space behind goals)
    const endGeo = new THREE.BoxGeometry(0.18, 0.95, 6.8);
    const zOffsets = [-15.2, -7.8, 7.8, 15.2];
    zOffsets.forEach((z, idx) => {
      const matW = this.adMaterials[idx % this.adMaterials.length];
      const bW = new THREE.Mesh(endGeo, matW);
      bW.position.set(-(HALF_LENGTH + 3.2), 0.48, z);
      this.group.add(bW);

      const matE = this.adMaterials[(idx + 1) % this.adMaterials.length];
      const bE = new THREE.Mesh(endGeo, matE);
      bE.position.set(HALF_LENGTH + 3.2, 0.48, z);
      this.group.add(bE);
    });
  }

  private buildGrandstands(): void {
    const concreteMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.85,
      metalness: 0.08,
    });
    const tierMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.78,
      metalness: 0.1,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.45,
      metalness: 0.45,
    });
    const accentTrimMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      roughness: 0.35,
      metalness: 0.3,
    });

    const createStand = (
      length: number,
      tiers: number,
      posX: number,
      posZ: number,
      rotY: number,
      hasRoof: boolean,
    ) => {
      const stand = new THREE.Group();
      const tierDepth = 1.65;
      const tierHeight = 0.85;

      // Front wall
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(length, 1.3, 0.4),
        concreteMat,
      );
      wall.position.set(0, 0.65, 0);
      wall.receiveShadow = true;
      stand.add(wall);

      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(length, 0.18, 0.46),
        accentTrimMat,
      );
      trim.position.set(0, 1.34, 0);
      stand.add(trim);

      for (let t = 0; t < tiers; t++) {
        const step = new THREE.Mesh(
          new THREE.BoxGeometry(length, tierHeight, tierDepth),
          t % 2 === 0 ? tierMat : concreteMat,
        );
        step.position.set(
          0,
          1.2 + t * tierHeight + tierHeight / 2,
          -(t + 0.5) * tierDepth - 0.2,
        );
        step.receiveShadow = true;
        step.castShadow = true;
        stand.add(step);
      }

      if (hasRoof) {
        const totalDepth = tiers * tierDepth + 2.5;
        const roofY = 1.8 + tiers * tierHeight + 2.6;
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(length + 1.2, 0.35, totalDepth),
          roofMat,
        );
        roof.position.set(0, roofY, -totalDepth / 2 + 1.1);
        roof.rotation.x = 0.08;
        roof.castShadow = true;
        stand.add(roof);

        // Support pillars at rear
        const pillarGeo = new THREE.BoxGeometry(0.55, roofY, 0.55);
        const pillarCount = 5;
        for (let p = 0; p < pillarCount; p++) {
          const px = -length / 2 + 2 + (p * (length - 4)) / (pillarCount - 1);
          const pillar = new THREE.Mesh(pillarGeo, concreteMat);
          pillar.position.set(px, roofY / 2, -totalDepth + 1.6);
          stand.add(pillar);
        }
      }

      stand.position.set(posX, 0, posZ);
      stand.rotation.y = rotY;
      this.group.add(stand);
    };

    // North Stand (main visible stand behind far touchline)
    createStand(74, 7, 0, -(HALF_WIDTH + 6.8), 0, true);
    // South Stand (low/open behind TV camera so camera never clips!)
    createStand(74, 3, 0, HALF_WIDTH + 7.5, Math.PI, false);
    // West End Stand (behind left goal)
    createStand(46, 6, -(HALF_LENGTH + 7.2), 0, Math.PI / 2, true);
    // East End Stand (behind right goal)
    createStand(46, 6, HALF_LENGTH + 7.2, 0, -Math.PI / 2, true);
  }

  private buildCrowd(): void {
    const spectatorGeo = new THREE.BoxGeometry(0.44, 0.72, 0.32);
    const spectatorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.75,
      metalness: 0.05,
    });

    const positions: { pos: THREE.Vector3; rotY: number }[] = [];

    const addStandCrowd = (
      length: number,
      tiers: number,
      originX: number,
      originZ: number,
      rotY: number,
    ) => {
      const dummyParent = new THREE.Object3D();
      dummyParent.position.set(originX, 0, originZ);
      dummyParent.rotation.y = rotY;
      dummyParent.updateMatrixWorld();

      const tierDepth = 1.65;
      const tierHeight = 0.85;

      for (let t = 0; t < tiers; t++) {
        const y = 1.2 + (t + 1) * tierHeight + 0.36;
        const z = -(t + 0.5) * tierDepth - 0.2;
        for (let x = -length / 2 + 1.5; x <= length / 2 - 1.5; x += 1.25) {
          if (Math.random() < 0.14) continue; // natural seat gaps
          const local = new THREE.Vector3(
            x + (Math.random() - 0.5) * 0.25,
            y,
            z + (Math.random() - 0.5) * 0.15,
          );
          local.applyMatrix4(dummyParent.matrixWorld);
          positions.push({ pos: local, rotY });
        }
      }
    };

    addStandCrowd(72, 7, 0, -(HALF_WIDTH + 6.8), 0);
    addStandCrowd(72, 3, 0, HALF_WIDTH + 7.5, Math.PI);
    addStandCrowd(44, 6, -(HALF_LENGTH + 7.2), 0, Math.PI / 2);
    addStandCrowd(44, 6, HALF_LENGTH + 7.2, 0, -Math.PI / 2);

    const count = positions.length;
    const instanced = new THREE.InstancedMesh(spectatorGeo, spectatorMat, count);
    const dummy = new THREE.Object3D();
    const palette = [
      new THREE.Color('#1d4ed8'),
      new THREE.Color('#dc2626'),
      new THREE.Color('#15803d'),
      new THREE.Color('#eab308'),
      new THREE.Color('#f8fafc'),
      new THREE.Color('#0284c7'),
      new THREE.Color('#475569'),
    ];

    for (let i = 0; i < count; i++) {
      const item = positions[i];
      dummy.position.copy(item.pos);
      dummy.rotation.set(0, item.rotY, 0);
      const s = 0.9 + Math.random() * 0.22;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();

      instanced.setMatrixAt(i, dummy.matrix);
      instanced.setColorAt(i, palette[i % palette.length]);

      this.crowdBaseMatrices.push(dummy.matrix.clone());
      this.crowdBasePositions.push(item.pos.clone());
      this.crowdPhases.push(Math.random() * Math.PI * 2);
    }

    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
    instanced.computeBoundingSphere();
    instanced.frustumCulled = false;

    this.crowdMesh = instanced;
    this.group.add(instanced);
  }

  private buildBenches(): void {
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.35,
      metalness: 0.7,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.42,
      roughness: 0.15,
      metalness: 0.1,
    });

    const createBench = (xPos: number, seatColor: number) => {
      const bench = new THREE.Group();
      const seatMat = new THREE.MeshStandardMaterial({
        color: seatColor,
        roughness: 0.55,
      });

      // Back & roof frame
      const backPanel = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.85, 0.1), glassMat);
      backPanel.position.set(0, 0.95, -0.55);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.1, 1.4), glassMat);
      roof.position.set(0, 1.9, 0.1);
      roof.rotation.x = 0.1;

      const postGeo = new THREE.BoxGeometry(0.08, 1.9, 0.08);
      [-2.55, 0, 2.55].forEach((px) => {
        const post = new THREE.Mesh(postGeo, frameMat);
        post.position.set(px, 0.95, -0.55);
        bench.add(post);
      });

      // 4 team seats + 3 reserve players
      for (let i = 0; i < 4; i++) {
        const sx = -1.7 + i * 1.12;
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.15, 0.55), seatMat);
        seat.position.set(sx, 0.45, -0.15);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.6, 0.12), seatMat);
        back.position.set(sx, 0.78, -0.38);
        bench.add(seat, back);

        if (i < 3) {
          const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.52, 0.25), seatMat);
          torso.position.set(sx, 0.8, -0.15);
          const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.14, 10, 10),
            new THREE.MeshStandardMaterial({ color: 0xe2b08a, roughness: 0.7 }),
          );
          head.position.set(sx, 1.2, -0.15);
          bench.add(torso, head);
        }
      }

      bench.add(backPanel, roof);
      bench.position.set(xPos, 0, -(HALF_WIDTH + 4.3));
      this.group.add(bench);
    };

    createBench(-10.5, 0x1d4ed8);
    createBench(10.5, 0xdc2626);
  }

  private buildTunnels(): void {
    const archMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.75,
      metalness: 0.15,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x05080f,
      roughness: 0.95,
    });

    const createTunnel = (x: number, z: number, rotY: number) => {
      const tunnel = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.7, 2.2), archMat);
      frame.position.y = 1.35;
      const voidBox = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.1, 2.26), darkMat);
      voidBox.position.y = 1.05;
      tunnel.add(frame, voidBox);
      tunnel.position.set(x, 0, z);
      tunnel.rotation.y = rotY;
      this.group.add(tunnel);
    };

    // Main player entrance tunnel at North-Center & corner service tunnel
    createTunnel(0, -(HALF_WIDTH + 6.4), 0);
    createTunnel(-(HALF_LENGTH + 6.8), -15, Math.PI / 2);
  }

  private buildScoreboard(): void {
    const boardGroup = new THREE.Group();
    const casingMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.4,
      metalness: 0.6,
    });

    const pillarGeo = new THREE.CylinderGeometry(0.25, 0.3, 9.5, 10);
    const p1 = new THREE.Mesh(pillarGeo, casingMat);
    p1.position.set(-4.2, 4.75, 0);
    const p2 = new THREE.Mesh(pillarGeo, casingMat);
    p2.position.set(4.2, 4.75, 0);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(11.4, 4.5, 0.65), casingMat);
    frame.position.set(0, 10.8, 0);

    const screen = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 3.85), this.scoreboardMat);
    screen.position.set(0, 10.8, 0.35);

    boardGroup.add(p1, p2, frame, screen);
    boardGroup.position.set(22, 0, -(HALF_WIDTH + 17.5));
    boardGroup.rotation.y = -0.35;
    this.group.add(boardGroup);
  }

  private buildFloodlights(): void {
    const mastMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.35,
      metalness: 0.75,
    });
    const headHousingMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.5,
    });

    const corners: [number, number][] = [
      [-41, -28],
      [41, -28],
      [-41, 28],
      [41, 28],
    ];

    corners.forEach(([cx, cz]) => {
      const tower = new THREE.Group();
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.72, 23, 8), mastMat);
      mast.position.y = 11.5;
      mast.castShadow = true;

      const rack = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.8, 0.65), headHousingMat);
      rack.position.set(0, 23.2, 0);

      const panelMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        emissive: new THREE.Color(0xeef6ff),
        emissiveIntensity: 0.15,
        roughness: 0.2,
      });
      this.floodlightPanels.push(panelMat);

      const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 2.3), panelMat);
      panel.position.set(0, 23.2, 0.36);

      const rackGroup = new THREE.Group();
      rackGroup.add(rack, panel);
      rackGroup.lookAt(new THREE.Vector3(-cx, -12, -cz));

      tower.add(mast, rackGroup);
      tower.position.set(cx, 0, cz);
      this.group.add(tower);
    });
  }

  public setTimeOfDay(time: StadiumTime): void {
    const isNight = time === 'night';
    this.floodlightPanels.forEach((m) => {
      m.emissiveIntensity = isNight ? 2.4 : 0.12;
    });
    this.adMaterials.forEach((m) => {
      m.emissiveIntensity = isNight ? 0.52 : 0.12;
    });
    this.scoreboardMat.emissiveIntensity = isNight ? 1.15 : 0.65;
  }

  public triggerGoalCheer(): void {
    this.cheerIntensity = 1.0;
  }

  public updateScoreboard(
    homeShort: string,
    awayShort: string,
    homeScore: number,
    awayScore: number,
    clockStr: string,
    isGoal: boolean,
  ): void {
    const key = `${homeShort}-${awayShort}-${homeScore}-${awayScore}-${clockStr}-${isGoal}`;
    if (key === this.lastScoreboardKey) return;
    this.lastScoreboardKey = key;

    const ctx = this.scoreboardCtx;
    ctx.fillStyle = '#07111e';
    ctx.fillRect(0, 0, 512, 192);

    ctx.strokeStyle = isGoal ? '#f59e0b' : '#0ea5e9';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 500, 180);

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isGoal ? 'GOLO!' : 'COPA FOOTBALL PSP 3D', 256, 36);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 64px "Barlow Condensed", sans-serif';
    ctx.fillText(`${homeShort}   ${homeScore} - ${awayScore}   ${awayShort}`, 256, 108);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 34px "JetBrains Mono", monospace';
    ctx.fillText(clockStr, 256, 158);

    this.scoreboardTex.needsUpdate = true;
  }

  public update(dt: number, elapsed: number): void {
    if (this.cheerIntensity > 0) {
      this.cheerIntensity = Math.max(0, this.cheerIntensity - dt * 0.35);
    }

    if (this.crowdMesh && (this.cheerIntensity > 0.01 || Math.floor(elapsed * 20) % 2 === 0)) {
      const amp = 0.035 + this.cheerIntensity * 0.24;
      const freq = 3.5 + this.cheerIntensity * 7.5;
      const mat = new THREE.Matrix4();
      const count = this.crowdBaseMatrices.length;
      for (let i = 0; i < count; i++) {
        mat.copy(this.crowdBaseMatrices[i]);
        const dy = Math.abs(Math.sin(elapsed * freq + this.crowdPhases[i])) * amp;
        const pos = this.crowdBasePositions[i];
        mat.elements[13] = pos.y + dy;
        this.crowdMesh.setMatrixAt(i, mat);
      }
      this.crowdMesh.instanceMatrix.needsUpdate = true;
    }
  }
}
