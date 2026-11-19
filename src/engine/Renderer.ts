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

/**
 * Pure Unlit Zero-Shadow, Zero-Reflection, Zero-Lighting Tactical WebGL Renderer.
 * Every object renders via MeshBasicMaterial + thin outlines for locked high FPS.
 */
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
  renderer.setPixelRatio(1.0);
  renderer.shadowMap.enabled = false;
  renderer.autoClear = false;

  const width = canvas.clientWidth || window.innerWidth || 1280;
  const height = canvas.clientHeight || window.innerHeight || 720;
  renderer.setSize(width, height, false);

  const scene = new THREE.Scene();
  // Pure flat daylight sky canvas — zero sky dome geometry, zero fog, zero environment map, zero lights
  scene.background = new THREE.Color(0xd8e0e8);
  scene.fog = null;
  scene.environment = null;

  const camera = new THREE.PerspectiveCamera(
    CAMERA_CONFIG.DEFAULT_VFOV,
    width / Math.max(1, height),
    0.02, // Tight near plane so 3D ADS optic housing sits comfortably close to the eye without clipping
    220
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
    maxAnisotropy: 1,
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
      renderer.dispose();
    },
  };
}
