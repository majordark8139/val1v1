export const PHYSICS = {
  GRAVITY: 21.5,                  // m/s^2 downward acceleration
  JUMP_VELOCITY: 7.45,            // m/s upward impulse (~1.29m jump height)
  STEP_HEIGHT: 0.42,              // Auto-step up stairs/curbs up to 0.42m
  PLAYER_RADIUS: 0.38,            // Cylindrical world collision radius (meters)
  STAND_HEIGHT: 1.96,             // Total model height standing (meters)
  CROUCH_HEIGHT: 1.35,            // Total model height crouched (meters)
  STAND_EYE_HEIGHT: 1.74,         // First-person camera height standing
  CROUCH_EYE_HEIGHT: 1.18,        // First-person camera height crouched
  CROUCH_TRANSITION_SPEED: 11.5,  // Lerp speed between stand and crouch

  SPEED_KNIFE: 6.75,              // m/s
  SPEED_PISTOL: 5.73,             // m/s (Classic, Ghost, Sheriff)
  SPEED_SMG: 5.73,                // m/s (Spectre)
  SPEED_RIFLE: 5.40,              // m/s (Vandal, Phantom)
  SPEED_SNIPER_UNSCOPED: 5.13,    // m/s (Operator unscoped)
  SPEED_SNIPER_SCOPED: 3.65,      // m/s (Operator scoped)
  SPEED_WALK_CAP: 3.00,           // m/s (Shift key held)
  SPEED_CROUCH_CAP: 1.60,         // m/s (Ctrl key held)

  GROUND_ACCEL: 52.0,             // m/s^2 acceleration to target speed
  GROUND_DECEL: 58.0,             // m/s^2 instant stopping deceleration on key release
  AIR_ACCEL: 8.5,                 // Minimal air control
  DEADZONE_RATIO: 0.275,          // 27.5% of weapon max run speed = 100% base accuracy

  TAGGING_SLOW_MULT: 0.30,        // 70% slow penalty (reduces velocity to 30%)
  TAGGING_DURATION: 0.75,         // Seconds to linearly recover from tagging slow
} as const;

export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;

export const CAMERA_CONFIG = {
  DEFAULT_VFOV: 70.53,            // 103 deg HFOV on 16:9
  ADS_SMG_VFOV: 63.1,             // 1.15x zoom
  ADS_RIFLE_VFOV: 59.1,           // 1.25x zoom
  SCOPE_25X_VFOV: 31.4,           // 2.5x Operator zoom
  SCOPE_50X_VFOV: 16.1,           // 5.0x Operator zoom
  VALORANT_YAW_MULT: 0.07,        // deg per pixel * sensitivity
} as const;

export const MATCH_CONFIG = {
  BUY_PHASE_TIME: 15.0,
  COMBAT_PHASE_TIME: 100.0,
  POST_ROUND_TIME: 4.0,
  START_CREDITS: 800,
  MAX_CREDITS: 9000,
  WIN_CREDITS: 3000,
  LOSS_STREAK_CREDITS: [1900, 2400, 2900] as const,
  KILL_CREDITS: 200,
  LIGHT_SHIELD_COST: 400,
  LIGHT_SHIELD_AMOUNT: 25,
  HEAVY_SHIELD_COST: 1000,
  HEAVY_SHIELD_AMOUNT: 50,
  SHIELD_ABSORPTION: 0.66,
} as const;

export const ROOM_CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PEER_ID_PREFIX = 'ascent-tac-1v1-';
export const SETTINGS_STORAGE_KEY = 'ascent_1v1_settings';

export type CrosshairColor = '#00f5d4' | '#39ff14' | '#ffffff' | '#ffe600' | '#ff4dff' | '#ff2a2a';

export interface CrosshairSettings {
  color: CrosshairColor | string;
  length: number;
  thickness: number;
  gap: number;
  outline: boolean;
  centerDot: boolean;
  dynamicError: boolean;
}

export type BotDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface BotDifficultyProfile {
  label: string;
  reactionSec: number;
  yawLerpRate: number;
  aimJitter: number;
  aimChestOffset: number;
  burstLimit: number;
  burstCooldown: number;
  maxBuyTier: 'SMG' | 'RIFLE' | 'SNIPER';
}

export const BOT_DIFFICULTY_PROFILES: Record<BotDifficulty, BotDifficultyProfile> = {
  EASY: {
    label: 'Easy',
    reactionSec: 0.92,
    yawLerpRate: 4.5,
    aimJitter: 0.165,
    aimChestOffset: 0.34,
    burstLimit: 2,
    burstCooldown: 1.15,
    maxBuyTier: 'SMG',
  },
  MEDIUM: {
    label: 'Medium',
    reactionSec: 0.58,
    yawLerpRate: 7.4,
    aimJitter: 0.092,
    aimChestOffset: 0.24,
    burstLimit: 2,
    burstCooldown: 0.80,
    maxBuyTier: 'RIFLE',
  },
  HARD: {
    label: 'Hard',
    reactionSec: 0.28,
    yawLerpRate: 12.0,
    aimJitter: 0.032,
    aimChestOffset: 0.08,
    burstLimit: 3,
    burstCooldown: 0.45,
    maxBuyTier: 'SNIPER',
  },
};

export interface PlayerSettings {
  sensitivity: number;
  dpi: number;
  autoRescope: boolean;
  muted: boolean;
  botDifficulty: BotDifficulty;
  crosshair: CrosshairSettings;
}

export const DEFAULT_SETTINGS: PlayerSettings = {
  sensitivity: 0.35,
  dpi: 800,
  autoRescope: true,
  muted: false,
  botDifficulty: 'MEDIUM',
  crosshair: {
    color: '#00f5d4',
    length: 6,
    thickness: 2,
    gap: 3,
    outline: true,
    centerDot: false,
    dynamicError: true,
  },
};

export function calculateEDPI(dpi: number, sensitivity: number): number {
  return Math.round(dpi * sensitivity);
}

export function calculateCmPer360(dpi: number, sensitivity: number): number {
  const edpi = dpi * sensitivity;
  if (edpi <= 0) return 0;
  return (360 / (edpi * CAMERA_CONFIG.VALORANT_YAW_MULT)) * 2.54;
}
