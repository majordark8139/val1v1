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
  grad.addColorStop(0.0, '#96a0ae'); // Neutral cool Blender viewport zenith
  grad.addColorStop(0.42, '#c0c7d1'); // Soft studio mid-sky
  grad.addColorStop(0.56, '#dce0e6'); // Clean horizon
  grad.addColorStop(0.72, '#c4c9d0'); // Lower atmospheric bounce
  grad.addColorStop(1.0, '#90969e');
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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  // Cap DPR at 1.25 to preserve locked 60+ FPS across high-DPI displays
  renderer.setPixelRatio(isSoftwareGl ? 1.0 : Math.min(window.devicePixelRatio || 1, 1.25));
  renderer.shadowMap.enabled = false;
  renderer.autoClear = false;

  const width = canvas.clientWidth || window.innerWidth || 1280;
  const height = canvas.clientHeight || window.innerHeight || 720;
  renderer.setSize(width, height, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd2d7de).convertSRGBToLinear();
  scene.fog = new THREE.Fog(0xd8dde4, 65, 165);

  // Lightweight Neutral Blender Studio Sky Dome
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

  // Clean 3-Point Blender Clay / Workbench Studio Lighting (zero shadow-map pass overhead)
  const hemiLight = new THREE.HemisphereLight(
    new THREE.Color(0xf5f7fa).convertSRGBToLinear(),
    new THREE.Color(0x525862).convertSRGBToLinear(),
    0.85
  );
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(
    new THREE.Color(0xfffaf0).convertSRGBToLinear(),
    0.88
  );
  keyLight.position.set(42, 68, 30);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(
    new THREE.Color(0xc2d2e8).convertSRGBToLinear(),
    0.34
  );
  rimLight.position.set(-40, 28, -44);
  scene.add(rimLight);

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
