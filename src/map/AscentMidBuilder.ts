import * as THREE from 'three';
import { ASCENT_MID_BRUSHES, BUY_BARRIER_PLANES, MapMaterialKey } from './AscentMidData';
import { ProceduralMaterialSet } from '../engine/ProceduralTextures';

export interface BuiltAscentMap {
  group: THREE.Group;
  barriersGroup: THREE.Group;
  setBarriersVisible: (visible: boolean, localIsAtk?: boolean) => void;
  dispose: () => void;
}

interface FlatBucket {
  positions: number[];
  indices: number[];
  vertexOffset: number;
}

function createBucket(): FlatBucket {
  return { positions: [], indices: [], vertexOffset: 0 };
}

const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3(1, 1, 1);
const _v = new THREE.Vector3();

// Exact 12 edges of a unit cube [-0.5, +0.5]^3 (24 vertex endpoints)
const UNIT_BOX_CORNERS: [number, number, number][] = [
  [-0.5, -0.5, -0.5],
  [0.5, -0.5, -0.5],
  [0.5, -0.5, 0.5],
  [-0.5, -0.5, 0.5],
  [-0.5, 0.5, -0.5],
  [0.5, 0.5, -0.5],
  [0.5, 0.5, 0.5],
  [-0.5, 0.5, 0.5],
];

const UNIT_BOX_EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 0], // bottom
  [4, 5], [5, 6], [6, 7], [7, 4], // top
  [0, 4], [1, 5], [2, 6], [3, 7], // verticals
];

/**
 * Appends 1 literal singular rectangular box (12 triangles, zero normals/UVs needed for unlit flat color)
 * AND its exact 12 crisp thin dark outline edges into the merged outline buffer.
 */
function appendSingleBox(
  bucket: FlatBucket,
  outlinePositions: number[] | null,
  w: number,
  h: number,
  d: number,
  px: number,
  py: number,
  pz: number,
  rotY: number
): void {
  const geo = new THREE.BoxGeometry(w, h, d);
  _euler.set(0, rotY, 0, 'YXZ');
  _quat.setFromEuler(_euler);
  _pos.set(px, py, pz);
  _scale.set(1, 1, 1);
  _mat4.compose(_pos, _quat, _scale);

  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const count = posAttr.count;

  for (let i = 0; i < count; i++) {
    _v.fromBufferAttribute(posAttr, i).applyMatrix4(_mat4);
    bucket.positions.push(_v.x, _v.y, _v.z);
  }

  const index = geo.getIndex();
  if (index) {
    for (let i = 0; i < index.count; i++) {
      bucket.indices.push(index.getX(i) + bucket.vertexOffset);
    }
  } else {
    for (let i = 0; i < count; i++) {
      bucket.indices.push(i + bucket.vertexOffset);
    }
  }
  bucket.vertexOffset += count;
  geo.dispose();

  if (outlinePositions) {
    // Expand outline by 2mm outward so line edges never Z-fight with coplanar box faces
    const ow = w + 0.004;
    const oh = h + 0.004;
    const od = d + 0.004;
    for (let e = 0; e < UNIT_BOX_EDGES.length; e++) {
      const [i0, i1] = UNIT_BOX_EDGES[e];
      const c0 = UNIT_BOX_CORNERS[i0];
      const c1 = UNIT_BOX_CORNERS[i1];

      _v.set(c0[0] * ow, c0[1] * oh, c0[2] * od).applyMatrix4(_mat4);
      outlinePositions.push(_v.x, _v.y, _v.z);

      _v.set(c1[0] * ow, c1[1] * oh, c1[2] * od).applyMatrix4(_mat4);
      outlinePositions.push(_v.x, _v.y, _v.z);
    }
  }
}

function finalizeBucketGeometry(bucket: FlatBucket): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3));
  geo.setIndex(bucket.indices);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Literal Single-Box Flat Ascent Mid Builder:
 * - Every collidable brush in ASCENT_MID_BRUSHES is rendered as ONE singular cube/rectangle (12 triangles).
 * - Zero arches, trees, lanterns, roof cones, crate ornaments, lights, reflections, or shadows.
 * - Entire map renders in just 5 draw calls (4 unlit flat color buckets + 1 merged thin dark outline pass).
 */
export function buildAscentMidMap(materials: ProceduralMaterialSet): BuiltAscentMap {
  const group = new THREE.Group();

  const buckets: Record<MapMaterialKey, FlatBucket> = {
    MAT_FLOOR_COURTYARD: createBucket(),
    MAT_WALL_ARCHITECTURAL: createBucket(),
    MAT_COVER_TACTICAL: createBucket(),
    MAT_CATWALK_METAL: createBucket(),
  };

  const outlinePositions: number[] = [];

  for (let i = 0; i < ASCENT_MID_BRUSHES.length; i++) {
    const brush = ASCENT_MID_BRUSHES[i];
    const [w, h, d] = brush.size;
    const [px, py, pz] = brush.pos;
    appendSingleBox(buckets[brush.mat], outlinePositions, w, h, d, px, py, pz, brush.rotY);
  }

  // Single flat outer ground apron beneath the arena so there is no empty void outside perimeter walls
  appendSingleBox(buckets.MAT_FLOOR_COURTYARD, null, 160, 0.4, 160, 0, -0.75, 0, 0);

  const geometriesToDispose: THREE.BufferGeometry[] = [];

  const addFlatMesh = (bucket: FlatBucket, mat: THREE.Material) => {
    if (bucket.positions.length === 0) return;
    const geo = finalizeBucketGeometry(bucket);
    geometriesToDispose.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  };

  addFlatMesh(buckets.MAT_FLOOR_COURTYARD, materials.MAT_FLOOR_COURTYARD);
  addFlatMesh(buckets.MAT_WALL_ARCHITECTURAL, materials.MAT_WALL_ARCHITECTURAL);
  addFlatMesh(buckets.MAT_COVER_TACTICAL, materials.MAT_COVER_TACTICAL);
  addFlatMesh(buckets.MAT_CATWALK_METAL, materials.MAT_CATWALK_METAL);

  // Single merged thin dark outline pass across all boxes (1 draw call)
  if (outlinePositions.length > 0) {
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(outlinePositions, 3));
    edgeGeo.computeBoundingSphere();
    geometriesToDispose.push(edgeGeo);
    const edgeLines = new THREE.LineSegments(edgeGeo, materials.MAT_BOX_OUTLINE);
    edgeLines.matrixAutoUpdate = false;
    edgeLines.updateMatrix();
    group.add(edgeLines);
  }

  // Buy Phase Energy Barriers (flat unlit translucent planes)
  const barriersGroup = new THREE.Group();
  const atkBarrierGeo = new THREE.PlaneGeometry(22.0, 5.2);
  const atkBarrier = new THREE.Mesh(atkBarrierGeo, materials.MAT_BARRIER_ATK);
  atkBarrier.position.set(0, 3.6, BUY_BARRIER_PLANES.ATTACKER_Z);
  barriersGroup.add(atkBarrier);

  const defBarrierGeo = new THREE.PlaneGeometry(22.0, 5.2);
  const defBarrier = new THREE.Mesh(defBarrierGeo, materials.MAT_BARRIER_DEF);
  defBarrier.position.set(0, 2.6, BUY_BARRIER_PLANES.DEFENDER_Z);
  barriersGroup.add(defBarrier);

  geometriesToDispose.push(atkBarrierGeo, defBarrierGeo);
  group.add(barriersGroup);

  return {
    group,
    barriersGroup,
    setBarriersVisible: (visible: boolean, _localIsAtk?: boolean) => {
      barriersGroup.visible = visible;
    },
    dispose: () => {
      for (const g of geometriesToDispose) g.dispose();
    },
  };
}
