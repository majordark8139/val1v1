import * as THREE from 'three';
import { WeaponId } from '../config/WeaponData';

export class ViewModelRig {
  public readonly root = new THREE.Group();
  private readonly weaponGroups: Record<WeaponId, THREE.Group>;
  private currentWeaponId: WeaponId = 'CLASSIC';

  private kickZ = 0;
  private kickPitch = 0;
  private swingAngle = 0;
  private walkPhase = 0;

  // Clean Blender Clay / Low-Poly Matte Weapon Palette (MeshLambertMaterial for locked 60+ FPS)
  private readonly matClayDark = new THREE.MeshLambertMaterial({
    color: new THREE.Color(0x3a3f48).convertSRGBToLinear(),
  });
  private readonly matClayMid = new THREE.MeshLambertMaterial({
    color: new THREE.Color(0x6c7380).convertSRGBToLinear(),
  });
  private readonly matClayLight = new THREE.MeshLambertMaterial({
    color: new THREE.Color(0xc5c9d2).convertSRGBToLinear(),
  });
  private readonly matGrip = new THREE.MeshLambertMaterial({
    color: new THREE.Color(0x252930).convertSRGBToLinear(),
  });
  private readonly matGlove = new THREE.MeshLambertMaterial({
    color: new THREE.Color(0xd8dae0).convertSRGBToLinear(),
  });
  private readonly matAccentTeal = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x00e6c7).convertSRGBToLinear(),
  });
  private readonly matLens = new THREE.MeshLambertMaterial({
    color: new THREE.Color(0x88b4c8).convertSRGBToLinear(),
    emissive: new THREE.Color(0x1f4b5c).convertSRGBToLinear(),
  });

  constructor() {
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
    // Center thickness along Z then rotate Y=+90deg so shape +X maps to -Z (forward)
    geo.translate(0, 0, -thickness * 0.5);
    geo.rotateY(Math.PI * 0.5);
    return geo;
  }

  private addHands(
    g: THREE.Group,
    gx: number,
    gy: number,
    gz: number,
    twoHanded: boolean,
    supportZ = -0.24
  ): void {
    // Primary trigger hand wrapping grip cleanly (zero floating pipes)
    g.add(this.part(new THREE.BoxGeometry(0.042, 0.048, 0.056), this.matGlove, gx, gy, gz, 0.2, 0, 0));
    g.add(this.part(new THREE.BoxGeometry(0.018, 0.020, 0.036), this.matGlove, gx - 0.018, gy + 0.018, gz - 0.012, 0.28, 0.25, 0));
    g.add(this.part(new THREE.BoxGeometry(0.044, 0.012, 0.030), this.matClayDark, gx, gy + 0.021, gz - 0.012, 0.2, 0, 0));
    // Wrist cuff connecting smoothly toward off-screen right shoulder
    const wristR = new THREE.CylinderGeometry(0.024, 0.030, 0.16, 8);
    wristR.rotateX(Math.PI * 0.5);
    g.add(this.part(wristR, this.matClayDark, gx + 0.024, gy - 0.032, gz + 0.095, 0.26, -0.18, 0));

    if (twoHanded) {
      // Support hand cradling handguard + compact wrist cuff (no protruding pipe)
      g.add(this.part(new THREE.BoxGeometry(0.046, 0.040, 0.062), this.matGlove, -0.008, gy + 0.014, supportZ, 0, 0.1, 0));
      g.add(this.part(new THREE.BoxGeometry(0.040, 0.012, 0.030), this.matClayDark, -0.012, gy + 0.032, supportZ - 0.006, 0, 0.1, 0));
      const cuffL = new THREE.CylinderGeometry(0.022, 0.025, 0.055, 8);
      cuffL.rotateX(Math.PI * 0.5);
      g.add(this.part(cuffL, this.matClayDark, -0.024, gy - 0.008, supportZ + 0.042, 0.52, 0.35, 0));
    }
  }

  private buildKnife(): THREE.Group {
    const g = new THREE.Group();
    const handle = this.extrudeSideProfile(
      [
        [-0.06, -0.014],
        [0.05, -0.012],
        [0.06, 0.014],
        [-0.05, 0.016],
      ],
      0.018,
      0.003
    );
    g.add(this.part(handle, this.matGrip, 0, 0, 0));
    // Pommel ring
    const ring = new THREE.TorusGeometry(0.014, 0.004, 6, 12);
    ring.rotateY(Math.PI * 0.5);
    g.add(this.part(ring, this.matClayLight, 0, -0.002, 0.072));
    // Guard
    g.add(this.part(new THREE.BoxGeometry(0.028, 0.044, 0.014), this.matClayDark, 0, 0.004, -0.06));
    // Curved swept tactical blade
    const blade = this.extrudeSideProfile(
      [
        [0.06, -0.010],
        [0.21, -0.002],
        [0.255, 0.018],
        [0.18, 0.024],
        [0.06, 0.020],
      ],
      0.005,
      0.002
    );
    g.add(this.part(blade, this.matClayLight, 0, 0, 0));
    g.add(this.part(new THREE.BoxGeometry(0.003, 0.005, 0.14), this.matAccentTeal, 0, 0.003, -0.145));
    this.addHands(g, 0.004, -0.004, 0.005, false);
    g.rotation.set(0.16, 0.24, -0.22);
    return g;
  }

  private buildPistol(suppressed: boolean, revolver: boolean): THREE.Group {
    const g = new THREE.Group();

    // Sculpted angled ergonomic grip
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

    // Trigger guard & curved trigger
    g.add(this.part(new THREE.BoxGeometry(0.009, 0.005, 0.042), this.matClayDark, 0, -0.026, -0.036));
    g.add(this.part(new THREE.BoxGeometry(0.009, 0.024, 0.006), this.matClayDark, 0, -0.014, -0.056));
    g.add(this.part(new THREE.BoxGeometry(0.004, 0.014, 0.005), this.matClayLight, 0, -0.009, -0.030, -0.25, 0, 0));

    // Lower receiver frame
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
      const drum = new THREE.CylinderGeometry(0.024, 0.024, 0.054, 8);
      drum.rotateX(Math.PI * 0.5);
      g.add(this.part(drum, this.matClayLight, 0, 0.026, -0.045));
      const shroud = this.extrudeSideProfile(
        [
          [0.075, 0.012],
          [0.245, 0.014],
          [0.235, 0.042],
          [0.075, 0.042],
        ],
        0.022,
        0.002
      );
      g.add(this.part(shroud, this.matClayMid, 0, 0, 0));
      const barrel = new THREE.CylinderGeometry(0.009, 0.009, 0.17, 8);
      barrel.rotateX(Math.PI * 0.5);
      g.add(this.part(barrel, this.matClayDark, 0, 0.032, -0.165));
    } else {
      // Chamfered slide profile
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
        g.add(this.part(new THREE.BoxGeometry(0.036, 0.020, 0.004), this.matGrip, 0, 0.026, 0.004 + i * 0.008));
      }
      const barrel = new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8);
      barrel.rotateX(Math.PI * 0.5);
      g.add(this.part(barrel, this.matClayDark, 0, 0.025, -0.172));
    }

    // Iron sights + tritium front dot
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
    this.addHands(g, 0, -0.03, 0.025, true, -0.19);
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

    // Sculpted chamfered rifle receiver + angled upper + handguard
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

    // Tapered front handguard
    const handguard = this.extrudeSideProfile(
      [
        [0.20, -0.006],
        [0.44, -0.002],
        [0.43, 0.032],
        [0.20, 0.034],
      ],
      0.034,
      0.003
    );
    g.add(this.part(handguard, this.matClayDark, 0, 0, 0));

    // Compact skeletonized buttstock
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

    // Ergonomic grip + curved banana magazine
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

    // Cylindrical barrel + suppressor or muzzle brake
    const barrel = new THREE.CylinderGeometry(0.009, 0.010, 0.22, 8);
    barrel.rotateX(Math.PI * 0.5);
    g.add(this.part(barrel, this.matClayLight, 0, 0.016, -0.52));

    if (suppressed) {
      const supp = new THREE.CylinderGeometry(0.016, 0.016, 0.16, 10);
      supp.rotateX(Math.PI * 0.5);
      g.add(this.part(supp, this.matClayDark, 0, 0.016, -0.60));
    } else {
      const muzzle = new THREE.CylinderGeometry(0.015, 0.012, 0.05, 8);
      muzzle.rotateX(Math.PI * 0.5);
      g.add(this.part(muzzle, this.matClayLight, 0, 0.016, -0.64));
    }

    this.addOptic(g, 0.041, -0.07);
    this.addHands(g, 0, -0.032, 0.026, true, -0.29);
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
    g.add(this.part(new THREE.BoxGeometry(0.038, 0.026, 0.06), this.matClayLight, 0, 0.022, -0.86));

    // Scope tube + objective bell + lens
    const scopeTube = new THREE.CylinderGeometry(0.016, 0.016, 0.23, 10);
    scopeTube.rotateX(Math.PI * 0.5);
    g.add(this.part(scopeTube, this.matClayDark, 0, 0.066, -0.13));
    const scopeBell = new THREE.CylinderGeometry(0.023, 0.016, 0.055, 10);
    scopeBell.rotateX(Math.PI * 0.5);
    g.add(this.part(scopeBell, this.matClayLight, 0, 0.066, -0.26));
    const lens = new THREE.CylinderGeometry(0.018, 0.018, 0.008, 10);
    lens.rotateX(Math.PI * 0.5);
    g.add(this.part(lens, this.matLens, 0, 0.066, -0.015));

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

    this.addHands(g, 0, -0.032, 0.026, true, -0.32);
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

    const baseX = params.isADS ? 0.048 : 0.145;
    const baseY = params.isADS ? -0.048 : -0.068;
    const baseZ = params.isADS ? -0.25 : -0.35;
    const baseYaw = params.isADS ? 0.0 : 0.065;
    const baseRoll = params.isADS ? 0.0 : -0.015;

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
    this.matClayDark.dispose();
    this.matClayMid.dispose();
    this.matClayLight.dispose();
    this.matGrip.dispose();
    this.matGlove.dispose();
    this.matAccentTeal.dispose();
    this.matLens.dispose();
    this.root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        (obj as THREE.Mesh).geometry.dispose();
      }
    });
  }
}
