import { Player } from './Player';
import { HALF_LENGTH, TeamPreset, TeamSide } from './types';

export class Team {
  public readonly side: TeamSide;
  public readonly preset: TeamPreset;
  public readonly players: Player[] = [];
  public readonly attackDirection: 1 | -1; // home attacks +X (1), away attacks -X (-1)

  constructor(
    side: TeamSide,
    preset: TeamPreset,
    maxAnisotropy: number,
  ) {
    this.side = side;
    this.preset = preset;
    this.attackDirection = side === 'home' ? 1 : -1;

    preset.roster.forEach((entry, index) => {
      const player = new Player(side, index, entry, preset, maxAnisotropy);
      this.players.push(player);
    });
  }

  public getGoalkeeper(): Player {
    return this.players[0];
  }

  public getOutfielders(): Player[] {
    return this.players.slice(1);
  }

  public getFormationPosition(roleIndex: number, isKickoffTeam: boolean): { x: number; z: number } {
    const dir = this.attackDirection; // +1 for home (starts on -X), -1 for away (starts on +X)
    // Coordinates in team-relative space where -X is own half
    const kickoffSpots: [number, number][] = [
      [-HALF_LENGTH + 1.4, 0], // GR
      [-17.5, 0], // DEF
      [-8.2, -9.8], // MED L
      [-8.2, 9.8], // MED R
      [isKickoffTeam ? -0.44 : -6.2, 0], // AVA
    ];

    const [rx, rz] = kickoffSpots[roleIndex] ?? [-10, 0];
    return {
      x: rx * dir,
      z: rz * dir,
    };
  }

  public resetForKickoff(isKickoffTeam: boolean): void {
    const facing = this.attackDirection === 1 ? Math.PI / 2 : -Math.PI / 2;
    this.players.forEach((p, idx) => {
      const spot = this.getFormationPosition(idx, isKickoffTeam);
      p.homeAnchor.set(spot.x, 0, spot.z);
      p.resetAt(spot.x, spot.z, facing);
    });
  }
}
