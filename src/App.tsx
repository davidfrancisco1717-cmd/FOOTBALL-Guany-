import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from './game/Game';
import {
  DEFAULT_SETTINGS,
  GameMode,
  GameSettings,
  HudSnapshot,
  ScreenState,
  StadiumTime,
  TEAMS,
  TeamPreset,
} from './game/types';
import { GameHUD } from './ui/GameHUD';
import { MainMenu } from './ui/MainMenu';
import { MatchResults } from './ui/MatchResults';
import { PauseMenu } from './ui/PauseMenu';
import { SettingsMenu } from './ui/SettingsMenu';
import { StadiumSelection } from './ui/StadiumSelection';
import { TeamSelection } from './ui/TeamSelection';

const SETTINGS_STORAGE_KEY = 'football_psp_3d_settings_v1';

function loadSavedSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function isLikelyMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent)
  );
}

async function tryEnterAndroidLandscape(): Promise<void> {
  if (!isLikelyMobileDevice()) return;
  try {
    const docEl = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    if (!document.fullscreenElement) {
      if (docEl.requestFullscreen) {
        await Promise.resolve(docEl.requestFullscreen({ navigationUI: 'hide' })).catch(() => {});
      } else if (docEl.webkitRequestFullscreen) {
        await Promise.resolve(docEl.webkitRequestFullscreen()).catch(() => {});
      }
    }
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: 'landscape') => Promise<void>;
    };
    if (orientation?.lock) {
      await Promise.resolve(orientation.lock('landscape')).catch(() => {});
    }
  } catch {
    // Graceful no-op when fullscreen/orientation lock is blocked by browser/iframe policy
  }
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const screenRef = useRef<ScreenState>('menu');
  const settingsReturnRef = useRef<ScreenState>('menu');

  const [screen, setScreen] = useState<ScreenState>('menu');
  const [settings, setSettings] = useState<GameSettings>(() => loadSavedSettings());
  const [homeTeam, setHomeTeam] = useState<TeamPreset>(TEAMS[0]);
  const [awayTeam, setAwayTeam] = useState<TeamPreset>(TEAMS[1]);
  const [stadiumTime, setStadiumTime] = useState<StadiumTime>('day');
  const [isQuickMatchFlow, setIsQuickMatchFlow] = useState(false);
  const [matchMode, setMatchMode] = useState<GameMode>('quick_match');
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let game: Game | null = null;
    try {
      game = new Game(container, settings, {
        onHudUpdate: (snapshot) => {
          setHud(snapshot);
        },
        onTogglePause: () => {
          const cur = screenRef.current;
          if (cur === 'playing') {
            game?.setPaused(true);
            setScreen('paused');
          } else if (cur === 'paused') {
            game?.setPaused(false);
            setScreen('playing');
          }
        },
        onCameraChanged: (nextMode) => {
          setSettings((prev) => {
            const updated = { ...prev, cameraMode: nextMode };
            try {
              localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated));
            } catch {
              // ignore storage errors
            }
            return updated;
          });
        },
        onMatchFinished: (finalSnap) => {
          setHud(finalSnap);
          setScreen('results');
        },
      });
      gameRef.current = game;
      setHud(game.getHudSnapshot());
    } catch (err) {
      setWebglError(
        err instanceof Error
          ? err.message
          : 'Não foi possível inicializar o motor gráfico 3D WebGL.',
      );
    }

    return () => {
      game?.dispose();
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpdateSettings = useCallback((next: GameSettings) => {
    setSettings(next);
    gameRef.current?.updateSettings(next);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const handleSelectHomeTeam = useCallback(
    (team: TeamPreset) => {
      setHomeTeam(team);
      gameRef.current?.audio.playUiClick();
      gameRef.current?.setTeams(team, awayTeam);
    },
    [awayTeam],
  );

  const handleSelectAwayTeam = useCallback(
    (team: TeamPreset) => {
      setAwayTeam(team);
      gameRef.current?.audio.playUiClick();
      gameRef.current?.setTeams(homeTeam, team);
    },
    [homeTeam],
  );

  const handleSelectStadium = useCallback((time: StadiumTime) => {
    setStadiumTime(time);
    gameRef.current?.audio.playUiClick();
    gameRef.current?.setStadiumTime(time);
  }, []);

  const launchMatch = useCallback(
    (mode: GameMode) => {
      void tryEnterAndroidLandscape();
      setMatchMode(mode);
      gameRef.current?.audio.playUiClick();
      gameRef.current?.startMatch(mode, homeTeam, awayTeam);
      setScreen('playing');
    },
    [homeTeam, awayTeam],
  );

  const handleRequestLandscape = useCallback(() => {
    void tryEnterAndroidLandscape();
  }, []);

  const handlePause = useCallback(() => {
    gameRef.current?.audio.playUiClick();
    gameRef.current?.setPaused(true);
    setScreen('paused');
  }, []);

  const handleResume = useCallback(() => {
    gameRef.current?.audio.playUiClick();
    gameRef.current?.setPaused(false);
    setScreen('playing');
  }, []);

  const handleQuitToMenu = useCallback(() => {
    gameRef.current?.audio.playUiClick();
    gameRef.current?.setMenuMode();
    setScreen('menu');
  }, []);

  const handleToggleCamera = useCallback(() => {
    const nextMode = settings.cameraMode === 'tv' ? 'psp' : 'tv';
    handleUpdateSettings({ ...settings, cameraMode: nextMode });
  }, [settings, handleUpdateSettings]);

  const handleZoomDelta = useCallback(
    (delta: number) => {
      const nextZoom = Math.max(0.75, Math.min(1.35, Number((settings.cameraZoom + delta).toFixed(2))));
      handleUpdateSettings({ ...settings, cameraZoom: nextZoom });
    },
    [settings, handleUpdateSettings],
  );

  const handleToggleSound = useCallback(() => {
    handleUpdateSettings({ ...settings, soundEnabled: !settings.soundEnabled });
  }, [settings, handleUpdateSettings]);

  const handleToggleTouchControls = useCallback(() => {
    const next = settings.touchControlsMode === 'always' ? 'hidden' : 'always';
    handleUpdateSettings({ ...settings, touchControlsMode: next });
  }, [settings, handleUpdateSettings]);

  const openSettingsFrom = useCallback((origin: ScreenState) => {
    settingsReturnRef.current = origin;
    gameRef.current?.audio.playUiClick();
    setScreen('settings');
  }, []);

  const clockLabel = hud
    ? `${String(hud.displayMinute).padStart(2, '0')}:${String(hud.displaySecond).padStart(2, '0')}`
    : '00:00';

  return (
    <div className="game-shell">
      {/* Isolated WebGL Mount */}
      <div ref={mountRef} className="webgl-mount" />

      {webglError && (
        <div className="hud-layer hud-interactive flex items-center justify-center p-6 bg-[#07111a]">
          <div className="max-w-md rounded-2xl bg-[#0c1724] border border-rose-500/40 p-6 text-center">
            <h2 className="font-display text-2xl font-bold text-white">
              Erro ao Iniciar Gráficos 3D
            </h2>
            <p className="text-sm text-slate-300 mt-2">{webglError}</p>
          </div>
        </div>
      )}

      {!webglError && screen === 'menu' && (
        <MainMenu
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          stadiumTime={stadiumTime}
          onPlayNow={() => launchMatch('quick_match')}
          onOpenQuickMatch={() => {
            setIsQuickMatchFlow(true);
            gameRef.current?.audio.playUiClick();
            setScreen('teams');
          }}
          onStartTraining={() => launchMatch('training')}
          onOpenTeams={() => {
            setIsQuickMatchFlow(false);
            gameRef.current?.audio.playUiClick();
            setScreen('teams');
          }}
          onOpenStadiums={() => {
            gameRef.current?.audio.playUiClick();
            setScreen('stadiums');
          }}
          onOpenSettings={() => openSettingsFrom('menu')}
        />
      )}

      {!webglError && screen === 'teams' && (
        <TeamSelection
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          isQuickMatchFlow={isQuickMatchFlow}
          onSelectHome={handleSelectHomeTeam}
          onSelectAway={handleSelectAwayTeam}
          onStartMatch={() => launchMatch('quick_match')}
          onBack={() => {
            gameRef.current?.audio.playUiClick();
            setScreen('menu');
          }}
        />
      )}

      {!webglError && screen === 'stadiums' && (
        <StadiumSelection
          stadiumTime={stadiumTime}
          onSelectStadium={handleSelectStadium}
          onBack={() => {
            gameRef.current?.audio.playUiClick();
            setScreen('menu');
          }}
        />
      )}

      {!webglError && screen === 'settings' && (
        <SettingsMenu
          settings={settings}
          onChange={handleUpdateSettings}
          onBack={() => {
            gameRef.current?.audio.playUiClick();
            setScreen(settingsReturnRef.current);
          }}
        />
      )}

      {!webglError && (screen === 'playing' || screen === 'paused') && hud && gameRef.current && (
        <GameHUD
          snapshot={hud}
          settings={settings}
          touchControls={gameRef.current.touchControls}
          onPause={handlePause}
          onToggleCamera={handleToggleCamera}
          onZoomDelta={handleZoomDelta}
          onToggleSound={handleToggleSound}
          onToggleTouchControls={handleToggleTouchControls}
          onRequestLandscape={handleRequestLandscape}
        />
      )}

      {!webglError && screen === 'paused' && hud && (
        <PauseMenu
          homeShort={hud.homeTeam.shortName}
          awayShort={hud.awayTeam.shortName}
          homeScore={hud.homeScore}
          awayScore={hud.awayScore}
          clockLabel={clockLabel}
          onResume={handleResume}
          onRestart={() => launchMatch(matchMode)}
          onOpenSettings={() => openSettingsFrom('paused')}
          onQuitToMenu={handleQuitToMenu}
        />
      )}

      {!webglError && screen === 'results' && hud && (
        <MatchResults
          snapshot={hud}
          onPlayAgain={() => launchMatch(matchMode)}
          onBackToMenu={handleQuitToMenu}
        />
      )}
    </div>
  );
}
