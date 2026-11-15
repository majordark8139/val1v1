import * as THREE from 'three';
import {
  DEFAULT_SETTINGS,
  MATCH_CONFIG,
  PlayerSettings,
  SETTINGS_STORAGE_KEY,
  TICK_DT,
} from '../config/Constants';
import {
  applyShieldDamage,
  computeWeaponDamage,
  HitTier,
  WEAPON_DATA,
  WeaponId,
  WeaponSlot,
} from '../config/WeaponData';
import { SoundSynthesizer } from '../audio/SoundSynthesizer';
import { PlayerController } from '../entities/PlayerController';
import { RemotePlayer } from '../entities/RemotePlayer';
import { ASCENT_SPAWNS } from '../map/AscentMidData';
import { buildAscentMidMap, BuiltAscentMap } from '../map/AscentMidBuilder';
import { LagCompensator } from '../network/LagCompensator';
import { ConnectionStatus, NetworkManager } from '../network/NetworkManager';
import {
  BTN_ALT_FIRE,
  BTN_CROUCH,
  BTN_FIRE,
  BTN_JUMP,
  BTN_RELOAD,
  BTN_WALK,
  CmdInputPacket,
  EvtFirePacket,
  EvtHitConfirmPacket,
  EvtRoundStatePacket,
  NetPacket,
  RoundPhase,
} from '../network/Protocol';
import { CollisionWorld, WorldRayHit } from '../physics/CollisionWorld';
import { applyTaggingSlow, getEyeHeight, KinematicInput, stepKinematics } from '../physics/Kinematics';
import { ViewModelRig } from '../weapons/ViewModelRig';
import { GameLoop } from './GameLoop';
import { InputManager } from './InputManager';
import { createProceduralMaterials, ProceduralMaterialSet } from './ProceduralTextures';
import { createTacticalRenderer, TacticalRendererContext } from './Renderer';

export type AppScreenState = 'title' | 'playing' | 'paused' | 'gameover';

export interface KillFeedItem {
  id: number;
  attacker: string;
  victim: string;
  weapon: WeaponId;
  headshot: boolean;
  timestamp: number;
}

export interface HudState {
  appState: AppScreenState;
  mode: 'BOT' | 'P2P';
  phase: RoundPhase;
  roundNum: number;
  timer: number;
  score: [number, number];
  localIsAttacker: boolean;
  hp: number;
  shield: number;
  credits: number;
  weaponId: WeaponId;
  mag: number;
  reserve: number;
  slots: {
    1: WeaponId | null;
    2: WeaponId | null;
    3: WeaponId | null;
  };
  activeSlot: WeaponSlot;
  isReloading: boolean;
  isScoped: boolean;
  scopeLevel: 0 | 1 | 2;
  isInDeadzone: boolean;
  buyMenuOpen: boolean;
  fps: number;
  frameMs: number;
  pingMs: number;
  matchFormat: 'BO5' | 'MR12';
  aimDuelFree: boolean;
  winnerText: string;
  matchStats: {
    kills: number;
    deaths: number;
    headshots: number;
    totalDamage: number;
  };
  killFeed: KillFeedItem[];
  roundBanner: string;
  netStatus: ConnectionStatus;
  roomCode: string;
  netError: string;
  pointerLocked: boolean;
}

interface PooledTracer {
  mesh: THREE.Mesh;
  active: boolean;
  ttl: number;
}

interface PooledSpark {
  mesh: THREE.Mesh;
  active: boolean;
  ttl: number;
  vx: number;
  vy: number;
  vz: number;
}

const TRACER_POOL_SIZE = 20;
const SPARK_POOL_SIZE = 36;

export class MatchEngine {
  private readonly rendererCtx: TacticalRendererContext;
  private readonly materials: ProceduralMaterialSet;
  private readonly map: BuiltAscentMap;
  private readonly world: CollisionWorld;
  private readonly audio = new SoundSynthesizer();
  private readonly input: InputManager;
  private readonly loop: GameLoop;
  private readonly viewmodel = new ViewModelRig();
  private readonly lagComp = new LagCompensator();
  public readonly network: NetworkManager;

  public readonly localPlayer = new PlayerController();
  public readonly remotePlayer = new RemotePlayer();

  // Zero-GC FX pools
  private readonly tracerPool: PooledTracer[] = [];
  private readonly sparkPool: PooledSpark[] = [];
  private readonly _rayOrigin = new THREE.Vector3();
  private readonly _rayDir = new THREE.Vector3();
  private readonly _tracerStart = new THREE.Vector3();
  private readonly _tracerEnd = new THREE.Vector3();
  private readonly _tracerMid = new THREE.Vector3();
  private readonly _upAxis = new THREE.Vector3(0, 1, 0);
  private readonly _worldRayHit: WorldRayHit = {
    hit: false,
    distance: 0,
    x: 0,
    y: 0,
    z: 0,
    nx: 0,
    ny: 1,
    nz: 0,
    mat: null,
  };

  // Match & Round State
  public appState: AppScreenState = 'title';
  public mode: 'BOT' | 'P2P' = 'BOT';
  public phase: RoundPhase = 'BUY';
  public roundNum = 1;
  public phaseTimer: number = MATCH_CONFIG.BUY_PHASE_TIME;
  public score: [number, number] = [0, 0];
  public p1IsAttacker = true;
  public matchFormat: 'BO5' | 'MR12' = 'BO5';
  public aimDuelFree = false;
  public buyMenuOpen = false;
  public roundBanner = '';
  private roundBannerTimer = 0;
  private killFeedSeq = 0;
  private killFeed: KillFeedItem[] = [];
  private hostRemoteLastInput: CmdInputPacket | null = null;
  private hostRemoteAckSeq = 0;
  private titleTourAngle = 0;
  private hudEmitAccum = 0;

  public settings: PlayerSettings = this.loadSettings();

  private onHudUpdate: (hud: HudState) => void;
  private onCrosshairEvent: (evt: {
    spreadDeg: number;
    isInDeadzone: boolean;
    scopeLevel: 0 | 1 | 2;
    isOperator: boolean;
    hitmarker?: HitTier | null;
    damageAngle?: number | null;
  }) => void;

  constructor(
    canvas: HTMLCanvasElement,
    callbacks: {
      onHudUpdate: (hud: HudState) => void;
      onCrosshairEvent: (evt: {
        spreadDeg: number;
        isInDeadzone: boolean;
        scopeLevel: 0 | 1 | 2;
        isOperator: boolean;
        hitmarker?: HitTier | null;
        damageAngle?: number | null;
      }) => void;
    }
  ) {
    this.onHudUpdate = callbacks.onHudUpdate;
    this.onCrosshairEvent = callbacks.onCrosshairEvent;

    this.rendererCtx = createTacticalRenderer(canvas);
    this.materials = createProceduralMaterials();
    this.map = buildAscentMidMap(this.materials);
    this.rendererCtx.scene.add(this.map.group);

    this.world = new CollisionWorld();

    // Attach first-person viewmodel to camera
    this.rendererCtx.camera.add(this.viewmodel.root);
    this.viewmodel.root.visible = false;

    // Attach remote player HitboxRig to scene
    if (this.remotePlayer.rig.group) {
      this.remotePlayer.rig.group.visible = false;
      this.rendererCtx.scene.add(this.remotePlayer.rig.group);
    }

    this.initPools();

    this.input = new InputManager(canvas, {
      onToggleBuyMenu: () => this.toggleBuyMenu(),
      onTogglePause: () => this.togglePause(),
      onToggleMute: () => this.toggleMute(),
    });
    this.applySettings(this.settings);

    this.network = new NetworkManager({
      onStatusChange: () => this.emitHud(),
      onPacket: (pkt) => this.handleNetPacket(pkt),
      onPeerConnected: () => this.onP2PConnected(),
      onPeerDisconnected: () => this.onP2PDisconnected(),
    });

    this.loop = new GameLoop({
      isSoftwareGl: this.rendererCtx.isSoftwareGl,
      getGlContext: () => this.rendererCtx.renderer.getContext(),
      fixedUpdate: (dt, tick) => this.fixedUpdate(dt, tick),
      renderUpdate: (alpha, frameTime) => this.renderUpdate(alpha, frameTime),
    });

    document.body.dataset.state = 'title';
    this.loop.start();
    this.emitHud();
  }

  private initPools(): void {
    const tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1.0, 4);
    const tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.9,
    });
    for (let i = 0; i < TRACER_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(tracerGeo, tracerMat);
      mesh.visible = false;
      this.rendererCtx.scene.add(mesh);
      this.tracerPool.push({ mesh, active: false, ttl: 0 });
    }

    const sparkGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xff9f1c });
    for (let i = 0; i < SPARK_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(sparkGeo, sparkMat);
      mesh.visible = false;
      this.rendererCtx.scene.add(mesh);
      this.sparkPool.push({ mesh, active: false, ttl: 0, vx: 0, vy: 0, vz: 0 });
    }
  }

  private loadSettings(): PlayerSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          crosshair: { ...DEFAULT_SETTINGS.crosshair, ...(parsed.crosshair ?? {}) },
        };
      }
    } catch {
      // Ignore storage error
    }
    return { ...DEFAULT_SETTINGS, crosshair: { ...DEFAULT_SETTINGS.crosshair } };
  }

  public applySettings(next: PlayerSettings): void {
    this.settings = next;
    this.input.sensitivity = next.sensitivity;
    this.localPlayer.weapons.autoRescope = next.autoRescope;
    this.audio.setMuted(next.muted);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore
    }
  }

  public setMatchFormat(fmt: 'BO5' | 'MR12'): void {
    this.matchFormat = fmt;
    this.emitHud();
  }

  public setAimDuelFree(free: boolean): void {
    this.aimDuelFree = free;
    this.emitHud();
  }

  public toggleMute(): void {
    this.applySettings({ ...this.settings, muted: !this.settings.muted });
    this.emitHud();
  }

  public startPracticeVsBot(): void {
    this.network.disconnect();
    this.mode = 'BOT';
    this.localPlayer.playerId = 1;
    this.remotePlayer.playerId = 2;
    this.remotePlayer.isBot = true;
    this.resetMatchState();
    this.enterPlayingState();
  }

  private onP2PConnected(): void {
    this.mode = 'P2P';
    this.remotePlayer.isBot = false;
    if (this.network.role === 'HOST') {
      this.localPlayer.playerId = 1;
      this.remotePlayer.playerId = 2;
      this.resetMatchState();
      this.broadcastRoundState();
    } else {
      this.localPlayer.playerId = 2;
      this.remotePlayer.playerId = 1;
    }
    this.enterPlayingState();
  }

  private onP2PDisconnected(): void {
    if (this.appState === 'playing' || this.appState === 'paused') {
      this.roundBanner = 'OPPONENT DISCONNECTED';
      this.roundBannerTimer = 4.0;
      this.emitHud();
    }
  }

  private enterPlayingState(): void {
    this.appState = 'playing';
    document.body.dataset.state = 'playing';
    this.viewmodel.root.visible = true;
    if (this.remotePlayer.rig.group) {
      this.remotePlayer.rig.group.visible = true;
    }
    this.input.clearHeld();
    this.input.inputBlocked = false;
    this.audio.unlock();
    this.input.requestPointerLock();
    this.emitHud();
  }

  public returnToLobby(): void {
    this.network.disconnect();
    this.appState = 'title';
    document.body.dataset.state = 'title';
    this.buyMenuOpen = false;
    this.viewmodel.root.visible = false;
    if (this.remotePlayer.rig.group) {
      this.remotePlayer.rig.group.visible = false;
    }
    this.input.exitPointerLock();
    this.input.clearHeld();
    this.emitHud();
  }

  public togglePause(): void {
    if (this.appState === 'playing') {
      if (this.buyMenuOpen) {
        this.buyMenuOpen = false;
        this.input.inputBlocked = false;
        this.input.requestPointerLock();
        this.emitHud();
        return;
      }
      this.appState = 'paused';
      document.body.dataset.state = 'paused';
      this.input.exitPointerLock();
      this.input.clearHeld();
      this.emitHud();
    } else if (this.appState === 'paused') {
      this.appState = 'playing';
      document.body.dataset.state = 'playing';
      this.input.inputBlocked = false;
      this.input.requestPointerLock();
      this.emitHud();
    }
  }

  public toggleBuyMenu(): void {
    if (this.appState !== 'playing' || this.phase !== 'BUY') return;
    this.buyMenuOpen = !this.buyMenuOpen;
    this.input.inputBlocked = this.buyMenuOpen;
    if (this.buyMenuOpen) {
      this.input.exitPointerLock();
      this.input.clearHeld();
    } else {
      this.input.requestPointerLock();
    }
    this.emitHud();
  }

  private resetMatchState(): void {
    this.roundNum = 1;
    this.score = [0, 0];
    this.p1IsAttacker = true;
    this.killFeed = [];
    this.localPlayer.kills = 0;
    this.localPlayer.deaths = 0;
    this.localPlayer.headshots = 0;
    this.localPlayer.totalDamage = 0;
    this.localPlayer.lossStreak = 0;
    this.localPlayer.credits = this.aimDuelFree ? 9000 : MATCH_CONFIG.START_CREDITS;
    this.localPlayer.shield = 0;

    this.remotePlayer.kills = 0;
    this.remotePlayer.deaths = 0;
    this.remotePlayer.lossStreak = 0;
    this.remotePlayer.credits = this.aimDuelFree ? 9000 : MATCH_CONFIG.START_CREDITS;
    this.remotePlayer.shield = 0;

    this.startRound(false);
  }

  private startRound(preserveLocalSurvived: boolean): void {
    // Halftime side swap: every 2 rounds in BO5, or after 12 rounds in MR12
    const swapRound =
      this.matchFormat === 'BO5'
        ? this.roundNum > 1 && (this.roundNum - 1) % 2 === 0
        : this.roundNum === 13;

    let resetEquipForHalftime = false;
    if (swapRound) {
      this.p1IsAttacker = !this.p1IsAttacker;
      this.localPlayer.credits = this.aimDuelFree ? 9000 : MATCH_CONFIG.START_CREDITS;
      this.remotePlayer.credits = this.aimDuelFree ? 9000 : MATCH_CONFIG.START_CREDITS;
      this.localPlayer.shield = 0;
      this.remotePlayer.shield = 0;
      resetEquipForHalftime = true;
      this.roundBanner = 'SIDE SWAP';
      this.roundBannerTimer = 2.5;
    }

    this.phase = 'BUY';
    this.phaseTimer = MATCH_CONFIG.BUY_PHASE_TIME;
    this.world.setBarriersActive(true);
    this.lagComp.clear();

    const localIsAtk = this.localPlayer.playerId === 1 ? this.p1IsAttacker : !this.p1IsAttacker;
    this.map.setBarriersVisible(true, localIsAtk);

    const localSpawn = localIsAtk ? ASCENT_SPAWNS.ATTACKER : ASCENT_SPAWNS.DEFENDER;
    const remoteSpawn = localIsAtk ? ASCENT_SPAWNS.DEFENDER : ASCENT_SPAWNS.ATTACKER;

    this.localPlayer.resetForRound(
      localSpawn.pos[0],
      localSpawn.pos[1],
      localSpawn.pos[2],
      localSpawn.yaw,
      preserveLocalSurvived && !resetEquipForHalftime
    );
    this.input.setAngles(localSpawn.yaw, 0);

    if (this.aimDuelFree) {
      this.localPlayer.credits = 9000;
      if (!this.localPlayer.weapons.slots[1]) {
        this.localPlayer.weapons.grantWeapon('VANDAL');
        this.localPlayer.shield = MATCH_CONFIG.HEAVY_SHIELD_AMOUNT;
      }
    }

    this.remotePlayer.resetForRound(
      remoteSpawn.pos[0],
      remoteSpawn.pos[1],
      remoteSpawn.pos[2],
      remoteSpawn.yaw,
      !localIsAtk,
      this.roundNum,
      this.aimDuelFree
    );

    this.audio.playRoundHorn(false);
    this.emitHud();
  }

  public buyItem(item: WeaponId | 'LIGHT_SHIELD' | 'HEAVY_SHIELD'): void {
    if (this.phase !== 'BUY') return;

    if (this.mode === 'P2P' && this.network.role === 'CLIENT') {
      this.network.send({ t: 'B', playerId: 2, item });
    }

    this.applyPurchaseForLocal(item);
    this.emitHud();
  }

  private applyPurchaseForLocal(item: WeaponId | 'LIGHT_SHIELD' | 'HEAVY_SHIELD'): void {
    if (item === 'LIGHT_SHIELD') {
      const cost = this.aimDuelFree ? 0 : MATCH_CONFIG.LIGHT_SHIELD_COST;
      if (this.localPlayer.credits < cost || this.localPlayer.shield >= MATCH_CONFIG.LIGHT_SHIELD_AMOUNT) return;
      this.localPlayer.credits -= cost;
      this.localPlayer.shield = MATCH_CONFIG.LIGHT_SHIELD_AMOUNT;
      this.audio.playEquipClick();
      return;
    }
    if (item === 'HEAVY_SHIELD') {
      const cost = this.aimDuelFree ? 0 : MATCH_CONFIG.HEAVY_SHIELD_COST;
      if (this.localPlayer.credits < cost || this.localPlayer.shield >= MATCH_CONFIG.HEAVY_SHIELD_AMOUNT) return;
      this.localPlayer.credits -= cost;
      this.localPlayer.shield = MATCH_CONFIG.HEAVY_SHIELD_AMOUNT;
      this.audio.playEquipClick();
      return;
    }

    const spec = WEAPON_DATA[item];
    const cost = this.aimDuelFree ? 0 : spec.cost;
    if (this.localPlayer.credits < cost) return;
    if (this.localPlayer.weapons.slots[spec.slot]?.id === item) return;
    this.localPlayer.credits -= cost;
    this.localPlayer.weapons.grantWeapon(item);
    this.audio.playEquipClick();
  }

  private fixedUpdate(dt: number, tick: number): void {
    if (this.appState !== 'playing') return;

    // Update timers
    if (this.roundBannerTimer > 0) {
      this.roundBannerTimer = Math.max(0, this.roundBannerTimer - dt);
      if (this.roundBannerTimer === 0) this.roundBanner = '';
    }

    // Expire kill feed entries after 5s
    const now = performance.now();
    if (this.killFeed.length > 0) {
      this.killFeed = this.killFeed.filter((k) => now - k.timestamp < 5000);
    }

    // Host or Offline drives round timer & phase transitions
    const isAuthority = this.mode === 'BOT' || this.network.role === 'HOST';
    if (isAuthority && this.phase !== 'MATCH_OVER') {
      this.phaseTimer -= dt;
      if (this.phase === 'BUY' && this.phaseTimer <= 0) {
        this.phase = 'COMBAT';
        this.phaseTimer = MATCH_CONFIG.COMBAT_PHASE_TIME;
        this.world.setBarriersActive(false);
        const localIsAtk = this.localPlayer.playerId === 1 ? this.p1IsAttacker : !this.p1IsAttacker;
        this.map.setBarriersVisible(false, localIsAtk);
        if (this.buyMenuOpen) {
          this.buyMenuOpen = false;
          this.input.inputBlocked = false;
          this.input.requestPointerLock();
        }
        this.audio.playRoundHorn(true);
        if (this.mode === 'P2P') this.broadcastRoundState();
        this.emitHud();
      } else if (this.phase === 'COMBAT' && this.phaseTimer <= 0) {
        // Time expired: Defender wins round
        const defenderId: 1 | 2 = this.p1IsAttacker ? 2 : 1;
        this.concludeRound(defenderId, false);
      } else if (this.phase === 'POST_ROUND' && this.phaseTimer <= 0) {
        const winTarget = this.matchFormat === 'BO5' ? 3 : 13;
        if (this.score[0] >= winTarget || this.score[1] >= winTarget) {
          this.phase = 'MATCH_OVER';
          this.appState = 'gameover';
          document.body.dataset.state = 'gameover';
          this.input.exitPointerLock();
          if (this.mode === 'P2P') this.broadcastRoundState();
          this.emitHud();
          return;
        }
        this.roundNum++;
        const localSurvived = this.localPlayer.alive;
        this.startRound(localSurvived);
        if (this.mode === 'P2P') this.broadcastRoundState();
      }
    }

    // Consume local input
    const rawInput = this.input.consumeTickInput();
    this.localPlayer.prevState = { ...this.localPlayer.state };

    if (this.localPlayer.alive) {
      if (rawInput.slotRequest !== 0) {
        if (this.localPlayer.weapons.switchSlot(rawInput.slotRequest)) {
          this.audio.playEquipClick();
          this.localPlayer.recoil.reset();
        }
      }
      if (rawInput.reloadJustPressed) {
        if (this.localPlayer.weapons.startReload()) {
          this.audio.playReloadClick();
        }
      }
      if (rawInput.altFireJustPressed && !this.buyMenuOpen) {
        const alt = this.localPlayer.weapons.toggleAltFire();
        if (alt.scopedChanged) {
          this.audio.playScopeClick();
        }
        if (alt.classicBurst && this.phase !== 'BUY') {
          const res = this.localPlayer.weapons.tryFireAlt(true);
          for (let p = 0; p < res.firedBurst; p++) {
            this.fireLocalShot(tick, true, p === 0);
          }
        } else if (alt.knifeStab && this.phase !== 'BUY') {
          const res = this.localPlayer.weapons.tryFireAlt(true);
          if (res.firedKnifeStab) {
            this.fireLocalShot(tick, true, true);
          }
        }
      }

      const wpnTimers = this.localPlayer.weapons.updateTimers(dt);
      if (wpnTimers.reloadFinished) {
        this.audio.playEquipClick();
      }

      const activeSpec = this.localPlayer.weapons.getActiveSpec();
      const kInput: KinematicInput = {
        forward: this.buyMenuOpen ? 0 : rawInput.forward,
        right: this.buyMenuOpen ? 0 : rawInput.right,
        yaw: rawInput.yaw,
        jump: this.buyMenuOpen ? false : rawInput.jumpPressed,
        crouch: this.buyMenuOpen ? false : rawInput.crouchHeld,
        walk: this.buyMenuOpen ? false : rawInput.walkHeld,
      };

      this.localPlayer.state.pitch = rawInput.pitch;
      stepKinematics(
        this.localPlayer.state,
        kInput,
        activeSpec,
        this.localPlayer.weapons.isScoped(),
        this.world,
        dt
      );

      if (this.localPlayer.shouldPlayFootstep()) {
        this.audio.playFootstep(undefined, this.localPlayer.state.groundMat, true);
      }

      // Primary fire
      if (!this.buyMenuOpen && (this.phase === 'COMBAT' || this.phase === 'POST_ROUND')) {
        if (this.localPlayer.weapons.tryFirePrimary(rawInput.fireHeld, rawInput.fireJustPressed)) {
          this.fireLocalShot(tick, false, true);
        }
      }

      // Update recoil controller
      this.localPlayer.recoil.update(
        dt,
        activeSpec,
        this.localPlayer.state.crouchAlpha > 0.5
      );

      // Client network sync
      if (this.mode === 'P2P' && this.network.role === 'CLIENT') {
        const pkt = this.localPlayer.buildCmdPacket(
          tick,
          kInput,
          rawInput.pitch,
          rawInput.fireHeld,
          rawInput.altFireJustPressed,
          rawInput.reloadJustPressed
        );
        this.localPlayer.recordPendingInput(
          pkt.seq,
          kInput,
          activeSpec.id,
          this.localPlayer.weapons.isScoped()
        );
        this.network.send(pkt);
      }
    }

    // Host/Bot simulation of remote player
    if (this.mode === 'BOT') {
      const botRes = this.remotePlayer.stepBotAI(
        {
          x: this.localPlayer.state.x,
          y: this.localPlayer.state.y,
          z: this.localPlayer.state.z,
          yaw: this.localPlayer.state.yaw,
          pitch: this.localPlayer.state.pitch,
          crouchAlpha: this.localPlayer.state.crouchAlpha,
        },
        this.world,
        this.phase === 'COMBAT',
        dt,
        (origin, dir, wpn) => this.handleBotShot(origin, dir, wpn)
      );
      if (botRes.stepFootstep) {
        this.audio.playFootstep(
          [this.remotePlayer.state.x, this.remotePlayer.state.y, this.remotePlayer.state.z],
          this.remotePlayer.state.groundMat,
          false
        );
      }
    } else if (this.network.role === 'HOST') {
      if (this.hostRemoteLastInput) {
        const cmd = this.hostRemoteLastInput;
        this.remotePlayer.weaponId = cmd.wpn;
        const rInput: KinematicInput = {
          forward: cmd.f,
          right: cmd.r,
          yaw: cmd.yaw,
          jump: (cmd.btn & BTN_JUMP) !== 0,
          crouch: (cmd.btn & BTN_CROUCH) !== 0,
          walk: (cmd.btn & BTN_WALK) !== 0,
        };
        this.remotePlayer.stepHostRemoteInput(rInput, cmd.pitch, this.world);
      }

      // Record lag compensation history
      this.lagComp.recordTick(
        tick,
        {
          x: this.localPlayer.state.x,
          y: this.localPlayer.state.y,
          z: this.localPlayer.state.z,
          yaw: this.localPlayer.state.yaw,
          pitch: this.localPlayer.state.pitch,
          crouchAlpha: this.localPlayer.state.crouchAlpha,
        },
        this.remotePlayer.getPose()
      );

      // Broadcast authoritative SNAP_STATE at 60Hz
      const p1Spec = this.localPlayer.weapons.getActiveSlot();
      this.network.send({
        t: 'S',
        tick,
        ackSeq: this.hostRemoteAckSeq,
        p1: [
          this.localPlayer.state.x,
          this.localPlayer.state.y,
          this.localPlayer.state.z,
          this.localPlayer.state.vx,
          this.localPlayer.state.vy,
          this.localPlayer.state.vz,
          this.localPlayer.state.yaw,
          this.localPlayer.state.pitch,
          this.localPlayer.state.crouchAlpha,
          this.localPlayer.hp,
          this.localPlayer.shield,
          p1Spec.id,
          p1Spec.mag,
          this.localPlayer.state.tagTimer,
        ],
        p2: this.remotePlayer.getSnapTuple(),
      });
    } else if (this.network.role === 'CLIENT') {
      const interp = this.remotePlayer.updateInterpolation(
        this.remotePlayer.latestServerTick,
        dt
      );
      if (interp.stepFootstep) {
        this.audio.playFootstep(
          [this.remotePlayer.state.x, this.remotePlayer.state.y, this.remotePlayer.state.z],
          this.remotePlayer.state.groundMat,
          false
        );
      }
    }

    // Update FX pools
    this.updatePools(dt);
  }

  private fireLocalShot(tick: number, isAltFire: boolean, playEffects: boolean): void {
    const spec = this.localPlayer.weapons.getActiveSpec();
    this.localPlayer.computeBulletRay(this._rayOrigin, this._rayDir, isAltFire);

    if (playEffects) {
      this.viewmodel.triggerFireKick(spec.id === 'KNIFE');
      this.playWeaponSound(spec.id, undefined);
    }

    if (spec.id !== 'KNIFE') {
      this.localPlayer.recoil.onShotFired(spec, this.localPlayer.state.crouchAlpha > 0.5);
    }

    // Local tracer / wall spark preview
    const maxDist = spec.id === 'KNIFE' ? (spec.meleeRange ?? 1.85) : 140;
    this.world.raycastWorld(
      this._rayOrigin.x,
      this._rayOrigin.y,
      this._rayOrigin.z,
      this._rayDir.x,
      this._rayDir.y,
      this._rayDir.z,
      maxDist,
      true,
      this._worldRayHit
    );
    const endDist = this._worldRayHit.hit ? this._worldRayHit.distance : maxDist;

    if (spec.id !== 'KNIFE') {
      this.spawnTracer(
        this._rayOrigin.x + this._rayDir.x * 0.6,
        this._rayOrigin.y - 0.06 + this._rayDir.y * 0.6,
        this._rayOrigin.z + this._rayDir.z * 0.6,
        this._rayOrigin.x + this._rayDir.x * endDist,
        this._rayOrigin.y + this._rayDir.y * endDist,
        this._rayOrigin.z + this._rayDir.z * endDist
      );
    }

    const evt: EvtFirePacket = {
      t: 'F',
      shooterId: this.localPlayer.playerId,
      tick,
      renderInterpTick:
        this.mode === 'P2P' && this.network.role === 'CLIENT'
          ? this.remotePlayer.lastRenderInterpTick
          : tick,
      wpn: spec.id,
      origin: [this._rayOrigin.x, this._rayOrigin.y, this._rayOrigin.z],
      dir: [this._rayDir.x, this._rayDir.y, this._rayDir.z],
      isAlt: isAltFire,
    };

    if (this.mode === 'BOT' || this.network.role === 'HOST') {
      // Authoritative hit registration against remotePlayer
      const victimVit = {
        hp: this.remotePlayer.hp,
        shield: this.remotePlayer.shield,
        alive: this.remotePlayer.alive,
      };
      // Ensure lagComp has current tick sample for offline Bot
      if (this.mode === 'BOT') {
        this.lagComp.recordTick(
          tick,
          {
            x: this.localPlayer.state.x,
            y: this.localPlayer.state.y,
            z: this.localPlayer.state.z,
            yaw: this.localPlayer.state.yaw,
            pitch: this.localPlayer.state.pitch,
            crouchAlpha: this.localPlayer.state.crouchAlpha,
          },
          this.remotePlayer.getPose()
        );
      }

      const hitConfirm = this.lagComp.evaluateShot(
        evt,
        tick,
        this.world,
        victimVit,
        this.remotePlayer.getPose()
      );

      if (hitConfirm) {
        this.remotePlayer.hp = hitConfirm.newHp;
        this.remotePlayer.shield = hitConfirm.newShield;
        applyTaggingSlow(this.remotePlayer.state);
        this.applyHitConfirmEffects(hitConfirm);
        if (this.mode === 'P2P') {
          this.network.send(hitConfirm);
        }
      } else if (this._worldRayHit.hit) {
        this.spawnImpactSparks(
          this._worldRayHit.x,
          this._worldRayHit.y,
          this._worldRayHit.z,
          this._worldRayHit.nx,
          this._worldRayHit.ny,
          this._worldRayHit.nz
        );
      }
    } else if (this.network.role === 'CLIENT') {
      this.network.send(evt);
    }
  }

  private handleBotShot(
    origin: [number, number, number],
    dir: [number, number, number],
    wpn: WeaponId
  ): void {
    this.playWeaponSound(wpn, origin);

    const maxDist = 140;
    this.world.raycastWorld(
      origin[0],
      origin[1],
      origin[2],
      dir[0],
      dir[1],
      dir[2],
      maxDist,
      true,
      this._worldRayHit
    );
    const wallDist = this._worldRayHit.hit ? this._worldRayHit.distance : maxDist;

    // Raycast against local player's standing/crouched OBB via LagCompensator's temp rig
    const localPose = {
      x: this.localPlayer.state.x,
      y: this.localPlayer.state.y,
      z: this.localPlayer.state.z,
      yaw: this.localPlayer.state.yaw,
      pitch: this.localPlayer.state.pitch,
      crouchAlpha: this.localPlayer.state.crouchAlpha,
    };

    const tempRig = this.remotePlayer.rig; // Or reuse lagComp evaluateShot
    void tempRig;
    const hitEvt: EvtFirePacket = {
      t: 'F',
      shooterId: 2,
      tick: this.loop.currentTick,
      renderInterpTick: this.loop.currentTick,
      wpn,
      origin,
      dir,
    };

    this.lagComp.recordTick(this.loop.currentTick, localPose, this.remotePlayer.getPose());
    const localVit = {
      hp: this.localPlayer.hp,
      shield: this.localPlayer.shield,
      alive: this.localPlayer.alive,
    };
    const confirm = this.lagComp.evaluateShot(
      hitEvt,
      this.loop.currentTick,
      this.world,
      localVit,
      localPose
    );

    const endDist = confirm ? Math.min(wallDist, 40) : wallDist;
    this.spawnTracer(
      origin[0],
      origin[1] - 0.1,
      origin[2],
      origin[0] + dir[0] * endDist,
      origin[1] + dir[1] * endDist,
      origin[2] + dir[2] * endDist
    );

    if (confirm) {
      this.applyHitConfirmEffects(confirm, origin);
    } else if (this._worldRayHit.hit) {
      this.spawnImpactSparks(
        this._worldRayHit.x,
        this._worldRayHit.y,
        this._worldRayHit.z,
        this._worldRayHit.nx,
        this._worldRayHit.ny,
        this._worldRayHit.nz
      );
    }
  }

  private handleNetPacket(pkt: NetPacket): void {
    if (pkt.t === 'I' && this.network.role === 'HOST') {
      this.hostRemoteLastInput = pkt;
      this.hostRemoteAckSeq = pkt.seq;
      return;
    }

    if (pkt.t === 'S' && this.network.role === 'CLIENT') {
      this.localPlayer.reconcileFromServer(pkt.p2, pkt.ackSeq, this.world);
      this.remotePlayer.pushSnapshot(pkt.tick, pkt.p1);
      return;
    }

    if (pkt.t === 'F') {
      // Remote shot sound + tracer
      this.playWeaponSound(pkt.wpn, pkt.origin);
      this.spawnTracer(
        pkt.origin[0],
        pkt.origin[1] - 0.08,
        pkt.origin[2],
        pkt.origin[0] + pkt.dir[0] * 40,
        pkt.origin[1] + pkt.dir[1] * 40,
        pkt.origin[2] + pkt.dir[2] * 40
      );

      if (this.network.role === 'HOST') {
        const victimVit = {
          hp: this.localPlayer.hp,
          shield: this.localPlayer.shield,
          alive: this.localPlayer.alive,
        };
        const confirm = this.lagComp.evaluateShot(
          pkt,
          this.loop.currentTick,
          this.world,
          victimVit,
          {
            x: this.localPlayer.state.x,
            y: this.localPlayer.state.y,
            z: this.localPlayer.state.z,
            yaw: this.localPlayer.state.yaw,
            pitch: this.localPlayer.state.pitch,
            crouchAlpha: this.localPlayer.state.crouchAlpha,
          }
        );
        if (confirm) {
          this.applyHitConfirmEffects(confirm, pkt.origin);
          this.network.send(confirm);
        }
      }
      return;
    }

    if (pkt.t === 'H') {
      this.applyHitConfirmEffects(pkt);
      return;
    }

    if (pkt.t === 'B' && this.network.role === 'HOST') {
      if (this.phase === 'BUY') {
        if (pkt.item === 'LIGHT_SHIELD') {
          const cost = this.aimDuelFree ? 0 : MATCH_CONFIG.LIGHT_SHIELD_COST;
          if (this.remotePlayer.credits >= cost) {
            this.remotePlayer.credits -= cost;
            this.remotePlayer.shield = MATCH_CONFIG.LIGHT_SHIELD_AMOUNT;
          }
        } else if (pkt.item === 'HEAVY_SHIELD') {
          const cost = this.aimDuelFree ? 0 : MATCH_CONFIG.HEAVY_SHIELD_COST;
          if (this.remotePlayer.credits >= cost) {
            this.remotePlayer.credits -= cost;
            this.remotePlayer.shield = MATCH_CONFIG.HEAVY_SHIELD_AMOUNT;
          }
        } else {
          const spec = WEAPON_DATA[pkt.item];
          const cost = this.aimDuelFree ? 0 : spec.cost;
          if (this.remotePlayer.credits >= cost) {
            this.remotePlayer.credits -= cost;
            this.remotePlayer.weaponId = pkt.item;
            this.remotePlayer.ammo = spec.magSize;
          }
        }
        this.broadcastRoundState();
      }
      return;
    }

    if (pkt.t === 'R' && this.network.role === 'CLIENT') {
      const prevPhase = this.phase;
      this.phase = pkt.phase;
      this.roundNum = pkt.roundNum;
      this.phaseTimer = pkt.timer;
      this.score = pkt.score;
      this.p1IsAttacker = pkt.p1IsAttacker;
      this.matchFormat = pkt.matchFormat;
      this.aimDuelFree = pkt.aimDuelFree;
      this.localPlayer.credits = pkt.p2Creds;

      const localIsAtk = !this.p1IsAttacker;
      this.world.setBarriersActive(this.phase === 'BUY');
      this.map.setBarriersVisible(this.phase === 'BUY', localIsAtk);

      if (this.phase === 'BUY' && prevPhase !== 'BUY') {
        this.startRound(this.localPlayer.alive);
      } else if (this.phase === 'COMBAT' && prevPhase === 'BUY') {
        if (this.buyMenuOpen) {
          this.buyMenuOpen = false;
          this.input.inputBlocked = false;
          this.input.requestPointerLock();
        }
        this.audio.playRoundHorn(true);
      } else if (this.phase === 'MATCH_OVER') {
        this.appState = 'gameover';
        document.body.dataset.state = 'gameover';
        this.input.exitPointerLock();
      }
      this.emitHud();
    }
  }

  private applyHitConfirmEffects(
    confirm: EvtHitConfirmPacket,
    attackerOrigin?: [number, number, number]
  ): void {
    const localHitTarget = confirm.attackerId === this.localPlayer.playerId;

    this.spawnImpactSparks(
      confirm.hitPos[0],
      confirm.hitPos[1],
      confirm.hitPos[2],
      0,
      1,
      0
    );

    if (localHitTarget) {
      this.remotePlayer.hp = confirm.newHp;
      this.remotePlayer.shield = confirm.newShield;
      this.remotePlayer.rig.triggerHitFlash(0.06);
      this.localPlayer.totalDamage += confirm.dmg;

      if (confirm.tier === 'HEAD') {
        this.audio.playHeadshotDink();
        this.localPlayer.headshots += 1;
      } else {
        this.audio.playBodyHitmarker();
      }

      this.onCrosshairEvent({
        spreadDeg: this.localPlayer.getCurrentSpreadDeg(),
        isInDeadzone: this.localPlayer.state.isInDeadzone,
        scopeLevel: this.localPlayer.weapons.scopeLevel,
        isOperator: this.localPlayer.weapons.getActiveSpec().id === 'OPERATOR',
        hitmarker: confirm.tier,
      });

      if (confirm.killed) {
        this.remotePlayer.triggerKO();
        this.localPlayer.kills += 1;
        this.localPlayer.credits = Math.min(
          MATCH_CONFIG.MAX_CREDITS,
          this.localPlayer.credits + MATCH_CONFIG.KILL_CREDITS
        );
        this.pushKillFeed(
          'YOU',
          this.mode === 'BOT' ? 'BOT' : 'OPPONENT',
          confirm.wpn,
          confirm.tier === 'HEAD'
        );
        if (this.mode === 'BOT' || this.network.role === 'HOST') {
          this.concludeRound(this.localPlayer.playerId, true);
        }
      }
    } else {
      // Local player was hit
      this.localPlayer.hp = confirm.newHp;
      this.localPlayer.shield = confirm.newShield;
      applyTaggingSlow(this.localPlayer.state);
      this.localPlayer.damageTrauma = 1.0;

      if (confirm.tier === 'HEAD') {
        this.audio.playHeadshotDink();
      } else {
        this.audio.playBodyHitmarker();
      }

      let dmgAngle = 0;
      if (attackerOrigin) {
        const dx = attackerOrigin[0] - this.localPlayer.state.x;
        const dz = attackerOrigin[2] - this.localPlayer.state.z;
        const worldAngle = Math.atan2(-dx, -dz);
        dmgAngle = worldAngle - this.localPlayer.state.yaw;
      }

      this.onCrosshairEvent({
        spreadDeg: this.localPlayer.getCurrentSpreadDeg(),
        isInDeadzone: this.localPlayer.state.isInDeadzone,
        scopeLevel: this.localPlayer.weapons.scopeLevel,
        isOperator: this.localPlayer.weapons.getActiveSpec().id === 'OPERATOR',
        damageAngle: dmgAngle,
      });

      if (confirm.killed) {
        this.localPlayer.alive = false;
        this.localPlayer.deaths += 1;
        this.pushKillFeed(
          this.mode === 'BOT' ? 'BOT' : 'OPPONENT',
          'YOU',
          confirm.wpn,
          confirm.tier === 'HEAD'
        );
        if (this.mode === 'BOT' || this.network.role === 'HOST') {
          this.concludeRound(this.remotePlayer.playerId, true);
        }
      }
    }

    this.emitHud();
  }

  private concludeRound(winnerId: 1 | 2, byElimination: boolean): void {
    if (this.phase !== 'COMBAT') return;
    this.phase = 'POST_ROUND';
    this.phaseTimer = MATCH_CONFIG.POST_ROUND_TIME;

    if (winnerId === 1) {
      this.score[0]++;
      this.localPlayer.lossStreak = 0;
      this.remotePlayer.lossStreak = Math.min(2, this.remotePlayer.lossStreak + 1);
      this.localPlayer.credits = Math.min(
        MATCH_CONFIG.MAX_CREDITS,
        this.localPlayer.credits + MATCH_CONFIG.WIN_CREDITS
      );
      this.remotePlayer.credits = Math.min(
        MATCH_CONFIG.MAX_CREDITS,
        this.remotePlayer.credits + MATCH_CONFIG.LOSS_STREAK_CREDITS[this.remotePlayer.lossStreak]
      );
    } else {
      this.score[1]++;
      this.remotePlayer.lossStreak = 0;
      this.localPlayer.lossStreak = Math.min(2, this.localPlayer.lossStreak + 1);
      this.remotePlayer.credits = Math.min(
        MATCH_CONFIG.MAX_CREDITS,
        this.remotePlayer.credits + MATCH_CONFIG.WIN_CREDITS
      );
      this.localPlayer.credits = Math.min(
        MATCH_CONFIG.MAX_CREDITS,
        this.localPlayer.credits + MATCH_CONFIG.LOSS_STREAK_CREDITS[this.localPlayer.lossStreak]
      );
    }

    const localWon = winnerId === this.localPlayer.playerId;
    this.roundBanner = localWon
      ? 'ROUND WON'
      : byElimination
      ? 'ROUND LOST'
      : 'TIME EXPIRED';
    this.roundBannerTimer = 3.5;

    if (this.mode === 'P2P' && this.network.role === 'HOST') {
      this.broadcastRoundState(winnerId);
    }
    this.emitHud();
  }

  private broadcastRoundState(winnerId: 1 | 2 | null = null): void {
    const pkt: EvtRoundStatePacket = {
      t: 'R',
      phase: this.phase,
      roundNum: this.roundNum,
      timer: this.phaseTimer,
      score: [...this.score] as [number, number],
      winnerId,
      p1Creds: this.localPlayer.credits,
      p2Creds: this.remotePlayer.credits,
      p1IsAttacker: this.p1IsAttacker,
      matchFormat: this.matchFormat,
      aimDuelFree: this.aimDuelFree,
    };
    this.network.send(pkt);
  }

  private pushKillFeed(attacker: string, victim: string, weapon: WeaponId, headshot: boolean): void {
    this.killFeed.unshift({
      id: ++this.killFeedSeq,
      attacker,
      victim,
      weapon,
      headshot,
      timestamp: performance.now(),
    });
    if (this.killFeed.length > 4) this.killFeed.length = 4;
  }

  private playWeaponSound(id: WeaponId, pos?: [number, number, number]): void {
    if (id === 'KNIFE') {
      this.audio.playKnifeSwing();
    } else if (id === 'OPERATOR') {
      this.audio.playOperatorShot(pos);
    } else if (id === 'VANDAL' || id === 'CLASSIC' || id === 'SHERIFF') {
      this.audio.playHeavyShot(pos, id === 'SHERIFF');
    } else if (id === 'PHANTOM' || id === 'GHOST' || id === 'SPECTRE') {
      this.audio.playSuppressedShot(pos, id === 'SPECTRE' ? 1.15 : 1.0);
    }
  }

  private spawnTracer(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number
  ): void {
    for (let i = 0; i < this.tracerPool.length; i++) {
      const t = this.tracerPool[i];
      if (!t.active) {
        this._tracerStart.set(x1, y1, z1);
        this._tracerEnd.set(x2, y2, z2);
        const dist = this._tracerStart.distanceTo(this._tracerEnd);
        if (dist < 0.2) return;
        this._tracerMid.addVectors(this._tracerStart, this._tracerEnd).multiplyScalar(0.5);
        t.mesh.position.copy(this._tracerMid);
        t.mesh.scale.set(1, dist, 1);
        this._rayDir.subVectors(this._tracerEnd, this._tracerStart).normalize();
        t.mesh.quaternion.setFromUnitVectors(this._upAxis, this._rayDir);
        t.mesh.visible = true;
        t.active = true;
        t.ttl = 0.065;
        return;
      }
    }
  }

  private spawnImpactSparks(
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number
  ): void {
    let spawned = 0;
    for (let i = 0; i < this.sparkPool.length && spawned < 6; i++) {
      const s = this.sparkPool[i];
      if (!s.active) {
        s.mesh.position.set(x, y, z);
        s.vx = (nx + (Math.random() - 0.5) * 1.6) * 4.5;
        s.vy = (ny + Math.random() * 1.2) * 4.5;
        s.vz = (nz + (Math.random() - 0.5) * 1.6) * 4.5;
        s.mesh.visible = true;
        s.active = true;
        s.ttl = 0.24;
        spawned++;
      }
    }
  }

  private updatePools(dt: number): void {
    for (let i = 0; i < this.tracerPool.length; i++) {
      const t = this.tracerPool[i];
      if (!t.active) continue;
      t.ttl -= dt;
      if (t.ttl <= 0) {
        t.active = false;
        t.mesh.visible = false;
      }
    }
    for (let i = 0; i < this.sparkPool.length; i++) {
      const s = this.sparkPool[i];
      if (!s.active) continue;
      s.ttl -= dt;
      if (s.ttl <= 0) {
        s.active = false;
        s.mesh.visible = false;
      } else {
        s.vy -= 14 * dt;
        s.mesh.position.x += s.vx * dt;
        s.mesh.position.y += s.vy * dt;
        s.mesh.position.z += s.vz * dt;
      }
    }
  }

  private renderUpdate(alpha: number, frameTime: number): void {
    if (this.appState === 'title') {
      // Smooth orbital camera tour overlooking Ascent Mid Courtyard
      this.titleTourAngle += frameTime * 0.14;
      const radius = 16.5;
      const camX = Math.sin(this.titleTourAngle) * radius * 0.55;
      const camZ = Math.cos(this.titleTourAngle) * radius;
      this.rendererCtx.camera.position.set(camX, 7.5, camZ);
      this.rendererCtx.camera.lookAt(0, 1.4, -2.0);
    } else {
      this.localPlayer.updateCamera(this.rendererCtx.camera, alpha, frameTime);

      const spec = this.localPlayer.weapons.getActiveSpec();
      const recOut = this.localPlayer.recoil.getOutput(this.localPlayer.state.crouchAlpha > 0.5);
      const horizSpeed = Math.sqrt(
        this.localPlayer.state.vx ** 2 + this.localPlayer.state.vz ** 2
      );

      this.viewmodel.update({
        dt: frameTime,
        weaponId: spec.id,
        isScoped: this.localPlayer.weapons.isScoped(),
        isADS:
          this.localPlayer.weapons.isScoped() &&
          (spec.id === 'SPECTRE' || spec.id === 'PHANTOM' || spec.id === 'VANDAL'),
        equipRatio:
          spec.equipTime > 0 ? this.localPlayer.weapons.equipTimer / spec.equipTime : 0,
        reloadRatio:
          spec.reloadTime > 0 ? this.localPlayer.weapons.reloadTimer / spec.reloadTime : 0,
        horizSpeed,
        isGrounded: this.localPlayer.state.isGrounded,
        rollTiltRad: recOut.viewmodelRollRad,
      });

      this.audio.updateListener(
        this.rendererCtx.camera.position.x,
        this.rendererCtx.camera.position.y,
        this.rendererCtx.camera.position.z,
        -Math.sin(this.localPlayer.state.yaw),
        0,
        -Math.cos(this.localPlayer.state.yaw)
      );

      this.onCrosshairEvent({
        spreadDeg: this.localPlayer.getCurrentSpreadDeg(),
        isInDeadzone: this.localPlayer.state.isInDeadzone,
        scopeLevel: this.localPlayer.weapons.scopeLevel,
        isOperator: spec.id === 'OPERATOR',
      });
    }

    this.rendererCtx.renderFrame();

    this.hudEmitAccum += frameTime;
    if (this.hudEmitAccum >= 0.1) {
      this.hudEmitAccum = 0;
      this.emitHud();
    }
  }

  public emitHud(): void {
    const inv = this.localPlayer.weapons.getActiveSlot();
    const spec = WEAPON_DATA[inv.id];
    const localIsAtk =
      this.localPlayer.playerId === 1 ? this.p1IsAttacker : !this.p1IsAttacker;

    let winnerText = '';
    if (this.phase === 'MATCH_OVER') {
      const localScore =
        this.localPlayer.playerId === 1 ? this.score[0] : this.score[1];
      const oppScore =
        this.localPlayer.playerId === 1 ? this.score[1] : this.score[0];
      winnerText = localScore > oppScore ? 'VICTORY' : 'DEFEAT';
    }

    this.onHudUpdate({
      appState: this.appState,
      mode: this.mode,
      phase: this.phase,
      roundNum: this.roundNum,
      timer: Math.max(0, this.phaseTimer),
      score: [...this.score] as [number, number],
      localIsAttacker: localIsAtk,
      hp: this.localPlayer.hp,
      shield: this.localPlayer.shield,
      credits: this.localPlayer.credits,
      weaponId: spec.id,
      mag: inv.mag,
      reserve: inv.reserve,
      slots: {
        1: this.localPlayer.weapons.slots[1]?.id ?? null,
        2: this.localPlayer.weapons.slots[2]?.id ?? null,
        3: this.localPlayer.weapons.slots[3]?.id ?? null,
      },
      activeSlot: this.localPlayer.weapons.activeSlot,
      isReloading: this.localPlayer.weapons.reloadTimer > 0,
      isScoped: this.localPlayer.weapons.isScoped(),
      scopeLevel: this.localPlayer.weapons.scopeLevel,
      isInDeadzone: this.localPlayer.state.isInDeadzone,
      buyMenuOpen: this.buyMenuOpen,
      fps: this.loop.measuredFps,
      frameMs: this.loop.measuredFrameMs,
      pingMs: this.mode === 'BOT' ? 0 : this.network.rttMs,
      matchFormat: this.matchFormat,
      aimDuelFree: this.aimDuelFree,
      winnerText,
      matchStats: {
        kills: this.localPlayer.kills,
        deaths: this.localPlayer.deaths,
        headshots: this.localPlayer.headshots,
        totalDamage: this.localPlayer.totalDamage,
      },
      killFeed: [...this.killFeed],
      roundBanner: this.roundBanner,
      netStatus: this.network.status,
      roomCode: this.network.roomCode,
      netError: this.network.errorMessage,
      pointerLocked: this.input.isPointerLocked,
    });
  }

  public resize(width: number, height: number): void {
    this.rendererCtx.resize(width, height);
  }

  public dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.network.disconnect();
    this.viewmodel.dispose();
    this.map.dispose();
    this.materials.dispose();
    this.rendererCtx.dispose();
  }
}
