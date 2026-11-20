import React from 'react';
import { ArrowLeft, Check, Moon, Sun } from 'lucide-react';
import { STADIUM_PRESETS, StadiumTime } from '../game/types';

interface StadiumSelectionProps {
  stadiumTime: StadiumTime;
  onSelectStadium: (time: StadiumTime) => void;
  onBack: () => void;
}

export const StadiumSelection: React.FC<StadiumSelectionProps> = ({
  stadiumTime,
  onSelectStadium,
  onBack,
}) => {
  return (
    <div className="hud-layer hud-interactive flex items-end sm:items-center justify-center p-3 sm:p-6 bg-gradient-to-t from-[#07111a]/90 via-[#07111a]/35 to-transparent">
      <div className="w-full max-w-2xl rounded-2xl bg-[#0c1724]/95 border border-white/15 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
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
                Escolha de Estádio
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Pré-visualização 3D em tempo real no recinto
              </p>
            </div>
          </div>

          <button
            onClick={onBack}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            Confirmar
          </button>
        </div>

        <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {STADIUM_PRESETS.map((st) => {
            const active = st.id === stadiumTime;
            return (
              <button
                key={st.id}
                onClick={() => onSelectStadium(st.id)}
                className={`flex flex-col justify-between p-4 rounded-xl border text-left transition-colors cursor-pointer ${
                  active
                    ? 'bg-sky-500/18 border-sky-400 text-white'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="flex items-center gap-2 font-display text-lg font-bold">
                      {st.id === 'day' ? (
                        <Sun className="w-5 h-5 text-amber-400" />
                      ) : (
                        <Moon className="w-5 h-5 text-sky-400" />
                      )}
                      {st.name}
                    </span>
                    {active && <Check className="w-4 h-4 text-sky-400 shrink-0" />}
                  </div>
                  <p className="text-xs text-sky-300/90 mb-1.5">{st.subtitle}</p>
                  <p className="text-xs text-slate-300 leading-relaxed">{st.description}</p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-white/10 text-[11px] text-slate-400">
                  Lotação: {st.attendance}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
