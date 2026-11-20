import * as THREE from 'three';
import { PlayerAnimation } from './PlayerAnimation';
import { PlayerModel } from './PlayerModel';
import {
  AIState,
  HALF_LENGTH,
  HALF_WIDTH,
  PlayerRole,
  PlayerRosterEntry,
  TeamPreset,
  TeamSide,
} from './types';

function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Player {
  public readonly id: string;
  public readonly name: string;
  public readonly number: number;
  public readonly role: PlayerRole;
  public readonly side: TeamSide;
  public readonly speedStat: number;
  public readonly skillStat: number;

  public readonly model: PlayerModel;
  public readonly animation = new PlayerAnimation();

  public readonly position = new THREE.Vector3();
  public readonly velocity = new THREE.Vector3();
  public readonly homeAnchor = new THREE.Vector3();

  public facingAngle = 0; // radians; 0 = +Z, PI/2 = +X, -PI/2 = -X
  public stamina = 100;
  public touchCooldown = 0;
  public stunTimer = 0;
  public tackleTimer = 0;
  public tackleCooldown = 0;
  public isHumanControlled = false;
  public isSupportingPress = false;
  public isCelebrating = false;
  public aiState: AIState = 'RETREAT';
  public aiDecisionTimer = 0;

  private prevSpeed = 0;
  private prevFacing = 0;
  private dribbleTouchTimer = 0;

  constructor(
    side: TeamSide,
    index: number,
    entry: PlayerRosterEntry,
    teamPreset: TeamPreset,
    maxAnisotropy: number,
  ) {
    this.id = `${side}-${index}-${entry.number}`;
    this.name = entry.name;
    this.number = entry.number;
    this.role = entry.role;
    this.side = side;
    this.speedStat = entry.speedStat;
    this.skillStat = entry.skillStat;

    this.model = new PlayerModel(entry, teamPreset, maxAnisotropy);
    this.facingAngle = side === 'home' ? Math.PI / 2 : -Math.PI / 2;
    this.prevFacing = this.facingAngle;
  }

  public get group(): THREE.Group {
    return this.model.rig.root;
  }

  public getForward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.facingAngle), 0, Math.cos(this.facingAngle));
  }

  public resetAt(x: number, z: number, facing: number): void {
    this.position.set(x, 0, z);
    this.velocity.set(0, 0, 0);
    this.facingAngle = facing;
    this.prevFacing = facing;
    this.prevSpeed = 0;
    this.touchCooldown = 0;
    this.stunTimer = 0;
    this.tackleTimer = 0;
    this.tackleCooldown = 0;
    this.isCelebrating = false;
    this.isSupportingPress = false;
    this.syncVisuals();
  }

  public steer(
    dirX: number,
    dirZ: number,
    sprint: boolean,
    hasBall: boolean,
    dt: number,
  ): void {
    if (this.stunTimer > 0) {
      this.velocity.multiplyScalar(Math.exp(-8 * dt));
      this.integratePosition(dt);
      return;
    }

    if (this.tackleTimer > 0) {
      this.velocity.multiplyScalar(Math.exp(-3.4 * dt));
      this.integratePosition(dt);
      return;
    }

    const inputLen = Math.hypot(dirX, dirZ);
    const baseWalk = 5.4 * this.speedStat;
    const baseSprint = 7.7 * this.speedStat;
    const dribblePenalty = hasBall ? 0.91 : 1.0;

    const canSprint = sprint && this.stamina > 8;
    const maxSpeed = (canSprint ? baseSprint : baseWalk) * dribblePenalty;

    if (inputLen > 0.08) {
      const nx = dirX / inputLen;
      const nz = dirZ / inputLen;
      const targetSpeed = maxSpeed * Math.min(1, inputLen);

      const accel = 11.5;
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, nx * targetSpeed, accel, dt);
      this.velocity.z = THREE.MathUtils.damp(this.velocity.z, nz * targetSpeed, accel, dt);

      const desiredAngle = Math.atan2(nx, nz);
      const angleDiff = normalizeAngle(desiredAngle - this.facingAngle);
      const turnSpeed = hasBall ? 9.5 : 13.0;
      this.facingAngle = normalizeAngle(
        this.facingAngle + THREE.MathUtils.clamp(angleDiff, -turnSpeed * dt, turnSpeed * dt),
      );

      if (canSprint && inputLen > 0.6) {
        this.stamina = Math.max(0, this.stamina - 16 * dt);
      } else {
        this.stamina = Math.min(100, this.stamina + 9 * dt);
      }
    } else {
      // Smooth deceleration
      const decel = 9.2;
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, decel, dt);
      this.velocity.z = THREE.MathUtils.damp(this.velocity.z, 0, decel, dt);
      this.stamina = Math.min(100, this.stamina + 14 * dt);
    }

    this.integratePosition(dt);
  }

  public facePoint(tx: number, tz: number, dt: number): void {
    const dx = tx - this.position.x;
    const dz = tz - this.position.z;
    if (dx * dx + dz * dz < 0.01) return;
    const desired = Math.atan2(dx, dz);
    const diff = normalizeAngle(desired - this.facingAngle);
    this.facingAngle = normalizeAngle(
      this.facingAngle + THREE.MathUtils.clamp(diff, -10 * dt, 10 * dt),
    );
  }

  public startTackle(dirX: number, dirZ: number): void {
    if (this.tackleCooldown > 0 || this.stunTimer > 0 || this.tackleTimer > 0) return;
    const len = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / len;
    const nz = dirZ / len;
    this.facingAngle = Math.atan2(nx, nz);
    this.velocity.set(nx * 10.6, 0, nz * 10.6);
    this.tackleTimer = 0.44;
    this.tackleCooldown = 1.05;
    this.animation.triggerAction('tackle', 0.44);
  }

  public tickTimersAndAnimation(dt: number, hasBall: boolean): void {
    if (this.touchCooldown > 0) this.touchCooldown = Math.max(0, this.touchCooldown - dt);
    if (this.stunTimer > 0) this.stunTimer = Math.max(0, this.stunTimer - dt);
    if (this.tackleTimer > 0) this.tackleTimer = Math.max(0, this.tackleTimer - dt);
    if (this.tackleCooldown > 0) this.tackleCooldown = Math.max(0, this.tackleCooldown - dt);
    if (this.aiDecisionTimer > 0) this.aiDecisionTimer = Math.max(0, this.aiDecisionTimer - dt);
    if (this.dribbleTouchTimer > 0) this.dribbleTouchTimer = Math.max(0, this.dribbleTouchTimer - dt);

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const accelRate = (speed - this.prevSpeed) / Math.max(dt, 0.001);
    const turnRate = normalizeAngle(this.facingAngle - this.prevFacing) / Math.max(dt, 0.001);
    this.prevSpeed = speed;
    this.prevFacing = this.facingAngle;

    this.animation.update(
      this.model.rig,
      dt,
      speed,
      accelRate,
      turnRate,
      hasBall,
      this.isCelebrating,
    );

    this.model.rig.selectionRing.visible = this.isHumanControlled && !this.isCelebrating;
    this.model.rig.supportRing.visible = this.isSupportingPress && !this.isHumanControlled;

    this.syncVisuals();
  }

  public canDribbleNudge(): boolean {
    if (this.dribbleTouchTimer <= 0) {
      this.dribbleTouchTimer = 0.14;
      return true;
    }
    return false;
  }

  private integratePosition(dt: number): void {
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -(HALF_LENGTH + 1.6), HALF_LENGTH + 1.6);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -(HALF_WIDTH + 1.6), HALF_WIDTH + 1.6);
  }

  public syncVisuals(): void {
    this.model.rig.root.position.copy(this.position);
    this.model.rig.root.rotation.y = this.facingAngle;
  }
}
