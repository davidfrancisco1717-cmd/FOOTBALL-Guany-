import * as THREE from 'three';
import {
  BALL_RADIUS,
  GOAL_DEPTH,
  GOAL_HALF_WIDTH,
  GOAL_HEIGHT,
  HALF_LENGTH,
} from './types';
import type { Player } from './Player';

const _spinAxis = new THREE.Vector3();
const _deltaQuat = new THREE.Quaternion();
const _closest = new THREE.Vector3();
const _diff = new THREE.Vector3();

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

  private readonly gravity = -19.5;
  private readonly bounceRestitution = 0.56;
  private readonly grassFriction = 2.35; // m/s^2 rolling deceleration
  private readonly airDrag = 0.18;

  public resetTo(x: number, z: number, y = BALL_RADIUS): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.spin.set(0, 0, 0);
    this.owner = null;
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
    if (kicker) {
      this.lastTouchedBy = kicker;
      this.lastTouchTime = elapsed;
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

  public step(dt: number, callbacks?: BallCallbacks): void {
    // Sub-step twice for reliable goalpost and fast-shot collisions
    const subSteps = 2;
    const h = dt / subSteps;

    for (let s = 0; s < subSteps; s++) {
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

    // Visual roll rotation quaternion
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
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
