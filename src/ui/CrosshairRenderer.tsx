import React, { useEffect, useImperativeHandle, useRef } from 'react';
import { CrosshairSettings } from '../config/Constants';
import { HitTier } from '../config/WeaponData';

export interface CrosshairFrameUpdate {
  spreadDeg: number;
  isInDeadzone: boolean;
  scopeLevel: 0 | 1 | 2;
  isOperator: boolean;
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

export const CrosshairRenderer = React.forwardRef<CrosshairRendererHandle, Props>(
  ({ visible, settings }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const settingsRef = useRef(settings);
    settingsRef.current = settings;

    const stateRef = useRef({
      spreadDeg: 0,
      isInDeadzone: true,
      scopeLevel: 0 as 0 | 1 | 2,
      isOperator: false,
      hitmarkerTier: null as HitTier | null,
      hitmarkerTimer: 0,
      damageAngle: 0,
      damageTimer: 0,
    });

    const drawFrame = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (!visible) return;

      const cx = Math.floor(w * 0.5) + 0.5;
      const cy = Math.floor(h * 0.5) + 0.5;
      const st = stateRef.current;
      const cfg = settingsRef.current;

      // 1. Directional damage vignette arc
      if (st.damageTimer > 0) {
        const alpha = Math.min(0.75, (st.damageTimer / 0.45) * 0.75);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-st.damageAngle);
        ctx.strokeStyle = `rgba(255, 42, 42, ${alpha})`;
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(0, 0, Math.min(w, h) * 0.24, -Math.PI * 0.5 - 0.55, -Math.PI * 0.5 + 0.55);
        ctx.stroke();
        ctx.restore();
      }

      // 2. Operator Sniper Scope HUD
      if (st.isOperator && st.scopeLevel > 0) {
        const radius = Math.min(w, h) * 0.44;
        ctx.save();
        ctx.fillStyle = 'rgba(5, 8, 12, 0.96)';
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
        ctx.fill();

        // Scope rim
        ctx.strokeStyle = '#11161f';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Thin black crosshairs inside aperture
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - radius, cy);
        ctx.lineTo(cx + radius, cy);
        ctx.moveTo(cx, cy - radius);
        ctx.lineTo(cx, cy + radius);
        ctx.stroke();

        // Mil-dot ticks
        ctx.lineWidth = 2;
        for (let i = 1; i <= 4; i++) {
          const d = i * (radius * 0.18);
          ctx.beginPath();
          ctx.moveTo(cx - d, cy - 5);
          ctx.lineTo(cx - d, cy + 5);
          ctx.moveTo(cx + d, cy - 5);
          ctx.lineTo(cx + d, cy + 5);
          ctx.moveTo(cx - 5, cy - d);
          ctx.lineTo(cx + 5, cy - d);
          ctx.moveTo(cx - 5, cy + d);
          ctx.lineTo(cx + 5, cy + d);
          ctx.stroke();
        }

        // Central Accuracy Indicator Dot: solid red ONLY in deadzone, blurry orange when moving
        if (st.isInDeadzone) {
          ctx.fillStyle = '#ff2a2a';
          ctx.beginPath();
          ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(245, 158, 11, 0.45)';
          ctx.beginPath();
          ctx.arc(cx, cy, 7.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255, 140, 0, 0.75)';
          ctx.beginPath();
          ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Zoom badge text inside scope
        ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(st.scopeLevel === 2 ? '5.0X' : '2.5X', cx, cy + radius - 22);
        ctx.restore();
      } else {
        // 3. Standard Customizable Tactical Crosshair
        const errorOffset = cfg.dynamicError ? Math.min(34, st.spreadDeg * 5.2) : 0;
        const gap = Math.round(cfg.gap + errorOffset);
        const len = cfg.length;
        const thick = cfg.thickness;
        const halfT = thick * 0.5;

        const drawRect = (rx: number, ry: number, rw: number, rh: number) => {
          if (cfg.outline) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.fillRect(rx - 1, ry - 1, rw + 2, rh + 2);
          }
          ctx.fillStyle = cfg.color;
          ctx.fillRect(rx, ry, rw, rh);
        };

        // Top, Bottom, Left, Right lines
        drawRect(cx - halfT, cy - gap - len, thick, len);
        drawRect(cx - halfT, cy + gap, thick, len);
        drawRect(cx - gap - len, cy - halfT, len, thick);
        drawRect(cx + gap, cy - halfT, len, thick);

        if (cfg.centerDot) {
          drawRect(cx - halfT, cy - halfT, thick, thick);
        }
      }

      // 4. Crisp X Hitmarker on hit confirm
      if (st.hitmarkerTimer > 0) {
        const isHead = st.hitmarkerTier === 'HEAD';
        const alpha = Math.min(1, st.hitmarkerTimer / 0.12);
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

    useImperativeHandle(ref, () => ({
      pushUpdate: (evt) => {
        const st = stateRef.current;
        st.spreadDeg = evt.spreadDeg;
        st.isInDeadzone = evt.isInDeadzone;
        st.scopeLevel = evt.scopeLevel;
        st.isOperator = evt.isOperator;
        if (evt.hitmarker) {
          st.hitmarkerTier = evt.hitmarker;
          st.hitmarkerTimer = 0.18;
        }
        if (evt.damageAngle !== undefined && evt.damageAngle !== null) {
          st.damageAngle = evt.damageAngle;
          st.damageTimer = 0.45;
        }
        drawFrame();
      },
    }));

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const syncSize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        drawFrame();
      };
      syncSize();
      window.addEventListener('resize', syncSize);

      let last = performance.now();
      let raf = 0;
      const decayLoop = (now: number) => {
        const dt = (now - last) * 0.001;
        last = now;
        const st = stateRef.current;
        let dirty = false;
        if (st.hitmarkerTimer > 0) {
          st.hitmarkerTimer = Math.max(0, st.hitmarkerTimer - dt);
          dirty = true;
        }
        if (st.damageTimer > 0) {
          st.damageTimer = Math.max(0, st.damageTimer - dt);
          dirty = true;
        }
        if (dirty) drawFrame();
        raf = requestAnimationFrame(decayLoop);
      };
      raf = requestAnimationFrame(decayLoop);

      return () => {
        window.removeEventListener('resize', syncSize);
        cancelAnimationFrame(raf);
      };
    }, [visible]);

    return (
      <canvas
        ref={canvasRef}
        data-testid="crosshair-canvas"
        className="fixed inset-0 pointer-events-none z-20"
      />
    );
  }
);
