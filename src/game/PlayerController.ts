import * as THREE from 'three';
import { InputSnapshot } from '../controls/TouchControls';
import { BallPhysics } from './BallPhysics';
import { PassAssist } from './PassAssist';
import { Player } from './Player';
import { Team } from './Team';
import { GOAL_HALF_WIDTH, HALF_LENGTH, HALF_WIDTH } from './types';

export interface PlayerActionEvents {
  onPass?: (passer: Player, receiver: Player | null, isLong: boolean) => void;
  onCross?: (crosser: Player) => void;
  onShoot?: (shooter: Player, power: number) => void;
  onTackle?: (tackler: Player) => void;
}

type ChargeKind = 'none' | 'pass' | 'longPass' | 'cross' | 'shot';

export class PlayerController {
  public activePlayer: Player;
  public shotCharge = 0; // 0 .. 1 (shared power bar feedback for pass/cross/shot)
  private chargeKind: ChargeKind = 'none';
  private chargeValue = 0;
  private bufferedShotTimer = 0;
  private bufferedShotPower = 0.55;
  private bufferedPassTimer = 0;
  private bufferedPassLong = false;
  private bufferedAimX = 0;
  private bufferedAimZ = 0;
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
    this.clearCharge();
    this.bufferedShotTimer = 0;
    this.bufferedPassTimer = 0;
  }

  private clearCharge(): void {
    this.chargeKind = 'none';
    this.chargeValue = 0;
    this.shotCharge = 0;
  }

  public selectClosestToBall(team: Team, ball: BallPhysics, allowHysteresis = false): void {
    const outfielders = team.getOutfielders();
    const cur = this.activePlayer;
    const curIsOutfield = outfielders.includes(cur);
    const curDist = curIsOutfield
      ? Math.hypot(ball.position.x - cur.position.x, ball.position.z - cur.position.z)
      : Infinity;
    const curGoalSide = curIsOutfield && (cur.position.x - ball.position.x) * team.attackDirection < 0.4;

    let best = outfielders[0];
    let bestScore = Infinity;
    for (let i = 0; i < outfielders.length; i++) {
      const p = outfielders[i];
      const d = Math.hypot(ball.position.x - p.position.x, ball.position.z - p.position.z);
      const isGoalSide = (p.position.x - ball.position.x) * team.attackDirection < 0.4;
      const effectiveScore = d - (isGoalSide ? 0.6 : 0);
      if (effectiveScore < bestScore) {
        bestScore = effectiveScore;
        best = p;
      }
    }

    if (!best) return;
    if (allowHysteresis && curIsOutfield && best !== cur) {
      const curEffective = curDist - (curGoalSide ? 0.6 : 0);
      if (bestScore > curEffective - 1.15) {
        return;
      }
    }
    this.setActivePlayer(best);
  }

  /**
   * Enforces kickoff freeze: only the kickoff team's taker can start play with the Pass (X) command.
   * Returns true on the frame the kickoff pass is executed.
   */
  public updateKickoff(
    team: Team,
    opponent: Team,
    ball: BallPhysics,
    input: InputSnapshot,
    kickoffTeam: 'home' | 'away',
    dt: number,
    elapsed: number,
    events?: PlayerActionEvents,
  ): boolean {
    this.clearCharge();
    this.bufferedShotTimer = 0;
    this.bufferedPassTimer = 0;

    const taker = team.players[4];
    if (taker && this.activePlayer !== taker) {
      this.setActivePlayer(taker);
    }

    // Keep all home players in regulation kickoff spots
    for (let i = 0; i < team.players.length; i++) {
      const p = team.players[i];
      p.steer(0, 0, false, ball.owner === p, dt);
      p.facePoint(0, 0, dt);
    }

    if (kickoffTeam !== team.side || !taker) {
      return false;
    }

    const hasAim = Math.hypot(input.moveX, input.moveZ) > 0.2;
    if (hasAim) {
      taker.facePoint(taker.position.x + input.moveX * 4, taker.position.z + input.moveZ * 4, dt);
    } else {
      taker.facingAngle = team.attackDirection === 1 ? Math.PI / 2 : -Math.PI / 2;
    }

    if (input.justPressedCross || input.justReleasedCross) {
      const aimX = hasAim ? input.moveX : -team.attackDirection * 0.85;
      const aimZ = hasAim ? input.moveZ : 0.35;
      this.executePass(taker, team, opponent, ball, aimX, aimZ, false, 0.32, elapsed, events);
      return true;
    }

    return false;
  }

  public update(
    team: Team,
    opponent: Team,
    ball: BallPhysics,
    input: InputSnapshot,
    dt: number,
    elapsed: number,
    events?: PlayerActionEvents,
  ): { teamHasBall: boolean; humanPressingCount: number } {
    if (this.switchCooldown > 0) this.switchCooldown = Math.max(0, this.switchCooldown - dt);
    if (this.bufferedShotTimer > 0) this.bufferedShotTimer = Math.max(0, this.bufferedShotTimer - dt);
    if (this.bufferedPassTimer > 0) this.bufferedPassTimer = Math.max(0, this.bufferedPassTimer - dt);

    const ballOwner = ball.owner;
    const teamHasBall = ballOwner !== null && ballOwner.side === team.side;

    // Auto-select teammate if teammate gained control of the ball
    if (teamHasBall && ballOwner && ballOwner.role !== 'GR' && ballOwner !== this.activePlayer) {
      this.setActivePlayer(ballOwner);
    }

    const active = this.activePlayer;
    const activeHasBall = ballOwner === active;
    const distToBall = Math.hypot(
      ball.position.x - active.position.x,
      ball.position.z - active.position.z,
    );
    const canKickBall =
      activeHasBall || (!ballOwner && distToBall < 1.48 && ball.position.y < 2.25);

    // Manual player switch when team does not have ball & ball isn't immediately kickable
    if (!teamHasBall && !canKickBall && input.justPressedTriangle && this.switchCooldown <= 0) {
      this.switchToNextBestDefender(team, ball);
      this.switchCooldown = 0.18;
    }

    let humanPressingCount = 0;

    // Check buffered first-time shot (remate de primeira) as soon as ball arrives within strike range
    if (this.bufferedShotTimer > 0 && canKickBall && !activeHasBall) {
      this.bufferedShotTimer = 0;
      const aimX = Math.hypot(input.moveX, input.moveZ) > 0.15 ? input.moveX : this.bufferedAimX;
      const aimZ = Math.hypot(input.moveX, input.moveZ) > 0.15 ? input.moveZ : this.bufferedAimZ;
      this.executeShot(
        active,
        team,
        ball,
        aimX,
        aimZ,
        this.bufferedShotPower,
        true,
        elapsed,
        events,
      );
      return { teamHasBall, humanPressingCount };
    }

    // Check buffered one-touch pass (passe de primeira) as soon as ball enters foot reach
    if (this.bufferedPassTimer > 0 && canKickBall && !activeHasBall) {
      this.bufferedPassTimer = 0;
      const aimX = Math.hypot(input.moveX, input.moveZ) > 0.15 ? input.moveX : this.bufferedAimX;
      const aimZ = Math.hypot(input.moveX, input.moveZ) > 0.15 ? input.moveZ : this.bufferedAimZ;
      this.executePass(
        active,
        team,
        opponent,
        ball,
        aimX,
        aimZ,
        this.bufferedPassLong,
        0.35,
        elapsed,
        events,
      );
      return { teamHasBall, humanPressingCount };
    }

    // OFFENSE / BALL-IN-REACH CONTROLS
    const incomingPassToMe =
      !ballOwner &&
      ball.isPassInFlight &&
      ball.intendedReceiver === active;

    if (teamHasBall || canKickBall || incomingPassToMe) {
      const stickMag = Math.hypot(input.moveX, input.moveZ);

      // Receiver preparation: step to intercept line, orient body toward ball, and blend subtle foot-alignment
      if (incomingPassToMe) {
        const meet = PassAssist.computeReceptionPoint(active, ball, 0.55);
        const dx = meet.x - active.position.x;
        const dz = meet.z - active.position.z;
        const d = Math.hypot(dx, dz);

        if (stickMag < 0.22) {
          if (d > 0.24) {
            active.steer(dx / d, dz / d, d > 1.5, false, dt);
          } else {
            active.steer(0, 0, false, false, dt);
          }
          if (d < 1.8 || distToBall < 4.5) {
            active.facePoint(ball.position.x, ball.position.z, dt);
          }
        } else if (ball.passKind !== 'through' && distToBall < 4.5 && d > 0.25 && d < 3.6) {
          // Subtle foot-adjustment blend while preserving player stick intent
          const bx = input.moveX * 0.65 + (dx / d) * 0.35;
          const bz = input.moveZ * 0.65 + (dz / d) * 0.35;
          active.steer(bx, bz, input.sprint, false, dt);
        } else {
          active.steer(input.moveX, input.moveZ, input.sprint, activeHasBall, dt);
        }
      } else {
        active.steer(input.moveX, input.moveZ, input.sprint, activeHasBall, dt);
      }

      // Buffer first-time shot or one-touch pass when pass is on the way
      if (incomingPassToMe && !canKickBall) {
        if (input.justPressedSquare) {
          this.bufferedShotTimer = 0.42;
          this.bufferedShotPower = 0.68;
          this.bufferedAimX = input.moveX;
          this.bufferedAimZ = input.moveZ;
        } else if (input.justPressedCross || input.justPressedTriangle) {
          this.bufferedPassTimer = 0.38;
          this.bufferedPassLong = input.justPressedTriangle;
          this.bufferedAimX = input.moveX;
          this.bufferedAimZ = input.moveZ;
        }
      }

      // Start charging pass / long pass / cross / shot when kickable
      if (canKickBall) {
        if (input.justPressedCross && this.chargeKind === 'none') {
          this.chargeKind = 'pass';
          this.chargeValue = 0.22;
        } else if (input.justPressedTriangle && this.chargeKind === 'none') {
          this.chargeKind = 'longPass';
          this.chargeValue = 0.24;
        } else if (input.justPressedCircle && this.chargeKind === 'none') {
          this.chargeKind = 'cross';
          this.chargeValue = 0.26;
        } else if (input.justPressedSquare && this.chargeKind === 'none') {
          this.chargeKind = 'shot';
          this.chargeValue = 0.25;
        }
      }

      // Advance charge while held
      if (this.chargeKind === 'pass') {
        if (input.crossHeld && !input.justReleasedCross) {
          this.chargeValue = Math.min(1, this.chargeValue + dt * 1.9);
          this.shotCharge = this.chargeValue;
        } else {
          const power = this.chargeValue;
          this.clearCharge();
          if (canKickBall) {
            this.executePass(active, team, opponent, ball, input.moveX, input.moveZ, false, power, elapsed, events);
            return { teamHasBall, humanPressingCount };
          }
        }
      } else if (this.chargeKind === 'longPass') {
        if (input.triangleHeld && !input.justReleasedTriangle) {
          this.chargeValue = Math.min(1, this.chargeValue + dt * 1.65);
          this.shotCharge = this.chargeValue;
        } else {
          const power = this.chargeValue;
          this.clearCharge();
          if (canKickBall) {
            this.executePass(active, team, opponent, ball, input.moveX, input.moveZ, true, power, elapsed, events);
            return { teamHasBall, humanPressingCount };
          }
        }
      } else if (this.chargeKind === 'cross') {
        if (input.circleHeld && !input.justReleasedCircle) {
          this.chargeValue = Math.min(1, this.chargeValue + dt * 1.65);
          this.shotCharge = this.chargeValue;
        } else {
          const power = this.chargeValue;
          this.clearCharge();
          if (canKickBall) {
            this.executeCross(active, team, opponent, ball, input.moveX, input.moveZ, power, elapsed, events);
            return { teamHasBall, humanPressingCount };
          }
        }
      } else if (this.chargeKind === 'shot') {
        if (input.squareHeld && !input.justReleasedSquare) {
          this.chargeValue = Math.min(1, this.chargeValue + dt * 1.45);
          this.shotCharge = this.chargeValue;
        } else {
          const power = Math.max(0.25, this.chargeValue);
          this.clearCharge();
          if (canKickBall) {
            this.executeShot(
              active,
              team,
              ball,
              input.moveX,
              input.moveZ,
              power,
              !activeHasBall,
              elapsed,
              events,
            );
            return { teamHasBall, humanPressingCount };
          }
        }
      }
    } else {
      // DEFENSE CONTROLS (exact bindings preserved!)
      this.clearCharge();

      // X + Square -> 2-player press!
      if (input.doublePressHeld) {
        humanPressingCount = 2;
        this.selectClosestToBall(team, ball, true);
        const presser = this.activePlayer;
        const goalSideBias = -team.attackDirection * 0.34;
        const dx = ball.position.x + ball.velocity.x * 0.14 + goalSideBias - presser.position.x;
        const dz = ball.position.z + ball.velocity.z * 0.14 - presser.position.z;
        presser.steer(dx, dz, true, false, dt);
      } else if (input.crossHeld) {
        // X -> Auto-select best defender with hysteresis and press ball carrier goal-side
        humanPressingCount = 1;
        this.selectClosestToBall(team, ball, true);
        const presser = this.activePlayer;
        const goalSideBias = -team.attackDirection * 0.34;
        const dx = ball.position.x + ball.velocity.x * 0.14 + goalSideBias - presser.position.x;
        const dz = ball.position.z + ball.velocity.z * 0.14 - presser.position.z;
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
    const outfielders = team
      .getOutfielders()
      .slice()
      .sort(
        (a, b) =>
          Math.hypot(ball.position.x - a.position.x, ball.position.z - a.position.z) -
          Math.hypot(ball.position.x - b.position.x, ball.position.z - b.position.z),
      );
    const candidate =
      outfielders[0] === this.activePlayer && outfielders[1]
        ? outfielders[1]
        : outfielders[0];
    if (candidate) this.setActivePlayer(candidate);
  }

  private executePass(
    passer: Player,
    team: Team,
    opponent: Team,
    ball: BallPhysics,
    aimX: number,
    aimZ: number,
    isLong: boolean,
    power: number,
    elapsed: number,
    events?: PlayerActionEvents,
  ): void {
    const plan = isLong
      ? PassAssist.planLongOrThroughPass(passer, team, opponent, aimX, aimZ, power)
      : PassAssist.planShortPass(passer, team, opponent, aimX, aimZ, power);

    const dirX = plan.targetX - passer.position.x;
    const dirZ = plan.targetZ - passer.position.z;

    passer.facingAngle = Math.atan2(dirX, dirZ);
    passer.animation.triggerAction('pass', 0.34);
    ball.applyKick(dirX, dirZ, plan.speed, plan.loft, plan.curve, passer, elapsed);
    ball.setPassAssist(
      plan.target,
      plan.targetX,
      plan.targetZ,
      plan.kind,
      plan.targetY,
      plan.desiredArrivalSpeed,
    );
    passer.touchCooldown = 0.28;

    if (plan.target && plan.target.role !== 'GR') {
      this.setActivePlayer(plan.target);
    }
    events?.onPass?.(passer, plan.target, isLong);
  }

  private executeCross(
    crosser: Player,
    team: Team,
    opponent: Team,
    ball: BallPhysics,
    aimX: number,
    aimZ: number,
    power: number,
    elapsed: number,
    events?: PlayerActionEvents,
  ): void {
    const plan = PassAssist.planCross(crosser, team, opponent, aimX, aimZ, power);

    const dx = plan.targetX - crosser.position.x;
    const dz = plan.targetZ - crosser.position.z;

    crosser.facingAngle = Math.atan2(dx, dz);
    crosser.animation.triggerAction(plan.kind === 'cross' ? 'cross' : 'pass', 0.38);

    ball.applyKick(dx, dz, plan.speed, plan.loft, plan.curve, crosser, elapsed);
    ball.setPassAssist(
      plan.target,
      plan.targetX,
      plan.targetZ,
      plan.kind,
      plan.targetY,
      plan.desiredArrivalSpeed,
    );
    crosser.touchCooldown = 0.34;

    if (plan.target && plan.target.role !== 'GR') {
      this.setActivePlayer(plan.target);
    }
    events?.onCross?.(crosser);
  }

  private executeShot(
    shooter: Player,
    team: Team,
    ball: BallPhysics,
    aimX: number,
    aimZ: number,
    power: number,
    isFirstTime: boolean,
    elapsed: number,
    events?: PlayerActionEvents,
  ): void {
    const oppGoalX = team.attackDirection * HALF_LENGTH;
    const hasAim = Math.hypot(aimX, aimZ) > 0.18;

    // Situational aim: blend stick Z corner selection with smart far-post bias on wide angles
    const facingZBias = Math.cos(shooter.facingAngle) * 2.2;
    const farPostBias = Math.abs(shooter.position.z) > 4.5 ? -Math.sign(shooter.position.z) * 1.4 : 0;
    const rawCornerZ = hasAim
      ? aimZ * (GOAL_HALF_WIDTH - 0.28)
      : THREE.MathUtils.lerp(facingZBias, farPostBias, 0.45);
    const goalTargetZ = THREE.MathUtils.clamp(rawCornerZ, -(GOAL_HALF_WIDTH - 0.28), GOAL_HALF_WIDTH - 0.28);

    const dx = oppGoalX - shooter.position.x;
    const dz = goalTargetZ - shooter.position.z;
    const distToGoal = Math.hypot(dx, dz);
    const distScale = THREE.MathUtils.clamp(distToGoal / 22, 0.48, 1.15);

    const ballY = ball.position.y;
    const isHeader = ballY >= 1.12;
    const isVolley = !isHeader && ballY >= 0.52;
    const isLowDriven = !isHeader && !isVolley && power < 0.42;
    const isFinesse =
      !isHeader && !isVolley && !isLowDriven && power < 0.72 && (Math.abs(aimZ) > 0.28 || distToGoal < 16);

    let shotSpeed: number;
    let loft: number;
    let spin: number;

    if (isHeader) {
      shotSpeed = (17.5 + power * 8.5) * shooter.skillStat;
      loft = (1.3 + power * 1.4) * distScale;
      spin = -aimZ * 1.6;
      shooter.animation.triggerAction('header', 0.38);
    } else if (isVolley) {
      shotSpeed = (22.5 + power * 9.5) * shooter.skillStat;
      loft = (0.95 + power * 2.0) * distScale;
      spin = -aimZ * 3.6;
      shooter.animation.triggerAction('volley', 0.42);
    } else if (isLowDriven) {
      shotSpeed = (21.5 + power * 7.0) * shooter.skillStat;
      loft = 0.45 + power * 0.85;
      spin = -aimZ * 2.4;
      shooter.animation.triggerAction('lowShot', 0.34);
    } else if (isFinesse) {
      // Curled placed finish toward corner
      shotSpeed = (20.0 + power * 8.2) * shooter.skillStat;
      loft = (1.7 + power * 2.1) * distScale;
      const cornerSign = goalTargetZ >= 0 ? -1 : 1;
      spin = cornerSign * 5.6;
      shooter.animation.triggerAction('finesseShot', 0.4);
    } else {
      // Explosive power strike with distance-calibrated arc so close drives stay on target
      shotSpeed = (23.0 + power * 10.5) * shooter.skillStat;
      loft = (2.1 + power * 2.9) * distScale;
      spin = -aimZ * 3.2;
      shooter.animation.triggerAction('shoot', 0.38);
    }

    if (isFirstTime) {
      shotSpeed *= 1.04;
    }

    shooter.facingAngle = Math.atan2(dx, dz);
    ball.applyKick(dx, dz, shotSpeed, loft, spin, shooter, elapsed);
    shooter.touchCooldown = 0.35;
    events?.onShoot?.(shooter, power);
  }
}
