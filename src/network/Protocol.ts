import { HitTier, WeaponId } from '../config/WeaponData';

export type RoundPhase = 'BUY' | 'COMBAT' | 'POST_ROUND' | 'MATCH_OVER';

export interface CmdInputPacket {
  t: 'I';
  seq: number;
  tick: number;
  f: number;
  r: number;
  yaw: number;
  pitch: number;
  btn: number; // Bitmask: 1=Jump, 2=Crouch, 4=Walk, 8=Fire, 16=AltFire, 32=Reload
  wpn: WeaponId;
}

// Tuple: [x, y, z, vx, vy, vz, yaw, pitch, crouchAlpha, hp, shield, wpn, ammo, tagTimer]
export type PlayerSnapTuple = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  WeaponId,
  number,
  number,
];

export interface SnapStatePacket {
  t: 'S';
  tick: number;
  ackSeq: number;
  p1: PlayerSnapTuple;
  p2: PlayerSnapTuple;
}

export interface EvtFirePacket {
  t: 'F';
  shooterId: 1 | 2;
  tick: number;
  renderInterpTick: number;
  wpn: WeaponId;
  origin: [number, number, number];
  dir: [number, number, number];
  isAlt?: boolean;
}

export interface EvtHitConfirmPacket {
  t: 'H';
  attackerId: 1 | 2;
  victimId: 1 | 2;
  tier: HitTier;
  dmg: number;
  newHp: number;
  newShield: number;
  killed: boolean;
  wpn: WeaponId;
  hitPos: [number, number, number];
}

export interface EvtRoundStatePacket {
  t: 'R';
  phase: RoundPhase;
  roundNum: number;
  timer: number;
  score: [number, number];
  winnerId: 1 | 2 | null;
  p1Creds: number;
  p2Creds: number;
  p1IsAttacker: boolean;
  matchFormat: 'BO5' | 'MR12';
  aimDuelFree: boolean;
}

export interface EvtBuyPacket {
  t: 'B';
  playerId: 1 | 2;
  item: WeaponId | 'LIGHT_SHIELD' | 'HEAVY_SHIELD';
}

export interface PingPacket {
  t: 'P';
  ts: number;
}

export interface PongPacket {
  t: 'Q';
  ts: number;
}

export type NetPacket =
  | CmdInputPacket
  | SnapStatePacket
  | EvtFirePacket
  | EvtHitConfirmPacket
  | EvtRoundStatePacket
  | EvtBuyPacket
  | PingPacket
  | PongPacket;

export const BTN_JUMP = 1;
export const BTN_CROUCH = 2;
export const BTN_WALK = 4;
export const BTN_FIRE = 8;
export const BTN_ALT_FIRE = 16;
export const BTN_RELOAD = 32;
