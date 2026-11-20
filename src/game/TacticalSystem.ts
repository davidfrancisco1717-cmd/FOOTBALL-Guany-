import * as THREE from 'three';
import { Player } from './Player';
import { HALF_LENGTH, HALF_WIDTH } from './types';

export class TacticalSystem {
  public getTargetAnchor(
    player: Player,
    ballPos: THREE.Vector3,
    teamHasBall: boolean,
    out: THREE.Vector3,
  ): THREE.Vector3 {
    const dir = player.side === 'home' ? 1 : -1;
    // Normalized ball progress along team attack direction (-1 own goal .. +1 opp goal)
    const ballProgress = (ballPos.x * dir) / HALF_LENGTH;
    const ballLateral = ballPos.z;

    let baseX = 0;
    let baseZ = 0;

    if (player.role === 'GR') {
      baseX = -dir * (HALF_LENGTH - 1.45);
      baseZ = THREE.MathUtils.clamp(ballLateral * 0.25, -2.5, 2.5);
      return out.set(baseX, 0, baseZ);
    }

    if (teamHasBall) {
      // Attacking shape: push up, spread wide to offer passing lanes
      if (player.role === 'DEF') {
        baseX = THREE.MathUtils.clamp(ballPos.x - dir * 13, -HALF_LENGTH + 7, 10 * dir);
        baseZ = THREE.MathUtils.clamp(ballLateral * 0.4, -7, 7);
      } else if (player.role === 'MED') {
        const isLeftMid = player.homeAnchor.z < 0;
        const wingSign = isLeftMid ? -1 : 1;
        baseX = THREE.MathUtils.clamp(ballPos.x + dir * 5.5, -10, HALF_LENGTH - 5.5);
        if (dir === -1) baseX = THREE.MathUtils.clamp(ballPos.x + dir * 5.5, -(HALF_LENGTH - 5.5), 10);
        baseZ = THREE.MathUtils.clamp(wingSign * 10.5 + ballLateral * 0.25, -HALF_WIDTH + 2.5, HALF_WIDTH - 2.5);
      } else {
        // AVA: spearhead run ahead of the ball
        const targetAhead = ballPos.x + dir * 11;
        baseX = dir === 1
          ? THREE.MathUtils.clamp(targetAhead, -4, HALF_LENGTH - 3.2)
          : THREE.MathUtils.clamp(targetAhead, -(HALF_LENGTH - 3.2), 4);
        baseZ = THREE.MathUtils.clamp(-ballLateral * 0.35, -7.5, 7.5);
      }
    } else {
      // Defensive shape: compact block between ball and own goal
      const shiftX = ballProgress * 12 * dir;
      if (player.role === 'DEF') {
        baseX = -dir * 19 + shiftX * 0.55;
        baseZ = THREE.MathUtils.clamp(ballLateral * 0.45, -6.5, 6.5);
      } else if (player.role === 'MED') {
        const isLeftMid = player.homeAnchor.z < 0;
        const wingSign = isLeftMid ? -1 : 1;
        baseX = -dir * 9.5 + shiftX * 0.72;
        baseZ = THREE.MathUtils.clamp(wingSign * 6.8 + ballLateral * 0.35, -HALF_WIDTH + 3, HALF_WIDTH - 3);
      } else {
        // AVA stays higher as outlet / first press
        baseX = -dir * 1.5 + shiftX * 0.85;
        baseZ = THREE.MathUtils.clamp(ballLateral * 0.3, -6, 6);
      }
    }

    return out.set(
      THREE.MathUtils.clamp(baseX, -(HALF_LENGTH - 2), HALF_LENGTH - 2),
      0,
      THREE.MathUtils.clamp(baseZ, -(HALF_WIDTH - 2), HALF_WIDTH - 2),
    );
  }
}
