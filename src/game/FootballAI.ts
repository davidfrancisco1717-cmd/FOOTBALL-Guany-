import * as THREE from 'three';
import { BallPhysics } from './BallPhysics';
import { PassAssist } from './PassAssist';
import { Player } from './Player';
import { TacticalSystem } from './TacticalSystem';
import { Team } from './Team';
import { HALF_LENGTH, HALF_WIDTH, MatchPhase } from './types';

const _anchor = new THREE.Vector3();

function dtChance(ratePerSecond: number, dt: number): boolean {
  return Math.random() < 1 - Math.exp(-ratePerSecond * dt);
}

export interface AIEvents {
  onPass?: (passer: Player, target: Player) => void;
  onShoot?: (shooter: Player) => void;
  onTackleAttempt?: (tackler: Player) => void;
}

export class FootballAI {
  private tactical = new TacticalSystem();

  public updateTeamAI(
    team: Team,
    opponent: Team,
    ball: BallPhysics,
    dt: number,
    elapsed: number,
    isTrainingDisabledOutfield: boolean,
    humanPressingCount: number, // 0, 1 (X), or 2 (X+Square)
    events?: AIEvents,
    matchPhase: MatchPhase = 'PLAYING',
  ): void {
    const outfielders = team.getOutfielders();
    if (isTrainingDisabledOutfield) {
      outfielders.forEach((p, idx) => {
        p.isSupportingPress = false;
        p.steer(0, 0, false, false, dt);
        p.resetAt(-12 + idx * 8, -21.2, 0);
      });
      return;
    }

    // Strict state guard: before kickoff or during goal/reset, AI holds regulation shape and never presses/attacks
    if (matchPhase !== 'PLAYING') {
      for (let i = 0; i < outfielders.length; i++) {
        const p = outfielders[i];
        p.isSupportingPress = false;
        if (p.isHumanControlled) continue;
        p.aiState = 'RETREAT';
        p.steer(0, 0, false, ball.owner === p, dt);
        p.facePoint(0, 0, dt);
      }
      return;
    }

    const ballOwner = ball.owner;
    const teamHasBall = ballOwner !== null && ballOwner.side === team.side;
    const oppHasBall = ballOwner !== null && ballOwner.side !== team.side;
    const oppPassInFlight =
      !ballOwner &&
      ball.isPassInFlight &&
      ball.intendedReceiver !== null &&
      ball.intendedReceiver.side !== team.side;

    // Rank non-human outfielders by distance to ball so only designated players press
    let closestAI: Player | null = null;
    let closestDist = Infinity;
    let secondClosestAI: Player | null = null;
    let secondDist = Infinity;

    for (let i = 0; i < outfielders.length; i++) {
      const p = outfielders[i];
      p.isSupportingPress = false;
      if (p.isHumanControlled) continue;
      const d = Math.hypot(ball.position.x - p.position.x, ball.position.z - p.position.z);
      if (d < closestDist) {
        secondDist = closestDist;
        secondClosestAI = closestAI;
        closestDist = d;
        closestAI = p;
      } else if (d < secondDist) {
        secondDist = d;
        secondClosestAI = p;
      }
    }

    const isHumanTeam = team.side === 'home';
    const ownGoalX = -team.attackDirection * HALF_LENGTH;
    const ballDistToOwnGoal = Math.hypot(ball.position.x - ownGoalX, ball.position.z);

    // Choose one passing-lane interceptor when defending (prefer MED/DEF over AVA)
    let interceptorAI: Player | null = null;
    if (oppHasBall && !isHumanTeam) {
      for (let i = 0; i < outfielders.length; i++) {
        const p = outfielders[i];
        if (p !== closestAI && p.role !== 'AVA') {
          interceptorAI = p;
          break;
        }
      }
    }

    for (let i = 0; i < outfielders.length; i++) {
      const p = outfielders[i];
      if (p.isHumanControlled) continue;

      // 1. Player owns the ball -> smart attack / dribble / pass / shoot
      if (ballOwner === p) {
        this.runCarrierBehavior(p, team, opponent, ball, dt, elapsed, events);
        continue;
      }

      // 2. Intended receiver of an incoming pass -> sprint to intercept ball trajectory & prepare feet
      if (!ballOwner && ball.isPassInFlight && ball.intendedReceiver === p) {
        p.aiState = 'RECOVER_LOOSE';
        const isSpaceBall = ball.passKind === 'through' || ball.passKind === 'cross';
        const meet = PassAssist.computeReceptionPoint(p, ball, isSpaceBall ? 0.68 : 0.48);
        const dx = meet.x - p.position.x;
        const dz = meet.z - p.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.32) {
          p.steer(dx, dz, isSpaceBall || d > 1.35, false, dt);
        } else {
          p.steer(0, 0, false, false, dt);
        }
        if (!isSpaceBall && d < 1.5) {
          p.facePoint(ball.position.x, ball.position.z, dt);
        }
        continue;
      }

      // 3. Team has the ball -> open passing lanes, support triangles & attacking runs (desmarcações)
      if (teamHasBall && ballOwner) {
        this.runOffBallSupport(p, ballOwner, team, opponent, ball, dt);
        continue;
      }

      // 4. Human teammate double-press trigger (X + Square)
      if (isHumanTeam && humanPressingCount >= 2 && p === closestAI) {
        p.aiState = 'PRESS_BALL';
        p.isSupportingPress = true;
        const goalSideBias = -team.attackDirection * 0.32;
        const dx = ball.position.x + ball.velocity.x * 0.12 + goalSideBias - p.position.x;
        const dz = ball.position.z + ball.velocity.z * 0.12 - p.position.z;
        const d = Math.hypot(dx, dz);
        p.steer(dx, dz, true, false, dt);
        if (oppHasBall && d < 2.25 && d > 0.72 && p.tackleCooldown <= 0 && dtChance(2.4, dt)) {
          p.startTackle(dx, dz);
          events?.onTackleAttempt?.(p);
        }
        continue;
      }

      // 5. Cut off opponent pass in flight -> only closest defender intercepts directly
      if (oppPassInFlight && p === closestAI) {
        p.aiState = 'INTERCEPT_PASS';
        const cut = PassAssist.computeReceptionPoint(p, ball, 0.65);
        const dx = cut.x - p.position.x;
        const dz = cut.z - p.position.z;
        p.steer(dx, dz, true, false, dt);
        continue;
      }

      // 6. Loose ball -> strictly closest AI recovers so two teammates never converge on same spot
      if (!ballOwner && p === closestAI && closestDist < 22) {
        p.aiState = 'RECOVER_LOOSE';
        const meet = PassAssist.computeReceptionPoint(p, ball, 0.38);
        const dx = meet.x - p.position.x;
        const dz = meet.z - p.position.z;
        p.steer(dx, dz, true, false, dt);
        continue;
      }

      // 7. AI Primary Press on opponent carrier (goal-side pressing, 1 primary presser)
      if (!isHumanTeam && oppHasBall && p === closestAI) {
        p.aiState = 'PRESS_BALL';
        const goalSideBias = -team.attackDirection * 0.34;
        const dx = ball.position.x + ball.velocity.x * 0.14 + goalSideBias - p.position.x;
        const dz = ball.position.z + ball.velocity.z * 0.14 - p.position.z;
        const dist = Math.hypot(dx, dz);
        p.steer(dx, dz, dist > 2.4, false, dt);

        if (dist < 2.15 && dist > 0.78 && p.tackleCooldown <= 0 && dtChance(1.65, dt)) {
          p.startTackle(dx, dz);
          events?.onTackleAttempt?.(p);
        }
        continue;
      }

      // 8. AI Passing-Lane Interceptor (antecipação de passes)
      if (!isHumanTeam && oppHasBall && p === interceptorAI && ballOwner) {
        const dangerousOpp = this.findMostDangerousOpponent(opponent, ballOwner, team.attackDirection);
        if (dangerousOpp) {
          p.aiState = 'INTERCEPT_PASS';
          const laneX = THREE.MathUtils.lerp(ball.position.x, dangerousOpp.position.x, 0.54);
          const laneZ = THREE.MathUtils.lerp(ball.position.z, dangerousOpp.position.z, 0.54);
          const guardX = THREE.MathUtils.lerp(laneX, ownGoalX, 0.22);
          const spaced = this.applyTeammateSpacing(p, team, guardX, laneZ);
          const dx = spaced.x - p.position.x;
          const dz = spaced.z - p.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.95) {
            p.steer(dx, dz, dist > 3.6, false, dt);
          } else {
            p.facePoint(ball.position.x, ball.position.z, dt);
            p.steer(0, 0, false, false, dt);
          }
          continue;
        }
      }

      // 9. Secondary Defender Marking / Box Protection
      if (!isHumanTeam && oppHasBall && p === secondClosestAI && ballOwner) {
        if (ballDistToOwnGoal < 11.5 && secondDist < 6.5 && closestDist > 2.2) {
          p.aiState = 'PRESS_BALL';
          const goalSideBias = -team.attackDirection * 0.35;
          const dx = ball.position.x + goalSideBias - p.position.x;
          const dz = ball.position.z - p.position.z;
          p.steer(dx, dz, true, false, dt);
          continue;
        }
        const dangerousOpp = this.findMostDangerousOpponent(opponent, ballOwner, team.attackDirection);
        if (dangerousOpp) {
          p.aiState = 'DEFEND_MARK';
          const markX = THREE.MathUtils.lerp(dangerousOpp.position.x, ownGoalX, 0.28);
          const markZ = THREE.MathUtils.lerp(dangerousOpp.position.z, 0, 0.16);
          const spaced = this.applyTeammateSpacing(p, team, markX, markZ);
          const dx = spaced.x - p.position.x;
          const dz = spaced.z - p.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 1.0) {
            p.steer(dx, dz, dist > 4.2, false, dt);
          } else {
            p.facePoint(ball.position.x, ball.position.z, dt);
            p.steer(0, 0, false, false, dt);
          }
          continue;
        }
      }

      // 10. Tactical defensive shape / retreat with teammate separation & calm deadzone
      p.aiState = 'RETREAT';
      this.tactical.getTargetAnchor(p, ball.position, false, _anchor);
      const spaced = this.applyTeammateSpacing(p, team, _anchor.x, _anchor.z);
      const dx = spaced.x - p.position.x;
      const dz = spaced.z - p.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.9) {
        p.steer(dx, dz, dist > 5.8, false, dt);
      } else {
        p.facePoint(ball.position.x, ball.position.z, dt);
        p.steer(0, 0, false, false, dt);
      }
    }
  }

  private applyTeammateSpacing(
    player: Player,
    team: Team,
    targetX: number,
    targetZ: number,
  ): { x: number; z: number } {
    let pushX = 0;
    let pushZ = 0;
    const minSpace = 8.0;
    const mates = team.getOutfielders();
    for (let i = 0; i < mates.length; i++) {
      const m = mates[i];
      if (m === player) continue;
      // Repel both away from teammate's current position (relative to target) AND relative to player position
      const dx = targetX - m.position.x;
      const dz = targetZ - m.position.z;
      const d = Math.hypot(dx, dz);
      if (d < minSpace && d > 0.01) {
        const strength = ((minSpace - d) / minSpace) * 6.5;
        pushX += (dx / d) * strength;
        pushZ += (dz / d) * strength;
      } else if (d <= 0.01) {
        pushZ += (player.number % 2 === 0 ? 1 : -1) * 4.5;
      }

      const pDx = player.position.x - m.position.x;
      const pDz = player.position.z - m.position.z;
      const pDist = Math.hypot(pDx, pDz);
      if (pDist < 5.5 && pDist > 0.01) {
        const repel = ((5.5 - pDist) / 5.5) * 4.2;
        pushX += (pDx / pDist) * repel;
        pushZ += (pDz / pDist) * repel;
      }
    }
    return {
      x: THREE.MathUtils.clamp(targetX + pushX, -(HALF_LENGTH - 1.8), HALF_LENGTH - 1.8),
      z: THREE.MathUtils.clamp(targetZ + pushZ, -(HALF_WIDTH - 1.8), HALF_WIDTH - 1.8),
    };
  }

  private runOffBallSupport(
    p: Player,
    carrier: Player,
    team: Team,
    opponent: Team,
    ball: BallPhysics,
    dt: number,
  ): void {
    this.tactical.getTargetAnchor(p, ball.position, true, _anchor);
    let targetX = _anchor.x;
    let targetZ = _anchor.z;

    // Measure pressure on carrier so midfielders drop into supportive triangle when carrier is pressed
    let carrierPressure = Infinity;
    for (let j = 0; j < opponent.players.length; j++) {
      const opp = opponent.players[j];
      const d = Math.hypot(opp.position.x - carrier.position.x, opp.position.z - carrier.position.z);
      if (d < carrierPressure) carrierPressure = d;
    }

    const forwardPos = (p.position.x - carrier.position.x) * team.attackDirection;
    const isAttackingRunner = p.role === 'AVA' || (p.role === 'MED' && forwardPos > 1.5);

    if (isAttackingRunner) {
      p.aiState = 'ATTACK_RUN';
      // Purposeful forward desmarcação into space behind opponent backline when carrier has time
      const runPush = carrierPressure > 3.6 ? 3.2 : 1.4;
      targetX = THREE.MathUtils.clamp(
        targetX + team.attackDirection * runPush,
        -(HALF_LENGTH - 2.4),
        HALF_LENGTH - 2.4,
      );
    } else {
      p.aiState = 'ATTACK_SUPPORT';
      // Come slightly closer laterally as a clean outlet when carrier is tightly marked
      if (carrierPressure < 4.5 && p.role === 'MED') {
        targetX = THREE.MathUtils.lerp(targetX, carrier.position.x + team.attackDirection * 2.5, 0.32);
      }
    }

    // Create open passing lanes: if an opponent sits inside line to carrier, slide toward open infield/wide space
    const cToPX = targetX - carrier.position.x;
    const cToPZ = targetZ - carrier.position.z;
    const cToPLen = Math.hypot(cToPX, cToPZ);
    if (cToPLen > 3.5) {
      const ux = cToPX / cToPLen;
      const uz = cToPZ / cToPLen;
      for (let j = 0; j < opponent.players.length; j++) {
        const opp = opponent.players[j];
        const relX = opp.position.x - carrier.position.x;
        const relZ = opp.position.z - carrier.position.z;
        const proj = relX * ux + relZ * uz;
        if (proj > 1.2 && proj < cToPLen - 0.8) {
          const perp = relX * -uz + relZ * ux;
          if (Math.abs(perp) < 2.5) {
            let shiftSide = perp >= 0 ? -1 : 1;
            const testZ = targetZ + ux * shiftSide * 3.6;
            if (Math.abs(testZ) > HALF_WIDTH - 2.0) {
              shiftSide = -shiftSide;
            }
            targetX += -uz * shiftSide * 2.6;
            targetZ += ux * shiftSide * 3.6;
            break;
          }
        }
      }
    }

    const spaced = this.applyTeammateSpacing(p, team, targetX, targetZ);
    const dx = spaced.x - p.position.x;
    const dz = spaced.z - p.position.z;
    const dist = Math.hypot(dx, dz);

    // Calm deadzone when already positioned cleanly in space -> face ball ready to receive
    if (dist > 0.95) {
      p.steer(dx, dz, dist > 4.4, false, dt);
    } else {
      p.facePoint(ball.position.x, ball.position.z, dt);
      p.steer(0, 0, false, false, dt);
    }
  }

  private runCarrierBehavior(
    carrier: Player,
    team: Team,
    opponent: Team,
    ball: BallPhysics,
    dt: number,
    elapsed: number,
    events?: AIEvents,
  ): void {
    const oppGoalX = team.attackDirection * HALF_LENGTH;
    const distToGoal = Math.hypot(oppGoalX - carrier.position.x, -carrier.position.z);

    // 1. Evaluate smart shooting opportunity (dt-normalized, decisive in shooting range)
    if (distToGoal < 20.5 && (oppGoalX - carrier.position.x) * team.attackDirection > 1.2) {
      const shotRate = distToGoal < 13.5 ? 12.5 : distToGoal < 17.5 ? 7.8 : 4.2;
      if (carrier.aiDecisionTimer <= 0 && dtChance(shotRate, dt)) {
        carrier.aiState = 'SHOOT';
        const oppGk = opponent.getGoalkeeper();
        const cornerSign = oppGk.position.z >= 0 ? -1 : 1;
        const aimZ = cornerSign * (1.25 + Math.random() * 1.15);
        const dx = oppGoalX - carrier.position.x;
        const dz = aimZ - carrier.position.z;

        const distScale = THREE.MathUtils.clamp(distToGoal / 22, 0.45, 1.08);
        const useLowShot = distToGoal < 11.5 && Math.random() < 0.48;
        const useFinesse = !useLowShot && distToGoal < 17.0 && Math.abs(carrier.position.z) > 2.2;
        const speed = (useLowShot ? 22.0 : 22.8 + Math.random() * 4.5) * carrier.skillStat;
        const loft = useLowShot ? 0.72 : (1.8 + Math.random() * 1.4) * distScale;
        const spin = useFinesse ? cornerSign * -4.6 : (Math.random() - 0.5) * 1.8;

        carrier.facingAngle = Math.atan2(dx, dz);
        carrier.animation.triggerAction(
          useLowShot ? 'lowShot' : useFinesse ? 'finesseShot' : 'shoot',
          0.38,
        );
        ball.applyKick(dx, dz, speed, loft, spin, carrier, elapsed);
        carrier.touchCooldown = 0.4;
        carrier.aiDecisionTimer = 0.58;
        events?.onShoot?.(carrier);
        return;
      }
    }

    // 2. Measure pressure from nearest defender
    let nearestOppDist = Infinity;
    let nearestOpp: Player | null = null;
    for (let i = 0; i < opponent.players.length; i++) {
      const opp = opponent.players[i];
      const d = Math.hypot(opp.position.x - carrier.position.x, opp.position.z - carrier.position.z);
      if (d < nearestOppDist) {
        nearestOppDist = d;
        nearestOpp = opp;
      }
    }

    // 3. Evaluate progressive pass / cross / through-ball via unified PassAssist
    const inCrossingZone =
      (oppGoalX - carrier.position.x) * team.attackDirection < 13.5 &&
      Math.abs(carrier.position.z) > 9.0;
    const shouldConsiderPass =
      inCrossingZone || nearestOppDist < 3.4 || dtChance(0.85, dt);

    if (carrier.aiDecisionTimer <= 0 && shouldConsiderPass && (distToGoal > 16.5 || inCrossingZone)) {
      const plan = PassAssist.planAIPass(carrier, team, opponent, nearestOppDist < 2.8);
      if (plan && plan.target) {
        carrier.aiState = 'PASS';
        const dx = plan.targetX - carrier.position.x;
        const dz = plan.targetZ - carrier.position.z;
        carrier.facingAngle = Math.atan2(dx, dz);
        carrier.animation.triggerAction(plan.kind === 'cross' ? 'cross' : 'pass', 0.35);
        ball.applyKick(dx, dz, plan.speed, plan.loft, plan.curve, carrier, elapsed);
        ball.setPassAssist(
          plan.target,
          plan.targetX,
          plan.targetZ,
          plan.kind,
          plan.targetY,
          plan.desiredArrivalSpeed,
        );
        carrier.touchCooldown = 0.34;
        carrier.aiDecisionTimer = 0.65;
        events?.onPass?.(carrier, plan.target);
        return;
      }
    }

    // 4. Intelligent Dribble into open space away from pressing defender
    carrier.aiState = 'ATTACK_CARRY';
    let steerX = oppGoalX - carrier.position.x;
    let steerZ = -carrier.position.z * 0.42;

    if (nearestOpp && nearestOppDist < 5.8) {
      const awayX = carrier.position.x - nearestOpp.position.x;
      const awayZ = carrier.position.z - nearestOpp.position.z;
      steerX += awayX * 0.65;
      steerZ += awayZ * 1.45;
    }

    carrier.steer(steerX, steerZ, distToGoal > 12 && nearestOppDist > 4.2, true, dt);
  }

  public executeAIKickoffPass(
    team: Team,
    opponent: Team,
    ball: BallPhysics,
    elapsed: number,
    events?: AIEvents,
  ): boolean {
    const taker = team.players[4];
    if (!taker) return false;
    const plan = PassAssist.planShortPass(
      taker,
      team,
      opponent,
      -team.attackDirection * 0.85,
      0.3,
      0.32,
    );
    const dx = plan.targetX - taker.position.x;
    const dz = plan.targetZ - taker.position.z;
    taker.aiState = 'PASS';
    taker.facingAngle = Math.atan2(dx, dz);
    taker.animation.triggerAction('pass', 0.34);
    ball.applyKick(dx, dz, plan.speed, plan.loft, plan.curve, taker, elapsed);
    ball.setPassAssist(
      plan.target,
      plan.targetX,
      plan.targetZ,
      plan.kind,
      plan.targetY,
      plan.desiredArrivalSpeed,
    );
    taker.touchCooldown = 0.28;
    taker.aiDecisionTimer = 0.6;
    if (plan.target) events?.onPass?.(taker, plan.target);
    return true;
  }

  private findMostDangerousOpponent(
    opponent: Team,
    ballOwner: Player,
    ownAttackDir: 1 | -1,
  ): Player | null {
    let best: Player | null = null;
    let bestDanger = -999;
    const opps = opponent.getOutfielders();
    for (let i = 0; i < opps.length; i++) {
      const opp = opps[i];
      if (opp === ballOwner) continue;
      const progress = opp.position.x * -ownAttackDir;
      if (progress > bestDanger) {
        bestDanger = progress;
        best = opp;
      }
    }
    return best;
  }
}
