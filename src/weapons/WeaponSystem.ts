import { CAMERA_CONFIG } from '../config/Constants';
import { WEAPON_DATA, WeaponId, WeaponSlot, WeaponSpec } from '../config/WeaponData';

export interface WeaponInventorySlot {
  id: WeaponId;
  mag: number;
  reserve: number;
}

export class WeaponSystem {
  public slots: Record<WeaponSlot, WeaponInventorySlot | null> = {
    1: null,
    2: {
      id: 'CLASSIC',
      mag: WEAPON_DATA.CLASSIC.magSize,
      reserve: WEAPON_DATA.CLASSIC.reserveSize,
    },
    3: {
      id: 'KNIFE',
      mag: 0,
      reserve: 0,
    },
  };

  public activeSlot: WeaponSlot = 2;
  public fireCooldown = 0;
  public equipTimer = 0;
  public reloadTimer = 0;
  public boltTimer = 0;

  // Scope/ADS state: 0 = Hip, 1 = ADS / 2.5x, 2 = 5.0x (Operator)
  public scopeLevel: 0 | 1 | 2 = 0;
  private resumeScopeLevel: 0 | 1 | 2 = 0;
  public autoRescope = true;

  public resetForNewRound(preservePurchased: boolean): void {
    if (!preservePurchased) {
      this.slots[1] = null;
      this.slots[2] = {
        id: 'CLASSIC',
        mag: WEAPON_DATA.CLASSIC.magSize,
        reserve: WEAPON_DATA.CLASSIC.reserveSize,
      };
    } else {
      // Refill ammo on survived weapons
      if (this.slots[1]) {
        const s = WEAPON_DATA[this.slots[1].id];
        this.slots[1].mag = s.magSize;
        this.slots[1].reserve = s.reserveSize;
      }
      if (this.slots[2]) {
        const s = WEAPON_DATA[this.slots[2].id];
        this.slots[2].mag = s.magSize;
        this.slots[2].reserve = s.reserveSize;
      }
    }
    this.activeSlot = this.slots[1] ? 1 : 2;
    this.fireCooldown = 0;
    this.reloadTimer = 0;
    this.boltTimer = 0;
    this.scopeLevel = 0;
    this.resumeScopeLevel = 0;
    this.equipTimer = this.getActiveSpec().equipTime;
  }

  public grantWeapon(id: WeaponId): void {
    const spec = WEAPON_DATA[id];
    this.slots[spec.slot] = {
      id,
      mag: spec.magSize,
      reserve: spec.reserveSize,
    };
    this.switchSlot(spec.slot, true);
  }

  public getActiveSlot(): WeaponInventorySlot {
    return this.slots[this.activeSlot] ?? this.slots[3]!;
  }

  public getActiveSpec(): WeaponSpec {
    return WEAPON_DATA[this.getActiveSlot().id];
  }

  public isScoped(): boolean {
    return this.scopeLevel > 0;
  }

  public getTargetVFov(): number {
    const spec = this.getActiveSpec();
    if (this.scopeLevel === 0) return CAMERA_CONFIG.DEFAULT_VFOV;
    if (spec.id === 'OPERATOR') {
      return this.scopeLevel === 2
        ? CAMERA_CONFIG.SCOPE_50X_VFOV
        : CAMERA_CONFIG.SCOPE_25X_VFOV;
    }
    if (spec.id === 'SPECTRE') return CAMERA_CONFIG.ADS_SMG_VFOV;
    return CAMERA_CONFIG.ADS_RIFLE_VFOV;
  }

  public switchSlot(slot: WeaponSlot, force = false): boolean {
    if (!this.slots[slot]) return false;
    if (!force && slot === this.activeSlot) return false;
    this.activeSlot = slot;
    this.reloadTimer = 0;
    this.boltTimer = 0;
    this.fireCooldown = 0;
    this.scopeLevel = 0;
    this.resumeScopeLevel = 0;
    this.equipTimer = this.getActiveSpec().equipTime;
    return true;
  }

  public startReload(): boolean {
    const inv = this.getActiveSlot();
    const spec = WEAPON_DATA[inv.id];
    if (spec.id === 'KNIFE') return false;
    if (this.reloadTimer > 0 || this.equipTimer > 0) return false;
    if (inv.mag >= spec.magSize || inv.reserve <= 0) return false;
    this.reloadTimer = spec.reloadTime;
    this.scopeLevel = 0;
    this.resumeScopeLevel = 0;
    return true;
  }

  public toggleAltFire(): { scopedChanged: boolean; classicBurst: boolean; knifeStab: boolean } {
    const spec = this.getActiveSpec();
    if (spec.id === 'CLASSIC') {
      return { scopedChanged: false, classicBurst: true, knifeStab: false };
    }
    if (spec.id === 'KNIFE') {
      return { scopedChanged: false, classicBurst: false, knifeStab: true };
    }
    if (spec.id === 'OPERATOR') {
      if (this.reloadTimer > 0 || this.boltTimer > 0) {
        return { scopedChanged: false, classicBurst: false, knifeStab: false };
      }
      this.scopeLevel = ((this.scopeLevel + 1) % 3) as 0 | 1 | 2;
      return { scopedChanged: true, classicBurst: false, knifeStab: false };
    }
    if (spec.id === 'SPECTRE' || spec.id === 'PHANTOM' || spec.id === 'VANDAL') {
      if (this.reloadTimer > 0) return { scopedChanged: false, classicBurst: false, knifeStab: false };
      this.scopeLevel = this.scopeLevel === 0 ? 1 : 0;
      return { scopedChanged: true, classicBurst: false, knifeStab: false };
    }
    return { scopedChanged: false, classicBurst: false, knifeStab: false };
  }

  public updateTimers(dt: number): { reloadFinished: boolean } {
    let reloadFinished = false;

    if (this.equipTimer > 0) {
      this.equipTimer = Math.max(0, this.equipTimer - dt);
    }
    if (this.fireCooldown > 0) {
      this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    }
    if (this.boltTimer > 0) {
      this.boltTimer = Math.max(0, this.boltTimer - dt);
      if (this.boltTimer === 0 && this.resumeScopeLevel > 0 && this.autoRescope) {
        if (this.getActiveSpec().id === 'OPERATOR') {
          this.scopeLevel = this.resumeScopeLevel;
        }
        this.resumeScopeLevel = 0;
      }
    }
    if (this.reloadTimer > 0) {
      this.reloadTimer = Math.max(0, this.reloadTimer - dt);
      if (this.reloadTimer === 0) {
        const inv = this.getActiveSlot();
        const spec = WEAPON_DATA[inv.id];
        const needed = spec.magSize - inv.mag;
        const transfer = Math.min(needed, inv.reserve);
        inv.mag += transfer;
        inv.reserve -= transfer;
        reloadFinished = true;
      }
    }

    return { reloadFinished };
  }

  public tryFirePrimary(fireHeld: boolean, fireJustPressed: boolean): boolean {
    const spec = this.getActiveSpec();
    const inv = this.getActiveSlot();

    if (this.equipTimer > 0 || this.reloadTimer > 0 || this.fireCooldown > 0) {
      return false;
    }

    const wantFire = spec.fireMode === 'AUTO' ? fireHeld : fireJustPressed;
    if (!wantFire) return false;

    if (spec.id === 'KNIFE') {
      this.fireCooldown = 60 / spec.fireRateRPM;
      return true;
    }

    if (inv.mag <= 0) {
      this.startReload();
      return false;
    }

    inv.mag -= 1;
    let effectiveRPM = spec.fireRateRPM;
    if (this.scopeLevel > 0 && (spec.id === 'SPECTRE' || spec.id === 'PHANTOM' || spec.id === 'VANDAL')) {
      effectiveRPM *= 0.9;
    }
    this.fireCooldown = 60 / effectiveRPM;

    if (spec.id === 'OPERATOR') {
      if (this.scopeLevel > 0) {
        this.resumeScopeLevel = this.scopeLevel;
        this.scopeLevel = 0;
      }
      this.boltTimer = 1.66;
    }

    if (inv.mag === 0 && inv.reserve > 0 && spec.id !== 'OPERATOR') {
      // Auto-reload after shot cooldown if empty
    }

    return true;
  }

  public tryFireAlt(altJustPressed: boolean): { firedBurst: number; firedKnifeStab: boolean } {
    if (!altJustPressed) return { firedBurst: 0, firedKnifeStab: false };
    const spec = this.getActiveSpec();
    const inv = this.getActiveSlot();

    if (this.equipTimer > 0 || this.reloadTimer > 0 || this.fireCooldown > 0) {
      return { firedBurst: 0, firedKnifeStab: false };
    }

    if (spec.id === 'CLASSIC') {
      if (inv.mag <= 0) {
        this.startReload();
        return { firedBurst: 0, firedKnifeStab: false };
      }
      const pellets = Math.min(3, inv.mag);
      inv.mag -= pellets;
      this.fireCooldown = 0.44;
      return { firedBurst: pellets, firedKnifeStab: false };
    }

    if (spec.id === 'KNIFE') {
      this.fireCooldown = 60 / (spec.altFireRateRPM ?? 60);
      return { firedBurst: 0, firedKnifeStab: true };
    }

    return { firedBurst: 0, firedKnifeStab: false };
  }
}
