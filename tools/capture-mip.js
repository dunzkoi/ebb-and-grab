window.__captureMip = async function (disableMips) {
  const { renderer, scene, camera } = window.__gfx;
  const g = window.__game;
  const rafOrig = window.requestAnimationFrame;
  window.requestAnimationFrame = () => 0;
  await new Promise(r => setTimeout(r, 150));

  (g.loot||[]).forEach(l => { if (l.obj) l.obj.visible = false; });
  (g.mobs||[]).forEach(m => { if (m.obj) m.obj.visible = false; });
  scene.traverse(o => { if (o.isPoints) o.visible = false; });

  const p = g.player;
  p.obj.visible = true; p.pos.set(0,0,0); p.obj.position.set(0,0,0);
  p.face = 0; p.pivot.rotation.set(0,0,0); p.model.rotation.y = -Math.PI/2;
  p.mixer.setTime(0); p.mixer.update(0);

  if (disableMips) {
    const THREE = window.__THREEmod;
    p.model.traverse(o => {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) { if (!m || !m.map) continue;
        m.map.minFilter = 1003;          // NearestFilter
        m.map.magFilter = 1003;
        m.map.generateMipmaps = false;
        m.map.anisotropy = 1;
        m.map.needsUpdate = true;
        m.needsUpdate = true;
      }
    });
  }

  const u = g.water.material.uniforms;
  u.uTime.value = 12.345; u.uTideR.value = 50; u.uWaterY.value = -8.5 - 4*0.35;
  renderer.setPixelRatio(2); renderer.setSize(960, 600, false); camera.aspect = 960/600;

  const POSES = [
    { name: 'near', pos: [0, 3.2, 5.2],   look: [0, 1.1, 0] },
    { name: 'game', pos: [0, 10.3, 11.4], look: [0, 1.4, 0] },
    { name: 'far',  pos: [0, 20, 24],     look: [0, 1.4, 0] },
  ];
  const shots = [];
  for (const q of POSES) {
    camera.position.set(...q.pos); camera.lookAt(...q.look);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true); scene.updateMatrixWorld(true);
    renderer.render(scene, camera);
    shots.push({ name: q.name, data: renderer.domElement.toDataURL('image/png') });
  }
  window.requestAnimationFrame = rafOrig;
  return shots;
};
