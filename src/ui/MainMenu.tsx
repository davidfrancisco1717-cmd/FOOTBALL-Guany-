import React from 'react';
import {
  Play,
  Zap,
  Target,
  Shield,
  Sun,
  Moon,
  Settings,
} from 'lucide-react';
import { StadiumTime, TeamPreset } from '../game/types';

interface MainMenuProps {
  homeTeam: TeamPreset;
  awayTeam: TeamPreset;
  stadiumTime: StadiumTime;
  onPlayNow: () => void;
  onOpenQuickMatch: () => void;
  onStartTraining: () => void;
  onOpenTeams: () => void;
  onOpenStadiums: () => void;
  onOpenSettings: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  homeTeam,
  awayTeam,
  stadiumTime,
  onPlayNow,
  onOpenQuickMatch,
  onStartTraining,
  onOpenTeams,
  onOpenStadiums,
  onOpenSettings,
}) => {
  return (
    <div className="hud-layer flex flex-col justify-between p-4 sm:p-7 bg-gradient-to-r from-[#07111a]/90 via-[#07111a]/55 to-transparent">
      {/* Top match preview strip */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <svg
            width="36"
            height="36"
            viewBox="0 0 36 36"
            fill="none"
            aria-hidden="true"
            className="shrink-0"
          >
            <rect x="2" y="2" width="32" height="32" rx="7" fill="#0ea5e9" fillOpacity="0.16" stroke="#38bdf8" strokeWidth="2" />
            <circle cx="18" cy="18" r="8.5" stroke="#f8fafc" strokeWidth="2" />
            <polygon points="18,12.5 22.8,16 21,21.5 15,21.5 13.2,16" fill="#f8fafc" />
          </svg>
          <div>
            <h1 className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-none">
              FOOTBALL PSP 3D
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
              Futebol 5v5 · Física Real · Estádios 3D
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-3 px-3.5 py-2 rounded-lg bg-[#0b1623]/90 border border-white/15 text-xs text-slate-200">
          <span className="font-semibold" style={{ color: '#93c5fd' }}>
            {homeTeam.shortName}
          </span>
          <span className="text-slate-400">vs</span>
          <span className="font-semibold" style={{ color: '#fca5a5' }}>
            {awayTeam.shortName}
          </span>
          <span className="text-slate-500">·</span>
          <span className="flex items-center gap-1.5 text-slate-300">
            {stadiumTime === 'day' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-sky-400" />}
            {stadiumTime === 'day' ? 'Dia' : 'Noite'}
          </span>
        </div>
      </div>

      {/* Left vertical PSP-style menu column (leaves center-right 3D stadium open) */}
      <div className="hud-interactive w-full max-w-sm sm:max-w-md my-auto py-2">
        <div className="flex flex-col gap-2.5">
          <button
            onClick={onPlayNow}
            className="w-full flex items-center justify-between px-5 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-semibold shadow-lg transition-all cursor-pointer"
          >
            <span className="flex items-center gap-3 text-base sm:text-lg font-display tracking-wide uppercase">
              <Play className="w-5 h-5 fill-current" />
              Jogar Agora
            </span>
            <span className="text-xs font-mono-num text-emerald-100">
              {homeTeam.shortName} vs {awayTeam.shortName}
            </span>
          </button>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={onOpenQuickMatch}
              className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#0e1b2a]/92 hover:bg-[#16273c] border border-white/15 text-slate-100 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Zap className="w-4 h-4 text-amber-400 shrink-0" />
              Jogo Rápido
            </button>

            <button
              onClick={onStartTraining}
              className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#0e1b2a]/92 hover:bg-[#16273c] border border-white/15 text-slate-100 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Target className="w-4 h-4 text-sky-400 shrink-0" />
              Treino Livre
            </button>

            <button
              onClick={onOpenTeams}
              className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#0e1b2a]/92 hover:bg-[#16273c] border border-white/15 text-slate-100 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
              Equipas
            </button>

            <button
              onClick={onOpenStadiums}
              className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#0e1b2a]/92 hover:bg-[#16273c] border border-white/15 text-slate-100 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              {stadiumTime === 'day' ? (
                <Sun className="w-4 h-4 text-amber-300 shrink-0" />
              ) : (
                <Moon className="w-4 h-4 text-sky-300 shrink-0" />
              )}
              Estádios
            </button>
          </div>

          <button
            onClick={onOpenSettings}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-[#0b1521]/90 hover:bg-[#142336] border border-white/12 text-slate-200 text-sm font-medium transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2.5">
              <Settings className="w-4 h-4 text-slate-400" />
              Definições Gráficas, Som e Controlos
            </span>
            <span className="text-xs text-slate-400">Configurar</span>
          </button>
        </div>
      </div>

      {/* Flat control hint bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] sm:text-xs text-slate-300/90">
        <span>
          Teclado: WASD Mover · J/✕ Passe · I/△ Longo · L/◯ Cruzamento/Desarme · K/□ Remate · U Pressão 2J · V Câmara
        </span>
        <span className="text-slate-400">Android Paisagem · Controlos Táteis PSP</span>
      </div>
    </div>
  );
};
