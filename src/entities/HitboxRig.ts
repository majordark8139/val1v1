import * as THREE from 'three';
import { HitTier } from '../config/WeaponData';
import { createStudioMatcapTexture } from '../engine/ProceduralTextures';

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
  stridePhase?: number;
  strideAmp?: number;
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

  // Watertight hierarchical humanoid rig (true parent->child bone joints, zero floating parts)
  public group: THREE.Group | null = null;
  private bodyPivot: THREE.Group | null = null;
  private headPivot: THREE.Group | null = null;
  private thighLeftPivot: THREE.Group | null = null;
  private thighRightPivot: THREE.Group | null = null;
  private shinLeftPivot: THREE.Group | null = null;
  private shinRightPivot: THREE.Group | null = null;
  private matcapMaterials: THREE.MeshMatcapMaterial[] = [];
  private matcapTextures: THREE.Texture[] = [];
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

    // High-contrast dark charcoal tactical clay MatCaps with baked Valorant-style crimson Fresnel edge rim
    // Guarantees instant enemy silhouette readability against light clay walls at 2m or 45m at 0 shader cost
    const texSuit = createStudioMatcapTexture({
      highlight: '#3d4554',
      midtone: '#232833',
      shadow: '#12151c',
      rim: '#ff4252',
      rimStrength: 0.72,
      specular: 0.08,
    });
    const texArmor = createStudioMatcapTexture({
      highlight: '#596375',
      midtone: '#38404f',
      shadow: '#1d222c',
      rim: '#ff4252',
      rimStrength: 0.65,
      specular: 0.14,
    });
    const texDark = createStudioMatcapTexture({
      highlight: '#2d323d',
      midtone: '#181b22',
      shadow: '#0c0e13',
      rim: '#ff4252',
      rimStrength: 0.55,
      specular: 0.18,
    });
    const texFace = createStudioMatcapTexture({
      highlight: '#989fa8',
      midtone: '#747b85',
      shadow: '#464b54',
      rim: '#ff4252',
      rimStrength: 0.58,
      specular: 0.05,
    });
    const texAccent = createStudioMatcapTexture({
      highlight: '#f05465',
      midtone: '#c93245',
      shadow: '#731926',
      rim: '#ff6b78',
      rimStrength: 0.45,
      specular: 0.15,
    });

    this.matcapTextures.push(texSuit, texArmor, texDark, texFace, texAccent);

    const matSuit = new THREE.MeshMatcapMaterial({ matcap: texSuit });
    const matArmor = new THREE.MeshMatcapMaterial({ matcap: texArmor });
    const matDark = new THREE.MeshMatcapMaterial({ matcap: texDark });
    const matFace = new THREE.MeshMatcapMaterial({ matcap: texFace });
    const matAccent = new THREE.MeshMatcapMaterial({ matcap: texAccent });

    this.matcapMaterials.push(matSuit, matArmor, matDark, matFace, matAccent);

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

    // =========================================================================
    // 1. PELVIS & TORSO PIVOT (y = 0.92m standing)
    // =========================================================================
    const bodyPivot = new THREE.Group();
    bodyPivot.position.set(0, 0.92, 0);
    group.add(bodyPivot);
    this.bodyPivot = bodyPivot;

    // Continuous athletic LatheGeometry pelvis -> waist -> chest -> shoulders -> neck
    const torsoPts = [
      new THREE.Vector2(0.01, -0.05),
      new THREE.Vector2(0.148, 0.00),
      new THREE.Vector2(0.152, 0.09),
      new THREE.Vector2(0.122, 0.24), // Athletic tapered waist
      new THREE.Vector2(0.168, 0.43), // Chest
      new THREE.Vector2(0.194, 0.56), // Broad shoulders
      new THREE.Vector2(0.145, 0.64), // Trapezius
      new THREE.Vector2(0.062, 0.68), // Neck base
      new THREE.Vector2(0.056, 0.78), // Neck upper core (embeds deeply into skull)
    ];
    const torsoGeo = new THREE.LatheGeometry(torsoPts, 12);
    torsoGeo.scale(1.08, 1.0, 0.68);
    addPart(bodyPivot, torsoGeo, matSuit, 0, 0, 0);

    // Sculpted Tactical Plate Carrier / Jacket Shell (proud 1.4cm offset -> zero Z-fighting)
    const vestPts = [
      new THREE.Vector2(0.132, 0.24),
      new THREE.Vector2(0.180, 0.42),
      new THREE.Vector2(0.205, 0.56),
      new THREE.Vector2(0.156, 0.635),
      new THREE.Vector2(0.072, 0.655),
    ];
    const vestGeo = new THREE.LatheGeometry(vestPts, 12);
    vestGeo.scale(1.09, 1.0, 0.72);
    addPart(bodyPivot, vestGeo, matArmor, 0, 0, 0);

    // Front chest plate & subtle crimson tactical chest insignia
    addPart(bodyPivot, new THREE.BoxGeometry(0.24, 0.24, 0.045), matDark, 0, 0.45, -0.125, -0.08, 0, 0);
    addPart(bodyPivot, new THREE.BoxGeometry(0.16, 0.025, 0.02), matAccent, 0, 0.53, -0.146, -0.08, 0, 0);
    // 3 Compact mag pouches across lower chest rig
    for (const mx of [-0.075, 0, 0.075]) {
      addPart(bodyPivot, new THREE.BoxGeometry(0.055, 0.095, 0.04), matDark, mx, 0.30, -0.122, 0.06, 0, 0);
    }

    // High structured tactical collar wrapping cleanly around neck base (closed cylinder)
    const collarGeo = new THREE.CylinderGeometry(0.092, 0.108, 0.095, 10);
    collarGeo.scale(1.05, 1.0, 0.92);
    addPart(bodyPivot, collarGeo, matDark, 0, 0.685, 0.005);
    const collarTrim = new THREE.CylinderGeometry(0.095, 0.095, 0.020, 10);
    collarTrim.scale(1.05, 1.0, 0.92);
    addPart(bodyPivot, collarTrim, matAccent, 0, 0.728, 0.005);

    // Utility Belt + Side Holsters + Back Tactical Pack
    const beltGeo = new THREE.CylinderGeometry(0.160, 0.165, 0.072, 12);
    beltGeo.scale(1.10, 1.0, 0.73);
    addPart(bodyPivot, beltGeo, matDark, 0, 0.065, 0);
    for (const sx of [-1, 1]) {
      addPart(bodyPivot, new THREE.BoxGeometry(0.055, 0.13, 0.11), matDark, sx * 0.182, 0.02, 0.0, 0, 0, sx * -0.08);
    }
    addPart(bodyPivot, new THREE.BoxGeometry(0.19, 0.26, 0.085), matDark, 0, 0.43, 0.138);

    // =========================================================================
    // 2. HEAD PIVOT (anchored inside neck at y = 0.74m -> world head center ~1.84m)
    // =========================================================================
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 0.74, 0);
    bodyPivot.add(headPivot);
    this.headPivot = headPivot;

    // Lower neck plug ensuring zero air gap even when pitching head up/down
    addPart(headPivot, new THREE.CylinderGeometry(0.055, 0.062, 0.10, 8), matSuit, 0, 0.02, 0.005);

    // Sculpted faceted cranium
    const cranium = new THREE.SphereGeometry(0.104, 12, 10);
    cranium.scale(0.86, 1.06, 0.98);
    addPart(headPivot, cranium, matFace, 0, 0.145, 0.0);

    // Fitted tactical lower face mask / balaclava wrapping jaw & chin smoothly
    const maskPts = [
      new THREE.Vector2(0.048, 0.02),
      new THREE.Vector2(0.078, 0.055),
      new THREE.Vector2(0.092, 0.115),
      new THREE.Vector2(0.070, 0.125),
    ];
    const maskGeo = new THREE.LatheGeometry(maskPts, 10);
    maskGeo.scale(0.95, 1.0, 1.04);
    addPart(headPivot, maskGeo, matDark, 0, 0.015, -0.008);

    // Sleek recessed tactical goggles / ocular brow (contours smoothly around face, NOT a floating pink box)
    const visorGeo = new THREE.CylinderGeometry(0.094, 0.094, 0.032, 10, 1, false, -Math.PI * 0.36, Math.PI * 0.72);
    visorGeo.rotateY(Math.PI);
    visorGeo.scale(0.92, 1.0, 1.02);
    addPart(headPivot, visorGeo, matDark, 0, 0.148, -0.004);

    // Subtle glowing crimson ocular slit recessed inside goggles
    const eyeSlit = new THREE.CylinderGeometry(0.096, 0.096, 0.012, 8, 1, false, -Math.PI * 0.28, Math.PI * 0.56);
    eyeSlit.rotateY(Math.PI);
    eyeSlit.scale(0.92, 1.0, 1.02);
    addPart(headPivot, eyeSlit, matAccent, 0, 0.148, -0.004);

    // Sculpted tactical helmet / hood crown + angular ear comms (clean Valorant agent silhouette)
    const helm = new THREE.SphereGeometry(0.112, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.56);
    helm.scale(0.92, 1.04, 1.05);
    addPart(headPivot, helm, matArmor, 0, 0.160, 0.008, -0.18, 0, 0);

    // Slept dorsal tactical ridge on helmet crown
    addPart(headPivot, new THREE.BoxGeometry(0.034, 0.030, 0.175), matDark, 0, 0.258, 0.018, -0.16, 0, 0);

    // Compact tactical headset ear cups on both temples
    for (const sx of [-1, 1]) {
      const ear = new THREE.CylinderGeometry(0.030, 0.030, 0.022, 8);
      ear.rotateZ(Math.PI * 0.5);
      addPart(headPivot, ear, matDark, sx * 0.095, 0.145, 0.01);
    }

    // =========================================================================
    // 3. TRUE HIERARCHICAL ARMS (shoulderPivot -> elbowPivot -> hand -> rifle)
    // =========================================================================
    // Right arm (trigger arm)
    const shoulderR = new THREE.Group();
    shoulderR.position.set(0.195, 0.565, 0.0);
    shoulderR.rotation.set(0.45, 0.12, -0.14);
    bodyPivot.add(shoulderR);

    addPart(shoulderR, new THREE.SphereGeometry(0.062, 8, 7), matArmor, 0, 0, 0);
    addPart(shoulderR, new THREE.BoxGeometry(0.095, 0.075, 0.12), matArmor, 0.022, 0.02, 0, 0, 0, -0.25); // Shoulder pauldron
    addPart(shoulderR, new THREE.CylinderGeometry(0.050, 0.042, 0.26, 8), matSuit, 0, -0.13, 0);

    const elbowR = new THREE.Group();
    elbowR.position.set(0, -0.26, 0);
    elbowR.rotation.set(1.18, 0.42, 0.15);
    shoulderR.add(elbowR);

    addPart(elbowR, new THREE.SphereGeometry(0.044, 8, 7), matArmor, 0, 0, 0);
    addPart(elbowR, new THREE.CylinderGeometry(0.041, 0.033, 0.25, 8), matSuit, 0, -0.125, 0);
    addPart(elbowR, new THREE.CylinderGeometry(0.036, 0.036, 0.028, 8), matAccent, 0, -0.22, 0); // Crimson wrist band
    addPart(elbowR, new THREE.BoxGeometry(0.050, 0.070, 0.046), matDark, 0, -0.265, 0); // Gloved hand

    // Left arm (support arm cradling rifle handguard)
    const shoulderL = new THREE.Group();
    shoulderL.position.set(-0.195, 0.565, 0.0);
    shoulderL.rotation.set(0.58, -0.18, 0.16);
    bodyPivot.add(shoulderL);

    addPart(shoulderL, new THREE.SphereGeometry(0.062, 8, 7), matArmor, 0, 0, 0);
    addPart(shoulderL, new THREE.BoxGeometry(0.095, 0.075, 0.12), matArmor, -0.022, 0.02, 0, 0, 0, 0.25);
    addPart(shoulderL, new THREE.CylinderGeometry(0.050, 0.042, 0.26, 8), matSuit, 0, -0.13, 0);

    const elbowL = new THREE.Group();
    elbowL.position.set(0, -0.26, 0);
    elbowL.rotation.set(1.08, -0.58, -0.15);
    shoulderL.add(elbowL);

    addPart(elbowL, new THREE.SphereGeometry(0.044, 8, 7), matArmor, 0, 0, 0);
    addPart(elbowL, new THREE.CylinderGeometry(0.041, 0.033, 0.26, 8), matSuit, 0, -0.13, 0);
    addPart(elbowL, new THREE.CylinderGeometry(0.036, 0.036, 0.028, 8), matAccent, 0, -0.225, 0);
    addPart(elbowL, new THREE.BoxGeometry(0.050, 0.070, 0.046), matDark, 0, -0.27, 0);

    // Held sculpted low-poly tactical rifle aligned directly between the two gloved hands
    const rifleGroup = new THREE.Group();
    rifleGroup.position.set(0.04, 0.30, -0.29);
    rifleGroup.rotation.set(0.04, 0.28, 0);
    bodyPivot.add(rifleGroup);

    addPart(rifleGroup, new THREE.BoxGeometry(0.044, 0.072, 0.46), matDark, 0, 0, 0);
    addPart(rifleGroup, new THREE.BoxGeometry(0.032, 0.050, 0.16), matArmor, 0, -0.01, 0.27); // Stock
    addPart(rifleGroup, new THREE.BoxGeometry(0.030, 0.12, 0.048), matArmor, 0, -0.085, -0.08, 0.22, 0, 0); // Curved mag
    addPart(rifleGroup, new THREE.BoxGeometry(0.032, 0.032, 0.08), matAccent, 0, 0.048, 0.04); // Optic rail
    const barrel = new THREE.CylinderGeometry(0.013, 0.014, 0.32, 7);
    barrel.rotateX(Math.PI * 0.5);
    addPart(rifleGroup, barrel, matArmor, 0, 0.012, -0.35);

    // =========================================================================
    // 4. TRUE HIERARCHICAL LEGS (hipPivot -> kneePivot -> boot flush on Y=0)
    // =========================================================================
    const makeLeg = (sx: -1 | 1) => {
      const hipPivot = new THREE.Group();
      hipPivot.position.set(sx * 0.102, 0.90, 0);
      group.add(hipPivot);

      addPart(hipPivot, new THREE.SphereGeometry(0.070, 8, 7), matSuit, 0, 0, 0);
      addPart(hipPivot, new THREE.CylinderGeometry(0.078, 0.060, 0.44, 9), matSuit, 0, -0.22, 0);
      // Tactical thigh strap
      addPart(hipPivot, new THREE.CylinderGeometry(0.074, 0.071, 0.045, 9), matDark, 0, -0.15, 0);

      const kneePivot = new THREE.Group();
      kneePivot.position.set(0, -0.44, 0);
      hipPivot.add(kneePivot);

      addPart(kneePivot, new THREE.SphereGeometry(0.056, 8, 7), matArmor, 0, 0, -0.01);
      addPart(kneePivot, new THREE.BoxGeometry(0.078, 0.085, 0.042), matDark, 0, 0, -0.048); // Knee armor pad
      addPart(kneePivot, new THREE.CylinderGeometry(0.058, 0.044, 0.32, 9), matSuit, 0, -0.17, 0);

      // Shin guard + combat boot resting cleanly on Y = 0
      addPart(kneePivot, new THREE.CylinderGeometry(0.052, 0.048, 0.06, 8), matArmor, 0, -0.30, 0);
      addPart(kneePivot, new THREE.CylinderGeometry(0.046, 0.052, 0.12, 8), matDark, 0, -0.37, 0);
      addPart(kneePivot, new THREE.BoxGeometry(0.096, 0.068, 0.20), matDark, 0, -0.426, -0.044);

      return { hipPivot, kneePivot };
    };

    const leftLeg = makeLeg(-1);
    const rightLeg = makeLeg(1);
    this.thighLeftPivot = leftLeg.hipPivot;
    this.thighRightPivot = rightLeg.hipPivot;
    this.shinLeftPivot = leftLeg.kneePivot;
    this.shinRightPivot = rightLeg.kneePivot;

    // Grounded contact shadow disc
    const shadowGeo = new THREE.CircleGeometry(0.48, 16);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x161922,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.position.set(0, 0.015, 0);
    group.add(shadow);
    this.contactShadow = shadow;

    this.group = group;
  }

  public triggerHitFlash(duration = 0.06): void {
    this.hitFlashTimer = duration;
    for (let i = 0; i < this.matcapMaterials.length; i++) {
      this.matcapMaterials[i].color.setHex(0xffb4be);
    }
  }

  public updateVisualEffects(dt: number): void {
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      if (this.hitFlashTimer <= 0) {
        this.hitFlashTimer = 0;
        for (let i = 0; i < this.matcapMaterials.length; i++) {
          this.matcapMaterials[i].color.setHex(0xffffff);
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
    }

    if (updateVisuals && this.group) {
      this.group.position.set(pose.x, pose.y, pose.z);
      this.group.rotation.set(0, pose.yaw, 0, 'YXZ');

      const stridePhase = pose.stridePhase ?? 0;
      const strideAmp = (pose.strideAmp ?? 0) * (1 - a * 0.55);
      const swingL = Math.sin(stridePhase) * 0.52 * strideAmp;
      const swingR = -swingL;
      const bobY = Math.abs(Math.sin(stridePhase)) * 0.028 * strideAmp;

      if (this.bodyPivot) {
        this.bodyPivot.position.set(0, 0.92 - a * 0.42 + bobY, -a * 0.03);
        this.bodyPivot.rotation.set(-a * 0.16, Math.sin(stridePhase) * 0.04 * strideAmp, 0);
      }
      if (this.headPivot) {
        this.headPivot.rotation.set(pose.pitch * 0.55 + a * 0.16, 0, 0);
      }
      if (this.thighLeftPivot && this.thighRightPivot && this.shinLeftPivot && this.shinRightPivot) {
        const hipY = 0.90 - a * 0.34 + bobY * 0.6;
        this.thighLeftPivot.position.y = hipY;
        this.thighRightPivot.position.y = hipY;
        this.thighLeftPivot.rotation.x = a * 0.95 + swingL;
        this.thighRightPivot.rotation.x = a * 0.95 + swingR;
        this.shinLeftPivot.rotation.x = -a * 1.35 - Math.max(0, swingL) * 0.75;
        this.shinRightPivot.rotation.x = -a * 1.35 - Math.max(0, swingR) * 0.75;
      }
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

  public dispose(): void {
    for (const tex of this.matcapTextures) tex.dispose();
    for (const mat of this.matcapMaterials) mat.dispose();
    if (this.group) {
      this.group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          (obj as THREE.Mesh).geometry.dispose();
        }
      });
    }
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
