import React from 'react';
import { ArrowLeft, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { GameSettings } from '../game/types';

interface SettingsMenuProps {
  settings: GameSettings;
  onChange: (next: GameSettings) => void;
  onBack: () => void;
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({
  settings,
  onChange,
  onBack,
}) => {
  const update = <K extends keyof GameSettings>(key: K, val: GameSettings[K]) => {
    onChange({ ...settings, [key]: val });
  };

  return (
    <div className="hud-layer hud-interactive flex items-center justify-center p-3 sm:p-6 bg-[#07111a]/85">
      <div className="w-full max-w-2xl max-h-[92dvh] flex flex-col rounded-2xl bg-[#0c1724] border border-white/15 shadow-2xl overflow-hidden">
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
                Definições do Jogo
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Desempenho gráfico, câmara, partida e controlos táteis
              </p>
            </div>
          </div>

          <button
            onClick={onBack}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            Guardar
          </button>
        </div>

        <div className="menu-scroll p-4 sm:p-6 flex flex-col gap-5 text-sm">
          {/* Graphics Quality */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-semibold text-slate-300 mb-2">
                Qualidade Gráfica
              </div>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-black/35 border border-white/10">
                {(['low', 'medium', 'high'] as const).map((q) => (
                  <button
                    key={q}
                    onClick={() => update('quality', q)}
                    className={`py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                      settings.quality === q
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    {q === 'low' ? 'Baixa' : q === 'medium' ? 'Média' : 'Alta'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-300 mb-2">
                Limite de FPS
              </div>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-black/35 border border-white/10">
                {([30, 60, 0] as const).map((fps) => (
                  <button
                    key={fps}
                    onClick={() => update('fpsLimit', fps)}
                    className={`py-2 rounded-md text-xs font-semibold font-mono-num transition-colors cursor-pointer ${
                      settings.fpsLimit === fps
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    {fps === 0 ? 'Máx' : `${fps} FPS`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Shadows & Render Distance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-semibold text-slate-300 mb-2">
                Sombras Dinâmicas
              </div>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-black/35 border border-white/10">
                <button
                  onClick={() => update('shadows', true)}
                  className={`py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    settings.shadows
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  Ativadas
                </button>
                <button
                  onClick={() => update('shadows', false)}
                  className={`py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    !settings.shadows
                      ? 'bg-slate-600 text-white'
                      : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  Desativadas
                </button>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-300 mb-2">
                Distância de Renderização
              </div>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-black/35 border border-white/10">
                {(['short', 'medium', 'long'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => update('renderDistance', d)}
                    className={`py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                      settings.renderDistance === d
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    {d === 'short' ? 'Curta' : d === 'medium' ? 'Média' : 'Longa'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Camera Mode & Zoom */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-semibold text-slate-300 mb-2">
                Modo de Câmara
              </div>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-black/35 border border-white/10">
                <button
                  onClick={() => update('cameraMode', 'tv')}
                  className={`py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    settings.cameraMode === 'tv'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  TV Transmissão
                </button>
                <button
                  onClick={() => update('cameraMode', 'psp')}
                  className={`py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    settings.cameraMode === 'psp'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  PSP Próxima
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-2">
                <span>Zoom da Câmara</span>
                <span className="font-mono-num text-sky-400">
                  {Math.round(settings.cameraZoom * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.75}
                max={1.35}
                step={0.05}
                value={settings.cameraZoom}
                onChange={(e) => update('cameraZoom', parseFloat(e.target.value))}
                className="w-full accent-sky-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Match Duration & Touch Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-semibold text-slate-300 mb-2">
                Duração da Partida
              </div>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-black/35 border border-white/10">
                {([2, 3, 5] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => update('matchMinutes', m)}
                    className={`py-2 rounded-md text-xs font-semibold font-mono-num transition-colors cursor-pointer ${
                      settings.matchMinutes === m
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-300 mb-2">
                Controlos Táteis PSP
              </div>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-black/35 border border-white/10">
                {(['auto', 'always', 'hidden'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => update('touchControlsMode', mode)}
                    className={`py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                      settings.touchControlsMode === mode
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    {mode === 'auto' ? 'Auto' : mode === 'always' ? 'Sempre' : 'Ocultos'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sound & Commentator */}
          <div className="flex flex-col gap-3 p-3.5 rounded-xl bg-black/30 border border-white/10">
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() => update('soundEnabled', !settings.soundEnabled)}
                className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-slate-200 cursor-pointer"
              >
                {settings.soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-400" />
                )}
                {settings.soundEnabled ? 'Efeitos Sonoros Ativados' : 'Som Desativado'}
              </button>

              <div className="flex items-center gap-3 w-44">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.volume}
                  onChange={(e) => update('volume', parseFloat(e.target.value))}
                  disabled={!settings.soundEnabled}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <span className="font-mono-num text-xs text-slate-300 w-9 text-right">
                  {Math.round(settings.volume * 100)}%
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 pt-2.5 border-t border-white/10">
              <div className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-slate-200">
                {settings.commentatorEnabled ? (
                  <Mic className="w-4 h-4 text-amber-400" />
                ) : (
                  <MicOff className="w-4 h-4 text-slate-400" />
                )}
                <span>Comentador da Partida</span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-black/35 border border-white/10 w-44">
                <button
                  onClick={() => update('commentatorEnabled', true)}
                  className={`py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    settings.commentatorEnabled
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  Ativado
                </button>
                <button
                  onClick={() => update('commentatorEnabled', false)}
                  className={`py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    !settings.commentatorEnabled
                      ? 'bg-slate-600 text-white'
                      : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  Desligado
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
