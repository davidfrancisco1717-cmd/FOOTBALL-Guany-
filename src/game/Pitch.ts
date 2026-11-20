import * as THREE from 'three';
import {
  GOAL_DEPTH,
  GOAL_HALF_WIDTH,
  GOAL_HEIGHT,
  GOAL_WIDTH,
  HALF_LENGTH,
  HALF_WIDTH,
  PITCH_LENGTH,
  PITCH_WIDTH,
} from './types';

export class Pitch {
  public readonly group = new THREE.Group();
  private textures: THREE.Texture[] = [];

  constructor(maxAnisotropy: number) {
    this.buildTurfAndMarkings(maxAnisotropy);
    this.buildGoals(maxAnisotropy);
    this.buildCornerFlags();
  }

  private buildTurfAndMarkings(maxAnisotropy: number): void {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;

    // Extended apron margin inside canvas
    const marginX = 128;
    const marginY = 96;
    const fieldW = canvas.width - marginX * 2;
    const fieldH = canvas.height - marginY * 2;

    // Base deep turf surround
    ctx.fillStyle = '#1d5e28';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Mowed alternating grass stripes (14 stripes along pitch length)
    const numStripes = 14;
    const stripeW = fieldW / numStripes;
    for (let i = 0; i < numStripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#277a35' : '#2f8c3e';
      ctx.fillRect(marginX + i * stripeW, marginY - 18, stripeW + 1, fieldH + 36);
    }

    // Subtle turf micro-grain for realism
    ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
    for (let i = 0; i < 6000; i++) {
      const gx = Math.random() * canvas.width;
      const gy = Math.random() * canvas.height;
      ctx.fillRect(gx, gy, 2, 1);
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.035)';
    for (let i = 0; i < 6000; i++) {
      const gx = Math.random() * canvas.width;
      const gy = Math.random() * canvas.height;
      ctx.fillRect(gx, gy, 2, 1);
    }

    // Scale helpers: world meters -> canvas pixels
    const pxPerMeterX = fieldW / PITCH_LENGTH;
    const pxPerMeterZ = fieldH / PITCH_WIDTH;
    const toX = (wx: number) => marginX + (wx + HALF_LENGTH) * pxPerMeterX;
    const toY = (wz: number) => marginY + (wz + HALF_WIDTH) * pxPerMeterZ;

    ctx.strokeStyle = 'rgba(248, 250, 252, 0.94)';
    ctx.fillStyle = 'rgba(248, 250, 252, 0.94)';
    ctx.lineWidth = 4.5;

    // Outer touchlines & goal lines
    ctx.strokeRect(marginX, marginY, fieldW, fieldH);

    // Halfway line
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(-HALF_WIDTH));
    ctx.lineTo(toX(0), toY(HALF_WIDTH));
    ctx.stroke();

    // Center circle (radius 5.5m)
    const centerRadius = 5.5 * pxPerMeterX;
    ctx.beginPath();
    ctx.ellipse(
      toX(0),
      toY(0),
      centerRadius,
      5.5 * pxPerMeterZ,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();

    // Center spot
    ctx.beginPath();
    ctx.arc(toX(0), toY(0), 6, 0, Math.PI * 2);
    ctx.fill();

    // Penalty & Goal areas for both ends
    const drawEndAreas = (side: -1 | 1) => {
      const goalLineX = side * HALF_LENGTH;
      const penDepth = 10.5;
      const penHalfW = 9.0;
      const sixDepth = 4.2;
      const sixHalfW = 4.8;
      const penSpotX = goalLineX - side * 7.2;

      // Grande área
      const pxStart = side === -1 ? toX(goalLineX) : toX(goalLineX - penDepth);
      ctx.strokeRect(
        pxStart,
        toY(-penHalfW),
        penDepth * pxPerMeterX,
        penHalfW * 2 * pxPerMeterZ,
      );

      // Pequena área
      const sxStart = side === -1 ? toX(goalLineX) : toX(goalLineX - sixDepth);
      ctx.strokeRect(
        sxStart,
        toY(-sixHalfW),
        sixDepth * pxPerMeterX,
        sixHalfW * 2 * pxPerMeterZ,
      );

      // Marca de grande penalidade
      ctx.beginPath();
      ctx.arc(toX(penSpotX), toY(0), 5, 0, Math.PI * 2);
      ctx.fill();

      // Arco da grande área
      ctx.beginPath();
      if (side === -1) {
        ctx.ellipse(
          toX(penSpotX),
          toY(0),
          4.6 * pxPerMeterX,
          4.6 * pxPerMeterZ,
          0,
          -0.78,
          0.78,
        );
      } else {
        ctx.ellipse(
          toX(penSpotX),
          toY(0),
          4.6 * pxPerMeterX,
          4.6 * pxPerMeterZ,
          0,
          Math.PI - 0.78,
          Math.PI + 0.78,
        );
      }
      ctx.stroke();
    };

    drawEndAreas(-1);
    drawEndAreas(1);

    // 4 Corner arcs
    const cornerR = 1.2 * pxPerMeterX;
    const corners: [number, number, number, number][] = [
      [-HALF_LENGTH, -HALF_WIDTH, 0, Math.PI / 2],
      [HALF_LENGTH, -HALF_WIDTH, Math.PI / 2, Math.PI],
      [HALF_LENGTH, HALF_WIDTH, Math.PI, Math.PI * 1.5],
      [-HALF_LENGTH, HALF_WIDTH, Math.PI * 1.5, Math.PI * 2],
    ];
    corners.forEach(([cx, cz, a0, a1]) => {
      ctx.beginPath();
      ctx.arc(toX(cx), toY(cz), cornerR, a0, a1);
      ctx.stroke();
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    this.textures.push(tex);

    const worldPitchW = (canvas.width / fieldW) * PITCH_LENGTH;
    const worldPitchD = (canvas.height / fieldH) * PITCH_WIDTH;

    const pitchGeo = new THREE.PlaneGeometry(worldPitchW, worldPitchD);
    pitchGeo.rotateX(-Math.PI / 2);
    const pitchMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.88,
      metalness: 0.02,
    });

    const pitchMesh = new THREE.Mesh(pitchGeo, pitchMat);
    pitchMesh.receiveShadow = true;
    pitchMesh.position.y = 0;
    this.group.add(pitchMesh);
  }

  private createNetTexture(maxAnisotropy: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 256);

    ctx.strokeStyle = 'rgba(241, 245, 249, 0.78)';
    ctx.lineWidth = 4;
    const step = 32;
    for (let i = 0; i <= 256; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = maxAnisotropy;
    this.textures.push(tex);
    return tex;
  }

  private buildGoals(maxAnisotropy: number): void {
    const postMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.28,
      metalness: 0.35,
    });
    const backSupportMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.4,
      metalness: 0.55,
    });

    const netTexBack = this.createNetTexture(maxAnisotropy);
    netTexBack.repeat.set(8, 3);
    const netTexSide = this.createNetTexture(maxAnisotropy);
    netTexSide.repeat.set(3, 3);

    const netMatBack = new THREE.MeshStandardMaterial({
      map: netTexBack,
      transparent: true,
      side: THREE.DoubleSide,
      roughness: 0.9,
      depthWrite: false,
    });
    const netMatSide = new THREE.MeshStandardMaterial({
      map: netTexSide,
      transparent: true,
      side: THREE.DoubleSide,
      roughness: 0.9,
      depthWrite: false,
    });

    const postRadius = 0.08;
    const postGeo = new THREE.CylinderGeometry(postRadius, postRadius, GOAL_HEIGHT, 12);
    const crossbarGeo = new THREE.CylinderGeometry(
      postRadius,
      postRadius,
      GOAL_WIDTH + postRadius * 2,
      12,
    );
    crossbarGeo.rotateX(Math.PI / 2);

    const buildSingleGoal = (side: -1 | 1) => {
      const g = new THREE.Group();
      const lineX = side * HALF_LENGTH;
      const backX = lineX + side * GOAL_DEPTH;

      // Left & right front posts
      const postL = new THREE.Mesh(postGeo, postMat);
      postL.position.set(lineX, GOAL_HEIGHT / 2, -GOAL_HALF_WIDTH);
      postL.castShadow = true;

      const postR = new THREE.Mesh(postGeo, postMat);
      postR.position.set(lineX, GOAL_HEIGHT / 2, GOAL_HALF_WIDTH);
      postR.castShadow = true;

      // Crossbar
      const crossbar = new THREE.Mesh(crossbarGeo, postMat);
      crossbar.position.set(lineX, GOAL_HEIGHT, 0);
      crossbar.castShadow = true;

      g.add(postL, postR, crossbar);

      // Rear frame supports
      const rearPostGeo = new THREE.CylinderGeometry(0.045, 0.045, GOAL_HEIGHT * 0.92, 8);
      const rPostL = new THREE.Mesh(rearPostGeo, backSupportMat);
      rPostL.position.set(backX, (GOAL_HEIGHT * 0.92) / 2, -GOAL_HALF_WIDTH);
      const rPostR = new THREE.Mesh(rearPostGeo, backSupportMat);
      rPostR.position.set(backX, (GOAL_HEIGHT * 0.92) / 2, GOAL_HALF_WIDTH);

      const topTieGeo = new THREE.CylinderGeometry(0.04, 0.04, GOAL_DEPTH, 8);
      topTieGeo.rotateZ(Math.PI / 2);
      const topTieL = new THREE.Mesh(topTieGeo, backSupportMat);
      topTieL.position.set((lineX + backX) / 2, GOAL_HEIGHT * 0.96, -GOAL_HALF_WIDTH);
      const topTieR = new THREE.Mesh(topTieGeo, backSupportMat);
      topTieR.position.set((lineX + backX) / 2, GOAL_HEIGHT * 0.96, GOAL_HALF_WIDTH);

      const rearBarGeo = new THREE.CylinderGeometry(0.04, 0.04, GOAL_WIDTH, 8);
      rearBarGeo.rotateX(Math.PI / 2);
      const rearTopBar = new THREE.Mesh(rearBarGeo, backSupportMat);
      rearTopBar.position.set(backX, GOAL_HEIGHT * 0.92, 0);
      const rearGroundBar = new THREE.Mesh(rearBarGeo, backSupportMat);
      rearGroundBar.position.set(backX, 0.04, 0);

      g.add(rPostL, rPostR, topTieL, topTieR, rearTopBar, rearGroundBar);

      // Netting (back, top, left side, right side)
      const backNet = new THREE.Mesh(
        new THREE.PlaneGeometry(GOAL_WIDTH, GOAL_HEIGHT * 0.94),
        netMatBack,
      );
      backNet.position.set(backX, (GOAL_HEIGHT * 0.94) / 2, 0);
      backNet.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;

      const topNet = new THREE.Mesh(
        new THREE.PlaneGeometry(GOAL_DEPTH, GOAL_WIDTH),
        netMatSide,
      );
      topNet.rotation.x = Math.PI / 2;
      topNet.position.set((lineX + backX) / 2, GOAL_HEIGHT * 0.96, 0);

      const sideNetGeo = new THREE.PlaneGeometry(GOAL_DEPTH, GOAL_HEIGHT * 0.94);
      const leftNet = new THREE.Mesh(sideNetGeo, netMatSide);
      leftNet.position.set((lineX + backX) / 2, (GOAL_HEIGHT * 0.94) / 2, -GOAL_HALF_WIDTH);
      const rightNet = new THREE.Mesh(sideNetGeo, netMatSide);
      rightNet.position.set((lineX + backX) / 2, (GOAL_HEIGHT * 0.94) / 2, GOAL_HALF_WIDTH);

      g.add(backNet, topNet, leftNet, rightNet);
      this.group.add(g);
    };

    buildSingleGoal(-1);
    buildSingleGoal(1);
  }

  private buildCornerFlags(): void {
    const poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.35, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
    const flagGeo = new THREE.PlaneGeometry(0.42, 0.28);
    const flagMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      roughness: 0.6,
    });

    const positions: [number, number][] = [
      [-HALF_LENGTH, -HALF_WIDTH],
      [HALF_LENGTH, -HALF_WIDTH],
      [-HALF_LENGTH, HALF_WIDTH],
      [HALF_LENGTH, HALF_WIDTH],
    ];

    positions.forEach(([x, z]) => {
      const flagGroup = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 0.675;
      pole.castShadow = true;

      const cloth = new THREE.Mesh(flagGeo, flagMat);
      cloth.position.set(0.21, 1.18, 0);
      flagGroup.add(pole, cloth);
      flagGroup.position.set(x, 0, z);
      this.group.add(flagGroup);
    });
  }
}
