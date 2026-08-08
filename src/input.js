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

export function attachTouch(el) {
  let id = null, ox = 0, oy = 0;
  const stick = document.createElement('div');
  stick.style.cssText = `position:fixed;width:112px;height:112px;border-radius:50%;pointer-events:none;
    border:2px solid rgba(255,255,255,.4);background:rgba(255,255,255,.09);display:none;z-index:15`;
  const nub = document.createElement('div');
  nub.style.cssText = `position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;
    border-radius:50%;background:rgba(255,255,255,.55)`;
  stick.appendChild(nub);
  document.body.appendChild(stick);

  const btn = (label, right, bottom, on, off) => {
    const b = document.createElement('div');
    b.textContent = label;
    b.style.cssText = `position:fixed;right:${right}px;bottom:${bottom}px;width:78px;height:78px;border-radius:50%;
      background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.34);color:#fff;font:700 13px/78px system-ui;
      text-align:center;z-index:15;user-select:none;touch-action:none`;
    b.addEventListener('pointerdown', e => { e.preventDefault(); on(); });
    b.addEventListener('pointerup', () => off?.());
    b.addEventListener('pointercancel', () => off?.());
    document.body.appendChild(b);
    return b;
  };
  btn('던지기', 22, 116, () => down.add('Space'), () => { input.throwReleased = true; down.delete('Space'); });
  btn('대시', 112, 30, () => { down.add('ShiftLeft'); pressed.add('ShiftLeft'); }, () => down.delete('ShiftLeft'));

  el.addEventListener('pointerdown', e => {
    if (id !== null || e.clientX > innerWidth * 0.55) return;
    id = e.pointerId; ox = e.clientX; oy = e.clientY;
    stick.style.display = 'block';
    stick.style.left = ox - 56 + 'px';
    stick.style.top = oy - 56 + 'px';
  });
  el.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    const dx = e.clientX - ox, dy = e.clientY - oy;
    const d = Math.min(46, Math.hypot(dx, dy));
    const a = Math.atan2(dy, dx);
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
  input.touch = true;
}

export const touchVec = { x: 0, z: 0 };
