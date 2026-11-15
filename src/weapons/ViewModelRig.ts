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

  private readonly matBodyDark = new THREE.MeshLambertMaterial({ color: 0x22272e });
  private readonly matBodyGunmetal = new THREE.MeshLambertMaterial({ color: 0x3a414c });
  private readonly matAccentGold = new THREE.MeshLambertMaterial({ color: 0xd4a359 });
  private readonly matAccentTeal = new THREE.MeshLambertMaterial({ color: 0x00f5d4 });
  private readonly matGrip = new THREE.MeshLambertMaterial({ color: 0x16181d });
  private readonly matBlade = new THREE.MeshLambertMaterial({ color: 0xb8c4d0 });
  private readonly matLens = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

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

  private box(
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number
  ): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return m;
  }

  private buildKnife(): THREE.Group {
    const g = new THREE.Group();
    g.add(this.box(0.028, 0.032, 0.12, this.matGrip, 0, 0, 0));
    g.add(this.box(0.034, 0.045, 0.015, this.matAccentGold, 0, 0.005, -0.065));
    const blade = this.box(0.008, 0.032, 0.17, this.matBlade, 0, 0.012, -0.155);
    const edge = this.box(0.005, 0.012, 0.16, this.matAccentTeal, 0, -0.004, -0.15);
    g.add(blade, edge);
    g.rotation.set(0.18, 0.25, -0.2);
    return g;
  }

  private buildPistol(suppressed: boolean, revolver: boolean): THREE.Group {
    const g = new THREE.Group();
    g.add(this.box(0.036, 0.044, 0.20, revolver ? this.matBodyGunmetal : this.matBodyDark, 0, 0.02, -0.06));
    g.add(this.box(0.032, 0.095, 0.042, this.matGrip, 0, -0.04, 0.01));
    g.add(this.box(0.012, 0.010, 0.02, this.matAccentTeal, 0, 0.048, -0.145));
    if (revolver) {
      g.add(this.box(0.048, 0.048, 0.065, this.matAccentGold, 0, 0.015, -0.045));
      g.add(this.box(0.024, 0.026, 0.14, this.matBodyGunmetal, 0, 0.026, -0.16));
    } else {
      g.add(this.box(0.030, 0.022, 0.18, this.matBodyGunmetal, 0, -0.008, -0.06));
    }
    if (suppressed) {
      g.add(this.box(0.028, 0.028, 0.16, this.matGrip, 0, 0.022, -0.23));
      g.add(this.box(0.030, 0.030, 0.015, this.matAccentTeal, 0, 0.022, -0.17));
    }
    return g;
  }

  private buildSmg(): THREE.Group {
    const g = new THREE.Group();
    g.add(this.box(0.048, 0.065, 0.30, this.matBodyDark, 0, 0.015, -0.08));
    g.add(this.box(0.028, 0.13, 0.035, this.matGrip, 0, -0.07, -0.08));
    g.add(this.box(0.032, 0.09, 0.04, this.matGrip, 0, -0.045, 0.03));
    g.add(this.box(0.032, 0.032, 0.16, this.matBodyGunmetal, 0, 0.02, -0.30));
    g.add(this.box(0.026, 0.022, 0.07, this.matAccentTeal, 0, 0.058, -0.04));
    return g;
  }

  private buildRifle(suppressed: boolean): THREE.Group {
    const g = new THREE.Group();
    // Receiver + Barrel + Magazine + Stock + Handguard + Sight
    g.add(this.box(0.050, 0.070, 0.34, suppressed ? this.matBodyDark : this.matBodyGunmetal, 0, 0.015, -0.10));
    g.add(this.box(0.042, 0.055, 0.22, this.matBodyDark, 0, 0.020, -0.34));
    g.add(this.box(0.022, 0.022, 0.20, this.matGrip, 0, 0.024, -0.52));
    g.add(this.box(0.032, 0.125, 0.048, suppressed ? this.matBodyGunmetal : this.matAccentGold, 0, -0.075, -0.14));
    g.add(this.box(0.034, 0.09, 0.04, this.matGrip, 0, -0.045, 0.03));
    g.add(this.box(0.040, 0.055, 0.16, this.matBodyDark, 0, 0.01, 0.14));
    g.add(this.box(0.028, 0.024, 0.065, this.matBodyDark, 0, 0.062, -0.06));
    g.add(this.box(0.014, 0.014, 0.01, suppressed ? this.matAccentTeal : this.matAccentGold, 0, 0.064, -0.095));
    return g;
  }

  private buildOperator(): THREE.Group {
    const g = new THREE.Group();
    g.add(this.box(0.058, 0.075, 0.42, this.matBodyDark, 0, 0.01, -0.14));
    g.add(this.box(0.024, 0.024, 0.46, this.matBodyGunmetal, 0, 0.03, -0.55));
    g.add(this.box(0.042, 0.036, 0.06, this.matAccentGold, 0, 0.03, -0.78));
    // Scope assembly
    g.add(this.box(0.036, 0.036, 0.24, this.matGrip, 0, 0.075, -0.12));
    g.add(this.box(0.044, 0.044, 0.04, this.matLens, 0, 0.075, -0.01));
    // Mag & Stock
    g.add(this.box(0.036, 0.09, 0.07, this.matBodyGunmetal, 0, -0.06, -0.15));
    g.add(this.box(0.044, 0.065, 0.22, this.matBodyDark, 0, 0.005, 0.17));
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

    // ADS brings weapon slightly closer to center
    const baseX = params.isADS ? 0.08 : 0.22;
    const baseY = params.isADS ? -0.17 : -0.21;
    const baseZ = params.isADS ? -0.32 : -0.38;

    const equipDip = params.equipRatio * -0.18;
    const reloadDip = Math.sin(params.reloadRatio * Math.PI) * -0.16;

    this.root.position.set(
      baseX + bobX - this.swingAngle * 0.14,
      baseY - bobY + equipDip + reloadDip,
      baseZ + this.kickZ - this.swingAngle * 0.08
    );

    this.root.rotation.set(
      this.kickPitch - params.equipRatio * 0.55 - this.swingAngle * 0.35,
      this.swingAngle * 0.55,
      params.rollTiltRad + this.swingAngle * 0.45
    );
  }

  public dispose(): void {
    this.matBodyDark.dispose();
    this.matBodyGunmetal.dispose();
    this.matAccentGold.dispose();
    this.matAccentTeal.dispose();
    this.matGrip.dispose();
    this.matBlade.dispose();
    this.matLens.dispose();
    this.root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        (obj as THREE.Mesh).geometry.dispose();
      }
    });
  }
}
