import * as THREE from 'three';

export interface ProceduralMaterialSet {
  MAT_FLOOR_COURTYARD: THREE.MeshStandardMaterial;
  MAT_WALL_ARCHITECTURAL: THREE.MeshStandardMaterial;
  MAT_COVER_TACTICAL: THREE.MeshStandardMaterial;
  MAT_CATWALK_METAL: THREE.MeshStandardMaterial;
  MAT_TERRACOTTA_ROOF: THREE.MeshStandardMaterial;
  MAT_WOOD_TRIM: THREE.MeshStandardMaterial;
  MAT_STONE_TRIM: THREE.MeshStandardMaterial;
  MAT_FOLIAGE: THREE.MeshStandardMaterial;
  MAT_LANTERN_GLOW: THREE.MeshBasicMaterial;
  MAT_BARRIER_SPAWN: THREE.MeshBasicMaterial;
  textures: THREE.CanvasTexture[];
  dispose: () => void;
}

function seededRand(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  if (isColor) {
    tex.encoding = THREE.sRGBEncoding;
  }
  tex.needsUpdate = true;
  return tex;
}

function createCobblestoneTextures(maxAniso: number): {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
} {
  const size = 256;
  const col = document.createElement('canvas');
  const bmp = document.createElement('canvas');
  col.width = bmp.width = size;
  col.height = bmp.height = size;
  const cCtx = col.getContext('2d')!;
  const bCtx = bmp.getContext('2d')!;
  const rand = seededRand(101);

  // Mortar bed
  cCtx.fillStyle = '#4e545c';
  cCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#303030';
  bCtx.fillRect(0, 0, size, size);

  const rows = 4;
  const cols = 4;
  const cellW = size / cols;
  const cellH = size / rows;

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (cellW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * cellW + offset + 3;
      const y = r * cellH + 3;
      const w = cellW - 6;
      const h = cellH - 6;
      const shade = 112 + Math.floor(rand() * 24);
      const warm = Math.floor(rand() * 10);
      cCtx.fillStyle = `rgb(${shade + warm}, ${shade + 2}, ${shade - 4})`;
      cCtx.fillRect(x, y, w, h);

      // Subtle bevel highlight & shadow on stone
      cCtx.fillStyle = 'rgba(255,250,240,0.12)';
      cCtx.fillRect(x, y, w, 3);
      cCtx.fillStyle = 'rgba(0,0,0,0.16)';
      cCtx.fillRect(x, y + h - 3, w, 3);

      const bVal = 175 + Math.floor(rand() * 55);
      bCtx.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
      bCtx.fillRect(x, y, w, h);
    }
  }

  // Fine mineral grain
  for (let i = 0; i < 900; i++) {
    const gx = rand() * size;
    const gy = rand() * size;
    const alpha = 0.04 + rand() * 0.05;
    cCtx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(20,24,28,${alpha})`;
    cCtx.fillRect(gx, gy, 2, 2);
  }

  return {
    map: finalizeTexture(col, true, maxAniso),
    bump: finalizeTexture(bmp, false, maxAniso),
  };
}

function createVenetianPlasterTextures(maxAniso: number): {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
} {
  const size = 256;
  const col = document.createElement('canvas');
  const bmp = document.createElement('canvas');
  col.width = bmp.width = size;
  col.height = bmp.height = size;
  const cCtx = col.getContext('2d')!;
  const bCtx = bmp.getContext('2d')!;
  const rand = seededRand(202);

  // Warm Mediterranean limestone & stucco base
  cCtx.fillStyle = '#c2ae8e';
  cCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#969696';
  bCtx.fillRect(0, 0, size, size);

  // Subtle horizontal ashlar stone bands & stucco patches
  for (let i = 0; i < 42; i++) {
    const px = rand() * size;
    const py = rand() * size;
    const rw = 24 + rand() * 56;
    const rh = 18 + rand() * 44;
    const delta = Math.floor((rand() - 0.5) * 18);
    cCtx.fillStyle = `rgba(${200 + delta}, ${184 + delta}, ${156 + delta}, 0.42)`;
    cCtx.fillRect(px, py, rw, rh);
    const bv = 135 + Math.floor((rand() - 0.5) * 45);
    bCtx.fillStyle = `rgba(${bv},${bv},${bv},0.35)`;
    bCtx.fillRect(px, py, rw, rh);
  }

  // Subtle ashlar horizontal course seams (every 0.5m)
  cCtx.strokeStyle = 'rgba(130, 114, 92, 0.25)';
  cCtx.lineWidth = 2;
  bCtx.strokeStyle = 'rgba(70, 70, 70, 0.5)';
  bCtx.lineWidth = 2;
  for (let y = 64; y < size; y += 64) {
    cCtx.beginPath();
    cCtx.moveTo(0, y);
    cCtx.lineTo(size, y);
    cCtx.stroke();
    bCtx.beginPath();
    bCtx.moveTo(0, y);
    bCtx.lineTo(size, y);
    bCtx.stroke();
  }

  // Warm plaster speckle
  for (let i = 0; i < 1100; i++) {
    const gx = rand() * size;
    const gy = rand() * size;
    cCtx.fillStyle = rand() > 0.5 ? 'rgba(255,250,242,0.08)' : 'rgba(95,82,66,0.08)';
    cCtx.fillRect(gx, gy, 2, 2);
  }

  return {
    map: finalizeTexture(col, true, maxAniso),
    bump: finalizeTexture(bmp, false, maxAniso),
  };
}

function createRadianiteCrateTextures(maxAniso: number): {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
} {
  const size = 256;
  const col = document.createElement('canvas');
  const bmp = document.createElement('canvas');
  col.width = bmp.width = size;
  col.height = bmp.height = size;
  const cCtx = col.getContext('2d')!;
  const bCtx = bmp.getContext('2d')!;

  // Deep Kingdom teal-slate armor body
  cCtx.fillStyle = '#1f4947';
  cCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#888888';
  bCtx.fillRect(0, 0, size, size);

  // Recessed inner armor panel
  cCtx.fillStyle = '#183a39';
  cCtx.fillRect(26, 26, size - 52, size - 52);
  bCtx.fillStyle = '#686868';
  bCtx.fillRect(26, 26, size - 52, size - 52);

  // Diagonal structural ribs
  cCtx.strokeStyle = '#285e5a';
  cCtx.lineWidth = 10;
  bCtx.strokeStyle = '#c0c0c0';
  bCtx.lineWidth = 10;
  cCtx.beginPath();
  cCtx.moveTo(28, 28);
  cCtx.lineTo(size - 28, size - 28);
  cCtx.moveTo(size - 28, 28);
  cCtx.lineTo(28, size - 28);
  cCtx.stroke();
  bCtx.beginPath();
  bCtx.moveTo(28, 28);
  bCtx.lineTo(size - 28, size - 28);
  bCtx.moveTo(size - 28, 28);
  bCtx.lineTo(28, size - 28);
  bCtx.stroke();

  // Outer metallic brass/gold chamfer border
  cCtx.strokeStyle = '#c89b4b';
  cCtx.lineWidth = 10;
  cCtx.strokeRect(10, 10, size - 20, size - 20);
  bCtx.strokeStyle = '#e5e5e5';
  bCtx.lineWidth = 10;
  bCtx.strokeRect(10, 10, size - 20, size - 20);

  // Corner bolts + Kingdom Radianite emblem diamond
  const corners = [
    [22, 22],
    [size - 22, 22],
    [22, size - 22],
    [size - 22, size - 22],
  ];
  for (const [cx, cy] of corners) {
    cCtx.fillStyle = '#e6c37a';
    cCtx.beginPath();
    cCtx.arc(cx, cy, 5, 0, Math.PI * 2);
    cCtx.fill();
    bCtx.fillStyle = '#ffffff';
    bCtx.beginPath();
    bCtx.arc(cx, cy, 5, 0, Math.PI * 2);
    bCtx.fill();
  }

  // Center Kingdom diamond badge
  cCtx.fillStyle = '#00d9be';
  cCtx.beginPath();
  cCtx.moveTo(128, 104);
  cCtx.lineTo(150, 128);
  cCtx.lineTo(128, 152);
  cCtx.lineTo(106, 128);
  cCtx.closePath();
  cCtx.fill();
  cCtx.strokeStyle = '#e6c37a';
  cCtx.lineWidth = 3;
  cCtx.stroke();

  return {
    map: finalizeTexture(col, true, maxAniso),
    bump: finalizeTexture(bmp, false, maxAniso),
  };
}

function createCatwalkMetalTextures(maxAniso: number): {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
} {
  const size = 256;
  const col = document.createElement('canvas');
  const bmp = document.createElement('canvas');
  col.width = bmp.width = size;
  col.height = bmp.height = size;
  const cCtx = col.getContext('2d')!;
  const bCtx = bmp.getContext('2d')!;

  cCtx.fillStyle = '#404854';
  cCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#606060';
  bCtx.fillRect(0, 0, size, size);

  // Panel seam
  cCtx.strokeStyle = '#262b33';
  cCtx.lineWidth = 4;
  cCtx.strokeRect(2, 2, size - 4, size - 4);
  bCtx.strokeStyle = '#303030';
  bCtx.lineWidth = 4;
  bCtx.strokeRect(2, 2, size - 4, size - 4);

  // Diamond plate tread ribs
  cCtx.strokeStyle = '#586270';
  cCtx.lineWidth = 3;
  bCtx.strokeStyle = '#d8d8d8';
  bCtx.lineWidth = 3;
  for (let y = 16; y < size; y += 32) {
    for (let x = 16; x < size; x += 32) {
      const flip = ((x + y) / 32) % 2 === 0;
      cCtx.beginPath();
      bCtx.beginPath();
      if (flip) {
        cCtx.moveTo(x - 6, y - 6);
        cCtx.lineTo(x + 6, y + 6);
        bCtx.moveTo(x - 6, y - 6);
        bCtx.lineTo(x + 6, y + 6);
      } else {
        cCtx.moveTo(x + 6, y - 6);
        cCtx.lineTo(x - 6, y + 6);
        bCtx.moveTo(x + 6, y - 6);
        bCtx.lineTo(x - 6, y + 6);
      }
      cCtx.stroke();
      bCtx.stroke();
    }
  }

  return {
    map: finalizeTexture(col, true, maxAniso),
    bump: finalizeTexture(bmp, false, maxAniso),
  };
}

function createTerracottaTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 256;
  const col = document.createElement('canvas');
  col.width = col.height = size;
  const ctx = col.getContext('2d')!;
  const rand = seededRand(303);

  ctx.fillStyle = '#a84b34';
  ctx.fillRect(0, 0, size, size);

  const cols = 8;
  const rows = 4;
  const w = size / cols;
  const h = size / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * w;
      const y = r * h;
      const shade = Math.floor((rand() - 0.5) * 26);
      ctx.fillStyle = `rgb(${172 + shade}, ${76 + Math.floor(shade * 0.5)}, ${52 + Math.floor(shade * 0.4)})`;
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
      // Curved barrel highlight
      ctx.fillStyle = 'rgba(255,215,180,0.16)';
      ctx.fillRect(x + 5, y + 2, w * 0.35, h - 4);
      // Overlap shadow
      ctx.fillStyle = 'rgba(35,12,8,0.28)';
      ctx.fillRect(x, y + h - 4, w, 4);
    }
  }
  return finalizeTexture(col, true, maxAniso);
}

function createBarrierTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, 'rgba(0, 245, 212, 0.02)');
  grad.addColorStop(0.55, 'rgba(0, 245, 212, 0.14)');
  grad.addColorStop(1, 'rgba(0, 245, 212, 0.28)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Subtle horizontal energy scanlines instead of distracting full-screen zebra stripes
  ctx.strokeStyle = 'rgba(180, 255, 248, 0.22)';
  ctx.lineWidth = 1;
  for (let y = 16; y < size; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  return finalizeTexture(canvas, true, maxAniso, 6, 1);
}

export function createProceduralMaterials(maxAniso = 4): ProceduralMaterialSet {
  const floor = createCobblestoneTextures(maxAniso);
  const wall = createVenetianPlasterTextures(maxAniso);
  const cover = createRadianiteCrateTextures(maxAniso);
  const catwalk = createCatwalkMetalTextures(maxAniso);
  const terracotta = createTerracottaTexture(maxAniso);
  const barrierTex = createBarrierTexture(maxAniso);

  const srgb = (hex: number) => new THREE.Color(hex).convertSRGBToLinear();

  const MAT_FLOOR_COURTYARD = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: floor.map,
    bumpMap: floor.bump,
    bumpScale: 0.035,
    roughness: 0.88,
    metalness: 0.02,
    envMapIntensity: 0.35,
  });

  const MAT_WALL_ARCHITECTURAL = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: wall.map,
    bumpMap: wall.bump,
    bumpScale: 0.028,
    roughness: 0.9,
    metalness: 0.02,
    envMapIntensity: 0.35,
  });

  const MAT_COVER_TACTICAL = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: cover.map,
    bumpMap: cover.bump,
    bumpScale: 0.04,
    roughness: 0.45,
    metalness: 0.36,
    envMapIntensity: 0.75,
  });

  const MAT_CATWALK_METAL = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: catwalk.map,
    bumpMap: catwalk.bump,
    bumpScale: 0.03,
    roughness: 0.42,
    metalness: 0.62,
    envMapIntensity: 0.8,
  });

  const MAT_TERRACOTTA_ROOF = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: terracotta,
    roughness: 0.8,
    metalness: 0.04,
    envMapIntensity: 0.35,
  });

  const MAT_WOOD_TRIM = new THREE.MeshStandardMaterial({
    color: srgb(0x633f26),
    roughness: 0.82,
    metalness: 0.04,
    envMapIntensity: 0.3,
  });

  const MAT_STONE_TRIM = new THREE.MeshStandardMaterial({
    color: srgb(0x8a765c),
    bumpMap: wall.bump,
    bumpScale: 0.032,
    roughness: 0.92,
    metalness: 0.02,
    envMapIntensity: 0.3,
  });

  const MAT_FOLIAGE = new THREE.MeshStandardMaterial({
    color: srgb(0x2f6338),
    roughness: 0.88,
    metalness: 0.02,
    envMapIntensity: 0.25,
  });

  const MAT_LANTERN_GLOW = new THREE.MeshBasicMaterial({
    color: srgb(0xffcf82),
  });

  const MAT_BARRIER_SPAWN = new THREE.MeshBasicMaterial({
    map: barrierTex,
    color: 0x00f5d4,
    transparent: true,
    opacity: 0.34,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const textures = [
    floor.map,
    floor.bump,
    wall.map,
    wall.bump,
    cover.map,
    cover.bump,
    catwalk.map,
    catwalk.bump,
    terracotta,
    barrierTex,
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
