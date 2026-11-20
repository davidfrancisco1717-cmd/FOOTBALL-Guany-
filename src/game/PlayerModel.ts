import * as THREE from 'three';
import { PlayerRosterEntry, TeamPreset } from './types';

export interface PlayerRig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  headGroup: THREE.Group;
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  leftHip: THREE.Group;
  leftKnee: THREE.Group;
  rightHip: THREE.Group;
  rightKnee: THREE.Group;
  selectionRing: THREE.Mesh;
  supportRing: THREE.Mesh;
  leftBootMesh: THREE.Mesh;
  rightBootMesh: THREE.Mesh;
}

export class PlayerModel {
  public readonly rig: PlayerRig;
  private textures: THREE.Texture[] = [];

  constructor(
    entry: PlayerRosterEntry,
    team: TeamPreset,
    maxAnisotropy: number,
  ) {
    const isGK = entry.role === 'GR';
    const jerseyHex = isGK ? team.gkColor : team.primaryColor;
    const accentHex = isGK ? '#0f172a' : team.secondaryColor;

    const jerseyTex = this.createJerseyTexture(
      jerseyHex,
      accentHex,
      entry.number,
      maxAnisotropy,
    );
    this.textures.push(jerseyTex);

    const skinMat = new THREE.MeshStandardMaterial({
      color: entry.skinColor,
      roughness: 0.72,
      metalness: 0.02,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: entry.hairColor,
      roughness: 0.85,
      metalness: 0.04,
    });
    const jerseyMat = new THREE.MeshStandardMaterial({
      map: jerseyTex,
      roughness: 0.68,
      metalness: 0.05,
    });
    const sleeveMat = new THREE.MeshStandardMaterial({
      color: jerseyHex,
      roughness: 0.68,
      metalness: 0.05,
    });
    const shortsMat = new THREE.MeshStandardMaterial({
      color: isGK ? '#0f172a' : team.shortsColor,
      roughness: 0.7,
      metalness: 0.04,
    });
    const sockMat = new THREE.MeshStandardMaterial({
      color: isGK ? team.gkColor : team.socksColor,
      roughness: 0.72,
      metalness: 0.03,
    });
    const bootMat = new THREE.MeshStandardMaterial({
      color: isGK ? '#f8fafc' : '#111827',
      roughness: 0.35,
      metalness: 0.25,
    });
    const handMat = isGK
      ? new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.55 })
      : skinMat;

    const root = new THREE.Group();

    // Grounded contact shadow disc
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 64;
    shadowCanvas.height = 64;
    const sCtx = shadowCanvas.getContext('2d')!;
    const grad = sCtx.createRadialGradient(32, 32, 5, 32, 32, 30);
    grad.addColorStop(0, 'rgba(0,0,0,0.52)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 64, 64);
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    this.textures.push(shadowTex);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.95),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
      }),
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.012;
    root.add(shadowPlane);

    // Selection ring (active controlled player)
    const selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.54, 28),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      }),
    );
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.position.y = 0.02;
    selectionRing.visible = false;
    root.add(selectionRing);

    // Secondary support/pressure indicator ring
    const supportRing = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.5, 24),
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    supportRing.rotation.x = -Math.PI / 2;
    supportRing.position.y = 0.018;
    supportRing.visible = false;
    root.add(supportRing);

    // Hips / Pelvis pivot at y = 0.86
    const hips = new THREE.Group();
    hips.position.y = 0.86;
    root.add(hips);

    const pelvisMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.16, 0.2),
      shortsMat,
    );
    pelvisMesh.castShadow = true;
    hips.add(pelvisMesh);

    // Torso
    const torso = new THREE.Group();
    torso.position.y = 0.08;
    hips.add(torso);

    const chestMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.44, 0.21),
      jerseyMat,
    );
    chestMesh.position.y = 0.22;
    chestMesh.castShadow = true;
    chestMesh.receiveShadow = true;
    torso.add(chestMesh);

    // Neck + Head
    const neckMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.065, 0.1, 8),
      skinMat,
    );
    neckMesh.position.y = 0.47;
    torso.add(neckMesh);

    const headGroup = new THREE.Group();
    headGroup.position.y = 0.58;
    torso.add(headGroup);

    const headMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.125, 14, 12),
      skinMat,
    );
    headMesh.scale.set(0.92, 1.06, 0.96);
    headMesh.castShadow = true;
    headGroup.add(headMesh);

    const hairMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.128, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
      hairMat,
    );
    hairMesh.position.y = 0.015;
    hairMesh.rotation.x = -0.18;
    headGroup.add(hairMesh);

    // Arms (Upper arm + Forearm + Hand)
    const buildArm = (side: -1 | 1) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.225, 0.39, 0);
      torso.add(shoulder);

      const upperArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.048, 0.044, 0.22, 8),
        sleeveMat,
      );
      upperArm.position.y = -0.11;
      upperArm.castShadow = true;
      shoulder.add(upperArm);

      const elbow = new THREE.Group();
      elbow.position.y = -0.22;
      shoulder.add(elbow);

      const forearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.034, 0.22, 8),
        skinMat,
      );
      forearm.position.y = -0.11;
      forearm.castShadow = true;
      elbow.add(forearm);

      const hand = new THREE.Mesh(
        new THREE.SphereGeometry(isGK ? 0.054 : 0.042, 8, 8),
        handMat,
      );
      hand.position.y = -0.23;
      elbow.add(hand);

      return { shoulder, elbow };
    };

    const leftArm = buildArm(-1);
    const rightArm = buildArm(1);

    // Legs (Thigh/Shorts + Knee/Sock + Foot/Boot)
    const buildLeg = (side: -1 | 1) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.1, -0.05, 0);
      hips.add(hip);

      const shortsLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.082, 0.072, 0.21, 10),
        shortsMat,
      );
      shortsLeg.position.y = -0.1;
      shortsLeg.castShadow = true;
      hip.add(shortsLeg);

      const thighSkin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.064, 0.056, 0.17, 8),
        skinMat,
      );
      thighSkin.position.y = -0.27;
      thighSkin.castShadow = true;
      hip.add(thighSkin);

      const knee = new THREE.Group();
      knee.position.y = -0.36;
      hip.add(knee);

      const sockShin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.054, 0.042, 0.34, 8),
        sockMat,
      );
      sockShin.position.y = -0.17;
      sockShin.castShadow = true;
      knee.add(sockShin);

      // Football boot (grounded cleanly at y = 0 when straight)
      const boot = new THREE.Mesh(
        new THREE.BoxGeometry(0.095, 0.075, 0.21),
        bootMat,
      );
      boot.position.set(0, -0.37, 0.045);
      boot.castShadow = true;
      knee.add(boot);

      return { hip, knee, boot };
    };

    const leftLeg = buildLeg(-1);
    const rightLeg = buildLeg(1);

    this.rig = {
      root,
      hips,
      torso,
      headGroup,
      leftShoulder: leftArm.shoulder,
      leftElbow: leftArm.elbow,
      rightShoulder: rightArm.shoulder,
      rightElbow: rightArm.elbow,
      leftHip: leftLeg.hip,
      leftKnee: leftLeg.knee,
      rightHip: rightLeg.hip,
      rightKnee: rightLeg.knee,
      selectionRing,
      supportRing,
      leftBootMesh: leftLeg.boot,
      rightBootMesh: rightLeg.boot,
    };
  }

  private createJerseyTexture(
    primary: string,
    accent: string,
    number: number,
    maxAnisotropy: number,
  ): THREE.CanvasTexture {
    // BoxGeometry material UV faces: +x, -x, +y, -y, +z (front), -z (back)
    // Using a single wrapped texture where center shows stripe & back number cleanly
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = primary;
    ctx.fillRect(0, 0, 256, 256);

    // Shoulder/side vertical stripe
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 22, 256);
    ctx.fillRect(234, 0, 22, 256);

    // Collar trim
    ctx.fillRect(68, 0, 120, 18);

    // Jersey number clearly printed
    ctx.fillStyle = accent;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 6;
    ctx.font = 'bold 124px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = String(number);
    ctx.strokeText(label, 128, 134);
    ctx.fillText(label, 128, 134);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    return tex;
  }
}
