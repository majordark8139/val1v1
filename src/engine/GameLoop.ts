import { TICK_DT } from '../config/Constants';

export class GameLoop {
  private accumulator = 0;
  private lastTime = 0;
  public currentTick = 0;
  private running = false;
  private rafId = 0;
  private timeoutId = 0;

  private readonly isSoftwareGl: boolean;
  private readonly getGlContext: () => WebGLRenderingContext | WebGL2RenderingContext;
  private readonly fixedUpdate: (dt: number, tick: number) => void;
  private readonly renderUpdate: (alpha: number, frameTime: number) => void;

  // Frame metrics
  private fpsSamples = 0;
  private fpsAccum = 0;
  public measuredFps = 60;
  public measuredFrameMs = 16.6;

  constructor(options: {
    isSoftwareGl: boolean;
    getGlContext: () => WebGLRenderingContext | WebGL2RenderingContext;
    fixedUpdate: (dt: number, tick: number) => void;
    renderUpdate: (alpha: number, frameTime: number) => void;
  }) {
    this.isSoftwareGl = options.isSoftwareGl;
    this.getGlContext = options.getGlContext;
    this.fixedUpdate = options.fixedUpdate;
    this.renderUpdate = options.renderUpdate;
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.scheduleNext();
  }

  public stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = 0;
    }
  }

  private scheduleNext(): void {
    if (!this.running) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => {
        if (this.running) {
          this.rafId = requestAnimationFrame(this.tick);
        }
      });
    } else {
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.getGlContext() as WebGL2RenderingContext;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (!this.running) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          this.timeoutId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.timeoutId = window.setTimeout(cb, 80);
        }
      };
      this.timeoutId = window.setTimeout(poll, 5);
    } else {
      this.timeoutId = window.setTimeout(cb, 80);
    }
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    const rawFrameTime = (now - this.lastTime) * 0.001;
    this.lastTime = now;

    // Prevent spiral of death on tab switch or software GL pause
    const frameTime = rawFrameTime > 0.1 ? 0.1 : rawFrameTime < 0 ? 0 : rawFrameTime;
    this.accumulator += frameTime;

    while (this.accumulator >= TICK_DT) {
      this.currentTick++;
      this.fixedUpdate(TICK_DT, this.currentTick);
      this.accumulator -= TICK_DT;
    }

    const alpha = this.accumulator / TICK_DT;
    const renderStart = performance.now();
    this.renderUpdate(alpha, frameTime);
    const execMs = performance.now() - renderStart;

    this.fpsSamples++;
    this.fpsAccum += rawFrameTime;
    if (this.fpsAccum >= 0.5) {
      this.measuredFps = Math.round(this.fpsSamples / this.fpsAccum);
      this.measuredFrameMs = Math.round((execMs + Number.EPSILON) * 10) / 10;
      this.fpsSamples = 0;
      this.fpsAccum = 0;
    }

    this.scheduleNext();
  };
}
