import * as THREE from 'three';
import { scene } from './gfx.js';
import { prop } from './assets.js';
import {
  R_VILLAGE, R_SHORE, R_MAX, R_OCEAN, MAX_DEPTH, LAND_Y, terrainHeight,
} from './config.js';

/* ---------------- deterministic rng so the island is the same every run --------------- */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function fbm(x, z) {
  return (
    Math.sin(x * 0.21) * Math.cos(z * 0.19) * 0.55 +
    Math.sin(x * 0.53 + 1.7) * Math.cos(z * 0.47 - 0.9) * 0.28 +
    Math.sin(x * 1.13 - 2.1) * Math.cos(z * 1.07 + 0.4) * 0.12
  );
}

/** Small bumps on top of the analytic slope. Kept tiny so gameplay stays predictable. */
export function bump(x, z) {
  const r = Math.hypot(x, z);
  if (r < R_VILLAGE - 1) return 0;
  const fade = Math.min(1, (r - R_VILLAGE + 1) / 6);
  const ripple = Math.sin(r * 1.9 + fbm(x * 0.6, z * 0.6) * 4) * 0.12;
  return (fbm(x, z) * 0.72 + ripple) * fade;
}

export function groundY(x, z) {
  return terrainHeight(Math.hypot(x, z)) + bump(x, z);
}

/* ----------------------------------- terrain --------------------------------------- */

const SAND_HI = new THREE.Color(0xe0c894);
const SAND_LO = new THREE.Color(0xbfa375);
const WET = new THREE.Color(0xbda67c);
const BED = new THREE.Color(0x9c8659);
const DEEP = new THREE.Color(0x38596e);
const ALGAE = new THREE.Color(0x3f5c34);
const GRASS = new THREE.Color(0x7ba055);

const _hsl = { h: 0, s: 0, l: 0 };

function terrainColor(r, x, z, out) {
  // fbm is a product of sin(x)*cos(z), which lays down an axis-aligned plaid.
  // On the flat village that reads as a checkerboard, so mix in a rotated copy.
  const n = (fbm(x * 1.6, z * 1.6) + fbm(z * 1.1 - x * 0.7, x * 1.1 + z * 0.7)) * 0.5;
  const fine = fbm(x * 4.3 + 11, z * 4.1 - 7);

  // wobble the grass line so the village doesn't read as a drawn circle
  const edge = R_VILLAGE - 3.5 + fbm(x * 0.42, z * 0.39) * 3.4;
  if (r < edge) {
    // flat ground has no shading variation, so heavy colour noise reads as a checkerboard
    out.copy(GRASS).lerp(SAND_HI, 0.24 + Math.max(0, (r / edge - 0.55)) * 0.7);
  } else {
    // beach -> wet sand -> seabed, blended so no hard rings show
    // The plateau and the beach are dead flat, so they get no shading variation
    // to hide per-face colour noise: any grain there reads as a checkerboard.
    const detail = Math.min(1, Math.max(0, (r - R_SHORE) / 7));
    const beach = 1 - Math.min(1, Math.max(0, (r - edge) / 14));
    const t = Math.min(1, Math.max(0, (r - R_SHORE) / (R_MAX - R_SHORE)));
    if (t < 0.42) out.copy(WET).lerp(BED, t / 0.42);
    else out.copy(BED).lerp(DEEP, (t - 0.42) / 0.58);
    if (beach > 0) {
      const sand = SAND_HI.clone().lerp(SAND_LO, 0.3 + n * 0.18 * detail);
      out.lerp(sand, beach);
    }
    if (r > edge) {
      // algae patches so the flats aren't one flat colour
      // weed grows on the shelf but thins out where the sea never fully drains
      const patch = fbm(x * 0.34 - 5, z * 0.31 + 3);
      const weedFade = 1 - Math.min(1, Math.max(0, (t - 0.58) / 0.34));
      if (patch > 0.3) out.lerp(ALGAE, Math.min(0.45, (patch - 0.3) * 1.4) * (1 - beach) * weedFade);
      // bathymetric banding: old waterlines left by previous tides.
      // Doubles as a depth readout you can see at a glance.
      const depth = -terrainHeight(r);
      const band = Math.abs(((depth * 0.62) % 1) - 0.5) * 2;
      out.offsetHSL(0, 0, (band - 0.5) * 0.11 * detail);
      out.offsetHSL(0, 0, (n * 0.115 + fine * 0.075) * detail);
      // ribbed sand: rings of damp and dry left by the draining water
      const streak = Math.sin(r * 3.1 + fbm(x * 0.9, z * 0.9) * 6.5);
      out.offsetHSL(0, 0.02, streak * 0.09 * detail);
      // stacked offsets can bottom out near black in the deep, which reads as a
      // hole in the seabed rather than depth. Keep a floor.
      out.getHSL(_hsl);
      if (_hsl.l < 0.2) out.setHSL(_hsl.h, _hsl.s, 0.2);
    }
  }
  return out;
}

export function buildTerrain() {
  const SPAN = (R_MAX + 26) * 2;
  const SEG = 168;
  const geo = new THREE.PlaneGeometry(SPAN, SPAN, SEG, SEG);
  geo.rotateX(-Math.PI / 2);

  const grid = geo.attributes.position;
  const jitter = rng(20260808);
  for (let i = 0; i < grid.count; i++) {
    let x = grid.getX(i), z = grid.getZ(i);
    // break up the grid so it doesn't read as a checkerboard
    if (Math.hypot(x, z) > R_VILLAGE) {
      const j = (SPAN / SEG) * 0.34;
      x += (jitter() - 0.5) * j;
      z += (jitter() - 0.5) * j;
      grid.setX(i, x); grid.setZ(i, z);
    }
    grid.setY(i, groundY(x, z));
  }

  // One colour per triangle, not per vertex. Smooth vertex gradients over
  // 0.9-unit triangles read as blurred mush at this camera distance; faceted
  // colour reads as low-poly seabed and shows every ridge.
  const flat = geo.toNonIndexed();
  geo.dispose();
  const pos = flat.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const grain = rng(4242);

  for (let f = 0; f < pos.count; f += 3) {
    const x = (pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2)) / 3;
    const z = (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3;
    const r = Math.hypot(x, z);
    terrainColor(r, x, z, c);
    const detail = Math.min(1, Math.max(0, (r - R_SHORE) / 7));
    c.offsetHSL(0, 0, (grain() - 0.5) * 0.03 * detail);
    for (let k = 0; k < 3; k++) {
      colors[(f + k) * 3] = c.r; colors[(f + k) * 3 + 1] = c.g; colors[(f + k) * 3 + 2] = c.b;
    }
  }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  flat.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mesh = new THREE.Mesh(flat, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = -1;
  scene.add(mesh);
  return mesh;
}

/* ------------------------------------ water ---------------------------------------- */

const waterVert = /* glsl */`
uniform float uTime;
varying vec3 vWorld;
varying float vWave;
void main(){
  vec4 wp = modelMatrix * vec4(position,1.0);
  float d = length(wp.xz);
  float a = sin(wp.x*0.16 + uTime*1.05) * 0.30
          + sin(wp.z*0.21 - uTime*0.86) * 0.24
          + sin((wp.x+wp.z)*0.09 + uTime*1.6) * 0.16;
  // calmer close to the middle of the bay so the shoreline reads cleanly
  a *= smoothstep(6.0, 34.0, d) * 0.75 + 0.25;
  wp.y += a;
  vWave = a;
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const waterFrag = /* glsl */`
precision highp float;
uniform float uTime, uTideR, uWaterY;
uniform vec3 uShallow, uDeep, uFoam, uFog;
uniform float uFogNear, uFogFar;
varying vec3 vWorld;
varying float vWave;

const float R_VILLAGE = ${R_VILLAGE.toFixed(1)};
const float R_MAX = ${R_MAX.toFixed(1)};
const float MAX_DEPTH = ${MAX_DEPTH.toFixed(1)};
const float LAND_Y = ${LAND_Y.toFixed(2)};

float terrainH(float r){
  if (r <= R_VILLAGE) return LAND_Y;
  if (r >= R_MAX) return -MAX_DEPTH - (r-R_MAX)*0.35;
  float t = (r - R_VILLAGE) / (R_MAX - R_VILLAGE);
  return LAND_Y - (LAND_Y + MAX_DEPTH) * pow(t, 1.35);
}
float hash(vec2 p){ return fract(sin(dot(p,vec2(41.7,289.1)))*43758.5453); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
             mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}

void main(){
  float r = length(vWorld.xz);
  float depth = uWaterY - terrainH(r);
  if (depth <= 0.02) discard;

  // darken by real depth, but also by how far out we are, so open sea reads
  // as open sea even where the shelf stays shallow
  float dn = clamp(max(depth / 6.0, (r - uTideR) / 22.0), 0.0, 1.0);
  vec3 col = mix(uShallow, uDeep, pow(dn, 0.7));

  // sun glitter
  float gl = pow(max(vWave,0.0), 2.0);
  col += vec3(0.16,0.21,0.26) * gl;

  // banded ripples running with the tide
  float band = sin(r*1.5 - uTime*2.4 + noise(vWorld.xz*0.24)*5.0);
  col += vec3(0.05,0.07,0.07) * smoothstep(0.55,1.0,band) * (1.0-dn);

  // foam collar sitting exactly on the waterline
  float edge = r - uTideR;
  float n = noise(vec2(atan(vWorld.z,vWorld.x)*14.0, uTime*0.9));
  float foam = smoothstep(1.9, 0.0, abs(edge + (n-0.5)*1.5));
  foam = max(foam, smoothstep(0.34, 0.0, depth) * 0.75);
  col = mix(col, uFoam, foam*0.88);

  float alpha = mix(0.34, 0.985, pow(dn,0.5));
  alpha = max(alpha, foam*0.95);

  float fogF = smoothstep(uFogNear, uFogFar, length(vWorld - cameraPosition));
  col = mix(col, uFog, fogF);
  gl_FragColor = vec4(col, alpha);
}`;

export function buildWater() {
  const geo = new THREE.PlaneGeometry(R_OCEAN * 2, R_OCEAN * 2, 200, 200);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader: waterVert,
    fragmentShader: waterFrag,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uTideR: { value: R_MAX + 6 },
      uWaterY: { value: terrainHeight(R_MAX + 6) },
      uShallow: { value: new THREE.Color(0x74d6cf) },
      uDeep: { value: new THREE.Color(0x175c86) },
      uFoam: { value: new THREE.Color(0xf2fbff) },
      uFog: { value: new THREE.Color(0x9fd8e8) },
      uFogNear: { value: 46 },
      uFogFar: { value: 155 },
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 5;
  scene.add(mesh);
  return mesh;
}

/* ------------------------------- static decoration ---------------------------------- */

function place(obj, x, z, { yaw = 0, y = 0, scale = 1 } = {}) {
  obj.position.set(x, groundY(x, z) + y, z);
  obj.rotation.y = yaw;
  if (scale !== 1) obj.scale.multiplyScalar(scale);
  scene.add(obj);
  return obj;
}

/** Village on the plateau: the safe zone the player is running back to. */
export function buildVillage() {
  const group = [];
  group.push(place(prop('shipwright', { scale: 0.62 }), -6.2, -4.4, { yaw: 0.5 }));
  group.push(place(prop('bank', { scale: 0.52 }), 6.6, -3.4, { yaw: -0.6 }));
  group.push(place(prop('well', { scale: 0.5 }), 0.4, 4.6, { yaw: 0.2 }));

  const r = rng(77123);
  const palms = [
    [-8.6, 4.3], [8.4, 5.0], [-3.4, 8.0], [4.6, 7.7],
    [-9.4, -2.5], [9.5, 1.0], [0.5, -8.0], [-6.7, -7.0], [7.0, -6.6],
  ];
  for (const [x, z] of palms) {
    group.push(place(prop('palm', { scale: 0.9 + r() * 0.4 }), x, z, { yaw: r() * 6.28 }));
  }
  const crates = ['crate', 'crateB', 'crateC'];
  for (let i = 0; i < 12; i++) {
    const a = r() * 6.28, d = 4.5 + r() * 5;
    const k = crates[(r() * 3) | 0];
    group.push(place(prop(k, { scale: 0.8 + r() * 0.5 }), Math.cos(a) * d, Math.sin(a) * d, { yaw: r() * 6.28 }));
  }
  for (let i = 0; i < 7; i++) {
    const a = r() * 6.28, d = 5 + r() * 4.5;
    group.push(place(prop('barrel', { scale: 0.85 }), Math.cos(a) * d, Math.sin(a) * d, { yaw: r() * 6.28 }));
  }
  return group;
}

/**
 * The exposed seabed. Static across tides on purpose: players should learn
 * the landmarks and use them to navigate when the water is coming in.
 */
export function buildSeabed() {
  const r = rng(31337);
  const out = [];
  const band = t => R_SHORE + 2 + t * (R_MAX - R_SHORE - 3);

  const scatter = (key, count, lo, hi, sMin, sMax, ry = 0) => {
    for (let i = 0; i < count; i++) {
      const t = lo + r() * (hi - lo);
      const rad = band(t);
      const a = r() * Math.PI * 2;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      out.push(place(prop(key, { scale: sMin + r() * (sMax - sMin) }), x, z, { yaw: r() * 6.28, y: ry }));
    }
  };

  // beach strip between the village and the slope: driftwood, shells, small rocks
  const beachRing = (key, count, sMin, sMax, ry = 0) => {
    for (let i = 0; i < count; i++) {
      const rad = R_VILLAGE - 1 + r() * 6.5;
      const a = r() * Math.PI * 2;
      out.push(place(prop(key, { scale: sMin + r() * (sMax - sMin) }),
        Math.cos(a) * rad, Math.sin(a) * rad, { yaw: r() * 6.28, y: ry }));
    }
  };
  beachRing('conch', 16, 0.3, 0.55);
  beachRing('starfishA', 14, 0.28, 0.45, 0.02);
  beachRing('starfishB', 12, 0.28, 0.45, 0.02);
  beachRing('boulderM', 18, 0.4, 0.95);
  beachRing('wreckMast', 3, 0.7, 1.0);
  beachRing('fishbone', 6, 0.4, 0.7, 0.02);

  scatter('boulderM', 62, 0.1, 1.0, 0.45, 1.0);
  scatter('boulderL', 36, 0.35, 1.0, 0.55, 1.05);
  scatter('starfishA', 56, 0.0, 0.62, 0.3, 0.5, 0.02);
  scatter('starfishB', 52, 0.0, 0.72, 0.3, 0.5, 0.02);
  scatter('conch', 44, 0.0, 0.55, 0.35, 0.6);
  scatter('conchB', 38, 0.1, 0.65, 0.28, 0.45);
  scatter('fishbone', 30, 0.3, 1.0, 0.4, 0.68, 0.02);
  scatter('coral', 28, 0.42, 1.0, 0.24, 0.42, -0.75);

  // landmark wrecks in the deep: these double as relic markers
  const wrecks = [
    ['wreckHull', 0.74, 0.4], ['wreckMast', 0.86, 2.1], ['wreckCannon', 0.68, 3.7],
    ['wreckChest', 0.92, 5.0], ['megalodon', 0.88, 0.9], ['wreckHull', 0.62, 4.3],
    ['wreckMast', 0.95, 2.9], ['wreckCannon', 0.9, 5.6],
    ['wreckHull', 0.88, 1.5], ['wreckChest', 0.79, 3.1], ['megalodon', 0.96, 4.6],
    ['wreckCannon', 0.83, 0.2], ['wreckMast', 0.71, 5.9], ['wreckChest', 0.99, 2.4],
  ];
  for (const [key, t, a] of wrecks) {
    const rad = band(t);
    out.push(place(prop(key, { scale: key === 'megalodon' ? 1.1 : 1.3 }),
      Math.cos(a) * rad, Math.sin(a) * rad, { yaw: a + 1.2 }));
  }

  // half-drowned islets beyond the shelf: gives the horizon an edge to read against
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2;
    const rad = R_MAX + 7 + r() * 26;
    const key = r() < 0.6 ? 'boulderL' : 'boulderM';
    const o = prop(key, { scale: 2.4 + r() * 4.2 });
    o.position.set(Math.cos(a) * rad, terrainHeight(rad) + 1.4 + r() * 3.4, Math.sin(a) * rad);
    o.rotation.y = r() * 6.28;
    scene.add(o);
    out.push(o);
  }
  return out;
}
