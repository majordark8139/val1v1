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
    [d / uvTileMeters, h / uvTileMeters],
    [d / uvTileMeters, h / uvTileMeters],
    [w / uvTileMeters, d / uvTileMeters],
    [w / uvTileMeters, d / uvTileMeters],
    [w / uvTileMeters, h / uvTileMeters],
    [w / uvTileMeters, h / uvTileMeters],
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

/**
 * Sculpted low-poly Radianite crate with recessed core, perimeter frame rails,
 * diagonal structural brace, and raised central Kingdom diamond relief.
 */
function appendTacticalCrate(
  bodyBucket: GeometryBucket,
  frameBucket: GeometryBucket,
  trimBucket: GeometryBucket,
  brush: MapBrush
): void {
  const [w, h, d] = brush.size;
  const [px, py, pz] = brush.pos;
  const ry = brush.rotY;
  const cosY = Math.cos(ry);
  const sinY = Math.sin(ry);
  const toWorld = (lx: number, ly: number, lz: number): [number, number, number] => [
    px + lx * cosY + lz * sinY,
    py + ly,
    pz - lx * sinY + lz * cosY,
  ];

  // Recessed inner crate body
  appendBoxToBucket(bodyBucket, Math.max(0.2, w - 0.08), Math.max(0.2, h - 0.06), Math.max(0.2, d - 0.08), px, py, pz, 0, ry, 0, false);

  // Top & bottom chamfered armor collars
  const railH = Math.min(0.11, h * 0.14);
  appendBoxToBucket(frameBucket, w + 0.02, railH, d + 0.02, px, py + h * 0.5 - railH * 0.5, pz, 0, ry, 0, false);
  appendBoxToBucket(frameBucket, w + 0.02, railH, d + 0.02, px, py - h * 0.5 + railH * 0.5, pz, 0, ry, 0, false);

  // 4 Vertical corner posts
  const postT = Math.min(0.12, Math.min(w, d) * 0.12);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [cx, cy, cz] = toWorld(sx * (w * 0.5 - postT * 0.45), 0, sz * (d * 0.5 - postT * 0.45));
      appendBoxToBucket(frameBucket, postT, h - railH * 1.4, postT, cx, cy, cz, 0, ry, 0, false);
    }
  }

  // Front/Back & Side raised diamond reliefs + horizontal rib
  if (h >= 0.85) {
    for (const sz of [-1, 1]) {
      const [dx, dy, dz] = toWorld(0, 0, sz * (d * 0.5 - 0.01));
      appendBoxToBucket(trimBucket, Math.min(0.32, w * 0.25), Math.min(0.32, h * 0.25), 0.04, dx, dy, dz, 0, ry, Math.PI * 0.25, false);
    }
    for (const sx of [-1, 1]) {
      const [dx, dy, dz] = toWorld(sx * (w * 0.5 - 0.01), 0, 0);
      appendBoxToBucket(trimBucket, 0.04, Math.min(0.32, h * 0.25), Math.min(0.32, d * 0.25), dx, dy, dz, Math.PI * 0.25, ry, 0, false);
    }
  }
}

/**
 * Builds true arched spandrel corners inside a rectangular doorway opening
 * plus matching pilasters, arch ring, and keystone so portals form real curves.
 */
function appendArchPortal(
  wallBucket: GeometryBucket,
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
  const springY = openingHeight - Math.min(0.75, halfSpan * 0.26);
  const archRise = openingHeight - springY;
  const pillarW = 0.34;
  const pillarD = depth + 0.18;

  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  const toWorld = (lx: number, ly: number, lz: number): [number, number, number] => [
    cx + lx * cosY + lz * sinY,
    baseY + ly,
    cz - lx * sinY + lz * cosY,
  ];

  // Extruded spandrel corners filling the rectangular top corners down to the arch curve
  const spandrelShape = new THREE.Shape();
  spandrelShape.moveTo(-halfSpan, springY);
  spandrelShape.lineTo(-halfSpan, openingHeight + 0.02);
  spandrelShape.lineTo(halfSpan, openingHeight + 0.02);
  spandrelShape.lineTo(halfSpan, springY);
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = t * Math.PI;
    const x = Math.cos(ang) * halfSpan;
    const y = springY + Math.sin(ang) * archRise;
    spandrelShape.lineTo(x, y);
  }
  spandrelShape.closePath();

  const spandrelGeo = new THREE.ExtrudeGeometry(spandrelShape, {
    depth,
    bevelEnabled: false,
    curveSegments: 16,
  });
  spandrelGeo.translate(0, 0, -depth * 0.5);
  appendGeometryToBucket(wallBucket, spandrelGeo, cx, baseY, cz, 0, rotY, 0, 0.5, 0.5);

  // Left & Right Stone Pilasters + Capitals ending cleanly at springY
  for (const side of [-1, 1]) {
    const px = side * (halfSpan + pillarW * 0.35);
    const [wx, wy, wz] = toWorld(px, springY * 0.5, 0);
    appendBoxToBucket(stoneBucket, pillarW, springY, pillarD, wx, wy, wz, 0, rotY, 0, false);

    const [kx, ky, kz] = toWorld(px, springY + 0.08, 0);
    appendBoxToBucket(stoneBucket, pillarW + 0.14, 0.16, pillarD + 0.10, kx, ky, kz, 0, rotY, 0, false);
  }

  // Smooth sculpted arch trim ring hugging the exact arch curve + central keystone
  const segments = 16;
  const rx = halfSpan + 0.10;
  const ry = archRise + 0.10;
  for (let i = 0; i < segments; i++) {
    const t = (i + 0.5) / segments;
    const ang = t * Math.PI;
    const vx = Math.cos(ang) * rx;
    const vy = springY + Math.sin(ang) * ry;
    const isKeystone = i === Math.floor(segments / 2) || i === Math.floor(segments / 2) - 1;
    const [wx, wy, wz] = toWorld(vx, vy, 0);
    const tangentAngle = Math.atan2(ry * Math.cos(ang), -rx * Math.sin(ang));
    appendBoxToBucket(
      stoneBucket,
      (spanWidth / segments) * 1.38,
      isKeystone ? 0.28 : 0.22,
      pillarD + (isKeystone ? 0.10 : 0.04),
      wx,
      wy,
      wz,
      0,
      rotY,
      tangentAngle,
      false
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
    if (brush.mat === 'MAT_COVER_TACTICAL') {
      appendTacticalCrate(
        buckets.MAT_COVER_TACTICAL,
        buckets.MAT_CATWALK_METAL,
        stoneBucket,
        brush
      );
      continue;
    }

    const [w, h, d] = brush.size;
    const [px, py, pz] = brush.pos;
    appendBoxToBucket(buckets[brush.mat], w, h, d, px, py, pz, 0, brush.rotY, 0, true, 2.0);

    // Chamfered stone base plinth & top cornice along primary walls
    if (brush.mat === 'MAT_WALL_ARCHITECTURAL' && brush.collidable && h >= 4.0) {
      const topY = py + h * 0.5;
      const botY = py - h * 0.5;
      if (w >= 3.0 || d >= 3.0) {
        appendBoxToBucket(stoneBucket, w + 0.18, 0.24, d + 0.18, px, topY + 0.08, pz, 0, brush.rotY, 0, false);
        appendBoxToBucket(stoneBucket, w + 0.12, 0.28, d + 0.12, px, botY + 0.14, pz, 0, brush.rotY, 0, false);
      }
    }
  }

  // 2. Surrounding Ground Apron
  appendBoxToBucket(buckets.MAT_FLOOR_COURTYARD, 160, 0.4, 160, 0, -0.75, 0, 0, 0, 0, true, 2.2);

  // 3. True Curved Arch Portals (Top Mid Arch, Bottom Mid Arch, Market Entrance)
  appendArchPortal(buckets.MAT_WALL_ARCHITECTURAL, stoneBucket, 0, 1.35, -24.0, 6.0, 2.55, 1.2, 0);
  appendArchPortal(buckets.MAT_WALL_ARCHITECTURAL, stoneBucket, 0, 0.0, 27.0, 5.0, 3.4, 1.2, 0);
  appendArchPortal(buckets.MAT_WALL_ARCHITECTURAL, stoneBucket, 10.5, 0.3, 6.0, 3.4, 3.5, 1.0, Math.PI * 0.5);

  // 4. Pitched Roof Eaves & Overhangs
  appendBoxToBucket(roofBucket, 2.2, 0.34, 15.0, 10.7, 6.22, -2.5, 0, 0, -0.32, false);
  appendBoxToBucket(roofBucket, 11.8, 0.48, 13.4, 16.5, 6.28, 6.0, 0.22, 0, 0, false);
  appendBoxToBucket(roofBucket, 2.2, 0.34, 29.0, -11.5, 6.72, -6.5, 0, 0, 0.32, false);
  appendBoxToBucket(roofBucket, 16.4, 0.46, 2.3, 0, 6.68, -24.0, 0.26, 0, 0, false);
  appendBoxToBucket(roofBucket, 14.5, 0.46, 2.3, 0, 6.22, 27.0, -0.26, 0, 0, false);
  appendBoxToBucket(roofBucket, 6.6, 0.42, 4.4, 7.5, 6.22, 13.0, -0.26, 0, 0, false);

  // 5. Timber Pergola Beams & Recessed Window Frames
  for (let z = -10; z <= 2; z += 3.0) {
    appendBoxToBucket(woodBucket, 2.8, 0.16, 0.18, 9.2, 5.15, z);
  }
  appendBoxToBucket(woodBucket, 0.2, 0.2, 13.0, 8.0, 5.05, -4.0);

  const windowZList = [-6.5, -0.5, 16.5];
  for (const wz of windowZList) {
    appendBoxToBucket(woodBucket, 0.14, 1.5, 1.0, 9.95, 4.3, wz);
    appendBoxToBucket(woodBucket, 0.16, 1.5, 0.28, 9.93, 4.3, wz - 0.65);
    appendBoxToBucket(woodBucket, 0.16, 1.5, 0.28, 9.93, 4.3, wz + 0.65);
    appendBoxToBucket(stoneBucket, 0.26, 0.16, 1.55, 9.92, 3.48, wz);
    appendBoxToBucket(stoneBucket, 0.26, 0.16, 1.55, 9.92, 5.12, wz);
  }

  // 6. Catwalk Iron Handrail Stanchions & Top Rail
  for (let z = -7.5; z <= 5.5; z += 2.6) {
    appendBoxToBucket(buckets.MAT_CATWALK_METAL, 0.08, 0.35, 0.08, -7.55, 2.42, z);
  }
  appendBoxToBucket(buckets.MAT_CATWALK_METAL, 0.09, 0.07, 13.6, -7.55, 2.60, -1.0);

  // 7. Planter Boxes & Stylized Low-Poly Cypress Foliage
  const treePositions: [number, number, number, number][] = [
    [-10.2, 1.35, -19.5, 3.2],
    [9.3, 0.0, -10.5, 2.8],
    [-6.6, 0.0, 21.5, 3.0],
    [5.8, 0.0, 22.0, 2.7],
    [13.5, 0.3, 1.6, 2.4],
  ];
  for (const [tx, ty, tz, height] of treePositions) {
    appendBoxToBucket(stoneBucket, 0.9, 0.55, 0.9, tx, ty + 0.275, tz);
    appendBoxToBucket(stoneBucket, 1.02, 0.12, 1.02, tx, ty + 0.56, tz);
    const trunk = new THREE.CylinderGeometry(0.10, 0.14, height * 0.45, 6);
    appendGeometryToBucket(woodBucket, trunk, tx, ty + 0.55 + height * 0.22, tz);
    const c1 = new THREE.ConeGeometry(0.66, height * 0.52, 7);
    appendGeometryToBucket(foliageBucket, c1, tx, ty + 0.82 + height * 0.45, tz);
    const c2 = new THREE.ConeGeometry(0.48, height * 0.44, 7);
    appendGeometryToBucket(foliageBucket, c2, tx, ty + 0.85 + height * 0.68, tz);
  }

  // 8. Wall Lantern Sconces
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

  // 9. Venetian Belltower Spire & Vista Rooftops
  appendBoxToBucket(stoneBucket, 7.6, 0.6, 7.6, -26.0, 20.3, -8.0, 0, 0.15, 0, false);
  appendBoxToBucket(buckets.MAT_WALL_ARCHITECTURAL, 5.4, 4.2, 5.4, -26.0, 22.6, -8.0, 0, 0.15, 0, false);
  const bellSpire = new THREE.ConeGeometry(4.4, 5.2, 4);
  appendGeometryToBucket(roofBucket, bellSpire, -26.0, 27.3, -8.0, 0, 0.15 + Math.PI * 0.25, 0);

  const vistaRoof = new THREE.ConeGeometry(16.0, 6.0, 4);
  appendGeometryToBucket(roofBucket, vistaRoof, 4.0, 21.0, -52.0, 0, Math.PI * 0.25, 0);
  const vistaRoofSouth = new THREE.ConeGeometry(15.0, 5.5, 4);
  appendGeometryToBucket(roofBucket, vistaRoofSouth, -6.0, 18.7, 50.0, 0, Math.PI * 0.25, 0);
  const eastRoof = new THREE.ConeGeometry(8.0, 4.5, 4);
  appendGeometryToBucket(roofBucket, eastRoof, 34.0, 17.2, 4.0, 0, -0.1 + Math.PI * 0.25, 0);

  const geometriesToDispose: THREE.BufferGeometry[] = [];

  const addStaticMesh = (bucket: GeometryBucket, mat: THREE.Material) => {
    if (bucket.positions.length === 0) return;
    const geo = finalizeBucketGeometry(bucket);
    geometriesToDispose.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  };

  addStaticMesh(buckets.MAT_FLOOR_COURTYARD, materials.MAT_FLOOR_COURTYARD);
  addStaticMesh(buckets.MAT_WALL_ARCHITECTURAL, materials.MAT_WALL_ARCHITECTURAL);
  addStaticMesh(buckets.MAT_COVER_TACTICAL, materials.MAT_COVER_TACTICAL);
  addStaticMesh(buckets.MAT_CATWALK_METAL, materials.MAT_CATWALK_METAL);
  addStaticMesh(roofBucket, materials.MAT_TERRACOTTA_ROOF);
  addStaticMesh(woodBucket, materials.MAT_WOOD_TRIM);
  addStaticMesh(stoneBucket, materials.MAT_STONE_TRIM);
  addStaticMesh(foliageBucket, materials.MAT_FOLIAGE);
  addStaticMesh(lanternBucket, materials.MAT_LANTERN_GLOW);

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
