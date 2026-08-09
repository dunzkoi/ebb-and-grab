import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GRADES } from './config.js';

// 터치 기기면 가상 스틱을 달고, 픽셀도 그림자도 반만 준다.
// 블룸까지 데스크톱 설정 그대로 얹으면 그대로 프레임이 무너진다.
export const IS_TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

export const scene = new THREE.Scene();
scene.background = new THREE.Color();
scene.fog = new THREE.Fog(0xffffff);   // 색과 거리는 grade가 매 프레임 덮는다

export const camera = new THREE.PerspectiveCamera(34, 1, 0.6, 700);

export const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('gl'),
  antialias: false,   // 컴포저 렌더타깃에서 MSAA로 처리한다
  powerPreference: 'high-performance',
});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

/* --------------------------------- light rig ---------------------------------------
 * 키(태양) · 하늘땅 앰비언트 · 모래 반사 필 · 역광 림 · 인물 램프.
 * 림은 카메라 반대편에서 차갑게 쏴서 복셀 실루엣이 젖은 모래에 묻히지 않게 한다.
 * 램프는 플레이어를 따라다니는 작은 온점광. 밀물에 하늘이 식어도 주인공은 살려둔다.
 * ----------------------------------------------------------------------------------- */

const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1.15);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(IS_TOUCH ? 1024 : 2048);
sun.shadow.bias = -0.0012;
sun.shadow.normalBias = 0.05;
const sc = sun.shadow.camera;
sc.near = 1; sc.far = 190;
sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38;
scene.add(sun, sun.target);

const fill = new THREE.DirectionalLight(0xffffff, 0.32);
fill.position.set(-28, 14, -22);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xffffff, 0.55);
rim.position.set(-14, 8, -34);
scene.add(rim);

// 반경은 좁게. 넘으면 화면 전체가 이 램프 색으로 물들어 페이즈 그레이드가 지워진다
const lamp = new THREE.PointLight(0xffffff, 0.4, 12, 2);
scene.add(lamp);

/* ------------------------------- phase colour grade --------------------------------
 * 썰물은 한낮, 밀물은 해가 떨어지며 식고, 정산은 노을.
 * 조명·안개·노출·블룸·물빛을 한 덩어리로 묶어 몇 초에 걸쳐 넘긴다.
 * ----------------------------------------------------------------------------------- */

const COLORS = ['sky', 'sun', 'ambTop', 'ambBot', 'fill', 'rim', 'lamp', 'shallow', 'deep', 'foam'];
const NUMS = ['fogNear', 'fogFar', 'sunI', 'ambI', 'fillI', 'rimI', 'lampI', 'exposure', 'bloom'];

function makeGrade(src) {
  const g = { dir: new THREE.Vector3(...src.dir) };
  for (const k of COLORS) g[k] = new THREE.Color(src[k]);
  for (const k of NUMS) g[k] = src[k];
  return g;
}

const cur = makeGrade(GRADES.ebb);
let want = makeGrade(GRADES.ebb);
let rate = 1 / 2.4;

/** 조수 단계가 바뀌면 조명 전체를 몇 초에 걸쳐 갈아탄다. */
export function setLightPhase(name, seconds = 2.4) {
  want = makeGrade(GRADES[name]);
  rate = 1 / seconds;
}

let water = null;
/** 물 셰이더도 같은 grade를 먹는다. world.js가 물을 만들면서 등록한다. */
export function bindWater(uniforms) { water = uniforms; }

export function updateLighting(dt) {
  const k = Math.min(1, dt * rate * 2.6);
  for (const key of COLORS) cur[key].lerp(want[key], k);
  for (const key of NUMS) cur[key] += (want[key] - cur[key]) * k;
  cur.dir.lerp(want.dir, k);

  scene.background.copy(cur.sky);
  scene.fog.color.copy(cur.sky);
  scene.fog.near = cur.fogNear;
  scene.fog.far = cur.fogFar;

  sun.color.copy(cur.sun); sun.intensity = cur.sunI;
  hemi.color.copy(cur.ambTop); hemi.groundColor.copy(cur.ambBot); hemi.intensity = cur.ambI;
  fill.color.copy(cur.fill); fill.intensity = cur.fillI;
  rim.color.copy(cur.rim); rim.intensity = cur.rimI;
  lamp.color.copy(cur.lamp); lamp.intensity = cur.lampI;

  renderer.toneMappingExposure = cur.exposure;
  bloom.strength = cur.bloom;

  if (water) {
    water.uShallow.value.copy(cur.shallow);
    water.uDeep.value.copy(cur.deep);
    water.uFoam.value.copy(cur.foam);
    water.uFog.value.copy(cur.sky);
    water.uFogNear.value = cur.fogNear * 0.8;
    water.uFogFar.value = cur.fogFar * 0.84;
    water.uSunDir.value.copy(cur.dir).normalize();
    water.uSunCol.value.copy(cur.sun).multiplyScalar(cur.sunI * 0.42);
  }
}

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
  sun.position.copy(camTarget).add(cur.dir);
  lamp.position.set(focus.x, focus.y + 2.3, focus.z);
}

/* ------------------------------- post processing ----------------------------------- */

export const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, {
  type: THREE.HalfFloatType,
  samples: IS_TOUCH ? 2 : 4,
}));
composer.addPass(new RenderPass(scene, camera));

// 금화·유물의 하이라이트, 우물의 룬, 파도 마루의 햇빛 반사만 물게 잡은 임계값.
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.34, 0.7, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());

export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.6 : 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(dpr);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
updateLighting(999);   // 첫 프레임부터 grade가 완전히 적용된 상태로 시작한다

window.__gfx = { renderer, scene, camera };
