import * as THREE from 'three';
import { scene } from './gfx.js';

/* ---------------------------------- particles -------------------------------------- */

const MAX = 700;
const pos = new Float32Array(MAX * 3);
const col = new Float32Array(MAX * 3);
const siz = new Float32Array(MAX);
const vel = new Float32Array(MAX * 3);
const life = new Float32Array(MAX);
const maxLife = new Float32Array(MAX);
const grav = new Float32Array(MAX);
let cursor = 0;

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
geo.setAttribute('size', new THREE.BufferAttribute(siz, 1));

const mat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uScale: { value: 500 } },
  vertexShader: `
    attribute float size; varying vec3 vC;
    uniform float uScale;
    void main(){
      vC = color;
      vec4 mv = modelViewMatrix * vec4(position,1.0);
      gl_PointSize = size * uScale / max(1.0, -mv.z);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    varying vec3 vC;
    void main(){
      vec2 d = gl_PointCoord - 0.5;
      float a = smoothstep(0.5, 0.16, length(d));
      if (a <= 0.01) discard;
      gl_FragColor = vec4(vC, a);
    }`,
  vertexColors: true,
});

const points = new THREE.Points(geo, mat);
points.frustumCulled = false;
points.renderOrder = 8;
scene.add(points);

const _c = new THREE.Color();

export function burst(x, y, z, count, opts = {}) {
  const {
    color = 0xffffff, spread = 3, up = 4, size = 0.34,
    lifeMin = 0.35, lifeMax = 0.8, gravity = -11, colorJitter = 0.12,
  } = opts;
  for (let i = 0; i < count; i++) {
    const k = cursor = (cursor + 1) % MAX;
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    const a = Math.random() * Math.PI * 2;
    const s = Math.random() * spread;
    vel[k * 3] = Math.cos(a) * s;
    vel[k * 3 + 1] = up * (0.45 + Math.random());
    vel[k * 3 + 2] = Math.sin(a) * s;
    _c.set(color).offsetHSL(0, 0, (Math.random() - 0.5) * colorJitter);
    col[k * 3] = _c.r; col[k * 3 + 1] = _c.g; col[k * 3 + 2] = _c.b;
    siz[k] = size * (0.6 + Math.random() * 0.8);
    maxLife[k] = life[k] = lifeMin + Math.random() * (lifeMax - lifeMin);
    grav[k] = gravity;
  }
}

export function updateParticles(dt) {
  for (let k = 0; k < MAX; k++) {
    if (life[k] <= 0) { if (siz[k] !== 0) siz[k] = 0; continue; }
    life[k] -= dt;
    if (life[k] <= 0) { siz[k] = 0; continue; }
    vel[k * 3 + 1] += grav[k] * dt;
    pos[k * 3] += vel[k * 3] * dt;
    pos[k * 3 + 1] += vel[k * 3 + 1] * dt;
    pos[k * 3 + 2] += vel[k * 3 + 2] * dt;
    const t = life[k] / maxLife[k];
    siz[k] = Math.abs(siz[k]) * (t > 0.4 ? 1 : 0.94);
  }
  geo.attributes.position.needsUpdate = true;
  geo.attributes.color.needsUpdate = true;
  geo.attributes.size.needsUpdate = true;
}

/* -------------------------------- floating numbers --------------------------------- */

const texCache = new Map();
function textTexture(text, color) {
  const key = text + '|' + color;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.font = '900 62px "Pretendard","Apple SD Gothic Neo",system-ui,sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 12; g.strokeStyle = 'rgba(8,20,28,.92)';
  g.strokeText(text, 128, 50);
  g.fillStyle = color;
  g.fillText(text, 128, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

const popups = [];

export function popup(text, x, y, z, color = '#ffd24d', scale = 1) {
  const m = new THREE.SpriteMaterial({
    map: textTexture(text, color), transparent: true, depthTest: false, depthWrite: false,
  });
  const s = new THREE.Sprite(m);
  s.position.set(x, y, z);
  s.scale.set(3.2 * scale, 1.2 * scale, 1);
  s.renderOrder = 20;
  scene.add(s);
  popups.push({ s, t: 0, life: 1.15, vy: 2.6, k: scale });
}

export function updatePopups(dt) {
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.t += dt;
    p.s.position.y += p.vy * dt;
    p.vy *= Math.pow(0.16, dt);
    const k = p.t / p.life;
    p.s.material.opacity = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4);
    const pop = (k < 0.14 ? 0.7 + (k / 0.14) * 0.45 : 1.05) * p.k;
    p.s.scale.set(3.2 * pop, 1.2 * pop, 1);
    if (p.t >= p.life) { scene.remove(p.s); p.s.material.dispose(); popups.splice(i, 1); }
  }
}

/* ------------------------------- ground ripple rings ------------------------------- */

const rings = [];
const ringGeo = new THREE.RingGeometry(0.5, 0.62, 32).rotateX(-Math.PI / 2);

export function ripple(x, y, z, color = 0xffffff, grow = 7, life = 0.6) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(ringGeo, m);
  mesh.position.set(x, y + 0.06, z);
  mesh.renderOrder = 7;
  scene.add(mesh);
  rings.push({ mesh, t: 0, life, grow });
}

export function updateRipples(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.t += dt;
    const k = r.t / r.life;
    const s = 0.4 + k * r.grow;
    r.mesh.scale.set(s, 1, s);
    r.mesh.material.opacity = 0.85 * (1 - k);
    if (k >= 1) { scene.remove(r.mesh); r.mesh.material.dispose(); rings.splice(i, 1); }
  }
}

export function updateFx(dt) {
  updateParticles(dt);
  updatePopups(dt);
  updateRipples(dt);
}
