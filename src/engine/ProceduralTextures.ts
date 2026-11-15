import * as THREE from 'three';

export interface ProceduralMaterialSet {
  MAT_FLOOR_COURTYARD: THREE.MeshLambertMaterial;
  MAT_WALL_ARCHITECTURAL: THREE.MeshLambertMaterial;
  MAT_COVER_TACTICAL: THREE.MeshLambertMaterial;
  MAT_CATWALK_METAL: THREE.MeshLambertMaterial;
  MAT_TERRACOTTA_ROOF: THREE.MeshLambertMaterial;
  MAT_WOOD_TRIM: THREE.MeshLambertMaterial;
  MAT_STONE_TRIM: THREE.MeshLambertMaterial;
  MAT_FOLIAGE: THREE.MeshLambertMaterial;
  MAT_LANTERN_GLOW: THREE.MeshBasicMaterial;
  MAT_BARRIER_SPAWN: THREE.MeshBasicMaterial;
  textures: THREE.CanvasTexture[];
  dispose: () => void;
}

function createCleanFloorTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Smooth matte clay stone slab with subtle low-contrast joint seams for speed clarity
  ctx.fillStyle = '#c4c7ce';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(72, 78, 88, 0.16)';
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
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.34)');
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
  const srgb = (hex: number) => new THREE.Color(hex).convertSRGBToLinear();

  // Ultra-fast Lambert matte clay palette (Blender Workbench / Solid Clay aesthetic)
  const MAT_FLOOR_COURTYARD = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    map: floorTex,
  });

  const MAT_WALL_ARCHITECTURAL = new THREE.MeshLambertMaterial({
    color: srgb(0xdcdad6),
  });

  const MAT_COVER_TACTICAL = new THREE.MeshLambertMaterial({
    color: srgb(0x767d88),
  });

  const MAT_CATWALK_METAL = new THREE.MeshLambertMaterial({
    color: srgb(0x5b626e),
  });

  const MAT_TERRACOTTA_ROOF = new THREE.MeshLambertMaterial({
    color: srgb(0x9a9590),
  });

  const MAT_WOOD_TRIM = new THREE.MeshLambertMaterial({
    color: srgb(0x4b5059),
  });

  const MAT_STONE_TRIM = new THREE.MeshLambertMaterial({
    color: srgb(0xb2b5bc),
  });

  const MAT_FOLIAGE = new THREE.MeshLambertMaterial({
    color: srgb(0x9ea5a0),
  });

  const MAT_LANTERN_GLOW = new THREE.MeshBasicMaterial({
    color: srgb(0xf2efe9),
  });

  const MAT_BARRIER_SPAWN = new THREE.MeshBasicMaterial({
    map: barrierTex,
    color: 0x00f5d4,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const textures = [floorTex, barrierTex];

  return {
    MAT_FLOOR_COURTYARD,
    MAT_WALL_ARCHITECTURAL,
    MAT_COVER_TACTICAL,
    MAT_CATWALK_METAL,
    MAT_TERRACOTTA_ROOF,
    MAT_WOOD_TRIM,
    MAT_STONE_TRIM,
    MAT_FOLIAGE,
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
      MAT_LANTERN_GLOW.dispose();
      MAT_BARRIER_SPAWN.dispose();
    },
  };
}
