import * as THREE from 'three';
import {
  BALL_RADIUS,
  GOAL_DEPTH,
  GOAL_HALF_WIDTH,
  GOAL_HEIGHT,
  HALF_LENGTH,
  HALF_WIDTH,
} from './types';
import type { PassKind } from './PassAssist';
import type { Player } from './Player';

const _spinAxis = new THREE.Vector3();
const _deltaQuat = new THREE.Quaternion();
const _closest = new THREE.Vector3();
const _diff = new THREE.Vector3();

function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export interface BallCallbacks {
  onBounce?: (impactSpeed: number) => void;
  onPostHit?: () => void;
}

export class BallPhysics {
  public readonly position = new THREE.Vector3(0, BALL_RADIUS, 0);
  public readonly velocity = new THREE.Vector3(0, 0, 0);
  public readonly spin = new THREE.Vector3(0, 0, 0); // rad/s
  public readonly quaternion = new THREE.Quaternion();

  public lastTouchedBy: Player | null = null;
  public lastTouchTime = 0;
  public owner: Player | null = null; // transient dribble reference (never permanently locked!)
  public intendedReceiver: Player | null = null;
  public readonly passTargetPos = new THREE.Vector3();
  public isPassInFlight = false;
  public passKind: PassKind = 'none';
  public passTargetHeight = BALL_RADIUS;
  public passDesiredArrivalSpeed = 4.8;
  public passElapsed = 0;
  private passClosestDist = Infinity;

  private readonly gravity = -19.5;
  private readonly bounceRestitution = 0.56;
  private readonly grassFriction = 2.35; // m/s^2 rolling deceleration
  private readonly airDrag = 0.18;

  public resetTo(x: number, z: number, y = BALL_RADIUS): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.spin.set(0, 0, 0);
    this.owner = null;
    this.clearPassAssist();
  }

  public setPassAssist(
    receiver: Player | null,
    targetX: number,
    targetZ: number,
    kind: PassKind,
    targetHeight = BALL_RADIUS,
    desiredArrivalSpeed = 4.8,
  ): void {
    this.intendedReceiver = receiver;
    this.passTargetPos.set(targetX, targetHeight, targetZ);
    this.passKind = kind;
    this.passTargetHeight = targetHeight;
    this.passDesiredArrivalSpeed = desiredArrivalSpeed;
    this.passElapsed = 0;
    this.passClosestDist = Infinity;
    this.isPassInFlight = receiver !== null;
  }

  public clearPassAssist(): void {
    this.intendedReceiver = null;
    this.isPassInFlight = false;
    this.passKind = 'none';
    this.passElapsed = 0;
    this.passClosestDist = Infinity;
  }

  public applyKick(
    dirX: number,
    dirZ: number,
    speed: number,
    loftSpeed: number,
    curveSpinY = 0,
    kicker: Player | null = null,
    elapsed = 0,
  ): void {
    const len = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / len;
    const nz = dirZ / len;

    this.velocity.set(nx * speed, loftSpeed, nz * speed);
    this.spin.set(nz * (speed / BALL_RADIUS) * 0.55, curveSpinY, -nx * (speed / BALL_RADIUS) * 0.55);
    this.owner = null;
    this.clearPassAssist();
    if (kicker) {
      this.lastTouchedBy = kicker;
      this.lastTouchTime = elapsed;
      kicker.ownKickGraceTimer = 0.14;
    }
  }

  public nudgeDribble(
    dirX: number,
    dirZ: number,
    targetSpeed: number,
    player: Player,
    elapsed: number,
  ): void {
    const len = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / len;
    const nz = dirZ / len;

    this.velocity.x = nx * targetSpeed;
    this.velocity.z = nz * targetSpeed;
    if (this.position.y <= BALL_RADIUS + 0.08) {
      this.velocity.y = Math.max(this.velocity.y, 0.35);
    }
    this.lastTouchedBy = player;
    this.lastTouchTime = elapsed;
  }

  private applyMagneticPassGuidance(h: number): void {
    if (this.owner || !this.isPassInFlight || !this.intendedReceiver) return;

    this.passElapsed += h;
    if (this.passElapsed > 3.2) {
      this.clearPassAssist();
      return;
    }

    const rec = this.intendedReceiver;
    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (hSpeed < 0.85) return;

    const recFwdX = Math.sin(rec.facingAngle);
    const recFwdZ = Math.cos(rec.facingAngle);
    const recSpeed = Math.hypot(rec.velocity.x, rec.velocity.z);
    const rawDistToRec = Math.hypot(rec.position.x - this.position.x, rec.position.z - this.position.z);

    const lookAhead = THREE.MathUtils.clamp((rawDistToRec / Math.max(hSpeed, 6.0)) * 0.52, 0, 0.28);
    const footX = rec.position.x + rec.velocity.x * lookAhead + recFwdX * 0.34;
    const footZ = rec.position.z + rec.velocity.z * lookAhead + recFwdZ * 0.34;

    let tx = footX;
    let tz = footZ;

    if (this.passKind === 'through') {
      const blendToRunner = THREE.MathUtils.clamp(1 - rawDistToRec / 5.5, 0.12, 0.72);
      tx = THREE.MathUtils.lerp(this.passTargetPos.x, footX + rec.velocity.x * 0.14, blendToRunner);
      tz = THREE.MathUtils.lerp(this.passTargetPos.z, footZ + rec.velocity.z * 0.14, blendToRunner);
    } else if (this.passKind === 'cross') {
      const blendToAttacker = THREE.MathUtils.clamp(1 - rawDistToRec / 6.0, 0.15, 0.55);
      tx = THREE.MathUtils.lerp(this.passTargetPos.x, footX, blendToAttacker);
      tz = THREE.MathUtils.lerp(this.passTargetPos.z, footZ, blendToAttacker);
    }

    tx = THREE.MathUtils.clamp(tx, -(HALF_LENGTH - 1.1), HALF_LENGTH - 1.1);
    tz = THREE.MathUtils.clamp(tz, -(HALF_WIDTH - 1.1), HALF_WIDTH - 1.1);

    const dx = tx - this.position.x;
    const dz = tz - this.position.z;
    const dist = Math.hypot(dx, dz);
    this.passClosestDist = Math.min(this.passClosestDist, dist);

    // Release guidance cleanly if ball has already passed the target without being trapped
    const forwardDot = (this.velocity.x * dx + this.velocity.z * dz) / (hSpeed * Math.max(dist, 0.001));
    if (
      (this.passElapsed > 0.16 && forwardDot < -0.18) ||
      (this.passClosestDist < 2.2 && dist > this.passClosestDist + 1.25)
    ) {
      this.clearPassAssist();
      return;
    }

    if (dist > 0.16) {
      const curAngle = Math.atan2(this.velocity.x, this.velocity.z);
      const desiredAngle = Math.atan2(dx, dz);
      const diff = normalizeAngle(desiredAngle - curAngle);

      if (this.passElapsed > 0.12 && Math.abs(diff) > 1.4) {
        this.clearPassAssist();
        return;
      }

      let maxTurn: number;
      let gain: number;
      if (this.passKind === 'cross') {
        maxTurn = 1.65;
        gain = 3.8;
      } else if (dist > 4.5) {
        maxTurn = 1.75;
        gain = 4.2;
      } else if (dist > 1.9) {
        maxTurn = 2.95;
        gain = 6.2;
      } else {
        maxTurn = 4.8;
        gain = 9.2;
      }

      const stepTurn = THREE.MathUtils.clamp(diff * gain, -maxTurn, maxTurn) * h;
      const newAngle = curAngle + stepTurn;
      this.velocity.x = Math.sin(newAngle) * hSpeed;
      this.velocity.z = Math.cos(newAngle) * hSpeed;
    }

    // Progressive arrival pacing so passes arrive cleanly at boot speed instead of blasting past
    if (
      (this.passKind === 'short' ||
        this.passKind === 'long' ||
        (this.passKind === 'through' && dist < 2.8)) &&
      dist < 3.4 &&
      this.position.y < 0.78
    ) {
      const targetPace = Math.max(this.passDesiredArrivalSpeed, recSpeed + 2.2);
      if (hSpeed > targetPace) {
        const desiredHere = THREE.MathUtils.lerp(
          targetPace,
          hSpeed,
          THREE.MathUtils.clamp(dist / 3.4, 0.22, 1),
        );
        const newSpeed = THREE.MathUtils.damp(hSpeed, desiredHere, 4.2, h);
        const ratio = newSpeed / hSpeed;
        this.velocity.x *= ratio;
        this.velocity.z *= ratio;
      }
      if (this.passKind === 'short' && dist < 2.4 && this.velocity.y > 0.7) {
        this.velocity.y *= Math.exp(-3.6 * h);
      }
    }
  }

  private updatePossessedDribble(owner: Player, dt: number): void {
    const prevX = this.position.x;
    const prevZ = this.position.z;

    const fwdX = Math.sin(owner.facingAngle);
    const fwdZ = Math.cos(owner.facingAngle);
    const rightX = fwdZ;
    const rightZ = -fwdX;

    const pSpeed = Math.hypot(owner.velocity.x, owner.velocity.z);
    const baseLead = owner.isShielding
      ? 0.36
      : pSpeed < 0.55
        ? 0.44
        : owner.isSprinting
          ? 0.58
          : 0.46;

    let strideLat = 0.05;
    let strideTap = 0;
    if (pSpeed > 0.55 && !owner.isShielding) {
      const cycle = owner.animation.getStrideCycle();
      strideLat = Math.sin(cycle) * 0.085;
      strideTap = Math.max(0, Math.cos(cycle * 2)) * (owner.isSprinting ? 0.095 : 0.045);
    } else if (owner.isShielding) {
      strideLat = 0;
    }

    let desOffX = fwdX * (baseLead + strideTap) + rightX * strideLat;
    let desOffZ = fwdZ * (baseLead + strideTap) + rightZ * strideLat;
    if (owner.isShielding) {
      desOffX += owner.shieldAwayX * 0.24;
      desOffZ += owner.shieldAwayZ * 0.24;
    }

    const prevOwnerX = owner.position.x - owner.velocity.x * dt;
    const prevOwnerZ = owner.position.z - owner.velocity.z * dt;
    const curOffX = this.position.x - prevOwnerX;
    const curOffZ = this.position.z - prevOwnerZ;
    const curR = Math.hypot(curOffX, curOffZ);
    const desR = Math.hypot(desOffX, desOffZ);

    let offX = desOffX;
    let offZ = desOffZ;

    if (curR >= 0.08 && curR <= 1.45) {
      // Polar/radial pivot keeps ball orbiting cleanly around the feet without clipping through legs
      const curAng = Math.atan2(curOffX, curOffZ);
      const desAng = Math.atan2(desOffX, desOffZ);
      const angDiff = normalizeAngle(desAng - curAng);
      const angBlend = 1 - Math.exp(-26 * dt);
      const nextAng = curAng + angDiff * angBlend;
      const nextR = THREE.MathUtils.clamp(
        THREE.MathUtils.damp(curR, desR, 28, dt),
        0.36,
        0.74,
      );
      offX = Math.sin(nextAng) * nextR;
      offZ = Math.cos(nextAng) * nextR;
    }

    this.position.x = THREE.MathUtils.clamp(owner.position.x + offX, -(HALF_LENGTH + 7), HALF_LENGTH + 7);
    this.position.z = THREE.MathUtils.clamp(owner.position.z + offZ, -24, 24);
    this.position.y = THREE.MathUtils.damp(this.position.y, BALL_RADIUS, 22, dt);
    if (this.position.y < BALL_RADIUS + 0.005) {
      this.position.y = BALL_RADIUS;
    }

    const safeDt = Math.max(dt, 0.004);
    this.velocity.set((this.position.x - prevX) / safeDt, 0, (this.position.z - prevZ) / safeDt);
    this.lastTouchedBy = owner;

    // Keep goal net containment & outer bounds valid if player carries ball over line
    this.resolveGoalNetContainment(-1);
    this.resolveGoalNetContainment(1);

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > 0.05) {
      _spinAxis.set(this.velocity.z, 0, -this.velocity.x).normalize();
      const angle = (speed * dt) / BALL_RADIUS;
      _deltaQuat.setFromAxisAngle(_spinAxis, angle);
      this.quaternion.premultiply(_deltaQuat).normalize();
    }
  }

  public step(dt: number, callbacks?: BallCallbacks): void {
    // When a player has controlled possession, ball stays tightly coupled to their foot zone
    if (this.owner && this.owner.stunTimer <= 0) {
      this.clearPassAssist();
      this.updatePossessedDribble(this.owner, dt);
      return;
    }

    // Sub-step twice for reliable goalpost and fast-shot collisions
    const subSteps = 2;
    const h = dt / subSteps;

    for (let s = 0; s < subSteps; s++) {
      // Subtle progressive magnetic guidance during active passes
      this.applyMagneticPassGuidance(h);

      // Gravity & air drag
      if (this.position.y > BALL_RADIUS + 0.002 || this.velocity.y > 0) {
        this.velocity.y += this.gravity * h;
        const drag = Math.exp(-this.airDrag * h);
        this.velocity.x *= drag;
        this.velocity.z *= drag;

        // Magnus curve effect from Y spin
        if (Math.abs(this.spin.y) > 0.1) {
          const magnus = 0.045 * this.spin.y;
          const vx = this.velocity.x;
          const vz = this.velocity.z;
          this.velocity.x += -vz * magnus * h;
          this.velocity.z += vx * magnus * h;
          this.spin.y *= Math.exp(-0.9 * h);
        }
      }

      // Integrate position
      this.position.x += this.velocity.x * h;
      this.position.y += this.velocity.y * h;
      this.position.z += this.velocity.z * h;

      // Ground contact & rolling friction
      if (this.position.y <= BALL_RADIUS) {
        if (this.velocity.y < -1.1) {
          callbacks?.onBounce?.(Math.abs(this.velocity.y) / 14);
        }
        this.position.y = BALL_RADIUS;
        if (this.velocity.y < -0.65) {
          this.velocity.y = -this.velocity.y * this.bounceRestitution;
        } else {
          this.velocity.y = 0;
        }

        const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
        if (horizSpeed > 0.02) {
          const drop = Math.min(horizSpeed, this.grassFriction * h);
          const scale = (horizSpeed - drop) / horizSpeed;
          this.velocity.x *= scale;
          this.velocity.z *= scale;
        } else {
          this.velocity.x = 0;
          this.velocity.z = 0;
        }
      }

      // Goalpost & Crossbar Collisions (both ends)
      this.resolveGoalFrameCollisions(-1, callbacks);
      this.resolveGoalFrameCollisions(1, callbacks);

      // Goal Net Containment (when ball enters inside the goal volume)
      this.resolveGoalNetContainment(-1);
      this.resolveGoalNetContainment(1);

      // Hard outer stadium boundary clamp so ball never leaves arena
      this.position.x = THREE.MathUtils.clamp(this.position.x, -(HALF_LENGTH + 7), HALF_LENGTH + 7);
      this.position.z = THREE.MathUtils.clamp(this.position.z, -24, 24);
    }

    // Clear stale pass-in-flight status once pass dies on turf
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.isPassInFlight && speed < 1.1 && this.position.y <= BALL_RADIUS + 0.08) {
      this.clearPassAssist();
    }

    // Visual roll rotation quaternion
    if (speed > 0.05) {
      // Axis perpendicular to horizontal velocity (vz, 0, -vx)
      _spinAxis.set(this.velocity.z, 0, -this.velocity.x).normalize();
      const angle = (speed * dt) / BALL_RADIUS;
      _deltaQuat.setFromAxisAngle(_spinAxis, angle);
      this.quaternion.premultiply(_deltaQuat).normalize();
    }
  }

  private resolveGoalFrameCollisions(side: -1 | 1, callbacks?: BallCallbacks): void {
    const gx = side * HALF_LENGTH;
    const postRadius = 0.09;
    const hitRadius = BALL_RADIUS + postRadius;

    // 2 Vertical posts: (gx, 0..GOAL_HEIGHT, ±GOAL_HALF_WIDTH)
    this.collideSegment(gx, 0, -GOAL_HALF_WIDTH, gx, GOAL_HEIGHT, -GOAL_HALF_WIDTH, hitRadius, callbacks);
    this.collideSegment(gx, 0, GOAL_HALF_WIDTH, gx, GOAL_HEIGHT, GOAL_HALF_WIDTH, hitRadius, callbacks);

    // Crossbar: (gx, GOAL_HEIGHT, -GOAL_HALF_WIDTH .. +GOAL_HALF_WIDTH)
    this.collideSegment(
      gx,
      GOAL_HEIGHT,
      -GOAL_HALF_WIDTH,
      gx,
      GOAL_HEIGHT,
      GOAL_HALF_WIDTH,
      hitRadius,
      callbacks,
    );
  }

  private collideSegment(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    hitRadius: number,
    callbacks?: BallCallbacks,
  ): void {
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const abLenSq = abx * abx + aby * aby + abz * abz;
    if (abLenSq < 1e-6) return;

    const t = THREE.MathUtils.clamp(
      ((this.position.x - ax) * abx +
        (this.position.y - ay) * aby +
        (this.position.z - az) * abz) /
        abLenSq,
      0,
      1,
    );

    _closest.set(ax + abx * t, ay + aby * t, az + abz * t);
    _diff.subVectors(this.position, _closest);
    const dist = _diff.length();

    if (dist < hitRadius && dist > 1e-5) {
      const normal = _diff.divideScalar(dist);
      this.position.copy(_closest).addScaledVector(normal, hitRadius + 0.005);

      const vn = this.velocity.dot(normal);
      if (vn < 0) {
        this.velocity.addScaledVector(normal, -(1 + 0.72) * vn);
        this.clearPassAssist();
        if (Math.abs(vn) > 2.0) {
          callbacks?.onPostHit?.();
        }
      }
    }
  }

  private resolveGoalNetContainment(side: -1 | 1): void {
    const lineX = side * HALF_LENGTH;
    const backX = lineX + side * GOAL_DEPTH;
    const inGoalX = side === -1 ? this.position.x < lineX : this.position.x > lineX;
    if (!inGoalX) return;

    if (Math.abs(this.position.z) < GOAL_HALF_WIDTH + 0.15 && this.position.y < GOAL_HEIGHT + 0.1) {
      // Back net
      if (side === -1 && this.position.x < backX + BALL_RADIUS) {
        this.position.x = backX + BALL_RADIUS;
        this.velocity.x = Math.abs(this.velocity.x) * 0.15;
        this.velocity.z *= 0.45;
      } else if (side === 1 && this.position.x > backX - BALL_RADIUS) {
        this.position.x = backX - BALL_RADIUS;
        this.velocity.x = -Math.abs(this.velocity.x) * 0.15;
        this.velocity.z *= 0.45;
      }

      // Side nets
      const maxZ = GOAL_HALF_WIDTH - BALL_RADIUS;
      if (this.position.z > maxZ) {
        this.position.z = maxZ;
        this.velocity.z = -Math.abs(this.velocity.z) * 0.2;
      } else if (this.position.z < -maxZ) {
        this.position.z = -maxZ;
        this.velocity.z = Math.abs(this.velocity.z) * 0.2;
      }

      // Roof net
      if (this.position.y > GOAL_HEIGHT - BALL_RADIUS) {
        this.position.y = GOAL_HEIGHT - BALL_RADIUS;
        this.velocity.y = -Math.abs(this.velocity.y) * 0.2;
      }
    }
  }
}
