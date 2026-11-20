import * as THREE from 'three';
import { Player } from './Player';
import { HALF_LENGTH, HALF_WIDTH } from './types';

export type TeamTacticMode = 'balanced' | 'attacking' | 'defensive';

export class TacticalSystem {
  public getTacticMode(ballPos: THREE.Vector3, teamHasBall: boolean, attackDir: 1 | -1): TeamTacticMode {
    const progress = (ballPos.x * attackDir) / HALF_LENGTH; // -1 own goal .. +1 opp goal
    if (teamHasBall) {
      return progress > 0.2 ? 'attacking' : 'balanced';
    }
    return progress < -0.2 ? 'defensive' : 'balanced';
  }

  public getTargetAnchor(
    player: Player,
    ballPos: THREE.Vector3,
    teamHasBall: boolean,
    out: THREE.Vector3,
  ): THREE.Vector3 {
    const dir = player.side === 'home' ? 1 : -1;
    const ballProgress = (ballPos.x * dir) / HALF_LENGTH;
    const ballLateral = ballPos.z;
    const tactic = this.getTacticMode(ballPos, teamHasBall, dir);

    let baseX = 0;
    let baseZ = 0;

    if (player.role === 'GR') {
      baseX = -dir * (HALF_LENGTH - 1.5);
      baseZ = THREE.MathUtils.clamp(ballLateral * 0.25, -2.5, 2.5);
      return out.set(baseX, 0, baseZ);
    }

    if (teamHasBall) {
      // Attacking 1-2-1 diamond with clear vertical & lateral separation
      const pushOffset = tactic === 'attacking' ? 2.6 : 0;

      if (player.role === 'DEF') {
        // Deep pivot behind/angled from carrier offering safe recycling lane
        baseX = ballPos.x - dir * (11.2 - pushOffset * 0.3);
        baseX =
          dir === 1
            ? THREE.MathUtils.clamp(baseX, -(HALF_LENGTH - 6.5), 11.5)
            : THREE.MathUtils.clamp(baseX, -11.5, HALF_LENGTH - 6.5);
        const pivotShade = ballLateral > 4 ? -2.2 : ballLateral < -4 ? 2.2 : 0;
        baseZ = THREE.MathUtils.clamp(ballLateral * 0.36 + pivotShade, -7.2, 7.2);
      } else if (player.role === 'MED') {
        const isLeftMid = player.homeAnchor.z < 0;
        const wingSign = isLeftMid ? -1 : 1;
        const sameSideAsBall = wingSign * ballLateral > 0;

        // Ball-side mid offers diagonal support; weak-side mid stretches forward into opposite half-space
        const ahead = sameSideAsBall ? 5.2 : 9.4 + pushOffset;
        baseX = ballPos.x + dir * ahead;
        baseX =
          dir === 1
            ? THREE.MathUtils.clamp(baseX, -11, HALF_LENGTH - 4.5)
            : THREE.MathUtils.clamp(baseX, -(HALF_LENGTH - 4.5), 11);

        const wideTarget = sameSideAsBall ? wingSign * 12.2 : wingSign * 10.6;
        baseZ = THREE.MathUtils.clamp(
          wideTarget + ballLateral * 0.18,
          -(HALF_WIDTH - 2.0),
          HALF_WIDTH - 2.0,
        );
      } else {
        // AVA: stretches highest defensive line in opposite channel to ball
        const targetAhead = ballPos.x + dir * (12.2 + pushOffset * 0.45);
        baseX =
          dir === 1
            ? THREE.MathUtils.clamp(targetAhead, -1.5, HALF_LENGTH - 2.6)
            : THREE.MathUtils.clamp(targetAhead, -(HALF_LENGTH - 2.6), 1.5);
        const oppChannel = ballLateral > 2.2 ? -6.2 : ballLateral < -2.2 ? 6.2 : 0;
        baseZ = THREE.MathUtils.clamp(oppChannel - ballLateral * 0.14, -8.8, 8.8);
      }
    } else {
      // Defensive compact staggered block protecting central corridor without clustering
      const compactness = tactic === 'defensive' ? 0.84 : 1.0;
      const shiftX = ballProgress * 11.2 * dir;

      if (player.role === 'DEF') {
        baseX = -dir * (tactic === 'defensive' ? 22.8 : 19.6) + shiftX * 0.52;
        baseZ = THREE.MathUtils.clamp(ballLateral * 0.38, -5.6, 5.6);
      } else if (player.role === 'MED') {
        const isLeftMid = player.homeAnchor.z < 0;
        const wingSign = isLeftMid ? -1 : 1;
        baseX = -dir * (tactic === 'defensive' ? 13.8 : 10.0) + shiftX * 0.72;
        baseZ = THREE.MathUtils.clamp(
          wingSign * 7.6 * compactness + ballLateral * 0.32,
          -(HALF_WIDTH - 2.6),
          HALF_WIDTH - 2.6,
        );
      } else {
        // AVA holds midfield outlet / first pressing line
        baseX = -dir * (tactic === 'defensive' ? 5.2 : 1.2) + shiftX * 0.8;
        baseZ = THREE.MathUtils.clamp(-ballLateral * 0.18, -6.0, 6.0);
      }
    }

    return out.set(
      THREE.MathUtils.clamp(baseX, -(HALF_LENGTH - 2), HALF_LENGTH - 2),
      0,
      THREE.MathUtils.clamp(baseZ, -(HALF_WIDTH - 2), HALF_WIDTH - 2),
    );
  }
}
