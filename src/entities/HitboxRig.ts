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
    const srgb = (hex: number) => new THREE.Color(hex).convertSRGBToLinear();

    // Raw Blender Clay / Workbench 3-value studio palette
    const matClayLight = new THREE.MeshLambertMaterial({ color: srgb(0xe3e4e8) }); // Sculpted vest, gloves, skin/face clay
    const matClayMid = new THREE.MeshLambertMaterial({ color: srgb(0xa3a8b2) }); // Undersuit, tapered trousers
    const matClayDark = new THREE.MeshLambertMaterial({ color: srgb(0x414650) }); // Straps, hair, belt, boots, weapon
    const matClayAccent = new THREE.MeshLambertMaterial({ color: srgb(0x646b78) }); // Collar lining, holsters, kneepads
    const matVisor = new THREE.MeshLambertMaterial({
      color: srgb(0xd6455a),
      emissive: srgb(0x8c1d2e),
    });

    this.segmentMaterials.push(
      matClayLight,
      matVisor,
      matClayMid,
      matClayDark,
      matClayAccent
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
      parent.add(m);
      return m;
    };

    for (let i = 0; i < HITBOX_SEGMENTS.length; i++) {
      const seg = HITBOX_SEGMENTS[i];
      const anchor = new THREE.Group();

      if (seg.id === 'HEAD_CRANIUM') {
        // Sculpted low-poly head: cranial dome + jawline/chin + brow ridge + swept hair & topknot bun
        const cranium = new THREE.SphereGeometry(0.098, 12, 10);
        cranium.scale(0.88, 1.06, 0.98);
        addPart(anchor, cranium, matClayLight, 0, 0.012, 0.005);

        const jaw = new THREE.CylinderGeometry(0.072, 0.044, 0.085, 8);
        jaw.scale(0.95, 1.0, 1.05);
        addPart(anchor, jaw, matClayLight, 0, -0.05, -0.012, 0.14, 0, 0);

        // Tactical eye visor band for crisp head silhouette readability
        const visor = new THREE.BoxGeometry(0.145, 0.026, 0.05);
        addPart(anchor, visor, matVisor, 0, 0.005, -0.078);

        // Swept low-poly hair cap + back bun + bangs
        const hairCap = new THREE.SphereGeometry(0.104, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
        hairCap.scale(0.92, 1.0, 1.05);
        addPart(anchor, hairCap, matClayDark, 0, 0.022, 0.016, -0.25, 0, 0);

        const bun = new THREE.SphereGeometry(0.048, 8, 7);
        bun.scale(0.9, 1.05, 1.15);
        addPart(anchor, bun, matClayDark, 0, 0.088, 0.078, -0.35, 0, 0);

        // Side framing hair strands
        for (const sx of [-1, 1]) {
          const strand = new THREE.ConeGeometry(0.016, 0.11, 5);
          addPart(anchor, strand, matClayDark, sx * 0.078, -0.025, -0.045, 0.1, 0, sx * 0.12);
        }
      } else if (seg.id === 'HEAD_JAW_NECK') {
        // Sculpted neck + flared asymmetrical high collar
        const neck = new THREE.CylinderGeometry(0.046, 0.056, 0.11, 8);
        addPart(anchor, neck, matClayLight, 0, -0.01, 0.005);

        const collar = new THREE.CylinderGeometry(0.125, 0.085, 0.095, 10, 1, true, -Math.PI * 0.72, Math.PI * 1.44);
        collar.rotateY(Math.PI);
        addPart(anchor, collar, matClayLight, 0, 0.015, 0.015, -0.18, 0, 0);
      } else if (seg.id === 'TORSO_UPPER') {
        // Athletic upper torso + cropped asymmetrical jacket + diagonal chest sash + spine pack
        const core = new THREE.CylinderGeometry(0.165, 0.135, 0.34, 10);
        core.scale(1.12, 1.0, 0.66);
        addPart(anchor, core, matClayMid, 0, 0, 0);

        // Cropped armored vest shell
        const vest = new THREE.CylinderGeometry(0.182, 0.160, 0.25, 10);
        vest.scale(1.14, 1.0, 0.72);
        addPart(anchor, vest, matClayLight, 0, 0.035, 0);

        // Shoulder yoke caps
        const yoke = new THREE.BoxGeometry(0.41, 0.06, 0.19);
        addPart(anchor, yoke, matClayLight, 0, 0.145, 0.005);

        // Diagonal tactical strap across chest
        const sash = new THREE.BoxGeometry(0.045, 0.34, 0.22);
        addPart(anchor, sash, matClayDark, 0.0, 0.02, -0.005, 0, 0, 0.62);

        // Back tactical pack
        const pack = new THREE.BoxGeometry(0.18, 0.22, 0.08);
        addPart(anchor, pack, matClayAccent, 0, 0.02, 0.13);

        // Low-poly rifle held across chest
        const rifleBody = new THREE.BoxGeometry(0.042, 0.065, 0.50);
        addPart(anchor, rifleBody, matClayDark, 0.05, -0.06, -0.23, 0.08, 0.34, 0);
        const rifleBarrel = new THREE.CylinderGeometry(0.012, 0.012, 0.32, 7);
        rifleBarrel.rotateX(Math.PI * 0.5);
        addPart(anchor, rifleBarrel, matClayAccent, -0.045, -0.035, -0.48, 0.08, 0.34, 0);
      } else if (seg.id === 'TORSO_LOWER') {
        // Tapered athletic waist + cropped torso gap + sculpted tactical belt & hip holsters
        const waist = new THREE.CylinderGeometry(0.132, 0.155, 0.32, 10);
        waist.scale(1.10, 1.0, 0.68);
        addPart(anchor, waist, matClayMid, 0, 0, 0);

        // Asymmetric utility belt & pouches
        const belt = new THREE.CylinderGeometry(0.168, 0.172, 0.065, 10);
        belt.scale(1.10, 1.0, 0.72);
        addPart(anchor, belt, matClayLight, 0, -0.075, 0, 0, 0, -0.06);

        const strap = new THREE.CylinderGeometry(0.172, 0.172, 0.032, 10);
        strap.scale(1.11, 1.0, 0.73);
        addPart(anchor, strap, matClayDark, 0, -0.105, 0);

        for (const sx of [-1, 1]) {
          const holster = new THREE.BoxGeometry(0.055, 0.12, 0.11);
          addPart(anchor, holster, matClayAccent, sx * 0.185, -0.10, 0.0, 0, 0, sx * -0.1);
        }
      } else if (seg.id === 'ARM_LEFT' || seg.id === 'ARM_RIGHT') {
        const sx = seg.id === 'ARM_LEFT' ? -1 : 1;
        // Connected shoulder -> tapered upper arm -> forearm -> wrist band -> sculpted glove
        const shoulder = new THREE.SphereGeometry(0.058, 8, 7);
        addPart(anchor, shoulder, matClayLight, 0, 0.21, 0.02);

        const upper = new THREE.CylinderGeometry(0.048, 0.040, 0.26, 8);
        addPart(anchor, upper, matClayLight, 0, 0.09, -0.015, -0.32, 0, sx * 0.06);

        const forearm = new THREE.CylinderGeometry(0.040, 0.032, 0.25, 8);
        addPart(anchor, forearm, matClayLight, -sx * 0.055, -0.055, -0.135, -1.05, -sx * 0.34, 0);

        const cuff = new THREE.CylinderGeometry(0.036, 0.036, 0.035, 8);
        addPart(anchor, cuff, matClayDark, -sx * 0.10, -0.098, -0.22, -1.05, -sx * 0.34, 0);

        const glove = new THREE.BoxGeometry(0.046, 0.042, 0.068);
        addPart(anchor, glove, matClayLight, -sx * 0.12, -0.115, -0.255, 0.1, -sx * 0.3, 0);
      } else if (seg.id === 'LEG_LEFT_UPPER' || seg.id === 'LEG_RIGHT_UPPER') {
        // Tapered jogger thigh + knee crease + sculpted kneepad
        const thigh = new THREE.CylinderGeometry(0.082, 0.062, 0.44, 9);
        addPart(anchor, thigh, matClayMid, 0, 0, 0);

        const kneePad = new THREE.SphereGeometry(0.058, 8, 6);
        kneePad.scale(0.95, 1.15, 0.75);
        addPart(anchor, kneePad, matClayAccent, 0, -0.19, -0.038);
      } else if (seg.id === 'LEGS_LOWER_PAIR') {
        // Tapered calves + bunched ankle cuffs + low-poly tactical boots
        for (const sx of [-1, 1]) {
          const lx = sx * 0.115;
          const shin = new THREE.CylinderGeometry(0.062, 0.044, 0.30, 9);
          addPart(anchor, shin, matClayMid, lx, 0.06, 0.0);

          const cuff = new THREE.CylinderGeometry(0.054, 0.050, 0.06, 8);
          addPart(anchor, cuff, matClayLight, lx, -0.08, 0.0);

          const bootShaft = new THREE.CylinderGeometry(0.046, 0.052, 0.11, 8);
          addPart(anchor, bootShaft, matClayDark, lx, -0.145, 0.0);

          const bootFoot = new THREE.BoxGeometry(0.095, 0.068, 0.20);
          addPart(anchor, bootFoot, matClayLight, lx, -0.195, -0.045);

          const bootSole = new THREE.BoxGeometry(0.102, 0.022, 0.21);
          addPart(anchor, bootSole, matClayDark, lx, -0.225, -0.045);
        }
      }

      this.segmentAnchors.push(anchor);
      group.add(anchor);
    }

    // Soft grounded clay contact shadow disc
    const shadowGeo = new THREE.CircleGeometry(0.46, 16);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x22262e,
      transparent: true,
      opacity: 0.34,
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
          this.segmentMaterials[i].emissive.setHex(i === 1 ? 0x8c1d2e : 0x000000);
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
