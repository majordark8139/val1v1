import React from 'react';
import { WEAPON_DATA } from '../config/WeaponData';
import { HudState } from '../engine/MatchEngine';

interface Props {
  hud: HudState;
  muted: boolean;
  onToggleMute: () => void;
  onOpenSettings: () => void;
  onOpenBuyMenu: () => void;
}

function formatTimer(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
}

export const HUDManager: React.FC<Props> = ({
  hud,
  muted,
  onToggleMute,
  onOpenSettings,
  onOpenBuyMenu,
}) => {
  if (hud.appState !== 'playing') return null;

  const isLowHp = hud.hp < 30;
  const isLowTime = hud.phase === 'COMBAT' && hud.timer < 10;
  const spec = WEAPON_DATA[hud.weaponId];

  // Score[0] = P1, Score[1] = P2; map to Attacker (Cyan) & Defender (Red)
  const localScore = hud.score[0];
  const oppScore = hud.score[1];
  const atkVal = hud.localIsAttacker ? localScore : oppScore;
  const defVal = hud.localIsAttacker ? oppScore : localScore;

  return (
    <div className="fixed inset-0 pointer-events-none z-30 flex flex-col justify-between p-4 sm:p-6">
      {/* TOP BAR: Scoreboard (Center) + Telemetry & Killfeed (Right) */}
      <div className="flex items-start justify-between w-full">
        {/* Top Left Side Label */}
        <div className="hidden md:flex flex-col gap-0.5 bg-[#0d1118]/85 border border-white/10 px-3 py-1.5 min-w-[164px]">
          <span
            className={`text-[11px] uppercase tracking-[0.16em] font-semibold ${
              hud.localIsAttacker ? 'text-[#00f5d4]' : 'text-[#ff4d6d]'
            }`}
          >
            {hud.localIsAttacker ? 'ATTACKER SIDE' : 'DEFENDER SIDE'}
          </span>
          <span className="text-xs text-slate-300">
            {hud.mode === 'BOT' ? 'Practice vs Bot' : `Room ${hud.roomCode}`}
          </span>
        </div>

        {/* Top Center Scoreboard */}
        <div className="mx-auto flex items-center bg-[#0d1118]/85 border border-white/10 px-4 py-1.5 shadow-lg">
          <div className="flex items-center gap-3 pr-4">
            <span className="text-[10px] uppercase tracking-widest text-[#00f5d4] font-semibold">
              ATK
            </span>
            <span className="font-mono-num text-2xl font-bold text-[#00f5d4]">
              {atkVal}
            </span>
          </div>

          <div className="flex flex-col items-center px-4 border-x border-white/10 min-w-[96px]">
            <span
              className={`font-mono-num text-xl font-bold leading-none ${
                isLowTime ? 'text-[#ff2a2a]' : 'text-white'
              }`}
            >
              {formatTimer(hud.timer)}
            </span>
            <span className="text-[10px] uppercase tracking-[0.15em] text-slate-400 mt-1">
              R{hud.roundNum} · {hud.matchFormat}
            </span>
          </div>

          <div className="flex items-center gap-3 pl-4">
            <span className="font-mono-num text-2xl font-bold text-[#ff4d6d]">
              {defVal}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-[#ff4d6d] font-semibold">
              DEF
            </span>
          </div>
        </div>

        {/* Top Right Telemetry, Controls & Kill Feed */}
        <div className="w-60 flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-[11px] font-mono-num text-slate-200 bg-[#0d1118]/80 border border-white/10 px-2.5 py-1">
              <span>{hud.fps} FPS</span>
              <span className="text-slate-500">·</span>
              <span>{hud.frameMs.toFixed(1)}ms</span>
              {hud.mode === 'P2P' && (
                <>
                  <span className="text-slate-500">·</span>
                  <span>{hud.pingMs}ms</span>
                </>
              )}
            </div>

            <button
              type="button"
              tabIndex={-1}
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              className="pointer-events-auto w-8 h-8 flex items-center justify-center bg-[#0d1118]/85 border border-white/15 text-slate-200 hover:border-[#00f5d4] hover:text-[#00f5d4] transition-colors text-xs font-mono-num"
            >
              {muted ? 'M✕' : 'M'}
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Open settings"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenSettings();
              }}
              className="pointer-events-auto w-8 h-8 flex items-center justify-center bg-[#0d1118]/85 border border-white/15 text-slate-200 hover:border-[#00f5d4] hover:text-[#00f5d4] transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" />
              </svg>
            </button>
          </div>

          {/* Kill Feed */}
          <div className="flex flex-col items-end gap-1 mt-1">
            {hud.killFeed.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 bg-[#0d1118]/85 border border-white/10 px-2.5 py-1 text-xs"
              >
                <span className="font-semibold text-[#00f5d4]">{item.attacker}</span>
                <span className="font-mono-num text-[11px] text-slate-300 uppercase">
                  [{item.weapon}]
                </span>
                {item.headshot && (
                  <svg
                    viewBox="0 0 24 24"
                    className="w-3.5 h-3.5 text-[#ff2a2a] fill-none stroke-current"
                    strokeWidth="2.2"
                  >
                    <circle cx="12" cy="12" r="7" />
                    <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
                  </svg>
                )}
                <span className="font-semibold text-[#ff4d6d]">{item.victim}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* TOP-CENTER SUB-BANNERS (Keep center crosshair sightline 100% clear) */}
      <div className="flex flex-col items-center gap-2 mt-3 mb-auto pointer-events-none">
        {hud.phase === 'BUY' && !hud.buyMenuOpen && (
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenBuyMenu();
            }}
            className="pointer-events-auto bg-[#0d1118]/90 border border-[#00f5d4]/60 px-4 py-1.5 text-xs font-semibold tracking-[0.15em] text-[#00f5d4] hover:bg-[#0d1118] transition-colors"
          >
            BUY PHASE · PRESS [B] TO OPEN ARSENAL
          </button>
        )}

        {!hud.pointerLocked && !hud.buyMenuOpen && hud.phase !== 'BUY' && (
          <div className="bg-[#0d1118]/85 border border-white/15 px-3.5 py-1 text-[11px] tracking-[0.14em] text-slate-200 uppercase">
            Click viewport to lock mouse aim
          </div>
        )}

        {hud.roundBanner && (
          <div className="bg-[#0d1118]/92 border-y-2 border-[#00f5d4] px-8 py-2.5 mt-4">
            <span className="font-display text-2xl sm:text-3xl font-bold tracking-[0.22em] text-white">
              {hud.roundBanner}
            </span>
          </div>
        )}
      </div>

      {/* BOTTOM CORNERS: Vitality (Left) & Arsenal + Credits (Right) */}
      <div className="flex items-end justify-between w-full">
        {/* Bottom Left: Shield & Health */}
        <div className="flex items-center gap-5 bg-[#0d1118]/85 border border-white/10 px-5 py-3">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#00f5d4] fill-current opacity-90">
              <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z" />
            </svg>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-slate-400">Armor</span>
              <span className="font-mono-num text-2xl font-bold leading-none text-[#00f5d4]">
                {Math.round(hud.shield)}
              </span>
            </div>
          </div>

          <div className="h-9 w-px bg-white/10" />

          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-slate-400">Vitality</span>
            <span
              className={`font-mono-num text-[42px] font-bold leading-none ${
                isLowHp ? 'text-[#ff2a2a]' : 'text-white'
              }`}
            >
              {Math.round(hud.hp)}
            </span>
          </div>
        </div>

        {/* Bottom Right: Ammo, Slots & Credits */}
        <div className="flex flex-col items-end gap-2">
          {/* Loadout Slots */}
          <div className="flex items-center gap-1.5">
            {([1, 2, 3] as const).map((slotNum) => {
              const wpnId = hud.slots[slotNum];
              const active = hud.activeSlot === slotNum;
              return (
                <div
                  key={slotNum}
                  className={`px-2.5 py-1 border text-[11px] font-mono-num uppercase transition-colors ${
                    active
                      ? 'bg-[#0d1118]/95 border-[#00f5d4] text-[#00f5d4] font-bold'
                      : 'bg-[#0d1118]/80 border-white/10 text-slate-400'
                  }`}
                >
                  [{slotNum}] {wpnId ?? 'EMPTY'}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-5 bg-[#0d1118]/85 border border-white/10 px-5 py-2.5">
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-widest text-slate-400">Credits</span>
              <span className="font-mono-num text-xl font-bold text-[#ffd166]">
                ¤ {hud.credits.toLocaleString()}
              </span>
            </div>

            <div className="h-8 w-px bg-white/10" />

            <div className="flex flex-col items-end min-w-[92px]">
              <span className="text-[10px] uppercase tracking-widest text-slate-400">
                {hud.isReloading ? 'RELOADING...' : spec.name}
              </span>
              {spec.id === 'KNIFE' ? (
                <span className="font-mono-num text-3xl font-bold leading-none text-white">∞</span>
              ) : (
                <div className="flex items-baseline gap-1 font-mono-num leading-none">
                  <span
                    className={`text-3xl font-bold ${
                      hud.mag <= Math.ceil(spec.magSize * 0.25) ? 'text-[#ff4d6d]' : 'text-white'
                    }`}
                  >
                    {hud.mag}
                  </span>
                  <span className="text-base text-slate-400">/ {hud.reserve}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
