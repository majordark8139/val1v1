import * as THREE from 'three';

export interface ProceduralMaterialSet {
  MAT_FLOOR_COURTYARD: THREE.MeshBasicMaterial;
  MAT_WALL_ARCHITECTURAL: THREE.MeshBasicMaterial;
  MAT_COVER_TACTICAL: THREE.MeshBasicMaterial;
  MAT_CATWALK_METAL: THREE.MeshBasicMaterial;
  MAT_BOX_OUTLINE: THREE.LineBasicMaterial;
  MAT_BARRIER_ATK: THREE.MeshBasicMaterial;
  MAT_BARRIER_DEF: THREE.MeshBasicMaterial;
  dispose: () => void;
}

/**
 * Pure Unlit Flat Ascent Palette (Zero Lighting, Zero Reflections, Zero Shadows).
 * Every material is a single flat-color MeshBasicMaterial paired with thin dark box outlines
 * for locked high FPS on any GPU and crisp competitive target visibility.
 */
export function createProceduralMaterials(_maxAnisotropy = 1): ProceduralMaterialSet {
  // Ascent Flat Palette:
  // - Warm Sand Walls (#dfd2bc)
  // - Cool Slate Courtyard Floor (#5c6878)
  // - Iconic Ascent Teal Radianite Cover Crates (#358b88)
  // - Charcoal-Slate Catwalk Metal (#46505e)
  // - Crisp Thin Dark Box Outlines (#1e242d)
  const MAT_FLOOR_COURTYARD = new THREE.MeshBasicMaterial({
    color: 0x5c6878,
  });

  const MAT_WALL_ARCHITECTURAL = new THREE.MeshBasicMaterial({
    color: 0xdfd2bc,
  });

  const MAT_COVER_TACTICAL = new THREE.MeshBasicMaterial({
    color: 0x358b88,
  });

  const MAT_CATWALK_METAL = new THREE.MeshBasicMaterial({
    color: 0x46505e,
  });

  const MAT_BOX_OUTLINE = new THREE.LineBasicMaterial({
    color: 0x1e242d,
    transparent: true,
    opacity: 0.65,
  });

  const MAT_BARRIER_ATK = new THREE.MeshBasicMaterial({
    color: 0x00e5c3,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const MAT_BARRIER_DEF = new THREE.MeshBasicMaterial({
    color: 0xff4655,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const disposables: THREE.Material[] = [
    MAT_FLOOR_COURTYARD,
    MAT_WALL_ARCHITECTURAL,
    MAT_COVER_TACTICAL,
    MAT_CATWALK_METAL,
    MAT_BOX_OUTLINE,
    MAT_BARRIER_ATK,
    MAT_BARRIER_DEF,
  ];

  return {
    MAT_FLOOR_COURTYARD,
    MAT_WALL_ARCHITECTURAL,
    MAT_COVER_TACTICAL,
    MAT_CATWALK_METAL,
    MAT_BOX_OUTLINE,
    MAT_BARRIER_ATK,
    MAT_BARRIER_DEF,
    dispose: () => {
      for (const m of disposables) m.dispose();
    },
  };
}
