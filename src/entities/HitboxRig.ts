import * as THREE from 'three';
import { HitTier } from '../config/WeaponData';

export type HitboxSegmentId =
  | 'HEAD_CRANIUM'
  | 'HEAD_JAW_NECK'
  | 'TORSO_UPPER'
  | 'TORSO_LOWER'
  | 'ARM_LEFT'
  | 'ARM_RIGHT'
  | 'LEG_LEFT_UPPER'
  | 'LEG_RIGHT_UPPER'
  | 'LEGS_LOWER_PAIR';

export interface HitboxSegmentDef {
  id: HitboxSegmentId;
  tier: HitTier;
  size: [number, number, number];
  standCenter: [number, number, number];
  crouchCenter: [number, number, number];
  pitchWeight: number;
  color: number;
}

export const HITBOX_SEGMENTS: HitboxSegmentDef[] = [
  {
    id: 'HEAD_CRANIUM',
    tier: 'HEAD',
    size: [0.21, 0.21, 0.23],
    standCenter: [0.0, 1.855, 0.0],
    crouchCenter: [0.0, 1.245, -0.06],
    pitchWeight: 0.5,
    color: 0xffb703,
  },
  {
    id: 'HEAD_JAW_NECK',
    tier: 'HEAD',
    size: [0.16, 0.13, 0.17],
    standCenter: [0.0, 1.685, 0.01],
    crouchCenter: [0.0, 1.075, -0.04],
    pitchWeight: 0.25,
    color: 0xe63946,
  },
  {
    id: 'TORSO_UPPER',
    tier: 'TORSO',
    size: [0.44, 0.36, 0.26],
    standCenter: [0.0, 1.44, 0.0],
    crouchCenter: [0.0, 0.89, -0.02],
    pitchWeight: 0.0,
    color: 0xe63946,
  },
  {
    id: 'TORSO_LOWER',
    tier: 'TORSO',
    size: [0.40, 0.34, 0.24],
    standCenter: [0.0, 1.09, 0.0],
    crouchCenter: [0.0, 0.61, 0.04],
    pitchWeight: 0.0,
    color: 0xc1121f,
  },
  {
    id: 'ARM_LEFT',
    tier: 'TORSO',
    size: [0.15, 0.62, 0.16],
    standCenter: [-0.295, 1.31, -0.05],
    crouchCenter: [-0.295, 0.82, -0.08],
    pitchWeight: 0.0,
    color: 0x1d3557,
  },
  {
    id: 'ARM_RIGHT',
    tier: 'TORSO',
    size: [0.15, 0.62, 0.16],
    standCenter: [0.295, 1.31, -0.05],
    crouchCenter: [0.295, 0.82, -0.08],
    pitchWeight: 0.0,
    color: 0x1d3557,
  },
  {
    id: 'LEG_LEFT_UPPER',
    tier: 'LEGS',
    size: [0.18, 0.46, 0.20],
    standCenter: [-0.115, 0.69, 0.0],
    crouchCenter: [-0.125, 0.42, -0.10],
    pitchWeight: 0.0,
    color: 0x1d3557,
  },
  {
    id: 'LEG_RIGHT_UPPER',
    tier: 'LEGS',
    size: [0.18, 0.46, 0.20],
    standCenter: [0.115, 0.69, 0.0],
    crouchCenter: [0.125, 0.42, -0.10],
    pitchWeight: 0.0,
    color: 0x1d3557,
  },
  {
    id: 'LEGS_LOWER_PAIR',
    tier: 'LEGS',
    size: [0.40, 0.46, 0.20],
    standCenter: [0.0, 0.23, 0.0],
    crouchCenter: [0.0, 0.23, 0.08],
    pitchWeight: 0.0,
    color: 0x14213d,
  },
];

export interface PlayerPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  crouchAlpha: number;
}

export interface HitboxRayHit {
  hit: boolean;
  segmentId: HitboxSegmentId | null;
  tier: HitTier | null;
  distance: number;
  hitX: number;
  hitY: number;
  hitZ: number;
}

const HEAD_PRIORITY_WINDOW = 0.18;

// Pre-allocated scratch math objects (Zero-GC)
const _rootPos = new THREE.Vector3();
const _rootQuat = new THREE.Quaternion();
const _rootScale = new THREE.Vector3(1, 1, 1);
const _rootMat = new THREE.Matrix4();
const _localPos = new THREE.Vector3();
const _localQuat = new THREE.Quaternion();
const _localEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _localMat = new THREE.Matrix4();
const _worldMat = new THREE.Matrix4();
const _invMat = new THREE.Matrix4();
const _originVec = new THREE.Vector3();
const _dirVec = new THREE.Vector3();
const _localOrigin = new THREE.Vector3();
const _localEnd = new THREE.Vector3();
const _localDir = new THREE.Vector3();
const _worldEnd = new THREE.Vector3();
const _rootEuler = new THREE.Euler(0, 0, 0, 'YXZ');

interface SegmentHitRecord {
  segmentId: HitboxSegmentId;
  tier: HitTier;
  distance: number;
}

export class HitboxRig {
  public readonly segmentMatrices: THREE.Matrix4[] = [];
  private readonly hitRecords: SegmentHitRecord[] = [];

  // Optional visual Three.js hierarchy
  public group: THREE.Group | null = null;
  private segmentMeshes: THREE.Mesh[] = [];
  private segmentMaterials: THREE.MeshLambertMaterial[] = [];
  private contactShadow: THREE.Mesh | null = null;
  private hitFlashTimer = 0;

  constructor(createVisuals = false) {
    for (let i = 0; i < HITBOX_SEGMENTS.length; i++) {
      this.segmentMatrices.push(new THREE.Matrix4());
      this.hitRecords.push({
        segmentId: HITBOX_SEGMENTS[i].id,
        tier: HITBOX_SEGMENTS[i].tier,
        distance: Infinity,
      });
    }

    if (createVisuals) {
      this.buildVisualGroup();
    }
  }

  private buildVisualGroup(): void {
    const group = new THREE.Group();
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x0b0e14 });

    for (let i = 0; i < HITBOX_SEGMENTS.length; i++) {
      const seg = HITBOX_SEGMENTS[i];
      const geo = new THREE.BoxGeometry(seg.size[0], seg.size[1], seg.size[2]);
      const mat = new THREE.MeshLambertMaterial({ color: seg.color });
      const mesh = new THREE.Mesh(geo, mat);
      const edges = new THREE.EdgesGeometry(geo, 15);
      const line = new THREE.LineSegments(edges, edgeMat);
      mesh.add(line);

      // Add high-visibility gold visor trim on HEAD_CRANIUM for instant silhouette readability
      if (seg.id === 'HEAD_CRANIUM') {
        const visorGeo = new THREE.BoxGeometry(seg.size[0] + 0.015, 0.055, 0.06);
        const visorMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
        const visor = new THREE.Mesh(visorGeo, visorMat);
        visor.position.set(0, 0.02, -seg.size[2] * 0.42);
        mesh.add(visor);
      }

      this.segmentMeshes.push(mesh);
      this.segmentMaterials.push(mat);
      group.add(mesh);
    }

    // Grounded contact shadow disc
    const shadowGeo = new THREE.CircleGeometry(0.45, 16);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.position.set(0, 0.015, 0);
    group.add(shadow);
    this.contactShadow = shadow;

    this.group = group;
  }

  public triggerHitFlash(duration = 0.055): void {
    this.hitFlashTimer = duration;
    for (let i = 0; i < this.segmentMaterials.length; i++) {
      this.segmentMaterials[i].emissive.setHex(0xffffff);
    }
  }

  public updateVisualEffects(dt: number): void {
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      if (this.hitFlashTimer <= 0) {
        this.hitFlashTimer = 0;
        for (let i = 0; i < this.segmentMaterials.length; i++) {
          this.segmentMaterials[i].emissive.setHex(0x000000);
        }
      }
    }
  }

  public updatePose(pose: PlayerPose, updateVisuals = false): void {
    _rootPos.set(pose.x, pose.y, pose.z);
    _rootEuler.set(0, pose.yaw, 0, 'YXZ');
    _rootQuat.setFromEuler(_rootEuler);
    _rootMat.compose(_rootPos, _rootQuat, _rootScale);

    const a = pose.crouchAlpha < 0 ? 0 : pose.crouchAlpha > 1 ? 1 : pose.crouchAlpha;

    for (let i = 0; i < HITBOX_SEGMENTS.length; i++) {
      const seg = HITBOX_SEGMENTS[i];
      const lx = seg.standCenter[0] + (seg.crouchCenter[0] - seg.standCenter[0]) * a;
      const ly = seg.standCenter[1] + (seg.crouchCenter[1] - seg.standCenter[1]) * a;
      const lz = seg.standCenter[2] + (seg.crouchCenter[2] - seg.standCenter[2]) * a;

      _localPos.set(lx, ly, lz);
      _localEuler.set(pose.pitch * seg.pitchWeight, 0, 0, 'YXZ');
      _localQuat.setFromEuler(_localEuler);
      _localMat.compose(_localPos, _localQuat, _rootScale);

      this.segmentMatrices[i].multiplyMatrices(_rootMat, _localMat);

      if (updateVisuals && this.segmentMeshes.length > 0) {
        const mesh = this.segmentMeshes[i];
        mesh.position.set(lx, ly, lz);
        mesh.rotation.set(pose.pitch * seg.pitchWeight, 0, 0, 'YXZ');
      }
    }

    if (updateVisuals && this.group) {
      this.group.position.set(pose.x, pose.y, pose.z);
      this.group.rotation.set(0, pose.yaw, 0, 'YXZ');
      if (this.contactShadow) {
        this.contactShadow.position.set(0, 0.015, 0);
      }
    }
  }

  public raycast(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDist: number,
    out?: HitboxRayHit
  ): HitboxRayHit {
    const result: HitboxRayHit = out ?? {
      hit: false,
      segmentId: null,
      tier: null,
      distance: maxDist,
      hitX: 0,
      hitY: 0,
      hitZ: 0,
    };

    result.hit = false;
    result.segmentId = null;
    result.tier = null;
    result.distance = maxDist;

    _originVec.set(ox, oy, oz);
    _dirVec.set(dx, dy, dz).normalize();
    _worldEnd.copy(_originVec).add(_dirVec);

    let hitCount = 0;
    let minT = maxDist;

    for (let i = 0; i < HITBOX_SEGMENTS.length; i++) {
      const seg = HITBOX_SEGMENTS[i];
      _worldMat.copy(this.segmentMatrices[i]);
      _invMat.copy(_worldMat).invert();

      _localOrigin.copy(_originVec).applyMatrix4(_invMat);
      _localEnd.copy(_worldEnd).applyMatrix4(_invMat);
      _localDir.subVectors(_localEnd, _localOrigin);
      const scaleLen = _localDir.length();
      if (scaleLen < 1e-8) continue;
      _localDir.divideScalar(scaleLen);

      const hx = seg.size[0] * 0.5;
      const hy = seg.size[1] * 0.5;
      const hz = seg.size[2] * 0.5;

      const tLocal = intersectRayAABB(
        _localOrigin.x,
        _localOrigin.y,
        _localOrigin.z,
        _localDir.x,
        _localDir.y,
        _localDir.z,
        hx,
        hy,
        hz
      );

      if (tLocal >= 0) {
        const worldT = tLocal / scaleLen;
        if (worldT <= maxDist) {
          this.hitRecords[hitCount].segmentId = seg.id;
          this.hitRecords[hitCount].tier = seg.tier;
          this.hitRecords[hitCount].distance = worldT;
          hitCount++;
          if (worldT < minT) {
            minT = worldT;
          }
        }
      }
    }

    if (hitCount === 0) {
      return result;
    }

    // Tier Priority Rule: prioritize HEAD within 0.18m depth window
    let chosenIdx = -1;
    let bestHeadT = Infinity;
    let bestAnyT = Infinity;
    let bestAnyIdx = -1;

    for (let i = 0; i < hitCount; i++) {
      const rec = this.hitRecords[i];
      if (rec.distance < bestAnyT) {
        bestAnyT = rec.distance;
        bestAnyIdx = i;
      }
      if (rec.tier === 'HEAD' && rec.distance <= minT + HEAD_PRIORITY_WINDOW) {
        if (rec.distance < bestHeadT) {
          bestHeadT = rec.distance;
          chosenIdx = i;
        }
      }
    }

    if (chosenIdx === -1) {
      chosenIdx = bestAnyIdx;
    }

    const winner = this.hitRecords[chosenIdx];
    result.hit = true;
    result.segmentId = winner.segmentId;
    result.tier = winner.tier;
    result.distance = winner.distance;
    result.hitX = ox + _dirVec.x * winner.distance;
    result.hitY = oy + _dirVec.y * winner.distance;
    result.hitZ = oz + _dirVec.z * winner.distance;

    return result;
  }
}

function intersectRayAABB(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  hx: number,
  hy: number,
  hz: number
): number {
  let tMin = 0.0;
  let tMax = Infinity;

  // X
  if (Math.abs(dx) < 1e-8) {
    if (ox < -hx || ox > hx) return -1;
  } else {
    const inv = 1.0 / dx;
    let t1 = (-hx - ox) * inv;
    let t2 = (hx - ox) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return -1;
  }

  // Y
  if (Math.abs(dy) < 1e-8) {
    if (oy < -hy || oy > hy) return -1;
  } else {
    const inv = 1.0 / dy;
    let t1 = (-hy - oy) * inv;
    let t2 = (hy - oy) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return -1;
  }

  // Z
  if (Math.abs(dz) < 1e-8) {
    if (oz < -hz || oz > hz) return -1;
  } else {
    const inv = 1.0 / dz;
    let t1 = (-hz - oz) * inv;
    let t2 = (hz - oz) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return -1;
  }

  return tMin;
}
