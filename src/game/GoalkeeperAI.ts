import * as THREE from 'three';
import { BallPhysics } from './BallPhysics';
import { PassAssist } from './PassAssist';
import { Player } from './Player';
import { Team } from './Team';
import { GOAL_HALF_WIDTH, GOAL_HEIGHT, HALF_LENGTH } from './types';

export interface GoalkeeperEvents {
  onSave?: (gk: Player) => void;
  onDistribute?: (gk: Player) => void;
}

export class GoalkeeperAI {
  private holdTimer = 0;
  private diveCooldown = 0;

  public update(
    gk: Player,
    team: Team,
    opponent: Team,
    ball: BallPhysics,
    dt: number,
    elapsed: number,
    events?: GoalkeeperEvents,
  ): void {
    if (this.diveCooldown > 0) this.diveCooldown = Math.max(0, this.diveCooldown - dt);

    const ownGoalX = -team.attackDirection * HALF_LENGTH; // home: -32, away: +32
    const forwardDir = team.attackDirection; // home: +1, away: -1

    // 1. Holding ball -> brief poise then smart distribution
    if (ball.owner === gk) {
      gk.aiState = 'GK_HOLD';
      this.holdTimer += dt;
      gk.steer(forwardDir * 0.25, 0, false, true, dt);
      gk.facePoint(0, ball.position.z * 0.4, dt);

      if (this.holdTimer >= 0.72) {
        gk.aiState = 'GK_DISTRIBUTE';
        this.distributeBall(gk, team, opponent, ball, elapsed, events);
        this.holdTimer = 0;
      }
      return;
    }

    this.holdTimer = 0;

    // 2. Shot prediction & reactive saves (ground, aerial, or clean chest catch)
    const approachingOwnGoal =
      forwardDir === 1 ? ball.velocity.x < -3.2 : ball.velocity.x > 3.2;
    const distToGoal = Math.abs(ball.position.x - ownGoalX);

    if (approachingOwnGoal && distToGoal < 24 && this.diveCooldown <= 0) {
      const timeToLine = Math.abs((ownGoalX - ball.position.x) / ball.velocity.x);
      if (timeToLine > 0.03 && timeToLine < 1.35) {
        const predictedZ = ball.position.z + ball.velocity.z * timeToLine;
        const predictedY =
          ball.position.y + ball.velocity.y * timeToLine - 0.5 * 19.5 * timeToLine * timeToLine;

        if (Math.abs(predictedZ) <= GOAL_HALF_WIDTH + 1.1 && predictedY <= GOAL_HEIGHT + 0.65) {
          gk.aiState = 'GK_DIVE';
          const dz = predictedZ - gk.position.z;
          const speedNeeded = Math.min(11.2, Math.abs(dz) / Math.max(0.12, timeToLine));

          if (Math.abs(dz) > 0.42 && timeToLine < 0.65) {
            const diveSign = dz > 0 ? 1 : -1;
            const isLowShot = predictedY < 0.78;
            gk.velocity.set(0, 0, diveSign * speedNeeded);
            gk.animation.triggerAction(isLowShot ? 'gkLowSave' : 'gkSave', 0.54, diveSign);
            this.diveCooldown = 0.68;
          } else {
            gk.steer(0, dz, true, false, dt);
          }

          // Direct save contact check
          const ballDist = Math.hypot(
            ball.position.x - gk.position.x,
            ball.position.z - gk.position.z,
          );
          const saveRadius = gk.aiState === 'GK_DIVE' ? 1.26 : 1.12;
          if (ballDist < saveRadius && ball.position.y < GOAL_HEIGHT + 0.3 && gk.touchCooldown <= 0) {
            this.executeSave(gk, forwardDir, ball, elapsed, events);
          }
          gk.facePoint(ball.position.x, ball.position.z, dt);
          return;
        }
      }
    }

    // 3. Rush out (sweeper keeper) on loose balls inside box OR 1v1 danger near goal
    const oppHasBall = ball.owner !== null && ball.owner.side !== team.side;
    const isOneOnOneThreat =
      oppHasBall &&
      distToGoal < 14.0 &&
      Math.abs(ball.position.z) < 8.2 &&
      this.isBreakawayThreat(gk, team, ball);

    const isLooseInBox =
      !ball.owner && distToGoal < 10.5 && Math.abs(ball.position.z) < 7.8 && ball.position.y < 1.35;

    if (isLooseInBox || isOneOnOneThreat) {
      gk.aiState = 'RECOVER_LOOSE';
      const dx = ball.position.x + ball.velocity.x * 0.14 - gk.position.x;
      const dz = ball.position.z + ball.velocity.z * 0.14 - gk.position.z;
      gk.steer(dx, dz, true, false, dt);

      const d = Math.hypot(ball.position.x - gk.position.x, ball.position.z - gk.position.z);
      if (d < 1.02 && gk.touchCooldown <= 0) {
        if (!ball.owner) {
          ball.owner = gk;
          ball.clearPassAssist();
          gk.animation.triggerAction('gkCatch', 0.34);
          this.holdTimer = 0.1;
          events?.onSave?.(gk);
        } else {
          // Smother at attacker's feet!
          const prev = ball.owner;
          prev.touchCooldown = 0.5;
          prev.isShielding = false;
          ball.owner = gk;
          gk.animation.triggerAction('gkLowSave', 0.4, 1);
          this.holdTimer = 0.08;
          events?.onSave?.(gk);
        }
      }
      return;
    }

    // 4. Smart angle-bisector positioning: step slightly off line to narrow shooting angle
    gk.aiState = 'GK_TRACK';
    const dangerRatio = THREE.MathUtils.clamp(1 - distToGoal / 28, 0, 1);
    const stepOutDist = 1.45 + dangerRatio * 2.25;
    const targetX = ownGoalX + forwardDir * stepOutDist;

    // Bisect angle toward center of goal
    const ballFromGoalX = Math.max(2.4, Math.abs(ball.position.x - ownGoalX));
    const slopeZ = ball.position.z / ballFromGoalX;
    const rawTargetZ = slopeZ * stepOutDist * 1.4;
    const targetZ = THREE.MathUtils.clamp(rawTargetZ, -(GOAL_HALF_WIDTH - 0.5), GOAL_HALF_WIDTH - 0.5);

    const dx = targetX - gk.position.x;
    const dz = targetZ - gk.position.z;
    if (Math.hypot(dx, dz) > 0.12) {
      gk.steer(dx, dz, Math.hypot(dx, dz) > 1.1, false, dt);
    } else {
      gk.steer(0, 0, false, false, dt);
    }
    gk.facePoint(ball.position.x, ball.position.z, dt);
  }

  private isBreakawayThreat(gk: Player, team: Team, ball: BallPhysics): boolean {
    const ownGoalX = -team.attackDirection * HALF_LENGTH;
    const ballDist = Math.abs(ball.position.x - ownGoalX);
    const mates = team.getOutfielders();
    for (let i = 0; i < mates.length; i++) {
      const m = mates[i];
      const mDist = Math.abs(m.position.x - ownGoalX);
      if (mDist < ballDist - 0.8) {
        return false; // A defender is still goal-side
      }
    }
    return Math.hypot(ball.position.x - gk.position.x, ball.position.z - gk.position.z) < 11.2;
  }

  private executeSave(
    gk: Player,
    forwardDir: 1 | -1,
    ball: BallPhysics,
    elapsed: number,
    events?: GoalkeeperEvents,
  ): void {
    const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
    const latOffset = Math.abs(ball.position.z - gk.position.z);
    const canCatchCleanly = ballSpeed < 16.5 && latOffset < 0.72;

    if (canCatchCleanly) {
      ball.owner = gk;
      ball.clearPassAssist();
      ball.velocity.set(0, 0, 0);
      gk.animation.triggerAction('gkCatch', 0.36);
      this.holdTimer = 0.05;
    } else {
      // Parry wide toward touchline (never back toward penalty spot!)
      const sideSign = ball.position.z >= 0 ? 1 : -1;
      ball.owner = null;
      ball.clearPassAssist();
      ball.applyKick(forwardDir * 0.55, sideSign * 0.84, 12.6, 2.8, 0, gk, elapsed);
      gk.touchCooldown = 0.38;
    }
    events?.onSave?.(gk);
  }

  private distributeBall(
    gk: Player,
    team: Team,
    opponent: Team,
    ball: BallPhysics,
    elapsed: number,
    events?: GoalkeeperEvents,
  ): void {
    const plan = PassAssist.planGKDistribution(gk, team, opponent);
    if (plan && plan.target) {
      const dx = plan.targetX - gk.position.x;
      const dz = plan.targetZ - gk.position.z;
      gk.facingAngle = Math.atan2(dx, dz);
      gk.animation.triggerAction(plan.kind === 'long' ? 'cross' : 'pass', 0.36);
      ball.applyKick(dx, dz, plan.speed, plan.loft, 0, gk, elapsed);
      ball.setPassAssist(
        plan.target,
        plan.targetX,
        plan.targetZ,
        plan.kind,
        plan.targetY,
        plan.desiredArrivalSpeed,
      );
      gk.touchCooldown = 0.45;
      events?.onDistribute?.(gk);
    }
  }
}
