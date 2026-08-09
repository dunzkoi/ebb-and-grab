/**
 * 플레이어와 몹까지 포함한 결정론적 캡처.
 * 정적 배경만 비교하던 capture.js의 사각지대를 메운다.
 */
window.__captureDyn = async function () {
  const { renderer, scene, camera } = window.__gfx;
  const g = window.__game;

  const rafOrig = window.requestAnimationFrame;
  window.requestAnimationFrame = () => 0;
  await new Promise(r => setTimeout(r, 150));

  // 전리품과 몹은 무작위 배치라 숨긴다
  (g.loot || []).forEach(l => { if (l.obj) l.obj.visible = false; });
  (g.mobs || []).forEach(m => { if (m.obj) m.obj.visible = false; });
  (g.waves || []).forEach(w => { if (w.obj) w.obj.visible = false; });
  scene.traverse(o => { if (o.isPoints) o.visible = false; });

  // 플레이어를 고정 위치·고정 포즈로
  const p = g.player;
  p.obj.visible = true;
  p.pos.set(0, 0, 0);
  p.obj.position.set(0, 0, 0);
  p.face = 0;
  p.pivot.rotation.set(0, 0, 0);
  p.model.rotation.y = -Math.PI / 2;
  p.mixer.setTime(0);
  p.mixer.update(0);

  const u = g.water.material.uniforms;
  u.uTime.value = 12.345;
  u.uTideR.value = 50;
  u.uWaterY.value = -8.5 - 4 * 0.35;

  const W = 960, H = 600;
  renderer.setPixelRatio(2);
  renderer.setSize(W, H, false);
  camera.aspect = W / H;

  const POSES = [
    { name: 'diver-front', pos: [0, 3.2, 5.2],  look: [0, 1.1, 0] },
    { name: 'diver-close', pos: [1.6, 2.2, 2.6],look: [0, 1.2, 0] },
    { name: 'diver-game',  pos: [0, 10.3, 11.4],look: [0, 1.4, 0] },
    { name: 'diver-back',  pos: [0, 3.0, -5.0], look: [0, 1.1, 0] },
  ];

  const shots = [];
  for (const q of POSES) {
    camera.position.set(q.pos[0], q.pos[1], q.pos[2]);
    camera.lookAt(q.look[0], q.look[1], q.look[2]);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    scene.updateMatrixWorld(true);
    renderer.render(scene, camera);
    shots.push({ name: q.name, data: renderer.domElement.toDataURL('image/png') });
  }
  window.requestAnimationFrame = rafOrig;
  return shots;
};
