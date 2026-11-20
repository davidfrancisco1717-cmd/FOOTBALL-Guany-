import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Gamepad2,
  Pause,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { PspButtonId, TouchControls } from '../controls/TouchControls';
import { GameSettings, HudSnapshot } from '../game/types';

interface GameHUDProps {
  snapshot: HudSnapshot;
  settings: GameSettings;
  touchControls: TouchControls;
  onPause: () => void;
  onToggleCamera: () => void;
  onZoomDelta: (delta: number) => void;
  onToggleSound: () => void;
  onToggleTouchControls: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  snapshot,
  settings,
  touchControls,
  onPause,
  onToggleCamera,
  onZoomDelta,
  onToggleSound,
  onToggleTouchControls,
}) => {
  const joystickZoneRef = useRef<HTMLDivElement | null>(null);
  const joystickKnobRef = useRef<HTMLDivElement | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    const coarse =
      typeof window !== 'undefined' &&
      (window.matchMedia('(pointer: coarse)').matches ||
        'ontouchstart' in window ||
        window.innerWidth <= 960);
    setIsTouchDevice(coarse);
  }, []);

  const showTouch =
    settings.touchControlsMode === 'always' ||
    (settings.touchControlsMode === 'auto' && isTouchDevice);

  useEffect(() => {
    if (!showTouch) return;
    const zone = joystickZoneRef.current;
    const knob = joystickKnobRef.current;
    if (!zone || !knob) return;
    return touchControls.joystick.attach(zone, knob);
  }, [showTouch, touchControls]);

  const clockStr = `${String(snapshot.displayMinute).padStart(2, '0')}:${String(
    snapshot.displaySecond,
  ).padStart(2, '0')}`;

  const bindBtn = (id: PspButtonId) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      touchControls.pressButton(id);
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      touchControls.releaseButton(id);
    },
    onPointerCancel: () => {
      touchControls.releaseButton(id);
    },
  });

  const offense = snapshot.teamHasBall;

  return (
    <div className="hud-layer">
      {/* Top Broadcast Scoreboard & Quick Action Cluster */}
      <div className="flex items-start justify-between p-2.5 sm:p-4 gap-2">
        {/* Top-left Scorebug */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center rounded-lg overflow-hidden bg-[#09121e]/92 border border-white/15 shadow-lg">
            {/* Home */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5">
              <span
                className="w-2.5 h-3.5 rounded-xs"
                style={{ backgroundColor: snapshot.homeTeam.primaryColor }}
              />
              <span className="font-display text-sm sm:text-base font-bold text-white tracking-wide">
                {snapshot.homeTeam.shortName}
              </span>
            </div>

            {/* Score */}
            <div className="px-2.5 py-1.5 bg-white/10 font-display text-base sm:text-lg font-extrabold text-white font-mono-num">
              {snapshot.homeScore} - {snapshot.awayScore}
            </div>

            {/* Away */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5">
              <span className="font-display text-sm sm:text-base font-bold text-white tracking-wide">
                {snapshot.awayTeam.shortName}
              </span>
              <span
                className="w-2.5 h-3.5 rounded-xs"
                style={{ backgroundColor: snapshot.awayTeam.primaryColor }}
              />
            </div>

            {/* Clock */}
            <div className="px-2.5 py-1.5 bg-sky-600/90 font-mono-num text-xs sm:text-sm font-bold text-white">
              {clockStr}
            </div>

            {/* Half / Mode */}
            <div className="hidden sm:block px-2 py-1.5 text-[11px] font-semibold text-slate-200 bg-black/35">
              {snapshot.mode === 'training'
                ? 'TREINO'
                : `${snapshot.half}.ª PARTE`}
            </div>
          </div>

          {/* Possession & Attack Direction Indicator */}
          <div className="flex items-center gap-2 text-[11px] text-slate-200 bg-[#09121e]/85 border border-white/10 rounded-md px-2.5 py-1 w-fit">
            <span>
              Posse:{' '}
              <strong className="font-mono-num text-sky-300">
                {snapshot.homePossessionPct}%
              </strong>
            </span>
            <span className="text-slate-500">·</span>
            <span className="text-emerald-300 font-semibold">Ataque →</span>
            {snapshot.statusToast && (
              <>
                <span className="text-slate-500">·</span>
                <span className="text-amber-300 font-semibold">
                  {snapshot.statusToast}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Top-right compact utility buttons */}
        <div className="hud-interactive flex items-center gap-1.5">
          <button
            onClick={onToggleCamera}
            className="flex items-center gap-1 px-2.5 py-2 rounded-lg bg-[#09121e]/90 hover:bg-[#132338] border border-white/15 text-xs font-semibold text-slate-100 cursor-pointer"
            title="Alternar Câmara (V)"
          >
            <Camera className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">
              {settings.cameraMode === 'tv' ? 'TV' : 'PSP'}
            </span>
          </button>

          <button
            onClick={() => onZoomDelta(0.1)}
            className="hidden sm:flex p-2 rounded-lg bg-[#09121e]/90 hover:bg-[#132338] border border-white/15 text-slate-200 cursor-pointer"
            title="Aproximar Zoom"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => onZoomDelta(-0.1)}
            className="hidden sm:flex p-2 rounded-lg bg-[#09121e]/90 hover:bg-[#132338] border border-white/15 text-slate-200 cursor-pointer"
            title="Afastar Zoom"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onToggleTouchControls}
            className={`p-2 rounded-lg border text-slate-200 cursor-pointer ${
              showTouch
                ? 'bg-sky-600/80 border-sky-400/60'
                : 'bg-[#09121e]/90 border-white/15 hover:bg-[#132338]'
            }`}
            title="Mostrar/Ocultar Controlos Táteis PSP"
          >
            <Gamepad2 className="w-4 h-4" />
          </button>

          <button
            onClick={onToggleSound}
            className="p-2 rounded-lg bg-[#09121e]/90 hover:bg-[#132338] border border-white/15 text-slate-200 cursor-pointer"
            title="Ativar/Desativar Som"
          >
            {settings.soundEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" />
            )}
          </button>

          <button
            onClick={onPause}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#09121e]/90 hover:bg-[#132338] border border-white/15 text-xs font-semibold text-white cursor-pointer"
            title="Pausa (Esc)"
          >
            <Pause className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Pausa</span>
          </button>
        </div>
      </div>

      {/* Goal Celebration Overlay Banner */}
      {snapshot.phase === 'GOAL_CELEBRATION' && (
        <div className="absolute inset-x-0 top-[22%] flex justify-center pointer-events-none">
          <div className="goal-banner-anim px-8 py-4 rounded-2xl bg-[#07111a]/92 border-2 border-amber-400 shadow-2xl text-center">
            <div className="font-display text-4xl sm:text-6xl font-extrabold text-amber-400 tracking-wider leading-none">
              GOLO!
            </div>
            <div className="text-sm sm:text-lg font-bold text-white mt-1">
              {snapshot.lastGoalScorer} ·{' '}
              {snapshot.lastGoalTeam === 'home'
                ? snapshot.homeTeam.name
                : snapshot.awayTeam.name}
            </div>
            <div className="font-display text-2xl font-bold text-sky-300 font-mono-num mt-0.5">
              {snapshot.homeTeam.shortName} {snapshot.homeScore} - {snapshot.awayScore}{' '}
              {snapshot.awayTeam.shortName}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Center: Active Player Bar + Tactical Pitch Radar */}
      <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 pointer-events-none">
        {/* Shot charge meter */}
        {snapshot.shotCharge > 0.05 && (
          <div className="w-36 h-2.5 rounded-full bg-black/70 border border-white/25 overflow-hidden">
            <div
              className="h-full transition-none"
              style={{
                width: `${Math.round(snapshot.shotCharge * 100)}%`,
                background:
                  snapshot.shotCharge > 0.78
                    ? '#ef4444'
                    : snapshot.shotCharge > 0.45
                      ? '#f59e0b'
                      : '#22c55e',
              }}
            />
          </div>
        )}

        {/* Active Player Info */}
        <div className="flex items-center gap-2.5 px-3 py-1 rounded-md bg-[#09121e]/90 border border-white/12 text-xs">
          <span className="font-mono-num font-bold text-sky-400">
            #{snapshot.activePlayerNumber}
          </span>
          <span className="font-semibold text-white whitespace-nowrap">
            {snapshot.activePlayerName}
          </span>
          <span className="text-[10px] text-slate-400">{snapshot.activePlayerRole}</span>
          <div className="w-12 h-1.5 rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full bg-emerald-400"
              style={{ width: `${snapshot.activePlayerStamina}%` }}
            />
          </div>
        </div>

        {/* Tactical Radar */}
        <svg
          width="136"
          height="84"
          viewBox="-34 -22 68 44"
          className="rounded-lg bg-[#0d3b1e]/85 border border-white/20 shadow-md"
          aria-label="Radar do campo"
        >
          <rect
            x="-32"
            y="-20"
            width="64"
            height="40"
            fill="none"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="0.7"
          />
          <line
            x1="0"
            y1="-20"
            x2="0"
            y2="20"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="0.6"
          />
          <circle
            cx="0"
            cy="0"
            r="5.5"
            fill="none"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="0.6"
          />
          {snapshot.radarDots.map((dot, idx) => {
            const cx = dot.x * 32;
            const cy = dot.z * 20;
            if (dot.team === 'ball') {
              return (
                <circle
                  key={`b-${idx}`}
                  cx={cx}
                  cy={cy}
                  r="1.9"
                  fill="#ffffff"
                  stroke="#000000"
                  strokeWidth="0.6"
                />
              );
            }
            const fill =
              dot.team === 'home'
                ? dot.active
                  ? '#38bdf8'
                  : snapshot.homeTeam.primaryColor
                : snapshot.awayTeam.primaryColor;
            return (
              <circle
                key={`p-${idx}`}
                cx={cx}
                cy={cy}
                r={dot.active ? 2.5 : 1.9}
                fill={fill}
                stroke={dot.active ? '#ffffff' : 'rgba(255,255,255,0.65)'}
                strokeWidth={dot.active ? 0.8 : 0.45}
              />
            );
          })}
        </svg>
      </div>

      {/* PSP Touch Controls */}
      {showTouch && (
        <>
          {/* Left Analog Stick */}
          <div ref={joystickZoneRef} className="psp-joystick-zone">
            <div className="psp-joystick-base">
              <div ref={joystickKnobRef} className="psp-joystick-knob" />
            </div>
          </div>

          {/* Right Diamond Face Buttons */}
          <div className="psp-actions-cluster">
            {!offense && (
              <button
                type="button"
                className="psp-btn-combo"
                {...bindBtn('doublePress')}
              >
                <span>✕ + □</span>
                <span>Pressão 2J</span>
              </button>
            )}

            {/* Top: Triangle */}
            <button
              type="button"
              className="psp-btn psp-btn-top"
              {...bindBtn('triangle')}
            >
              <span className="text-sm font-bold text-emerald-400 leading-none">△</span>
              <span className="text-[9px] font-semibold text-slate-200 leading-tight mt-0.5">
                {offense ? 'Longo' : 'Trocar'}
              </span>
            </button>

            {/* Left: Square */}
            <button
              type="button"
              className="psp-btn psp-btn-left"
              {...bindBtn('square')}
            >
              <span className="text-sm font-bold text-pink-400 leading-none">□</span>
              <span className="text-[9px] font-semibold text-slate-200 leading-tight mt-0.5">
                {offense ? 'Remate' : 'Pressão'}
              </span>
            </button>

            {/* Right: Circle */}
            <button
              type="button"
              className="psp-btn psp-btn-right"
              {...bindBtn('circle')}
            >
              <span className="text-sm font-bold text-rose-400 leading-none">◯</span>
              <span className="text-[9px] font-semibold text-slate-200 leading-tight mt-0.5">
                {offense ? 'Cruzar' : 'Desarme'}
              </span>
            </button>

            {/* Bottom: Cross */}
            <button
              type="button"
              className="psp-btn psp-btn-bottom"
              {...bindBtn('cross')}
            >
              <span className="text-sm font-bold text-sky-400 leading-none">✕</span>
              <span className="text-[9px] font-semibold text-slate-200 leading-tight mt-0.5">
                {offense ? 'Passe' : 'Pressionar'}
              </span>
            </button>
          </div>
        </>
      )}

      {/* Portrait Mobile Orientation Suggestion Banner */}
      <div className="portrait-hint fixed top-16 inset-x-4 z-30 p-2.5 rounded-lg bg-amber-950/95 border border-amber-400/50 text-amber-100 text-xs items-center justify-center text-center pointer-events-none">
        Roda o telemóvel para o modo paisagem (horizontal) para melhor experiência PSP.
      </div>
    </div>
  );
};
