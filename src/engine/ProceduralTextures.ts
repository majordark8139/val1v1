import * as THREE from 'three';

export interface ProceduralMaterialSet {
  MAT_FLOOR_COURTYARD: THREE.MeshMatcapMaterial;
  MAT_WALL_ARCHITECTURAL: THREE.MeshMatcapMaterial;
  MAT_COVER_TACTICAL: THREE.MeshMatcapMaterial;
  MAT_CATWALK_METAL: THREE.MeshMatcapMaterial;
  MAT_TERRACOTTA_ROOF: THREE.MeshMatcapMaterial;
  MAT_WOOD_TRIM: THREE.MeshMatcapMaterial;
  MAT_STONE_TRIM: THREE.MeshMatcapMaterial;
  MAT_FOLIAGE: THREE.MeshMatcapMaterial;
  MAT_CAVITY_EDGES: THREE.LineBasicMaterial;
  MAT_LANTERN_GLOW: THREE.MeshBasicMaterial;
  MAT_BARRIER_SPAWN: THREE.MeshBasicMaterial;
  textures: THREE.Texture[];
  dispose: () => void;
}

export interface StudioMatcapOptions {
  highlight: string;
  midtone: string;
  shadow: string;
  rim?: string;
  rimStrength?: number;
  specular?: number;
}

/**
 * Generates a 128x128 Blender Workbench-style studio MatCap sphere texture.
 * Single texture lookup per fragment (zero dynamic lights evaluated per pixel)
 * for locked 60-240 FPS even on integrated laptop GPUs while delivering crisp
 * sculptural clay shading across every bevel and architectural contour.
 */
export function createStudioMatcapTexture(opts: StudioMatcapOptions): THREE.Texture {
  if (typeof document === 'undefined') {
    const data = new Uint8Array([160, 160, 160, 255]);
    const fallback = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    fallback.needsUpdate = true;
    return fallback;
  }

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size * 0.5;
  const cy = size * 0.5;
  const r = size * 0.5;

  // Base ambient underside fill
  ctx.fillStyle = opts.shadow;
  ctx.fillRect(0, 0, size, size);

  // Studio key-light clay gradient (upper-left softbox matching Blender Studio Light)
  const keyGrad = ctx.createRadialGradient(
    cx - r * 0.28,
    cy - r * 0.34,
    r * 0.04,
    cx,
    cy,
    r * 1.04
  );
  keyGrad.addColorStop(0.0, opts.highlight);
  keyGrad.addColorStop(0.46, opts.midtone);
  keyGrad.addColorStop(0.84, opts.shadow);
  keyGrad.addColorStop(1.0, opts.shadow);
  ctx.fillStyle = keyGrad;
  ctx.fillRect(0, 0, size, size);

  // Subtle top-right cool studio rim bounce
  const bounceGrad = ctx.createRadialGradient(
    cx + r * 0.55,
    cy - r * 0.35,
    r * 0.05,
    cx + r * 0.45,
    cy - r * 0.25,
    r * 0.65
  );
  bounceGrad.addColorStop(0.0, 'rgba(220, 232, 248, 0.16)');
  bounceGrad.addColorStop(1.0, 'rgba(220, 232, 248, 0.0)');
  ctx.fillStyle = bounceGrad;
  ctx.fillRect(0, 0, size, size);

  // Optional soft specular sheen (for satin metal/polymer clay)
  if (opts.specular && opts.specular > 0) {
    const specGrad = ctx.createRadialGradient(
      cx - r * 0.30,
      cy - r * 0.36,
      0,
      cx - r * 0.30,
      cy - r * 0.36,
      r * 0.34
    );
    specGrad.addColorStop(0.0, `rgba(255, 255, 255, ${opts.specular})`);
    specGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = specGrad;
    ctx.fillRect(0, 0, size, size);
  }

  // Optional Fresnel edge rim (used on enemy silhouette for instant Valorant-style readability)
  if (opts.rim) {
    const strength = opts.rimStrength ?? 0.65;
    const rimGrad = ctx.createRadialGradient(cx, cy, r * 0.66, cx, cy, r * 0.99);
    rimGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0)');
    rimGrad.addColorStop(0.62, 'rgba(0, 0, 0, 0)');
    rimGrad.addColorStop(0.88, opts.rim);
    rimGrad.addColorStop(1.0, opts.rim);
    ctx.save();
    ctx.globalAlpha = strength;
    ctx.fillStyle = rimGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function createCleanFloorTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Neutral matte clay slab tile (slightly darker than walls for clean value separation)
  ctx.fillStyle = '#e5e7ec';
  ctx.fillRect(0, 0, size, size);

  // Subtle architectural stone slab variation (no noisy grain)
  ctx.fillStyle = 'rgba(195, 200, 208, 0.22)';
  ctx.fillRect(0, 0, size * 0.5, size * 0.5);
  ctx.fillRect(size * 0.5, size * 0.5, size * 0.5, size * 0.5);

  // Crisp subtle joint seams for movement speed reference
  ctx.strokeStyle = 'rgba(72, 78, 90, 0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  ctx.beginPath();
  ctx.moveTo(0, size * 0.5);
  ctx.lineTo(size, size * 0.5);
  ctx.moveTo(size * 0.5, 0);
  ctx.lineTo(size * 0.5, size);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  tex.anisotropy = Math.min(4, maxAniso);
  tex.encoding = THREE.sRGBEncoding;
  tex.needsUpdate = true;
  return tex;
}

function createMinimalBarrierTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
  grad.addColorStop(0.75, 'rgba(255, 255, 255, 0.14)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.36)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = Math.min(4, maxAniso);
  tex.encoding = THREE.sRGBEncoding;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralMaterials(maxAniso = 4): ProceduralMaterialSet {
  const floorTex = createCleanFloorTexture(maxAniso);
  const barrierTex = createMinimalBarrierTexture(maxAniso);

  // Calibrated Blender Workbench Studio Clay MatCaps (4 crisp value bands, zero color clutter)
  const matcapWall = createStudioMatcapTexture({
    highlight: '#e4e2dc',
    midtone: '#c8c6c0',
    shadow: '#8e9096',
    specular: 0.05,
  });
  const matcapFloor = createStudioMatcapTexture({
    highlight: '#c7cbd2',
    midtone: '#a6acb6',
    shadow: '#767c88',
    specular: 0.04,
  });
  const matcapCover = createStudioMatcapTexture({
    highlight: '#7d8594',
    midtone: '#5b6372',
    shadow: '#383f4c',
    specular: 0.12,
  });
  const matcapMetal = createStudioMatcapTexture({
    highlight: '#68717f',
    midtone: '#474f5c',
    shadow: '#272c36',
    specular: 0.18,
  });
  const matcapStone = createStudioMatcapTexture({
    highlight: '#c9c8c4',
    midtone: '#a9a9a6',
    shadow: '#787a80',
    specular: 0.06,
  });
  const matcapRoof = createStudioMatcapTexture({
    highlight: '#b4afa8',
    midtone: '#8f8b85',
    shadow: '#5e5c5a',
    specular: 0.06,
  });
  const matcapWood = createStudioMatcapTexture({
    highlight: '#6d6f75',
    midtone: '#4d5058',
    shadow: '#2e3138',
    specular: 0.08,
  });
  const matcapFoliage = createStudioMatcapTexture({
    highlight: '#aeb5b0',
    midtone: '#8a928e',
    shadow: '#5c6460',
    specular: 0.04,
  });

  const MAT_FLOOR_COURTYARD = new THREE.MeshMatcapMaterial({
    matcap: matcapFloor,
    map: floorTex,
  });

  const MAT_WALL_ARCHITECTURAL = new THREE.MeshMatcapMaterial({
    matcap: matcapWall,
  });

  const MAT_COVER_TACTICAL = new THREE.MeshMatcapMaterial({
    matcap: matcapCover,
  });

  const MAT_CATWALK_METAL = new THREE.MeshMatcapMaterial({
    matcap: matcapMetal,
  });

  const MAT_TERRACOTTA_ROOF = new THREE.MeshMatcapMaterial({
    matcap: matcapRoof,
  });

  const MAT_WOOD_TRIM = new THREE.MeshMatcapMaterial({
    matcap: matcapWood,
  });

  const MAT_STONE_TRIM = new THREE.MeshMatcapMaterial({
    matcap: matcapStone,
  });

  const MAT_FOLIAGE = new THREE.MeshMatcapMaterial({
    matcap: matcapFoliage,
  });

  // Subtle Blender Workbench Cavity crease edge overlay (single merged LineSegments draw call)
  const MAT_CAVITY_EDGES = new THREE.LineBasicMaterial({
    color: 0x2a2f3a,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });

  const MAT_LANTERN_GLOW = new THREE.MeshBasicMaterial({
    color: 0xf4f1ea,
  });

  const MAT_BARRIER_SPAWN = new THREE.MeshBasicMaterial({
    map: barrierTex,
    color: 0x00f5d4,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const textures = [
    floorTex,
    barrierTex,
    matcapWall,
    matcapFloor,
    matcapCover,
    matcapMetal,
    matcapStone,
    matcapRoof,
    matcapWood,
    matcapFoliage,
  ];

  return {
    MAT_FLOOR_COURTYARD,
    MAT_WALL_ARCHITECTURAL,
    MAT_COVER_TACTICAL,
    MAT_CATWALK_METAL,
    MAT_TERRACOTTA_ROOF,
    MAT_WOOD_TRIM,
    MAT_STONE_TRIM,
    MAT_FOLIAGE,
    MAT_CAVITY_EDGES,
    MAT_LANTERN_GLOW,
    MAT_BARRIER_SPAWN,
    textures,
    dispose: () => {
      for (const tex of textures) tex.dispose();
      MAT_FLOOR_COURTYARD.dispose();
      MAT_WALL_ARCHITECTURAL.dispose();
      MAT_COVER_TACTICAL.dispose();
      MAT_CATWALK_METAL.dispose();
      MAT_TERRACOTTA_ROOF.dispose();
      MAT_WOOD_TRIM.dispose();
      MAT_STONE_TRIM.dispose();
      MAT_FOLIAGE.dispose();
      MAT_CAVITY_EDGES.dispose();
      MAT_LANTERN_GLOW.dispose();
      MAT_BARRIER_SPAWN.dispose();
    },
  };
}
