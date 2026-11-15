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
  private segmentAnchors: THREE.Group[] = [];
  private segmentMaterials: THREE.MeshStandardMaterial[] = [];
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

    const srgb = (hex: number) => new THREE.Color(hex).convertSRGBToLinear();

    const matHelmet = new THREE.MeshStandardMaterial({
      color: srgb(0x262d38),
      roughness: 0.42,
      metalness: 0.45,
      envMapIntensity: 0.65,
    });
    const matVisor = new THREE.MeshStandardMaterial({
      color: srgb(0xff4d6d),
      emissive: srgb(0xff2e54),
      emissiveIntensity: 0.65,
      roughness: 0.18,
      metalness: 0.4,
    });
    const matMask = new THREE.MeshStandardMaterial({
      color: srgb(0x161b22),
      roughness: 0.82,
      metalness: 0.15,
      envMapIntensity: 0.3,
    });
    const matJacket = new THREE.MeshStandardMaterial({
      color: srgb(0xb92b3a),
      roughness: 0.82,
      metalness: 0.06,
      envMapIntensity: 0.3,
    });
    const matArmor = new THREE.MeshStandardMaterial({
      color: srgb(0x1d232d),
      roughness: 0.55,
      metalness: 0.42,
      envMapIntensity: 0.5,
    });
    const matTrim = new THREE.MeshStandardMaterial({
      color: srgb(0xd9a44e),
      roughness: 0.32,
      metalness: 0.78,
    });
    const matPants = new THREE.MeshStandardMaterial({
      color: srgb(0x222938),
      roughness: 0.86,
      metalness: 0.05,
      envMapIntensity: 0.25,
    });
    const matBoots = new THREE.MeshStandardMaterial({
      color: srgb(0x12151b),
      roughness: 0.7,
      metalness: 0.18,
      envMapIntensity: 0.3,
    });
    const matGun = new THREE.MeshStandardMaterial({
      color: srgb(0x2d333d),
      roughness: 0.35,
      metalness: 0.78,
    });

    this.segmentMaterials.push(
      matHelmet,
      matVisor,
      matMask,
      matJacket,
      matArmor,
      matTrim,
      matPants,
      matBoots,
      matGun
    );

    const addPart = (
      parent: THREE.Object3D,
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      x: number,
      y: number,
      z: number,
      rx = 0,
      ry = 0,
      rz = 0
    ) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    for (let i = 0; i < HITBOX_SEGMENTS.length; i++) {
      const seg = HITBOX_SEGMENTS[i];
      const anchor = new THREE.Group();

      if (seg.id === 'HEAD_CRANIUM') {
        // Sculpted tactical helmet dome + brow shield + panoramic crimson visor + ear comms
        const dome = new THREE.SphereGeometry(0.112, 14, 12);
        dome.scale(0.95, 1.04, 1.08);
        addPart(anchor, dome, matHelmet, 0, 0.005, 0.005);

        const brow = new THREE.CylinderGeometry(0.115, 0.118, 0.036, 12, 1, false, Math.PI * 0.65, Math.PI * 0.7);
        addPart(anchor, brow, matArmor, 0, 0.04, -0.01);

        const visor = new THREE.BoxGeometry(0.165, 0.048, 0.045);
        addPart(anchor, visor, matVisor, 0, -0.01, -0.098);

        for (const sx of [-1, 1]) {
          const ear = new THREE.CylinderGeometry(0.034, 0.034, 0.03, 10);
          ear.rotateZ(Math.PI * 0.5);
          addPart(anchor, ear, matTrim, sx * 0.105, -0.01, 0.01);
        }
      } else if (seg.id === 'HEAD_JAW_NECK') {
        // Respirator jawline + neck gaiter
        const neck = new THREE.CylinderGeometry(0.056, 0.068, 0.11, 10);
        addPart(anchor, neck, matMask, 0, -0.015, 0.0);
        const mask = new THREE.CylinderGeometry(0.068, 0.058, 0.075, 10);
        addPart(anchor, mask, matArmor, 0, 0.03, -0.015);
      } else if (seg.id === 'TORSO_UPPER') {
        // Tailored tactical jacket + ballistic chest plate + shoulder yoke + spine pack + held rifle
        const chest = new THREE.CylinderGeometry(0.205, 0.185, 0.36, 12);
        chest.scale(1.08, 1.0, 0.68);
        addPart(anchor, chest, matJacket, 0, 0, 0);

        const plate = new THREE.BoxGeometry(0.32, 0.28, 0.25);
        addPart(anchor, plate, matArmor, 0, 0.02, -0.005);

        const collar = new THREE.CylinderGeometry(0.12, 0.15, 0.07, 10);
        addPart(anchor, collar, matArmor, 0, 0.18, 0);

        const crest = new THREE.BoxGeometry(0.18, 0.035, 0.265);
        addPart(anchor, crest, matTrim, 0, 0.07, -0.01);

        const pack = new THREE.BoxGeometry(0.22, 0.25, 0.09);
        addPart(anchor, pack, matMask, 0, 0.01, 0.15);

        // Tactical rifle held across chest
        const rifleBody = new THREE.BoxGeometry(0.05, 0.075, 0.52);
        addPart(anchor, rifleBody, matGun, 0.06, -0.06, -0.24, 0.08, 0.36, 0);
        const rifleBarrel = new THREE.CylinderGeometry(0.014, 0.014, 0.34, 8);
        rifleBarrel.rotateX(Math.PI * 0.5);
        addPart(anchor, rifleBarrel, matArmor, -0.04, -0.03, -0.50, 0.08, 0.36, 0);
      } else if (seg.id === 'TORSO_LOWER') {
        // Waist + utility belt + pouches
        const waist = new THREE.CylinderGeometry(0.182, 0.195, 0.34, 12);
        waist.scale(1.05, 1.0, 0.66);
        addPart(anchor, waist, matJacket, 0, 0, 0);

        const belt = new THREE.CylinderGeometry(0.198, 0.198, 0.065, 12);
        belt.scale(1.06, 1.0, 0.70);
        addPart(anchor, belt, matArmor, 0, -0.09, 0);

        const buckle = new THREE.BoxGeometry(0.07, 0.055, 0.03);
        addPart(anchor, buckle, matTrim, 0, -0.09, -0.135);
      } else if (seg.id === 'ARM_LEFT' || seg.id === 'ARM_RIGHT') {
        const isLeft = seg.id === 'ARM_LEFT';
        const sx = isLeft ? -1 : 1;
        // Shoulder pauldron
        const pauldron = new THREE.SphereGeometry(0.082, 10, 8);
        addPart(anchor, pauldron, matArmor, 0, 0.22, 0.02);

        // Upper arm sleeve angled slightly forward toward weapon
        const upper = new THREE.CylinderGeometry(0.058, 0.050, 0.28, 9);
        addPart(anchor, upper, matJacket, 0, 0.09, -0.02, -0.35, 0, sx * 0.08);

        // Forearm + tactical bracer angled inward toward chest weapon
        const forearm = new THREE.CylinderGeometry(0.048, 0.040, 0.26, 9);
        addPart(anchor, forearm, matArmor, -sx * 0.06, -0.06, -0.14, -1.05, -sx * 0.35, 0);

        // Gloved hand
        const hand = new THREE.SphereGeometry(0.042, 8, 8);
        addPart(anchor, hand, matBoots, -sx * 0.12, -0.11, -0.25);
      } else if (seg.id === 'LEG_LEFT_UPPER' || seg.id === 'LEG_RIGHT_UPPER') {
        // Tapered tactical trouser thigh + holster/thigh strap
        const thigh = new THREE.CylinderGeometry(0.088, 0.072, 0.44, 10);
        addPart(anchor, thigh, matPants, 0, 0, 0);
        const strap = new THREE.CylinderGeometry(0.082, 0.082, 0.055, 10);
        addPart(anchor, strap, matArmor, 0, 0.04, 0);
        const kneePad = new THREE.BoxGeometry(0.11, 0.11, 0.06);
        addPart(anchor, kneePad, matArmor, 0, -0.19, -0.055);
      } else if (seg.id === 'LEGS_LOWER_PAIR') {
        // Left & Right shin greaves + sculpted tactical boots
        for (const sx of [-1, 1]) {
          const lx = sx * 0.115;
          const shin = new THREE.CylinderGeometry(0.068, 0.055, 0.34, 10);
          addPart(anchor, shin, matPants, lx, 0.05, 0.0);

          const bootShaft = new THREE.CylinderGeometry(0.062, 0.066, 0.13, 10);
          addPart(anchor, bootShaft, matBoots, lx, -0.14, 0.0);

          const bootToe = new THREE.BoxGeometry(0.11, 0.08, 0.21);
          addPart(anchor, bootToe, matBoots, lx, -0.19, -0.045);

          const bootSole = new THREE.BoxGeometry(0.115, 0.025, 0.22);
          addPart(anchor, bootSole, matArmor, lx, -0.22, -0.045);
        }
      }

      this.segmentAnchors.push(anchor);
      group.add(anchor);
    }

    // Soft grounded contact shadow disc
    const shadowGeo = new THREE.CircleGeometry(0.46, 20);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x090c12,
      transparent: true,
      opacity: 0.42,
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
          // Index 1 is matVisor which retains subtle tactical glow
          this.segmentMaterials[i].emissive.setHex(i === 1 ? 0xff2e54 : 0x000000);
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

      if (updateVisuals && this.segmentAnchors.length > 0) {
        const anchor = this.segmentAnchors[i];
        anchor.position.set(lx, ly, lz);
        anchor.rotation.set(pose.pitch * seg.pitchWeight, 0, 0, 'YXZ');
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
