import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Inverted-hull outline. Voxel props read fine against sand, but the character
 * does not: brass and wet sand sit at almost the same value. A dark hull makes
 * him pop from any distance without touching the art.
 *
 * Skinned meshes reuse the original skeleton, so the outline follows the
 * animation for free.
 *
 * 복셀 모델은 큐브 모서리마다 정점이 쪼개져 있고 법선이 축 방향으로 갈라진다.
 * 원본 법선으로 밀면 모서리에서 껍질이 찢어져 검은 조각이 삐져나온다.
 * 그래서 껍질 전용으로 위치가 같은 정점을 합쳐 평균 법선을 새로 구한 지오메트리를
 * 만든다. 스킨 가중치가 다른 정점은 합쳐지지 않으므로 애니메이션은 그대로다.
 */

const hullGeoCache = new WeakMap();

function hullGeometry(src) {
  const cached = hullGeoCache.get(src);
  if (cached) return cached;

  const g = src.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'skinIndex' && name !== 'skinWeight') {
      g.deleteAttribute(name);
    }
  }
  const merged = mergeVertices(g, 1e-4);
  merged.computeVertexNormals();
  hullGeoCache.set(src, merged);
  return merged;
}
const vert = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
uniform float uThick;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  transformed += normalize(objectNormal) * uThick;
  #include <project_vertex>
}`;

const frag = /* glsl */`
uniform vec3 uColor;
void main() { gl_FragColor = vec4(uColor, 1.0); }`;

// 같은 색·두께면 머티리얼을 재사용한다. 몹이 스폰될 때마다 새로 만들면
// 그때마다 셰이더가 새로 컴파일되면서 프레임이 끊긴다.
const matCache = new Map();

function makeMaterial(color, thickness) {
  const key = color + '|' + thickness;
  const hit = matCache.get(key);
  if (hit) return hit;
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uThick: { value: thickness },
      uColor: { value: new THREE.Color(color) },
    },
    side: THREE.BackSide,
  });
  matCache.set(key, mat);
  return mat;
}

export function addOutline(root, { thickness = 0.02, color = 0x17242e } = {}) {
  const mat = makeMaterial(color, thickness);
  const created = [];
  root.traverse(o => {
    if (!o.isMesh || o.userData.isOutline) return;
    created.push(o);
  });
  for (const src of created) {
    let hull;
    const geo = hullGeometry(src.geometry);
    if (src.isSkinnedMesh) {
      hull = new THREE.SkinnedMesh(geo, mat);
      hull.bindMode = src.bindMode;
      hull.bind(src.skeleton, src.bindMatrix);
    } else {
      hull = new THREE.Mesh(geo, mat);
    }
    hull.userData.isOutline = true;
    hull.castShadow = false;
    hull.receiveShadow = false;
    hull.frustumCulled = false;
    hull.renderOrder = (src.renderOrder || 0) - 1;
    hull.position.copy(src.position);
    hull.quaternion.copy(src.quaternion);
    hull.scale.copy(src.scale);
    src.parent.add(hull);
  }
  return mat;
}
