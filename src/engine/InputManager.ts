import { CAMERA_CONFIG } from '../config/Constants';

export interface FrameInputSnapshot {
  forward: number;
  right: number;
  jumpPressed: boolean;
  crouchHeld: boolean;
  walkHeld: boolean;
  fireHeld: boolean;
  fireJustPressed: boolean;
  altFireJustPressed: boolean;
  reloadJustPressed: boolean;
  slotRequest: 1 | 2 | 3 | 0;
  yaw: number;
  pitch: number;
}

const DEG_TO_RAD = Math.PI / 180;
const MAX_PITCH = 88.5 * DEG_TO_RAD;

export class InputManager {
  private keysHeld = new Set<string>();
  private keysJustPressed = new Set<string>();
  private mouseHeld = new Set<number>();
  private mouseJustPressed = new Set<number>();

  public yaw = 0;
  public pitch = 0;
  public sensitivity = 0.35;
  public isPointerLocked = false;
  public inputBlocked = false;

  private canvas: HTMLCanvasElement;
  private onToggleBuyMenu?: () => void;
  private onTogglePause?: () => void;
  private onToggleMute?: () => void;

  constructor(
    canvas: HTMLCanvasElement,
    callbacks: {
      onToggleBuyMenu?: () => void;
      onTogglePause?: () => void;
      onToggleMute?: () => void;
    } = {}
  ) {
    this.canvas = canvas;
    this.onToggleBuyMenu = callbacks.onToggleBuyMenu;
    this.onTogglePause = callbacks.onTogglePause;
    this.onToggleMute = callbacks.onToggleMute;

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('contextmenu', this.handleContextMenu);
    window.addEventListener('blur', this.handleWindowBlur);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
  }

  public requestPointerLock(): void {
    try {
      if (document.pointerLockElement !== this.canvas) {
        const res = this.canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      }
    } catch {
      // Ignore pointer lock rejection in headless/sandbox environments
    }
  }

  public exitPointerLock(): void {
    try {
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
    } catch {
      // Ignore
    }
  }

  public clearHeld(): void {
    this.keysHeld.clear();
    this.keysJustPressed.clear();
    this.mouseHeld.clear();
    this.mouseJustPressed.clear();
  }

  public setAngles(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;

    // Ignore typing in text inputs
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      return;
    }

    if (code === 'Escape' || code === 'KeyP') {
      if (document.body.dataset.state === 'playing' || document.body.dataset.state === 'paused') {
        this.onTogglePause?.();
      }
      return;
    }

    if (code === 'KeyM') {
      this.onToggleMute?.();
      return;
    }

    if (code === 'KeyB') {
      if (document.body.dataset.state === 'playing') {
        this.onToggleBuyMenu?.();
      }
      return;
    }

    if (this.inputBlocked) return;

    if (!this.keysHeld.has(code)) {
      this.keysJustPressed.add(code);
    }
    this.keysHeld.add(code);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keysHeld.delete(e.code);
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (this.inputBlocked) return;
    if (document.body.dataset.state !== 'playing') return;
    if (!this.isPointerLocked) return;
    if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;

    const yawDeg = e.movementX * this.sensitivity * CAMERA_CONFIG.VALORANT_YAW_MULT;
    const pitchDeg = e.movementY * this.sensitivity * CAMERA_CONFIG.VALORANT_YAW_MULT;

    this.yaw -= yawDeg * DEG_TO_RAD;
    this.pitch -= pitchDeg * DEG_TO_RAD;
    if (this.pitch > MAX_PITCH) this.pitch = MAX_PITCH;
    if (this.pitch < -MAX_PITCH) this.pitch = -MAX_PITCH;
  };

  private handleMouseDown = (e: MouseEvent): void => {
    if (this.inputBlocked) return;
    if (document.body.dataset.state !== 'playing') return;

    // Only capture clicks directed at the game canvas
    if (e.target !== this.canvas && !this.isPointerLocked) return;

    if (!this.isPointerLocked) {
      this.requestPointerLock();
    }

    if (!this.mouseHeld.has(e.button)) {
      this.mouseJustPressed.add(e.button);
    }
    this.mouseHeld.add(e.button);
  };

  private handleMouseUp = (e: MouseEvent): void => {
    this.mouseHeld.delete(e.button);
  };

  private handleContextMenu = (e: MouseEvent): void => {
    if (document.body.dataset.state === 'playing') {
      e.preventDefault();
    }
  };

  private handleWindowBlur = (): void => {
    this.clearHeld();
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.clearHeld();
    }
  };

  private handlePointerLockChange = (): void => {
    this.isPointerLocked = document.pointerLockElement === this.canvas;
    if (!this.isPointerLocked) {
      this.mouseHeld.clear();
    }
  };

  public consumeTickInput(): FrameInputSnapshot {
    const f =
      (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp') ? 1 : 0) -
      (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown') ? 1 : 0);
    const r =
      (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight') ? 1 : 0) -
      (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft') ? 1 : 0);

    let slotRequest: 1 | 2 | 3 | 0 = 0;
    if (this.keysJustPressed.has('Digit1')) slotRequest = 1;
    else if (this.keysJustPressed.has('Digit2')) slotRequest = 2;
    else if (this.keysJustPressed.has('Digit3')) slotRequest = 3;

    const snap: FrameInputSnapshot = {
      forward: f,
      right: r,
      jumpPressed: this.keysJustPressed.has('Space'),
      crouchHeld: this.keysHeld.has('ControlLeft') || this.keysHeld.has('ControlRight') || this.keysHeld.has('KeyC'),
      walkHeld: this.keysHeld.has('ShiftLeft') || this.keysHeld.has('ShiftRight'),
      fireHeld: this.mouseHeld.has(0),
      fireJustPressed: this.mouseJustPressed.has(0),
      altFireJustPressed: this.mouseJustPressed.has(2),
      reloadJustPressed: this.keysJustPressed.has('KeyR'),
      slotRequest,
      yaw: this.yaw,
      pitch: this.pitch,
    };

    this.keysJustPressed.clear();
    this.mouseJustPressed.clear();
    return snap;
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('contextmenu', this.handleContextMenu);
    window.removeEventListener('blur', this.handleWindowBlur);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
  }
}
