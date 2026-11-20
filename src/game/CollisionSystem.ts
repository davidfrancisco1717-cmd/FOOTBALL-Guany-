import * as THREE from 'three';
import { BallPhysics } from './BallPhysics';
import { Player } from './Player';
import { BALL_RADIUS } from './types';

const _forward = new THREE.Vector3();

export interface CollisionEvents {
  onTackleImpact?: (tackler: Player, target: Player | null, wonBall: boolean) => void;
  onBallDeflect?: (player: Player, speed: number) => void;
}

export class CollisionSystem {
  private readonly playerRadius = 0.43;

  public resolvePlayerToPlayer(
    players: Player[],
    ball: BallPhysics,
    elapsed: number,
    events?: CollisionEvents,
  ): void {
    const minDist = this.playerRadius * 2;

    for (let i = 0; i < players.length; i++) {
      const a = players[i];
      for (let j = i + 1; j < players.length; j++) {
        const b = players[j];

        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const distSq = dx * dx + dz * dz;

        if (distSq < minDist * minDist && distSq > 1e-6) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const nz = dz / dist;
          const overlap = (minDist - dist) * 0.52;

          a.position.x -= nx * overlap;
          a.position.z -= nz * overlap;
          b.position.x += nx * overlap;
          b.position.z += nz * overlap;

          // Damp opposing relative velocity so players never glide through each other
          const relVx = b.velocity.x - a.velocity.x;
          const relVz = b.velocity.z - a.velocity.z;
          const relDot = relVx * nx + relVz * nz;
          if (relDot < 0) {
            const impulse = relDot * 0.45;
            a.velocity.x += nx * impulse;
            a.velocity.z += nz * impulse;
            b.velocity.x -= nx * impulse;
            b.velocity.z -= nz * impulse;
          }

          // Handle tackle impact between opponents
          if (a.side !== b.side) {
            if (a.tackleTimer > 0.08 && b.stunTimer <= 0) {
              this.applyTackleHit(a, b, ball, elapsed, events);
            } else if (b.tackleTimer > 0.08 && a.stunTimer <= 0) {
              this.applyTackleHit(b, a, ball, elapsed, events);
            }
          }
        }
      }
    }
  }

  private applyTackleHit(
    tackler: Player,
    victim: Player,
    ball: BallPhysics,
    elapsed: number,
    events?: CollisionEvents,
  ): void {
    victim.stunTimer = 0.62;
    victim.touchCooldown = 0.55;
    victim.isShielding = false;
    victim.animation.triggerAction('fall', 0.58);

    const wonBall = ball.owner === victim;
    if (wonBall) {
      ball.owner = tackler;
      ball.clearPassAssist();
      tackler.getForward(_forward);
      ball.nudgeDribble(_forward.x, _forward.z, 6.0, tackler, elapsed);
    }
    events?.onTackleImpact?.(tackler, victim, wonBall);
  }

  public resolvePlayersAndBall(
    players: Player[],
    ball: BallPhysics,
    elapsed: number,
    events?: CollisionEvents,
  ): void {
    const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);

    // Update shielding state for active ball carrier when closely pressed
    if (ball.owner) {
      const owner = ball.owner;
      const ownerSpeed = Math.hypot(owner.velocity.x, owner.velocity.z);
      let nearestOpp: Player | null = null;
      let nearestDist = 2.35;

      for (let i = 0; i < players.length; i++) {
        const opp = players[i];
        if (opp.side === owner.side) continue;
        const d = Math.hypot(opp.position.x - owner.position.x, opp.position.z - owner.position.z);
        if (d < nearestDist) {
          nearestDist = d;
          nearestOpp = opp;
        }
      }

      if (nearestOpp && ownerSpeed < 4.2 && !owner.isSprinting) {
        owner.isShielding = true;
        const ax = owner.position.x - nearestOpp.position.x;
        const az = owner.position.z - nearestOpp.position.z;
        const alen = Math.hypot(ax, az) || 1;
        owner.shieldAwayX = ax / alen;
        owner.shieldAwayZ = az / alen;
      } else {
        owner.isShielding = false;
      }

      const d = Math.hypot(ball.position.x - owner.position.x, ball.position.z - owner.position.z);
      if (d > 1.75 || ball.position.y > 1.45 || owner.stunTimer > 0) {
        owner.isShielding = false;
        ball.owner = null;
      }
    }

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (p.ownKickGraceTimer > 0) continue;

      const dxBody = ball.position.x - p.position.x;
      const dzBody = ball.position.z - p.position.z;
      const distBody = Math.hypot(dxBody, dzBody);

      // Solid anti-tunneling body contact even during touchCooldown so players never phase through ball
      const minBodyBallDist = this.playerRadius * 0.82 + BALL_RADIUS;
      if (
        ball.owner !== p &&
        distBody < minBodyBallDist &&
        distBody > 1e-4 &&
        ball.position.y < 1.35
      ) {
        const nx = dxBody / distBody;
        const nz = dzBody / distBody;
        ball.position.x = p.position.x + nx * (minBodyBallDist + 0.02);
        ball.position.z = p.position.z + nz * (minBodyBallDist + 0.02);
        if (p.touchCooldown > 0 || p.stunTimer > 0) {
          const vn = ball.velocity.x * nx + ball.velocity.z * nz;
          if (vn < 0) {
            ball.velocity.x -= 1.4 * vn * nx;
            ball.velocity.z -= 1.4 * vn * nz;
            if (ball.intendedReceiver !== p) {
              ball.clearPassAssist();
            }
          }
          continue;
        }
      }

      if (p.touchCooldown > 0 || p.stunTimer > 0) continue;

      // Foot zone lies slightly ahead of player's pelvis
      p.getForward(_forward);
      const footX = p.position.x + _forward.x * 0.36;
      const footZ = p.position.z + _forward.z * 0.36;

      const dxFoot = ball.position.x - footX;
      const dzFoot = ball.position.z - footZ;
      const distFoot = Math.hypot(dxFoot, dzFoot);

      const isIntended = !ball.owner && ball.isPassInFlight && ball.intendedReceiver === p;
      const reach = p.tackleTimer > 0 ? 0.98 : p.role === 'GR' ? 0.9 : isIntended ? 0.88 : 0.74;
      const bodyReach = isIntended ? 0.74 : 0.62;
      const maxGroundReceiveY = isIntended ? 1.46 : 1.18;

      // Sliding tackle steals/clears loose or opponent-held ball
      if (p.tackleTimer > 0 && distFoot < reach + BALL_RADIUS && ball.position.y < 0.95) {
        if (ball.owner && ball.owner.side !== p.side) {
          ball.owner.touchCooldown = 0.55;
          ball.owner.stunTimer = 0.45;
          ball.owner.isShielding = false;
          ball.owner.animation.triggerAction('fall', 0.48);
          events?.onTackleImpact?.(p, ball.owner, true);
        } else {
          events?.onTackleImpact?.(p, null, true);
        }
        ball.owner = null;
        ball.clearPassAssist();
        ball.applyKick(_forward.x, _forward.z, 9.8, 1.3, 0, p, elapsed);
        p.touchCooldown = 0.25;
        continue;
      }

      // Ground & mid-height foot/chest ball contact
      if ((distFoot < reach || distBody < bodyReach) && ball.position.y < maxGroundReceiveY) {
        if (ball.owner === p) {
          // BallPhysics maintains continuous total foot-coupled possession during dribble
          continue;
        } else if (!ball.owner) {
          // Loose / passed ball reception & first touch quality
          const incomingLen = Math.hypot(ball.velocity.x, ball.velocity.z) || 1;
          const alignDot =
            -(ball.velocity.x * _forward.x + ball.velocity.z * _forward.z) / incomingLen;

          if (isIntended && p.role !== 'GR') {
            // Check nearest opponent pressure during reception
            let nearestOppDist = Infinity;
            for (let k = 0; k < players.length; k++) {
              const other = players[k];
              if (other.side === p.side) continue;
              const od = Math.hypot(other.position.x - p.position.x, other.position.z - p.position.z);
              if (od < nearestOppDist) nearestOppDist = od;
            }

            const pSpeed = Math.hypot(p.velocity.x, p.velocity.z);
            const heavyUnderPressure =
              nearestOppDist < 1.35 &&
              ballSpeed > 15.5 &&
              p.isSprinting &&
              Math.random() > 0.68 * p.skillStat;

            ball.owner = p;
            ball.clearPassAssist();
            p.animation.triggerAction('firstTouch', 0.22);

            // Damp vertical bounce / chest-trap down smoothly so ball stays controllable at feet
            ball.velocity.y = Math.min(0.28, Math.max(0, ball.velocity.y * 0.18));
            if (ball.position.y > 0.36) {
              ball.position.y = Math.max(BALL_RADIUS, ball.position.y * 0.48);
            }

            // Gently cushion ball toward front foot pocket without snapping/teleporting
            const pocketX = p.position.x + _forward.x * 0.44;
            const pocketZ = p.position.z + _forward.z * 0.44;
            ball.position.x = THREE.MathUtils.lerp(ball.position.x, pocketX, 0.38);
            ball.position.z = THREE.MathUtils.lerp(ball.position.z, pocketZ, 0.38);

            const carryDirX = pSpeed > 0.55 ? p.velocity.x : _forward.x;
            const carryDirZ = pSpeed > 0.55 ? p.velocity.z : _forward.z;
            const carrySpeed = heavyUnderPressure
              ? Math.max(5.2, pSpeed * 1.15)
              : THREE.MathUtils.clamp(pSpeed * 1.02, 1.9, 8.6);

            ball.nudgeDribble(carryDirX, carryDirZ, carrySpeed, p, elapsed);
            p.touchCooldown = heavyUnderPressure ? 0.14 : 0.08;
            events?.onBallDeflect?.(p, Math.min(6.4, Math.max(2.6, ballSpeed * 0.32)));
          } else if (ballSpeed > 18.2 && p.role !== 'GR') {
            // Very hard blast ricochets physically off player body/leg
            const nx = distBody > 0.01 ? dxBody / distBody : _forward.x;
            const nz = distBody > 0.01 ? dzBody / distBody : _forward.z;
            ball.position.x = p.position.x + nx * 0.65;
            ball.position.z = p.position.z + nz * 0.65;
            ball.applyKick(nx, nz, ballSpeed * 0.38, 1.4, 0, p, elapsed);
            p.touchCooldown = 0.22;
            events?.onBallDeflect?.(p, ballSpeed);
          } else if (
            (ballSpeed > 12.2 || ball.position.y > 0.6) &&
            p.role !== 'GR' &&
            (p.isSprinting || alignDot < 0.1) &&
            Math.random() > 0.58 * p.skillStat
          ) {
            // Heavy first touch when sprinting onto a fast/bouncing loose ball
            const moveDirX = Math.hypot(p.velocity.x, p.velocity.z) > 0.5 ? p.velocity.x : _forward.x;
            const moveDirZ = Math.hypot(p.velocity.x, p.velocity.z) > 0.5 ? p.velocity.z : _forward.z;
            const mLen = Math.hypot(moveDirX, moveDirZ) || 1;
            const tx = moveDirX / mLen;
            const tz = moveDirZ / mLen;

            ball.owner = p;
            ball.clearPassAssist();
            p.animation.triggerAction('firstTouch', 0.22);
            ball.nudgeDribble(tx, tz, Math.max(5.4, Math.hypot(p.velocity.x, p.velocity.z) * 1.15), p, elapsed);
            p.touchCooldown = 0.14;
            events?.onBallDeflect?.(p, 5.2);
          } else {
            // Clean cushioned first touch into controlled dribble
            ball.owner = p;
            ball.clearPassAssist();
            if (ballSpeed > 4.0) {
              p.animation.triggerAction('firstTouch', 0.2);
            }
            const pSpeed = Math.hypot(p.velocity.x, p.velocity.z);
            const carryDirX = pSpeed > 0.6 ? p.velocity.x : _forward.x;
            const carryDirZ = pSpeed > 0.6 ? p.velocity.z : _forward.z;
            ball.nudgeDribble(carryDirX, carryDirZ, Math.max(1.8, pSpeed * 0.94), p, elapsed);
            events?.onBallDeflect?.(p, Math.min(7.5, Math.max(3.0, ballSpeed * 0.36)));
          }
        } else if (ball.owner.side !== p.side) {
          // Pressing steal duel: cleaner recovery when defender wins foot contact
          const prevOwner = ball.owner;
          const shieldPenalty = prevOwner.isShielding ? 0.5 : 1.0;
          const facingBonus =
            ((ball.position.x - p.position.x) * _forward.x +
              (ball.position.z - p.position.z) * _forward.z) > 0
              ? 1.18
              : 0.85;
          const stealChance = 0.46 * p.skillStat * shieldPenalty * facingBonus;
          if (distFoot < 0.64 && Math.random() < stealChance) {
            prevOwner.touchCooldown = 0.48;
            prevOwner.isShielding = false;
            ball.owner = p;
            ball.clearPassAssist();
            ball.nudgeDribble(_forward.x, _forward.z, 4.8, p, elapsed);
            events?.onTackleImpact?.(p, prevOwner, true);
          } else {
            // Physical push separation so defender never passes through ball
            const nx = distBody > 0.01 ? dxBody / distBody : _forward.x;
            const nz = distBody > 0.01 ? dzBody / distBody : _forward.z;
            ball.velocity.x += nx * 1.15;
            ball.velocity.z += nz * 1.15;
          }
        }
      } else if (distBody < 0.74 && ball.position.y >= maxGroundReceiveY && ball.position.y < 2.28) {
        // Aerial header / chest control
        const oppGoalX = p.side === 'home' ? 32 : -32;
        const distToOppGoal = Math.hypot(oppGoalX - p.position.x, -p.position.z);

        if (isIntended && distToOppGoal > 14.5 && ball.position.y < 1.8) {
          // Cushion high pass down in midfield instead of blindly heading forward
          ball.owner = p;
          ball.clearPassAssist();
          ball.position.y = Math.max(BALL_RADIUS, ball.position.y * 0.45);
          ball.velocity.y = 0.2;
          p.animation.triggerAction('firstTouch', 0.24);
          const pSpeed = Math.hypot(p.velocity.x, p.velocity.z);
          const carryDirX = pSpeed > 0.5 ? p.velocity.x : _forward.x;
          const carryDirZ = pSpeed > 0.5 ? p.velocity.z : _forward.z;
          ball.nudgeDribble(carryDirX, carryDirZ, Math.max(2.0, pSpeed * 0.95), p, elapsed);
          p.touchCooldown = 0.1;
          events?.onBallDeflect?.(p, 4.2);
        } else {
          ball.owner = null;
          ball.clearPassAssist();
          p.animation.triggerAction('header', 0.36);

          let headDirX = _forward.x;
          let headDirZ = _forward.z;
          let headSpeed = 9.4;
          let headLoft = 2.8;

          if (distToOppGoal < 15.5) {
            headDirX = oppGoalX - p.position.x;
            headDirZ = (p.position.z > 0 ? -1.4 : 1.4) - p.position.z;
            p.facingAngle = Math.atan2(headDirX, headDirZ);
            headSpeed = 16.5 * p.skillStat;
            headLoft = 1.4;
          }

          ball.applyKick(headDirX, headDirZ, headSpeed, headLoft, 0, p, elapsed);
          p.touchCooldown = 0.35;
          events?.onBallDeflect?.(p, headSpeed);
        }
      }
    }
  }
}
