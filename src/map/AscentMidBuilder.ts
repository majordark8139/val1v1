import * as THREE from 'three';
import { ProceduralMaterialSet } from '../engine/ProceduralTextures';
import {
  ASCENT_MID_BRUSHES,
  BUY_BARRIER_PLANES,
  MapBrush,
  MapMaterialKey,
} from './AscentMidData';

interface GeometryBucket {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  vertexOffset: number;
}

function createBucket(): GeometryBucket {
  return {
    positions: [],
    normals: [],
    uvs: [],
    indices: [],
    vertexOffset: 0,
  };
}

const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3(1, 1, 1);

function appendGeometryToBucket(
  bucket: GeometryBucket,
  geo: THREE.BufferGeometry,
  px: number,
  py: number,
  pz: number,
  rotX = 0,
  rotY = 0,
  rotZ = 0,
  uvScaleU = 1,
  uvScaleV = 1
): void {
  _euler.set(rotX, rotY, rotZ, 'YXZ');
  _quat.setFromEuler(_euler);
  _pos.set(px, py, pz);
  _mat4.compose(_pos, _quat, _scale);
  geo.applyMatrix4(_mat4);

  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const normAttr = geo.attributes.normal as THREE.BufferAttribute;
  const uvAttr = geo.attributes.uv as THREE.BufferAttribute | undefined;
  const idxAttr = geo.index;

  for (let v = 0; v < posAttr.count; v++) {
    bucket.positions.push(posAttr.getX(v), posAttr.getY(v), posAttr.getZ(v));
    bucket.normals.push(normAttr.getX(v), normAttr.getY(v), normAttr.getZ(v));
    const u = uvAttr ? uvAttr.getX(v) : 0;
    const w = uvAttr ? uvAttr.getY(v) : 0;
    bucket.uvs.push(u * uvScaleU, w * uvScaleV);
  }

  if (idxAttr) {
    for (let i = 0; i < idxAttr.count; i++) {
      bucket.indices.push(idxAttr.getX(i) + bucket.vertexOffset);
    }
  } else {
    for (let i = 0; i < posAttr.count; i++) {
      bucket.indices.push(i + bucket.vertexOffset);
    }
  }

  bucket.vertexOffset += posAttr.count;
  geo.dispose();
}

function appendBoxToBucket(
  bucket: GeometryBucket,
  w: number,
  h: number,
  d: number,
  px: number,
  py: number,
  pz: number,
  rotX = 0,
  rotY = 0,
  rotZ = 0,
  scaleWorldUv = true,
  uvTileMeters = 1.0
): void {
  const boxGeo = new THREE.BoxGeometry(w, h, d);
  _euler.set(rotX, rotY, rotZ, 'YXZ');
  _quat.setFromEuler(_euler);
  _pos.set(px, py, pz);
  _mat4.compose(_pos, _quat, _scale);
  boxGeo.applyMatrix4(_mat4);

  const posAttr = boxGeo.attributes.position as THREE.BufferAttribute;
  const normAttr = boxGeo.attributes.normal as THREE.BufferAttribute;
  const uvAttr = boxGeo.attributes.uv as THREE.BufferAttribute;
  const idxAttr = boxGeo.index!;

  const faceScales: [number, number][] = [
    [d / uvTileMeters, h / uvTileMeters], // +X
    [d / uvTileMeters, h / uvTileMeters], // -X
    [w / uvTileMeters, d / uvTileMeters], // +Y
    [w / uvTileMeters, d / uvTileMeters], // -Y
    [w / uvTileMeters, h / uvTileMeters], // +Z
    [w / uvTileMeters, h / uvTileMeters], // -Z
  ];

  for (let v = 0; v < posAttr.count; v++) {
    bucket.positions.push(posAttr.getX(v), posAttr.getY(v), posAttr.getZ(v));
    bucket.normals.push(normAttr.getX(v), normAttr.getY(v), normAttr.getZ(v));
    if (scaleWorldUv) {
      const faceIdx = Math.floor(v / 4);
      const [su, sv] = faceScales[faceIdx] ?? [1, 1];
      bucket.uvs.push(uvAttr.getX(v) * su, uvAttr.getY(v) * sv);
    } else {
      bucket.uvs.push(uvAttr.getX(v), uvAttr.getY(v));
    }
  }

  for (let i = 0; i < idxAttr.count; i++) {
    bucket.indices.push(idxAttr.getX(i) + bucket.vertexOffset);
  }

  bucket.vertexOffset += posAttr.count;
  boxGeo.dispose();
}

function appendBrushToBucket(bucket: GeometryBucket, brush: MapBrush): void {
  const [w, h, d] = brush.size;
  const [px, py, pz] = brush.pos;
  const isCrate = brush.mat === 'MAT_COVER_TACTICAL';
  const tileScale = brush.mat === 'MAT_WALL_ARCHITECTURAL' ? 2.0 : 1.35;
  appendBoxToBucket(bucket, w, h, d, px, py, pz, 0, brush.rotY, 0, !isCrate, tileScale);
}

function appendArchMolding(
  stoneBucket: GeometryBucket,
  cx: number,
  baseY: number,
  cz: number,
  spanWidth: number,
  openingHeight: number,
  depth: number,
  rotY = 0
): void {
  const halfSpan = spanWidth * 0.5;
  const pillarW = 0.36;
  const pillarD = depth + 0.24;

  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  const toWorld = (lx: number, ly: number, lz: number): [number, number, number] => [
    cx + lx * cosY + lz * sinY,
    baseY + ly,
    cz - lx * sinY + lz * cosY,
  ];

  // Left & Right Stone Pilasters + Capitals
  for (const side of [-1, 1]) {
    const px = side * (halfSpan + pillarW * 0.4);
    const [wx, wy, wz] = toWorld(px, openingHeight * 0.5, 0);
    appendBoxToBucket(stoneBucket, pillarW, openingHeight, pillarD, wx, wy, wz, 0, rotY, 0, true, 1.5);

    const [kx, ky, kz] = toWorld(px, openingHeight + 0.12, 0);
    appendBoxToBucket(
      stoneBucket,
      pillarW + 0.16,
      0.24,
      pillarD + 0.14,
      kx,
      ky,
      kz,
      0,
      rotY,
      0,
      true,
      1.5
    );
  }

  // Horizontal stone architrave beam tying pilasters together
  const [lx, ly, lz] = toWorld(0, openingHeight + 0.12, 0);
  appendBoxToBucket(stoneBucket, spanWidth + 0.65, 0.24, pillarD + 0.06, lx, ly, lz, 0, rotY, 0, true, 1.4);

  // Smooth elliptical stone arch ring anchored onto pilaster capitals
  const segments = 17;
  const rx = halfSpan + 0.14;
  const ry = halfSpan * 0.24;
  for (let i = 0; i < segments; i++) {
    const t = (i + 0.5) / segments;
    const ang = t * Math.PI;
    const vx = Math.cos(ang) * rx;
    const vy = openingHeight + 0.18 + Math.sin(ang) * ry;
    const isKeystone = i === Math.floor(segments / 2);
    const [wx, wy, wz] = toWorld(vx, vy, 0);
    // Tangent slope of ellipse (vx = rx*cos, vy = ry*sin)
    const tangentAngle = Math.atan2(ry * Math.cos(ang), -rx * Math.sin(ang));
    appendBoxToBucket(
      stoneBucket,
      (spanWidth / segments) * (isKeystone ? 1.55 : 1.45),
      isKeystone ? 0.36 : 0.26,
      pillarD + (isKeystone ? 0.14 : 0.08),
      wx,
      wy,
      wz,
      0,
      rotY,
      tangentAngle,
      true,
      1.2
    );
  }
}

function finalizeBucketGeometry(bucket: GeometryBucket): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uvs, 2));
  geo.setIndex(bucket.indices);
  geo.computeBoundingSphere();
  return geo;
}

export interface BuiltAscentMap {
  group: THREE.Group;
  barriersGroup: THREE.Group;
  barrierMaterial: THREE.MeshBasicMaterial;
  setBarriersVisible: (visible: boolean, localIsAttacker: boolean) => void;
  dispose: () => void;
}

export function buildAscentMidMap(materials: ProceduralMaterialSet): BuiltAscentMap {
  const group = new THREE.Group();

  const buckets: Record<MapMaterialKey, GeometryBucket> = {
    MAT_FLOOR_COURTYARD: createBucket(),
    MAT_WALL_ARCHITECTURAL: createBucket(),
    MAT_COVER_TACTICAL: createBucket(),
    MAT_CATWALK_METAL: createBucket(),
  };

  const roofBucket = createBucket();
  const woodBucket = createBucket();
  const stoneBucket = createBucket();
  const foliageBucket = createBucket();
  const lanternBucket = createBucket();

  // 1. Core playable & vista brushes
  for (let i = 0; i < ASCENT_MID_BRUSHES.length; i++) {
    const brush = ASCENT_MID_BRUSHES[i];
    appendBrushToBucket(buckets[brush.mat], brush);

    // Add stone base plinth & top cornice along primary architectural walls
    if (brush.mat === 'MAT_WALL_ARCHITECTURAL' && brush.collidable && brush.size[1] >= 4.0) {
      const [w, h, d] = brush.size;
      const [px, py, pz] = brush.pos;
      const topY = py + h * 0.5;
      const botY = py - h * 0.5;
      if (w >= 3.0 || d >= 3.0) {
        appendBoxToBucket(stoneBucket, w + 0.2, 0.28, d + 0.2, px, topY + 0.08, pz, 0, brush.rotY, 0, true, 1.5);
        appendBoxToBucket(stoneBucket, w + 0.14, 0.32, d + 0.14, px, botY + 0.16, pz, 0, brush.rotY, 0, true, 1.5);
      }
    }

    // Add chamfered steel corner trim caps on tactical Radianite crates
    if (brush.mat === 'MAT_COVER_TACTICAL') {
      const [w, h, d] = brush.size;
      const [px, py, pz] = brush.pos;
      appendBoxToBucket(
        buckets.MAT_CATWALK_METAL,
        w + 0.05,
        0.09,
        d + 0.05,
        px,
        py + h * 0.5 - 0.03,
        pz,
        0,
        brush.rotY,
        0,
        true,
        1.0
      );
      appendBoxToBucket(
        buckets.MAT_CATWALK_METAL,
        w + 0.05,
        0.09,
        d + 0.05,
        px,
        py - h * 0.5 + 0.03,
        pz,
        0,
        brush.rotY,
        0,
        true,
        1.0
      );
    }
  }

  // 2. Surrounding Venetian Courtyard Ground Apron (prevents floating void past walls)
  appendBoxToBucket(buckets.MAT_FLOOR_COURTYARD, 160, 0.4, 160, 0, -0.75, 0, 0, 0, 0, true, 2.2);

  // 3. Sculpted Archway Trim (Top Mid Arch, Bottom Mid Arch, Market Entrance)
  appendArchMolding(stoneBucket, 0, 1.35, -24.0, 6.0, 2.55, 1.2, 0);
  appendArchMolding(stoneBucket, 0, 0.0, 27.0, 5.0, 3.4, 1.2, 0);
  appendArchMolding(stoneBucket, 10.5, 0.3, 6.0, 3.4, 3.5, 1.0, Math.PI * 0.5);

  // 4. Pitched Terracotta Roof Eaves & Overhangs along Courtyard Walls
  // East wall eaves
  appendBoxToBucket(roofBucket, 2.2, 0.38, 15.0, 10.7, 6.22, -2.5, 0, 0, -0.32, true, 1.8);
  // Market roof
  appendBoxToBucket(roofBucket, 11.8, 0.55, 13.4, 16.5, 6.28, 6.0, 0.22, 0, 0, true, 2.0);
  // West Catwalk eaves
  appendBoxToBucket(roofBucket, 2.2, 0.38, 29.0, -11.5, 6.72, -6.5, 0, 0, 0.32, true, 1.8);
  // Top Mid Arch roof cap
  appendBoxToBucket(roofBucket, 16.4, 0.5, 2.3, 0, 6.68, -24.0, 0.26, 0, 0, true, 1.8);
  // Bottom Mid Arch roof cap
  appendBoxToBucket(roofBucket, 14.5, 0.5, 2.3, 0, 6.22, 27.0, -0.26, 0, 0, true, 1.8);
  // Mid Link south wall eaves
  appendBoxToBucket(roofBucket, 6.6, 0.45, 4.4, 7.5, 6.22, 13.0, -0.26, 0, 0, true, 1.8);

  // 5. Timber Pergola Beams & Wall Shutters (Venetian warmth)
  for (let z = -10; z <= 2; z += 3.0) {
    appendBoxToBucket(woodBucket, 2.8, 0.16, 0.18, 9.2, 5.15, z, 0, 0, 0);
  }
  appendBoxToBucket(woodBucket, 0.2, 0.2, 13.0, 8.0, 5.05, -4.0);

  // Shuttered upper windows on East & West Courtyard walls
  const windowZList = [-6.5, -0.5, 16.5];
  for (const wz of windowZList) {
    appendBoxToBucket(woodBucket, 0.14, 1.5, 1.0, 9.95, 4.3, wz);
    appendBoxToBucket(woodBucket, 0.16, 1.5, 0.28, 9.93, 4.3, wz - 0.65);
    appendBoxToBucket(woodBucket, 0.16, 1.5, 0.28, 9.93, 4.3, wz + 0.65);
    appendBoxToBucket(stoneBucket, 0.26, 0.16, 1.55, 9.92, 3.48, wz);
  }

  // 6. Catwalk Iron Handrail Stanchions & Top Rail
  for (let z = -7.5; z <= 5.5; z += 2.6) {
    appendBoxToBucket(buckets.MAT_CATWALK_METAL, 0.08, 0.35, 0.08, -7.55, 2.42, z);
  }
  appendBoxToBucket(buckets.MAT_CATWALK_METAL, 0.09, 0.07, 13.6, -7.55, 2.60, -1.0);

  // 7. Mediterranean Planter Boxes & Cypress / Olive Foliage (out of collision lanes)
  const treePositions: [number, number, number, number][] = [
    [-10.2, 1.35, -19.5, 3.2],
    [9.3, 0.0, -10.5, 2.8],
    [-6.6, 0.0, 21.5, 3.0],
    [5.8, 0.0, 22.0, 2.7],
    [13.5, 0.3, 1.6, 2.4],
  ];
  for (const [tx, ty, tz, height] of treePositions) {
    // Stone planter pot
    appendBoxToBucket(stoneBucket, 0.9, 0.55, 0.9, tx, ty + 0.275, tz);
    // Trunk
    const trunk = new THREE.CylinderGeometry(0.11, 0.15, height * 0.45, 7);
    appendGeometryToBucket(woodBucket, trunk, tx, ty + 0.55 + height * 0.22, tz);
    // Layered stylized Mediterranean cypress canopy
    const c1 = new THREE.ConeGeometry(0.68, height * 0.55, 8);
    appendGeometryToBucket(foliageBucket, c1, tx, ty + 0.8 + height * 0.45, tz);
    const c2 = new THREE.ConeGeometry(0.52, height * 0.45, 8);
    appendGeometryToBucket(foliageBucket, c2, tx, ty + 0.8 + height * 0.68, tz);
  }

  // 8. Warm Wall-Mounted Venetian Lanterns
  const lanternPositions: [number, number, number][] = [
    [9.85, 3.3, -4.0],
    [9.85, 3.3, 2.8],
    [-7.3, 3.2, -3.5],
    [-3.1, 3.8, -23.3],
    [3.1, 3.8, -23.3],
    [-2.6, 3.4, 26.3],
    [2.6, 3.4, 26.3],
  ];
  for (const [lx, ly, lz] of lanternPositions) {
    appendBoxToBucket(buckets.MAT_CATWALK_METAL, 0.18, 0.08, 0.18, lx, ly + 0.18, lz);
    appendBoxToBucket(lanternBucket, 0.16, 0.24, 0.16, lx, ly, lz);
    appendBoxToBucket(buckets.MAT_CATWALK_METAL, 0.2, 0.06, 0.2, lx, ly - 0.16, lz);
  }

  // 9. Venetian Belltower Spire, Clock & Vista Rooftops
  // Belltower belfry + pyramid terracotta roof on vista_belltower_west (-26, 20, -8)
  appendBoxToBucket(stoneBucket, 7.6, 0.6, 7.6, -26.0, 20.3, -8.0, 0, 0.15, 0, true, 2.0);
  appendBoxToBucket(buckets.MAT_WALL_ARCHITECTURAL, 5.4, 4.2, 5.4, -26.0, 22.6, -8.0, 0, 0.15, 0, true, 2.0);
  const bellSpire = new THREE.ConeGeometry(4.4, 5.2, 4);
  appendGeometryToBucket(roofBucket, bellSpire, -26.0, 27.3, -8.0, 0, 0.15 + Math.PI * 0.25, 0, 2, 2);

  // Pitched terracotta roofs on distant vista buildings
  const vistaRoof = new THREE.ConeGeometry(16.0, 6.0, 4);
  appendGeometryToBucket(roofBucket, vistaRoof, 4.0, 21.0, -52.0, 0, Math.PI * 0.25, 0, 4, 2);
  const vistaRoofSouth = new THREE.ConeGeometry(15.0, 5.5, 4);
  appendGeometryToBucket(roofBucket, vistaRoofSouth, -6.0, 18.7, 50.0, 0, Math.PI * 0.25, 0, 4, 2);
  const eastRoof = new THREE.ConeGeometry(8.0, 4.5, 4);
  appendGeometryToBucket(roofBucket, eastRoof, 34.0, 17.2, 4.0, 0, -0.1 + Math.PI * 0.25, 0, 3, 2);

  const geometriesToDispose: THREE.BufferGeometry[] = [];

  const addStaticMesh = (bucket: GeometryBucket, mat: THREE.Material, castShadow = true) => {
    if (bucket.positions.length === 0) return;
    const geo = finalizeBucketGeometry(bucket);
    geometriesToDispose.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  };

  addStaticMesh(buckets.MAT_FLOOR_COURTYARD, materials.MAT_FLOOR_COURTYARD, false);
  addStaticMesh(buckets.MAT_WALL_ARCHITECTURAL, materials.MAT_WALL_ARCHITECTURAL, true);
  addStaticMesh(buckets.MAT_COVER_TACTICAL, materials.MAT_COVER_TACTICAL, true);
  addStaticMesh(buckets.MAT_CATWALK_METAL, materials.MAT_CATWALK_METAL, true);
  addStaticMesh(roofBucket, materials.MAT_TERRACOTTA_ROOF, true);
  addStaticMesh(woodBucket, materials.MAT_WOOD_TRIM, true);
  addStaticMesh(stoneBucket, materials.MAT_STONE_TRIM, true);
  addStaticMesh(foliageBucket, materials.MAT_FOLIAGE, true);
  addStaticMesh(lanternBucket, materials.MAT_LANTERN_GLOW, false);

  // Buy Phase Energy Barriers
  const barriersGroup = new THREE.Group();
  const atkBarrierGeo = new THREE.PlaneGeometry(22.0, 5.2);
  const atkBarrier = new THREE.Mesh(atkBarrierGeo, materials.MAT_BARRIER_SPAWN);
  atkBarrier.position.set(0, 2.8, BUY_BARRIER_PLANES.ATTACKER_Z);

  const defBarrierGeo = new THREE.PlaneGeometry(16.0, 5.2);
  const defBarrier = new THREE.Mesh(defBarrierGeo, materials.MAT_BARRIER_SPAWN);
  defBarrier.position.set(0, 2.6, BUY_BARRIER_PLANES.DEFENDER_Z);

  geometriesToDispose.push(atkBarrierGeo, defBarrierGeo);
  barriersGroup.add(atkBarrier, defBarrier);
  group.add(barriersGroup);

  return {
    group,
    barriersGroup,
    barrierMaterial: materials.MAT_BARRIER_SPAWN,
    setBarriersVisible: (visible: boolean, localIsAttacker: boolean) => {
      barriersGroup.visible = visible;
      materials.MAT_BARRIER_SPAWN.color.setHex(localIsAttacker ? 0x00f5d4 : 0xff4d6d);
    },
    dispose: () => {
      for (const g of geometriesToDispose) g.dispose();
    },
  };
}
