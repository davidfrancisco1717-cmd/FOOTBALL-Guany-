import React from 'react';
import { ArrowLeft, Play } from 'lucide-react';
import { TEAMS, TeamPreset } from '../game/types';

interface TeamSelectionProps {
  homeTeam: TeamPreset;
  awayTeam: TeamPreset;
  isQuickMatchFlow: boolean;
  onSelectHome: (team: TeamPreset) => void;
  onSelectAway: (team: TeamPreset) => void;
  onStartMatch: () => void;
  onBack: () => void;
}

export const TeamSelection: React.FC<TeamSelectionProps> = ({
  homeTeam,
  awayTeam,
  isQuickMatchFlow,
  onSelectHome,
  onSelectAway,
  onStartMatch,
  onBack,
}) => {
  return (
    <div className="hud-layer hud-interactive flex items-center justify-center p-3 sm:p-6 bg-[#07111a]/82">
      <div className="w-full max-w-4xl max-h-[92dvh] flex flex-col rounded-2xl bg-[#0c1724] border border-white/15 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 transition-colors cursor-pointer"
              aria-label="Voltar"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-white leading-none">
                {isQuickMatchFlow ? 'Jogo Rápido — Escolher Equipas' : 'Seleção de Equipas'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Plantel 5v5: 1 Guarda-Redes · 1 Defesa · 2 Médios · 1 Avançado
              </p>
            </div>
          </div>

          <button
            onClick={onStartMatch}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <Play className="w-4 h-4 fill-current" />
            Iniciar Partida
          </button>
        </div>

        {/* Two-column Home vs Away selector */}
        <div className="menu-scroll p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {/* Home Team */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs font-semibold text-sky-400">
              <span>Tua Equipa (Casa)</span>
              <span className="font-mono-num text-slate-300">GER {homeTeam.rating}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TEAMS.map((t) => {
                const selected = t.id === homeTeam.id;
                return (
                  <button
                    key={`home-${t.id}`}
                    onClick={() => onSelectHome(t)}
                    className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                      selected
                        ? 'bg-sky-500/20 border-sky-400 text-white'
                        : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <span
                        className="w-3.5 h-3.5 rounded-sm border border-white/30 shrink-0"
                        style={{ backgroundColor: t.primaryColor }}
                      />
                      <span className="font-display font-bold text-sm truncate">
                        {t.shortName}
                      </span>
                      <span className="ml-auto font-mono-num text-[11px] text-slate-400">
                        {t.rating}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-300 truncate w-full mt-1">
                      {t.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Lineup preview */}
            <div className="p-3 rounded-xl bg-black/30 border border-white/10">
              <div className="text-xs font-semibold text-slate-300 mb-2">
                Equipa Inicial — {homeTeam.name}
              </div>
              <div className="grid grid-cols-1 gap-1">
                {homeTeam.roster.map((p) => (
                  <div
                    key={p.number}
                    className="flex items-center justify-between text-xs text-slate-300 py-0.5"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono-num text-slate-400 w-5">#{p.number}</span>
                      <span className="font-medium text-white">{p.name}</span>
                    </span>
                    <span className="font-mono-num text-[11px] text-sky-400">{p.role}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Away Team */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs font-semibold text-rose-400">
              <span>Adversário (Fora)</span>
              <span className="font-mono-num text-slate-300">GER {awayTeam.rating}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TEAMS.map((t) => {
                const selected = t.id === awayTeam.id;
                return (
                  <button
                    key={`away-${t.id}`}
                    onClick={() => onSelectAway(t)}
                    className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                      selected
                        ? 'bg-rose-500/20 border-rose-400 text-white'
                        : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <span
                        className="w-3.5 h-3.5 rounded-sm border border-white/30 shrink-0"
                        style={{ backgroundColor: t.primaryColor }}
                      />
                      <span className="font-display font-bold text-sm truncate">
                        {t.shortName}
                      </span>
                      <span className="ml-auto font-mono-num text-[11px] text-slate-400">
                        {t.rating}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-300 truncate w-full mt-1">
                      {t.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Lineup preview */}
            <div className="p-3 rounded-xl bg-black/30 border border-white/10">
              <div className="text-xs font-semibold text-slate-300 mb-2">
                Equipa Inicial — {awayTeam.name}
              </div>
              <div className="grid grid-cols-1 gap-1">
                {awayTeam.roster.map((p) => (
                  <div
                    key={p.number}
                    className="flex items-center justify-between text-xs text-slate-300 py-0.5"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono-num text-slate-400 w-5">#{p.number}</span>
                      <span className="font-medium text-white">{p.name}</span>
                    </span>
                    <span className="font-mono-num text-[11px] text-rose-400">{p.role}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
