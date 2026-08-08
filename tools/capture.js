/**
 * 그래픽 회귀 검증용 결정론적 캡처.
 * 페이지 안에서 실행한다. 게임 루프를 멈추고, 동적 객체를 숨기고,
 * 물 셰이더 시간을 고정한 뒤 정해진 카메라 자세로만 렌더한다.
 */
window.__capture = async function () {
  const { renderer, scene, camera } = window.__gfx;
  const g = window.__game;

  // 1. 게임 루프 정지: rAF 재등록을 막으면 다음 프레임에 죽는다
  const rafOrig = window.requestAnimationFrame;
  window.requestAnimationFrame = () => 0;
  await new Promise(r => setTimeout(r, 120));

  // 2. 동적 객체 숨김 (플레이어·전리품·몹·파도·파티클)
  const hidden = [];
  const hide = o => { if (o && o.visible) { o.visible = false; hidden.push(o); } };
  hide(g.player?.obj);
  (g.loot || []).forEach(l => hide(l.obj));
  (g.mobs || []).forEach(m => hide(m.obj));
  (g.waves || []).forEach(w => hide(w.obj));
  scene.traverse(o => { if (o.isPoints || o.isSprite) hide(o); });

  // 3. 물 셰이더 고정
  const u = g.water.material.uniforms;
  const saved = { t: u.uTime.value, r: u.uTideR.value, y: u.uWaterY.value };
  u.uTime.value = 12.345;
  u.uTideR.value = 50;      // TIDE_OUT = R_MAX + 4
  u.uWaterY.value = -8.5 - 4 * 0.35;

  // 4. 해상도 고정 (창 크기와 무관하게 동일)
  const W = 960, H = 600;
  renderer.setPixelRatio(2);
  renderer.setSize(W, H, false);
  camera.aspect = W / H;

  // 5. 고정 카메라 자세
  const POSES = [
    { name: 'village',   pos: [0, 14, 18],     look: [0, 1, 0] },
    { name: 'bank',      pos: [6.6, 4.5, 4.5], look: [6.6, 1.6, -3.4] },
    { name: 'shipwright',pos: [-6.2, 4.2, 3.5],look: [-6.2, 1.5, -4.4] },
    { name: 'beach',     pos: [0, 9, 26],      look: [0, -1, 14] },
    { name: 'seabed',    pos: [0, 12, 40],     look: [0, -5, 26] },
    { name: 'wrecks',    pos: [22, 14, 30],    look: [10, -5, 14] },
    { name: 'horizon',   pos: [0, 18, 58],     look: [0, -3, 20] },
  ];

  const shots = [];
  for (const p of POSES) {
    camera.position.set(p.pos[0], p.pos[1], p.pos[2]);
    camera.lookAt(p.look[0], p.look[1], p.look[2]);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    scene.updateMatrixWorld(true);
    renderer.render(scene, camera);
    shots.push({ name: p.name, data: renderer.domElement.toDataURL('image/png') });
  }

  // 6. 원복 (다음 측정을 위해 상태는 되돌리되 루프는 재개하지 않는다)
  hidden.forEach(o => (o.visible = true));
  u.uTime.value = saved.t; u.uTideR.value = saved.r; u.uWaterY.value = saved.y;
  window.requestAnimationFrame = rafOrig;

  return shots;
};

/** 씬·메모리 통계. 캡처와 별개로 매 단계 기록한다. */
window.__stats = function () {
  const { renderer, scene } = window.__gfx;
  let objects = 0, meshes = 0, instanced = 0, instanceTotal = 0, tris = 0;
  const geos = new Set(), mats = new Set(), texs = new Set();
  scene.traverse(o => {
    objects++;
    if (o.isInstancedMesh) { instanced++; instanceTotal += o.count; }
    if (!o.isMesh) return;
    meshes++;
    if (o.geometry) {
      geos.add(o.geometry.uuid);
      const i = o.geometry.index, p = o.geometry.attributes?.position;
      tris += (i ? i.count : (p ? p.count : 0)) / 3 * (o.isInstancedMesh ? o.count : 1);
    }
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) {
      if (!m) continue;
      mats.add(m.uuid);
      for (const k of ['map', 'emissiveMap', 'normalMap', 'roughnessMap']) if (m[k]) texs.add(m[k].uuid);
    }
  });
  return {
    objects, meshes, instancedMeshes: instanced, instanceTotal,
    triangles: Math.round(tris),
    geometries: geos.size, materials: mats.size, textures: texs.size,
    rendererGeometries: renderer.info.memory.geometries,
    rendererTextures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length ?? null,
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
  };
};
