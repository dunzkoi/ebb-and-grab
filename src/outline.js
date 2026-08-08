import * as THREE from 'three';

/**
 * Inverted-hull outline. Voxel props read fine against sand, but the character
 * does not: brass and wet sand sit at almost the same value. A dark hull makes
 * him pop from any distance without touching the art.
 *
 * Skinned meshes reuse the original skeleton, so the outline follows the
 * animation for free.
 */
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

function makeMaterial(color, thickness) {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uThick: { value: thickness },
      uColor: { value: new THREE.Color(color) },
    },
    side: THREE.BackSide,
  });
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
    if (src.isSkinnedMesh) {
      hull = new THREE.SkinnedMesh(src.geometry, mat);
      hull.bindMode = src.bindMode;
      hull.bind(src.skeleton, src.bindMatrix);
    } else {
      hull = new THREE.Mesh(src.geometry, mat);
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
