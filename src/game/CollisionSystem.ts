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
  private readonly playerRadius = 0.42;

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
          const overlap = (minDist - dist) * 0.5;

          a.position.x -= nx * overlap;
          a.position.z -= nz * overlap;
          b.position.x += nx * overlap;
          b.position.z += nz * overlap;

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
    victim.animation.triggerAction('fall', 0.58);

    const wonBall = ball.owner === victim;
    if (wonBall) {
      ball.owner = tackler;
      tackler.getForward(_forward);
      ball.nudgeDribble(_forward.x, _forward.z, 6.2, tackler, elapsed);
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

    // If current owner moved too far from ball, release ownership naturally
    if (ball.owner) {
      const d = Math.hypot(
        ball.position.x - ball.owner.position.x,
        ball.position.z - ball.owner.position.z,
      );
      if (d > 1.25 || ball.position.y > 1.25 || ball.owner.stunTimer > 0) {
        ball.owner = null;
      }
    }

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (p.touchCooldown > 0 || p.stunTimer > 0) continue;

      // Foot zone lies slightly ahead of player's pelvis
      p.getForward(_forward);
      const footX = p.position.x + _forward.x * 0.34;
      const footZ = p.position.z + _forward.z * 0.34;

      const dxBody = ball.position.x - p.position.x;
      const dzBody = ball.position.z - p.position.z;
      const distBody = Math.hypot(dxBody, dzBody);

      const dxFoot = ball.position.x - footX;
      const dzFoot = ball.position.z - footZ;
      const distFoot = Math.hypot(dxFoot, dzFoot);

      const reach = p.tackleTimer > 0 ? 0.92 : p.role === 'GR' ? 0.85 : 0.68;

      // Sliding tackle steals/clears loose or opponent-held ball
      if (p.tackleTimer > 0 && distFoot < reach + BALL_RADIUS && ball.position.y < 0.95) {
        if (ball.owner && ball.owner.side !== p.side) {
          ball.owner.touchCooldown = 0.55;
          ball.owner.stunTimer = 0.45;
          ball.owner.animation.triggerAction('fall', 0.48);
          events?.onTackleImpact?.(p, ball.owner, true);
        } else {
          events?.onTackleImpact?.(p, null, true);
        }
        ball.owner = null;
        ball.applyKick(_forward.x, _forward.z, 9.5, 1.4, 0, p, elapsed);
        p.touchCooldown = 0.25;
        continue;
      }

      // Ground & mid-height foot/body ball contact
      if ((distFoot < reach || distBody < 0.56) && ball.position.y < 1.12) {
        if (ball.owner === p) {
          // Active dribble: frequent physical foot nudges keep ball just ahead of feet
          const idealX = p.position.x + _forward.x * 0.56;
          const idealZ = p.position.z + _forward.z * 0.56;
          const errDist = Math.hypot(idealX - ball.position.x, idealZ - ball.position.z);
          const pSpeed = Math.hypot(p.velocity.x, p.velocity.z);

          if (p.canDribbleNudge() || errDist > 0.32) {
            const nudgeX = (idealX - ball.position.x) * 4.5 + p.velocity.x;
            const nudgeZ = (idealZ - ball.position.z) * 4.5 + p.velocity.z;
            const targetSpeed = Math.max(pSpeed * 1.06, 1.6);
            ball.nudgeDribble(nudgeX, nudgeZ, targetSpeed, p, elapsed);
          }
        } else if (!ball.owner) {
          // Loose ball touch: trap/control or physical deflection if moving very fast
          if (ballSpeed > 15.5 && p.role !== 'GR') {
            // Hard shot/pass ricochet off player body/leg unless controlled
            const nx = distBody > 0.01 ? dxBody / distBody : _forward.x;
            const nz = distBody > 0.01 ? dzBody / distBody : _forward.z;
            ball.position.x = p.position.x + nx * 0.62;
            ball.position.z = p.position.z + nz * 0.62;
            ball.applyKick(nx, nz, ballSpeed * 0.42, 1.8, 0, p, elapsed);
            p.touchCooldown = 0.22;
            events?.onBallDeflect?.(p, ballSpeed);
          } else {
            // Clean first-touch control into dribble
            ball.owner = p;
            ball.nudgeDribble(_forward.x, _forward.z, Math.max(2.2, Math.hypot(p.velocity.x, p.velocity.z)), p, elapsed);
            events?.onBallDeflect?.(p, 4.0);
          }
        } else if (ball.owner.side !== p.side) {
          // Steal duel when opponent steps directly across the ball
          if (distFoot < 0.52 && Math.random() < 0.35 * p.skillStat) {
            const prevOwner = ball.owner;
            prevOwner.touchCooldown = 0.45;
            ball.owner = p;
            ball.nudgeDribble(_forward.x, _forward.z, 4.5, p, elapsed);
            events?.onTackleImpact?.(p, prevOwner, true);
          } else {
            // Physical push separation so players never pass through ball
            const nx = distBody > 0.01 ? dxBody / distBody : _forward.x;
            const nz = distBody > 0.01 ? dzBody / distBody : _forward.z;
            ball.velocity.x += nx * 1.2;
            ball.velocity.z += nz * 1.2;
          }
        }
      } else if (distBody < 0.65 && ball.position.y >= 1.12 && ball.position.y < 2.15) {
        // Aerial header contact
        ball.owner = null;
        p.animation.triggerAction('header', 0.36);
        ball.applyKick(_forward.x, _forward.z, 8.8, 3.2, 0, p, elapsed);
        p.touchCooldown = 0.35;
        events?.onBallDeflect?.(p, 8.5);
      }
    }
  }
}
