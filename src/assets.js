import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skinClone } from 'three/addons/utils/SkeletonUtils.js';

const MANIFEST = {
  player: 'player.glb',
  shark: 'mob_shark.glb',
  deepone: 'mob_deepone.glb',
  wave: 'mob_wave.glb',

  coral: 'coral.glb',
  starfishA: 'starfish_blue.glb',
  starfishB: 'starfish_orange.glb',
  conch: 'conch.glb',
  conchB: 'conch_purple.glb',
  boulderM: 'boulder_med.glb',
  boulderL: 'boulder_large.glb',
  wreckCannon: 'wreck_cannon.glb',
  wreckMast: 'wreck_mast.glb',
  wreckHull: 'wreck_hull.glb',
  wreckChest: 'wreck_chest.glb',
  megalodon: 'megalodon.glb',
  fishbone: 'fishbone.glb',

  shipwright: 'b_shipwright.glb',
  well: 'b_well.glb',
  bank: 'b_bank.glb',
  palm: 'palm.glb',

  chest: 'chest_rare.glb',
  chestB: 'chest_epic.glb',
  coin: 'coin.glb',
  goldbag: 'goldbag.glb',
  mysterybag: 'mysterybag.glb',
  barrel: 'barrel.glb',
  crate: 'crate_brown.glb',
  crateB: 'crate_red.glb',
  crateC: 'crate_blue.glb',
};

export const models = {};
export const clips = {};

/** Voxel props are authored at ~15 units per tile; normalise them here. */
const PROP_SCALE = 1 / 15;

/**
 * 금붙이는 자기 색으로 연하게 발광시킨다. 블룸 문턱이 여기서 물어서
 * 멀리서도 "저기 비싼 게 있다"가 읽힌다. 너무 올리면 복셀 면이 평평해진다.
 */
const GLOW = { coin: 0.34, goldbag: 0.26, mysterybag: 0.3 };

function prep(gltf, key) {
  const root = gltf.scene;
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    // 받기도 해야 건물 처마와 난파선 갑판이 서로에게 그림자를 드리고,
    // 복셀 덩어리가 통째로 균일하게 타는 대신 입체로 읽힌다
    o.receiveShadow = true;
    o.frustumCulled = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      // Voxel palette textures must stay crisp, never blurred.
      for (const slot of ['map', 'emissiveMap']) {
        if (m[slot]) {
          m[slot].magFilter = THREE.NearestFilter;
          m[slot].minFilter = THREE.LinearMipmapLinearFilter;
          m[slot].anisotropy = 4;
        }
      }
      m.metalness = 0;
      m.roughness = 1;
      // bare voxel rock reads as dropped paper on tan sand, damp it down
      if (key.startsWith('boulder')) m.color.setHex(0x8d8a72);
      if (m.emissive && m.emissiveMap) m.emissiveIntensity = 0.35;
      else if (m.emissive && GLOW[key]) { m.emissive.copy(m.color); m.emissiveIntensity = GLOW[key]; }
    }
  });
  models[key] = root;
  clips[key] = gltf.animations || [];
}

export async function loadAll(onProgress) {
  const loader = new GLTFLoader().setPath('./assets/models/');
  const entries = Object.entries(MANIFEST);
  let done = 0;
  await Promise.all(entries.map(async ([key, file]) => {
    const gltf = await loader.loadAsync(file);
    prep(gltf, key);
    done++;
    onProgress?.(done / entries.length, key);
  }));
}

/** Static prop instance, normalised to tile scale and grounded at y=0. */
export function prop(key, { scale = 1, grounded = true } = {}) {
  const src = models[key];
  if (!src) throw new Error('missing model ' + key);
  const g = src.clone(true);
  g.scale.setScalar(PROP_SCALE * scale);
  if (grounded) {
    const box = new THREE.Box3().setFromObject(g);
    g.position.y = -box.min.y;
  }
  return g;
}

/** Skinned instance sharing geometry but with its own skeleton. */
export function rig(key) {
  const g = skinClone(models[key]);
  const mixer = new THREE.AnimationMixer(g);
  const actions = {};
  for (const c of clips[key]) actions[c.name] = mixer.clipAction(c);
  return { object: g, mixer, actions, clips: clips[key] };
}

/** Bounding size of a prop at tile scale, useful for placement. */
export function propSize(key, scale = 1) {
  const box = new THREE.Box3().setFromObject(models[key]);
  return box.getSize(new THREE.Vector3()).multiplyScalar(PROP_SCALE * scale);
}
