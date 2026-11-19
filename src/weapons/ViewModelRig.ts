import * as THREE from 'three';
import { WeaponId } from '../config/WeaponData';
import { createStudioMatcapTexture } from '../engine/ProceduralTextures';

export class ViewModelRig {
  public readonly root = new THREE.Group();
  private readonly weaponGroups: Record<WeaponId, THREE.Group>;
  private currentWeaponId: WeaponId = 'CLASSIC';

  private kickZ = 0;
  private kickPitch = 0;
  private swingAngle = 0;
  private walkPhase = 0;

  private readonly matcapTextures: THREE.Texture[] = [];
  private readonly matClayDark: THREE.MeshMatcapMaterial;
  private readonly matClayMid: THREE.MeshMatcapMaterial;
  private readonly matClayLight: THREE.MeshMatcapMaterial;
  private readonly matGrip: THREE.MeshMatcapMaterial;
  private readonly matGlove: THREE.MeshMatcapMaterial;
  private readonly matSleeve: THREE.MeshMatcapMaterial;
  private readonly matAccentTeal: THREE.MeshBasicMaterial;
  private readonly matLens: THREE.MeshMatcapMaterial;

  constructor() {
    // Blender Workbench satin clay MatCaps for razor-sharp weapon bevels at 0 lighting cost
    const texDark = createStudioMatcapTexture({
      highlight: '#596170',
      midtone: '#343a45',
      shadow: '#1b1f27',
      specular: 0.22,
    });
    const texMid = createStudioMatcapTexture({
      highlight: '#959eab',
      midtone: '#67707e',
      shadow: '#3b414c',
      specular: 0.18,
    });
    const texLight = createStudioMatcapTexture({
      highlight: '#dde1e8',
      midtone: '#b2b8c4',
      shadow: '#737985',
      specular: 0.24,
    });
    const texGrip = createStudioMatcapTexture({
      highlight: '#3b404a',
      midtone: '#21252d',
      shadow: '#101218',
      specular: 0.08,
    });
    const texGlove = createStudioMatcapTexture({
      highlight: '#424956',
      midtone: '#272c36',
      shadow: '#141820',
      specular: 0.03,
    });
    const texSleeve = createStudioMatcapTexture({
      highlight: '#495262',
      midtone: '#2e3542',
      shadow: '#191e27',
      specular: 0.02,
    });
    const texLens = createStudioMatcapTexture({
      highlight: '#9ee8f5',
      midtone: '#3c7a91',
      shadow: '#162d38',
      specular: 0.45,
    });

    this.matcapTextures.push(texDark, texMid, texLight, texGrip, texGlove, texSleeve, texLens);

    this.matClayDark = new THREE.MeshMatcapMaterial({ matcap: texDark });
    this.matClayMid = new THREE.MeshMatcapMaterial({ matcap: texMid });
    this.matClayLight = new THREE.MeshMatcapMaterial({ matcap: texLight });
    this.matGrip = new THREE.MeshMatcapMaterial({ matcap: texGrip });
    this.matGlove = new THREE.MeshMatcapMaterial({ matcap: texGlove });
    this.matSleeve = new THREE.MeshMatcapMaterial({ matcap: texSleeve });
    this.matAccentTeal = new THREE.MeshBasicMaterial({ color: 0x00e6c7 });
    this.matLens = new THREE.MeshMatcapMaterial({ matcap: texLens });

    this.weaponGroups = {
      KNIFE: this.buildKnife(),
      CLASSIC: this.buildPistol(false, false),
      GHOST: this.buildPistol(true, false),
      SHERIFF: this.buildPistol(false, true),
      SPECTRE: this.buildSmg(),
      PHANTOM: this.buildRifle(true),
      VANDAL: this.buildRifle(false),
      OPERATOR: this.buildOperator(),
    };

    for (const key of Object.keys(this.weaponGroups) as WeaponId[]) {
      const grp = this.weaponGroups[key];
      grp.visible = key === this.currentWeaponId;
      this.root.add(grp);
    }
  }

  private part(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0
  ): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    return m;
  }

  /**
   * Extrudes a 2D (z, y) side-profile silhouette centered along X so weapons have
   * authentic chamfered Blender-like angles instead of plain boxes.
   * Shape coordinates: +x = forward (-Z in weapon space), +y = up (+Y).
   */
  private extrudeSideProfile(
    pts: [number, number][],
    thickness: number,
    bevel = 0.003
  ): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      shape.lineTo(pts[i][0], pts[i][1]);
    }
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
    });
    geo.translate(0, 0, -thickness * 0.5);
    geo.rotateY(Math.PI * 0.5);
    return geo;
  }

  /**
   * Connects two exact 3D points (start -> end) with a tapered sculpted limb/sleeve
   * so forearms can never float or detach from hands at any angle.
   */
  private addTaperedConnector(
    g: THREE.Group,
    mat: THREE.Material,
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    rStart: number,
    rEnd: number,
    flatScaleZ = 0.84
  ): void {
    const a = new THREE.Vector3(x1, y1, z1);
    const b = new THREE.Vector3(x2, y2, z2);
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 1e-4) return;
    // Slight oval cross-section + faceted 8-sided Blender clay silhouette (no glossy tube pipe look)
    const geo = new THREE.CylinderGeometry(rEnd, rStart, len, 8);
    geo.scale(1.0, 1.0, flatScaleZ);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    g.add(mesh);
  }

  /**
   * Sculpted anatomical tactical gloved hands & connected forearm sleeves angled cleanly to screen corners.
   */
  private addHands(
    g: THREE.Group,
    gx: number,
    gy: number,
    gz: number,
    twoHanded: boolean,
    supportZ = -0.24
  ): void {
    // Primary trigger hand: sculpted palm, knuckle guard & thumb
    g.add(this.part(new THREE.BoxGeometry(0.046, 0.048, 0.056), this.matGlove, gx, gy, gz, 0.22, 0, 0));
    g.add(this.part(new THREE.BoxGeometry(0.050, 0.013, 0.032), this.matClayDark, gx, gy + 0.020, gz - 0.010, 0.22, 0, 0));
    g.add(this.part(new THREE.BoxGeometry(0.018, 0.018, 0.040), this.matGlove, gx - 0.022, gy + 0.017, gz - 0.016, 0.26, 0.24, 0));

    // Connected wrist cuff -> matte forearm sleeve exiting cleanly toward bottom-right corner
    this.addTaperedConnector(
      g,
      this.matClayDark,
      gx + 0.004,
      gy - 0.010,
      gz + 0.016,
      gx + 0.036,
      gy - 0.046,
      gz + 0.064,
      0.027,
      0.032
    );
    this.addTaperedConnector(
      g,
      this.matSleeve,
      gx + 0.032,
      gy - 0.042,
      gz + 0.060,
      gx + 0.165,
      gy - 0.195,
      gz + 0.255,
      0.035,
      0.052
    );

    if (twoHanded) {
      // Support hand cradling cleanly underneath handguard
      const hx = -0.006;
      const hy = gy + 0.006;
      const hz = supportZ;
      g.add(this.part(new THREE.BoxGeometry(0.048, 0.034, 0.064), this.matGlove, hx, hy, hz, 0.05, 0.08, 0));
      g.add(this.part(new THREE.BoxGeometry(0.015, 0.020, 0.042), this.matGlove, hx - 0.023, hy + 0.018, hz - 0.008, 0.05, 0.12, 0));
      g.add(this.part(new THREE.BoxGeometry(0.044, 0.011, 0.034), this.matClayDark, hx, hy - 0.013, hz, 0.05, 0.08, 0));

      // Connected support wrist -> compact bent forearm dipping naturally downward-left off the bottom edge
      this.addTaperedConnector(
        g,
        this.matClayDark,
        hx - 0.008,
        hy - 0.012,
        hz + 0.012,
        hx - 0.044,
        hy - 0.064,
        hz + 0.046,
        0.028,
        0.034
      );
      this.addTaperedConnector(
        g,
        this.matSleeve,
        hx - 0.040,
        hy - 0.060,
        hz + 0.042,
        hx - 0.155,
        hy - 0.235,
        hz + 0.125,
        0.036,
        0.052
      );
    }
  }

  private buildKnife(): THREE.Group {
    const g = new THREE.Group();
    const handle = this.extrudeSideProfile(
      [
        [-0.062, -0.013],
        [0.052, -0.011],
        [0.060, 0.014],
        [-0.052, 0.016],
      ],
      0.018,
      0.003
    );
    g.add(this.part(handle, this.matGrip, 0, 0, 0));
    // Sculpted grip bolster & pommel ring
    const ring = new THREE.TorusGeometry(0.014, 0.0042, 6, 12);
    ring.rotateY(Math.PI * 0.5);
    g.add(this.part(ring, this.matClayLight, 0, -0.002, 0.074));
    g.add(this.part(new THREE.BoxGeometry(0.028, 0.046, 0.015), this.matClayDark, 0, 0.004, -0.06));
    // Swept tactical combat blade with fuller groove
    const blade = this.extrudeSideProfile(
      [
        [0.06, -0.010],
        [0.215, -0.001],
        [0.262, 0.018],
        [0.185, 0.025],
        [0.06, 0.021],
      ],
      0.005,
      0.002
    );
    g.add(this.part(blade, this.matClayLight, 0, 0, 0));
    g.add(this.part(new THREE.BoxGeometry(0.007, 0.004, 0.135), this.matClayDark, 0, 0.006, -0.145));
    g.add(this.part(new THREE.BoxGeometry(0.004, 0.004, 0.125), this.matAccentTeal, 0, 0.001, -0.142));
    this.addHands(g, 0.006, -0.010, 0.010, false);
    g.rotation.set(0.20, 0.42, -0.24);
    return g;
  }

  private buildPistol(suppressed: boolean, revolver: boolean): THREE.Group {
    const g = new THREE.Group();

    const grip = this.extrudeSideProfile(
      [
        [-0.042, -0.088],
        [0.004, -0.090],
        [0.024, -0.005],
        [-0.020, 0.005],
      ],
      0.026,
      0.003
    );
    g.add(this.part(grip, this.matGrip, 0, 0, 0));

    g.add(this.part(new THREE.BoxGeometry(0.009, 0.005, 0.042), this.matClayDark, 0, -0.026, -0.036));
    g.add(this.part(new THREE.BoxGeometry(0.009, 0.024, 0.006), this.matClayDark, 0, -0.014, -0.056));
    g.add(this.part(new THREE.BoxGeometry(0.004, 0.014, 0.005), this.matClayLight, 0, -0.009, -0.030, -0.25, 0, 0));

    const frame = this.extrudeSideProfile(
      [
        [-0.025, -0.004],
        [0.155, -0.004],
        [0.162, 0.014],
        [-0.032, 0.014],
      ],
      0.026,
      0.002
    );
    g.add(this.part(frame, this.matClayDark, 0, 0, 0));

    if (revolver) {
      const drum = new THREE.CylinderGeometry(0.025, 0.025, 0.056, 8);
      drum.rotateX(Math.PI * 0.5);
      g.add(this.part(drum, this.matClayLight, 0, 0.026, -0.045));
      const shroud = this.extrudeSideProfile(
        [
          [0.075, 0.012],
          [0.248, 0.014],
          [0.238, 0.044],
          [0.075, 0.044],
        ],
        0.022,
        0.0025
      );
      g.add(this.part(shroud, this.matClayMid, 0, 0, 0));
      const barrel = new THREE.CylinderGeometry(0.009, 0.009, 0.175, 8);
      barrel.rotateX(Math.PI * 0.5);
      g.add(this.part(barrel, this.matClayDark, 0, 0.032, -0.165));
    } else {
      const slide = this.extrudeSideProfile(
        [
          [-0.035, 0.013],
          [0.162, 0.013],
          [0.158, 0.040],
          [-0.026, 0.040],
        ],
        0.028,
        0.003
      );
      g.add(this.part(slide, suppressed ? this.matClayDark : this.matClayMid, 0, 0, 0));
      for (let i = 0; i < 4; i++) {
        g.add(this.part(new THREE.BoxGeometry(0.035, 0.020, 0.004), this.matGrip, 0, 0.026, 0.004 + i * 0.008));
      }
      const barrel = new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8);
      barrel.rotateX(Math.PI * 0.5);
      g.add(this.part(barrel, this.matClayDark, 0, 0.025, -0.172));
    }

    g.add(this.part(new THREE.BoxGeometry(0.020, 0.008, 0.009), this.matClayDark, 0, 0.044, 0.018));
    g.add(this.part(new THREE.BoxGeometry(0.005, 0.007, 0.009), this.matAccentTeal, 0, 0.044, -0.148));

    if (suppressed) {
      const supp = new THREE.CylinderGeometry(0.013, 0.013, 0.165, 10);
      supp.rotateX(Math.PI * 0.5);
      g.add(this.part(supp, this.matClayDark, 0, 0.025, -0.25));
      const collar = new THREE.CylinderGeometry(0.015, 0.015, 0.016, 10);
      collar.rotateX(Math.PI * 0.5);
      g.add(this.part(collar, this.matClayLight, 0, 0.025, -0.175));
    }

    this.addHands(g, 0, -0.035, 0.022, false);
    return g;
  }

  private buildSmg(): THREE.Group {
    const g = new THREE.Group();
    const body = this.extrudeSideProfile(
      [
        [-0.06, -0.010],
        [0.24, -0.008],
        [0.25, 0.042],
        [-0.05, 0.044],
      ],
      0.036,
      0.003
    );
    g.add(this.part(body, this.matClayMid, 0, 0, 0));

    const grip = this.extrudeSideProfile(
      [
        [-0.045, -0.088],
        [-0.012, -0.088],
        [0.005, -0.006],
        [-0.028, -0.004],
      ],
      0.024,
      0.002
    );
    g.add(this.part(grip, this.matGrip, 0, 0, 0));

    const mag = this.extrudeSideProfile(
      [
        [0.095, -0.132],
        [0.125, -0.128],
        [0.110, -0.005],
        [0.078, -0.005],
      ],
      0.022,
      0.002
    );
    g.add(this.part(mag, this.matClayDark, 0, 0, 0));

    const supp = new THREE.CylinderGeometry(0.017, 0.017, 0.19, 10);
    supp.rotateX(Math.PI * 0.5);
    g.add(this.part(supp, this.matClayDark, 0, 0.018, -0.33));

    this.addOptic(g, 0.046, -0.06);
    this.addHands(g, 0, -0.03, 0.025, true, -0.18);
    return g;
  }

  private addOptic(g: THREE.Group, baseY: number, zCenter: number): void {
    g.add(this.part(new THREE.BoxGeometry(0.024, 0.007, 0.13), this.matClayDark, 0, baseY, zCenter));
    g.add(this.part(new THREE.BoxGeometry(0.004, 0.020, 0.038), this.matClayDark, -0.013, baseY + 0.013, zCenter));
    g.add(this.part(new THREE.BoxGeometry(0.004, 0.020, 0.038), this.matClayDark, 0.013, baseY + 0.013, zCenter));
    g.add(this.part(new THREE.BoxGeometry(0.030, 0.005, 0.038), this.matClayLight, 0, baseY + 0.024, zCenter));
    g.add(this.part(new THREE.BoxGeometry(0.004, 0.004, 0.004), this.matAccentTeal, 0, baseY + 0.013, zCenter));
  }

  private buildRifle(suppressed: boolean): THREE.Group {
    const g = new THREE.Group();

    // Sculpted chamfered rifle receiver
    const receiver = this.extrudeSideProfile(
      [
        [-0.065, -0.018],
        [0.21, -0.016],
        [0.24, 0.036],
        [-0.055, 0.038],
      ],
      0.036,
      0.003
    );
    g.add(this.part(receiver, suppressed ? this.matClayDark : this.matClayMid, 0, 0, 0));

    // Upper dust cover bevel & charging handle
    g.add(this.part(new THREE.BoxGeometry(0.028, 0.012, 0.18), this.matClayLight, 0, 0.038, -0.06));
    g.add(this.part(new THREE.BoxGeometry(0.024, 0.008, 0.010), this.matClayLight, 0.024, 0.024, -0.10));

    // Tapered front handguard + cooling vent ribs
    const handguard = this.extrudeSideProfile(
      [
        [0.20, -0.008],
        [0.44, -0.003],
        [0.43, 0.032],
        [0.20, 0.034],
      ],
      0.034,
      0.003
    );
    g.add(this.part(handguard, this.matClayDark, 0, 0, 0));
    for (let i = 0; i < 3; i++) {
      g.add(this.part(new THREE.BoxGeometry(0.042, 0.008, 0.022), this.matGrip, 0, 0.016, -0.26 - i * 0.046));
    }

    // Skeletonized buttstock
    const stock = this.extrudeSideProfile(
      [
        [-0.175, -0.035],
        [-0.155, -0.035],
        [-0.06, 0.002],
        [-0.06, 0.028],
        [-0.175, 0.022],
      ],
      0.024,
      0.002
    );
    g.add(this.part(stock, this.matClayDark, 0, 0, 0));

    // Ergonomic pistol grip + curved banana magazine
    const grip = this.extrudeSideProfile(
      [
        [-0.055, -0.090],
        [-0.022, -0.092],
        [0.002, -0.016],
        [-0.030, -0.016],
      ],
      0.024,
      0.002
    );
    g.add(this.part(grip, this.matGrip, 0, 0, 0));

    const mag = this.extrudeSideProfile(
      [
        [0.145, -0.142],
        [0.185, -0.135],
        [0.155, -0.014],
        [0.112, -0.014],
      ],
      0.022,
      0.002
    );
    g.add(this.part(mag, suppressed ? this.matClayMid : this.matClayLight, 0, 0, 0));

    // Cylindrical barrel + gas block + suppressor or slanted muzzle brake
    const barrel = new THREE.CylinderGeometry(0.009, 0.010, 0.22, 8);
    barrel.rotateX(Math.PI * 0.5);
    g.add(this.part(barrel, this.matClayLight, 0, 0.016, -0.52));

    if (suppressed) {
      const supp = new THREE.CylinderGeometry(0.016, 0.016, 0.17, 10);
      supp.rotateX(Math.PI * 0.5);
      g.add(this.part(supp, this.matClayDark, 0, 0.016, -0.60));
    } else {
      const gasTube = new THREE.CylinderGeometry(0.006, 0.006, 0.14, 6);
      gasTube.rotateX(Math.PI * 0.5);
      g.add(this.part(gasTube, this.matClayMid, 0, 0.031, -0.46));
      const muzzle = new THREE.CylinderGeometry(0.014, 0.012, 0.055, 8);
      muzzle.rotateX(Math.PI * 0.5);
      g.add(this.part(muzzle, this.matClayLight, 0, 0.016, -0.64));
    }

    this.addOptic(g, 0.044, -0.07);
    this.addHands(g, 0, -0.032, 0.026, true, -0.28);
    return g;
  }

  private buildOperator(): THREE.Group {
    const g = new THREE.Group();
    const chassis = this.extrudeSideProfile(
      [
        [-0.09, -0.024],
        [0.44, -0.010],
        [0.43, 0.036],
        [-0.08, 0.042],
      ],
      0.042,
      0.004
    );
    g.add(this.part(chassis, this.matClayMid, 0, 0, 0));

    const barrel = new THREE.CylinderGeometry(0.012, 0.014, 0.48, 8);
    barrel.rotateX(Math.PI * 0.5);
    g.add(this.part(barrel, this.matClayDark, 0, 0.022, -0.62));
    g.add(this.part(new THREE.BoxGeometry(0.040, 0.028, 0.068), this.matClayLight, 0, 0.022, -0.86));

    // Scope tube + rings + objective bell + lens
    const scopeTube = new THREE.CylinderGeometry(0.016, 0.016, 0.24, 10);
    scopeTube.rotateX(Math.PI * 0.5);
    g.add(this.part(scopeTube, this.matClayDark, 0, 0.068, -0.13));
    const scopeBell = new THREE.CylinderGeometry(0.024, 0.016, 0.058, 10);
    scopeBell.rotateX(Math.PI * 0.5);
    g.add(this.part(scopeBell, this.matClayLight, 0, 0.068, -0.265));
    const lens = new THREE.CylinderGeometry(0.018, 0.018, 0.008, 10);
    lens.rotateX(Math.PI * 0.5);
    g.add(this.part(lens, this.matLens, 0, 0.068, -0.012));

    const mag = this.extrudeSideProfile(
      [
        [0.12, -0.088],
        [0.19, -0.086],
        [0.18, -0.015],
        [0.11, -0.015],
      ],
      0.028,
      0.002
    );
    g.add(this.part(mag, this.matClayDark, 0, 0, 0));

    const grip = this.extrudeSideProfile(
      [
        [-0.055, -0.090],
        [-0.022, -0.092],
        [0.002, -0.018],
        [-0.030, -0.018],
      ],
      0.024,
      0.002
    );
    g.add(this.part(grip, this.matGrip, 0, 0, 0));

    this.addHands(g, 0, -0.032, 0.026, true, -0.30);
    return g;
  }

  public setActiveWeapon(id: WeaponId): void {
    if (this.currentWeaponId === id) return;
    this.weaponGroups[this.currentWeaponId].visible = false;
    this.currentWeaponId = id;
    this.weaponGroups[id].visible = true;
  }

  public triggerFireKick(isKnife: boolean): void {
    if (isKnife) {
      this.swingAngle = 1.0;
    } else {
      this.kickZ = 0.055;
      this.kickPitch = 0.085;
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

    if (params.weaponId === 'OPERATOR' && params.isScoped) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;

    const decay = Math.min(1, params.dt * 18);
    this.kickZ += (0 - this.kickZ) * decay;
    this.kickPitch += (0 - this.kickPitch) * decay;
    this.swingAngle += (0 - this.swingAngle) * Math.min(1, params.dt * 12);

    if (params.isGrounded && params.horizSpeed > 0.35) {
      this.walkPhase += params.horizSpeed * params.dt * 2.2;
    }

    const bobX = Math.cos(this.walkPhase) * 0.006 * Math.min(1, params.horizSpeed / 5.4);
    const bobY = Math.abs(Math.sin(this.walkPhase)) * 0.007 * Math.min(1, params.horizSpeed / 5.4);

    const baseX = params.isADS ? 0.048 : 0.165;
    const baseY = params.isADS ? -0.055 : -0.095;
    const baseZ = params.isADS ? -0.25 : -0.34;
    const baseYaw = params.isADS ? 0.0 : 0.055;
    const baseRoll = params.isADS ? 0.0 : -0.012;

    const equipDip = params.equipRatio * -0.14;
    const reloadDip = Math.sin(params.reloadRatio * Math.PI) * -0.12;

    this.root.position.set(
      baseX + bobX - this.swingAngle * 0.14,
      baseY - bobY + equipDip + reloadDip,
      baseZ + this.kickZ - this.swingAngle * 0.08
    );

    this.root.rotation.set(
      this.kickPitch - params.equipRatio * 0.55 - this.swingAngle * 0.35,
      baseYaw + this.swingAngle * 0.55,
      baseRoll + params.rollTiltRad + this.swingAngle * 0.45
    );
  }

  public dispose(): void {
    for (const tex of this.matcapTextures) tex.dispose();
    this.matClayDark.dispose();
    this.matClayMid.dispose();
    this.matClayLight.dispose();
    this.matGrip.dispose();
    this.matGlove.dispose();
    this.matSleeve.dispose();
    this.matAccentTeal.dispose();
    this.matLens.dispose();
    this.root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        (obj as THREE.Mesh).geometry.dispose();
      }
    });
  }
}
