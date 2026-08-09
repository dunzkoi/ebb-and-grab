import { UPGRADES, REPAIR_COST, MAX_TIDES, R_MAX, R_VILLAGE, loadPenalty } from './config.js';
import { sfx } from './audio.js';

const $ = id => document.getElementById(id);

export const el = {
  hud: $('hud'), gold: $('uiGold'), tide: $('uiTide'), run: $('uiRun'),
  tideLabel: $('tideLabel'), tideTrack: $('tideTrack'), tideFill: $('tideFill'),
  carryWrap: $('carryWrap'), carryTxt: $('carryTxt'), carryFill: $('carryFill'), spd: $('spd'),
  shout: $('shout'), vignette: $('vignette'),
  chargeWrap: $('chargeWrap'), chargeFill: $('chargeFill'),
  map: $('map'),
};

const mapCtx = el.map.getContext('2d');

/* --------------------------------- screens ----------------------------------------- */

export function show(id) { $(id).classList.remove('hidden'); }
export function hide(id) { $(id).classList.add('hidden'); }

let shoutTimer = null;
export function shout(text, color = '#fff') {
  el.shout.textContent = text;
  el.shout.style.color = color;
  el.shout.classList.remove('show');
  void el.shout.offsetWidth;
  el.shout.classList.add('show');
  clearTimeout(shoutTimer);
  shoutTimer = setTimeout(() => el.shout.classList.remove('show'), 2000);
}

/* ----------------------------------- HUD ------------------------------------------- */

export function updateHud(g, p) {
  el.gold.textContent = g.gold.toLocaleString();
  el.tide.textContent = `${g.tideNo} / ${MAX_TIDES}`;
  el.run.textContent = g.runGold.toLocaleString();

  const w = p.weight, c = p.capacity;
  el.carryTxt.textContent = `${w} / ${c}`;
  el.carryFill.style.width = Math.min(100, (w / c) * 100) + '%';
  el.carryWrap.classList.toggle('full', w >= c);
  el.spd.textContent = '속도 ' + Math.round(loadPenalty(w) * p.speedMul * 100) + '%';

  el.chargeWrap.classList.toggle('on', p.charging);
  el.chargeFill.style.width = (p.charge * 100) + '%';
}

export function updateTideBar(phase, t, total, danger) {
  const k = Math.max(0, Math.min(1, t / total));
  el.tideFill.style.width = (k * 100) + '%';
  el.tideTrack.classList.toggle('warn', danger === 1);
  el.tideTrack.classList.toggle('crit', danger === 2);
  el.tideLabel.textContent = phase;
}

export function setVignette(v) { el.vignette.style.opacity = v; }

/* ---------------------------------- minimap ---------------------------------------- */

const MAP_R = R_MAX + 5;   // 걸어 다니는 범위(46)와 만조선(50)까지만 담는다
const TIER = { coin: '#ffe08a', crate: '#c79a6b', barrel: '#b7793f', gold: '#ffcc4d', chest: '#7fe3ff', relic: '#ff8ae0' };

export function drawMap(g, p, loot, mobs, world, lens) {
  const c = mapCtx, S = el.map.width, R = S / 2;
  const k = R / MAP_R;
  const u = S / 300;   // 기준 300px 대비 배율. 점·선 두께를 위젯 크기에 맞춘다
  c.clearRect(0, 0, S, S);

  c.save();
  c.beginPath(); c.arc(R, R, R - 1, 0, 7); c.clip();
  c.fillStyle = '#0e3550'; c.fillRect(0, 0, S, S);

  // exposed seabed
  c.beginPath(); c.arc(R, R, world.tideR * k, 0, 7);
  c.fillStyle = '#6d7c62'; c.fill();

  // beach + village
  c.beginPath(); c.arc(R, R, 18 * k, 0, 7); c.fillStyle = '#c9ab74'; c.fill();
  c.beginPath(); c.arc(R, R, R_VILLAGE * k, 0, 7); c.fillStyle = '#8fae66'; c.fill();

  // waterline
  c.beginPath(); c.arc(R, R, world.tideR * k, 0, 7);
  c.strokeStyle = '#eafaff'; c.lineWidth = 3 * u; c.stroke();

  for (const l of loot) {
    if (l.dead) continue;
    const x = R + l.obj.position.x * k, y = R + l.obj.position.z * k;
    const big = l.type === 'relic' || l.type === 'chest';
    if (!lens && !big && l.type !== 'gold') { c.fillStyle = 'rgba(255,255,255,.72)'; }
    else c.fillStyle = TIER[l.type];
    c.beginPath(); c.arc(x, y, (big ? 4.8 : 2.9) * u, 0, 7); c.fill();
  }

  for (const m of mobs) {
    const x = R + m.obj.position.x * k, y = R + m.obj.position.z * k;
    c.fillStyle = m.awake === false ? 'rgba(255,90,80,.45)' : '#ff5a4d';
    c.beginPath(); c.arc(x, y, 5.2 * u, 0, 7); c.fill();
  }

  // player
  const px = R + p.pos.x * k, py = R + p.pos.z * k;
  c.save();
  c.translate(px, py); c.rotate(-p.face);
  c.scale(u, u);
  // 내 위치가 전리품 점들에 묻히지 않도록 어두운 테두리를 두른다
  c.beginPath(); c.moveTo(0, -10); c.lineTo(6.8, 7.2); c.lineTo(0, 3.6); c.lineTo(-6.8, 7.2); c.closePath();
  c.fillStyle = '#17222b'; c.fill();
  c.beginPath(); c.moveTo(0, -7.2); c.lineTo(4.9, 5.4); c.lineTo(0, 2.6); c.lineTo(-4.9, 5.4); c.closePath();
  c.fillStyle = '#fff'; c.fill();
  c.restore();
  c.restore();

  c.beginPath(); c.arc(R, R, R - 1.5 * u, 0, 7);
  c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 2 * u; c.stroke();
}

/* ------------------------------------ shop ----------------------------------------- */

export function renderShop(g, onBuy, onRepair, onNext) {
  $('shopGold').textContent = g.gold.toLocaleString();
  $('shopSub').textContent = `조수 ${g.tideNo} 정산`;

  const rows = [
    ['이번 썰물 회수', g.runGold],
    ['바다에 잃은 금액', g.runLost],
    ['누적 회수', g.totalEarned],
  ];
  $('tally').innerHTML = rows.map(([k, v]) =>
    `<div>${k}</div><div class="v">${v.toLocaleString()}</div>`).join('') +
    `<div class="tot">보유 금화</div><div class="v tot">${g.gold.toLocaleString()}</div>`;

  const stage = g.repair;
  $('shipPips').innerHTML = REPAIR_COST.map((_, i) =>
    `<i class="${i < stage ? 'on' : ''}"></i>`).join('');
  const rb = $('btnRepair');
  if (stage >= REPAIR_COST.length) {
    $('shipDesc').textContent = '수리 완료. 떠날 준비가 됐다.';
    rb.textContent = '출항!'; rb.disabled = false;
  } else {
    const cost = REPAIR_COST[stage];
    $('shipDesc').textContent = `${stage + 1}/${REPAIR_COST.length} 단계, ${cost.toLocaleString()} 금화`;
    rb.textContent = `수리 (${cost.toLocaleString()})`;
    rb.disabled = g.gold < cost;
  }
  rb.onclick = () => { sfx.ui(); onRepair(); };

  $('upGrid').innerHTML = UPGRADES.map(u => {
    const lv = g.up[u.id] || 0;
    const maxed = lv >= u.max;
    const cost = maxed ? 0 : u.cost(lv);
    return `<div class="up ${maxed ? 'maxed' : ''}">
      <div class="n">${u.name}</div>
      <div class="d">${u.desc}</div>
      <div class="b">
        <span class="lv">${'●'.repeat(lv)}${'○'.repeat(u.max - lv)}</span>
        ${maxed ? '<span class="lv">MAX</span>'
        : `<button data-up="${u.id}" ${g.gold < cost ? 'disabled' : ''}>${cost.toLocaleString()}</button>`}
      </div></div>`;
  }).join('');
  $('upGrid').querySelectorAll('button[data-up]').forEach(b => {
    b.onclick = () => { sfx.ui(); onBuy(b.dataset.up); };
  });

  const left = MAX_TIDES - g.tideNo;
  $('nextInfo').textContent = left <= 0 ? '더 이상 남은 조수가 없다'
    : left === 1 ? '마지막 조수다'
    : `남은 조수 ${left}번, 물이 더 빨리 들어온다`;
  $('btnNext').onclick = () => { sfx.ui(); onNext(); };
}

export function renderOver(g, won) {
  $('overTitle').textContent = won ? '섬을 떠났다' : '배는 떠나지 못했다';
  $('overText').innerHTML = won
    ? `배는 고쳐졌고 창고는 가득 찼다. <b>조수 ${g.tideNo}번</b> 만에 해냈다.`
    : `조수 ${MAX_TIDES}번이 모두 지나갔다. 수리는 <b>${g.repair}/${REPAIR_COST.length}단계</b>에서 멈췄다.`;
  const best = Number(localStorage.getItem('eg_best') || 0);
  const score = g.totalEarned + (won ? 2000 + (MAX_TIDES - g.tideNo) * 220 : 0);
  if (score > best) localStorage.setItem('eg_best', String(score));
  $('overTally').innerHTML = [
    ['버틴 조수', Math.min(g.tideNo, MAX_TIDES)],
    ['총 회수 금액', g.totalEarned],
    ['배 수리 단계', `${g.repair}/${REPAIR_COST.length}`],
  ].map(([k, v]) => `<div>${k}</div><div class="v">${typeof v === 'number' ? v.toLocaleString() : v}</div>`).join('') +
    `<div class="tot">점수</div><div class="v tot">${score.toLocaleString()}</div>` +
    `<div>최고 기록</div><div class="v">${Math.max(best, score).toLocaleString()}</div>`;
}

export function showBest() {
  const best = Number(localStorage.getItem('eg_best') || 0);
  $('bestTxt').textContent = best ? `최고 기록 ${best.toLocaleString()}점` : '';
}
