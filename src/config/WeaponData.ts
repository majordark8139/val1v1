import { PHYSICS, MATCH_CONFIG } from './Constants';

export type WeaponId =
  | 'KNIFE'
  | 'CLASSIC'
  | 'GHOST'
  | 'SHERIFF'
  | 'SPECTRE'
  | 'PHANTOM'
  | 'VANDAL'
  | 'OPERATOR';

export type WeaponSlot = 1 | 2 | 3;
export type HitTier = 'HEAD' | 'TORSO' | 'LEGS';

export interface DamageRange {
  maxDist: number;
  head: number;
  body: number;
  leg: number;
}

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  slot: WeaponSlot;
  category: 'MELEE' | 'SIDEARM' | 'SMG' | 'RIFLE' | 'SNIPER';
  cost: number;
  fireMode: 'MELEE' | 'SEMI' | 'AUTO' | 'BOLT';
  suppressed: boolean;
  fireRateRPM: number;
  altFireRateRPM?: number;
  moveSpeed: number;
  scopedMoveSpeed: number;
  adsZoomFactor: number;
  magSize: number;
  reserveSize: number;
  reloadTime: number;
  equipTime: number;
  baseSpread: number;
  altBaseSpread?: number;
  moveSpread: number;
  airSpread: number;
  recoilResetTime: number;
  recoilPitchBase: number;
  recoilPitchClimb: number;
  recoilMaxHorizontal: number;
  damageRanges: DamageRange[];
  meleeRange?: number;
}

export const WEAPON_DATA: Record<WeaponId, WeaponSpec> = {
  KNIFE: {
    id: 'KNIFE',
    name: 'Tactical Knife',
    slot: 3,
    category: 'MELEE',
    cost: 0,
    fireMode: 'MELEE',
    suppressed: false,
    fireRateRPM: 100,
    altFireRateRPM: 60,
    moveSpeed: PHYSICS.SPEED_KNIFE,
    scopedMoveSpeed: PHYSICS.SPEED_KNIFE,
    adsZoomFactor: 1.0,
    magSize: 0,
    reserveSize: 0,
    reloadTime: 0.0,
    equipTime: 0.35,
    baseSpread: 0.0,
    moveSpread: 0.0,
    airSpread: 0.0,
    recoilResetTime: 0.2,
    recoilPitchBase: 0,
    recoilPitchClimb: 0,
    recoilMaxHorizontal: 0,
    damageRanges: [{ maxDist: 2.0, head: 75, body: 50, leg: 50 }],
    meleeRange: 1.85,
  },
  CLASSIC: {
    id: 'CLASSIC',
    name: 'Classic',
    slot: 2,
    category: 'SIDEARM',
    cost: 0,
    fireMode: 'SEMI',
    suppressed: false,
    fireRateRPM: 405,
    altFireRateRPM: 135,
    moveSpeed: PHYSICS.SPEED_PISTOL,
    scopedMoveSpeed: PHYSICS.SPEED_PISTOL,
    adsZoomFactor: 1.0,
    magSize: 12,
    reserveSize: 36,
    reloadTime: 1.75,
    equipTime: 0.75,
    baseSpread: 0.40,
    altBaseSpread: 1.95,
    moveSpread: 2.50,
    airSpread: 4.50,
    recoilResetTime: 0.35,
    recoilPitchBase: 0.45,
    recoilPitchClimb: 0.85,
    recoilMaxHorizontal: 1.1,
    damageRanges: [
      { maxDist: 30, head: 78, body: 26, leg: 22 },
      { maxDist: 500, head: 66, body: 22, leg: 18 },
    ],
  },
  GHOST: {
    id: 'GHOST',
    name: 'Ghost',
    slot: 2,
    category: 'SIDEARM',
    cost: 500,
    fireMode: 'SEMI',
    suppressed: true,
    fireRateRPM: 405,
    moveSpeed: PHYSICS.SPEED_PISTOL,
    scopedMoveSpeed: PHYSICS.SPEED_PISTOL,
    adsZoomFactor: 1.0,
    magSize: 15,
    reserveSize: 45,
    reloadTime: 1.50,
    equipTime: 0.75,
    baseSpread: 0.30,
    moveSpread: 2.50,
    airSpread: 4.20,
    recoilResetTime: 0.35,
    recoilPitchBase: 0.35,
    recoilPitchClimb: 0.75,
    recoilMaxHorizontal: 0.9,
    damageRanges: [
      { maxDist: 30, head: 105, body: 30, leg: 25 },
      { maxDist: 500, head: 87, body: 25, leg: 21 },
    ],
  },
  SHERIFF: {
    id: 'SHERIFF',
    name: 'Sheriff',
    slot: 2,
    category: 'SIDEARM',
    cost: 800,
    fireMode: 'SEMI',
    suppressed: false,
    fireRateRPM: 240,
    moveSpeed: PHYSICS.SPEED_PISTOL,
    scopedMoveSpeed: PHYSICS.SPEED_PISTOL,
    adsZoomFactor: 1.0,
    magSize: 6,
    reserveSize: 24,
    reloadTime: 2.25,
    equipTime: 1.00,
    baseSpread: 0.25,
    moveSpread: 3.50,
    airSpread: 5.50,
    recoilResetTime: 0.35,
    recoilPitchBase: 1.25,
    recoilPitchClimb: 1.85,
    recoilMaxHorizontal: 1.4,
    damageRanges: [
      { maxDist: 30, head: 159, body: 55, leg: 46 },
      { maxDist: 500, head: 145, body: 50, leg: 42 },
    ],
  },
  SPECTRE: {
    id: 'SPECTRE',
    name: 'Spectre',
    slot: 1,
    category: 'SMG',
    cost: 1600,
    fireMode: 'AUTO',
    suppressed: true,
    fireRateRPM: 799,
    moveSpeed: PHYSICS.SPEED_SMG,
    scopedMoveSpeed: PHYSICS.SPEED_SMG * 0.76,
    adsZoomFactor: 1.15,
    magSize: 30,
    reserveSize: 90,
    reloadTime: 2.25,
    equipTime: 0.75,
    baseSpread: 0.40,
    moveSpread: 1.20,
    airSpread: 3.80,
    recoilResetTime: 0.35,
    recoilPitchBase: 0.22,
    recoilPitchClimb: 0.72,
    recoilMaxHorizontal: 1.75,
    damageRanges: [
      { maxDist: 15, head: 78, body: 26, leg: 22 },
      { maxDist: 30, head: 66, body: 22, leg: 18 },
      { maxDist: 500, head: 60, body: 20, leg: 17 },
    ],
  },
  PHANTOM: {
    id: 'PHANTOM',
    name: 'Phantom',
    slot: 1,
    category: 'RIFLE',
    cost: 2900,
    fireMode: 'AUTO',
    suppressed: true,
    fireRateRPM: 660,
    moveSpeed: PHYSICS.SPEED_RIFLE,
    scopedMoveSpeed: PHYSICS.SPEED_RIFLE * 0.76,
    adsZoomFactor: 1.25,
    magSize: 30,
    reserveSize: 90,
    reloadTime: 2.50,
    equipTime: 1.00,
    baseSpread: 0.20,
    moveSpread: 5.00,
    airSpread: 8.00,
    recoilResetTime: 0.35,
    recoilPitchBase: 0.28,
    recoilPitchClimb: 0.95,
    recoilMaxHorizontal: 1.9,
    damageRanges: [
      { maxDist: 15, head: 156, body: 39, leg: 33 },
      { maxDist: 30, head: 140, body: 35, leg: 29 },
      { maxDist: 500, head: 124, body: 31, leg: 26 },
    ],
  },
  VANDAL: {
    id: 'VANDAL',
    name: 'Vandal',
    slot: 1,
    category: 'RIFLE',
    cost: 2900,
    fireMode: 'AUTO',
    suppressed: false,
    fireRateRPM: 585,
    moveSpeed: PHYSICS.SPEED_RIFLE,
    scopedMoveSpeed: PHYSICS.SPEED_RIFLE * 0.76,
    adsZoomFactor: 1.25,
    magSize: 25,
    reserveSize: 75,
    reloadTime: 2.50,
    equipTime: 1.00,
    baseSpread: 0.25,
    moveSpread: 5.00,
    airSpread: 8.00,
    recoilResetTime: 0.38,
    recoilPitchBase: 0.35,
    recoilPitchClimb: 1.15,
    recoilMaxHorizontal: 2.4,
    damageRanges: [
      { maxDist: 500, head: 160, body: 40, leg: 34 },
    ],
  },
  OPERATOR: {
    id: 'OPERATOR',
    name: 'Operator',
    slot: 1,
    category: 'SNIPER',
    cost: 4700,
    fireMode: 'BOLT',
    suppressed: false,
    fireRateRPM: 36,
    moveSpeed: PHYSICS.SPEED_SNIPER_UNSCOPED,
    scopedMoveSpeed: PHYSICS.SPEED_SNIPER_SCOPED,
    adsZoomFactor: 2.5,
    magSize: 5,
    reserveSize: 10,
    reloadTime: 3.70,
    equipTime: 1.50,
    baseSpread: 5.00,
    altBaseSpread: 0.00,
    moveSpread: 8.00,
    airSpread: 12.00,
    recoilResetTime: 0.50,
    recoilPitchBase: 2.8,
    recoilPitchClimb: 0.0,
    recoilMaxHorizontal: 0.0,
    damageRanges: [
      { maxDist: 500, head: 255, body: 150, leg: 120 },
    ],
  },
};

export const BUYABLE_WEAPONS: WeaponId[] = [
  'CLASSIC',
  'GHOST',
  'SHERIFF',
  'SPECTRE',
  'PHANTOM',
  'VANDAL',
  'OPERATOR',
];

export function computeWeaponDamage(
  weaponId: WeaponId,
  distance: number,
  tier: HitTier,
  isAltFire = false,
  isBackstab = false
): number {
  if (weaponId === 'KNIFE') {
    if (isAltFire) {
      if (isBackstab) return 150;
      return tier === 'HEAD' ? 150 : 75;
    }
    if (isBackstab) return 100;
    return tier === 'HEAD' ? 75 : 50;
  }

  const spec = WEAPON_DATA[weaponId];
  let range = spec.damageRanges[spec.damageRanges.length - 1];
  for (let i = 0; i < spec.damageRanges.length; i++) {
    if (distance <= spec.damageRanges[i].maxDist) {
      range = spec.damageRanges[i];
      break;
    }
  }

  if (tier === 'HEAD') return range.head;
  if (tier === 'TORSO') return range.body;
  return range.leg;
}

export function applyShieldDamage(
  currentHp: number,
  currentShield: number,
  rawDamage: number
): { newHp: number; newShield: number; killed: boolean } {
  let hp = currentHp;
  let shield = currentShield;

  if (shield > 0) {
    const desiredAbsorb = Math.floor(rawDamage * MATCH_CONFIG.SHIELD_ABSORPTION);
    const actualAbsorb = Math.min(shield, desiredAbsorb);
    shield -= actualAbsorb;
    hp -= rawDamage - actualAbsorb;
  } else {
    hp -= rawDamage;
  }

  if (hp <= 0) {
    return { newHp: 0, newShield: shield, killed: true };
  }
  return { newHp: hp, newShield: shield, killed: false };
}
