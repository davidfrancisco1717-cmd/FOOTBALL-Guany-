import * as THREE from 'three';
import { CameraMode, HALF_LENGTH } from './types';

export class CameraController {
  public readonly camera: THREE.PerspectiveCamera;

  private mode: CameraMode = 'tv';
  private zoom = 1.0;
  private currentPos = new THREE.Vector3(0, 18, 34);
  private currentLookAt = new THREE.Vector3(0, 0, 0);
  private desiredPos = new THREE.Vector3();
  private desiredLookAt = new THREE.Vector3();
  private shakeIntensity = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.5, 320);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }

  public setMode(mode: CameraMode): void {
    this.mode = mode;
  }

  public setZoom(zoom: number): void {
    this.zoom = THREE.MathUtils.clamp(zoom, 0.72, 1.38);
  }

  public triggerShake(amount = 0.35): void {
    this.shakeIntensity = Math.min(0.65, this.shakeIntensity + amount);
  }

  public snapToGameplay(ballPos: THREE.Vector3): void {
    this.computeGameplayTargets(ballPos, new THREE.Vector3(), false, null);
    this.currentPos.copy(this.desiredPos);
    this.currentLookAt.copy(this.desiredLookAt);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }

  private computeGameplayTargets(
    ballPos: THREE.Vector3,
    ballVel: THREE.Vector3,
    isGoalCelebration: boolean,
    scorerPos: THREE.Vector3 | null,
  ): void {
    if (isGoalCelebration && scorerPos) {
      this.desiredLookAt.set(scorerPos.x, 1.2, scorerPos.z);
      this.desiredPos.set(
        THREE.MathUtils.clamp(scorerPos.x * 0.85, -24, 24),
        7.5,
        scorerPos.z + 14.5,
      );
      return;
    }

    const lookAheadX = THREE.MathUtils.clamp(ballVel.x * 0.28, -4.5, 4.5);
    const lookAheadZ = THREE.MathUtils.clamp(ballVel.z * 0.22, -2.5, 2.5);

    const targetX = THREE.MathUtils.clamp(ballPos.x + lookAheadX, -26, 26);
    const targetZ = THREE.MathUtils.clamp(ballPos.z * 0.65 + lookAheadZ, -13, 13);

    // Subtle zoom-in when ball enters penalty box
    const boxDanger = Math.max(0, (Math.abs(ballPos.x) - 18) / (HALF_LENGTH - 18));
    const zoomScale = (1 / this.zoom) * (1 - boxDanger * 0.14);

    if (this.mode === 'tv') {
      // Classic broadcast TV camera
      const baseHeight = 18.5 * zoomScale;
      const baseDistZ = 30.5 * zoomScale;
      this.desiredLookAt.set(targetX * 0.86, 0.6, targetZ * 0.68);
      this.desiredPos.set(targetX * 0.72, baseHeight, baseDistZ + targetZ * 0.32);
    } else {
      // Closer PSP-style angled gameplay camera
      const baseHeight = 11.2 * zoomScale;
      const baseDistZ = 18.8 * zoomScale;
      this.desiredLookAt.set(targetX * 0.94, 0.85, targetZ * 0.84);
      this.desiredPos.set(targetX * 0.88, baseHeight, baseDistZ + targetZ * 0.56);
    }
  }

  public updateMenuOrbit(dt: number, elapsed: number): void {
    const angle = elapsed * 0.11;
    this.desiredPos.set(
      Math.sin(angle) * 44,
      19 + Math.sin(elapsed * 0.2) * 2.5,
      Math.cos(angle) * 32,
    );
    this.desiredLookAt.set(0, 1.2, 0);

    this.currentPos.x = THREE.MathUtils.damp(this.currentPos.x, this.desiredPos.x, 3.2, dt);
    this.currentPos.y = THREE.MathUtils.damp(this.currentPos.y, this.desiredPos.y, 3.2, dt);
    this.currentPos.z = THREE.MathUtils.damp(this.currentPos.z, this.desiredPos.z, 3.2, dt);
    this.currentLookAt.lerp(this.desiredLookAt, 1 - Math.exp(-3.5 * dt));

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }

  public updateGameplay(
    dt: number,
    ballPos: THREE.Vector3,
    ballVel: THREE.Vector3,
    isGoalCelebration: boolean,
    scorerPos: THREE.Vector3 | null,
  ): void {
    this.computeGameplayTargets(ballPos, ballVel, isGoalCelebration, scorerPos);

    const posLambda = isGoalCelebration ? 3.5 : 5.4;
    const lookLambda = isGoalCelebration ? 5.0 : 7.5;

    this.currentPos.x = THREE.MathUtils.damp(this.currentPos.x, this.desiredPos.x, posLambda, dt);
    this.currentPos.y = THREE.MathUtils.damp(this.currentPos.y, this.desiredPos.y, posLambda, dt);
    this.currentPos.z = THREE.MathUtils.damp(this.currentPos.z, this.desiredPos.z, posLambda, dt);

    this.currentLookAt.x = THREE.MathUtils.damp(this.currentLookAt.x, this.desiredLookAt.x, lookLambda, dt);
    this.currentLookAt.y = THREE.MathUtils.damp(this.currentLookAt.y, this.desiredLookAt.y, lookLambda, dt);
    this.currentLookAt.z = THREE.MathUtils.damp(this.currentLookAt.z, this.desiredLookAt.z, lookLambda, dt);

    this.camera.position.copy(this.currentPos);
    if (this.shakeIntensity > 0.005) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity * 0.7;
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 1.9);
    }
    this.camera.lookAt(this.currentLookAt);
  }
}
