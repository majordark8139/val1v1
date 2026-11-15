import { MapMaterialKey } from '../map/AscentMidData';

export class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private softClipCurve: Float32Array<ArrayBuffer> | null = null;
  public muted = false;

  public unlock(): void {
    const activation = (navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (activation && !activation.hasBeenActive) {
      return;
    }
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.7;
      this.masterGain.connect(this.ctx.destination);
      this.noiseBuffer = this.buildNoiseBuffer(this.ctx);
      this.softClipCurve = this.buildSoftClipCurve();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.7, this.ctx.currentTime, 0.015);
    }
  }

  public updateListener(
    x: number,
    y: number,
    z: number,
    fx: number,
    fy: number,
    fz: number
  ): void {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    if (typeof l.positionX !== 'undefined') {
      l.positionX.value = x;
      l.positionY.value = y;
      l.positionZ.value = z;
      l.forwardX.value = fx;
      l.forwardY.value = fy;
      l.forwardZ.value = fz;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else if (typeof l.setPosition === 'function') {
      l.setPosition(x, y, z);
      l.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  private buildNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private buildSoftClipCurve(): Float32Array<ArrayBuffer> {
    const n = 256;
    const curve = new Float32Array(new ArrayBuffer(n * 4));
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = Math.tanh(x * 2.5);
    }
    return curve;
  }

  private createDestinationNode(pos3D?: [number, number, number]): AudioNode | null {
    if (!this.ctx || !this.masterGain || this.muted) return null;
    if (!pos3D) return this.masterGain;

    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 3;
    panner.maxDistance = 80;
    panner.rolloffFactor = 1.1;
    panner.positionX.value = pos3D[0];
    panner.positionY.value = pos3D[1];
    panner.positionZ.value = pos3D[2];
    panner.connect(this.masterGain);
    return panner;
  }

  public playHeavyShot(pos3D: [number, number, number] | undefined, isSheriff: boolean): void {
    this.unlock();
    const dest = this.createDestinationNode(pos3D);
    if (!this.ctx || !dest || !this.noiseBuffer) return;

    const now = this.ctx.currentTime;
    const pitchJitter = 0.94 + Math.random() * 0.12;

    // 1. Transient Crack
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime((isSheriff ? 1400 : 1800) * pitchJitter, now);
    bp.Q.value = 1.2;
    const crackGain = this.ctx.createGain();
    crackGain.gain.setValueAtTime(0.85, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    noise.connect(bp);
    bp.connect(crackGain);
    crackGain.connect(dest);
    noise.start(now);
    noise.stop(now + 0.12);

    // 2. Low-End Punch
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190 * pitchJitter, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.09);
    const punchGain = this.ctx.createGain();
    punchGain.gain.setValueAtTime(0.7, now);
    punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(punchGain);
    punchGain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.13);

    // 3. Tail Reverb Impulse
    const tailNoise = this.ctx.createBufferSource();
    tailNoise.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(650, now);
    const tailGain = this.ctx.createGain();
    tailGain.gain.setValueAtTime(0.32, now);
    tailGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    tailNoise.connect(lp);
    lp.connect(tailGain);
    tailGain.connect(dest);
    tailNoise.start(now);
    tailNoise.stop(now + 0.27);
  }

  public playSuppressedShot(pos3D: [number, number, number] | undefined, pitchScale = 1.0): void {
    this.unlock();
    const dest = this.createDestinationNode(pos3D);
    if (!this.ctx || !dest || !this.noiseBuffer) return;

    const now = this.ctx.currentTime;
    const jitter = 0.95 + Math.random() * 0.1;

    // 1. Silenced Thud
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260 * pitchScale * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.065);
    const thudGain = this.ctx.createGain();
    thudGain.gain.setValueAtTime(0.55, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
    osc.connect(thudGain);
    thudGain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.08);

    // 2. High-Freq Air Puff
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(3200 * jitter, now);
    bp.Q.value = 2.0;
    const puffGain = this.ctx.createGain();
    puffGain.gain.setValueAtTime(0.35, now);
    puffGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    noise.connect(bp);
    bp.connect(puffGain);
    puffGain.connect(dest);
    noise.start(now);
    noise.stop(now + 0.06);
  }

  public playOperatorShot(pos3D?: [number, number, number]): void {
    this.unlock();
    const dest = this.createDestinationNode(pos3D);
    if (!this.ctx || !dest || !this.noiseBuffer) return;

    const now = this.ctx.currentTime;

    // 1. Sub-Bass Boom
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(140, now);
    sub.frequency.exponentialRampToValueAtTime(24, now + 0.38);
    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(1.0, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    sub.connect(subGain);
    subGain.connect(dest);
    sub.start(now);
    sub.stop(now + 0.44);

    // 2. Supersonic Whip Crack
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(1200, now);
    const shaper = this.ctx.createWaveShaper();
    if (this.softClipCurve) shaper.curve = this.softClipCurve;
    const whipGain = this.ctx.createGain();
    whipGain.gain.setValueAtTime(0.95, now);
    whipGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    noise.connect(hp);
    hp.connect(shaper);
    shaper.connect(whipGain);
    whipGain.connect(dest);
    noise.start(now);
    noise.stop(now + 0.34);

    // 3. Metallic Receiver Ring
    const ring = this.ctx.createOscillator();
    ring.type = 'square';
    ring.frequency.setValueAtTime(2480, now);
    const ringGain = this.ctx.createGain();
    ringGain.gain.setValueAtTime(0.12, now);
    ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    ring.connect(ringGain);
    ringGain.connect(dest);
    ring.start(now);
    ring.stop(now + 0.19);
  }

  public playHeadshotDink(): void {
    this.unlock();
    const dest = this.createDestinationNode(undefined);
    if (!this.ctx || !dest) return;

    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(2180, now);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(4360, now);
    osc2.detune.setValueAtTime(14, now);

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(1800, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.75, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc1.connect(hp);
    osc2.connect(hp);
    hp.connect(gain);
    gain.connect(dest);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.24);
    osc2.stop(now + 0.24);
  }

  public playBodyHitmarker(): void {
    this.unlock();
    const dest = this.createDestinationNode(undefined);
    if (!this.ctx || !dest || !this.noiseBuffer) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(310, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.045);

    const g1 = this.ctx.createGain();
    g1.gain.setValueAtTime(0.55, now);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(g1);
    g1.connect(dest);
    osc.start(now);
    osc.stop(now + 0.055);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(900, now);
    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(0.35, now);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    noise.connect(bp);
    bp.connect(g2);
    g2.connect(dest);
    noise.start(now);
    noise.stop(now + 0.045);
  }

  public playFootstep(
    pos3D: [number, number, number] | undefined,
    surfaceType: MapMaterialKey,
    isLocal: boolean
  ): void {
    this.unlock();
    const dest = this.createDestinationNode(isLocal ? undefined : pos3D);
    if (!this.ctx || !dest || !this.noiseBuffer) return;

    const now = this.ctx.currentTime;
    const jitter = 0.92 + Math.random() * 0.16;
    const volScale = isLocal ? 0.36 : 0.65;

    if (surfaceType === 'MAT_CATWALK_METAL') {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1350 * jitter, now);
      bp.Q.value = 6.0;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.48 * volScale, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
      noise.connect(bp);
      bp.connect(gain);
      gain.connect(dest);
      noise.start(now);
      noise.stop(now + 0.07);
    } else {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(480 * jitter, now);
      bp.Q.value = 3.5;
      const g1 = this.ctx.createGain();
      g1.gain.setValueAtTime(0.45 * volScale, now);
      g1.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
      noise.connect(bp);
      bp.connect(g1);
      g1.connect(dest);
      noise.start(now);
      noise.stop(now + 0.05);

      const heel = this.ctx.createOscillator();
      heel.type = 'sine';
      heel.frequency.setValueAtTime(110 * jitter, now);
      heel.frequency.exponentialRampToValueAtTime(45, now + 0.04);
      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0.32 * volScale, now);
      g2.gain.exponentialRampToValueAtTime(0.001, now + 0.042);
      heel.connect(g2);
      g2.connect(dest);
      heel.start(now);
      heel.stop(now + 0.045);
    }
  }

  public playEquipClick(): void {
    this.unlock();
    const dest = this.createDestinationNode(undefined);
    if (!this.ctx || !dest || !this.noiseBuffer) return;
    this.scheduleClickPair(this.ctx, dest, 2800, 3400, 0.12);
  }

  public playReloadClick(): void {
    this.unlock();
    const dest = this.createDestinationNode(undefined);
    if (!this.ctx || !dest || !this.noiseBuffer) return;
    this.scheduleClickPair(this.ctx, dest, 2200, 3100, 0.15);
  }

  public playScopeClick(): void {
    this.unlock();
    const dest = this.createDestinationNode(undefined);
    if (!this.ctx || !dest || !this.noiseBuffer) return;
    this.scheduleClickPair(this.ctx, dest, 3800, 4400, 0.04);
  }

  public playKnifeSwing(): void {
    this.unlock();
    const dest = this.createDestinationNode(undefined);
    if (!this.ctx || !dest || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1600, now);
    bp.frequency.exponentialRampToValueAtTime(450, now + 0.12);
    bp.Q.value = 1.5;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    noise.connect(bp);
    bp.connect(gain);
    gain.connect(dest);
    noise.start(now);
    noise.stop(now + 0.14);
  }

  public playRoundHorn(isVictory = false): void {
    this.unlock();
    const dest = this.createDestinationNode(undefined);
    if (!this.ctx || !dest) return;
    const now = this.ctx.currentTime;
    const rootFreq = isVictory ? 220 : 146.83;
    const fifthFreq = rootFreq * 1.5;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(800, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    lp.connect(gain);
    gain.connect(dest);

    for (const freq of [rootFreq, fifthFreq]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      osc.connect(lp);
      osc.start(now);
      osc.stop(now + 0.82);
    }
  }

  private scheduleClickPair(
    ctx: AudioContext,
    dest: AudioNode,
    f1: number,
    f2: number,
    gapSec: number
  ): void {
    if (!this.noiseBuffer) return;
    const now = ctx.currentTime;
    const times = [now, now + gapSec];
    const freqs = [f1, f2];
    for (let i = 0; i < 2; i++) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(freqs[i], times[i]);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.22, times[i]);
      g.gain.exponentialRampToValueAtTime(0.001, times[i] + 0.025);
      src.connect(hp);
      hp.connect(g);
      g.connect(dest);
      src.start(times[i]);
      src.stop(times[i] + 0.03);
    }
  }
}
