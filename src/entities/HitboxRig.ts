import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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
  stridePhase?: number;
  strideAmp?: number;
  moveSpeed?: number;
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

function getAssetBaseUrl(): string {
  try {
    const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
    const base = env?.BASE_URL || './';
    return base.endsWith('/') ? base : `${base}/`;
  } catch {
    return './';
  }
}

export class HitboxRig {
  public readonly segmentMatrices: THREE.Matrix4[] = [];
  private readonly hitRecords: SegmentHitRecord[] = [];

  // Real GitHub rigged Soldier.glb (mrdoob/three.js) rendered with unlit flat MeshBasicMaterial (zero lights/reflections/shadows)
  public group: THREE.Group | null = null;
  private modelHolder: THREE.Group | null = null;
  private placeholderGroup: THREE.Group | null = null;

  private mixer: THREE.AnimationMixer | null = null;
  private idleAction: THREE.AnimationAction | null = null;
  private walkAction: THREE.AnimationAction | null = null;
  private runAction: THREE.AnimationAction | null = null;
  private idleWeight = 1;
  private walkWeight = 0;
  private runWeight = 0;
  private currentMoveSpeed = 0;

  private soldierBaseScale = 1;
  private soldierMaterials: THREE.MeshBasicMaterial[] = [];
  private soldierDefaultColors: number[] = [];
  private disposed = false;
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
    this.group = group;

    const modelHolder = new THREE.Group();
    group.add(modelHolder);
    this.modelHolder = modelHolder;

    // Minimal flat unlit silhouette placeholder shown ONLY until Soldier.glb finishes loading
    const placeholder = new THREE.Group();
    const pMat = new THREE.MeshBasicMaterial({ color: 0x2a313d });
    const pHeadMat = new THREE.MeshBasicMaterial({ color: 0xff3b4e });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.48, 0.24), pMat);
    body.position.set(0, 0.74, 0);
    placeholder.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.22), pHeadMat);
    head.position.set(0, 1.72, 0);
    placeholder.add(head);
    modelHolder.add(placeholder);
    this.placeholderGroup = placeholder;

    // Load real rigged Soldier.glb from bundled public/models/Soldier.glb (browser runtime only)
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      this.loadSoldierModel();
    }
  }

  private loadSoldierModel(): void {
    const loader = new GLTFLoader();
    const url = `${getAssetBaseUrl()}models/Soldier.glb`;

    loader.load(
      url,
      (gltf) => {
        if (this.disposed || !this.modelHolder) return;

        const soldier = gltf.scene;
        this.soldierMaterials = [];
        this.soldierDefaultColors = [];

        // Convert every PBR material on Soldier.glb to 100% unlit MeshBasicMaterial
        // (Zero reflections, zero shadows, zero lighting loops — skinning: true required in three@0.128.0!)
        soldier.traverse((obj) => {
          const mesh = obj as THREE.Mesh & { isSkinnedMesh?: boolean };
          if (!mesh.isMesh) return;

          mesh.castShadow = false;
          mesh.receiveShadow = false;
          mesh.frustumCulled = false;

          const isSkinned = Boolean(mesh.isSkinnedMesh);
          const origMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

          const converted = origMats.map((rawMat) => {
            const std = rawMat as THREE.MeshStandardMaterial;
            const matName = (std.name || '').toLowerCase();
            const isVisor = matName.includes('visor');

            let basic: THREE.MeshBasicMaterial;
            if (isVisor) {
              // Crisp unlit tactical crimson visor so enemy head pops clearly against warm sand walls
              basic = new THREE.MeshBasicMaterial({
                color: 0xff3b4e,
                skinning: isSkinned,
              });
              this.soldierDefaultColors.push(0xff3b4e);
            } else {
              // Preserve the soldier's real Vanguard tactical uniform texture map in unlit sRGB
              const map = std.map || null;
              if (map) {
                map.encoding = THREE.sRGBEncoding;
                map.needsUpdate = true;
              }
              // Brighten albedo slightly so unlit armor details read cleanly without scene lights
              const baseHex = map ? 0xf2ece8 : 0x3b4352;
              basic = new THREE.MeshBasicMaterial({
                color: baseHex,
                map,
                skinning: isSkinned,
              });
              this.soldierDefaultColors.push(baseHex);
            }

            this.soldierMaterials.push(basic);
            std.dispose();
            return basic;
          });

          mesh.material = Array.isArray(mesh.material) ? converted : converted[0];
        });

        // Compute exact bounding box and normalize height to 1.88m with feet flush on Y = 0
        soldier.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(soldier);
        const size = new THREE.Vector3();
        box.getSize(size);
        const targetHeight = 1.88;
        const scale = size.y > 0.01 ? targetHeight / size.y : 1.0;
        this.soldierBaseScale = scale;
        soldier.scale.setScalar(scale);

        soldier.updateMatrixWorld(true);
        const scaledBox = new THREE.Box3().setFromObject(soldier);
        soldier.position.set(0, -scaledBox.min.y, 0);
        // Three.js Soldier.glb faces -Z by default, matching our yaw = 0 -> -Z forward convention!

        // Remove placeholder & attach real rigged Soldier
        if (this.placeholderGroup) {
          this.modelHolder.remove(this.placeholderGroup);
          this.placeholderGroup.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) {
              m.geometry.dispose();
              if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
              else m.material.dispose();
            }
          });
          this.placeholderGroup = null;
        }
        this.modelHolder.add(soldier);

        // Wire baked skeletal animations: Idle, Walk, Run
        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(soldier);
          this.mixer = mixer;

          const idleClip =
            THREE.AnimationClip.findByName(gltf.animations, 'Idle') || gltf.animations[0];
          const walkClip = THREE.AnimationClip.findByName(gltf.animations, 'Walk');
          const runClip = THREE.AnimationClip.findByName(gltf.animations, 'Run');

          if (idleClip) {
            this.idleAction = mixer.clipAction(idleClip);
            this.idleAction.enabled = true;
            this.idleAction.setEffectiveWeight(1);
            this.idleAction.play();
          }
          if (walkClip) {
            this.walkAction = mixer.clipAction(walkClip);
            this.walkAction.enabled = true;
            this.walkAction.setEffectiveWeight(0);
            this.walkAction.play();
          }
          if (runClip) {
            this.runAction = mixer.clipAction(runClip);
            this.runAction.enabled = true;
            this.runAction.setEffectiveWeight(0);
            this.runAction.play();
          }
        }
      },
      undefined,
      (err) => {
        console.warn('Soldier.glb failed to load; keeping flat fallback:', err);
      }
    );
  }

  public triggerHitFlash(duration = 0.09): void {
    this.hitFlashTimer = duration;
    for (let i = 0; i < this.soldierMaterials.length; i++) {
      this.soldierMaterials[i].color.setHex(0xff5a66);
    }
  }

  public updateVisualEffects(dt: number): void {
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
      if (this.hitFlashTimer === 0) {
        for (let i = 0; i < this.soldierMaterials.length; i++) {
          this.soldierMaterials[i].color.setHex(this.soldierDefaultColors[i]);
        }
      }
    }

    // Smoothly crossfade Soldier.glb skeletal animations (Idle <-> Walk <-> Run) by movement speed
    if (this.mixer) {
      const spd = this.currentMoveSpeed;
      let targetIdle = 0;
      let targetWalk = 0;
      let targetRun = 0;

      if (spd < 0.25) {
        targetIdle = 1;
      } else if (spd < 3.4) {
        const t = Math.min(1, (spd - 0.25) / 2.2);
        targetIdle = 1 - t;
        targetWalk = t;
      } else {
        const t = Math.min(1, (spd - 3.4) / 1.8);
        targetWalk = 1 - t;
        targetRun = t;
      }

      const blend = 1 - Math.exp(-dt * 12);
      this.idleWeight += (targetIdle - this.idleWeight) * blend;
      this.walkWeight += (targetWalk - this.walkWeight) * blend;
      this.runWeight += (targetRun - this.runWeight) * blend;

      if (this.idleAction) this.idleAction.setEffectiveWeight(this.idleWeight);
      if (this.walkAction) this.walkAction.setEffectiveWeight(this.walkWeight);
      if (this.runAction) this.runAction.setEffectiveWeight(this.runWeight);

      this.mixer.update(dt);
    }
  }

  public updatePose(pose: PlayerPose, updateMeshes = false): void {
    const c = Math.max(0, Math.min(1, pose.crouchAlpha));

    _rootPos.set(pose.x, pose.y, pose.z);
    _rootEuler.set(0, pose.yaw, 0, 'YXZ');
    _rootQuat.setFromEuler(_rootEuler);
    _rootMat.compose(_rootPos, _rootQuat, _rootScale);

    // Always update the 9 authoritative OBB hitbox matrices
    for (let i = 0; i < HITBOX_SEGMENTS.length; i++) {
      const seg = HITBOX_SEGMENTS[i];
      const lx = seg.standCenter[0] + (seg.crouchCenter[0] - seg.standCenter[0]) * c;
      const ly = seg.standCenter[1] + (seg.crouchCenter[1] - seg.standCenter[1]) * c;
      const lz = seg.standCenter[2] + (seg.crouchCenter[2] - seg.standCenter[2]) * c;

      _localPos.set(lx, ly, lz);
      _localEuler.set(pose.pitch * seg.pitchWeight, 0, 0, 'YXZ');
      _localQuat.setFromEuler(_localEuler);
      _localMat.compose(_localPos, _localQuat, _rootScale);

      this.segmentMatrices[i].multiplyMatrices(_rootMat, _localMat);
    }

    if (updateMeshes && this.group) {
      this.group.position.set(pose.x, pose.y, pose.z);
      this.group.rotation.set(0, pose.yaw, 0, 'YXZ');

      this.currentMoveSpeed =
        pose.moveSpeed !== undefined ? pose.moveSpeed : (pose.strideAmp ?? 0) * 5.0;

      // Visually duck into the crouched hitbox smoothly
      if (this.modelHolder) {
        const crouchScaleY = 1.0 - c * 0.30;
        this.modelHolder.scale.set(1.0 + c * 0.06, crouchScaleY, 1.0 + c * 0.06);
      }
    }
  }

  /**
   * Tests a world-space ray against all 9 compound OBB hitboxes with competitive head priority.
   */
  public raycast(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDistance: number,
    outHit?: HitboxRayHit
  ): HitboxRayHit {
    const result: HitboxRayHit = outHit ?? {
      hit: false,
      segmentId: null,
      tier: null,
      distance: maxDistance,
      hitX: 0,
      hitY: 0,
      hitZ: 0,
    };

    result.hit = false;
    result.segmentId = null;
    result.tier = null;
    result.distance = maxDistance;

    _originVec.set(ox, oy, oz);
    _dirVec.set(dx, dy, dz);
    _worldEnd.copy(_originVec).addScaledVector(_dirVec, maxDistance);

    let hitCount = 0;

    for (let i = 0; i < HITBOX_SEGMENTS.length; i++) {
      const seg = HITBOX_SEGMENTS[i];
      _worldMat.copy(this.segmentMatrices[i]);
      _invMat.copy(_worldMat).invert();

      _localOrigin.copy(_originVec).applyMatrix4(_invMat);
      _localEnd.copy(_worldEnd).applyMatrix4(_invMat);
      _localDir.subVectors(_localEnd, _localOrigin);

      const hx = seg.size[0] * 0.5;
      const hy = seg.size[1] * 0.5;
      const hz = seg.size[2] * 0.5;

      const t = intersectLocalRayBox(
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

      if (t !== null && t >= 0 && t <= 1) {
        const dist = t * maxDistance;
        const rec = this.hitRecords[hitCount++];
        rec.segmentId = seg.id;
        rec.tier = seg.tier;
        rec.distance = dist;
      }
    }

    if (hitCount === 0) return result;

    let bestIdx = 0;
    let closestDist = this.hitRecords[0].distance;
    for (let i = 1; i < hitCount; i++) {
      if (this.hitRecords[i].distance < closestDist) {
        closestDist = this.hitRecords[i].distance;
        bestIdx = i;
      }
    }

    // Competitive Head Priority Window (0.18m)
    let chosenIdx = bestIdx;
    for (let i = 0; i < hitCount; i++) {
      if (
        this.hitRecords[i].tier === 'HEAD' &&
        this.hitRecords[i].distance <= closestDist + HEAD_PRIORITY_WINDOW
      ) {
        if (
          this.hitRecords[chosenIdx].tier !== 'HEAD' ||
          this.hitRecords[i].distance < this.hitRecords[chosenIdx].distance
        ) {
          chosenIdx = i;
        }
      }
    }

    const chosen = this.hitRecords[chosenIdx];
    result.hit = true;
    result.segmentId = chosen.segmentId;
    result.tier = chosen.tier;
    result.distance = chosen.distance;
    result.hitX = ox + dx * chosen.distance;
    result.hitY = oy + dy * chosen.distance;
    result.hitZ = oz + dz * chosen.distance;
    return result;
  }

  public dispose(): void {
    this.disposed = true;
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    for (const mat of this.soldierMaterials) {
      if (mat.map) mat.map.dispose();
      mat.dispose();
    }
    this.soldierMaterials = [];
    if (this.group) {
      this.group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh && mesh.geometry) {
          mesh.geometry.dispose();
        }
      });
    }
  }
}

function intersectLocalRayBox(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  hx: number,
  hy: number,
  hz: number
): number | null {
  let tmin = 0.0;
  let tmax = 1.0;

  if (Math.abs(dx) < 1e-8) {
    if (ox < -hx || ox > hx) return null;
  } else {
    const inv = 1 / dx;
    let t1 = (-hx - ox) * inv;
    let t2 = (hx - ox) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  if (Math.abs(dy) < 1e-8) {
    if (oy < -hy || oy > hy) return null;
  } else {
    const inv = 1 / dy;
    let t1 = (-hy - oy) * inv;
    let t2 = (hy - oy) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  if (Math.abs(dz) < 1e-8) {
    if (oz < -hz || oz > hz) return null;
  } else {
    const inv = 1 / dz;
    let t1 = (-hz - oz) * inv;
    let t2 = (hz - oz) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  return tmin;
}
