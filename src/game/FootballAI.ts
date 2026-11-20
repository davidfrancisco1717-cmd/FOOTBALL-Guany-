import * as THREE from 'three';
import { BallPhysics } from './BallPhysics';
import { Player } from './Player';
import { TacticalSystem } from './TacticalSystem';
import { Team } from './Team';
import { HALF_LENGTH } from './types';

const _anchor = new THREE.Vector3();

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
  ): void {
    const outfielders = team.getOutfielders();
    if (isTrainingDisabledOutfield) {
      // In training mode, keep AI outfielders parked neatly off-pitch so user practices freely
      outfielders.forEach((p, idx) => {
        p.isSupportingPress = false;
        p.steer(0, 0, false, false, dt);
        p.resetAt(-12 + idx * 8, -21.2, 0);
      });
      return;
    }

    const ballOwner = ball.owner;
    const teamHasBall = ballOwner !== null && ballOwner.side === team.side;
    const oppHasBall = ballOwner !== null && ballOwner.side !== team.side;

    // Find closest non-human player to the ball for pressing / loose ball recovery
    let closestAI: Player | null = null;
    let closestDist = Infinity;
    let secondClosestAI: Player | null = null;
    let secondDist = Infinity;

    for (const p of outfielders) {
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

    for (const p of outfielders) {
      if (p.isHumanControlled) continue;

      // 1. Player owns the ball -> Attack, Pass, or Shoot
      if (ballOwner === p) {
        this.runCarrierBehavior(p, team, opponent, ball, dt, elapsed, events);
        continue;
      }

      // 2. Team has the ball -> Attack support runs & passing triangles
      if (teamHasBall) {
        p.aiState = 'ATTACK_SUPPORT';
        this.tactical.getTargetAnchor(p, ball.position, true, _anchor);
        const dx = _anchor.x - p.position.x;
        const dz = _anchor.z - p.position.z;
        const dist = Math.hypot(dx, dz);
        p.steer(dx, dz, dist > 5.0, false, dt);
        if (dist <= 1.0) {
          p.facePoint(ball.position.x, ball.position.z, dt);
        }
        continue;
      }

      // 3. Human teammate double-press trigger (X + Square)
      if (isHumanTeam && humanPressingCount >= 2 && p === closestAI) {
        p.aiState = 'PRESS_BALL';
        p.isSupportingPress = true;
        const dx = ball.position.x - p.position.x;
        const dz = ball.position.z - p.position.z;
        const d = Math.hypot(dx, dz);
        p.steer(dx, dz, true, false, dt);
        if (oppHasBall && d < 2.2 && d > 0.7 && p.tackleCooldown <= 0 && Math.random() < 0.04) {
          p.startTackle(dx, dz);
          events?.onTackleAttempt?.(p);
        }
        continue;
      }

      // 4. Ball is loose -> closest AI sprints to recover it
      if (!ballOwner && p === closestAI && closestDist < 19) {
        p.aiState = 'RECOVER_LOOSE';
        const dx = ball.position.x + ball.velocity.x * 0.2 - p.position.x;
        const dz = ball.position.z + ball.velocity.z * 0.2 - p.position.z;
        p.steer(dx, dz, true, false, dt);
        continue;
      }

      // 5. Opponent has ball -> closest non-human AI presses ball carrier (for AI team)
      if (!isHumanTeam && oppHasBall && p === closestAI) {
        p.aiState = 'PRESS_BALL';
        const dx = ball.position.x - p.position.x;
        const dz = ball.position.z - p.position.z;
        const dist = Math.hypot(dx, dz);
        p.steer(dx, dz, dist > 3.2, false, dt);

        if (dist < 2.15 && dist > 0.75 && p.tackleCooldown <= 0 && Math.random() < 0.025) {
          p.startTackle(dx, dz);
          events?.onTackleAttempt?.(p);
        }
        continue;
      }

      // 6. Second defender marks dangerous opponent or covers passing lane
      if (!isHumanTeam && p === secondClosestAI && oppHasBall) {
        p.aiState = 'DEFEND_MARK';
        const dangerousOpp = this.findMostDangerousOpponent(opponent, ballOwner!, team.attackDirection);
        if (dangerousOpp) {
          // Position between opponent and own goal
          const ownGoalX = -team.attackDirection * HALF_LENGTH;
          const markX = THREE.MathUtils.lerp(dangerousOpp.position.x, ownGoalX, 0.22);
          const markZ = THREE.MathUtils.lerp(dangerousOpp.position.z, 0, 0.18);
          const dx = markX - p.position.x;
          const dz = markZ - p.position.z;
          p.steer(dx, dz, Math.hypot(dx, dz) > 4.0, false, dt);
          continue;
        }
      }

      // 7. Default -> tactical defensive retreat/shape
      p.aiState = 'RETREAT';
      this.tactical.getTargetAnchor(p, ball.position, false, _anchor);
      const dx = _anchor.x - p.position.x;
      const dz = _anchor.z - p.position.z;
      const dist = Math.hypot(dx, dz);
      p.steer(dx, dz, dist > 6.5, false, dt);
      if (dist <= 0.9) {
        p.facePoint(ball.position.x, ball.position.z, dt);
      }
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

    // Check shooting opportunity
    if (distToGoal < 17.5 && (carrier.position.x - oppGoalX) * -team.attackDirection < 16) {
      const shotChance = distToGoal < 11.5 ? 0.14 : 0.055;
      if (carrier.aiDecisionTimer <= 0 && Math.random() < shotChance) {
        carrier.aiState = 'SHOOT';
        const aimZ = (Math.random() - 0.5) * 4.4;
        const dx = oppGoalX - carrier.position.x;
        const dz = aimZ - carrier.position.z;
        carrier.facingAngle = Math.atan2(dx, dz);
        carrier.animation.triggerAction('shoot', 0.38);
        ball.applyKick(dx, dz, 21 + Math.random() * 4.5, 3.2 + Math.random() * 2.2, (Math.random() - 0.5) * 3, carrier, elapsed);
        carrier.touchCooldown = 0.42;
        carrier.aiDecisionTimer = 0.6;
        events?.onShoot?.(carrier);
        return;
      }
    }

    // Check pressure from nearest opponent
    let nearestOppDist = Infinity;
    let nearestOpp: Player | null = null;
    opponent.players.forEach((opp) => {
      const d = Math.hypot(opp.position.x - carrier.position.x, opp.position.z - carrier.position.z);
      if (d < nearestOppDist) {
        nearestOppDist = d;
        nearestOpp = opp;
      }
    });

    // Pass to open teammate if under pressure or teammate is well ahead
    if (carrier.aiDecisionTimer <= 0 && (nearestOppDist < 4.4 || Math.random() < 0.022)) {
      const target = this.findBestPassTarget(carrier, team, opponent);
      if (target) {
        carrier.aiState = 'PASS';
        const leadX = target.position.x + target.velocity.x * 0.25;
        const leadZ = target.position.z + target.velocity.z * 0.25;
        const dx = leadX - carrier.position.x;
        const dz = leadZ - carrier.position.z;
        const dist = Math.hypot(dx, dz);

        carrier.facingAngle = Math.atan2(dx, dz);
        carrier.animation.triggerAction('pass', 0.34);
        const passSpeed = THREE.MathUtils.clamp(dist * 1.05 + 5.5, 11, 20);
        ball.applyKick(dx, dz, passSpeed, dist > 16 ? 3.2 : 0.4, 0, carrier, elapsed);
        carrier.touchCooldown = 0.4;
        carrier.aiDecisionTimer = 0.55;
        events?.onPass?.(carrier, target);
        return;
      }
    }

    // Dribble toward opponent goal while weaving slightly away from nearest defender
    carrier.aiState = 'ATTACK_CARRY';
    let steerX = oppGoalX - carrier.position.x;
    let steerZ = -carrier.position.z * 0.55;

    if (nearestOpp && nearestOppDist < 5.5) {
      const awayX = carrier.position.x - (nearestOpp as Player).position.x;
      const awayZ = carrier.position.z - (nearestOpp as Player).position.z;
      steerX += awayX * 0.6;
      steerZ += awayZ * 1.35;
    }

    carrier.steer(steerX, steerZ, distToGoal > 12, true, dt);
  }

  private findBestPassTarget(carrier: Player, team: Team, opponent: Team): Player | null {
    let best: Player | null = null;
    let bestScore = -999;

    team.getOutfielders().forEach((mate) => {
      if (mate === carrier) return;
      const dx = mate.position.x - carrier.position.x;
      const dz = mate.position.z - carrier.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 3.5 || dist > 26) return;

      const forwardGain = dx * team.attackDirection;
      let minOppToMate = Infinity;
      opponent.players.forEach((opp) => {
        const d = Math.hypot(opp.position.x - mate.position.x, opp.position.z - mate.position.z);
        if (d < minOppToMate) minOppToMate = d;
      });

      const score = forwardGain * 1.1 + minOppToMate * 0.85 - Math.abs(dist - 12) * 0.25;
      if (score > bestScore) {
        bestScore = score;
        best = mate;
      }
    });

    return bestScore > -4 ? best : null;
  }

  private findMostDangerousOpponent(
    opponent: Team,
    ballOwner: Player,
    ownAttackDir: 1 | -1,
  ): Player | null {
    let best: Player | null = null;
    let bestDanger = -999;
    opponent.getOutfielders().forEach((opp) => {
      if (opp === ballOwner) return;
      // Closer to our goal (-ownAttackDir * HALF_LENGTH) = higher danger
      const progress = opp.position.x * -ownAttackDir;
      if (progress > bestDanger) {
        bestDanger = progress;
        best = opp;
      }
    });
    return best;
  }
}
