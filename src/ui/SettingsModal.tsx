import React, { useEffect, useRef } from 'react';
import {
  calculateCmPer360,
  calculateEDPI,
  CrosshairColor,
  PlayerSettings,
} from '../config/Constants';

interface Props {
  open: boolean;
  inMatch: boolean;
  settings: PlayerSettings;
  onChange: (next: PlayerSettings) => void;
  onClose: () => void;
  onReturnToLobby?: () => void;
}

const COLOR_PRESETS: { label: string; hex: CrosshairColor }[] = [
  { label: 'Cyan', hex: '#00f5d4' },
  { label: 'Green', hex: '#39ff14' },
  { label: 'White', hex: '#ffffff' },
  { label: 'Yellow', hex: '#ffe600' },
  { label: 'Pink', hex: '#ff4dff' },
  { label: 'Red', hex: '#ff2a2a' },
];

export const SettingsModal: React.FC<Props> = ({
  open,
  inMatch,
  settings,
  onChange,
  onClose,
  onReturnToLobby,
}) => {
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#5e6770';
    ctx.fillRect(0, 0, w, h);

    // Subtle greybox wall background tile
    ctx.strokeStyle = '#4b535b';
    ctx.lineWidth = 1;
    ctx.strokeRect(10.5, 10.5, w - 21, h - 21);

    const cx = Math.floor(w * 0.5) + 0.5;
    const cy = Math.floor(h * 0.5) + 0.5;
    const c = settings.crosshair;
    const halfT = c.thickness * 0.5;

    const drawRect = (rx: number, ry: number, rw: number, rh: number) => {
      if (c.outline) {
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(rx - 1, ry - 1, rw + 2, rh + 2);
      }
      ctx.fillStyle = c.color;
      ctx.fillRect(rx, ry, rw, rh);
    };

    drawRect(cx - halfT, cy - c.gap - c.length, c.thickness, c.length);
    drawRect(cx - halfT, cy + c.gap, c.thickness, c.length);
    drawRect(cx - c.gap - c.length, cy - halfT, c.length, c.thickness);
    drawRect(cx + c.gap, cy - halfT, c.length, c.thickness);
    if (c.centerDot) {
      drawRect(cx - halfT, cy - halfT, c.thickness, c.thickness);
    }
  }, [open, settings]);

  if (!open) return null;

  const edpi = calculateEDPI(settings.dpi, settings.sensitivity);
  const cm360 = calculateCmPer360(settings.dpi, settings.sensitivity);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#06090f]/85 p-4">
      <div className="w-full max-w-3xl bg-[#0d121b] border border-white/15 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
          <div>
            <h2 className="font-display text-2xl font-bold uppercase tracking-wider text-white">
              Match Settings
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Valorant-scaled Sensitivity, eDPI Calculator & Crosshair Studio
            </p>
          </div>
          <div className="flex items-center gap-2">
            {inMatch && onReturnToLobby && (
              <button
                type="button"
                onClick={onReturnToLobby}
                className="px-3.5 py-2 border border-[#ff4d6d]/50 text-[#ff4d6d] hover:bg-[#ff4d6d]/15 text-xs font-semibold uppercase tracking-wider transition-colors"
              >
                Leave Match
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#00f5d4] text-[#090d14] hover:bg-[#33f7dd] text-xs font-bold uppercase tracking-wider transition-colors"
            >
              {inMatch ? 'Resume' : 'Done'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Sensitivity & eDPI */}
          <div className="flex flex-col gap-4">
            <h3 className="text-xs uppercase tracking-[0.16em] text-[#00f5d4] font-semibold">
              Aim & Mouse Calibration
            </h3>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="sens-slider" className="text-slate-300 font-medium">
                  Valorant Sensitivity
                </label>
                <span className="font-mono-num text-white font-bold">
                  {settings.sensitivity.toFixed(2)}
                </span>
              </div>
              <input
                id="sens-slider"
                type="range"
                min={0.05}
                max={3.0}
                step={0.01}
                value={settings.sensitivity}
                onChange={(e) =>
                  onChange({ ...settings, sensitivity: parseFloat(e.target.value) })
                }
                className="accent-[#00f5d4]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="dpi-input" className="text-xs text-slate-300 font-medium">
                Mouse DPI
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="dpi-input"
                  type="number"
                  min={100}
                  max={16000}
                  step={50}
                  value={settings.dpi}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      dpi: Math.max(100, Number(e.target.value) || 800),
                    })
                  }
                  className="w-28 bg-[#141b26] border border-white/15 px-3 py-1.5 text-sm font-mono-num text-white"
                />
                {[400, 800, 1600].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onChange({ ...settings, dpi: preset })}
                    className={`px-2.5 py-1.5 text-xs font-mono-num border ${
                      settings.dpi === preset
                        ? 'border-[#00f5d4] bg-[#00f5d4]/15 text-[#00f5d4]'
                        : 'border-white/15 text-slate-300 hover:border-white/35'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Live eDPI & cm/360 Readout */}
            <div className="grid grid-cols-2 gap-3 bg-[#121824] border border-white/10 p-3.5">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-400">eDPI</div>
                <div className="font-mono-num text-2xl font-bold text-white">{edpi}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-400">
                  cm / 360°
                </div>
                <div className="font-mono-num text-2xl font-bold text-[#00f5d4]">
                  {cm360.toFixed(1)} cm
                </div>
              </div>
            </div>

            {/* Gameplay & Bot Toggles */}
            <div className="flex flex-col gap-2.5 pt-2">
              <div className="flex items-center justify-between text-xs text-slate-200">
                <span>Bot Difficulty</span>
                <div className="grid grid-cols-3 border border-white/15 bg-[#090d14]">
                  {(['EASY', 'MEDIUM', 'HARD'] as const).map((diff) => (
                    <button
                      key={diff}
                      type="button"
                      onClick={() => onChange({ ...settings, botDifficulty: diff })}
                      className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        settings.botDifficulty === diff
                          ? 'bg-[#00f5d4] text-[#090d14]'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {diff === 'EASY' ? 'Easy' : diff === 'MEDIUM' ? 'Medium' : 'Hard'}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                <span>Operator Auto-Rescope After Bolt Cycle</span>
                <input
                  type="checkbox"
                  checked={settings.autoRescope}
                  onChange={(e) =>
                    onChange({ ...settings, autoRescope: e.target.checked })
                  }
                  className="accent-[#00f5d4] w-4 h-4"
                />
              </label>
              <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                <span>Mute All Audio [M]</span>
                <input
                  type="checkbox"
                  checked={settings.muted}
                  onChange={(e) => onChange({ ...settings, muted: e.target.checked })}
                  className="accent-[#00f5d4] w-4 h-4"
                />
              </label>
            </div>
          </div>

          {/* Right Column: Crosshair Editor */}
          <div className="flex flex-col gap-3.5">
            <h3 className="text-xs uppercase tracking-[0.16em] text-[#00f5d4] font-semibold">
              Crosshair Studio
            </h3>

            <canvas
              ref={previewCanvasRef}
              width={280}
              height={96}
              className="w-full h-24 border border-white/15"
            />

            <div className="flex items-center gap-1.5 flex-wrap">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.hex}
                  type="button"
                  aria-label={`Crosshair color ${preset.label}`}
                  onClick={() =>
                    onChange({
                      ...settings,
                      crosshair: { ...settings.crosshair, color: preset.hex },
                    })
                  }
                  className={`px-2.5 py-1 text-[11px] border flex items-center gap-1.5 ${
                    settings.crosshair.color === preset.hex
                      ? 'border-white bg-white/15 text-white'
                      : 'border-white/15 text-slate-300'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 inline-block"
                    style={{ backgroundColor: preset.hex }}
                  />
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                <span>Length ({settings.crosshair.length})</span>
                <input
                  type="range"
                  min={1}
                  max={12}
                  step={1}
                  value={settings.crosshair.length}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      crosshair: { ...settings.crosshair, length: Number(e.target.value) },
                    })
                  }
                  className="accent-[#00f5d4]"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                <span>Thick ({settings.crosshair.thickness})</span>
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={1}
                  value={settings.crosshair.thickness}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      crosshair: { ...settings.crosshair, thickness: Number(e.target.value) },
                    })
                  }
                  className="accent-[#00f5d4]"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                <span>Gap ({settings.crosshair.gap})</span>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={settings.crosshair.gap}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      crosshair: { ...settings.crosshair, gap: Number(e.target.value) },
                    })
                  }
                  className="accent-[#00f5d4]"
                />
              </label>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                <span>Outer Black Outline</span>
                <input
                  type="checkbox"
                  checked={settings.crosshair.outline}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      crosshair: { ...settings.crosshair, outline: e.target.checked },
                    })
                  }
                  className="accent-[#00f5d4] w-4 h-4"
                />
              </label>
              <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                <span>Center Dot</span>
                <input
                  type="checkbox"
                  checked={settings.crosshair.centerDot}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      crosshair: { ...settings.crosshair, centerDot: e.target.checked },
                    })
                  }
                  className="accent-[#00f5d4] w-4 h-4"
                />
              </label>
              <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                <span>Dynamic Movement / Firing Error</span>
                <input
                  type="checkbox"
                  checked={settings.crosshair.dynamicError}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      crosshair: { ...settings.crosshair, dynamicError: e.target.checked },
                    })
                  }
                  className="accent-[#00f5d4] w-4 h-4"
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
