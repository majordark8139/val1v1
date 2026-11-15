import React, { useEffect, useState } from 'react';
import { BotDifficulty } from '../config/Constants';
import { HudState } from '../engine/MatchEngine';

interface Props {
  hud: HudState;
  initialRoomParam: string;
  onStartBot: () => void;
  onHostMatch: () => void;
  onJoinMatch: (code: string) => void;
  onSetFormat: (fmt: 'BO5' | 'MR12') => void;
  onSetAimDuel: (free: boolean) => void;
  onSetBotDifficulty: (diff: BotDifficulty) => void;
  onOpenSettings: () => void;
  onReturnToLobby: () => void;
}

export const LobbyOverlay: React.FC<Props> = ({
  hud,
  initialRoomParam,
  onStartBot,
  onHostMatch,
  onJoinMatch,
  onSetFormat,
  onSetAimDuel,
  onSetBotDifficulty,
  onOpenSettings,
  onReturnToLobby,
}) => {
  const [joinCode, setJoinCode] = useState(initialRoomParam);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (hud.appState !== 'title') return;
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.tagName === 'INPUT') return;
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        onStartBot();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [hud.appState, onStartBot]);

  if (hud.appState === 'gameover') {
    const isWin = hud.winnerText === 'VICTORY';
    const localScore = hud.score[0];
    const oppScore = hud.score[1];
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#070a10]/85 p-6">
        <div className="w-full max-w-md bg-[#0d121b] border border-white/15 p-7 text-center shadow-2xl">
          <div
            className={`font-display text-4xl font-bold tracking-[0.18em] ${
              isWin ? 'text-[#00f5d4]' : 'text-[#ff4d6d]'
            }`}
          >
            {hud.winnerText || 'MATCH COMPLETE'}
          </div>
          <div className="font-mono-num text-3xl font-bold text-white mt-2">
            {hud.localIsAttacker ? localScore : oppScore} —{' '}
            {hud.localIsAttacker ? oppScore : localScore}
          </div>

          <div className="grid grid-cols-3 gap-3 my-6">
            <div className="bg-[#121824] border border-white/10 p-3">
              <div className="text-[10px] uppercase tracking-widest text-slate-400">Kills</div>
              <div className="font-mono-num text-xl font-bold text-white mt-0.5">
                {hud.matchStats.kills}
              </div>
            </div>
            <div className="bg-[#121824] border border-white/10 p-3">
              <div className="text-[10px] uppercase tracking-widest text-slate-400">Headshots</div>
              <div className="font-mono-num text-xl font-bold text-[#ffd166] mt-0.5">
                {hud.matchStats.headshots}
              </div>
            </div>
            <div className="bg-[#121824] border border-white/10 p-3">
              <div className="text-[10px] uppercase tracking-widest text-slate-400">Damage</div>
              <div className="font-mono-num text-xl font-bold text-white mt-0.5">
                {hud.matchStats.totalDamage}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              data-start="true"
              onClick={onStartBot}
              className="w-full py-3 bg-[#00f5d4] text-[#090d14] font-display font-bold uppercase tracking-widest text-sm hover:bg-[#33f7dd] transition-colors"
            >
              Play Again
            </button>
            <button
              type="button"
              onClick={onReturnToLobby}
              className="w-full py-2.5 border border-white/20 text-slate-200 text-xs font-semibold uppercase tracking-widest hover:bg-white/10 transition-colors"
            >
              Return to Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (hud.appState !== 'title') return null;

  const inviteUrl =
    hud.roomCode && typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?room=${hud.roomCode}`
      : '';

  const copyInvite = () => {
    if (!inviteUrl) return;
    navigator.clipboard?.writeText(inviteUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-between p-6 sm:p-10 bg-gradient-to-r from-[#090d14]/92 via-[#090d14]/65 to-transparent">
      {/* Top Row: Tactical Emblem & Settings */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3.5">
          <svg viewBox="0 0 40 40" className="w-10 h-10 shrink-0">
            <polygon points="20,2 38,34 28,34 20,18 12,34 2,34" fill="#00f5d4" />
            <polygon points="20,22 26,34 14,34" fill="#ff4d6d" />
          </svg>
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-[0.12em] text-white leading-none">
              PROJECT ASCENT: 1V1
            </h1>
            <p className="text-xs text-slate-300 mt-1 tracking-wide">
              Ascent Mid · 60Hz Deterministic Kinematics · WebRTC P2P
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenSettings}
          className="px-4 py-2 bg-[#0d121b]/90 border border-white/20 text-xs font-semibold uppercase tracking-widest text-slate-100 hover:border-[#00f5d4] hover:text-[#00f5d4] transition-colors"
        >
          Settings
        </button>
      </div>

      {/* Left-Third Focal Match Controls (leaving right 60% clear for Ascent Mid live camera tour) */}
      <div className="w-full max-w-md bg-[#0d121b]/92 border border-white/15 p-6 flex flex-col gap-5 shadow-2xl">
        {/* Format & Economy Selectors */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              Match Format
            </span>
            <div className="grid grid-cols-2 border border-white/15 bg-[#090d14]">
              <button
                type="button"
                onClick={() => onSetFormat('BO5')}
                className={`py-1.5 text-xs font-semibold transition-colors ${
                  hud.matchFormat === 'BO5'
                    ? 'bg-[#00f5d4] text-[#090d14]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Best of 5
              </button>
              <button
                type="button"
                onClick={() => onSetFormat('MR12')}
                className={`py-1.5 text-xs font-semibold transition-colors ${
                  hud.matchFormat === 'MR12'
                    ? 'bg-[#00f5d4] text-[#090d14]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                First to 13
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              Economy Rule
            </span>
            <div className="grid grid-cols-2 border border-white/15 bg-[#090d14]">
              <button
                type="button"
                onClick={() => onSetAimDuel(false)}
                className={`py-1.5 text-xs font-semibold transition-colors ${
                  !hud.aimDuelFree
                    ? 'bg-[#00f5d4] text-[#090d14]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Standard
              </button>
              <button
                type="button"
                onClick={() => onSetAimDuel(true)}
                className={`py-1.5 text-xs font-semibold transition-colors ${
                  hud.aimDuelFree
                    ? 'bg-[#00f5d4] text-[#090d14]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                All Free
              </button>
            </div>
          </div>
        </div>

        {/* Bot Difficulty Selector */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            Bot Difficulty
          </span>
          <div className="grid grid-cols-3 border border-white/15 bg-[#090d14]">
            {(['EASY', 'MEDIUM', 'HARD'] as const).map((diff) => (
              <button
                key={diff}
                type="button"
                onClick={() => onSetBotDifficulty(diff)}
                className={`py-1.5 text-xs font-semibold transition-colors ${
                  hud.botDifficulty === diff
                    ? 'bg-[#00f5d4] text-[#090d14]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {diff === 'EASY' ? 'Easy' : diff === 'MEDIUM' ? 'Medium' : 'Hard'}
              </button>
            ))}
          </div>
        </div>

        {/* Primary Action: Practice vs Bot */}
        <button
          type="button"
          data-start="true"
          onClick={onStartBot}
          className="w-full py-3.5 bg-[#00f5d4] text-[#090d14] font-display font-bold text-base uppercase tracking-[0.16em] hover:bg-[#33f7dd] transition-colors cursor-pointer"
        >
          Practice vs Bot (Offline)
        </button>

        {/* P2P WebRTC 1v1 Controls */}
        <div className="border-t border-white/10 pt-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-[0.14em] text-slate-300 font-semibold">
              Serverless 1v1 Duel
            </span>
            {hud.netStatus !== 'IDLE' && (
              <span className="text-[11px] font-mono-num text-[#ffd166]">
                {hud.netStatus === 'WAITING'
                  ? `ROOM ${hud.roomCode} · WAITING`
                  : hud.netStatus}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onHostMatch}
            className="w-full py-2.5 bg-[#161e2e] border border-white/20 text-white text-xs font-bold uppercase tracking-[0.14em] hover:border-[#00f5d4] transition-colors cursor-pointer"
          >
            Host 1v1 Match
          </button>

          {hud.netStatus === 'WAITING' && hud.roomCode && (
            <div className="bg-[#090d14] border border-[#00f5d4]/40 p-3 flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-400">
                  Room Code
                </div>
                <div className="font-mono-num text-xl font-bold tracking-[0.2em] text-[#00f5d4]">
                  {hud.roomCode}
                </div>
              </div>
              <button
                type="button"
                onClick={copyInvite}
                className="px-3 py-1.5 bg-[#00f5d4]/15 border border-[#00f5d4]/60 text-[#00f5d4] text-xs font-semibold uppercase tracking-wider"
              >
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <label htmlFor="room-code-input" className="sr-only">
              Room Code
            </label>
            <input
              id="room-code-input"
              type="text"
              maxLength={6}
              placeholder="6-CHAR CODE"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="flex-1 bg-[#090d14] border border-white/20 px-3 py-2 text-sm font-mono-num tracking-[0.18em] text-white uppercase placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={() => onJoinMatch(joinCode)}
              className="px-4 py-2 bg-[#ff4d6d] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#ff6681] transition-colors cursor-pointer"
            >
              Join Match
            </button>
          </div>

          {hud.netError && (
            <div className="text-xs text-[#ff4d6d] font-medium">{hud.netError}</div>
          )}
        </div>
      </div>

      {/* Bottom Control Hint */}
      <div className="text-xs text-slate-300/90 tracking-wide hud-text-shadow">
        WASD Move · Shift Walk · Ctrl Crouch · LMB Fire · RMB Scope/ADS · R Reload · B Buy · Esc Settings
      </div>
    </div>
  );
};
