import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { CrosshairSettings } from '../config/Constants';
import { HitTier } from '../config/WeaponData';

export interface CrosshairFrameUpdate {
  spreadDeg: number;
  isInDeadzone: boolean;
  scopeLevel: 0 | 1 | 2;
  isOperator: boolean;
  isADS?: boolean;
  hitmarker?: HitTier | null;
  damageAngle?: number | null;
}

export interface CrosshairRendererHandle {
  pushUpdate: (evt: CrosshairFrameUpdate) => void;
}

interface Props {
  visible: boolean;
  settings: CrosshairSettings;
}

const FX_CANVAS_SIZE = 240;

/**
 * Zero-stutter tactical crosshair renderer:
 * - Standard 4-tick crosshair uses GPU-composited DOM transforms (zero full-screen 2D canvas redraws!)
 * - Compact 240x240 centered canvas draws ONLY during transient hitmarker / damage indicator fades
 * - Pure lightweight SVG overlay renders Operator 2.5x / 5.0x scope ONLY when scoped
 */
export const CrosshairRenderer = React.forwardRef<CrosshairRendererHandle, Props>(
  ({ visible, settings }, ref) => {
    const topRef = useRef<HTMLDivElement | null>(null);
    const bottomRef = useRef<HTMLDivElement | null>(null);
    const leftRef = useRef<HTMLDivElement | null>(null);
    const rightRef = useRef<HTMLDivElement | null>(null);
    const fxCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const settingsRef = useRef(settings);
    settingsRef.current = settings;
    const visibleRef = useRef(visible);
    visibleRef.current = visible;
    const rafRef = useRef<number>(0);

    const [scopeOverlay, setScopeOverlay] = useState<{
      active: boolean;
      level: 0 | 1 | 2;
      deadzone: boolean;
      adsOptic: boolean;
    }>({ active: false, level: 0, deadzone: true, adsOptic: false });

    const scopeRef = useRef({ active: false, level: 0 as 0 | 1 | 2, deadzone: true, adsOptic: false });
    const lastGapRef = useRef(-999);

    const fxRef = useRef({
      hitmarkerTier: null as HitTier | null,
      hitmarkerTimer: 0,
      damageAngle: 0,
      damageTimer: 0,
    });

    const applyGapToDom = (gapPx: number) => {
      if (lastGapRef.current === gapPx) return;
      lastGapRef.current = gapPx;
      const len = settingsRef.current.length;
      if (topRef.current) {
        topRef.current.style.transform = `translate3d(-50%, ${-(gapPx + len)}px, 0)`;
      }
      if (bottomRef.current) {
        bottomRef.current.style.transform = `translate3d(-50%, ${gapPx}px, 0)`;
      }
      if (leftRef.current) {
        leftRef.current.style.transform = `translate3d(${-(gapPx + len)}px, -50%, 0)`;
      }
      if (rightRef.current) {
        rightRef.current.style.transform = `translate3d(${gapPx}px, -50%, 0)`;
      }
    };

    const drawFxCanvas = () => {
      const canvas = fxCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, FX_CANVAS_SIZE, FX_CANVAS_SIZE);
      if (!visibleRef.current) return;

      const cx = FX_CANVAS_SIZE * 0.5;
      const cy = FX_CANVAS_SIZE * 0.5;
      const fx = fxRef.current;

      // Directional damage arc inside compact center canvas
      if (fx.damageTimer > 0) {
        const alpha = Math.min(0.8, (fx.damageTimer / 0.45) * 0.8);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-fx.damageAngle);
        ctx.strokeStyle = `rgba(255, 42, 42, ${alpha})`;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(0, 0, 96, -Math.PI * 0.5 - 0.52, -Math.PI * 0.5 + 0.52);
        ctx.stroke();
        ctx.restore();
      }

      // Crisp X Hitmarker
      if (fx.hitmarkerTimer > 0) {
        const isHead = fx.hitmarkerTier === 'HEAD';
        const alpha = Math.min(1, fx.hitmarkerTimer / 0.12);
        ctx.save();
        ctx.strokeStyle = isHead
          ? `rgba(255, 42, 42, ${alpha})`
          : `rgba(255, 255, 255, ${alpha})`;
        ctx.lineWidth = isHead ? 2.5 : 2;
        const inner = 6;
        const outer = isHead ? 15 : 12;
        for (const sx of [-1, 1]) {
          for (const sy of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(cx + sx * inner, cy + sy * inner);
            ctx.lineTo(cx + sx * outer, cy + sy * outer);
            ctx.stroke();
            if (isHead) {
              ctx.beginPath();
              ctx.moveTo(cx + sx * (outer + 3), cy + sy * (outer + 3));
              ctx.lineTo(cx + sx * (outer + 7), cy + sy * (outer + 7));
              ctx.stroke();
            }
          }
        }
        ctx.restore();
      }
    };

    const ensureFxLoop = () => {
      if (rafRef.current) return;
      let last = performance.now();
      const step = (now: number) => {
        const dt = (now - last) * 0.001;
        last = now;
        const fx = fxRef.current;
        if (fx.hitmarkerTimer > 0) fx.hitmarkerTimer = Math.max(0, fx.hitmarkerTimer - dt);
        if (fx.damageTimer > 0) fx.damageTimer = Math.max(0, fx.damageTimer - dt);
        drawFxCanvas();
        if (fx.hitmarkerTimer > 0 || fx.damageTimer > 0) {
          rafRef.current = requestAnimationFrame(step);
        } else {
          rafRef.current = 0;
        }
      };
      rafRef.current = requestAnimationFrame(step);
    };

    useImperativeHandle(ref, () => ({
      pushUpdate: (evt) => {
        const cfg = settingsRef.current;
        const errorOffset = cfg.dynamicError ? Math.min(34, evt.spreadDeg * 5.2) : 0;
        const gapPx = Math.round(cfg.gap + errorOffset);
        applyGapToDom(gapPx);

        const nextScoped = evt.isOperator && evt.scopeLevel > 0;
        const nextAdsOptic = Boolean(evt.isADS) && !nextScoped;
        if (
          scopeRef.current.active !== nextScoped ||
          scopeRef.current.level !== evt.scopeLevel ||
          scopeRef.current.adsOptic !== nextAdsOptic ||
          (nextScoped && scopeRef.current.deadzone !== evt.isInDeadzone)
        ) {
          scopeRef.current = {
            active: nextScoped,
            level: evt.scopeLevel,
            deadzone: evt.isInDeadzone,
            adsOptic: nextAdsOptic,
          };
          setScopeOverlay({ ...scopeRef.current });
        }

        let triggeredFx = false;
        if (evt.hitmarker) {
          fxRef.current.hitmarkerTier = evt.hitmarker;
          fxRef.current.hitmarkerTimer = 0.18;
          triggeredFx = true;
        }
        if (evt.damageAngle !== undefined && evt.damageAngle !== null) {
          fxRef.current.damageAngle = evt.damageAngle;
          fxRef.current.damageTimer = 0.45;
          triggeredFx = true;
        }
        if (triggeredFx) {
          drawFxCanvas();
          ensureFxLoop();
        }
      },
    }));

    useEffect(() => {
      lastGapRef.current = -999;
      applyGapToDom(Math.round(settings.gap));
      drawFxCanvas();
    }, [visible, settings]);

    useEffect(() => {
      return () => {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
      };
    }, []);

    if (!visible) return null;

    const outlineShadow = settings.outline ? '0 0 0 1px rgba(0,0,0,0.88)' : 'none';

    return (
      <div
        data-testid="crosshair-canvas"
        className="fixed inset-0 pointer-events-none z-20 overflow-hidden"
      >
        {/* Standard GPU-Composited Tactical Crosshair (hidden during sniper scope AND true 3D optic ADS) */}
        {!scopeOverlay.active && !scopeOverlay.adsOptic && (
          <>
            <div
              ref={topRef}
              style={{
                position: 'fixed',
                left: '50%',
                top: '50%',
                width: `${settings.thickness}px`,
                height: `${settings.length}px`,
                backgroundColor: settings.color,
                boxShadow: outlineShadow,
                willChange: 'transform',
              }}
            />
            <div
              ref={bottomRef}
              style={{
                position: 'fixed',
                left: '50%',
                top: '50%',
                width: `${settings.thickness}px`,
                height: `${settings.length}px`,
                backgroundColor: settings.color,
                boxShadow: outlineShadow,
                willChange: 'transform',
              }}
            />
            <div
              ref={leftRef}
              style={{
                position: 'fixed',
                left: '50%',
                top: '50%',
                width: `${settings.length}px`,
                height: `${settings.thickness}px`,
                backgroundColor: settings.color,
                boxShadow: outlineShadow,
                willChange: 'transform',
              }}
            />
            <div
              ref={rightRef}
              style={{
                position: 'fixed',
                left: '50%',
                top: '50%',
                width: `${settings.length}px`,
                height: `${settings.thickness}px`,
                backgroundColor: settings.color,
                boxShadow: outlineShadow,
                willChange: 'transform',
              }}
            />
            {settings.centerDot && (
              <div
                style={{
                  position: 'fixed',
                  left: '50%',
                  top: '50%',
                  width: `${settings.thickness}px`,
                  height: `${settings.thickness}px`,
                  transform: 'translate3d(-50%, -50%, 0)',
                  backgroundColor: settings.color,
                  boxShadow: outlineShadow,
                }}
              />
            )}
          </>
        )}

        {/* Lightweight Operator Sniper Scope SVG Overlay (mounted ONLY when scoped) */}
        {scopeOverlay.active && (
          <div className="fixed inset-0 flex items-center justify-center">
            <svg className="w-full h-full" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
              <defs>
                <mask id="op-scope-mask">
                  <rect width="1600" height="900" fill="white" />
                  <circle cx="800" cy="450" r="390" fill="black" />
                </mask>
              </defs>
              <rect width="1600" height="900" fill="rgba(5,8,12,0.96)" mask="url(#op-scope-mask)" />
              <circle cx="800" cy="450" r="390" fill="none" stroke="#11161f" strokeWidth="5" />
              <line x1="410" y1="450" x2="1190" y2="450" stroke="rgba(0,0,0,0.9)" strokeWidth="1.5" />
              <line x1="800" y1="60" x2="800" y2="840" stroke="rgba(0,0,0,0.9)" strokeWidth="1.5" />
              {[70, 140, 210, 280].map((d) => (
                <g key={d} stroke="rgba(0,0,0,0.9)" strokeWidth="2">
                  <line x1={800 - d} y1="444" x2={800 - d} y2="456" />
                  <line x1={800 + d} y1="444" x2={800 + d} y2="456" />
                  <line x1="794" y1={450 - d} x2="806" y2={450 - d} />
                  <line x1="794" y1={450 + d} x2="806" y2={450 + d} />
                </g>
              ))}
              {scopeOverlay.deadzone ? (
                <circle cx="800" cy="450" r="3.4" fill="#ff2a2a" />
              ) : (
                <>
                  <circle cx="800" cy="450" r="8" fill="rgba(245,158,11,0.45)" />
                  <circle cx="800" cy="450" r="3.8" fill="rgba(255,140,0,0.8)" />
                </>
              )}
              <text
                x="800"
                y="818"
                textAnchor="middle"
                fill="rgba(255,255,255,0.75)"
                fontSize="14"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="600"
              >
                {scopeOverlay.level === 2 ? '5.0X' : '2.5X'}
              </text>
            </svg>
          </div>
        )}

        {/* Compact 240x240 Centered Hitmarker & Damage Arc Canvas (Idle 0ms when no active FX) */}
        <canvas
          ref={fxCanvasRef}
          width={FX_CANVAS_SIZE}
          height={FX_CANVAS_SIZE}
          style={{
            position: 'fixed',
            left: '50%',
            top: '50%',
            width: `${FX_CANVAS_SIZE}px`,
            height: `${FX_CANVAS_SIZE}px`,
            transform: 'translate3d(-50%, -50%, 0)',
          }}
        />
      </div>
    );
  }
);
