import { loadAll } from './assets.js';
import { Game } from './game.js';
import { renderer, scene, camera, IS_TOUCH } from './gfx.js';
import { initAudio, resumeAudio, prefetchMusic, sfx } from './audio.js';
import { input, attachTouch } from './input.js';
import * as ui from './ui.js';

const bar = document.getElementById('barFill');
const loadTxt = document.getElementById('loadTxt');

const LOAD_LINES = [
  '바다를 밀어내는 중…', '난파선을 가라앉히는 중…', '보물을 흩뿌리는 중…',
  '딥원을 깨우는 중…', '조수표를 읽는 중…',
];

async function boot() {
  let i = 0;
  await Promise.all([
    loadAll(p => {
      bar.style.width = (p * 100) + '%';
      const n = Math.min(LOAD_LINES.length - 1, Math.floor(p * LOAD_LINES.length));
      if (n !== i) { i = n; loadTxt.textContent = LOAD_LINES[n]; }
    }),
    prefetchMusic(),
  ]);

  const game = new Game();
  window.__game = game;   // handy for debugging / automated playtests

  // 셰이더 컴파일과 텍스처 업로드를 로딩 화면에서 끝낸다.
  // 안 하면 첫 렌더에서 100ms 넘게 프레임이 멈춘다.
  loadTxt.textContent = '셰이더를 굽는 중…';
  await renderer.compileAsync(scene, camera);

  ui.hide('loading');
  ui.show('title');
  ui.showBest();

  if (IS_TOUCH) attachTouch(document.getElementById('app'));

  const begin = () => {
    initAudio(); resumeAudio(); sfx.ui();
    ui.hide('title');
    input.enabled = true;
    game.start();
  };
  document.getElementById('btnStart').onclick = begin;
  document.getElementById('btnAgain').onclick = () => {
    ui.hide('over');
    input.enabled = true;
    game.start();
  };
  addEventListener('keydown', e => {
    if (e.code !== 'Enter' && e.code !== 'Space') return;
    if (!document.getElementById('title').classList.contains('hidden')) { e.preventDefault(); begin(); }
    else if (!document.getElementById('shop').classList.contains('hidden')) { e.preventDefault(); game.nextTide(); }
  });
  addEventListener('pointerdown', resumeAudio, { once: true });

  let raf;
  const loop = () => { raf = requestAnimationFrame(loop); game.frame(); };
  loop();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else { game.clock.getDelta(); loop(); }
  });
}

boot().catch(err => {
  console.error(err);
  loadTxt.textContent = '불러오기 실패: ' + err.message;
});
