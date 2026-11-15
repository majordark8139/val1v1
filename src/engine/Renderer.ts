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
  resize: (width: number, height: number) => void;
  renderFrame: () => void;
  dispose: () => void;
}

export function createTacticalRenderer(
  canvas: HTMLCanvasElement,
  onContextLost?: () => void
): TacticalRendererContext {
  const isSoftwareGl = detectSoftwareWebGL();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    stencil: false,
    depth: true,
    powerPreference: 'high-performance',
    precision: 'mediump',
  });

  renderer.setPixelRatio(1.0);
  renderer.shadowMap.enabled = false;
  renderer.autoClear = false;

  const width = canvas.clientWidth || window.innerWidth || 1280;
  const height = canvas.clientHeight || window.innerHeight || 720;
  renderer.setSize(width, height, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ecae6);
  scene.fog = new THREE.Fog(0x8ecae6, 55, 110);

  // Exactly 1 AmbientLight + 1 static DirectionalLight (shadows disabled)
  const ambient = new THREE.AmbientLight(0xffffff, 0.68);
  const dirLight = new THREE.DirectionalLight(0xfff8e7, 0.52);
  dirLight.position.set(40, 80, -30);
  scene.add(ambient);
  scene.add(dirLight);

  const camera = new THREE.PerspectiveCamera(
    CAMERA_CONFIG.DEFAULT_VFOV,
    width / Math.max(1, height),
    0.05,
    180
  );
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  const handleContextLost = (e: Event) => {
    e.preventDefault();
    onContextLost?.();
  };
  const handleContextRestored = () => {
    renderer.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, false);
  };
  canvas.addEventListener('webglcontextlost', handleContextLost);
  canvas.addEventListener('webglcontextrestored', handleContextRestored);

  return {
    renderer,
    scene,
    camera,
    isSoftwareGl,
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
