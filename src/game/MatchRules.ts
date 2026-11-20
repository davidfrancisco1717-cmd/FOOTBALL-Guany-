import { BallPhysics } from './BallPhysics';
import {
  BALL_RADIUS,
  GOAL_HALF_WIDTH,
  GOAL_HEIGHT,
  HALF_LENGTH,
  HALF_WIDTH,
  TeamSide,
} from './types';

export type MatchBoundaryEvent =
  | { type: 'none' }
  | { type: 'goal'; scoringTeam: TeamSide }
  | { type: 'throw_in'; restartTeam: TeamSide; x: number; z: number }
  | { type: 'corner'; restartTeam: TeamSide; x: number; z: number }
  | { type: 'goal_kick'; restartTeam: TeamSide; x: number; z: number };

export class MatchRules {
  public evaluateBallState(ball: BallPhysics): MatchBoundaryEvent {
    const { x, y, z } = ball.position;
    const goalLineThreshold = HALF_LENGTH + BALL_RADIUS * 0.7;

    // 1. Goal detection (home attacks +X, away attacks -X)
    if (Math.abs(z) < GOAL_HALF_WIDTH - 0.05 && y < GOAL_HEIGHT + 0.05) {
      if (x > goalLineThreshold) {
        return { type: 'goal', scoringTeam: 'home' };
      }
      if (x < -goalLineThreshold) {
        return { type: 'goal', scoringTeam: 'away' };
      }
    }

    const lastTeam: TeamSide = ball.lastTouchedBy?.side ?? 'away';
    const otherTeam: TeamSide = lastTeam === 'home' ? 'away' : 'home';

    // 2. Sideline out of bounds (Throw-in / Lançamento)
    if (Math.abs(z) > HALF_WIDTH + BALL_RADIUS * 1.1) {
      const clampedX = Math.max(-HALF_LENGTH + 1.5, Math.min(HALF_LENGTH - 1.5, x));
      const restartZ = z > 0 ? HALF_WIDTH - 0.4 : -HALF_WIDTH + 0.4;
      return {
        type: 'throw_in',
        restartTeam: otherTeam,
        x: clampedX,
        z: restartZ,
      };
    }

    // 3. Endline out of bounds (Corner or Goal Kick)
    if (Math.abs(x) > HALF_LENGTH + BALL_RADIUS * 1.1) {
      const overRightEnd = x > 0; // Right end is Away's goal
      const defendingTeam: TeamSide = overRightEnd ? 'away' : 'home';
      const attackingTeam: TeamSide = overRightEnd ? 'home' : 'away';

      if (lastTeam === defendingTeam) {
        // Corner kick for attacking team
        const cornerX = overRightEnd ? HALF_LENGTH - 0.8 : -HALF_LENGTH + 0.8;
        const cornerZ = z >= 0 ? HALF_WIDTH - 0.8 : -HALF_WIDTH + 0.8;
        return {
          type: 'corner',
          restartTeam: attackingTeam,
          x: cornerX,
          z: cornerZ,
        };
      } else {
        // Goal kick for defending team
        const gkX = overRightEnd ? HALF_LENGTH - 4.2 : -HALF_LENGTH + 4.2;
        return {
          type: 'goal_kick',
          restartTeam: defendingTeam,
          x: gkX,
          z: 0,
        };
      }
    }

    return { type: 'none' };
  }
}
