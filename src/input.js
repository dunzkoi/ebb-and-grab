const down = new Set();
const pressed = new Set();

const MOVE = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

export const input = {
  x: 0, z: 0,
  throwHeld: false,
  throwReleased: false,
  dash: false,
  enabled: false,
};

addEventListener('keydown', e => {
  if (!input.enabled) return;
  if (e.code in MOVE || e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') e.preventDefault();
  if (e.repeat) return;
  down.add(e.code);
  pressed.add(e.code);
});
addEventListener('keyup', e => {
  if (e.code === 'Space' && down.has('Space')) input.throwReleased = true;
  down.delete(e.code);
});
addEventListener('blur', () => down.clear());

/** Call once per frame, before gameplay. */
export function pollInput() {
  let x = 0, z = 0;
  for (const code in MOVE) {
    if (down.has(code)) { x += MOVE[code][0]; z += MOVE[code][1]; }
  }
  if (!x && !z && (touchVec.x || touchVec.z)) { x = touchVec.x; z = touchVec.z; }
  const len = Math.hypot(x, z);
  input.x = len > 1 ? x / len : x;
  input.z = len > 1 ? z / len : z;
  input.throwHeld = down.has('Space');
  input.dash = pressed.has('ShiftLeft') || pressed.has('ShiftRight');
}

/** Clears one-shot flags. Call at the very end of the frame. */
export function endInputFrame() {
  pressed.clear();
  input.throwReleased = false;
  input.dash = false;
}

/* ------------------------------ touch: virtual stick ------------------------------- */

/**
 * 마크업은 index.html에 있고 여기서는 배선만 한다.
 * 스틱은 누른 자리에 생기고, 포인터를 캡처해 손가락이 HUD 위로 넘어가도 끊기지 않는다.
 */
export function attachTouch(el) {
  document.body.classList.add('touch');
  const stick = document.getElementById('stick');
  const nub = stick.firstElementChild;
  let id = null, ox = 0, oy = 0;

  const hold = (node, on, off) => {
    node.addEventListener('pointerdown', e => {
      e.preventDefault();
      node.setPointerCapture(e.pointerId);
      node.classList.add('hit');
      if (input.enabled) on();
    });
    const up = () => { node.classList.remove('hit'); off(); };
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
  };
  hold(document.getElementById('tThrow'),
    () => down.add('Space'),
    () => { if (down.delete('Space')) input.throwReleased = true; });
  hold(document.getElementById('tDash'),
    () => { down.add('ShiftLeft'); pressed.add('ShiftLeft'); },
    () => down.delete('ShiftLeft'));

  el.addEventListener('pointerdown', e => {
    // 오른쪽 아래는 액션 버튼 자리, 위쪽 띠는 조수 게이지 자리라 스틱을 띄우지 않는다
    if (id !== null || !input.enabled) return;
    if (e.clientX > innerWidth * 0.6 || e.clientY < innerHeight * 0.16) return;
    id = e.pointerId;
    el.setPointerCapture(id);
    ox = e.clientX; oy = e.clientY;
    stick.style.left = ox + 'px';
    stick.style.top = oy + 'px';
    stick.style.display = 'block';
  });
  el.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    const dx = e.clientX - ox, dy = e.clientY - oy;
    const a = Math.atan2(dy, dx);
    const d = Math.min(46, Math.hypot(dx, dy));
    nub.style.transform = `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px)`;
    const n = Math.min(1, Math.hypot(dx, dy) / 42);
    touchVec.x = Math.cos(a) * n; touchVec.z = Math.sin(a) * n;
  });
  const clear = e => {
    if (e.pointerId !== id) return;
    id = null; touchVec.x = touchVec.z = 0;
    stick.style.display = 'none'; nub.style.transform = '';
  };
  el.addEventListener('pointerup', clear);
  el.addEventListener('pointercancel', clear);
}

export const touchVec = { x: 0, z: 0 };
