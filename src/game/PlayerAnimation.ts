import * as THREE from 'three';
import { PlayerAnimState } from './types';
import { PlayerRig } from './PlayerModel';

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

  public update(
    rig: PlayerRig,
    dt: number,
    speed: number,
    accelRate: number,
    turnRate: number,
    hasBall: boolean,
    isCelebrating: boolean,
  ): void {
    // Advance one-shot action timer
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
    } else if (speed > 6.3) {
      state = 'sprint';
    } else if (speed > 2.4) {
      state = hasBall ? 'dribble' : 'run';
    } else if (speed > 0.35) {
      state = 'walk';
    }

    // Target joint angles
    let hipY = 0.86;
    let hipRotX = 0;
    let hipRotZ = 0;
    let torsoRotX = 0;
    let torsoRotY = 0;
    let torsoRotZ = 0;
    let headRotX = 0;

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
    } else if (state === 'walk' || state === 'run' || state === 'sprint' || state === 'dribble') {
      const freq =
        state === 'walk' ? 6.5 : state === 'dribble' ? 10.5 : state === 'run' ? 11.5 : 14.5;
      const amp =
        state === 'walk' ? 0.38 : state === 'dribble' ? 0.62 : state === 'run' ? 0.82 : 1.04;
      this.cycle += dt * freq;

      const s = Math.sin(this.cycle);
      const c = Math.cos(this.cycle);

      hipY = 0.84 + Math.abs(c) * (state === 'sprint' ? 0.075 : 0.045);
      // Forward torso lean scales with speed & acceleration, slight upright when decelerating
      const accelLean = THREE.MathUtils.clamp(accelRate * 0.015, -0.12, 0.16);
      torsoRotX = (state === 'sprint' ? 0.28 : state === 'dribble' ? 0.22 : 0.14) + accelLean;
      // Banking on sharp turns
      torsoRotZ = THREE.MathUtils.clamp(-turnRate * 0.045, -0.22, 0.22);
      torsoRotY = s * 0.08;

      lHipX = s * amp;
      rHipX = -s * amp;
      lKneeX = Math.max(0, -c) * (amp * 0.95);
      rKneeX = Math.max(0, c) * (amp * 0.95);

      lShX = -s * amp * 0.78;
      rShX = s * amp * 0.78;
      lShZ = 0.18;
      rShZ = -0.18;
      lElbX = -0.75;
      rElbX = -0.75;
    } else if (state === 'pass' || state === 'shoot' || state === 'cross') {
      const p = THREE.MathUtils.clamp(this.actionTimer / this.actionDuration, 0, 1);
      const swing = Math.sin(p * Math.PI);
      const power = state === 'shoot' ? 1.35 : state === 'cross' ? 1.15 : 0.88;

      hipY = 0.83;
      torsoRotX = (p < 0.45 ? -0.12 : 0.26) * power;
      torsoRotY = -0.25 + p * 0.55;

      // Plant left leg, swing right leg back then forward
      lHipX = 0.22;
      lKneeX = 0.35;
      rHipX = p < 0.35 ? 0.65 * power : -1.15 * swing * power;
      rKneeX = p < 0.35 ? 0.85 : 0.18;

      lShX = -0.5 * swing;
      lShZ = 0.45;
      rShX = 0.45 * swing;
      rShZ = -0.38;
      lElbX = -0.6;
      rElbX = -0.5;
    } else if (state === 'jump' || state === 'header') {
      const p = THREE.MathUtils.clamp(this.actionTimer / this.actionDuration, 0, 1);
      const arc = Math.sin(p * Math.PI);
      hipY = 0.86 + arc * 0.62;
      torsoRotX = p < 0.45 ? -0.28 * arc : 0.42 * arc;
      headRotX = p < 0.45 ? -0.25 : 0.35;
      lKneeX = 0.55 * arc;
      rKneeX = 0.55 * arc;
      lShZ = 0.65;
      rShZ = -0.65;
    } else if (state === 'tackle') {
      const p = THREE.MathUtils.clamp(this.actionTimer / this.actionDuration, 0, 1);
      const slide = Math.sin(p * Math.PI);
      hipY = 0.32 + (1 - slide) * 0.42;
      hipRotX = -1.15 * slide;
      torsoRotX = -0.35 * slide;
      rHipX = -0.75 * slide;
      lHipX = 0.35 * slide;
      lKneeX = 0.9 * slide;
      lShZ = 0.55;
      rShZ = -0.55;
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
      const p = THREE.MathUtils.clamp(this.actionTimer / this.actionDuration, 0, 1);
      const dive = Math.sin(p * Math.PI);
      hipY = 0.45 + (1 - dive) * 0.4;
      hipRotZ = this.diveDir * 1.15 * dive;
      lShX = -2.2 * dive;
      rShX = -2.2 * dive;
      lShZ = 0.35;
      rShZ = -0.35;
      lElbX = -0.1;
      rElbX = -0.1;
    }

    // Smooth exponential damping for all joints
    const blend = 16;
    rig.hips.position.y = THREE.MathUtils.damp(rig.hips.position.y, hipY, blend, dt);
    rig.hips.rotation.x = THREE.MathUtils.damp(rig.hips.rotation.x, hipRotX, blend, dt);
    rig.hips.rotation.z = THREE.MathUtils.damp(rig.hips.rotation.z, hipRotZ, blend, dt);

    rig.torso.rotation.x = THREE.MathUtils.damp(rig.torso.rotation.x, torsoRotX, blend, dt);
    rig.torso.rotation.y = THREE.MathUtils.damp(rig.torso.rotation.y, torsoRotY, blend, dt);
    rig.torso.rotation.z = THREE.MathUtils.damp(rig.torso.rotation.z, torsoRotZ, blend, dt);
    rig.headGroup.rotation.x = THREE.MathUtils.damp(rig.headGroup.rotation.x, headRotX, blend, dt);

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
