import * as THREE from 'three';
import { BallPhysics } from './BallPhysics';
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
    ball: BallPhysics,
    dt: number,
    elapsed: number,
    events?: GoalkeeperEvents,
  ): void {
    if (this.diveCooldown > 0) this.diveCooldown = Math.max(0, this.diveCooldown - dt);

    const ownGoalX = -team.attackDirection * HALF_LENGTH; // home: -32, away: +32
    const forwardDir = team.attackDirection; // home: +1, away: -1

    // If GK holds/owns the ball, hold briefly then pass to open teammate
    if (ball.owner === gk) {
      gk.aiState = 'GK_HOLD';
      this.holdTimer += dt;
      gk.steer(forwardDir * 0.3, 0, false, true, dt);
      gk.facePoint(0, ball.position.z * 0.5, dt);

      if (this.holdTimer >= 0.72) {
        gk.aiState = 'GK_DISTRIBUTE';
        this.distributeBall(gk, team, ball, elapsed, events);
        this.holdTimer = 0;
      }
      return;
    }

    this.holdTimer = 0;

    // Detect shot approaching goal
    const approachingOwnGoal =
      forwardDir === 1 ? ball.velocity.x < -4.2 : ball.velocity.x > 4.2;
    const distToGoal = Math.abs(ball.position.x - ownGoalX);

    if (approachingOwnGoal && distToGoal < 19 && this.diveCooldown <= 0) {
      const timeToLine = Math.abs((ownGoalX - ball.position.x) / ball.velocity.x);
      if (timeToLine > 0.04 && timeToLine < 1.15) {
        const predictedZ = ball.position.z + ball.velocity.z * timeToLine;
        const predictedY =
          ball.position.y + ball.velocity.y * timeToLine - 0.5 * 19.5 * timeToLine * timeToLine;

        if (Math.abs(predictedZ) <= GOAL_HALF_WIDTH + 0.9 && predictedY <= GOAL_HEIGHT + 0.5) {
          gk.aiState = 'GK_DIVE';
          const dz = predictedZ - gk.position.z;
          const speedNeeded = Math.min(9.5, Math.abs(dz) / Math.max(0.15, timeToLine));

          if (Math.abs(dz) > 0.55 && timeToLine < 0.48) {
            const diveSign = dz > 0 ? 1 : -1;
            gk.velocity.set(0, 0, diveSign * speedNeeded);
            gk.animation.triggerAction('gkSave', 0.58, diveSign);
            this.diveCooldown = 0.85;
          } else {
            gk.steer(0, dz, true, false, dt);
          }

          // Check direct save reach
          const ballDist = Math.hypot(
            ball.position.x - gk.position.x,
            ball.position.z - gk.position.z,
          );
          if (ballDist < 1.15 && ball.position.y < GOAL_HEIGHT + 0.2 && gk.touchCooldown <= 0) {
            this.executeSave(gk, forwardDir, ball, elapsed, events);
          }
          gk.facePoint(ball.position.x, ball.position.z, dt);
          return;
        }
      }
    }

    // Intercept loose slow ball inside penalty box
    if (!ball.owner && distToGoal < 8.5 && Math.abs(ball.position.z) < 6.8 && ball.position.y < 1.2) {
      gk.aiState = 'RECOVER_LOOSE';
      const dx = ball.position.x - gk.position.x;
      const dz = ball.position.z - gk.position.z;
      gk.steer(dx, dz, true, false, dt);
      if (Math.hypot(dx, dz) < 0.92 && gk.touchCooldown <= 0) {
        ball.owner = gk;
        this.holdTimer = 0.1;
        events?.onSave?.(gk);
      }
      return;
    }

    // Default: track angle between posts
    gk.aiState = 'GK_TRACK';
    const targetX = ownGoalX + forwardDir * 1.45;
    const angleFactor = THREE.MathUtils.clamp(ball.position.z / 14, -1, 1);
    const targetZ = angleFactor * (GOAL_HALF_WIDTH - 0.55);

    const dx = targetX - gk.position.x;
    const dz = targetZ - gk.position.z;
    if (Math.hypot(dx, dz) > 0.16) {
      gk.steer(dx, dz, Math.hypot(dx, dz) > 1.4, false, dt);
    } else {
      gk.steer(0, 0, false, false, dt);
    }
    gk.facePoint(ball.position.x, ball.position.z, dt);
  }

  private executeSave(
    gk: Player,
    forwardDir: 1 | -1,
    ball: BallPhysics,
    elapsed: number,
    events?: GoalkeeperEvents,
  ): void {
    const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
    if (ballSpeed < 16) {
      // Catch cleanly
      ball.owner = gk;
      ball.velocity.set(0, 0, 0);
      this.holdTimer = 0.05;
    } else {
      // Parry wide toward sideline
      const sideSign = ball.position.z >= 0 ? 1 : -1;
      ball.owner = null;
      ball.applyKick(forwardDir * 0.75, sideSign * 0.65, 11.5, 3.2, 0, gk, elapsed);
      gk.touchCooldown = 0.4;
    }
    events?.onSave?.(gk);
  }

  private distributeBall(
    gk: Player,
    team: Team,
    ball: BallPhysics,
    elapsed: number,
    events?: GoalkeeperEvents,
  ): void {
    const outfield = team.getOutfielders();
    let bestTarget = outfield[0];
    let bestScore = -999;

    outfield.forEach((mate) => {
      const dist = Math.hypot(mate.position.x - gk.position.x, mate.position.z - gk.position.z);
      const forwardGain = (mate.position.x - gk.position.x) * team.attackDirection;
      const score = forwardGain * 0.6 - Math.abs(dist - 14) * 0.35;
      if (score > bestScore) {
        bestScore = score;
        bestTarget = mate;
      }
    });

    if (bestTarget) {
      const dx = bestTarget.position.x - gk.position.x;
      const dz = bestTarget.position.z - gk.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      gk.facingAngle = Math.atan2(dx, dz);
      gk.animation.triggerAction('pass', 0.35);
      ball.applyKick(dx, dz, THREE.MathUtils.clamp(dist * 0.95 + 4, 10, 19), 2.8, 0, gk, elapsed);
      gk.touchCooldown = 0.45;
      events?.onDistribute?.(gk);
    }
  }
}
