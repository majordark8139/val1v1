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
 * horizontal waist strap, corner armor bumpers, and raised Kingdom diamond relief.
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
  appendBoxToBucket(
    bodyBucket,
    Math.max(0.2, w - 0.10),
    Math.max(0.2, h - 0.08),
    Math.max(0.2, d - 0.10),
    px,
    py,
    pz,
    0,
    ry,
    0,
    false
  );

  // Top & bottom chamfered armor collars + top lid recessed plate
  const railH = Math.min(0.12, h * 0.14);
  appendBoxToBucket(
    frameBucket,
    w + 0.02,
    railH,
    d + 0.02,
    px,
    py + h * 0.5 - railH * 0.5,
    pz,
    0,
    ry,
    0,
    false
  );
  appendBoxToBucket(
    trimBucket,
    Math.max(0.2, w - 0.28),
    0.04,
    Math.max(0.2, d - 0.28),
    px,
    py + h * 0.5 + 0.015,
    pz,
    0,
    ry,
    0,
    false
  );
  appendBoxToBucket(
    frameBucket,
    w + 0.02,
    railH,
    d + 0.02,
    px,
    py - h * 0.5 + railH * 0.5,
    pz,
    0,
    ry,
    0,
    false
  );

  // 4 Vertical corner armor posts
  const postT = Math.min(0.14, Math.min(w, d) * 0.12);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [cx, cy, cz] = toWorld(
        sx * (w * 0.5 - postT * 0.45),
        0,
        sz * (d * 0.5 - postT * 0.45)
      );
      appendBoxToBucket(frameBucket, postT, h - railH * 1.4, postT, cx, cy, cz, 0, ry, 0, false);
    }
  }

  // Mid structural strap + Front/Back & Side raised diamond reliefs
  if (h >= 0.85) {
    appendBoxToBucket(
      frameBucket,
      w - 0.02,
      0.07,
      d - 0.02,
      px,
      py,
      pz,
      0,
      ry,
      0,
      false
    );
    const diamondSize = Math.min(0.30, Math.min(w, h) * 0.24);
    for (const sz of [-1, 1]) {
      const [dx, dy, dz] = toWorld(0, 0, sz * (d * 0.5 - 0.015));
      appendBoxToBucket(
        trimBucket,
        diamondSize,
        diamondSize,
        0.05,
        dx,
        dy,
        dz,
        0,
        ry,
        Math.PI * 0.25,
        false
      );
    }
    for (const sx of [-1, 1]) {
      const [dx, dy, dz] = toWorld(sx * (w * 0.5 - 0.015), 0, 0);
      appendBoxToBucket(
        trimBucket,
        0.05,
        diamondSize,
        diamondSize,
        dx,
        dy,
        dz,
        Math.PI * 0.25,
        ry,
        0,
        false
      );
    }
  }
}

/**
 * Builds clean, continuous Venetian stone arch portals using a single smooth
 * extruded spandrel + continuous extruded arch molding ring (zero jagged ceiling boxes)
 * + sculpted pilasters, capitals, and central keystone.
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
  const springY = openingHeight - Math.min(0.72, halfSpan * 0.25);
  const archRise = openingHeight - springY;
  const pillarW = 0.36;
  const pillarD = depth + 0.16;
  const curveSteps = 14;

  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  const toWorld = (lx: number, ly: number, lz: number): [number, number, number] => [
    cx + lx * cosY + lz * sinY,
    baseY + ly,
    cz - lx * sinY + lz * cosY,
  ];

  // 1. Extruded spandrel corners filling rectangular lintel corners cleanly down to arch curve
  const spandrelShape = new THREE.Shape();
  spandrelShape.moveTo(-halfSpan, springY);
  spandrelShape.lineTo(-halfSpan, openingHeight + 0.04);
  spandrelShape.lineTo(halfSpan, openingHeight + 0.04);
  spandrelShape.lineTo(halfSpan, springY);
  for (let i = 0; i <= curveSteps; i++) {
    const ang = (i / curveSteps) * Math.PI;
    spandrelShape.lineTo(Math.cos(ang) * halfSpan, springY + Math.sin(ang) * archRise);
  }
  spandrelShape.closePath();

  const spandrelGeo = new THREE.ExtrudeGeometry(spandrelShape, {
    depth,
    bevelEnabled: false,
    curveSegments: curveSteps,
  });
  spandrelGeo.translate(0, 0, -depth * 0.5);
  appendGeometryToBucket(wallBucket, spandrelGeo, cx, baseY, cz, 0, rotY, 0, 0.5, 0.5);

  // 2. Single continuous extruded arch molding ring (smooth soffit underneath, zero gaps)
  const ringThick = 0.22;
  const ringShape = new THREE.Shape();
  for (let i = 0; i <= curveSteps; i++) {
    const ang = (i / curveSteps) * Math.PI;
    const ox = Math.cos(ang) * (halfSpan + ringThick);
    const oy = springY + Math.sin(ang) * (archRise + ringThick);
    if (i === 0) ringShape.moveTo(ox, oy);
    else ringShape.lineTo(ox, oy);
  }
  for (let i = curveSteps; i >= 0; i--) {
    const ang = (i / curveSteps) * Math.PI;
    const ix = Math.cos(ang) * (halfSpan - 0.02);
    const iy = springY + Math.sin(ang) * (archRise - 0.02);
    ringShape.lineTo(ix, iy);
  }
  ringShape.closePath();

  const ringGeo = new THREE.ExtrudeGeometry(ringShape, {
    depth: pillarD,
    bevelEnabled: false,
    curveSegments: curveSteps,
  });
  ringGeo.translate(0, 0, -pillarD * 0.5);
  appendGeometryToBucket(stoneBucket, ringGeo, cx, baseY, cz, 0, rotY, 0, 0.5, 0.5);

  // 3. Sculpted central trapezoidal keystone + Left/Right pilasters with plinths & capitals
  const [keyX, keyY, keyZ] = toWorld(0, openingHeight + 0.12, 0);
  appendBoxToBucket(stoneBucket, 0.34, 0.36, pillarD + 0.10, keyX, keyY, keyZ, 0, rotY, 0, false);

  for (const side of [-1, 1]) {
    const px = side * (halfSpan + pillarW * 0.36);
    const [wx, wy, wz] = toWorld(px, springY * 0.5, 0);
    appendBoxToBucket(stoneBucket, pillarW, springY, pillarD, wx, wy, wz, 0, rotY, 0, false);

    // Base plinth
    const [bx, by, bz] = toWorld(px, 0.18, 0);
    appendBoxToBucket(stoneBucket, pillarW + 0.12, 0.36, pillarD + 0.10, bx, by, bz, 0, rotY, 0, false);

    // Impost capital
    const [kx, ky, kz] = toWorld(px, springY + 0.07, 0);
    appendBoxToBucket(stoneBucket, pillarW + 0.16, 0.18, pillarD + 0.12, kx, ky, kz, 0, rotY, 0, false);
  }
}

/**
 * Adds a sculpted Venetian recessed window with sill, top pediment cornice,
 * dark interior recess, and louvered side shutters.
 */
function appendVenetianWindow(
  woodBucket: GeometryBucket,
  stoneBucket: GeometryBucket,
  wx: number,
  wy: number,
  wz: number,
  facingSignX: -1 | 1
): void {
  const n = facingSignX;
  // Dark recessed window pane
  appendBoxToBucket(woodBucket, 0.10, 1.48, 0.96, wx + n * 0.04, wy, wz, 0, 0, 0, false);
  // Central mullion crossbars
  appendBoxToBucket(stoneBucket, 0.14, 1.48, 0.08, wx + n * 0.06, wy, wz, 0, 0, 0, false);
  appendBoxToBucket(stoneBucket, 0.14, 0.08, 0.96, wx + n * 0.06, wy + 0.14, wz, 0, 0, 0, false);
  // Angled side shutters
  appendBoxToBucket(woodBucket, 0.10, 1.48, 0.34, wx + n * 0.09, wy, wz - 0.66, 0, n * 0.18, 0, false);
  appendBoxToBucket(woodBucket, 0.10, 1.48, 0.34, wx + n * 0.09, wy, wz + 0.66, 0, -n * 0.18, 0, false);
  // Stone sill + corbel brackets + top cornice lintel
  appendBoxToBucket(stoneBucket, 0.28, 0.14, 1.46, wx + n * 0.10, wy - 0.80, wz, 0, 0, 0, false);
  appendBoxToBucket(stoneBucket, 0.24, 0.16, 0.16, wx + n * 0.08, wy - 0.94, wz - 0.46, 0, 0, 0, false);
  appendBoxToBucket(stoneBucket, 0.24, 0.16, 0.16, wx + n * 0.08, wy - 0.94, wz + 0.46, 0, 0, 0, false);
  appendBoxToBucket(stoneBucket, 0.30, 0.16, 1.56, wx + n * 0.11, wy + 0.82, wz, 0, 0, 0, false);
}

/**
 * Appends crease line segments from a finalized BufferGeometry into a flat
 * vertex array so all Blender Workbench cavity lines render in 1 single draw call.
 */
function appendEdgesToArray(geo: THREE.BufferGeometry, outPositions: number[], thresholdDeg = 28): void {
  const edges = new THREE.EdgesGeometry(geo, thresholdDeg);
  const pos = edges.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    outPositions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
  }
  edges.dispose();
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

    // Chamfered architectural stone base plinth, mid string-course & top cornice along primary walls
    if (brush.mat === 'MAT_WALL_ARCHITECTURAL' && brush.collidable && h >= 4.0) {
      const topY = py + h * 0.5;
      const botY = py - h * 0.5;
      if (w >= 3.0 || d >= 3.0) {
        appendBoxToBucket(stoneBucket, w + 0.22, 0.26, d + 0.22, px, topY + 0.08, pz, 0, brush.rotY, 0, false);
        appendBoxToBucket(stoneBucket, w + 0.10, 0.12, d + 0.10, px, botY + 3.05, pz, 0, brush.rotY, 0, false);
        appendBoxToBucket(stoneBucket, w + 0.14, 0.30, d + 0.14, px, botY + 0.15, pz, 0, brush.rotY, 0, false);
      }
    }
  }

  // 2. Surrounding Ground Apron
  appendBoxToBucket(buckets.MAT_FLOOR_COURTYARD, 160, 0.4, 160, 0, -0.75, 0, 0, 0, 0, true, 2.2);

  // 3. True Smooth Venetian Arch Portals (Top Mid Arch, Bottom Mid Arch, Market Entrance)
  appendArchPortal(buckets.MAT_WALL_ARCHITECTURAL, stoneBucket, 0, 1.35, -24.0, 6.0, 2.55, 1.2, 0);
  appendArchPortal(buckets.MAT_WALL_ARCHITECTURAL, stoneBucket, 0, 0.0, 27.0, 5.0, 3.4, 1.2, 0);
  appendArchPortal(buckets.MAT_WALL_ARCHITECTURAL, stoneBucket, 10.5, 0.3, 6.0, 3.4, 3.5, 1.0, Math.PI * 0.5);

  // 4. Stepped Venetian Pitched Roof Eaves & Ridge Caps
  appendBoxToBucket(roofBucket, 2.4, 0.30, 15.0, 10.7, 6.26, -2.5, 0, 0, -0.32, false);
  appendBoxToBucket(roofBucket, 11.8, 0.46, 13.4, 16.5, 6.32, 6.0, 0.22, 0, 0, false);
  appendBoxToBucket(roofBucket, 2.4, 0.30, 29.0, -11.5, 6.76, -6.5, 0, 0, 0.32, false);
  appendBoxToBucket(roofBucket, 16.4, 0.44, 2.4, 0, 6.72, -24.0, 0.26, 0, 0, false);
  appendBoxToBucket(roofBucket, 14.5, 0.44, 2.4, 0, 6.26, 27.0, -0.26, 0, 0, false);
  appendBoxToBucket(roofBucket, 6.6, 0.40, 4.4, 7.5, 6.26, 13.0, -0.26, 0, 0, false);

  // Market Entrance Sloped Canopy Awning + Brackets (flush against east wall X=10.0)
  appendBoxToBucket(roofBucket, 1.35, 0.14, 4.1, 9.40, 4.18, 6.0, 0, 0, 0.22, false);
  appendBoxToBucket(woodBucket, 0.12, 0.14, 4.16, 8.78, 4.02, 6.0, 0, 0, 0, false);
  for (const az of [4.35, 7.65]) {
    appendBoxToBucket(woodBucket, 1.05, 0.10, 0.10, 9.52, 3.74, az, 0, 0, -0.45, false);
  }

  // 5. Timber Pergola Rafters (supported by angled corbels flush against East wall X=10.0) + Venetian Windows
  for (let z = -10; z <= 2; z += 2.4) {
    appendBoxToBucket(woodBucket, 1.45, 0.14, 0.14, 9.35, 5.20, z, 0, 0, 0, false);
    appendBoxToBucket(woodBucket, 0.95, 0.11, 0.11, 9.60, 4.82, z, 0, 0, -0.55, false);
  }
  appendBoxToBucket(woodBucket, 0.16, 0.16, 13.0, 8.70, 5.08, -4.0, 0, 0, 0, false);

  for (const wz of [-6.5, -0.5, 16.5]) {
    appendVenetianWindow(woodBucket, stoneBucket, 9.96, 4.35, wz, -1);
  }
  for (const wz of [-10.0, -2.0, 6.0]) {
    appendVenetianWindow(woodBucket, stoneBucket, -11.28, 4.75, wz, 1);
  }

  // 6. Catwalk Iron Handrail Stanchions, Top Rail & Mid Bar
  for (let z = -7.5; z <= 5.5; z += 2.15) {
    appendBoxToBucket(buckets.MAT_CATWALK_METAL, 0.08, 0.42, 0.08, -7.55, 2.46, z, 0, 0, 0, false);
  }
  appendBoxToBucket(buckets.MAT_CATWALK_METAL, 0.10, 0.07, 13.8, -7.55, 2.68, -1.0, 0, 0, 0, false);
  appendBoxToBucket(buckets.MAT_CATWALK_METAL, 0.06, 0.05, 13.8, -7.55, 2.44, -1.0, 0, 0, 0, false);

  // 7. Sculpted Low-Poly Stone Planters & Faceted Mediterranean Foliage Clusters (no traffic-cone trees)
  const planterPositions: [number, number, number, number][] = [
    [-10.2, 1.35, -19.5, 2.6],
    [9.3, 0.0, -10.5, 2.5],
    [-6.6, 0.0, 21.5, 2.7],
    [5.8, 0.0, 22.0, 2.4],
    [13.5, 0.3, 1.6, 2.2],
  ];
  for (const [tx, ty, tz, height] of planterPositions) {
    // Stepped stone urn planter
    appendBoxToBucket(stoneBucket, 0.96, 0.18, 0.96, tx, ty + 0.09, tz, 0, 0, 0, false);
    appendBoxToBucket(stoneBucket, 0.84, 0.44, 0.84, tx, ty + 0.38, tz, 0, 0, 0, false);
    appendBoxToBucket(stoneBucket, 1.04, 0.12, 1.04, tx, ty + 0.64, tz, 0, 0, 0, false);
    // Tapered stem + sculpted faceted icosahedron foliage crown (3 organic clusters)
    const trunk = new THREE.CylinderGeometry(0.08, 0.11, height * 0.42, 6);
    appendGeometryToBucket(woodBucket, trunk, tx, ty + 0.65 + height * 0.20, tz);

    const b1 = new THREE.IcosahedronGeometry(0.46, 0);
    b1.scale(0.85, 1.35, 0.85);
    appendGeometryToBucket(foliageBucket, b1, tx, ty + 0.75 + height * 0.48, tz, 0, 0.4, 0);

    const b2 = new THREE.IcosahedronGeometry(0.38, 0);
    b2.scale(0.80, 1.40, 0.80);
    appendGeometryToBucket(foliageBucket, b2, tx + 0.08, ty + 0.78 + height * 0.72, tz - 0.05, 0.1, 1.2, 0);

    const b3 = new THREE.IcosahedronGeometry(0.24, 0);
    b3.scale(0.85, 1.35, 0.85);
    appendGeometryToBucket(foliageBucket, b3, tx - 0.04, ty + 0.80 + height * 0.92, tz + 0.04, 0, 2.1, 0);
  }

  // 8. Wrought-Iron Wall Lantern Sconces with wall brackets
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
    appendBoxToBucket(buckets.MAT_CATWALK_METAL, 0.22, 0.07, 0.22, lx, ly + 0.18, lz, 0, 0, 0, false);
    appendBoxToBucket(lanternBucket, 0.16, 0.24, 0.16, lx, ly, lz, 0, 0, 0, false);
    appendBoxToBucket(buckets.MAT_CATWALK_METAL, 0.20, 0.06, 0.20, lx, ly - 0.16, lz, 0, 0, 0, false);
  }

  // 9. Venetian Belltower Spire (with corner belfry piers) & Vista Rooftops
  appendBoxToBucket(stoneBucket, 7.6, 0.6, 7.6, -26.0, 20.3, -8.0, 0, 0.15, 0, false);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      appendBoxToBucket(
        buckets.MAT_WALL_ARCHITECTURAL,
        1.25,
        4.2,
        1.25,
        -26.0 + sx * 2.1,
        22.6,
        -8.0 + sz * 2.1,
        0,
        0.15,
        0,
        false
      );
    }
  }
  appendBoxToBucket(stoneBucket, 6.2, 0.55, 6.2, -26.0, 24.8, -8.0, 0, 0.15, 0, false);
  const bellSpire = new THREE.ConeGeometry(4.4, 5.4, 4);
  appendGeometryToBucket(roofBucket, bellSpire, -26.0, 27.7, -8.0, 0, 0.15 + Math.PI * 0.25, 0);

  const vistaRoof = new THREE.ConeGeometry(16.0, 6.0, 4);
  appendGeometryToBucket(roofBucket, vistaRoof, 4.0, 21.0, -52.0, 0, Math.PI * 0.25, 0);
  const vistaRoofSouth = new THREE.ConeGeometry(15.0, 5.5, 4);
  appendGeometryToBucket(roofBucket, vistaRoofSouth, -6.0, 18.7, 50.0, 0, Math.PI * 0.25, 0);
  const eastRoof = new THREE.ConeGeometry(8.0, 4.5, 4);
  appendGeometryToBucket(roofBucket, eastRoof, 34.0, 17.2, 4.0, 0, -0.1 + Math.PI * 0.25, 0);

  const geometriesToDispose: THREE.BufferGeometry[] = [];
  const cavityEdgePositions: number[] = [];

  const addStaticMesh = (bucket: GeometryBucket, mat: THREE.Material, addCavityEdges = false) => {
    if (bucket.positions.length === 0) return;
    const geo = finalizeBucketGeometry(bucket);
    geometriesToDispose.push(geo);
    if (addCavityEdges) {
      appendEdgesToArray(geo, cavityEdgePositions, 28);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  };

  addStaticMesh(buckets.MAT_FLOOR_COURTYARD, materials.MAT_FLOOR_COURTYARD, false);
  addStaticMesh(buckets.MAT_WALL_ARCHITECTURAL, materials.MAT_WALL_ARCHITECTURAL, true);
  addStaticMesh(buckets.MAT_COVER_TACTICAL, materials.MAT_COVER_TACTICAL, true);
  addStaticMesh(buckets.MAT_CATWALK_METAL, materials.MAT_CATWALK_METAL, true);
  addStaticMesh(roofBucket, materials.MAT_TERRACOTTA_ROOF, true);
  addStaticMesh(woodBucket, materials.MAT_WOOD_TRIM, false);
  addStaticMesh(stoneBucket, materials.MAT_STONE_TRIM, true);
  addStaticMesh(foliageBucket, materials.MAT_FOLIAGE, false);
  addStaticMesh(lanternBucket, materials.MAT_LANTERN_GLOW, false);

  // Single merged Blender Workbench Cavity Crease Pass (1 draw call for entire map)
  if (cavityEdgePositions.length > 0) {
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(cavityEdgePositions, 3));
    edgeGeo.computeBoundingSphere();
    geometriesToDispose.push(edgeGeo);
    const edgeLines = new THREE.LineSegments(edgeGeo, materials.MAT_CAVITY_EDGES);
    edgeLines.matrixAutoUpdate = false;
    edgeLines.updateMatrix();
    group.add(edgeLines);
  }

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
