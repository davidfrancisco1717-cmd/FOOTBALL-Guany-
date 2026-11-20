import * as THREE from 'three';
import { PlayerRig } from './PlayerModel';
import { PlayerAnimState } from './types';

export class PlayerAnimation {
  private cycle = Math.random() * Math.PI * 2;
  private actionTimer = 0;
  private actionDuration = 0.35;
  private activeAction: PlayerAnimState | null = null;
  private diveDir = 1;

  public triggerAction(action: PlayerAnimState, duration = 0.34, diveDir = 1): void {
    this.activeAction = action;
    this.actionTimer = 0;
    this.actionDuration = duration;
    this.diveDir = diveDir;
  }

  public getCurrentAction(): PlayerAnimState | null {
    return this.activeAction;
  }

  public getStrideCycle(): number {
    return this.cycle;
  }

  public update(
    rig: PlayerRig,
    dt: number,
    speed: number,
    accelRate: number,
    turnRate: number,
    hasBall: boolean,
    isCelebrating: boolean,
    isBraking = false,
    isShielding = false,
  ): void {
    if (this.activeAction) {
      this.actionTimer += dt;
      if (this.actionTimer >= this.actionDuration) {
        this.activeAction = null;
      }
    }

    let state: PlayerAnimState = 'idle';
    if (isCelebrating) {
      state = 'celebrate';
    } else if (this.activeAction) {
      state = this.activeAction;
    } else if (isShielding && hasBall) {
      state = 'shield';
    } else if (isBraking && speed > 1.35) {
      state = 'brake';
    } else if (Math.abs(turnRate) > 3.6 && speed > 2.2) {
      state = 'turn';
    } else if (speed > 6.15) {
      state = hasBall ? 'dribble' : 'sprint';
    } else if (speed > 2.35) {
      state = hasBall ? 'dribble' : 'run';
    } else if (speed > 0.32) {
      state = 'walk';
    }

    // Target joint angles
    let hipY = 0.86;
    let hipRotX = 0;
    let hipRotY = 0;
    let hipRotZ = 0;
    let torsoRotX = 0;
    let torsoRotY = 0;
    let torsoRotZ = 0;
    let headRotX = 0;
    let headRotY = 0;

    let lHipX = 0;
    let rHipX = 0;
    let lHipZ = 0;
    let rHipZ = 0;
    let lKneeX = 0;
    let rKneeX = 0;

    let lShX = 0;
    let rShX = 0;
    let lShZ = 0.14;
    let rShZ = -0.14;
    let lElbX = -0.25;
    let rElbX = -0.25;

    if (state === 'idle') {
      this.cycle += dt * 2.2;
      hipY = 0.86 + Math.sin(this.cycle) * 0.012;
      lShX = Math.sin(this.cycle) * 0.03;
      rShX = -Math.sin(this.cycle) * 0.03;
    } else if (state === 'brake') {
      // Athletic braking stance: drop center of gravity, lean slightly back, brace legs
      this.cycle += dt * 6.0;
      hipY = 0.78;
      torsoRotX = -0.18;
      torsoRotZ = THREE.MathUtils.clamp(-turnRate * 0.04, -0.16, 0.16);
      lHipX = -0.45;
      lKneeX = 0.52;
      rHipX = 0.36;
      rKneeX = 0.48;
      lShX = 0.38;
      rShX = -0.28;
      lShZ = 0.36;
      rShZ = -0.36;
      lElbX = -0.85;
      rElbX = -0.85;
    } else if (state === 'turn') {
      // Sharp directional cut: inward bank, dropped hip, balancing arms
      const bank = THREE.MathUtils.clamp(-turnRate * 0.065, -0.32, 0.32);
      const freq = hasBall ? 11.2 : 12.6;
      const amp = hasBall ? 0.65 : 0.78;
      this.cycle += dt * freq;
      const s = Math.sin(this.cycle);
      const c = Math.cos(this.cycle);

      hipY = 0.81 + Math.abs(c) * 0.04;
      hipRotZ = bank * 0.45;
      torsoRotX = 0.2;
      torsoRotZ = bank;
      torsoRotY = -bank * 0.6;
      lHipX = s * amp;
      rHipX = -s * amp;
      lHipZ = 0.1;
      rHipZ = -0.1;
      lKneeX = Math.max(0, -c) * 0.82;
      rKneeX = Math.max(0, c) * 0.82;
      lShX = -s * 0.55;
      rShX = s * 0.55;
      lShZ = 0.34;
      rShZ = -0.34;
      lElbX = -0.78;
      rElbX = -0.78;
    } else if (state === 'shield') {
      // Protecting ball: wide low stance, arm extended to ward off challenger
      this.cycle += dt * 4.5;
      const shift = Math.sin(this.cycle) * 0.08;
      hipY = 0.79;
      hipRotY = 0.22;
      torsoRotX = 0.22;
      torsoRotY = -0.28;
      lHipX = -0.26 + shift;
      rHipX = 0.24 - shift;
      lHipZ = 0.18;
      rHipZ = -0.18;
      lKneeX = 0.42;
      rKneeX = 0.38;
      lShX = -0.35;
      rShX = -0.55;
      lShZ = 0.68; // shielding arm out
      rShZ = -0.45;
      lElbX = -0.55;
      rElbX = -0.7;
    } else if (state === 'walk' || state === 'run' || state === 'sprint' || state === 'dribble') {
      const sprintingDribble = state === 'dribble' && speed > 6.15;
      const freq =
        state === 'walk'
          ? 6.4
          : sprintingDribble
            ? 13.4
            : state === 'dribble'
              ? 10.6
              : state === 'run'
                ? 11.6
                : 14.8;
      const amp =
        state === 'walk'
          ? 0.38
          : sprintingDribble
            ? 0.86
            : state === 'dribble'
              ? 0.62
              : state === 'run'
                ? 0.84
                : 1.06;
      this.cycle += dt * freq;

      const s = Math.sin(this.cycle);
      const c = Math.cos(this.cycle);

      hipY = (state === 'dribble' ? 0.82 : 0.84) + Math.abs(c) * (state === 'sprint' ? 0.075 : 0.045);
      const accelLean = THREE.MathUtils.clamp(accelRate * 0.014, -0.12, 0.16);
      torsoRotX = (state === 'sprint' || sprintingDribble ? 0.28 : state === 'dribble' ? 0.22 : 0.14) + accelLean;
      torsoRotZ = THREE.MathUtils.clamp(-turnRate * 0.045, -0.22, 0.22);
      torsoRotY = s * 0.09;

      lHipX = s * amp;
      rHipX = -s * amp;
      lKneeX = Math.max(0, -c) * (amp * 0.96);
      rKneeX = Math.max(0, c) * (amp * 0.96);

      lShX = -s * amp * 0.78;
      rShX = s * amp * 0.78;
      lShZ = state === 'dribble' ? 0.26 : 0.18;
      rShZ = state === 'dribble' ? -0.26 : -0.18;
      lElbX = -0.78;
      rElbX = -0.78;
    } else if (state === 'firstTouch') {
      // Cushioning foot extension on ball reception
      const p = THREE.MathUtils.clamp(this.actionTimer / this.actionDuration, 0, 1);
      const ease = Math.sin(p * Math.PI);
      hipY = 0.81;
      torsoRotX = 0.14 * ease;
      rHipX = -0.45 * ease;
      rKneeX = 0.42 * ease;
      lHipX = 0.18 * ease;
      lKneeX = 0.25 * ease;
      lShZ = 0.34;
      rShZ = -0.34;
    } else if (state === 'pass' || state === 'shoot' || state === 'cross' || state === 'lowShot') {
      const p = THREE.MathUtils.clamp(this.actionTimer / this.actionDuration, 0, 1);
      const swing = Math.sin(p * Math.PI);
      const power =
        state === 'shoot' ? 1.38 : state === 'lowShot' ? 1.18 : state === 'cross' ? 1.15 : 0.88;

      hipY = state === 'lowShot' ? 0.78 : 0.83;
      torsoRotX = state === 'lowShot' ? 0.24 : (p < 0.42 ? -0.14 : 0.28) * power;
      torsoRotY = -0.25 + p * 0.58;

      lHipX = 0.22;
      lKneeX = 0.38;
      rHipX = p < 0.34 ? 0.68 * power : -1.16 * swing * power;
      rKneeX = p < 0.34 ? 0.88 : 0.18;

      lShX = -0.55 * swing;
      lShZ = 0.48;
      rShX = 0.45 * swing;
      rShZ = -0.38;
      lElbX = -0.6;
      rElbX = -0.5;
    } else if (state === 'finesseShot') {
      // Curled inside-of-foot strike with open hip twist
      const p = THREE.MathUtils.clamp(this.actionTimer / this.actionDuration, 0, 1);
      const swing = Math.sin(p * Math.PI);
      hipY = 0.82;
      hipRotY = -0.25 + p * 0.65;
      torsoRotX = 0.16;
      torsoRotY = -0.35 + p * 0.8;
      torsoRotZ = -0.18 * swing;
      lHipX = 0.2;
      lKneeX = 0.35;
      rHipX = p < 0.32 ? 0.62 : -1.08 * swing;
      rHipZ = -0.32 * swing;
      rKneeX = p < 0.32 ? 0.82 : 0.25;
      lShX = -0.65 * swing;
      lShZ = 0.58;
      rShZ = -0.42;
    } else if (state === 'volley') {
      // Athletic airborne/scissor strike
      const p = THREE.MathUtils.clamp(this.actionTimer / this.actionDuration, 0, 1);
      const arc = Math.sin(p * Math.PI);
      hipY = 0.88 + arc * 0.36;
      hipRotZ = -0.48 * arc;
      torsoRotX = -0.22 * arc;
      torsoRotY = -0.45 + p * 0.9;
      lHipX = 0.3 * arc;
      lKneeX = 0.55 * arc;
      rHipX = p < 0.3 ? 0.72 : -1.35 * arc;
      rHipZ = -0.38 * arc;
      rKneeX = 0.16;
      lShZ = 0.78;
      rShZ = -0.78;
    } else if (state === 'jump' || state === 'header') {
      const p = THREE.MathUtils.clamp(this.actionTimer / this.actionDuration, 0, 1);
      const arc = Math.sin(p * Math.PI);
      hipY = 0.86 + arc * 0.66;
      torsoRotX = p < 0.42 ? -0.32 * arc : 0.48 * arc;
      headRotX = p < 0.42 ? -0.28 : 0.42;
      lKneeX = 0.55 * arc;
      rKneeX = 0.55 * arc;
      lShZ = 0.65;
      rShZ = -0.65;
    } else if (state === 'tackle') {
      // Extended realistic slide tackle (carrinho): low hip, extended front leg, trailing bent knee
      const p = THREE.MathUtils.clamp(this.actionTimer / this.actionDuration, 0, 1);
      const slide = Math.sin(p * Math.PI);
      hipY = 0.26 + (1 - slide) * 0.52;
      hipRotX = -1.24 * slide;
      torsoRotX = -0.38 * slide;
      rHipX = -0.82 * slide;
      rKneeX = 0.12;
      lHipX = 0.38 * slide;
      lKneeX = 1.05 * slide;
      lShX = 0.35 * slide;
      lShZ = 0.65;
      rShZ = -0.65;
    } else if (state === 'fall') {
      const p = THREE.MathUtils.clamp(this.actionTimer / this.actionDuration, 0, 1);
      const down = Math.sin(p * Math.PI);
      hipY = 0.86 - down * 0.56;
      hipRotX = 1.2 * down;
      lShX = -0.8 * down;
      rShX = -0.8 * down;
    } else if (state === 'celebrate') {
      this.cycle += dt * 9.0;
      const hop = Math.abs(Math.sin(this.cycle)) * 0.28;
      hipY = 0.86 + hop;
      torsoRotX = -0.14;
      lShX = -2.45;
      rShX = -2.45;
      lShZ = 0.55;
      rShZ = -0.55;
      lElbX = -0.2;
      rElbX = -0.2;
      lHipX = Math.sin(this.cycle) * 0.4;
      rHipX = -Math.sin(this.cycle) * 0.4;
    } else if (state === 'gkSave') {
      // Full diving aerial stretch
      const p = THREE.MathUtils.clamp(this.actionTimer / this.actionDuration, 0, 1);
      const dive = Math.sin(p * Math.PI);
      hipY = 0.52 + (1 - dive) * 0.36;
      hipRotZ = this.diveDir * 1.22 * dive;
      lShX = -2.3 * dive;
      rShX = -2.3 * dive;
      lShZ = 0.32;
      rShZ = -0.32;
      lElbX = -0.1;
      rElbX = -0.1;
    } else if (state === 'gkLowSave') {
      // Rapid low collapse along the grass
      const p = THREE.MathUtils.clamp(this.actionTimer / this.actionDuration, 0, 1);
      const dive = Math.sin(p * Math.PI);
      hipY = 0.24 + (1 - dive) * 0.56;
      hipRotZ = this.diveDir * 1.38 * dive;
      lShX = -1.75 * dive;
      rShX = -1.75 * dive;
      lShZ = 0.25;
      rShZ = -0.25;
      lKneeX = 0.45 * dive;
      rKneeX = 0.25 * dive;
    } else if (state === 'gkCatch') {
      // Clean catch cushioned to chest
      const p = THREE.MathUtils.clamp(this.actionTimer / this.actionDuration, 0, 1);
      const hold = Math.sin(p * Math.PI);
      hipY = 0.8;
      torsoRotX = 0.16 * hold;
      lShX = -1.15 * hold;
      rShX = -1.15 * hold;
      lShZ = 0.12;
      rShZ = -0.12;
      lElbX = -1.05 * hold;
      rElbX = -1.05 * hold;
    }

    // Smooth exponential damping for all joints
    const blend = 16;
    rig.hips.position.y = THREE.MathUtils.damp(rig.hips.position.y, hipY, blend, dt);
    rig.hips.rotation.x = THREE.MathUtils.damp(rig.hips.rotation.x, hipRotX, blend, dt);
    rig.hips.rotation.y = THREE.MathUtils.damp(rig.hips.rotation.y, hipRotY, blend, dt);
    rig.hips.rotation.z = THREE.MathUtils.damp(rig.hips.rotation.z, hipRotZ, blend, dt);

    rig.torso.rotation.x = THREE.MathUtils.damp(rig.torso.rotation.x, torsoRotX, blend, dt);
    rig.torso.rotation.y = THREE.MathUtils.damp(rig.torso.rotation.y, torsoRotY, blend, dt);
    rig.torso.rotation.z = THREE.MathUtils.damp(rig.torso.rotation.z, torsoRotZ, blend, dt);
    rig.headGroup.rotation.x = THREE.MathUtils.damp(rig.headGroup.rotation.x, headRotX, blend, dt);
    rig.headGroup.rotation.y = THREE.MathUtils.damp(rig.headGroup.rotation.y, headRotY, blend, dt);

    rig.leftHip.rotation.x = THREE.MathUtils.damp(rig.leftHip.rotation.x, lHipX, blend, dt);
    rig.rightHip.rotation.x = THREE.MathUtils.damp(rig.rightHip.rotation.x, rHipX, blend, dt);
    rig.leftHip.rotation.z = THREE.MathUtils.damp(rig.leftHip.rotation.z, lHipZ, blend, dt);
    rig.rightHip.rotation.z = THREE.MathUtils.damp(rig.rightHip.rotation.z, rHipZ, blend, dt);
    rig.leftKnee.rotation.x = THREE.MathUtils.damp(rig.leftKnee.rotation.x, lKneeX, blend, dt);
    rig.rightKnee.rotation.x = THREE.MathUtils.damp(rig.rightKnee.rotation.x, rKneeX, blend, dt);

    rig.leftShoulder.rotation.x = THREE.MathUtils.damp(rig.leftShoulder.rotation.x, lShX, blend, dt);
    rig.rightShoulder.rotation.x = THREE.MathUtils.damp(rig.rightShoulder.rotation.x, rShX, blend, dt);
    rig.leftShoulder.rotation.z = THREE.MathUtils.damp(rig.leftShoulder.rotation.z, lShZ, blend, dt);
    rig.rightShoulder.rotation.z = THREE.MathUtils.damp(rig.rightShoulder.rotation.z, rShZ, blend, dt);
    rig.leftElbow.rotation.x = THREE.MathUtils.damp(rig.leftElbow.rotation.x, lElbX, blend, dt);
    rig.rightElbow.rotation.x = THREE.MathUtils.damp(rig.rightElbow.rotation.x, rElbX, blend, dt);
  }
}
