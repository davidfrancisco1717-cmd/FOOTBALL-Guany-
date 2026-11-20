import * as THREE from 'three';
import { CameraMode, HALF_LENGTH, HALF_WIDTH } from './types';

export class CameraController {
  public readonly camera: THREE.PerspectiveCamera;

  private mode: CameraMode = 'tv';
  private zoom = 1.0;
  private aspect = 16 / 9;

  // Double-smoothed focal & camera states to eliminate any abrupt jumps
  private smoothedBallVel = new THREE.Vector3();
  private smoothedGoalZoom = 0;
  private smoothedFlightZoom = 0;
  private focusPoint = new THREE.Vector3(0, 0.7, 0);
  private currentPos = new THREE.Vector3(0, 18.8, 35.5);
  private currentLookAt = new THREE.Vector3(0, 0.75, 0.4);
  private desiredPos = new THREE.Vector3();
  private desiredLookAt = new THREE.Vector3();
  private desiredFov = 31.5;
  private currentFov = 31.5;
  private shakeIntensity = 0;

  constructor(aspect: number) {
    this.aspect = Math.max(0.5, aspect || 16 / 9);
    this.camera = new THREE.PerspectiveCamera(this.currentFov, this.aspect, 0.5, 340);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }

  public setAspect(aspect: number): void {
    this.aspect = Math.max(0.5, aspect || 16 / 9);
  }

  public setMode(mode: CameraMode): void {
    this.mode = mode;
  }

  public setZoom(zoom: number): void {
    this.zoom = THREE.MathUtils.clamp(zoom, 0.75, 1.35);
  }

  public triggerShake(amount = 0.25): void {
    // TV broadcast cameras on stadium gantries stay rock-steady
    if (this.mode === 'tv') return;
    this.shakeIntensity = Math.min(0.45, this.shakeIntensity + amount);
  }

  public snapToGameplay(ballPos: THREE.Vector3): void {
    this.smoothedBallVel.set(0, 0, 0);
    this.smoothedGoalZoom = 0;
    this.smoothedFlightZoom = 0;
    this.focusPoint.set(ballPos.x, 0.7, ballPos.z);
    this.shakeIntensity = 0;

    this.computeGameplayTargets(ballPos, null, false, null, 0.016);
    this.currentPos.copy(this.desiredPos);
    this.currentLookAt.copy(this.desiredLookAt);
    this.currentFov = this.desiredFov;
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }

  private computeGameplayTargets(
    ballPos: THREE.Vector3,
    activePlayerPos: THREE.Vector3 | null,
    isGoalCelebration: boolean,
    scorerPos: THREE.Vector3 | null,
    dt: number,
  ): void {
    if (isGoalCelebration && scorerPos) {
      this.desiredLookAt.set(
        THREE.MathUtils.clamp(scorerPos.x, -28, 28),
        1.15,
        THREE.MathUtils.clamp(scorerPos.z, -16, 16),
      );
      this.desiredPos.set(
        THREE.MathUtils.clamp(scorerPos.x * 0.78, -24, 24),
        10.5,
        THREE.MathUtils.clamp(scorerPos.z + 19.5, 8, 36),
      );
      this.desiredFov = 34;
      return;
    }

    if (this.mode === 'tv') {
      // Authentic lateral Tele Broadcast camera mounted on main stand gantry
      const horizSpeed = Math.hypot(this.smoothedBallVel.x, this.smoothedBallVel.z);

      // Smooth forward anticipation along ball trajectory (stronger on fast passes/crosses)
      const leadTime = THREE.MathUtils.clamp(0.22 + horizSpeed * 0.015, 0.22, 0.48);
      const leadX = THREE.MathUtils.clamp(this.smoothedBallVel.x * leadTime, -6.4, 6.4);
      const leadZ = THREE.MathUtils.clamp(this.smoothedBallVel.z * leadTime, -3.6, 3.6);

      // Blend subtly with active player when near ball so 1v1 duels & passing options remain clear
      let rawFocusX = ballPos.x + leadX;
      let rawFocusZ = ballPos.z + leadZ;
      if (activePlayerPos) {
        const distToPlayer = Math.hypot(
          ballPos.x - activePlayerPos.x,
          ballPos.z - activePlayerPos.z,
        );
        if (distToPlayer < 8.5) {
          rawFocusX = THREE.MathUtils.lerp(rawFocusX, activePlayerPos.x, 0.14);
          rawFocusZ = THREE.MathUtils.lerp(rawFocusZ, activePlayerPos.z, 0.12);
        }
      }

      // Smooth focus point first to prevent jerky camera pans on sudden deflections
      this.focusPoint.x = THREE.MathUtils.damp(
        this.focusPoint.x,
        THREE.MathUtils.clamp(rawFocusX, -29.0, 29.0),
        5.2,
        dt,
      );
      this.focusPoint.z = THREE.MathUtils.damp(
        this.focusPoint.z,
        THREE.MathUtils.clamp(rawFocusZ, -18.5, 18.5),
        4.4,
        dt,
      );

      // Gentle cinematic zoom as play enters penalty box
      const boxProximity = THREE.MathUtils.clamp(
        (Math.abs(ballPos.x) - 16.0) / (HALF_LENGTH - 16.0),
        0,
        1,
      );
      this.smoothedGoalZoom = THREE.MathUtils.damp(
        this.smoothedGoalZoom,
        boxProximity,
        2.6,
        dt,
      );

      // Slight panoramic pull-back during fast long balls / crosses
      const flightFactor = THREE.MathUtils.clamp(
        (horizSpeed - 11.5) / 11 + Math.max(0, ballPos.y - 1.0) * 0.26,
        0,
        1,
      );
      this.smoothedFlightZoom = THREE.MathUtils.damp(
        this.smoothedFlightZoom,
        flightFactor,
        3.0,
        dt,
      );

      // Lateral gantry tracking: camera travels 78% laterally while lookAt tracks 94% for true TV perspective
      const camX = THREE.MathUtils.clamp(this.focusPoint.x * 0.78, -22.5, 22.5);
      const lookX = THREE.MathUtils.clamp(this.focusPoint.x * 0.94, -27.5, 27.5);

      const sideRatio = THREE.MathUtils.clamp(this.focusPoint.z / HALF_WIDTH, -1, 1);
      const lookZ = sideRatio * 9.2 + 0.4;
      const camHeight = 18.8 - this.smoothedGoalZoom * 1.8 + this.smoothedFlightZoom * 1.1;
      const camZ = 35.5 + sideRatio * 3.8 - this.smoothedGoalZoom * 1.6;

      // Adapt FOV gracefully if screen aspect is narrower than 16:10 so touchlines remain visible
      const narrowBoost = THREE.MathUtils.clamp((1.65 - this.aspect) * 10.5, 0, 8.5);
      const baseFov = (31.5 + narrowBoost) / this.zoom;
      this.desiredFov = THREE.MathUtils.clamp(
        baseFov - this.smoothedGoalZoom * 2.8 + this.smoothedFlightZoom * 2.2,
        23,
        46,
      );

      this.desiredPos.set(camX, camHeight, camZ);
      this.desiredLookAt.set(lookX, 0.75, lookZ);
    } else {
      // Preserved PSP-style closer angled gameplay camera
      const leadX = THREE.MathUtils.clamp(this.smoothedBallVel.x * 0.25, -4.2, 4.2);
      const leadZ = THREE.MathUtils.clamp(this.smoothedBallVel.z * 0.2, -2.4, 2.4);

      const targetX = THREE.MathUtils.clamp(ballPos.x + leadX, -26, 26);
      const targetZ = THREE.MathUtils.clamp(ballPos.z * 0.68 + leadZ, -13.5, 13.5);

      const boxDanger = Math.max(0, (Math.abs(ballPos.x) - 18) / (HALF_LENGTH - 18));
      const zoomScale = (1 / this.zoom) * (1 - boxDanger * 0.12);

      const baseHeight = 11.4 * zoomScale;
      const baseDistZ = 19.2 * zoomScale;
      this.desiredFov = 42;
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
    this.desiredFov = 40;

    this.currentPos.x = THREE.MathUtils.damp(this.currentPos.x, this.desiredPos.x, 3.2, dt);
    this.currentPos.y = THREE.MathUtils.damp(this.currentPos.y, this.desiredPos.y, 3.2, dt);
    this.currentPos.z = THREE.MathUtils.damp(this.currentPos.z, this.desiredPos.z, 3.2, dt);
    this.currentLookAt.lerp(this.desiredLookAt, 1 - Math.exp(-3.5 * dt));

    this.currentFov = THREE.MathUtils.damp(this.currentFov, this.desiredFov, 4.0, dt);
    if (Math.abs(this.camera.fov - this.currentFov) > 0.02) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }

  public updateGameplay(
    dt: number,
    ballPos: THREE.Vector3,
    ballVel: THREE.Vector3,
    isGoalCelebration: boolean,
    scorerPos: THREE.Vector3 | null,
    activePlayerPos: THREE.Vector3 | null = null,
  ): void {
    // Low-pass filter ball velocity so sudden kicks produce fluid broadcast pans
    this.smoothedBallVel.x = THREE.MathUtils.damp(this.smoothedBallVel.x, ballVel.x, 6.0, dt);
    this.smoothedBallVel.y = THREE.MathUtils.damp(this.smoothedBallVel.y, ballVel.y, 6.0, dt);
    this.smoothedBallVel.z = THREE.MathUtils.damp(this.smoothedBallVel.z, ballVel.z, 6.0, dt);

    this.computeGameplayTargets(
      ballPos,
      activePlayerPos,
      isGoalCelebration,
      scorerPos,
      dt,
    );

    const isTV = this.mode === 'tv';
    const posLambda = isGoalCelebration ? 3.0 : isTV ? 3.8 : 5.4;
    const lookLambda = isGoalCelebration ? 4.2 : isTV ? 5.2 : 7.5;

    this.currentPos.x = THREE.MathUtils.damp(this.currentPos.x, this.desiredPos.x, posLambda, dt);
    this.currentPos.y = THREE.MathUtils.damp(this.currentPos.y, this.desiredPos.y, posLambda, dt);
    this.currentPos.z = THREE.MathUtils.damp(this.currentPos.z, this.desiredPos.z, posLambda, dt);

    this.currentLookAt.x = THREE.MathUtils.damp(this.currentLookAt.x, this.desiredLookAt.x, lookLambda, dt);
    this.currentLookAt.y = THREE.MathUtils.damp(this.currentLookAt.y, this.desiredLookAt.y, lookLambda, dt);
    this.currentLookAt.z = THREE.MathUtils.damp(this.currentLookAt.z, this.desiredLookAt.z, lookLambda, dt);

    this.currentFov = THREE.MathUtils.damp(this.currentFov, this.desiredFov, 3.6, dt);
    if (Math.abs(this.camera.fov - this.currentFov) > 0.02) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    this.camera.position.copy(this.currentPos);
    if (!isTV && this.shakeIntensity > 0.005) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity * 0.7;
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 1.9);
    } else {
      this.shakeIntensity = 0;
    }

    this.camera.lookAt(this.currentLookAt);
  }
}
