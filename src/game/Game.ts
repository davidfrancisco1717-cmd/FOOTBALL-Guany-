import * as THREE from 'three';
import { AudioManager } from '../audio/AudioManager';
import { KeyboardControls } from '../controls/KeyboardControls';
import { TouchControls } from '../controls/TouchControls';
import { Ball } from './Ball';
import { BallPhysics } from './BallPhysics';
import { CameraController } from './CameraController';
import { CollisionSystem } from './CollisionSystem';
import { FootballAI } from './FootballAI';
import { GameLoop } from './GameLoop';
import { GoalkeeperAI } from './GoalkeeperAI';
import { MatchManager } from './MatchManager';
import { MatchRules } from './MatchRules';
import { Pitch } from './Pitch';
import { Player } from './Player';
import { PlayerController } from './PlayerController';
import { SceneManager } from './SceneManager';
import { Stadium } from './Stadium';
import { Team } from './Team';
import {
  BALL_RADIUS,
  DEFAULT_SETTINGS,
  GameMode,
  GameSettings,
  HALF_LENGTH,
  HALF_WIDTH,
  HudSnapshot,
  RadarDot,
  StadiumTime,
  TEAMS,
  TeamPreset,
  TeamSide,
} from './types';

export interface GameCallbacks {
  onHudUpdate?: (snapshot: HudSnapshot) => void;
  onTogglePause?: () => void;
  onCameraChanged?: (mode: GameSettings['cameraMode']) => void;
  onMatchFinished?: (snapshot: HudSnapshot) => void;
}

export class Game {
  public readonly sceneManager: SceneManager;
  public readonly cameraController: CameraController;
  public readonly touchControls = new TouchControls();
  public readonly keyboardControls: KeyboardControls;
  public readonly audio = new AudioManager();

  private readonly loop: GameLoop;
  private readonly pitch: Pitch;
  private readonly stadium: Stadium;
  private readonly ballVisual: Ball;
  private readonly ballPhysics = new BallPhysics();
  private readonly collisionSystem = new CollisionSystem();
  private readonly footballAI = new FootballAI();
  private readonly homeGkAI = new GoalkeeperAI();
  private readonly awayGkAI = new GoalkeeperAI();
  private readonly matchManager = new MatchManager();
  private readonly matchRules = new MatchRules();

  private homeTeam!: Team;
  private awayTeam!: Team;
  private playerController!: PlayerController;

  private settings: GameSettings = { ...DEFAULT_SETTINGS };
  private homePreset: TeamPreset = TEAMS[0];
  private awayPreset: TeamPreset = TEAMS[1];
  private stadiumTime: StadiumTime = 'day';

  private isInMatchView = false;
  private isPaused = false;
  private hudEmitAccum = 0;
  private elapsedTotal = 0;
  private scorerRef: Player | null = null;
  private callbacks: GameCallbacks;
  private detachKeyboard: () => void;
  private resizeHandler: () => void;

  constructor(
    container: HTMLElement,
    initialSettings: GameSettings,
    callbacks: GameCallbacks = {},
  ) {
    this.settings = { ...initialSettings };
    this.callbacks = callbacks;

    this.sceneManager = new SceneManager(container, this.settings);
    const aspect =
      (container.clientWidth || window.innerWidth) /
      Math.max(1, container.clientHeight || window.innerHeight);
    this.cameraController = new CameraController(aspect);
    this.cameraController.setMode(this.settings.cameraMode);
    this.cameraController.setZoom(this.settings.cameraZoom);

    this.pitch = new Pitch(this.sceneManager.maxAnisotropy);
    this.stadium = new Stadium(this.sceneManager.maxAnisotropy);
    this.ballVisual = new Ball(this.sceneManager.maxAnisotropy);

    this.sceneManager.scene.add(this.stadium.group);
    this.sceneManager.scene.add(this.pitch.group);
    this.sceneManager.scene.add(this.ballVisual.group);

    this.keyboardControls = new KeyboardControls({
      onTogglePause: () => {
        if (this.isInMatchView) {
          this.callbacks.onTogglePause?.();
        }
      },
      onToggleCamera: () => {
        if (this.isInMatchView) {
          const next = this.settings.cameraMode === 'tv' ? 'psp' : 'tv';
          this.updateSettings({ ...this.settings, cameraMode: next });
          this.callbacks.onCameraChanged?.(next);
        }
      },
    });
    this.detachKeyboard = this.keyboardControls.attach(this.sceneManager.renderer.domElement);

    this.resizeHandler = () => {
      this.sceneManager.resize(this.cameraController.camera);
    };
    window.addEventListener('resize', this.resizeHandler);

    this.buildTeams(this.homePreset, this.awayPreset);
    this.setStadiumTime(this.stadiumTime);
    this.audio.setSettings(this.settings.soundEnabled, this.settings.volume);

    if (!this.sceneManager.isSoftwareGl) {
      this.sceneManager.renderer.compile(this.sceneManager.scene, this.cameraController.camera);
    }

    this.loop = new GameLoop(
      this.sceneManager.renderer,
      this.sceneManager.isSoftwareGl,
      (dt, elapsed) => this.tick(dt, elapsed),
    );
    this.loop.setFpsLimit(this.settings.fpsLimit);
    this.loop.start();
  }

  private buildTeams(home: TeamPreset, away: TeamPreset): void {
    if (this.homeTeam) {
      this.homeTeam.players.forEach((p) => this.sceneManager.scene.remove(p.group));
    }
    if (this.awayTeam) {
      this.awayTeam.players.forEach((p) => this.sceneManager.scene.remove(p.group));
    }

    this.homePreset = home;
    this.awayPreset = away;
    this.homeTeam = new Team('home', home, this.sceneManager.maxAnisotropy);
    this.awayTeam = new Team('away', away, this.sceneManager.maxAnisotropy);

    this.homeTeam.players.forEach((p) => this.sceneManager.scene.add(p.group));
    this.awayTeam.players.forEach((p) => this.sceneManager.scene.add(p.group));

    this.playerController = new PlayerController(this.homeTeam.players[4]); // AVA default
    this.resetKickoffPositions('home');
  }

  private resetKickoffPositions(kickoffTeam: TeamSide): void {
    this.homeTeam.resetForKickoff(kickoffTeam === 'home');
    this.awayTeam.resetForKickoff(kickoffTeam === 'away');
    this.ballPhysics.resetTo(0, 0, BALL_RADIUS);
    this.ballVisual.syncTransform(this.ballPhysics.position, this.ballPhysics.quaternion);
    this.playerController.setActivePlayer(this.homeTeam.players[4]);
    this.scorerRef = null;
  }

  public setTeams(home: TeamPreset, away: TeamPreset): void {
    this.buildTeams(home, away);
    this.updateStadiumScoreboard(false);
  }

  public setStadiumTime(time: StadiumTime): void {
    this.stadiumTime = time;
    this.sceneManager.setStadiumTime(time, this.settings);
    this.stadium.setTimeOfDay(time);
  }

  public updateSettings(next: GameSettings): void {
    this.settings = { ...next };
    this.sceneManager.applySettings(this.settings);
    this.sceneManager.setStadiumTime(this.stadiumTime, this.settings);
    this.cameraController.setMode(this.settings.cameraMode);
    this.cameraController.setZoom(this.settings.cameraZoom);
    this.loop.setFpsLimit(this.settings.fpsLimit);
    this.audio.setSettings(this.settings.soundEnabled, this.settings.volume);
  }

  public startMatch(mode: GameMode, home: TeamPreset, away: TeamPreset): void {
    this.audio.unlock();
    this.buildTeams(home, away);
    this.matchManager.startNewMatch(mode, this.settings.matchMinutes);
    this.isInMatchView = true;
    this.isPaused = false;
    this.touchControls.clearAll();
    this.cameraController.snapToGameplay(this.ballPhysics.position);
    this.audio.playWhistle('kickoff');
    this.updateStadiumScoreboard(false);
    this.emitHudSnapshot();
  }

  public setMenuMode(): void {
    this.isInMatchView = false;
    this.isPaused = false;
    this.touchControls.clearAll();
    this.resetKickoffPositions('home');
  }

  public setPaused(paused: boolean): void {
    this.isPaused = paused;
    if (paused) {
      this.touchControls.clearAll();
    }
  }

  public getHudSnapshot(): HudSnapshot {
    const clock = this.matchManager.getDisplayClock();
    const active = this.playerController.activePlayer;
    const owner = this.ballPhysics.owner;
    const radarDots: RadarDot[] = [];

    this.homeTeam.players.forEach((p) => {
      radarDots.push({
        x: p.position.x / HALF_LENGTH,
        z: p.position.z / HALF_WIDTH,
        team: 'home',
        active: p === active,
      });
    });

    if (this.matchManager.mode === 'quick_match') {
      this.awayTeam.players.forEach((p) => {
        radarDots.push({
          x: p.position.x / HALF_LENGTH,
          z: p.position.z / HALF_WIDTH,
          team: 'away',
        });
      });
    } else {
      // Only show away goalkeeper on radar in training
      const gk = this.awayTeam.getGoalkeeper();
      radarDots.push({
        x: gk.position.x / HALF_LENGTH,
        z: gk.position.z / HALF_WIDTH,
        team: 'away',
      });
    }

    radarDots.push({
      x: this.ballPhysics.position.x / HALF_LENGTH,
      z: this.ballPhysics.position.z / HALF_WIDTH,
      team: 'ball',
    });

    return {
      homeTeam: this.homePreset,
      awayTeam: this.awayPreset,
      homeScore: this.matchManager.homeScore,
      awayScore: this.matchManager.awayScore,
      displayMinute: clock.minute,
      displaySecond: clock.second,
      half: this.matchManager.half,
      phase: this.matchManager.phase,
      mode: this.matchManager.mode,
      possessionTeam: owner ? owner.side : this.ballPhysics.lastTouchedBy?.side ?? null,
      homePossessionPct: this.matchManager.getHomePossessionPct(),
      activePlayerName: active.name,
      activePlayerNumber: active.number,
      activePlayerRole: active.role,
      activePlayerStamina: Math.round(active.stamina),
      shotCharge: this.playerController.shotCharge,
      teamHasBall: owner !== null && owner.side === 'home',
      lastGoalScorer: this.matchManager.lastGoalScorer,
      lastGoalTeam: this.matchManager.lastGoalTeam,
      statusToast: this.matchManager.statusToast,
      homeShots: this.matchManager.homeShots,
      awayShots: this.matchManager.awayShots,
      homePasses: this.matchManager.homePasses,
      awayPasses: this.matchManager.awayPasses,
      homeTackles: this.matchManager.homeTackles,
      awayTackles: this.matchManager.awayTackles,
      radarDots,
    };
  }

  private emitHudSnapshot(): void {
    this.callbacks.onHudUpdate?.(this.getHudSnapshot());
  }

  private updateStadiumScoreboard(isGoal: boolean): void {
    const clock = this.matchManager.getDisplayClock();
    this.stadium.updateScoreboard(
      this.homePreset.shortName,
      this.awayPreset.shortName,
      this.matchManager.homeScore,
      this.matchManager.awayScore,
      clock.label,
      isGoal,
    );
  }

  private mergeInputs() {
    const touch = this.touchControls.consumeSnapshot();
    const key = this.keyboardControls.consumeSnapshot();
    const hasTouchMove = Math.hypot(touch.moveX, touch.moveZ) > 0.08;

    return {
      moveX: hasTouchMove ? touch.moveX : key.moveX,
      moveZ: hasTouchMove ? touch.moveZ : key.moveZ,
      sprint: touch.sprint || key.sprint,
      crossHeld: touch.crossHeld || key.crossHeld,
      squareHeld: touch.squareHeld || key.squareHeld,
      doublePressHeld: touch.doublePressHeld || key.doublePressHeld,
      justPressedCross: touch.justPressedCross || key.justPressedCross,
      justPressedTriangle: touch.justPressedTriangle || key.justPressedTriangle,
      justPressedCircle: touch.justPressedCircle || key.justPressedCircle,
      justPressedSquare: touch.justPressedSquare || key.justPressedSquare,
      justReleasedSquare: touch.justReleasedSquare || key.justReleasedSquare,
    };
  }

  private tick(dt: number, elapsed: number): void {
    this.elapsedTotal = elapsed;

    if (!this.isInMatchView) {
      // Live panoramic stadium background on menus
      this.stadium.update(dt, elapsed);
      this.cameraController.updateMenuOrbit(dt, elapsed);
      this.homeTeam.players.forEach((p) => p.tickTimersAndAnimation(dt, false));
      this.awayTeam.players.forEach((p) => p.tickTimersAndAnimation(dt, false));
      this.sceneManager.render(this.cameraController.camera);
      return;
    }

    if (this.isPaused) {
      this.sceneManager.render(this.cameraController.camera);
      return;
    }

    const phaseEvent = this.matchManager.tick(dt);
    if (phaseEvent === 'kickoff_live') {
      this.audio.playWhistle('short');
    } else if (phaseEvent === 'reset_kickoff' || phaseEvent === 'halftime') {
      this.resetKickoffPositions(this.matchManager.kickoffTeam);
      if (phaseEvent === 'halftime') {
        this.audio.playWhistle('kickoff');
      }
      this.emitHudSnapshot();
    } else if (phaseEvent === 'fulltime') {
      this.audio.playWhistle('fulltime');
      const snap = this.getHudSnapshot();
      this.emitHudSnapshot();
      this.callbacks.onMatchFinished?.(snap);
      this.sceneManager.render(this.cameraController.camera);
      return;
    }

    const allPlayers =
      this.matchManager.mode === 'training'
        ? [...this.homeTeam.players, this.awayTeam.getGoalkeeper()]
        : [...this.homeTeam.players, ...this.awayTeam.players];

    if (this.matchManager.phase === 'LIVE') {
      const mergedInput = this.mergeInputs();

      // 1. Human player control
      const ctrlState = this.playerController.update(
        this.homeTeam,
        this.ballPhysics,
        mergedInput,
        dt,
        elapsed,
        {
          onPass: (_passer, _receiver, isLong) => {
            this.matchManager.homePasses++;
            this.audio.playKick(isLong ? 0.72 : 0.45);
          },
          onCross: () => {
            this.matchManager.homePasses++;
            this.audio.playKick(0.8);
          },
          onShoot: (_shooter, power) => {
            this.matchManager.homeShots++;
            this.audio.playKick(0.85 + power * 0.15);
            this.cameraController.triggerShake(0.18);
          },
          onTackle: () => {
            this.audio.playTackle();
          },
        },
      );

      // 2. Home AI teammates
      this.footballAI.updateTeamAI(
        this.homeTeam,
        this.awayTeam,
        this.ballPhysics,
        dt,
        elapsed,
        false,
        ctrlState.humanPressingCount,
        {
          onTackleAttempt: () => this.audio.playTackle(),
        },
      );

      // 3. Away AI team (disabled outfield in training mode)
      this.footballAI.updateTeamAI(
        this.awayTeam,
        this.homeTeam,
        this.ballPhysics,
        dt,
        elapsed,
        this.matchManager.mode === 'training',
        0,
        {
          onPass: () => {
            this.matchManager.awayPasses++;
            this.audio.playKick(0.5);
          },
          onShoot: () => {
            this.matchManager.awayShots++;
            this.audio.playKick(0.92);
          },
          onTackleAttempt: () => this.audio.playTackle(),
        },
      );

      // 4. Goalkeepers
      this.homeGkAI.update(
        this.homeTeam.getGoalkeeper(),
        this.homeTeam,
        this.ballPhysics,
        dt,
        elapsed,
        {
          onSave: () => {
            this.audio.playKick(0.55);
            this.matchManager.setToast('Defesa do Guarda-Redes!', 1.2);
          },
          onDistribute: () => this.audio.playKick(0.6),
        },
      );

      this.awayGkAI.update(
        this.awayTeam.getGoalkeeper(),
        this.awayTeam,
        this.ballPhysics,
        dt,
        elapsed,
        {
          onSave: () => {
            this.audio.playKick(0.55);
            this.matchManager.setToast('Grande Defesa!', 1.2);
          },
          onDistribute: () => this.audio.playKick(0.6),
        },
      );

      // 5. Physics & Collisions
      this.ballPhysics.step(dt, {
        onBounce: (impact) => this.audio.playBounce(impact),
        onPostHit: () => {
          this.audio.playPostClang();
          this.cameraController.triggerShake(0.28);
          this.matchManager.setToast('Ao Poste!', 1.2);
        },
      });

      this.collisionSystem.resolvePlayerToPlayer(allPlayers, this.ballPhysics, elapsed, {
        onTackleImpact: (tackler, _victim, wonBall) => {
          if (wonBall) {
            if (tackler.side === 'home') this.matchManager.homeTackles++;
            else this.matchManager.awayTackles++;
          }
          this.audio.playTackle();
        },
      });

      this.collisionSystem.resolvePlayersAndBall(allPlayers, this.ballPhysics, elapsed, {
        onTackleImpact: (tackler, _victim, wonBall) => {
          if (wonBall) {
            if (tackler.side === 'home') this.matchManager.homeTackles++;
            else this.matchManager.awayTackles++;
          }
          this.audio.playTackle();
        },
        onBallDeflect: (_p, speed) => {
          if (speed > 7) this.audio.playBounce(0.5);
        },
      });

      // Possession tracking
      const possSide = this.ballPhysics.owner?.side ?? null;
      this.matchManager.recordPossession(possSide, dt);

      // 6. Match Rules evaluation (Goals & Out of Bounds)
      const boundaryEvent = this.matchRules.evaluateBallState(this.ballPhysics);
      if (boundaryEvent.type === 'goal') {
        const scorer =
          this.ballPhysics.lastTouchedBy &&
          this.ballPhysics.lastTouchedBy.side === boundaryEvent.scoringTeam
            ? this.ballPhysics.lastTouchedBy
            : boundaryEvent.scoringTeam === 'home'
              ? this.homeTeam.players[4]
              : this.awayTeam.players[4];

        this.scorerRef = scorer;
        scorer.isCelebrating = true;
        this.matchManager.registerGoal(boundaryEvent.scoringTeam, scorer.name);
        this.stadium.triggerGoalCheer();
        this.audio.playWhistle('short');
        this.audio.playGoalCelebration();
        this.cameraController.triggerShake(0.4);
        this.updateStadiumScoreboard(true);
        this.emitHudSnapshot();
      } else if (
        boundaryEvent.type === 'throw_in' ||
        boundaryEvent.type === 'corner' ||
        boundaryEvent.type === 'goal_kick'
      ) {
        const label =
          boundaryEvent.type === 'throw_in'
            ? 'Lançamento Lateral'
            : boundaryEvent.type === 'corner'
              ? 'Pontapé de Canto'
              : 'Pontapé de Baliza';
        this.audio.playWhistle('short');
        this.matchManager.registerOutOfBounds(label);
        this.executeQuickRestart(
          boundaryEvent.restartTeam,
          boundaryEvent.x,
          boundaryEvent.z,
          boundaryEvent.type,
        );
        this.emitHudSnapshot();
      }
    } else if (this.matchManager.phase === 'GOAL_CELEBRATION') {
      // Keep ball rolling gently in net and scorer running/celebrating
      this.ballPhysics.step(dt);
      if (this.scorerRef) {
        const dir = this.scorerRef.side === 'home' ? -1 : 1;
        this.scorerRef.steer(dir * 0.4, 0.35, false, false, dt);
      }
    }

    // Update visuals & animations for all players
    this.homeTeam.players.forEach((p) => {
      p.tickTimersAndAnimation(dt, this.ballPhysics.owner === p);
    });
    this.awayTeam.players.forEach((p) => {
      p.tickTimersAndAnimation(dt, this.ballPhysics.owner === p);
    });

    this.ballVisual.syncTransform(this.ballPhysics.position, this.ballPhysics.quaternion);
    this.stadium.update(dt, elapsed);

    this.cameraController.updateGameplay(
      dt,
      this.ballPhysics.position,
      this.ballPhysics.velocity,
      this.matchManager.phase === 'GOAL_CELEBRATION',
      this.scorerRef ? this.scorerRef.position : null,
    );

    // Periodic scoreboard & HUD sync (~12 Hz)
    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.085) {
      this.hudEmitAccum = 0;
      this.updateStadiumScoreboard(this.matchManager.phase === 'GOAL_CELEBRATION');
      this.emitHudSnapshot();
    }

    this.sceneManager.render(this.cameraController.camera);
  }

  private executeQuickRestart(
    restartTeamSide: TeamSide,
    x: number,
    z: number,
    type: 'throw_in' | 'corner' | 'goal_kick',
  ): void {
    const team = restartTeamSide === 'home' ? this.homeTeam : this.awayTeam;
    const taker =
      type === 'goal_kick'
        ? team.getGoalkeeper()
        : team.getOutfielders().reduce((best, p) => {
            const db = Math.hypot(best.position.x - x, best.position.z - z);
            const dp = Math.hypot(p.position.x - x, p.position.z - z);
            return dp < db ? p : best;
          }, team.getOutfielders()[0]);

    this.ballPhysics.resetTo(x, z, BALL_RADIUS);
    const dirToCenterX = -x * 0.4 + team.attackDirection * 4;
    const dirToCenterZ = -z * 0.4;
    const facing = Math.atan2(dirToCenterX, dirToCenterZ);

    taker.resetAt(x - Math.sin(facing) * 0.55, z - Math.cos(facing) * 0.55, facing);
    this.ballPhysics.owner = taker;
    this.ballPhysics.lastTouchedBy = taker;
    this.ballPhysics.lastTouchTime = this.elapsedTotal;

    if (restartTeamSide === 'home' && taker.role !== 'GR') {
      this.playerController.setActivePlayer(taker);
    }
  }

  public dispose(): void {
    this.loop.stop();
    this.detachKeyboard();
    window.removeEventListener('resize', this.resizeHandler);
    this.audio.dispose();
    this.sceneManager.dispose();
  }
}
