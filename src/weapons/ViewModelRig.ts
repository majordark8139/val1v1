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

  private readonly matPolymer = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x1f252e).convertSRGBToLinear(),
    roughness: 0.82,
    metalness: 0.1,
    envMapIntensity: 0.35,
  });
  private readonly matGunmetal = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x3a4352).convertSRGBToLinear(),
    roughness: 0.32,
    metalness: 0.82,
    envMapIntensity: 0.85,
  });
  private readonly matSteelDark = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x232933).convertSRGBToLinear(),
    roughness: 0.36,
    metalness: 0.78,
    envMapIntensity: 0.75,
  });
  private readonly matAccentGold = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xd49d45).convertSRGBToLinear(),
    roughness: 0.26,
    metalness: 0.88,
  });
  private readonly matAccentTeal = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x00e6c7).convertSRGBToLinear(),
    emissive: new THREE.Color(0x009982).convertSRGBToLinear(),
    emissiveIntensity: 0.55,
    roughness: 0.22,
    metalness: 0.5,
  });
  private readonly matGrip = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x12151a).convertSRGBToLinear(),
    roughness: 0.92,
    metalness: 0.04,
    envMapIntensity: 0.25,
  });
  private readonly matBlade = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xcbd7e4).convertSRGBToLinear(),
    roughness: 0.16,
    metalness: 0.94,
  });
  private readonly matLens = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x38bdf8).convertSRGBToLinear(),
    emissive: new THREE.Color(0x0ea5e9).convertSRGBToLinear(),
    emissiveIntensity: 0.4,
    roughness: 0.08,
    metalness: 0.35,
  });
  private readonly matGlove = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x202630).convertSRGBToLinear(),
    roughness: 0.88,
    metalness: 0.06,
    envMapIntensity: 0.25,
  });
  private readonly matSleeve = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x1b3740).convertSRGBToLinear(),
    roughness: 0.9,
    metalness: 0.04,
    envMapIntensity: 0.25,
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

  private addHandGrip(g: THREE.Group, gx: number, gy: number, gz: number, twoHanded: boolean, supportZ = -0.22): void {
    // Primary trigger hand + thumb wrap + armored knuckle plate + forearm sleeve
    g.add(this.part(new THREE.BoxGeometry(0.048, 0.052, 0.064), this.matGlove, gx, gy, gz, 0.18, 0, 0));
    g.add(this.part(new THREE.BoxGeometry(0.020, 0.022, 0.042), this.matGlove, gx - 0.020, gy + 0.020, gz - 0.012, 0.28, 0.25, 0));
    g.add(this.part(new THREE.BoxGeometry(0.044, 0.012, 0.032), this.matAccentGold, gx, gy + 0.023, gz - 0.016, 0.18, 0, 0));
    const armR = new THREE.CylinderGeometry(0.028, 0.036, 0.22, 10);
    armR.rotateX(Math.PI * 0.5);
    g.add(this.part(armR, this.matSleeve, gx + 0.036, gy - 0.038, gz + 0.13, 0.18, -0.16, 0));

    if (twoHanded) {
      // Support hand cradling handguard + armored knuckle + tucked left forearm sleeve
      g.add(this.part(new THREE.BoxGeometry(0.050, 0.044, 0.066), this.matGlove, -0.010, gy + 0.012, supportZ, 0, 0.12, 0));
      g.add(this.part(new THREE.BoxGeometry(0.042, 0.012, 0.032), this.matGunmetal, -0.014, gy + 0.032, supportZ - 0.008, 0, 0.12, 0));
      const armL = new THREE.CylinderGeometry(0.026, 0.034, 0.26, 10);
      armL.rotateX(Math.PI * 0.5);
      g.add(this.part(armL, this.matSleeve, -0.088, gy - 0.048, supportZ + 0.135, 0.24, 0.42, 0));
    }
  }

  private buildKnife(): THREE.Group {
    const g = new THREE.Group();
    const handle = new THREE.CylinderGeometry(0.015, 0.018, 0.12, 10);
    handle.rotateX(Math.PI * 0.5);
    g.add(this.part(handle, this.matGrip, 0, 0, 0));
    g.add(this.part(new THREE.BoxGeometry(0.038, 0.048, 0.014), this.matAccentGold, 0, 0.004, -0.064));

    // Tapered beveled blade profile
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, 0);
    bladeShape.lineTo(0.18, 0.01);
    bladeShape.lineTo(0.21, 0.024);
    bladeShape.lineTo(0.0, 0.034);
    bladeShape.closePath();
    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.005,
      bevelEnabled: true,
      bevelThickness: 0.002,
      bevelSize: 0.002,
      bevelSegments: 1,
    });
    bladeGeo.rotateY(Math.PI * 0.5);
    g.add(this.part(bladeGeo, this.matBlade, -0.0025, -0.006, -0.068));

    // Glowing radianite edge strip
    g.add(this.part(new THREE.BoxGeometry(0.003, 0.006, 0.155), this.matAccentTeal, 0, -0.002, -0.15));
    this.addHandGrip(g, 0.005, -0.005, 0.01, false);
    g.rotation.set(0.16, 0.28, -0.22);
    return g;
  }

  private buildPistol(suppressed: boolean, revolver: boolean): THREE.Group {
    const g = new THREE.Group();

    // Angled ergonomic pistol grip
    g.add(this.part(new THREE.BoxGeometry(0.031, 0.102, 0.042), this.matGrip, 0, -0.042, 0.018, 0.22, 0, 0));
    g.add(this.part(new THREE.BoxGeometry(0.034, 0.014, 0.048), this.matAccentGold, 0, -0.09, 0.028, 0.22, 0, 0));

    // Trigger guard & trigger
    g.add(this.part(new THREE.BoxGeometry(0.010, 0.006, 0.045), this.matSteelDark, 0, -0.025, -0.032));
    g.add(this.part(new THREE.BoxGeometry(0.010, 0.026, 0.006), this.matSteelDark, 0, -0.012, -0.052));
    g.add(this.part(new THREE.BoxGeometry(0.005, 0.016, 0.006), this.matAccentGold, 0, -0.008, -0.026, -0.25, 0, 0));

    // Lower polymer frame + Picatinny under-rail
    g.add(this.part(new THREE.BoxGeometry(0.030, 0.020, 0.175), this.matPolymer, 0, 0.002, -0.065));

    if (revolver) {
      // Sheriff: fluted cylinder + heavy vented barrel shroud
      const drum = new THREE.CylinderGeometry(0.025, 0.025, 0.058, 12);
      drum.rotateX(Math.PI * 0.5);
      g.add(this.part(drum, this.matAccentGold, 0, 0.024, -0.045));
      g.add(this.part(new THREE.BoxGeometry(0.024, 0.034, 0.155), this.matGunmetal, 0, 0.026, -0.155));
      const barrel = new THREE.CylinderGeometry(0.010, 0.010, 0.17, 10);
      barrel.rotateX(Math.PI * 0.5);
      g.add(this.part(barrel, this.matSteelDark, 0, 0.030, -0.155));
    } else {
      // Classic / Ghost: beveled upper slide with ejection port & serrations
      const slide = new THREE.BoxGeometry(0.033, 0.032, 0.195);
      g.add(this.part(slide, suppressed ? this.matSteelDark : this.matGunmetal, 0, 0.025, -0.062));
      g.add(this.part(new THREE.BoxGeometry(0.035, 0.012, 0.038), this.matGrip, 0.002, 0.032, -0.068));

      // Slide serrations
      for (let i = 0; i < 4; i++) {
        g.add(this.part(new THREE.BoxGeometry(0.036, 0.022, 0.004), this.matPolymer, 0, 0.025, 0.005 + i * 0.008));
      }

      // Cylindrical inner barrel tip
      const barrel = new THREE.CylinderGeometry(0.008, 0.008, 0.03, 10);
      barrel.rotateX(Math.PI * 0.5);
      g.add(this.part(barrel, this.matSteelDark, 0, 0.024, -0.168));
    }

    // Rear & front tritium iron sights
    g.add(this.part(new THREE.BoxGeometry(0.020, 0.009, 0.010), this.matSteelDark, 0, 0.044, 0.018));
    g.add(this.part(new THREE.BoxGeometry(0.006, 0.008, 0.010), this.matAccentTeal, 0, 0.044, -0.148));

    if (suppressed) {
      const supp = new THREE.CylinderGeometry(0.014, 0.014, 0.175, 14);
      supp.rotateX(Math.PI * 0.5);
      g.add(this.part(supp, this.matPolymer, 0, 0.024, -0.25));
      const collar = new THREE.CylinderGeometry(0.016, 0.016, 0.018, 14);
      collar.rotateX(Math.PI * 0.5);
      g.add(this.part(collar, this.matAccentTeal, 0, 0.024, -0.172));
    }

    this.addHandGrip(g, 0, -0.035, 0.025, false);
    return g;
  }

  private buildSmg(): THREE.Group {
    const g = new THREE.Group();
    g.add(this.part(new THREE.BoxGeometry(0.044, 0.058, 0.30), this.matSteelDark, 0, 0.015, -0.09));
    g.add(this.part(new THREE.BoxGeometry(0.038, 0.022, 0.28), this.matGunmetal, 0, 0.048, -0.09));
    g.add(this.part(new THREE.BoxGeometry(0.028, 0.092, 0.038), this.matGrip, 0, -0.045, 0.03, 0.18, 0, 0));
    g.add(this.part(new THREE.BoxGeometry(0.024, 0.135, 0.032), this.matGunmetal, 0, -0.072, -0.085, -0.14, 0, 0));

    // Integrated cylindrical suppressor shroud
    const supp = new THREE.CylinderGeometry(0.019, 0.019, 0.19, 14);
    supp.rotateX(Math.PI * 0.5);
    g.add(this.part(supp, this.matPolymer, 0, 0.020, -0.32));

    // Reflex red-dot optic
    g.add(this.part(new THREE.BoxGeometry(0.030, 0.026, 0.068), this.matPolymer, 0, 0.070, -0.05));
    g.add(this.part(new THREE.BoxGeometry(0.022, 0.018, 0.008), this.matLens, 0, 0.072, -0.082));
    g.add(this.part(new THREE.BoxGeometry(0.046, 0.010, 0.12), this.matAccentTeal, 0, 0.018, -0.17));

    this.addHandGrip(g, 0, -0.03, 0.03, true, -0.19);
    return g;
  }

  private buildRifle(suppressed: boolean): THREE.Group {
    const g = new THREE.Group();
    const recMat = suppressed ? this.matSteelDark : this.matGunmetal;

    // Upper & lower receiver + compact beveled stock
    g.add(this.part(new THREE.BoxGeometry(0.042, 0.050, 0.32), recMat, 0, 0.016, -0.09));
    g.add(this.part(new THREE.BoxGeometry(0.038, 0.024, 0.24), this.matPolymer, 0, -0.014, -0.07));
    g.add(this.part(new THREE.BoxGeometry(0.028, 0.048, 0.13), this.matPolymer, 0, 0.008, 0.12, -0.04, 0, 0));

    // Angled grip & curved magazine
    g.add(this.part(new THREE.BoxGeometry(0.028, 0.095, 0.038), this.matGrip, 0, -0.048, 0.025, 0.22, 0, 0));
    g.add(this.part(new THREE.BoxGeometry(0.026, 0.125, 0.048), suppressed ? this.matGunmetal : this.matAccentGold, 0, -0.078, -0.13, -0.16, 0, 0));

    // Vented handguard + cylindrical barrel + muzzle/suppressor
    g.add(this.part(new THREE.BoxGeometry(0.042, 0.046, 0.22), this.matPolymer, 0, 0.020, -0.35));
    const barrel = new THREE.CylinderGeometry(0.010, 0.011, 0.22, 10);
    barrel.rotateX(Math.PI * 0.5);
    g.add(this.part(barrel, this.matSteelDark, 0, 0.024, -0.52));

    if (suppressed) {
      const supp = new THREE.CylinderGeometry(0.018, 0.018, 0.17, 14);
      supp.rotateX(Math.PI * 0.5);
      g.add(this.part(supp, this.matPolymer, 0, 0.024, -0.60));
      g.add(this.part(new THREE.BoxGeometry(0.048, 0.010, 0.14), this.matAccentTeal, 0, 0.020, -0.34));
    } else {
      const muzzle = new THREE.CylinderGeometry(0.016, 0.013, 0.055, 8);
      muzzle.rotateX(Math.PI * 0.5);
      g.add(this.part(muzzle, this.matAccentGold, 0, 0.024, -0.64));
      g.add(this.part(new THREE.BoxGeometry(0.048, 0.010, 0.14), this.matAccentGold, 0, 0.020, -0.34));
    }

    // Open U-frame reflex optic housing + glowing reticle emitter
    g.add(this.part(new THREE.BoxGeometry(0.028, 0.010, 0.16), this.matSteelDark, 0, 0.048, -0.08));
    g.add(this.part(new THREE.BoxGeometry(0.034, 0.008, 0.054), this.matPolymer, 0, 0.056, -0.07));
    g.add(this.part(new THREE.BoxGeometry(0.005, 0.022, 0.042), this.matSteelDark, -0.015, 0.068, -0.07));
    g.add(this.part(new THREE.BoxGeometry(0.005, 0.022, 0.042), this.matSteelDark, 0.015, 0.068, -0.07));
    g.add(this.part(new THREE.BoxGeometry(0.035, 0.005, 0.042), this.matGunmetal, 0, 0.080, -0.07));
    g.add(this.part(new THREE.BoxGeometry(0.004, 0.004, 0.006), this.matAccentTeal, 0, 0.068, -0.075));

    this.addHandGrip(g, 0, -0.032, 0.028, true, -0.32);
    return g;
  }

  private buildOperator(): THREE.Group {
    const g = new THREE.Group();
    g.add(this.part(new THREE.BoxGeometry(0.052, 0.068, 0.42), this.matSteelDark, 0, 0.012, -0.14));
    g.add(this.part(new THREE.BoxGeometry(0.044, 0.040, 0.22), this.matPolymer, 0, 0.010, -0.42));

    // Long fluted sniper barrel + rectangular muzzle brake
    const barrel = new THREE.CylinderGeometry(0.013, 0.015, 0.48, 12);
    barrel.rotateX(Math.PI * 0.5);
    g.add(this.part(barrel, this.matGunmetal, 0, 0.028, -0.58));
    g.add(this.part(new THREE.BoxGeometry(0.044, 0.030, 0.065), this.matAccentGold, 0, 0.028, -0.83));

    // Cylindrical high-power scope tube + objective bell + sapphire lens
    const scopeTube = new THREE.CylinderGeometry(0.018, 0.018, 0.24, 14);
    scopeTube.rotateX(Math.PI * 0.5);
    g.add(this.part(scopeTube, this.matPolymer, 0, 0.076, -0.13));
    const scopeBell = new THREE.CylinderGeometry(0.025, 0.018, 0.06, 14);
    scopeBell.rotateX(Math.PI * 0.5);
    g.add(this.part(scopeBell, this.matGunmetal, 0, 0.076, -0.26));
    const lens = new THREE.CylinderGeometry(0.020, 0.020, 0.01, 14);
    lens.rotateX(Math.PI * 0.5);
    g.add(this.part(lens, this.matLens, 0, 0.076, -0.01));

    // Mag, bolt handle & stock
    g.add(this.part(new THREE.BoxGeometry(0.032, 0.085, 0.075), this.matGunmetal, 0, -0.055, -0.15));
    g.add(this.part(new THREE.BoxGeometry(0.040, 0.062, 0.22), this.matPolymer, 0, 0.005, 0.17));
    g.add(this.part(new THREE.BoxGeometry(0.028, 0.095, 0.038), this.matGrip, 0, -0.048, 0.025, 0.22, 0, 0));

    this.addHandGrip(g, 0, -0.032, 0.028, true, -0.35);
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

    // Hide viewmodel when Operator is scoped
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

    // Valorant-style lower-right framing clearly above the bottom-right ammo HUD
    const baseX = params.isADS ? 0.048 : 0.148;
    const baseY = params.isADS ? -0.048 : -0.068;
    const baseZ = params.isADS ? -0.25 : -0.36;
    const baseYaw = params.isADS ? 0.0 : 0.055;
    const baseRoll = params.isADS ? 0.0 : -0.02;

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
    this.matPolymer.dispose();
    this.matGunmetal.dispose();
    this.matSteelDark.dispose();
    this.matAccentGold.dispose();
    this.matAccentTeal.dispose();
    this.matGrip.dispose();
    this.matBlade.dispose();
    this.matLens.dispose();
    this.matGlove.dispose();
    this.matSleeve.dispose();
    this.root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        (obj as THREE.Mesh).geometry.dispose();
      }
    });
  }
}
