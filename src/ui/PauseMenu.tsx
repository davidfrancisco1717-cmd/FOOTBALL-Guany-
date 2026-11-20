import React from 'react';
import { Home, Play, RotateCcw, Settings } from 'lucide-react';

interface PauseMenuProps {
  homeShort: string;
  awayShort: string;
  homeScore: number;
  awayScore: number;
  clockLabel: string;
  onResume: () => void;
  onRestart: () => void;
  onOpenSettings: () => void;
  onQuitToMenu: () => void;
}

export const PauseMenu: React.FC<PauseMenuProps> = ({
  homeShort,
  awayShort,
  homeScore,
  awayScore,
  clockLabel,
  onResume,
  onRestart,
  onOpenSettings,
  onQuitToMenu,
}) => {
  return (
    <div className="hud-layer hud-interactive flex items-center justify-center p-4 bg-[#07111a]/82">
      <div className="w-full max-w-sm rounded-2xl bg-[#0c1724] border border-white/15 shadow-2xl p-5 sm:p-6 flex flex-col gap-4">
        <div className="text-center border-b border-white/10 pb-3">
          <div className="text-xs font-semibold text-sky-400">Jogo em Pausa</div>
          <div className="font-display text-3xl font-extrabold text-white mt-1 font-mono-num">
            {homeShort} {homeScore} - {awayScore} {awayShort}
          </div>
          <div className="text-xs font-mono-num text-slate-400 mt-0.5">{clockLabel}</div>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            onClick={onResume}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            Continuar Partida
          </button>

          <button
            onClick={onRestart}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/8 hover:bg-white/14 border border-white/12 text-slate-100 text-sm font-semibold transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Reiniciar Partida
          </button>

          <button
            onClick={onOpenSettings}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/8 hover:bg-white/14 border border-white/12 text-slate-100 text-sm font-semibold transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4" />
            Definições
          </button>

          <button
            onClick={onQuitToMenu}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/70 border border-rose-500/30 text-rose-200 text-sm font-semibold transition-colors cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Sair para o Menu
          </button>
        </div>
      </div>
    </div>
  );
};
