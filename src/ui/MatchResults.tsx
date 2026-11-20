import React from 'react';
import { Home, RotateCcw, Trophy } from 'lucide-react';
import { HudSnapshot } from '../game/types';

interface MatchResultsProps {
  snapshot: HudSnapshot;
  onPlayAgain: () => void;
  onBackToMenu: () => void;
}

export const MatchResults: React.FC<MatchResultsProps> = ({
  snapshot,
  onPlayAgain,
  onBackToMenu,
}) => {
  const { homeTeam, awayTeam, homeScore, awayScore } = snapshot;
  const resultLabel =
    homeScore > awayScore
      ? `Vitória de ${homeTeam.name}!`
      : awayScore > homeScore
        ? `Vitória de ${awayTeam.name}`
        : 'Empate no Tempo Regulamentar';

  const awayPoss = 100 - snapshot.homePossessionPct;

  const stats = [
    { label: 'Posse de Bola', home: `${snapshot.homePossessionPct}%`, away: `${awayPoss}%` },
    { label: 'Remates', home: snapshot.homeShots, away: snapshot.awayShots },
    { label: 'Passes Completos', home: snapshot.homePasses, away: snapshot.awayPasses },
    { label: 'Desarmes', home: snapshot.homeTackles, away: snapshot.awayTackles },
  ];

  return (
    <div className="hud-layer hud-interactive flex items-center justify-center p-4 bg-[#07111a]/86">
      <div className="w-full max-w-lg rounded-2xl bg-[#0c1724] border border-white/15 shadow-2xl p-5 sm:p-6 flex flex-col gap-4">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-amber-400">
            <Trophy className="w-4 h-4" />
            Fim do Jogo
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white mt-1">
            {resultLabel}
          </h2>
        </div>

        {/* Final Score */}
        <div className="flex items-center justify-between px-5 py-4 rounded-xl bg-black/35 border border-white/10">
          <div className="flex items-center gap-2.5">
            <span
              className="w-4 h-4 rounded-sm border border-white/30"
              style={{ backgroundColor: homeTeam.primaryColor }}
            />
            <span className="font-display text-xl font-bold text-white">
              {homeTeam.shortName}
            </span>
          </div>

          <div className="font-display text-4xl font-extrabold text-white font-mono-num">
            {homeScore} - {awayScore}
          </div>

          <div className="flex items-center gap-2.5">
            <span className="font-display text-xl font-bold text-white">
              {awayTeam.shortName}
            </span>
            <span
              className="w-4 h-4 rounded-sm border border-white/30"
              style={{ backgroundColor: awayTeam.primaryColor }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-col gap-2 py-1">
          {stats.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between text-xs sm:text-sm py-1.5 border-b border-white/8 last:border-none"
            >
              <span className="font-mono-num font-semibold text-sky-300 w-14 text-left">
                {row.home}
              </span>
              <span className="text-slate-300">{row.label}</span>
              <span className="font-mono-num font-semibold text-rose-300 w-14 text-right">
                {row.away}
              </span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            onClick={onPlayAgain}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Jogar Novamente
          </button>

          <button
            onClick={onBackToMenu}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-white/8 hover:bg-white/14 border border-white/12 text-slate-100 text-sm font-semibold transition-colors cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Menu Principal
          </button>
        </div>
      </div>
    </div>
  );
};
