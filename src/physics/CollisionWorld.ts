import { PHYSICS } from '../config/Constants';
import { ASCENT_MID_BRUSHES, BUY_BARRIER_PLANES, MapBrush, MapMaterialKey } from '../map/AscentMidData';

export interface ColliderBox {
  id: string;
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
  rotY: number;
  cosY: number;
  sinY: number;
  minY: number;
  maxY: number;
  mat: MapMaterialKey | 'MAT_BARRIER_SPAWN';
  isBarrier: boolean;
}

export interface WorldRayHit {
  hit: boolean;
  distance: number;
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  mat: MapMaterialKey | 'MAT_BARRIER_SPAWN' | null;
}

export interface MoveResult {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  isGrounded: boolean;
  groundMat: MapMaterialKey;
}

export class CollisionWorld {
  public colliders: ColliderBox[] = [];
  public barriersActive = true;

  constructor(brushes: MapBrush[] = ASCENT_MID_BRUSHES) {
    for (let i = 0; i < brushes.length; i++) {
      const b = brushes[i];
      if (!b.collidable) continue;
      this.addBox(b.id, b.pos, b.size, b.rotY, b.mat, false);
    }

    // Buy phase invisible/translucent barrier colliders
    this.addBox(
      'barrier_attacker',
      [0, 3.0, BUY_BARRIER_PLANES.ATTACKER_Z],
      [22.0, 6.0, 0.4],
      0,
      'MAT_BARRIER_SPAWN',
      true
    );
    this.addBox(
      'barrier_defender',
      [0, 3.0, BUY_BARRIER_PLANES.DEFENDER_Z],
      [16.0, 6.0, 0.4],
      0,
      'MAT_BARRIER_SPAWN',
      true
    );
  }

  private addBox(
    id: string,
    pos: [number, number, number],
    size: [number, number, number],
    rotY: number,
    mat: MapMaterialKey | 'MAT_BARRIER_SPAWN',
    isBarrier: boolean
  ): void {
    const hy = size[1] * 0.5;
    this.colliders.push({
      id,
      cx: pos[0],
      cy: pos[1],
      cz: pos[2],
      hx: size[0] * 0.5,
      hy,
      hz: size[2] * 0.5,
      rotY,
      cosY: Math.cos(rotY),
      sinY: Math.sin(rotY),
      minY: pos[1] - hy,
      maxY: pos[1] + hy,
      mat,
      isBarrier,
    });
  }

  public setBarriersActive(active: boolean): void {
    this.barriersActive = active;
  }

  private resolveHorizontalPass(
    px: number,
    py: number,
    pz: number,
    height: number,
    radius: number,
    allowStepUp: boolean
  ): { x: number; y: number; z: number; collided: boolean } {
    let x = px;
    let y = py;
    let z = pz;
    let collided = false;
    const playerTop = y + height;

    for (let i = 0; i < this.colliders.length; i++) {
      const b = this.colliders[i];
      if (b.isBarrier && !this.barriersActive) continue;
      if (playerTop <= b.minY + 0.001 || y >= b.maxY - 0.001) continue;

      let pushX = 0;
      let pushZ = 0;
      let overlapping = false;

      if (b.rotY === 0) {
        const dx = x - b.cx;
        const dz = z - b.cz;
        const clampedX = dx < -b.hx ? -b.hx : dx > b.hx ? b.hx : dx;
        const clampedZ = dz < -b.hz ? -b.hz : dz > b.hz ? b.hz : dz;
        const distX = dx - clampedX;
        const distZ = dz - clampedZ;
        const distSq = distX * distX + distZ * distZ;

        if (distSq < radius * radius) {
          overlapping = true;
          if (distSq > 1e-8) {
            const dist = Math.sqrt(distSq);
            const pen = radius - dist;
            pushX = (distX / dist) * pen;
            pushZ = (distZ / dist) * pen;
          } else {
            // Center inside AABB
            const penX = b.hx - Math.abs(dx) + radius;
            const penZ = b.hz - Math.abs(dz) + radius;
            if (penX < penZ) {
              pushX = dx >= 0 ? penX : -penX;
            } else {
              pushZ = dz >= 0 ? penZ : -penZ;
            }
          }
        }
      } else {
        // Transform player XZ into box local frame (rotate by -rotY)
        const wx = x - b.cx;
        const wz = z - b.cz;
        const lx = wx * b.cosY - wz * b.sinY;
        const lz = wx * b.sinY + wz * b.cosY;

        const clampedX = lx < -b.hx ? -b.hx : lx > b.hx ? b.hx : lx;
        const clampedZ = lz < -b.hz ? -b.hz : lz > b.hz ? b.hz : lz;
        const distX = lx - clampedX;
        const distZ = lz - clampedZ;
        const distSq = distX * distX + distZ * distZ;

        if (distSq < radius * radius) {
          overlapping = true;
          let lPushX = 0;
          let lPushZ = 0;
          if (distSq > 1e-8) {
            const dist = Math.sqrt(distSq);
            const pen = radius - dist;
            lPushX = (distX / dist) * pen;
            lPushZ = (distZ / dist) * pen;
          } else {
            const penX = b.hx - Math.abs(lx) + radius;
            const penZ = b.hz - Math.abs(lz) + radius;
            if (penX < penZ) lPushX = lx >= 0 ? penX : -penX;
            else lPushZ = lz >= 0 ? penZ : -penZ;
          }
          // Rotate local push back by +rotY
          pushX = lPushX * b.cosY + lPushZ * b.sinY;
          pushZ = -lPushX * b.sinY + lPushZ * b.cosY;
        }
      }

      if (overlapping) {
        const stepDelta = b.maxY - y;
        if (allowStepUp && stepDelta > 0 && stepDelta <= PHYSICS.STEP_HEIGHT) {
          // Test if stepping up to b.maxY is free of overhead intersection
          if (this.canStandAt(x, b.maxY + 0.001, z, height, radius, i)) {
            y = b.maxY;
            continue;
          }
        }
        x += pushX;
        z += pushZ;
        collided = true;
      }
    }

    return { x, y, z, collided };
  }

  private canStandAt(
    x: number,
    y: number,
    z: number,
    height: number,
    radius: number,
    ignoreIndex: number
  ): boolean {
    const top = y + height;
    for (let i = 0; i < this.colliders.length; i++) {
      if (i === ignoreIndex) continue;
      const b = this.colliders[i];
      if (b.isBarrier && !this.barriersActive) continue;
      if (top <= b.minY + 0.001 || y >= b.maxY - 0.001) continue;

      const wx = x - b.cx;
      const wz = z - b.cz;
      const lx = b.rotY === 0 ? wx : wx * b.cosY - wz * b.sinY;
      const lz = b.rotY === 0 ? wz : wx * b.sinY + wz * b.cosY;
      const clampedX = lx < -b.hx ? -b.hx : lx > b.hx ? b.hx : lx;
      const clampedZ = lz < -b.hz ? -b.hz : lz > b.hz ? b.hz : lz;
      const dx = lx - clampedX;
      const dz = lz - clampedZ;
      if (dx * dx + dz * dz < (radius - 0.02) * (radius - 0.02)) {
        return false;
      }
    }
    return true;
  }

  public moveAndCollide(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    height: number,
    wasGrounded: boolean,
    dt: number,
    out: MoveResult
  ): MoveResult {
    const radius = PHYSICS.PLAYER_RADIUS;

    // 1. Horizontal move + step-up
    let nx = x + vx * dt;
    let ny = y;
    let nz = z + vz * dt;

    // Two iterations for clean corner sliding
    for (let iter = 0; iter < 2; iter++) {
      const res = this.resolveHorizontalPass(nx, ny, nz, height, radius, wasGrounded);
      nx = res.x;
      ny = res.y;
      nz = res.z;
    }

    // Zero velocity along blocked horizontal movement
    if (dt > 0) {
      const actualVx = (nx - x) / dt;
      const actualVz = (nz - z) / dt;
      if (Math.abs(actualVx - vx) > 0.05 && Math.abs(vx) > 0.01) {
        vx = actualVx;
      }
      if (Math.abs(actualVz - vz) > 0.05 && Math.abs(vz) > 0.01) {
        vz = actualVz;
      }
    }

    // 2. Vertical move & ground/ceiling resolution
    let nextY = ny + vy * dt;
    let isGrounded = false;
    let groundMat: MapMaterialKey = 'MAT_FLOOR_COURTYARD';

    for (let i = 0; i < this.colliders.length; i++) {
      const b = this.colliders[i];
      if (b.isBarrier && !this.barriersActive) continue;

      const wx = nx - b.cx;
      const wz = nz - b.cz;
      const lx = b.rotY === 0 ? wx : wx * b.cosY - wz * b.sinY;
      const lz = b.rotY === 0 ? wz : wx * b.sinY + wz * b.cosY;
      const clampedX = lx < -b.hx ? -b.hx : lx > b.hx ? b.hx : lx;
      const clampedZ = lz < -b.hz ? -b.hz : lz > b.hz ? b.hz : lz;
      const dx = lx - clampedX;
      const dz = lz - clampedZ;
      if (dx * dx + dz * dz >= (radius - 0.01) * (radius - 0.01)) continue;

      // Landing on top of box
      if (vy <= 0 && ny >= b.maxY - 0.12 && nextY <= b.maxY) {
        nextY = b.maxY;
        vy = 0;
        isGrounded = true;
        if (b.mat !== 'MAT_BARRIER_SPAWN') {
          groundMat = b.mat;
        }
      }
      // Ceiling bump
      else if (vy > 0 && ny + height <= b.minY + 0.12 && nextY + height >= b.minY) {
        nextY = b.minY - height;
        vy = 0;
      }
    }

    // Floor fallback safety
    if (nextY < -5.0) {
      nextY = 0.0;
      vy = 0;
      isGrounded = true;
    }

    out.x = nx;
    out.y = nextY;
    out.z = nz;
    out.vx = vx;
    out.vy = vy;
    out.vz = vz;
    out.isGrounded = isGrounded;
    out.groundMat = groundMat;
    return out;
  }

  public raycastWorld(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDist: number,
    ignoreBarriers = false,
    out?: WorldRayHit
  ): WorldRayHit {
    const res: WorldRayHit = out ?? {
      hit: false,
      distance: maxDist,
      x: ox + dx * maxDist,
      y: oy + dy * maxDist,
      z: oz + dz * maxDist,
      nx: 0,
      ny: 1,
      nz: 0,
      mat: null,
    };

    res.hit = false;
    res.distance = maxDist;
    res.mat = null;

    let bestT = maxDist;
    let bestNx = 0;
    let bestNy = 1;
    let bestNz = 0;
    let bestMat: MapMaterialKey | 'MAT_BARRIER_SPAWN' | null = null;

    for (let i = 0; i < this.colliders.length; i++) {
      const b = this.colliders[i];
      if (b.isBarrier && (ignoreBarriers || !this.barriersActive)) continue;

      const wx = ox - b.cx;
      const wy = oy - b.cy;
      const wz = oz - b.cz;

      let lox = wx;
      let loz = wz;
      let ldx = dx;
      let ldz = dz;

      if (b.rotY !== 0) {
        lox = wx * b.cosY - wz * b.sinY;
        loz = wx * b.sinY + wz * b.cosY;
        ldx = dx * b.cosY - dz * b.sinY;
        ldz = dx * b.sinY + dz * b.cosY;
      }

      let tMin = 0.0;
      let tMax = bestT;
      let hitAxis = -1;
      let hitSign = 0;

      // X slab
      if (Math.abs(ldx) < 1e-8) {
        if (lox < -b.hx || lox > b.hx) continue;
      } else {
        const inv = 1.0 / ldx;
        let t1 = (-b.hx - lox) * inv;
        let t2 = (b.hx - lox) * inv;
        let s = -1;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
          s = 1;
        }
        if (t1 > tMin) {
          tMin = t1;
          hitAxis = 0;
          hitSign = s;
        }
        if (t2 < tMax) tMax = t2;
        if (tMin > tMax) continue;
      }

      // Y slab
      if (Math.abs(dy) < 1e-8) {
        if (wy < -b.hy || wy > b.hy) continue;
      } else {
        const inv = 1.0 / dy;
        let t1 = (-b.hy - wy) * inv;
        let t2 = (b.hy - wy) * inv;
        let s = -1;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
          s = 1;
        }
        if (t1 > tMin) {
          tMin = t1;
          hitAxis = 1;
          hitSign = s;
        }
        if (t2 < tMax) tMax = t2;
        if (tMin > tMax) continue;
      }

      // Z slab
      if (Math.abs(ldz) < 1e-8) {
        if (loz < -b.hz || loz > b.hz) continue;
      } else {
        const inv = 1.0 / ldz;
        let t1 = (-b.hz - loz) * inv;
        let t2 = (b.hz - loz) * inv;
        let s = -1;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
          s = 1;
        }
        if (t1 > tMin) {
          tMin = t1;
          hitAxis = 2;
          hitSign = s;
        }
        if (t2 < tMax) tMax = t2;
        if (tMin > tMax) continue;
      }

      if (tMin >= 0 && tMin < bestT && hitAxis !== -1) {
        bestT = tMin;
        bestMat = b.mat;
        let lnx = hitAxis === 0 ? hitSign : 0;
        let lny = hitAxis === 1 ? hitSign : 0;
        let lnz = hitAxis === 2 ? hitSign : 0;
        if (b.rotY !== 0) {
          bestNx = lnx * b.cosY + lnz * b.sinY;
          bestNy = lny;
          bestNz = -lnx * b.sinY + lnz * b.cosY;
        } else {
          bestNx = lnx;
          bestNy = lny;
          bestNz = lnz;
        }
      }
    }

    if (bestMat !== null) {
      res.hit = true;
      res.distance = bestT;
      res.x = ox + dx * bestT;
      res.y = oy + dy * bestT;
      res.z = oz + dz * bestT;
      res.nx = bestNx;
      res.ny = bestNy;
      res.nz = bestNz;
      res.mat = bestMat;
    } else {
      res.x = ox + dx * maxDist;
      res.y = oy + dy * maxDist;
      res.z = oz + dz * maxDist;
    }

    return res;
  }
}
