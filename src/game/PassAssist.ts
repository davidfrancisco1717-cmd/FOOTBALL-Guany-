import * as THREE from 'three';
import { BallPhysics } from './BallPhysics';
import { Player } from './Player';
import { Team } from './Team';
import { BALL_RADIUS, GOAL_HALF_WIDTH, HALF_LENGTH, HALF_WIDTH } from './types';

export type PassKind = 'short' | 'long' | 'through' | 'cross' | 'none';

export interface PassPlan {
  kind: PassKind;
  target: Player | null;
  targetX: number;
  targetZ: number;
  targetY: number;
  speed: number;
  loft: number;
  curve: number;
  desiredArrivalSpeed: number;
  score: number;
}

const BALL_GRAVITY = 19.5;
const GRASS_FRICTION = 2.35;

/**
 * Evaluates passing lane safety against all opponent defenders (including GK).
 * Returns both a blocking score penalty and the most threatening interceptor margin.
 */
function evaluateLaneSafety(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  approxBallSpeed: number,
  loft: number,
  opponent: Team,
): { penalty: number; minInterceptMargin: number } {
  const dx = endX - startX;
  const dz = endZ - startZ;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.8) return { penalty: 0, minInterceptMargin: 99 };

  const ux = dx / dist;
  const uz = dz / dist;
  const flightTime = (2 * loft) / BALL_GRAVITY;
  let penalty = 0;
  let minMargin = 99;

  for (let i = 0; i < opponent.players.length; i++) {
    const opp = opponent.players[i];
    const rx = opp.position.x - startX;
    const rz = opp.position.z - startZ;
    const proj = rx * ux + rz * uz;

    if (proj <= 0.6 || proj >= dist + 0.6) continue;

    const perp = Math.abs(rx * -uz + rz * ux);
    const frac = THREE.MathUtils.clamp(proj / dist, 0, 1);

    // Check if a lofted pass clears overhead at this projection point
    let ballHeightAtProj = BALL_RADIUS;
    if (loft > 1.2 && flightTime > 0.15) {
      const tAtProj = proj / Math.max(4, approxBallSpeed);
      if (tAtProj < flightTime) {
        ballHeightAtProj = BALL_RADIUS + loft * tAtProj - 0.5 * BALL_GRAVITY * tAtProj * tAtProj;
      }
    }
    if (ballHeightAtProj > 1.95 && proj > 2.2 && proj < dist - 2.6) {
      // Clears over midfielder's head cleanly
      continue;
    }

    const tBall = proj / Math.max(5.5, approxBallSpeed);
    const oppReachRadius = opp.role === 'GR' ? 1.05 : 0.72;
    const tOpp = Math.max(0, perp - oppReachRadius) / (7.1 * opp.speedStat);
    const margin = tOpp - tBall;

    if (margin < minMargin) minMargin = margin;

    if (perp < 0.85) {
      // Directly blocking lane
      penalty += 14.5;
    } else if (margin < 0.05) {
      // Opponent can step across and intercept before ball passes
      penalty += 9.5 * (1 - THREE.MathUtils.clamp(perp / 3.4, 0, 1));
    } else if (margin < 0.25 && frac > 0.15 && frac < 0.85) {
      penalty += 3.5 * (0.25 - margin) * 4;
    }
  }

  return { penalty, minInterceptMargin: minMargin };
}

function nearestOpponentDistance(x: number, z: number, opponent: Team): number {
  let minD = Infinity;
  for (let i = 0; i < opponent.players.length; i++) {
    const opp = opponent.players[i];
    const d = Math.hypot(opp.position.x - x, opp.position.z - z);
    if (d < minD) minD = d;
  }
  return minD;
}

function forwardSpaceScore(x: number, z: number, attackDir: 1 | -1, opponent: Team): number {
  const aheadX = x + attackDir * 4.5;
  const oppNearAhead = nearestOpponentDistance(aheadX, z, opponent);
  const edgeMargin = Math.min(HALF_LENGTH - Math.abs(x), HALF_WIDTH - Math.abs(z));
  const clampPenalty = edgeMargin < 2.0 ? -3.0 : 0;
  return THREE.MathUtils.clamp(oppNearAhead * 0.65, 0, 5.2) + clampPenalty;
}

function clampToPitch(x: number, z: number, marginX = 1.6, marginZ = 1.5): { x: number; z: number } {
  return {
    x: THREE.MathUtils.clamp(x, -(HALF_LENGTH - marginX), HALF_LENGTH - marginX),
    z: THREE.MathUtils.clamp(z, -(HALF_WIDTH - marginZ), HALF_WIDTH - marginZ),
  };
}

/**
 * Computes crisp ground-pass launch speed accounting for rolling turf friction
 * so the ball reaches the receiver cleanly without dying halfway or blasting past.
 */
function computeGroundPassSpeed(
  dist: number,
  desiredArrivalSpeed: number,
  minSpeed: number,
  maxSpeed: number,
): number {
  // Using v0^2 = v_arr^2 + 2 * a_eff * d, boosted slightly so magnetic arrival cushion handles final settling
  const raw = Math.sqrt(desiredArrivalSpeed * desiredArrivalSpeed + 2 * (GRASS_FRICTION * 1.15) * dist);
  return THREE.MathUtils.clamp(raw + 1.45, minSpeed, maxSpeed);
}

/**
 * Computes initial horizontal speed for an airborne lofted pass so it lands at targetHeight
 * at the target distance, accounting for air drag.
 */
function computeLoftedPassSpeed(
  dist: number,
  loft: number,
  targetHeight: number,
  startHeight: number,
  minSpeed: number,
  maxSpeed: number,
): number {
  // Solve 0.5*g*t^2 - loft*t + (targetHeight - startHeight) = 0 for descending root
  const a = 0.5 * BALL_GRAVITY;
  const b = -loft;
  const c = targetHeight - startHeight;
  const disc = Math.max(0.04, b * b - 4 * a * c);
  const tFlight = Math.max(0.28, (-b + Math.sqrt(disc)) / (2 * a));
  // Compensate gently for airDrag = 0.18
  const dragComp = 1 + 0.095 * tFlight;
  return THREE.MathUtils.clamp((dist / tFlight) * dragComp, minSpeed, maxSpeed);
}

export class PassAssist {
  /**
   * Plans a smart Short Pass (X button): selects the teammate offering the best
   * combination of aim alignment, clear passing lane, open space, and progression,
   * and aims directly for their dynamic foot-reception pocket.
   */
  public static planShortPass(
    passer: Player,
    team: Team,
    opponent: Team,
    aimX: number,
    aimZ: number,
    power: number,
  ): PassPlan {
    const hasAim = Math.hypot(aimX, aimZ) > 0.2;
    let aimDirX = hasAim ? aimX : Math.sin(passer.facingAngle);
    let aimDirZ = hasAim ? aimZ : Math.cos(passer.facingAngle);
    const aimLen = Math.hypot(aimDirX, aimDirZ) || 1;
    aimDirX /= aimLen;
    aimDirZ /= aimLen;

    const preferredDist = 6.5 + power * 10.5;
    const desiredArrival = 4.6 + power * 2.2;

    let bestPlan: PassPlan | null = null;

    for (let i = 0; i < team.players.length; i++) {
      const mate = team.players[i];
      if (mate === passer) continue;

      const rawDx = mate.position.x - passer.position.x;
      const rawDz = mate.position.z - passer.position.z;
      const rawDist = Math.hypot(rawDx, rawDz);
      if (rawDist < 1.6) continue;

      const dot = (rawDx / rawDist) * aimDirX + (rawDz / rawDist) * aimDirZ;
      if (dot < -0.35) continue;

      // Predict receiver foot position at arrival time
      const estSpeed = computeGroundPassSpeed(rawDist, desiredArrival, 8.8, 20.5);
      const estTime = THREE.MathUtils.clamp(rawDist / estSpeed, 0.08, 0.44);
      const mateFwdX = Math.sin(mate.facingAngle);
      const mateFwdZ = Math.cos(mate.facingAngle);

      const footTarget = clampToPitch(
        mate.position.x + mate.velocity.x * estTime * 0.78 + mateFwdX * 0.34,
        mate.position.z + mate.velocity.z * estTime * 0.78 + mateFwdZ * 0.34,
        1.5,
        1.4,
      );

      const dx = footTarget.x - passer.position.x;
      const dz = footTarget.z - passer.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      const speed = computeGroundPassSpeed(dist, desiredArrival, 8.8, 20.5);
      const loft = 0.14 + Math.min(0.14, power * 0.14 + dist * 0.004);

      const lane = evaluateLaneSafety(passer.position.x, passer.position.z, footTarget.x, footTarget.z, speed, loft, opponent);
      const oppToMate = nearestOpponentDistance(footTarget.x, footTarget.z, opponent);
      const spaceBonus = forwardSpaceScore(footTarget.x, footTarget.z, team.attackDirection, opponent);
      const forwardGain = (footTarget.x - passer.position.x) * team.attackDirection;

      // Avoid GK unless user explicitly aims strongly backward toward GK
      const gkPenalty = mate.role === 'GR' ? (hasAim && dot > 0.78 ? 1.2 : 12.0) : 0;
      const tooClosePenalty = rawDist < 3.0 ? (3.0 - rawDist) * 1.4 : 0;
      const distPref = -Math.abs(dist - preferredDist) * 0.14;
      const oppMarkBonus = THREE.MathUtils.clamp((oppToMate - 1.6) * 0.9, -3.5, 4.2);

      const score =
        dot * 6.4 +
        oppMarkBonus +
        spaceBonus * 0.55 +
        THREE.MathUtils.clamp(forwardGain * 0.14, -1.5, 2.6) +
        distPref -
        lane.penalty * 0.78 -
        gkPenalty -
        tooClosePenalty;

      if (!bestPlan || score > bestPlan.score) {
        // Subtle inside-foot curve to bend slightly away from a nearby lane defender
        let curve = 0;
        if (lane.minInterceptMargin < 0.25 && dist > 6) {
          curve = (passer.position.z > footTarget.z ? -1 : 1) * 0.55;
        }
        bestPlan = {
          kind: 'short',
          target: mate,
          targetX: footTarget.x,
          targetZ: footTarget.z,
          targetY: BALL_RADIUS,
          speed,
          loft,
          curve,
          desiredArrivalSpeed: desiredArrival,
          score,
        };
      }
    }

    if (bestPlan) return bestPlan;

    // Fallback directional pass if no valid mate found
    const fx = passer.position.x + aimDirX * 8;
    const fz = passer.position.z + aimDirZ * 8;
    const clamped = clampToPitch(fx, fz);
    return {
      kind: 'short',
      target: null,
      targetX: clamped.x,
      targetZ: clamped.z,
      targetY: BALL_RADIUS,
      speed: 11.5 + power * 4.5,
      loft: 0.16,
      curve: 0,
      desiredArrivalSpeed: 5.0,
      score: 0,
    };
  }

  /**
   * Plans either a Through Pass (Passe em Profundidade) into open space behind the defense
   * or an accurate Long Pass (Triangle button), ensuring the target spot is reachable by
   * the receiver and avoids passing straight into defenders or out of bounds.
   */
  public static planLongOrThroughPass(
    passer: Player,
    team: Team,
    opponent: Team,
    aimX: number,
    aimZ: number,
    power: number,
  ): PassPlan {
    const hasAim = Math.hypot(aimX, aimZ) > 0.2;
    let aimDirX = hasAim ? aimX : Math.sin(passer.facingAngle);
    let aimDirZ = hasAim ? aimZ : Math.cos(passer.facingAngle);
    const aimLen = Math.hypot(aimDirX, aimDirZ) || 1;
    aimDirX /= aimLen;
    aimDirZ /= aimLen;

    const dir = team.attackDirection;
    const preferredDist = 12.0 + power * 15.0;

    // Find opponent deepest outfield defender line X
    let deepestOppDefX = -dir * HALF_LENGTH;
    let maxDepth = -Infinity;
    const oppOut = opponent.getOutfielders();
    for (let i = 0; i < oppOut.length; i++) {
      const progress = oppOut[i].position.x * dir; // higher = closer to opponent's own goal
      if (progress > maxDepth) {
        maxDepth = progress;
        deepestOppDefX = oppOut[i].position.x;
      }
    }

    let bestPlan: PassPlan | null = null;

    for (let i = 0; i < team.players.length; i++) {
      const mate = team.players[i];
      if (mate === passer) continue;
      if (mate.role === 'GR' && (!hasAim || power < 0.7)) continue;

      const rawDx = mate.position.x - passer.position.x;
      const rawDz = mate.position.z - passer.position.z;
      const rawDist = Math.hypot(rawDx, rawDz);
      if (rawDist < 2.4) continue;

      const dot = (rawDx / rawDist) * aimDirX + (rawDz / rawDist) * aimDirZ;
      if (dot < -0.22) continue;

      const mateSpeed = Math.hypot(mate.velocity.x, mate.velocity.z);
      const mateAttackVel = mate.velocity.x * dir;
      const forwardGain = rawDx * dir;

      // 1) Evaluate THROUGH PASS candidate (space ahead of teammate & behind defense)
      const isRunner =
        mate.role !== 'GR' &&
        (mate.role === 'AVA' || mateAttackVel > 1.25 || forwardGain > 1.5);

      if (isRunner) {
        const runVecX =
          mateSpeed > 1.4
            ? mate.velocity.x / mateSpeed * 0.65 + dir * 0.35
            : dir;
        const runVecZ = mateSpeed > 1.4 ? mate.velocity.z / mateSpeed * 0.65 : 0;
        const runLen = Math.hypot(runVecX, runVecZ) || 1;
        const rux = runVecX / runLen;
        const ruz = runVecZ / runLen;

        // Test 2 lead distances (medium space & deep space behind defense)
        const leadDistances = [3.4 + power * 3.2, 5.2 + power * 4.8];
        for (let li = 0; li < leadDistances.length; li++) {
          const leadD = leadDistances[li];
          const rawTarget = clampToPitch(
            mate.position.x + rux * leadD,
            mate.position.z + ruz * leadD,
            2.4,
            1.8,
          );

          const dx = rawTarget.x - passer.position.x;
          const dz = rawTarget.z - passer.position.z;
          const passDist = Math.hypot(dx, dz);
          if (passDist < 4.5) continue;

          const mateDistToSpot = Math.hypot(rawTarget.x - mate.position.x, rawTarget.z - mate.position.z);
          const mateMaxRunSpeed = 7.75 * mate.speedStat;
          const mateArriveTime = mateDistToSpot / mateMaxRunSpeed;

          // Check whether ball can reach spot in sync with teammate (and before defender!)
          const desiredArrival = 5.0 + power * 1.4;
          const groundSpeed = computeGroundPassSpeed(passDist, desiredArrival, 11.4, 22.8);
          const groundTime = passDist / (groundSpeed * 0.86);

          // Do not send the ball where teammate cannot realistically reach it
          if (mateArriveTime > groundTime + 0.38) continue;

          // Check ground lane first; if ground lane is blocked by midfielder, test lobbed through ball
          const groundLane = evaluateLaneSafety(
            passer.position.x,
            passer.position.z,
            rawTarget.x,
            rawTarget.z,
            groundSpeed,
            0.36,
            opponent,
          );

          const oppDistToSpot = nearestOpponentDistance(rawTarget.x, rawTarget.z, opponent);
          const oppArriveTime = Math.max(0, oppDistToSpot - 0.6) / 7.4;

          // Must have reasonable chance for mate to beat defender or at least contest on level terms
          if (oppArriveTime < mateArriveTime - 0.25) continue;

          const useLobThrough = groundLane.penalty > 5.5 && passDist > 10.5;
          const loft = useLobThrough ? THREE.MathUtils.clamp(2.9 + passDist * 0.08, 3.0, 4.9) : 0.32 + power * 0.22;
          const speed = useLobThrough
            ? computeLoftedPassSpeed(passDist, loft, 0.35, BALL_RADIUS, 11.8, 22.5)
            : groundSpeed;

          const finalLane = useLobThrough
            ? evaluateLaneSafety(passer.position.x, passer.position.z, rawTarget.x, rawTarget.z, speed, loft, opponent)
            : groundLane;

          const behindDefenseBonus = (rawTarget.x - deepestOppDefX) * dir > -0.6 ? 3.4 : 0;
          const raceAdvantage = THREE.MathUtils.clamp((oppArriveTime - mateArriveTime) * 4.5, -2.8, 4.5);
          const reachFitPenalty = Math.abs(mateArriveTime - groundTime) * 1.8;

          const score =
            dot * 5.6 +
            raceAdvantage +
            behindDefenseBonus +
            THREE.MathUtils.clamp((rawTarget.x - passer.position.x) * dir * 0.22, -1.0, 4.0) -
            finalLane.penalty * 0.72 -
            reachFitPenalty -
            Math.abs(passDist - preferredDist) * 0.08;

          if (!bestPlan || score > bestPlan.score) {
            bestPlan = {
              kind: 'through',
              target: mate,
              targetX: rawTarget.x,
              targetZ: rawTarget.z,
              targetY: BALL_RADIUS,
              speed,
              loft,
              curve: 0,
              desiredArrivalSpeed: desiredArrival,
              score,
            };
          }
        }
      }

      // 2) Evaluate DIRECT LONG PASS (switch of play or lofted ball to distant open teammate)
      const estAirTime = THREE.MathUtils.clamp(0.45 + rawDist * 0.036, 0.45, 1.32);
      const leadTarget = clampToPitch(
        mate.position.x + mate.velocity.x * estAirTime * 0.65 + dir * 1.1,
        mate.position.z + mate.velocity.z * estAirTime * 0.65,
        2.0,
        1.8,
      );

      const ldx = leadTarget.x - passer.position.x;
      const ldz = leadTarget.z - passer.position.z;
      const lDist = Math.hypot(ldx, ldz) || 1;
      const loft = THREE.MathUtils.clamp(2.6 + lDist * 0.11 + power * 1.5, 2.8, 6.2);
      const speed = computeLoftedPassSpeed(lDist, loft, 0.35, BALL_RADIUS, 12.2, 24.5);

      const lane = evaluateLaneSafety(passer.position.x, passer.position.z, leadTarget.x, leadTarget.z, speed, loft, opponent);
      const oppToSpot = nearestOpponentDistance(leadTarget.x, leadTarget.z, opponent);
      const distPref = -Math.abs(lDist - preferredDist) * 0.1;
      const longRangeBonus = lDist > 12 ? 1.8 : 0;
      const gkPenalty = mate.role === 'GR' ? 9.0 : 0;

      const longScore =
        dot * 5.8 +
        THREE.MathUtils.clamp((oppToSpot - 1.5) * 0.95, -3.5, 4.5) +
        longRangeBonus +
        distPref -
        lane.penalty * 0.65 -
        gkPenalty;

      if (!bestPlan || longScore > bestPlan.score) {
        bestPlan = {
          kind: 'long',
          target: mate,
          targetX: leadTarget.x,
          targetZ: leadTarget.z,
          targetY: 0.35,
          speed,
          loft,
          curve: 0,
          desiredArrivalSpeed: 5.2,
          score: longScore,
        };
      }
    }

    if (bestPlan) return bestPlan;

    const fallback = clampToPitch(
      passer.position.x + aimDirX * (14 + power * 10),
      passer.position.z + aimDirZ * (12 + power * 8),
    );
    return {
      kind: 'long',
      target: null,
      targetX: fallback.x,
      targetZ: fallback.z,
      targetY: BALL_RADIUS,
      speed: 17.0 + power * 5.5,
      loft: 3.8,
      curve: 0,
      desiredArrivalSpeed: 5.5,
      score: 0,
    };
  }

  /**
   * Plans an intelligent Cross (Circle button): finds teammates inside or attacking
   * the penalty box, checks goalkeeper & center-backs, and delivers to head, chest,
   * or feet depending on hold power and box geometry.
   */
  public static planCross(
    crosser: Player,
    team: Team,
    opponent: Team,
    aimX: number,
    aimZ: number,
    power: number,
  ): PassPlan {
    const dir = team.attackDirection;
    const oppGoalX = dir * HALF_LENGTH;
    const oppGk = opponent.getGoalkeeper();

    // If crosser is deep in own half (far from crossing zone), fall back to long diagonal switch
    if ((oppGoalX - crosser.position.x) * dir > 38) {
      return this.planLongOrThroughPass(crosser, team, opponent, aimX, aimZ, Math.max(0.55, power));
    }

    // Target height by power: tap -> feet, medium -> chest/volley, firm -> head
    const targetHeight = power < 0.36 ? 0.26 : power < 0.68 ? 1.05 : 1.66;

    let bestPlan: PassPlan | null = null;
    const candidates = team.getOutfielders().filter((p) => p !== crosser);

    for (let i = 0; i < candidates.length; i++) {
      const mate = candidates[i];
      const distToOppGoalX = (oppGoalX - mate.position.x) * dir;
      if (distToOppGoalX > 24) continue; // too deep to receive a box cross

      const inBoxBonus = distToOppGoalX < 13.5 && Math.abs(mate.position.z) < 10.5 ? 6.5 : 0;
      const roleBonus = mate.role === 'AVA' ? 4.5 : mate.role === 'MED' ? 2.2 : 0;

      // Predict attacker run toward goal / penalty spot
      const leadX = THREE.MathUtils.clamp(
        mate.position.x + mate.velocity.x * 0.42 + dir * (1.8 + power * 1.8),
        -(HALF_LENGTH - 1.6),
        HALF_LENGTH - 1.6,
      );
      const aimShiftZ = Math.abs(aimZ) > 0.2 ? aimZ * 2.2 : 0;
      let leadZ = THREE.MathUtils.clamp(
        mate.position.z + mate.velocity.z * 0.38 + aimShiftZ,
        -(GOAL_HALF_WIDTH + 3.2),
        GOAL_HALF_WIDTH + 3.2,
      );

      // Avoid crossing directly into GK's hands if GK is patrolling near the 6-yard box
      const distToGk = Math.hypot(leadX - oppGk.position.x, leadZ - oppGk.position.z);
      let adjustedX = leadX;
      if (distToGk < 3.6) {
        // Pull cross slightly back toward penalty spot / far post away from GK
        adjustedX = THREE.MathUtils.clamp(
          leadX - dir * 1.8,
          -(HALF_LENGTH - 1.8),
          HALF_LENGTH - 1.8,
        );
        const farPostSign = crosser.position.z >= 0 ? -1 : 1;
        leadZ = THREE.MathUtils.clamp(
          THREE.MathUtils.lerp(leadZ, farPostSign * 2.5, 0.45),
          -(GOAL_HALF_WIDTH + 2.8),
          GOAL_HALF_WIDTH + 2.8,
        );
      }

      const dx = adjustedX - crosser.position.x;
      const dz = leadZ - crosser.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 3.0) continue;

      const loft =
        power < 0.36
          ? THREE.MathUtils.clamp(1.75 + dist * 0.04, 1.7, 2.7)
          : power < 0.68
            ? THREE.MathUtils.clamp(3.3 + dist * 0.07, 3.4, 4.9)
            : THREE.MathUtils.clamp(4.7 + dist * 0.08 + (power - 0.68) * 3.0, 4.8, 6.8);

      const speed = computeLoftedPassSpeed(dist, loft, targetHeight, BALL_RADIUS, 12.2, 23.0);
      const oppToSpot = nearestOpponentDistance(adjustedX, leadZ, opponent);
      const gkDistAfterAdjust = Math.hypot(adjustedX - oppGk.position.x, leadZ - oppGk.position.z);
      const gkPenalty = gkDistAfterAdjust < 2.6 ? (2.6 - gkDistAfterAdjust) * 4.5 : 0;
      const forwardAimFit = Math.abs(aimX) > 0.25 ? ((adjustedX - crosser.position.x) * aimX > 0 ? 1.4 : -1.4) : 0;

      const score =
        inBoxBonus +
        roleBonus +
        THREE.MathUtils.clamp((oppToSpot - 1.2) * 1.2, -3.0, 4.5) -
        Math.abs(distToOppGoalX - 7.5) * 0.25 -
        gkPenalty +
        forwardAimFit;

      if (!bestPlan || score > bestPlan.score) {
        const curve = (crosser.position.z > 0 ? -1 : 1) * (2.6 + power * 2.2);
        bestPlan = {
          kind: 'cross',
          target: mate,
          targetX: adjustedX,
          targetZ: leadZ,
          targetY: targetHeight,
          speed,
          loft,
          curve,
          desiredArrivalSpeed: 6.2,
          score,
        };
      }
    }

    if (bestPlan) return bestPlan;

    // Fallback toward penalty spot if no runners in box
    const spotX = oppGoalX - dir * (6.2 + power * 2.8);
    const spotZ = THREE.MathUtils.clamp(aimZ * 3.8, -4.2, 4.2);
    const dx = spotX - crosser.position.x;
    const dz = spotZ - crosser.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    const loft = power < 0.36 ? 2.2 : 4.6 + power * 2.4;
    const speed = computeLoftedPassSpeed(dist, loft, targetHeight, BALL_RADIUS, 12.5, 22.0);
    return {
      kind: 'cross',
      target: null,
      targetX: spotX,
      targetZ: spotZ,
      targetY: targetHeight,
      speed,
      loft,
      curve: (crosser.position.z > 0 ? -1 : 1) * (2.8 + power * 1.8),
      desiredArrivalSpeed: 6.2,
      score: 0,
    };
  }

  /**
   * Unified intelligent pass selector for AI outfield carriers.
   */
  public static planAIPass(
    carrier: Player,
    team: Team,
    opponent: Team,
    underHeavyPressure: boolean,
  ): PassPlan | null {
    const dir = team.attackDirection;
    const oppGoalX = dir * HALF_LENGTH;

    // Wide in final third -> evaluate smart box cross
    const inCrossingZone =
      (oppGoalX - carrier.position.x) * dir < 13.5 && Math.abs(carrier.position.z) > 9.0;
    if (inCrossingZone) {
      const crossPlan = this.planCross(carrier, team, opponent, dir * 0.4, 0, 0.58);
      if (crossPlan.target && crossPlan.score > 2.0) {
        return crossPlan;
      }
    }

    let bestPlan: PassPlan | null = null;
    const mates = team.getOutfielders();

    for (let i = 0; i < mates.length; i++) {
      const mate = mates[i];
      if (mate === carrier) continue;
      const dx = mate.position.x - carrier.position.x;
      const dz = mate.position.z - carrier.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 3.5 || dist > 28) continue;

      const forwardGain = dx * dir;
      if (!underHeavyPressure && forwardGain < 1.0) continue;

      const mateFwdX = Math.sin(mate.facingAngle);
      const mateFwdZ = Math.cos(mate.facingAngle);
      const isThrough =
        forwardGain > 3.5 &&
        (mate.role === 'AVA' || mate.velocity.x * dir > 1.8) &&
        nearestOpponentDistance(mate.position.x + dir * 3.5, mate.position.z, opponent) > 2.8;

      const leadTime = isThrough ? 0.48 : 0.24;
      const ahead = isThrough ? dir * 3.8 : 0;
      const target = clampToPitch(
        mate.position.x + mate.velocity.x * leadTime + ahead + (isThrough ? 0 : mateFwdX * 0.3),
        mate.position.z + mate.velocity.z * leadTime + (isThrough ? 0 : mateFwdZ * 0.3),
        1.6,
        1.5,
      );

      const pdx = target.x - carrier.position.x;
      const pdz = target.z - carrier.position.z;
      const pDist = Math.hypot(pdx, pdz) || 1;
      const desiredArrival = isThrough ? 5.2 : 4.8;
      const loft = pDist > 17 ? 3.1 : isThrough ? 0.36 : 0.18;
      const speed =
        loft > 1.5
          ? computeLoftedPassSpeed(pDist, loft, 0.35, BALL_RADIUS, 12.2, 22.5)
          : computeGroundPassSpeed(pDist, desiredArrival, 10.4, 21.5);

      const lane = evaluateLaneSafety(carrier.position.x, carrier.position.z, target.x, target.z, speed, loft, opponent);
      const minOppToTarget = nearestOpponentDistance(target.x, target.z, opponent);
      const openOutletBonus = minOppToTarget > 4.6 && lane.penalty < 2.0 ? 2.4 : 0;

      const score =
        forwardGain * 1.18 +
        minOppToTarget * 0.92 +
        openOutletBonus -
        Math.abs(pDist - 12.5) * 0.18 -
        lane.penalty * 0.85 +
        (isThrough ? 2.6 : 0);

      if (score > 0.4 && (!bestPlan || score > bestPlan.score)) {
        bestPlan = {
          kind: isThrough ? 'through' : pDist > 17 ? 'long' : 'short',
          target: mate,
          targetX: target.x,
          targetZ: target.z,
          targetY: BALL_RADIUS,
          speed,
          loft,
          curve: 0,
          desiredArrivalSpeed: desiredArrival,
          score,
        };
      }
    }

    return bestPlan;
  }

  /**
   * Plans intelligent Goalkeeper distribution avoiding marked teammates & blocked lanes.
   */
  public static planGKDistribution(gk: Player, team: Team, opponent: Team): PassPlan | null {
    const outfield = team.getOutfielders();
    let bestPlan: PassPlan | null = null;

    for (let i = 0; i < outfield.length; i++) {
      const mate = outfield[i];
      const lead = clampToPitch(
        mate.position.x + mate.velocity.x * 0.35,
        mate.position.z + mate.velocity.z * 0.35,
        2.0,
        1.8,
      );
      const dx = lead.x - gk.position.x;
      const dz = lead.z - gk.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      const isLongThrow = dist > 17.5;
      const loft = isLongThrow ? 4.3 : 1.35;
      const speed = computeLoftedPassSpeed(dist, loft, 0.32, BALL_RADIUS, 10.8, 21.5);

      const lane = evaluateLaneSafety(gk.position.x, gk.position.z, lead.x, lead.z, speed, loft, opponent);
      const oppNearMate = nearestOpponentDistance(lead.x, lead.z, opponent);
      const forwardGain = (lead.x - gk.position.x) * team.attackDirection;
      const roleBonus = mate.role === 'MED' ? 1.8 : mate.role === 'DEF' ? 1.4 : 0.9;

      const score =
        forwardGain * 0.45 +
        roleBonus +
        THREE.MathUtils.clamp(oppNearMate * 0.85, 0, 5.0) -
        Math.abs(dist - 15) * 0.22 -
        lane.penalty * 0.8;

      if (!bestPlan || score > bestPlan.score) {
        bestPlan = {
          kind: isLongThrow ? 'long' : 'short',
          target: mate,
          targetX: lead.x,
          targetZ: lead.z,
          targetY: 0.28,
          speed,
          loft,
          curve: 0,
          desiredArrivalSpeed: 4.8,
          score,
        };
      }
    }

    return bestPlan;
  }

  /**
   * Computes an optimal intercept point along the ball's active pass trajectory
   * for the intended receiver to move cleanly onto the ball.
   */
  public static computeReceptionPoint(
    receiver: Player,
    ball: BallPhysics,
    maxLeadSec: number,
  ): { x: number; z: number } {
    const vx = ball.velocity.x;
    const vz = ball.velocity.z;
    const vSq = vx * vx + vz * vz;
    if (vSq < 0.7) {
      return { x: ball.position.x, z: ball.position.z };
    }
    const relX = receiver.position.x - ball.position.x;
    const relZ = receiver.position.z - ball.position.z;
    const tProj = THREE.MathUtils.clamp((relX * vx + relZ * vz) / vSq, 0.05, maxLeadSec);
    const projX = ball.position.x + vx * tProj;
    const projZ = ball.position.z + vz * tProj;

    if (ball.passKind === 'through' || ball.passKind === 'cross') {
      return {
        x: THREE.MathUtils.clamp(
          THREE.MathUtils.lerp(projX, ball.passTargetPos.x, 0.42),
          -(HALF_LENGTH - 1),
          HALF_LENGTH - 1,
        ),
        z: THREE.MathUtils.clamp(
          THREE.MathUtils.lerp(projZ, ball.passTargetPos.z, 0.42),
          -(HALF_WIDTH - 1),
          HALF_WIDTH - 1,
        ),
      };
    }

    return {
      x: THREE.MathUtils.clamp(projX, -(HALF_LENGTH - 1), HALF_LENGTH - 1),
      z: THREE.MathUtils.clamp(projZ, -(HALF_WIDTH - 1), HALF_WIDTH - 1),
    };
  }
}
