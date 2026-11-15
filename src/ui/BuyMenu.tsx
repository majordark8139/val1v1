import React from 'react';
import { MATCH_CONFIG } from '../config/Constants';
import { WEAPON_DATA, WeaponId } from '../config/WeaponData';
import { HudState } from '../engine/MatchEngine';

interface Props {
  hud: HudState;
  onBuyItem: (item: WeaponId | 'LIGHT_SHIELD' | 'HEAVY_SHIELD') => void;
  onClose: () => void;
}

const WeaponCard: React.FC<{
  id: WeaponId;
  credits: number;
  owned: boolean;
  aimDuelFree: boolean;
  onBuy: (id: WeaponId) => void;
}> = ({ id, credits, owned, aimDuelFree, onBuy }) => {
  const spec = WEAPON_DATA[id];
  const cost = aimDuelFree ? 0 : spec.cost;
  const canAfford = credits >= cost;
  const topDmg = spec.damageRanges[0];

  return (
    <button
      type="button"
      disabled={!canAfford || owned}
      onClick={() => onBuy(id)}
      className={`w-full text-left p-3 border transition-colors flex flex-col gap-1.5 ${
        owned
          ? 'bg-[#00f5d4]/15 border-[#00f5d4] text-white'
          : canAfford
          ? 'bg-[#121722] border-white/15 hover:border-[#00f5d4] text-slate-100 cursor-pointer'
          : 'bg-[#0d1118]/70 border-white/5 text-slate-500 cursor-not-allowed'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-display font-bold tracking-wider uppercase text-sm">
          {spec.name}
        </span>
        <span className="font-mono-num text-xs font-bold text-[#ffd166]">
          {owned ? 'EQUIPPED' : cost === 0 ? 'FREE' : `¤ ${cost.toLocaleString()}`}
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px] font-mono-num text-slate-400">
        <span>
          HS {topDmg.head} · BD {topDmg.body}
        </span>
        <span>{spec.fireRateRPM} RPM</span>
      </div>
    </button>
  );
};

export const BuyMenu: React.FC<Props> = ({ hud, onBuyItem, onClose }) => {
  if (!hud.buyMenuOpen || hud.phase !== 'BUY' || hud.appState !== 'playing') return null;

  const owned1 = hud.slots[1];
  const owned2 = hud.slots[2];

  const lightCost = hud.aimDuelFree ? 0 : MATCH_CONFIG.LIGHT_SHIELD_COST;
  const heavyCost = hud.aimDuelFree ? 0 : MATCH_CONFIG.HEAVY_SHIELD_COST;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#06090f]/80 p-6">
      <div className="w-full max-w-4xl bg-[#0d121b] border border-white/15 p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-wider text-white uppercase">
              Tactical Armory
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Buy Phase · {Math.ceil(hud.timer)}s remaining · Press [B] to close
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest text-slate-400">
                Available Credits
              </div>
              <div className="font-mono-num text-2xl font-bold text-[#ffd166]">
                ¤ {hud.credits.toLocaleString()}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-xs font-semibold uppercase tracking-wider text-white transition-colors"
            >
              Close [B]
            </button>
          </div>
        </div>

        {/* 4-Column Armory Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Column 1: Sidearms */}
          <div className="flex flex-col gap-2.5">
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400 font-semibold border-b border-white/10 pb-1.5">
              Sidearms
            </div>
            <WeaponCard
              id="CLASSIC"
              credits={hud.credits}
              owned={owned2 === 'CLASSIC'}
              aimDuelFree={hud.aimDuelFree}
              onBuy={onBuyItem}
            />
            <WeaponCard
              id="GHOST"
              credits={hud.credits}
              owned={owned2 === 'GHOST'}
              aimDuelFree={hud.aimDuelFree}
              onBuy={onBuyItem}
            />
            <WeaponCard
              id="SHERIFF"
              credits={hud.credits}
              owned={owned2 === 'SHERIFF'}
              aimDuelFree={hud.aimDuelFree}
              onBuy={onBuyItem}
            />
          </div>

          {/* Column 2: SMGs */}
          <div className="flex flex-col gap-2.5">
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400 font-semibold border-b border-white/10 pb-1.5">
              SMGs
            </div>
            <WeaponCard
              id="SPECTRE"
              credits={hud.credits}
              owned={owned1 === 'SPECTRE'}
              aimDuelFree={hud.aimDuelFree}
              onBuy={onBuyItem}
            />
          </div>

          {/* Column 3: Rifles */}
          <div className="flex flex-col gap-2.5">
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400 font-semibold border-b border-white/10 pb-1.5">
              Rifles
            </div>
            <WeaponCard
              id="PHANTOM"
              credits={hud.credits}
              owned={owned1 === 'PHANTOM'}
              aimDuelFree={hud.aimDuelFree}
              onBuy={onBuyItem}
            />
            <WeaponCard
              id="VANDAL"
              credits={hud.credits}
              owned={owned1 === 'VANDAL'}
              aimDuelFree={hud.aimDuelFree}
              onBuy={onBuyItem}
            />
          </div>

          {/* Column 4: Sniper & Armor */}
          <div className="flex flex-col gap-2.5">
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400 font-semibold border-b border-white/10 pb-1.5">
              Sniper & Armor
            </div>
            <WeaponCard
              id="OPERATOR"
              credits={hud.credits}
              owned={owned1 === 'OPERATOR'}
              aimDuelFree={hud.aimDuelFree}
              onBuy={onBuyItem}
            />

            <button
              type="button"
              disabled={hud.credits < lightCost || hud.shield >= 25}
              onClick={() => onBuyItem('LIGHT_SHIELD')}
              className={`w-full text-left p-3 border transition-colors flex flex-col gap-1 ${
                hud.shield >= 25 && hud.shield < 50
                  ? 'bg-[#00f5d4]/15 border-[#00f5d4] text-white'
                  : hud.credits >= lightCost && hud.shield < 25
                  ? 'bg-[#121722] border-white/15 hover:border-[#00f5d4] text-slate-100 cursor-pointer'
                  : 'bg-[#0d1118]/70 border-white/5 text-slate-500 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-display font-bold uppercase text-sm">Light Shields</span>
                <span className="font-mono-num text-xs font-bold text-[#ffd166]">
                  {hud.shield >= 25 ? 'OWNED' : lightCost === 0 ? 'FREE' : `¤ ${lightCost}`}
                </span>
              </div>
              <span className="text-[11px] font-mono-num text-slate-400">
                +25 Armor · 66% Absorption
              </span>
            </button>

            <button
              type="button"
              disabled={hud.credits < heavyCost || hud.shield >= 50}
              onClick={() => onBuyItem('HEAVY_SHIELD')}
              className={`w-full text-left p-3 border transition-colors flex flex-col gap-1 ${
                hud.shield >= 50
                  ? 'bg-[#00f5d4]/15 border-[#00f5d4] text-white'
                  : hud.credits >= heavyCost
                  ? 'bg-[#121722] border-white/15 hover:border-[#00f5d4] text-slate-100 cursor-pointer'
                  : 'bg-[#0d1118]/70 border-white/5 text-slate-500 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-display font-bold uppercase text-sm">Heavy Shields</span>
                <span className="font-mono-num text-xs font-bold text-[#ffd166]">
                  {hud.shield >= 50 ? 'OWNED' : heavyCost === 0 ? 'FREE' : `¤ ${heavyCost.toLocaleString()}`}
                </span>
              </div>
              <span className="text-[11px] font-mono-num text-slate-400">
                +50 Armor · 66% Absorption
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
