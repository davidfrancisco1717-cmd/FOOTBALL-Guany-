import * as THREE from 'three';
import { InputSnapshot } from '../controls/TouchControls';
import { BallPhysics } from './BallPhysics';
import { Player } from './Player';
import { Team } from './Team';
import { HALF_LENGTH } from './types';

export interface PlayerActionEvents {
  onPass?: (passer: Player, receiver: Player | null, isLong: boolean) => void;
  onCross?: (crosser: Player) => void;
  onShoot?: (shooter: Player, power: number) => void;
  onTackle?: (tackler: Player) => void;
}

export class PlayerController {
  public activePlayer: Player;
  public shotCharge = 0; // 0 .. 1
  private chargingShot = false;
  private switchCooldown = 0;

  constructor(initialPlayer: Player) {
    this.activePlayer = initialPlayer;
    this.activePlayer.isHumanControlled = true;
  }

  public setActivePlayer(player: Player): void {
    if (this.activePlayer === player) return;
    this.activePlayer.isHumanControlled = false;
    this.activePlayer = player;
    this.activePlayer.isHumanControlled = true;
    this.chargingShot = false;
    this.shotCharge = 0;
  }

  public selectClosestToBall(team: Team, ball: BallPhysics): void {
    const outfielders = team.getOutfielders();
    let best = outfielders[0];
    let bestDist = Infinity;
    outfielders.forEach((p) => {
      const d = Math.hypot(ball.position.x - p.position.x, ball.position.z - p.position.z);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    });
    if (best) this.setActivePlayer(best);
  }

  public update(
    team: Team,
    ball: BallPhysics,
    input: InputSnapshot,
    dt: number,
    elapsed: number,
    events?: PlayerActionEvents,
  ): { teamHasBall: boolean; humanPressingCount: number } {
    if (this.switchCooldown > 0) this.switchCooldown = Math.max(0, this.switchCooldown - dt);

    const ballOwner = ball.owner;
    const teamHasBall = ballOwner !== null && ballOwner.side === team.side;

    // Auto-select teammate if teammate gained control of the ball
    if (teamHasBall && ballOwner && ballOwner.role !== 'GR' && ballOwner !== this.activePlayer) {
      this.setActivePlayer(ballOwner);
    }

    // Manual player switch when team does not have ball (Triangle) or if ball is loose & Triangle pressed
    if (!teamHasBall && input.justPressedTriangle && this.switchCooldown <= 0) {
      this.switchToNextBestDefender(team, ball);
      this.switchCooldown = 0.18;
    }

    const active = this.activePlayer;
    const activeHasBall = ballOwner === active;
    let humanPressingCount = 0;

    // OFFENSE CONTROLS (when my team / active player has the ball or ball is within kickable range)
    const distToBall = Math.hypot(
      ball.position.x - active.position.x,
      ball.position.z - active.position.z,
    );
    const canKickBall = activeHasBall || (!ballOwner && distToBall < 1.25 && ball.position.y < 1.5);

    if (teamHasBall || canKickBall) {
      // Movement
      active.steer(input.moveX, input.moveZ, input.sprint, activeHasBall, dt);

      // X -> Short pass
      if (input.justPressedCross && canKickBall) {
        this.executePass(active, team, ball, input.moveX, input.moveZ, false, elapsed, events);
        return { teamHasBall, humanPressingCount };
      }

      // Triangle -> Long / through pass
      if (input.justPressedTriangle && canKickBall) {
        this.executePass(active, team, ball, input.moveX, input.moveZ, true, elapsed, events);
        return { teamHasBall, humanPressingCount };
      }

      // Circle -> Crossing / lofted wing ball
      if (input.justPressedCircle && canKickBall) {
        this.executeCross(active, team, ball, input.moveX, input.moveZ, elapsed, events);
        return { teamHasBall, humanPressingCount };
      }

      // Square -> Shoot (charge & release, or instant shot on tap/release)
      if (input.justPressedSquare && canKickBall) {
        this.chargingShot = true;
        this.shotCharge = 0.35;
      }
      if (this.chargingShot && input.squareHeld) {
        this.shotCharge = Math.min(1, this.shotCharge + dt * 1.45);
      }
      if (this.chargingShot && (input.justReleasedSquare || !input.squareHeld)) {
        const power = Math.max(0.4, this.shotCharge);
        this.chargingShot = false;
        this.shotCharge = 0;
        if (canKickBall) {
          this.executeShot(active, team, ball, input.moveX, input.moveZ, power, elapsed, events);
          return { teamHasBall, humanPressingCount };
        }
      }
    } else {
      // DEFENSE CONTROLS (opponent has ball or loose ball)
      this.chargingShot = false;
      this.shotCharge = 0;

      // X + Square -> 2-player press!
      if (input.doublePressHeld) {
        humanPressingCount = 2;
        this.selectClosestToBall(team, ball);
        const presser = this.activePlayer;
        const dx = ball.position.x - presser.position.x;
        const dz = ball.position.z - presser.position.z;
        presser.steer(dx, dz, true, false, dt);
      } else if (input.crossHeld) {
        // X -> Auto-select best defender and press ball carrier
        humanPressingCount = 1;
        this.selectClosestToBall(team, ball);
        const presser = this.activePlayer;
        const dx = ball.position.x - presser.position.x;
        const dz = ball.position.z - presser.position.z;
        presser.steer(dx, dz, true, false, dt);
      } else {
        // Manual left-stick movement
        active.steer(input.moveX, input.moveZ, input.sprint, false, dt);
      }

      // Circle -> Slide tackle / lunge
      if (input.justPressedCircle) {
        let tx = input.moveX;
        let tz = input.moveZ;
        if (Math.hypot(tx, tz) < 0.2) {
          tx = ball.position.x - this.activePlayer.position.x;
          tz = ball.position.z - this.activePlayer.position.z;
        }
        this.activePlayer.startTackle(tx, tz);
        events?.onTackle?.(this.activePlayer);
      }
    }

    return { teamHasBall, humanPressingCount };
  }

  private switchToNextBestDefender(team: Team, ball: BallPhysics): void {
    const outfielders = team.getOutfielders()
      .slice()
      .sort(
        (a, b) =>
          Math.hypot(ball.position.x - a.position.x, ball.position.z - a.position.z) -
          Math.hypot(ball.position.x - b.position.x, ball.position.z - b.position.z),
      );
    const candidate = outfielders[0] === this.activePlayer && outfielders[1] ? outfielders[1] : outfielders[0];
    if (candidate) this.setActivePlayer(candidate);
  }

  private findPassTarget(
    passer: Player,
    team: Team,
    aimX: number,
    aimZ: number,
    isLong: boolean,
  ): Player | null {
    const hasAim = Math.hypot(aimX, aimZ) > 0.2;
    let aimDirX = hasAim ? aimX : Math.sin(passer.facingAngle);
    let aimDirZ = hasAim ? aimZ : Math.cos(passer.facingAngle);
    const len = Math.hypot(aimDirX, aimDirZ) || 1;
    aimDirX /= len;
    aimDirZ /= len;

    let best: Player | null = null;
    let bestScore = -999;

    team.players.forEach((mate) => {
      if (mate === passer) return;
      if (mate.role === 'GR' && !hasAim) return;
      const dx = mate.position.x - passer.position.x;
      const dz = mate.position.z - passer.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.5) return;

      const dot = (dx / dist) * aimDirX + (dz / dist) * aimDirZ;
      const distPref = isLong ? -Math.abs(dist - 19) * 0.08 : -Math.abs(dist - 9) * 0.09;
      const score = dot * 3.0 + distPref + (mate.role === 'AVA' && isLong ? 0.45 : 0);
      if (dot > 0.05 && score > bestScore) {
        bestScore = score;
        best = mate;
      }
    });

    // Fallback: closest outfielder if no teammate is inside the forward cone
    if (!best) {
      let minD = Infinity;
      team.getOutfielders().forEach((mate) => {
        if (mate === passer) return;
        const d = Math.hypot(mate.position.x - passer.position.x, mate.position.z - passer.position.z);
        if (d < minD) {
          minD = d;
          best = mate;
        }
      });
    }

    return best;
  }

  private executePass(
    passer: Player,
    team: Team,
    ball: BallPhysics,
    aimX: number,
    aimZ: number,
    isLong: boolean,
    elapsed: number,
    events?: PlayerActionEvents,
  ): void {
    const target = this.findPassTarget(passer, team, aimX, aimZ, isLong);
    let dirX = Math.hypot(aimX, aimZ) > 0.2 ? aimX : Math.sin(passer.facingAngle);
    let dirZ = Math.hypot(aimX, aimZ) > 0.2 ? aimZ : Math.cos(passer.facingAngle);
    let speed = isLong ? 17.5 : 13.5;
    let loft = isLong ? 4.4 : 0.35;

    if (target) {
      const leadTime = isLong ? 0.48 : 0.24;
      const tx = target.position.x + target.velocity.x * leadTime + (isLong ? team.attackDirection * 3.2 : 0);
      const tz = target.position.z + target.velocity.z * leadTime;
      dirX = tx - passer.position.x;
      dirZ = tz - passer.position.z;
      const dist = Math.hypot(dirX, dirZ) || 1;
      speed = isLong
        ? THREE.MathUtils.clamp(dist * 0.92 + 5.5, 14.5, 23.5)
        : THREE.MathUtils.clamp(dist * 1.1 + 4.5, 10.5, 18.0);
      loft = isLong ? THREE.MathUtils.clamp(dist * 0.22, 3.2, 6.2) : 0.3;
    }

    passer.facingAngle = Math.atan2(dirX, dirZ);
    passer.animation.triggerAction('pass', 0.34);
    ball.applyKick(dirX, dirZ, speed, loft, 0, passer, elapsed);
    passer.touchCooldown = 0.32;

    if (target && target.role !== 'GR') {
      this.setActivePlayer(target);
    }
    events?.onPass?.(passer, target, isLong);
  }

  private executeCross(
    crosser: Player,
    team: Team,
    ball: BallPhysics,
    aimX: number,
    aimZ: number,
    elapsed: number,
    events?: PlayerActionEvents,
  ): void {
    const oppGoalX = team.attackDirection * HALF_LENGTH;
    const penaltySpotX = oppGoalX - team.attackDirection * 7.2;

    // Cross into penalty area or toward striker if wide
    let targetX = penaltySpotX;
    let targetZ = THREE.MathUtils.clamp(aimZ * 3.5, -3.5, 3.5);

    const striker = team.players[4];
    if (striker && striker !== crosser) {
      targetX = striker.position.x + team.attackDirection * 2.5;
      targetZ = striker.position.z;
    } else if (Math.hypot(aimX, aimZ) > 0.25) {
      targetX = crosser.position.x + aimX * 16;
      targetZ = crosser.position.z + aimZ * 14;
    }

    const dx = targetX - crosser.position.x;
    const dz = targetZ - crosser.position.z;
    const dist = Math.hypot(dx, dz) || 1;

    crosser.facingAngle = Math.atan2(dx, dz);
    crosser.animation.triggerAction('cross', 0.38);
    const speed = THREE.MathUtils.clamp(dist * 0.85 + 5, 13, 21);
    const curve = crosser.position.z > 0 ? -4.2 : 4.2;
    ball.applyKick(dx, dz, speed, 6.8, curve, crosser, elapsed);
    crosser.touchCooldown = 0.34;
    events?.onCross?.(crosser);
  }

  private executeShot(
    shooter: Player,
    team: Team,
    ball: BallPhysics,
    aimX: number,
    aimZ: number,
    power: number,
    elapsed: number,
    events?: PlayerActionEvents,
  ): void {
    const oppGoalX = team.attackDirection * HALF_LENGTH;
    // Aim corners using stick Z input
    const goalTargetZ = THREE.MathUtils.clamp(aimZ * 3.1, -2.95, 2.95);
    const dx = oppGoalX - shooter.position.x;
    const dz = goalTargetZ - shooter.position.z;

    const shotSpeed = 19.5 + power * 10.5 * shooter.skillStat;
    const loft = 2.2 + power * 3.8;
    const spin = -aimZ * 3.8;

    shooter.facingAngle = Math.atan2(dx, dz);
    shooter.animation.triggerAction('shoot', 0.38);
    ball.applyKick(dx, dz, shotSpeed, loft, spin, shooter, elapsed);
    shooter.touchCooldown = 0.36;
    events?.onShoot?.(shooter, power);
  }
}
