import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, PlayerSettings } from './config/Constants';
import { HudState, MatchEngine } from './engine/MatchEngine';
import { BuyMenu } from './ui/BuyMenu';
import { CrosshairRenderer, CrosshairRendererHandle } from './ui/CrosshairRenderer';
import { HUDManager } from './ui/HUDManager';
import { LobbyOverlay } from './ui/LobbyOverlay';
import { SettingsModal } from './ui/SettingsModal';

const INITIAL_HUD: HudState = {
  appState: 'title',
  mode: 'BOT',
  phase: 'BUY',
  roundNum: 1,
  timer: 15,
  score: [0, 0],
  localIsAttacker: true,
  hp: 100,
  shield: 0,
  credits: 800,
  weaponId: 'CLASSIC',
  mag: 12,
  reserve: 36,
  slots: { 1: null, 2: 'CLASSIC', 3: 'KNIFE' },
  activeSlot: 2,
  isReloading: false,
  isScoped: false,
  scopeLevel: 0,
  isInDeadzone: true,
  buyMenuOpen: false,
  fps: 60,
  frameMs: 4.0,
  pingMs: 0,
  matchFormat: 'BO5',
  aimDuelFree: false,
  botDifficulty: 'MEDIUM',
  winnerText: '',
  matchStats: { kills: 0, deaths: 0, headshots: 0, totalDamage: 0 },
  killFeed: [],
  roundBanner: '',
  netStatus: 'IDLE',
  roomCode: '',
  netError: '',
  pointerLocked: false,
};

export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<MatchEngine | null>(null);
  const crosshairRef = useRef<CrosshairRendererHandle | null>(null);

  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [settings, setSettings] = useState<PlayerSettings>(DEFAULT_SETTINGS);
  const [lobbySettingsOpen, setLobbySettingsOpen] = useState(false);

  const urlParams = useMemo(() => {
    const sp = new URLSearchParams(window.location.search);
    return {
      room: (sp.get('room') || '').trim().toUpperCase(),
      autostart: sp.get('autostart') === '1',
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const engine = new MatchEngine(canvas, {
      onHudUpdate: (nextHud) => setHud(nextHud),
      onCrosshairEvent: (evt) => crosshairRef.current?.pushUpdate(evt),
    });
    engineRef.current = engine;
    setSettings({ ...engine.settings });

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        engine.resize(width, height);
      }
    });
    ro.observe(container);

    if (urlParams.autostart) {
      engine.startPracticeVsBot();
    } else if (urlParams.room.length === 6) {
      engine.network.joinMatch(urlParams.room);
    }

    return () => {
      ro.disconnect();
      engine.dispose();
      engineRef.current = null;
    };
  }, [urlParams]);

  const handleSettingsChange = (next: PlayerSettings) => {
    setSettings(next);
    engineRef.current?.applySettings(next);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0b0e14]">
      {/* Isolated WebGL Viewport Container */}
      <div ref={containerRef} className="w-full h-full">
        <canvas
          id="game-canvas"
          ref={canvasRef}
          data-testid="game-canvas"
          className="block w-full h-full"
        />
      </div>

      {/* Dedicated 2D Crosshair & Scope Canvas */}
      <CrosshairRenderer
        ref={crosshairRef}
        visible={hud.appState === 'playing' && !hud.buyMenuOpen}
        settings={settings.crosshair}
      />

      {/* Minimalist Competitive HUD */}
      <HUDManager
        hud={hud}
        muted={settings.muted}
        onToggleMute={() => {
          engineRef.current?.toggleMute();
          if (engineRef.current) setSettings({ ...engineRef.current.settings });
        }}
        onOpenSettings={() => engineRef.current?.togglePause()}
        onOpenBuyMenu={() => engineRef.current?.toggleBuyMenu()}
        onSkipBuyPhase={() => engineRef.current?.skipBuyPhase()}
      />

      {/* Tactical Buy Menu */}
      <BuyMenu
        hud={hud}
        onBuyItem={(item) => engineRef.current?.buyItem(item)}
        onClose={() => engineRef.current?.toggleBuyMenu()}
      />

      {/* Lobby & Match Over Screens */}
      <LobbyOverlay
        hud={hud}
        initialRoomParam={urlParams.room}
        onStartBot={() => engineRef.current?.startPracticeVsBot()}
        onHostMatch={() => engineRef.current?.network.hostMatch()}
        onJoinMatch={(code) => engineRef.current?.network.joinMatch(code)}
        onSetFormat={(fmt) => engineRef.current?.setMatchFormat(fmt)}
        onSetAimDuel={(free) => engineRef.current?.setAimDuelFree(free)}
        onSetBotDifficulty={(diff) => {
          engineRef.current?.setBotDifficulty(diff);
          if (engineRef.current) setSettings({ ...engineRef.current.settings });
        }}
        onOpenSettings={() => setLobbySettingsOpen(true)}
        onReturnToLobby={() => engineRef.current?.returnToLobby()}
      />

      {/* Pause / Settings Modal */}
      <SettingsModal
        open={hud.appState === 'paused' || lobbySettingsOpen}
        inMatch={hud.appState === 'paused'}
        settings={settings}
        onChange={handleSettingsChange}
        onClose={() => {
          if (lobbySettingsOpen) setLobbySettingsOpen(false);
          if (hud.appState === 'paused') engineRef.current?.togglePause();
        }}
        onReturnToLobby={() => {
          setLobbySettingsOpen(false);
          engineRef.current?.returnToLobby();
        }}
      />
    </div>
  );
}
