import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { WeaponId } from '../config/WeaponData';

interface WeaponModelConfig {
  file: string;
  scale: number;
  hipPos: [number, number, number];
  hipRot: [number, number, number];
  /** Whether a 3D open-frame holographic/red-dot optic is mounted atop the receiver */
  hasOptic: boolean;
  /** Center of the 3D optic dot in scaled weapon-group space (camera aligns to (0, -opticY, adsZ) during ADS!) */
  opticPos: [number, number, number];
  /** Height of the receiver top in scaled space so the optic riser rail sits flush on the gun */
  receiverTopY: number;
  adsZ: number;
  isSniper?: boolean;
}

/**
 * Real open-source GitHub GLB gun models (guyz/tinystrike, zero first-person arms).
 * Every weapon is pre-oriented along -Z forward with +Y up.
 * Receiver & front-sight heights were measured directly from the GLB vertex buffers so the
 * 3D holosight window clears both the receiver and front sight post cleanly during ADS.
 */
const WEAPON_MODEL_CONFIGS: Record<WeaponId, WeaponModelConfig> = {
  VANDAL: {
    file: 'ak47.glb',
    scale: 0.85,
    hipPos: [0.21, -0.25, -0.45],
    hipRot: [0.0, 0.04, -0.01],
    hasOptic: true,
    // ak47 raw receiverTop=0.217, frontTop=0.261 -> scaled 0.184 / 0.222 -> optic center at Y=0.242 clears front sight cleanly!
    opticPos: [0.0, 0.242, -0.05],
    receiverTopY: 0.180,
    adsZ: -0.11,
  },
  PHANTOM: {
    file: 'm4a1.glb',
    scale: 0.85,
    hipPos: [0.21, -0.25, -0.45],
    hipRot: [0.0, 0.04, -0.01],
    hasOptic: true,
    // m4a1 raw receiverTop=0.236, frontTop=0.255 -> scaled 0.200 / 0.217 -> optic center at Y=0.238 clears cleanly!
    opticPos: [0.0, 0.238, -0.05],
    receiverTopY: 0.194,
    adsZ: -0.11,
  },
  OPERATOR: {
    file: 'awp.glb',
    scale: 0.84,
    hipPos: [0.21, -0.24, -0.42],
    hipRot: [0.0, 0.04, -0.01],
    hasOptic: false,
    // Align AWP built-in scope tube center during zoom-in transition before full-screen SVG sniper scope engages
    opticPos: [0.0, 0.175, -0.06],
    receiverTopY: 0.150,
    adsZ: -0.06,
    isSniper: true,
  },
  SPECTRE: {
    file: 'mp5.glb',
    scale: 0.92,
    hipPos: [0.19, -0.20, -0.42],
    hipRot: [0.0, 0.04, -0.01],
    hasOptic: true,
    // mp5 raw receiverTop=0.175, frontTop=0.151 -> scaled 0.161 / 0.139 -> optic center at Y=0.192 clears cleanly!
    opticPos: [0.0, 0.192, -0.06],
    receiverTopY: 0.154,
    adsZ: -0.11,
  },
  CLASSIC: {
    file: 'glock.glb',
    scale: 1.25,
    hipPos: [0.16, -0.13, -0.34],
    hipRot: [0.0, 0.04, 0.0],
    hasOptic: false,
    opticPos: [0.0, 0.09, -0.04],
    receiverTopY: 0.08,
    adsZ: -0.22,
  },
  GHOST: {
    file: 'usp.glb',
    scale: 1.22,
    hipPos: [0.16, -0.13, -0.34],
    hipRot: [0.0, 0.04, 0.0],
    hasOptic: false,
    opticPos: [0.0, 0.09, -0.04],
    receiverTopY: 0.08,
    adsZ: -0.22,
  },
  SHERIFF: {
    file: 'deagle.glb',
    scale: 1.25,
    hipPos: [0.16, -0.135, -0.34],
    hipRot: [0.0, 0.04, 0.0],
    hasOptic: false,
    opticPos: [0.0, 0.10, -0.04],
    receiverTopY: 0.09,
    adsZ: -0.22,
  },
  KNIFE: {
    file: 'knife.glb',
    scale: 1.20,
    hipPos: [0.17, -0.13, -0.32],
    hipRot: [0.18, 0.35, -0.22],
    hasOptic: false,
    opticPos: [0.0, 0.0, 0.0],
    receiverTopY: 0.0,
    adsZ: -0.32,
  },
};

/**
 * Calibrated flat unlit color lookup for the GitHub GLB weapon materials so multi-part
 * guns stay crisp and readable with ZERO lighting, ZERO reflections, and ZERO shadows.
 */
function resolveFlatWeaponColor(matName: string): number {
  const n = matName.toLowerCase();
  if (n.includes('wooddark')) return 0x6b3d20;
  if (n.includes('wood')) return 0x9c5c32;
  if (n.includes('awpgreendark')) return 0x354a2d;
  if (n.includes('awpgreen')) return 0x4f6d43;
  if (n.includes('chrome')) return 0xc8cfd8;
  if (n.includes('edge')) return 0xe8eff7;
  if (n.includes('blade')) return 0xb4bfcc;
  if (n.includes('polymerlight')) return 0x545f70;
  if (n.includes('polymer')) return 0x343b47;
  if (n.includes('gunmetal')) return 0x4b5566;
  if (n.includes('mag')) return 0x3e4450;
  if (n.includes('grip')) return 0x20252e;
  if (n.includes('gundark')) return 0x2a303a;
  return 0x434c5c;
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

export class ViewModelRig {
  public readonly root = new THREE.Group();
  private readonly weaponGroups: Record<WeaponId, THREE.Group>;
  private currentWeaponId: WeaponId = 'CLASSIC';

  private kickZ = 0;
  private kickPitch = 0;
  private swingAngle = 0;
  private walkPhase = 0;
  private adsBlend = 0;
  private scopeBlend = 0;

  private disposed = false;
  private readonly outlineMat = new THREE.LineBasicMaterial({
    color: 0x11151c,
    transparent: true,
    opacity: 0.52,
  });
  private readonly opticFrameMat = new THREE.MeshBasicMaterial({ color: 0x1e242e });
  private readonly opticGlassMat = new THREE.MeshBasicMaterial({
    color: 0x00f5d4,
    transparent: true,
    opacity: 0.06,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private readonly opticReticleMat = new THREE.MeshBasicMaterial({
    color: 0xff2a3c,
    depthTest: true,
    depthWrite: false,
  });
  private readonly createdMaterials: THREE.Material[] = [];

  constructor() {
    this.weaponGroups = {
      KNIFE: new THREE.Group(),
      CLASSIC: new THREE.Group(),
      GHOST: new THREE.Group(),
      SHERIFF: new THREE.Group(),
      SPECTRE: new THREE.Group(),
      PHANTOM: new THREE.Group(),
      VANDAL: new THREE.Group(),
      OPERATOR: new THREE.Group(),
    };

    for (const key of Object.keys(this.weaponGroups) as WeaponId[]) {
      const grp = this.weaponGroups[key];
      grp.visible = key === this.currentWeaponId;
      this.root.add(grp);
    }

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      this.loadAllWeaponModels();
    }
  }

  private loadAllWeaponModels(): void {
    const loader = new GLTFLoader();
    const baseUrl = `${getAssetBaseUrl()}models/weapons/`;

    for (const id of Object.keys(WEAPON_MODEL_CONFIGS) as WeaponId[]) {
      const cfg = WEAPON_MODEL_CONFIGS[id];
      loader.load(
        `${baseUrl}${cfg.file}`,
        (gltf) => {
          if (this.disposed) return;

          const model = gltf.scene;
          const meshesToOutline: THREE.Mesh[] = [];

          // Convert every PBR material to 100% unlit flat MeshBasicMaterial (zero reflections/shadows/lights)
          model.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (!mesh.isMesh) return;
            mesh.castShadow = false;
            mesh.receiveShadow = false;

            const origMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            const converted = origMats.map((rawMat) => {
              const mat = new THREE.MeshBasicMaterial({
                color: resolveFlatWeaponColor(rawMat.name || ''),
              });
              this.createdMaterials.push(mat);
              rawMat.dispose();
              return mat;
            });
            mesh.material = Array.isArray(mesh.material) ? converted : converted[0];
            meshesToOutline.push(mesh);
          });

          // Add crisp thin dark outline edges on each weapon sub-mesh for razor-sharp unlit silhouette
          for (const mesh of meshesToOutline) {
            const edgesGeo = new THREE.EdgesGeometry(mesh.geometry, 26);
            const lines = new THREE.LineSegments(edgesGeo, this.outlineMat);
            lines.renderOrder = 1;
            mesh.add(lines);
          }

          const container = this.weaponGroups[id];
          model.scale.setScalar(cfg.scale);
          container.add(model);

          // Mount a clean open-frame 3D Holographic / Red-Dot Optic directly atop the receiver
          // positioned at exact cfg.opticPos so camera (0, 0) looks dead-center through the open window!
          if (cfg.hasOptic) {
            const optic = this.buildHolosightOptic(cfg.opticPos[1] - cfg.receiverTopY);
            optic.position.set(cfg.opticPos[0], cfg.opticPos[1], cfg.opticPos[2]);
            container.add(optic);
          }
        },
        undefined,
        (err) => {
          console.warn(`Weapon model ${cfg.file} failed to load:`, err);
        }
      );
    }
  }

  /**
   * Builds a clean open-window 3D tactical red-dot / holo sight centered at local (0, 0, 0)
   * with a flush Picatinny riser connecting seamlessly down onto the receiver top.
   * When ADS aligns the weapon to (0, -opticY, adsZ), the camera looks straight through the open window
   * and aims using the glowing center red dot with zero receiver obstruction.
   */
  private buildHolosightOptic(heightAboveReceiver: number): THREE.Group {
    const g = new THREE.Group();

    const winW = 0.048;
    const winH = 0.036;
    const frameT = 0.0038;
    const depth = 0.042;

    const addFrameBar = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, this.opticFrameMat);
      mesh.position.set(x, y, z);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), this.outlineMat);
      mesh.add(edges);
      g.add(mesh);
    };

    // Picatinny rail riser pedestal extending cleanly from below the window frame down onto the receiver top
    const frameBottomY = -(winH * 0.5 + frameT);
    const riserH = Math.max(0.012, heightAboveReceiver + frameBottomY + 0.008);
    addFrameBar(0.024, riserH, depth + 0.016, 0, frameBottomY - riserH * 0.5, 0);

    // Thin top, bottom, left, right housing rails forming a wide clear sight window
    addFrameBar(winW + frameT * 2, frameT, depth, 0, winH * 0.5 + frameT * 0.5, 0);
    addFrameBar(winW + frameT * 2, frameT, depth, 0, -(winH * 0.5 + frameT * 0.5), 0);
    addFrameBar(frameT, winH, depth, -(winW * 0.5 + frameT * 0.5), 0, 0);
    addFrameBar(frameT, winH, depth, winW * 0.5 + frameT * 0.5, 0, 0);

    // Subtle unlit optic lens tint inside the open window
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), this.opticGlassMat);
    glass.position.set(0, 0, -0.002);
    g.add(glass);

    // Crisp glowing centered red-dot reticle + fine holo ring at exact (0, 0, 0)
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0012, 12), this.opticReticleMat);
    dot.position.set(0, 0, 0.001);
    dot.renderOrder = 5;
    g.add(dot);

    const ring = new THREE.Mesh(new THREE.RingGeometry(0.0068, 0.0076, 24), this.opticReticleMat);
    ring.position.set(0, 0, 0.001);
    ring.renderOrder = 5;
    g.add(ring);

    return g;
  }

  public setActiveWeapon(id: WeaponId): void {
    if (this.currentWeaponId === id) return;
    this.weaponGroups[this.currentWeaponId].visible = false;
    this.currentWeaponId = id;
    this.weaponGroups[id].visible = true;
    this.adsBlend = 0;
    this.scopeBlend = 0;
  }

  public triggerFireKick(isKnife: boolean): void {
    if (isKnife) {
      this.swingAngle = 1.0;
    } else {
      const adsDamp = 1 - this.adsBlend * 0.6;
      this.kickZ = 0.038 * adsDamp;
      this.kickPitch = 0.048 * adsDamp;
    }
  }

  public update(params: {
    dt: number;
    weaponId: WeaponId;
    isScoped: boolean;
    isADS: boolean;
    equipRatio: number;
    reloadRatio: number;
    horizSpeed: number;
    isGrounded: boolean;
    rollTiltRad: number;
  }): void {
    this.setActiveWeapon(params.weaponId);

    const cfg = WEAPON_MODEL_CONFIGS[params.weaponId];
    const dt = params.dt;

    // Smooth exponential damping for ADS optic alignment & Operator scope transition
    const adsTarget = params.isADS ? 1 : 0;
    const scopeTarget = params.weaponId === 'OPERATOR' && params.isScoped ? 1 : 0;
    const adsRate = 1 - Math.exp(-dt * 18);
    this.adsBlend += (adsTarget - this.adsBlend) * adsRate;
    this.scopeBlend += (scopeTarget - this.scopeBlend) * (1 - Math.exp(-dt * 24));

    // Once Operator scope reaches the eye, hide 3D mesh seamlessly as full-screen SVG scope takes over
    if (params.weaponId === 'OPERATOR' && params.isScoped && this.scopeBlend > 0.65) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;

    const decay = Math.min(1, dt * 18);
    this.kickZ += (0 - this.kickZ) * decay;
    this.kickPitch += (0 - this.kickPitch) * decay;
    this.swingAngle += (0 - this.swingAngle) * Math.min(1, dt * 12);

    if (params.isGrounded && params.horizSpeed > 0.35) {
      this.walkPhase += params.horizSpeed * dt * 2.2;
    }

    // Damp walk bob heavily while aiming down sights so optic reticle stays rock-steady
    const aimBlend = Math.max(this.adsBlend, this.scopeBlend);
    const bobScale = (1 - aimBlend * 0.88) * Math.min(1, params.horizSpeed / 5.4);
    const bobX = Math.cos(this.walkPhase) * 0.005 * bobScale;
    const bobY = Math.abs(Math.sin(this.walkPhase)) * 0.006 * bobScale;

    // Exact mathematical optic alignment:
    // Hipfire -> (hipX, hipY, hipZ); ADS -> (0, -opticY, adsZ) so optic window center sits dead on camera (0, 0)
    const targetAimX = -cfg.opticPos[0];
    const targetAimY = -cfg.opticPos[1];
    const targetAimZ = cfg.adsZ;

    const baseX = cfg.hipPos[0] + (targetAimX - cfg.hipPos[0]) * aimBlend;
    const baseY = cfg.hipPos[1] + (targetAimY - cfg.hipPos[1]) * aimBlend;
    const baseZ = cfg.hipPos[2] + (targetAimZ - cfg.hipPos[2]) * aimBlend;

    const basePitch = cfg.hipRot[0] * (1 - aimBlend);
    const baseYaw = cfg.hipRot[1] * (1 - aimBlend);
    const baseRoll = cfg.hipRot[2] * (1 - aimBlend);

    const equipDip = params.equipRatio * -0.14;
    const reloadDip = Math.sin(params.reloadRatio * Math.PI) * -0.12;

    this.root.position.set(
      baseX + bobX - this.swingAngle * 0.14,
      baseY - bobY + equipDip + reloadDip,
      baseZ + this.kickZ - this.swingAngle * 0.08
    );

    this.root.rotation.set(
      basePitch + this.kickPitch - params.equipRatio * 0.52 - this.swingAngle * 0.35,
      baseYaw + this.swingAngle * 0.55,
      baseRoll + params.rollTiltRad * (1 - aimBlend * 0.7) + this.swingAngle * 0.45
    );
  }

  public dispose(): void {
    this.disposed = true;
    this.outlineMat.dispose();
    this.opticFrameMat.dispose();
    this.opticGlassMat.dispose();
    this.opticReticleMat.dispose();
    for (const m of this.createdMaterials) m.dispose();
    this.createdMaterials.length = 0;

    this.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if ((mesh.isMesh || (obj as THREE.LineSegments).isLineSegments) && mesh.geometry) {
        mesh.geometry.dispose();
      }
    });
  }
}
