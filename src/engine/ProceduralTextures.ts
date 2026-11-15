import * as THREE from 'three';

export interface ProceduralMaterialSet {
  MAT_FLOOR_COURTYARD: THREE.MeshLambertMaterial;
  MAT_WALL_ARCHITECTURAL: THREE.MeshLambertMaterial;
  MAT_COVER_TACTICAL: THREE.MeshLambertMaterial;
  MAT_CATWALK_METAL: THREE.MeshLambertMaterial;
  MAT_BARRIER_SPAWN: THREE.MeshBasicMaterial;
  textures: THREE.CanvasTexture[];
  dispose: () => void;
}

export function createGridTexture(
  baseHex: string,
  lineHex: string,
  subLineHex: string,
  borderHex?: string
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  // 0.25-meter subdivisions (4x4 per 1m tile = 64px intervals)
  ctx.strokeStyle = subLineHex;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    const p = i * 64 + 0.5;
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
  }
  ctx.stroke();

  // 1-meter major grid lines (2px wide)
  ctx.strokeStyle = lineHex;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);

  if (borderHex) {
    ctx.strokeStyle = borderHex;
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, size - 16, size - 16);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipMapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createBarrierTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(0, 200, 230, 0.25)';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(0, 245, 212, 0.85)';
  ctx.lineWidth = 2;
  for (let i = -size; i < size * 2; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 2);
  texture.needsUpdate = true;
  return texture;
}

export function createProceduralMaterials(): ProceduralMaterialSet {
  const floorTex = createGridTexture('#7b8288', '#5d6368', '#6c7379');
  const wallTex = createGridTexture('#d5d0c5', '#b5afa2', '#c5bfb3');
  const coverTex = createGridTexture('#2b5b54', '#1f453f', '#25504a', '#d4a359');
  const catwalkTex = createGridTexture('#4a525d', '#313740', '#3d4550');
  const barrierTex = createBarrierTexture();

  const MAT_FLOOR_COURTYARD = new THREE.MeshLambertMaterial({ map: floorTex });
  const MAT_WALL_ARCHITECTURAL = new THREE.MeshLambertMaterial({ map: wallTex });
  const MAT_COVER_TACTICAL = new THREE.MeshLambertMaterial({ map: coverTex });
  const MAT_CATWALK_METAL = new THREE.MeshLambertMaterial({ map: catwalkTex });
  const MAT_BARRIER_SPAWN = new THREE.MeshBasicMaterial({
    map: barrierTex,
    color: 0x00f5d4,
    transparent: true,
    opacity: 0.38,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const textures = [floorTex, wallTex, coverTex, catwalkTex, barrierTex];

  return {
    MAT_FLOOR_COURTYARD,
    MAT_WALL_ARCHITECTURAL,
    MAT_COVER_TACTICAL,
    MAT_CATWALK_METAL,
    MAT_BARRIER_SPAWN,
    textures,
    dispose: () => {
      for (const tex of textures) tex.dispose();
      MAT_FLOOR_COURTYARD.dispose();
      MAT_WALL_ARCHITECTURAL.dispose();
      MAT_COVER_TACTICAL.dispose();
      MAT_CATWALK_METAL.dispose();
      MAT_BARRIER_SPAWN.dispose();
    },
  };
}
