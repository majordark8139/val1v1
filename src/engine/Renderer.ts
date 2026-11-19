import * as THREE from 'three';
import { CAMERA_CONFIG } from '../config/Constants';

export function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl =
      probeCanvas.getContext('webgl2') ||
      probeCanvas.getContext('webgl') ||
      probeCanvas.getContext('experimental-webgl');
    if (!gl) return true;
    const wgl = gl as WebGLRenderingContext;
    const ext = wgl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : wgl.RENDERER;
    const gpu = String(wgl.getParameter(param) || '');
    wgl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export interface TacticalRendererContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  isSoftwareGl: boolean;
  maxAnisotropy: number;
  prewarm: () => void;
  resize: (width: number, height: number) => void;
  renderFrame: () => void;
  dispose: () => void;
}

function createClaySkyDomeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0.0, '#8d97a6'); // Blender viewport neutral zenith
  grad.addColorStop(0.42, '#b9c0cb'); // Soft studio mid-sky
  grad.addColorStop(0.55, '#d3d8e0'); // Clean horizon
  grad.addColorStop(0.72, '#bec4cc'); // Lower atmospheric bounce
  grad.addColorStop(1.0, '#8b919a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  tex.needsUpdate = true;
  return tex;
}

export function createTacticalRenderer(
  canvas: HTMLCanvasElement,
  onContextLost?: () => void
): TacticalRendererContext {
  const isSoftwareGl = detectSoftwareWebGL();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !isSoftwareGl,
    alpha: false,
    stencil: false,
    depth: true,
    powerPreference: 'high-performance',
    precision: isSoftwareGl ? 'mediump' : 'highp',
  });

  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.NoToneMapping;
  // Lock 1:1 native CSS pixel ratio for smooth vsync pacing without fractional scaling stutter
  renderer.setPixelRatio(1.0);
  renderer.shadowMap.enabled = false;
  renderer.autoClear = false;

  const width = canvas.clientWidth || window.innerWidth || 1280;
  const height = canvas.clientHeight || window.innerHeight || 720;
  renderer.setSize(width, height, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcbd1da);
  scene.fog = new THREE.Fog(0xd0d5dd, 68, 170);

  // Lightweight Neutral Blender Viewport Studio Sky Dome
  const skyTex = createClaySkyDomeTexture();
  const skyGeo = new THREE.SphereGeometry(190, 16, 12);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  const camera = new THREE.PerspectiveCamera(
    CAMERA_CONFIG.DEFAULT_VFOV,
    width / Math.max(1, height),
    0.05,
    240
  );
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  const handleContextLost = (e: Event) => {
    e.preventDefault();
    onContextLost?.();
  };
  const handleContextRestored = () => {
    renderer.setSize(
      canvas.clientWidth || window.innerWidth,
      canvas.clientHeight || window.innerHeight,
      false
    );
  };
  canvas.addEventListener('webglcontextlost', handleContextLost);
  canvas.addEventListener('webglcontextrestored', handleContextRestored);

  return {
    renderer,
    scene,
    camera,
    isSoftwareGl,
    maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
    prewarm: () => {
      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }
    },
    resize: (w: number, h: number) => {
      const safeW = Math.max(1, w);
      const safeH = Math.max(1, h);
      camera.aspect = safeW / safeH;
      camera.updateProjectionMatrix();
      renderer.setSize(safeW, safeH, false);
    },
    renderFrame: () => {
      renderer.clear(true, true, false);
      renderer.render(scene, camera);
    },
    dispose: () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      skyTex.dispose();
      sky.geometry.dispose();
      skyMat.dispose();
      renderer.dispose();
    },
  };
}
