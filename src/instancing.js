import * as THREE from 'three';
import { scene } from './gfx.js';

/**
 * 정적 프롭을 InstancedMesh로 합친다.
 *
 * 프롭은 생성자에서 한 번 배치되고 이후 움직이지 않는다. 그런데 모델 하나가
 * 색깔마다 프리미티브로 쪼개져 있어서(은행 한 채가 메시 80개) 프레임마다
 * 드로우콜 수천 개가 나간다. 지오메트리와 머티리얼이 같은 것끼리 묶으면
 * 드로우콜이 열 배 넘게 줄고, 씬 그래프 순회 비용도 같이 줄어든다.
 *
 * 거울 변환 주의: 익스포터가 X를 뒤집어 놔서 프롭 대부분의 월드 행렬
 * 판별식이 음수다. three.js는 오브젝트 단위로 판별식을 보고 front face
 * 방향을 뒤집는데, InstancedMesh는 인스턴스 행렬이 아니라 자기 자신의
 * 행렬만 본다. 그래서 반전을 인스턴스가 아니라 InstancedMesh 본체 쪽에
 * 걸어두고, 인스턴스 행렬은 그 역행렬을 곱해 양수로 만든다.
 */
export function bakeInstances(roots) {
  scene.updateMatrixWorld(true);

  const groups = new Map();
  for (const root of roots) {
    root.traverse(o => {
      if (!o.isMesh || o.isSkinnedMesh) return;
      const material = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!material) return;
      const mirrored = o.matrixWorld.determinant() < 0;
      const key = `${o.geometry.uuid}|${material.uuid}|${mirrored}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          geometry: o.geometry, material, mirrored, matrices: [],
          castShadow: o.castShadow, receiveShadow: o.receiveShadow,
        };
        groups.set(key, g);
      }
      g.matrices.push(o.matrixWorld.clone());
    });
    root.parent?.remove(root);
  }

  const local = new THREE.Matrix4();
  const inverse = new THREE.Matrix4();
  for (const g of groups.values()) {
    const mesh = new THREE.InstancedMesh(g.geometry, g.material, g.matrices.length);
    if (g.mirrored) mesh.scale.x = -1;
    mesh.updateMatrix();
    mesh.updateMatrixWorld(true);
    inverse.copy(mesh.matrixWorld).invert();

    for (let i = 0; i < g.matrices.length; i++) {
      mesh.setMatrixAt(i, local.multiplyMatrices(inverse, g.matrices[i]));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = g.castShadow;
    mesh.receiveShadow = g.receiveShadow;
    mesh.matrixAutoUpdate = false;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }

  return groups.size;
}
