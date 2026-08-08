import * as THREE from 'three';
import { PALETTE } from './config.js';

export const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.sky, PALETTE.fogNear, PALETTE.fogFar);

export const camera = new THREE.PerspectiveCamera(34, 1, 0.6, 700);

export const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('gl'),
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setClearColor(PALETTE.sky);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;

const hemi = new THREE.HemisphereLight(PALETTE.ambTop, PALETTE.ambBot, 1.15);
scene.add(hemi);

export const sun = new THREE.DirectionalLight(PALETTE.sunColor, 2.2);
sun.position.set(34, 52, 26);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0012;
sun.shadow.normalBias = 0.05;
const sc = sun.shadow.camera;
sc.near = 1; sc.far = 190;
sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34;
scene.add(sun, sun.target);

// Warm bounce from the sand so the shaded side of voxels doesn't go muddy.
const bounce = new THREE.DirectionalLight(0xffd9a0, 0.32);
bounce.position.set(-28, 14, -22);
scene.add(bounce);

/* ---------- camera rig: fixed quarter view, smooth follow ---------- */

const CAM_OFF = new THREE.Vector3(0, 10.3, 11.4);
const camTarget = new THREE.Vector3();
const camWant = new THREE.Vector3();
let shakeAmp = 0, shakeT = 0, zoom = 1, zoomWant = 1;

export function shake(amount) { shakeAmp = Math.min(1.6, shakeAmp + amount); }
export function setZoom(z) { zoomWant = z; }

export function updateCamera(focus, dt, lookAhead) {
  zoom += (zoomWant - zoom) * Math.min(1, dt * 2.2);

  camTarget.lerp(focus, Math.min(1, dt * 6.5));
  camWant.copy(CAM_OFF).multiplyScalar(zoom).add(camTarget);
  if (lookAhead) camWant.addScaledVector(lookAhead, 1.6);

  camera.position.lerp(camWant, Math.min(1, dt * 5.2));

  shakeT += dt * 42;
  shakeAmp *= Math.pow(0.02, dt);
  if (shakeAmp > 0.002) {
    camera.position.x += Math.sin(shakeT) * shakeAmp * 0.55;
    camera.position.y += Math.sin(shakeT * 1.7 + 1.3) * shakeAmp * 0.4;
  }
  camera.lookAt(camTarget.x, camTarget.y + 1.4, camTarget.z);

  sun.target.position.copy(camTarget);
  sun.position.copy(camTarget).add(new THREE.Vector3(34, 52, 26));
}

export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
