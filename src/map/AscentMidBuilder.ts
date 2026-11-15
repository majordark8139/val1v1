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

function appendBoxToBucket(bucket: GeometryBucket, brush: MapBrush): void {
  const [w, h, d] = brush.size;
  const [px, py, pz] = brush.pos;

  const boxGeo = new THREE.BoxGeometry(w, h, d);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, brush.rotY, 0, 'YXZ'));
  matrix.compose(new THREE.Vector3(px, py, pz), quat, new THREE.Vector3(1, 1, 1));
  boxGeo.applyMatrix4(matrix);

  const posAttr = boxGeo.attributes.position as THREE.BufferAttribute;
  const normAttr = boxGeo.attributes.normal as THREE.BufferAttribute;
  const uvAttr = boxGeo.attributes.uv as THREE.BufferAttribute;
  const idxAttr = boxGeo.index!;

  // World-scale UV tiling so 1 meter = 1 grid tile across faces
  // BoxGeometry has 6 faces * 4 vertices = 24 vertices: +X, -X, +Y, -Y, +Z, -Z
  const faceScales: [number, number][] = [
    [d, h], // +X
    [d, h], // -X
    [w, d], // +Y
    [w, d], // -Y
    [w, h], // +Z
    [w, h], // -Z
  ];

  for (let v = 0; v < posAttr.count; v++) {
    bucket.positions.push(posAttr.getX(v), posAttr.getY(v), posAttr.getZ(v));
    bucket.normals.push(normAttr.getX(v), normAttr.getY(v), normAttr.getZ(v));

    const faceIdx = Math.floor(v / 4);
    const [su, sv] = faceScales[faceIdx] ?? [1, 1];
    // For tactical crates (MAT_COVER_TACTICAL), keep 1:1 border framing on smaller crates or scale by 1m
    if (brush.mat === 'MAT_COVER_TACTICAL') {
      bucket.uvs.push(uvAttr.getX(v), uvAttr.getY(v));
    } else {
      bucket.uvs.push(uvAttr.getX(v) * su, uvAttr.getY(v) * sv);
    }
  }

  for (let i = 0; i < idxAttr.count; i++) {
    bucket.indices.push(idxAttr.getX(i) + bucket.vertexOffset);
  }

  bucket.vertexOffset += posAttr.count;
  boxGeo.dispose();
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

  const edgePositions: number[] = [];
  const mat4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const posVec = new THREE.Vector3();
  const scaleVec = new THREE.Vector3(1, 1, 1);
  const vTemp = new THREE.Vector3();

  for (let i = 0; i < ASCENT_MID_BRUSHES.length; i++) {
    const brush = ASCENT_MID_BRUSHES[i];
    appendBoxToBucket(buckets[brush.mat], brush);

    if (brush.collidable) {
      const unitBox = new THREE.BoxGeometry(brush.size[0], brush.size[1], brush.size[2]);
      const edges = new THREE.EdgesGeometry(unitBox, 15);
      const edgeAttr = edges.attributes.position as THREE.BufferAttribute;
      euler.set(0, brush.rotY, 0, 'YXZ');
      quat.setFromEuler(euler);
      posVec.set(brush.pos[0], brush.pos[1], brush.pos[2]);
      mat4.compose(posVec, quat, scaleVec);

      for (let e = 0; e < edgeAttr.count; e++) {
        vTemp.fromBufferAttribute(edgeAttr, e).applyMatrix4(mat4);
        edgePositions.push(vTemp.x, vTemp.y, vTemp.z);
      }
      unitBox.dispose();
      edges.dispose();
    }
  }

  const geometriesToDispose: THREE.BufferGeometry[] = [];

  // 4 merged static mesh draw calls (one per material bucket)
  const keys: MapMaterialKey[] = [
    'MAT_FLOOR_COURTYARD',
    'MAT_WALL_ARCHITECTURAL',
    'MAT_COVER_TACTICAL',
    'MAT_CATWALK_METAL',
  ];

  for (const key of keys) {
    const geo = finalizeBucketGeometry(buckets[key]);
    geometriesToDispose.push(geo);
    const mesh = new THREE.Mesh(geo, materials[key]);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  }

  // 1 merged edge highlight LineSegments draw call
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
  edgeGeo.computeBoundingSphere();
  geometriesToDispose.push(edgeGeo);

  const edgeMat = new THREE.LineBasicMaterial({
    color: 0x1e242b,
    transparent: true,
    opacity: 0.42,
  });
  const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
  edgeLines.matrixAutoUpdate = false;
  edgeLines.updateMatrix();
  group.add(edgeLines);

  // Buy Phase Energy Barriers
  const barriersGroup = new THREE.Group();
  const atkBarrierGeo = new THREE.PlaneGeometry(22.0, 6.0);
  const atkBarrier = new THREE.Mesh(atkBarrierGeo, materials.MAT_BARRIER_SPAWN);
  atkBarrier.position.set(0, 3.0, BUY_BARRIER_PLANES.ATTACKER_Z);

  const defBarrierGeo = new THREE.PlaneGeometry(16.0, 6.0);
  const defBarrier = new THREE.Mesh(defBarrierGeo, materials.MAT_BARRIER_SPAWN);
  defBarrier.position.set(0, 3.0, BUY_BARRIER_PLANES.DEFENDER_Z);

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
      edgeMat.dispose();
    },
  };
}
