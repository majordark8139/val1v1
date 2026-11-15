import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
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

function createSkyDomeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#2c6aa0'); // Deep Mediterranean zenith
  grad.addColorStop(0.38, '#5ea1d4'); // Crisp mid sky
  grad.addColorStop(0.55, '#9cd0ee'); // Warm bright horizon
  grad.addColorStop(0.68, '#dce9f2'); // Ground haze below horizon
  grad.addColorStop(1.0, '#8e9ba6');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 256);
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
  renderer.toneMappingExposure = 0.94;
  renderer.setPixelRatio(isSoftwareGl ? 1.0 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.autoClear = false;

  const width = canvas.clientWidth || window.innerWidth || 1280;
  const height = canvas.clientHeight || window.innerHeight || 720;
  renderer.setSize(width, height, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9cd0ee);
  scene.fog = new THREE.Fog(0xb9daee, 75, 175);

  // Studio / Sky Environment IBL for metallic weapons, optics, and catwalk steel
  let envRT: THREE.WebGLRenderTarget | null = null;
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    envRT = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    roomEnv.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.isMesh) {
        m.geometry?.dispose();
        if (Array.isArray(m.material)) {
          m.material.forEach((mat) => mat.dispose());
        } else {
          m.material?.dispose();
        }
      }
    });
    pmrem.dispose();
  } catch {
    // Fallback safely if PMREM unavailable
  }

  // Lightweight Procedural Mediterranean Sky Dome
  const skyTex = createSkyDomeTexture();
  const skyGeo = new THREE.SphereGeometry(190, 20, 14);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // Warm golden-hour key sunlight + cool sky/warm terracotta bounce HemisphereLight
  const hemiLight = new THREE.HemisphereLight(0x9cd2fa, 0x7a6552, 0.56);
  scene.add(hemiLight);

  const sunPhi = THREE.MathUtils.degToRad(90 - 38);
  const sunTheta = THREE.MathUtils.degToRad(58);
  const sunPos = new THREE.Vector3().setFromSphericalCoords(1, sunPhi, sunTheta);
  const sunLight = new THREE.DirectionalLight(0xffe9c7, 0.96);
  sunLight.position.set(sunPos.x * 60, sunPos.y * 60, sunPos.z * 60);
  if (!isSoftwareGl) {
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 140;
    sunLight.shadow.camera.left = -38;
    sunLight.shadow.camera.right = 38;
    sunLight.shadow.camera.top = 38;
    sunLight.shadow.camera.bottom = -38;
    sunLight.shadow.bias = -0.0005;
  }
  scene.add(sunLight);

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
      envRT?.dispose();
      skyTex.dispose();
      sky.geometry.dispose();
      skyMat.dispose();
      renderer.dispose();
    },
  };
}
