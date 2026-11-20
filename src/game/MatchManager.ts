import { GameMode, MatchPhase, TeamSide } from './types';

export class MatchManager {
  public mode: GameMode = 'quick_match';
  public phase: MatchPhase = 'PRE_KICKOFF';
  public half: 1 | 2 = 1;
  public homeScore = 0;
  public awayScore = 0;

  public homeShots = 0;
  public awayShots = 0;
  public homePasses = 0;
  public awayPasses = 0;
  public homeTackles = 0;
  public awayTackles = 0;

  public lastGoalScorer = '';
  public lastGoalTeam: TeamSide | null = null;
  public statusToast = '';

  public phaseTimer = 0;
  public kickoffTeam: TeamSide = 'home';

  private matchDurationSeconds = 180; // default 3 min total (90s per half)
  private halfElapsed = 0;
  private homePossessionTime = 0;
  private awayPossessionTime = 0;
  private toastTimer = 0;

  public startNewMatch(mode: GameMode, matchMinutes: number): void {
    this.mode = mode;
    this.matchDurationSeconds = Math.max(60, matchMinutes * 60);
    this.phase = 'PRE_KICKOFF';
    this.phaseTimer = 0.75;
    this.half = 1;
    this.halfElapsed = 0;
    this.homeScore = 0;
    this.awayScore = 0;
    this.homeShots = 0;
    this.awayShots = 0;
    this.homePasses = 0;
    this.awayPasses = 0;
    this.homeTackles = 0;
    this.awayTackles = 0;
    this.homePossessionTime = 0;
    this.awayPossessionTime = 0;
    this.lastGoalScorer = '';
    this.lastGoalTeam = null;
    this.kickoffTeam = 'home';
    this.setToast(mode === 'training' ? 'Modo Treino' : 'Pontapé de Saída', 1.8);
  }

  public setToast(msg: string, duration = 1.6): void {
    this.statusToast = msg;
    this.toastTimer = duration;
  }

  public recordPossession(side: TeamSide | null, dt: number): void {
    if (this.phase !== 'LIVE' || !side) return;
    if (side === 'home') this.homePossessionTime += dt;
    else this.awayPossessionTime += dt;
  }

  public getHomePossessionPct(): number {
    const total = this.homePossessionTime + this.awayPossessionTime;
    if (total < 0.5) return 50;
    return Math.round((this.homePossessionTime / total) * 100);
  }

  public getDisplayClock(): { minute: number; second: number; label: string } {
    if (this.mode === 'training') {
      const m = Math.floor(this.halfElapsed / 60);
      const s = Math.floor(this.halfElapsed % 60);
      return {
        minute: m,
        second: s,
        label: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
      };
    }

    const halfRealDuration = this.matchDurationSeconds / 2;
    const ratio = Math.min(1, this.halfElapsed / halfRealDuration);
    const totalFootballSeconds = ratio * 45 * 60 + (this.half === 2 ? 45 * 60 : 0);
    const minute = Math.floor(totalFootballSeconds / 60);
    const second = Math.floor(totalFootballSeconds % 60);
    return {
      minute,
      second,
      label: `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`,
    };
  }

  public registerGoal(scoringTeam: TeamSide, scorerName: string): void {
    if (scoringTeam === 'home') this.homeScore++;
    else this.awayScore++;

    this.lastGoalTeam = scoringTeam;
    this.lastGoalScorer = scorerName;
    this.kickoffTeam = scoringTeam === 'home' ? 'away' : 'home';
    this.phase = 'GOAL_CELEBRATION';
    this.phaseTimer = 3.0;
    this.setToast(`GOLO! ${scorerName}`, 3.0);
  }

  public registerOutOfBounds(label: string): void {
    this.phase = 'OUT_OF_BOUNDS';
    this.phaseTimer = 0.85;
    this.setToast(label, 1.3);
  }

  public tick(dt: number): 'none' | 'kickoff_live' | 'reset_kickoff' | 'halftime' | 'fulltime' {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) {
        this.statusToast = '';
      }
    }

    if (this.phase === 'PRE_KICKOFF') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.phase = 'LIVE';
        return 'kickoff_live';
      }
      return 'none';
    }

    if (this.phase === 'GOAL_CELEBRATION') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.phase = 'PRE_KICKOFF';
        this.phaseTimer = 0.7;
        return 'reset_kickoff';
      }
      return 'none';
    }

    if (this.phase === 'OUT_OF_BOUNDS') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.phase = 'LIVE';
        return 'kickoff_live';
      }
      return 'none';
    }

    if (this.phase === 'HALFTIME') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.half = 2;
        this.halfElapsed = 0;
        this.kickoffTeam = 'away';
        this.phase = 'PRE_KICKOFF';
        this.phaseTimer = 0.75;
        this.setToast('2.ª Parte', 1.8);
        return 'halftime';
      }
      return 'none';
    }

    if (this.phase === 'LIVE') {
      this.halfElapsed += dt;
      if (this.mode === 'quick_match') {
        const halfRealDuration = this.matchDurationSeconds / 2;
        if (this.halfElapsed >= halfRealDuration) {
          if (this.half === 1) {
            this.phase = 'HALFTIME';
            this.phaseTimer = 2.0;
            this.setToast('Intervalo', 2.0);
          } else {
            this.phase = 'FULLTIME';
            this.setToast('Fim do Jogo', 3.0);
            return 'fulltime';
          }
        }
      }
    }

    return 'none';
  }
}
