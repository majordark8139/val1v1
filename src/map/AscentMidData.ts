export type MapMaterialKey =
  | 'MAT_FLOOR_COURTYARD'
  | 'MAT_WALL_ARCHITECTURAL'
  | 'MAT_COVER_TACTICAL'
  | 'MAT_CATWALK_METAL';

export interface MapBrush {
  id: string;
  pos: [number, number, number];
  size: [number, number, number];
  rotY: number;
  mat: MapMaterialKey;
  collidable: boolean;
}

export interface SpawnPoint {
  pos: [number, number, number];
  yaw: number;
}

export const ASCENT_SPAWNS: { ATTACKER: SpawnPoint; DEFENDER: SpawnPoint } = {
  // Attacker faces South (+Z, yaw = Math.PI) toward Top Mid Arch & Courtyard
  ATTACKER: { pos: [0.0, 1.35, -31.0], yaw: Math.PI },
  // Defender faces North (-Z, yaw = 0.0) toward Bottom Mid Arch & Courtyard
  DEFENDER: { pos: [0.0, 0.0, 31.0], yaw: 0.0 },
};

export const BUY_BARRIER_PLANES = {
  ATTACKER_Z: -19.5,
  DEFENDER_Z: 18.5,
} as const;

export const ASCENT_MID_BRUSHES: MapBrush[] = [
  // ================= 1. GROUND PLANES & ELEVATION TIERS =================
  // Mid Courtyard Floor (Top at Y = 0.00m)
  { id: 'floor_courtyard', pos: [1.0, -0.25, -2.0], size: [22.0, 0.5, 32.0], rotY: 0, mat: 'MAT_FLOOR_COURTYARD', collidable: true },
  // Top Mid Floor (Attacker Main, Top at Y = 1.35m)
  { id: 'floor_top_mid', pos: [0.0, 0.55, -26.0], size: [20.0, 1.6, 18.0], rotY: 0, mat: 'MAT_FLOOR_COURTYARD', collidable: true },
  // Top Mid -> Courtyard 4-step ramp (Bridging Z=-17 Y=1.35 down to Z=-13 Y=0.00, 0.27m per step < 0.42m STEP_HEIGHT)
  { id: 'ramp_top_1', pos: [-0.5, 0.54, -16.5], size: [13.0, 1.08, 1.0], rotY: 0, mat: 'MAT_FLOOR_COURTYARD', collidable: true },
  { id: 'ramp_top_2', pos: [-0.5, 0.405, -15.5], size: [13.0, 0.81, 1.0], rotY: 0, mat: 'MAT_FLOOR_COURTYARD', collidable: true },
  { id: 'ramp_top_3', pos: [-0.5, 0.27, -14.5], size: [13.0, 0.54, 1.0], rotY: 0, mat: 'MAT_FLOOR_COURTYARD', collidable: true },
  { id: 'ramp_top_4', pos: [-0.5, 0.135, -13.5], size: [13.0, 0.27, 1.0], rotY: 0, mat: 'MAT_FLOOR_COURTYARD', collidable: true },

  // Catwalk Elevated Walkway (West, Top at Y = 1.35m)
  { id: 'catwalk_north_ramp', pos: [-9.5, 0.675, -15.0], size: [3.6, 1.35, 6.0], rotY: 0, mat: 'MAT_CATWALK_METAL', collidable: true },
  { id: 'catwalk_main', pos: [-9.5, 0.675, -2.0], size: [3.6, 1.35, 20.0], rotY: 0, mat: 'MAT_CATWALK_METAL', collidable: true },
  { id: 'catwalk_parapet', pos: [-7.55, 1.80, -1.0], size: [0.30, 0.90, 14.0], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  { id: 'catwalk_short_a_cubby', pos: [-14.0, 0.675, 6.0], size: [6.0, 1.35, 4.0], rotY: 0, mat: 'MAT_CATWALK_METAL', collidable: true },

  // Bottom Mid & Pizza Alcove (South, Top at Y = 0.00m)
  { id: 'floor_bottom_mid', pos: [0.0, -0.25, 22.0], size: [14.0, 0.5, 18.0], rotY: 0, mat: 'MAT_FLOOR_COURTYARD', collidable: true },
  { id: 'floor_defender_spawn', pos: [0.0, -0.25, 31.0], size: [14.0, 0.5, 9.0], rotY: 0, mat: 'MAT_FLOOR_COURTYARD', collidable: true },
  { id: 'floor_pizza', pos: [-9.0, -0.25, 21.0], size: [6.0, 0.5, 8.0], rotY: 0, mat: 'MAT_FLOOR_COURTYARD', collidable: true },

  // Mid Market Entrance & Interior Hall (East, Top at Y = 0.30m)
  { id: 'market_step', pos: [11.5, 0.15, 6.0], size: [3.0, 0.30, 4.5], rotY: 0, mat: 'MAT_FLOOR_COURTYARD', collidable: true },
  { id: 'market_floor', pos: [17.0, 0.15, 6.0], size: [9.0, 0.30, 12.0], rotY: 0, mat: 'MAT_FLOOR_COURTYARD', collidable: true },

  // ================= 2. PRIMARY STRUCTURAL WALLS & SIGHTLINE BLOCKERS =================
  // Top Mid Attacker Spawn Enclosure
  { id: 'wall_top_back', pos: [0.0, 3.5, -35.0], size: [22.0, 6.0, 1.0], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  { id: 'wall_top_west', pos: [-10.5, 3.5, -26.5], size: [1.0, 6.0, 17.0], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  { id: 'wall_top_east', pos: [10.5, 3.5, -26.5], size: [1.0, 6.0, 17.0], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },

  // Top Mid Arch Divider (6.0m wide x 3.4m tall archway)
  { id: 'arch_top_left', pos: [-5.5, 3.5, -24.0], size: [5.0, 6.0, 1.2], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  { id: 'arch_top_right', pos: [5.5, 3.5, -24.0], size: [5.0, 6.0, 1.2], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  { id: 'arch_top_lintel', pos: [0.0, 5.2, -24.0], size: [6.0, 2.6, 1.2], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },

  // Mid Cubby (North-East Pocket)
  { id: 'wall_cubby_north', pos: [9.0, 3.0, -17.0], size: [4.5, 6.0, 1.0], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  { id: 'wall_cubby_east', pos: [11.0, 3.0, -13.0], size: [1.0, 6.0, 9.0], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  { id: 'wall_cubby_peek', pos: [6.5, 3.0, -8.5], size: [1.5, 6.0, 1.2], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },

  // East Courtyard Wall (North of Market) & Market Doorway Frame (3.4m opening Z in [4.3, 7.7])
  { id: 'wall_east_courtyard', pos: [10.5, 3.0, -2.5], size: [1.0, 6.0, 13.6], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  { id: 'wall_market_south_jamb', pos: [10.5, 3.0, 9.5], size: [1.0, 6.0, 3.6], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  { id: 'wall_market_lintel', pos: [10.5, 4.9, 6.0], size: [1.0, 2.2, 3.4], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  // 50-degree angled inner doorjamb bevels (0.872 rad)
  { id: 'bevel_market_north', pos: [10.8, 3.0, 4.1], size: [0.7, 6.0, 0.7], rotY: 0.872, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  { id: 'bevel_market_south', pos: [10.8, 3.0, 7.9], size: [0.7, 6.0, 0.7], rotY: -0.872, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },

  // Market Interior Enclosure Walls
  { id: 'wall_market_north', pos: [16.5, 3.0, 0.2], size: [11.0, 6.0, 1.0], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  { id: 'wall_market_east', pos: [21.5, 3.0, 6.0], size: [1.0, 6.0, 12.6], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  { id: 'wall_market_south', pos: [16.5, 3.0, 11.8], size: [11.0, 6.0, 1.0], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },

  // Market-to-Bottom-Mid Divider Wall (Mid Link Corner)
  { id: 'wall_mid_link', pos: [7.5, 3.0, 13.0], size: [6.0, 6.0, 3.5], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  { id: 'wall_bottom_east', pos: [7.5, 3.0, 21.0], size: [1.0, 6.0, 13.0], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },

  // West Exterior Boundary Wall (Behind Catwalk & Pizza)
  { id: 'wall_west_catwalk', pos: [-11.8, 3.5, -6.5], size: [1.0, 6.0, 29.0], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  { id: 'wall_short_a_back', pos: [-16.8, 3.5, 6.0], size: [1.0, 6.0, 5.0], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  { id: 'wall_short_a_north', pos: [-14.0, 3.5, 3.5], size: [6.0, 6.0, 1.0], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  { id: 'wall_short_a_south', pos: [-14.0, 3.5, 8.5], size: [6.0, 6.0, 1.0], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  { id: 'wall_west_courtyard_south', pos: [-10.0, 3.0, 12.5], size: [4.5, 6.0, 8.0], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  { id: 'wall_pizza_west', pos: [-12.0, 3.0, 21.0], size: [1.0, 6.0, 9.0], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  { id: 'wall_pizza_south', pos: [-9.0, 3.0, 25.5], size: [7.0, 6.0, 1.0], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },

  // Bottom Mid Archway (Defender Spawn Entrance at Z = 27.0, X in [-2.5, +2.5])
  { id: 'arch_bot_left', pos: [-4.75, 3.0, 27.0], size: [4.5, 6.0, 1.2], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  { id: 'arch_bot_right', pos: [4.75, 3.0, 27.0], size: [4.5, 6.0, 1.2], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  { id: 'arch_bot_lintel', pos: [0.0, 4.7, 27.0], size: [5.0, 2.6, 1.2], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },

  // Defender Spawn Box (Z in [27, 35])
  { id: 'wall_def_back', pos: [0.0, 3.0, 35.0], size: [14.0, 6.0, 1.0], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  { id: 'wall_def_west', pos: [-7.0, 3.0, 31.0], size: [1.0, 6.0, 9.0], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },
  { id: 'wall_def_east', pos: [7.0, 3.0, 31.0], size: [1.0, 6.0, 9.0], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: true },

  // ================= 3. TACTICAL COVER BOXES =================
  // Mid Courtyard Center Pillar / "Mid Box"
  { id: 'cover_mid_box', pos: [-1.2, 1.15, 2.5], size: [2.4, 2.30, 2.4], rotY: 0, mat: 'MAT_COVER_TACTICAL', collidable: true },
  // Courtyard Double Radianite Stack (1.80m Head-Glitch + 0.90m Step-Up)
  { id: 'cover_courtyard_tall', pos: [3.8, 0.90, -2.5], size: [1.6, 1.80, 1.6], rotY: 0, mat: 'MAT_COVER_TACTICAL', collidable: true },
  { id: 'cover_courtyard_step', pos: [3.8, 0.45, -4.1], size: [1.4, 0.90, 1.4], rotY: 0, mat: 'MAT_COVER_TACTICAL', collidable: true },
  // Top Mid Right Boost Box (1.80m + 0.90m step on Top Mid Y=1.35)
  { id: 'cover_top_boost', pos: [-3.8, 2.25, -18.5], size: [1.5, 1.80, 1.5], rotY: 0, mat: 'MAT_COVER_TACTICAL', collidable: true },
  { id: 'cover_top_step', pos: [-5.2, 1.80, -18.5], size: [1.2, 0.90, 1.2], rotY: 0, mat: 'MAT_COVER_TACTICAL', collidable: true },
  // Catwalk Mid Cover Box (0.90m Waist-High on Catwalk Y=1.35)
  { id: 'cover_catwalk_waist', pos: [-8.6, 1.80, -6.5], size: [1.2, 0.90, 1.2], rotY: 0, mat: 'MAT_COVER_TACTICAL', collidable: true },
  // Bottom Mid / Pizza Corner Box (1.80m Head-Glitch rotated 50 deg = 0.872 rad)
  { id: 'cover_pizza_angled', pos: [-4.8, 0.90, 17.5], size: [1.6, 1.80, 1.6], rotY: 0.872, mat: 'MAT_COVER_TACTICAL', collidable: true },
  // Market Interior Stacked Cover (on Market floor Y=0.30)
  { id: 'cover_market_tall', pos: [15.5, 1.20, 4.2], size: [1.5, 1.80, 1.5], rotY: 0, mat: 'MAT_COVER_TACTICAL', collidable: true },
  { id: 'cover_market_low', pos: [15.5, 0.75, 7.8], size: [1.5, 0.90, 1.8], rotY: 0, mat: 'MAT_COVER_TACTICAL', collidable: true },

  // ================= 4. DISTANT ARCHITECTURAL HORIZON SILHOUETTES (NON-COLLIDABLE) =================
  { id: 'vista_belltower_west', pos: [-26.0, 10.0, -8.0], size: [7.0, 20.0, 7.0], rotY: 0.15, mat: 'MAT_WALL_ARCHITECTURAL', collidable: false },
  { id: 'vista_arch_east', pos: [34.0, 7.5, 4.0], size: [8.0, 15.0, 12.0], rotY: -0.1, mat: 'MAT_WALL_ARCHITECTURAL', collidable: false },
  { id: 'vista_north_citadel', pos: [4.0, 9.0, -52.0], size: [26.0, 18.0, 8.0], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: false },
  { id: 'vista_south_villa', pos: [-6.0, 8.0, 50.0], size: [24.0, 16.0, 8.0], rotY: 0, mat: 'MAT_WALL_ARCHITECTURAL', collidable: false },
];
