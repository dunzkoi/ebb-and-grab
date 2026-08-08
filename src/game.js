import * as THREE from 'three';
import { scene, shake, setZoom, updateCamera, camera, renderer } from './gfx.js';
import { Player } from './player.js';
import { Loot, spawnLoot, DeepOne, Shark, LivingWave } from './entities.js';
import {
  buildTerrain, buildWater, buildVillage, buildSeabed, groundY, rng,
} from './world.js';
import {
  R_VILLAGE, R_SHORE, R_MAX, TIDE_OUT, TIDE_IN, terrainHeight,
  LOOT, UPGRADES, REPAIR_COST, MAX_TIDES, PLAYER, lootPlan, tidePlan,
} from './config.js';
import { bakeInstances } from './instancing.js';
import { burst, ripple, popup, updateFx } from './fx.js';
import { sfx, setMusicIntensity, setMusicPhase, updateMusic } from './audio.js';
import * as ui from './ui.js';
import { input, pollInput, endInputFrame } from './input.js';

const CREEP = 9;   // how far the water sneaks in during the tail of the ebb
const SETTLE = 2.6;

export class Game {
  constructor() {
    this.state = 'title';
    this.world = { tideR: TIDE_OUT, waterY: terrainHeight(TIDE_OUT), floodK: 0 };

    buildTerrain();
    this.water = buildWater();
    bakeInstances([...buildVillage(), ...buildSeabed()]);

    this.player = new Player();
    this.loot = [];
    this.mobs = [];
    this.waves = [];

    this.gold = 0;
    this.tideNo = 1;
    this.runGold = 0;
    this.runLost = 0;
    this.totalEarned = 0;
    this.repair = 0;
    this.up = {};

    this.t = 0;
    this.bankTimer = 0;
    this.bankCombo = 0;
    this.warnStep = 0;
    this.warnTimer = 0;
    this.clock = new THREE.Clock();
  }

  /* ------------------------------- upgrades ------------------------------------- */

  applyUpgrades() {
    const p = this.player;
    p.speedMul = 1 + (this.up.boots || 0) * 0.12;
    p.capacity = PLAYER.baseCapacity + (this.up.sack || 0) * 4;
    p.throwMul = 1 + (this.up.arms || 0) * 0.3;
    p.struggleMax = PLAYER.struggleBase + (this.up.lungs || 0) * 1.5;
  }

  buy(id) {
    const u = UPGRADES.find(x => x.id === id);
    const lv = this.up[id] || 0;
    if (lv >= u.max) return;
    const cost = u.cost(lv);
    if (this.gold < cost) return;
    this.gold -= cost;
    this.up[id] = lv + 1;
    this.applyUpgrades();
    ui.renderShop(this, this.buy.bind(this), this.repairShip.bind(this), this.nextTide.bind(this));
  }

  repairShip() {
    if (this.repair >= REPAIR_COST.length) return this.finish(true);
    const cost = REPAIR_COST[this.repair];
    if (this.gold < cost) return;
    this.gold -= cost;
    this.repair++;
    sfx.bank(this.repair);
    ui.renderShop(this, this.buy.bind(this), this.repairShip.bind(this), this.nextTide.bind(this));
  }

  /* --------------------------------- flow --------------------------------------- */

  start() {
    this.state = 'ebb';
    this.gold = 0; this.tideNo = 1; this.totalEarned = 0; this.repair = 0; this.up = {};
    this.applyUpgrades();
    ui.show('hud');
    this.beginTide();
  }

  beginTide() {
    for (const l of this.loot) l.remove();
    for (const m of this.mobs) m.remove();
    for (const w of this.waves) w.remove();
    this.loot = []; this.mobs = []; this.waves = [];

    this.plan = tidePlan(this.tideNo, this.up);
    spawnLoot(lootPlan(this.tideNo), this.loot);

    const r = rng(1000 + this.tideNo * 77);
    for (let i = 0; i < this.plan.deepOnes; i++) {
      const a = r() * Math.PI * 2;
      const rad = R_SHORE + 16 + r() * (R_MAX - R_SHORE - 20);
      this.mobs.push(new DeepOne(Math.cos(a) * rad, Math.sin(a) * rad));
    }

    this.player.reset();
    this.runGold = 0; this.runLost = 0;
    this.t = 0;
    this.world.tideR = TIDE_OUT;
    this.state = 'ebb';
    this.sharksOut = false;
    this.waveOut = false;
    setZoom(1);
    setMusicPhase('ebb');
    ui.shout(`조수 ${this.tideNo} 썰물`, '#8ef2c6');
    ui.hide('shop');
  }

  toFlood() {
    this.state = 'flood';
    this.t = 0;
    setMusicPhase('flood', 0.5);
    ui.shout('밀물이 온다!', '#ff7a5a');
    sfx.floodHorn();
    sfx.splash(true);
    shake(0.8);
    setZoom(1.12);
  }

  toVillage() {
    this.state = 'settle';
    this.t = 0;
    setMusicPhase('village');
    setZoom(0.94);
    this.player.celebrate();
  }

  openShop() {
    this.state = 'shop';
    input.enabled = false;
    ui.renderShop(this, this.buy.bind(this), this.repairShip.bind(this), this.nextTide.bind(this));
    ui.show('shop');
  }

  nextTide() {
    ui.hide('shop');
    input.enabled = true;
    this.tideNo++;
    if (this.tideNo > MAX_TIDES) return this.finish(false);
    this.beginTide();
  }

  finish(won) {
    this.state = 'over';
    input.enabled = false;
    setMusicPhase('village');
    setMusicIntensity(0.05);
    ui.hide('shop');
    ui.renderOver(this, won);
    ui.show('over');
    if (won) sfx.win(); else sfx.lose();
  }

  /* -------------------------------- banking ------------------------------------- */

  bankItem(type, x, y, z) {
    const def = LOOT[type];
    const bonus = 1 + Math.min(0.5, this.bankCombo * 0.04);
    const v = Math.round(def.v * bonus);
    this.gold += v; this.runGold += v; this.totalEarned += v;
    sfx.bank(this.bankCombo);
    this.bankCombo++;
    popup('+' + v, x, y + 1.6, z, '#ffd24d', 0.9 + Math.min(0.5, this.bankCombo * 0.05));
    burst(x, y + 0.7, z, 10,
      { color: 0xffd45e, spread: 2.2, up: 3.4, size: 0.26, lifeMin: 0.3, lifeMax: 0.6 });
    ripple(x, groundY(x, z), z, 0xffd45e, 3, 0.5);
  }

  /* -------------------------------- main step ----------------------------------- */

  step(dt) {
    const p = this.player, w = this.world;

    /* ---- tide state machine ---- */
    if (this.state === 'ebb') {
      this.t += dt;
      const left = this.plan.ebb - this.t;
      const creepK = Math.max(0, (this.t - this.plan.ebb * 0.72) / (this.plan.ebb * 0.28));
      w.tideR = TIDE_OUT - CREEP * creepK * creepK;
      w.floodK = 0;

      if (left < 6.5) {
        this.warnTimer -= dt;
        if (this.warnTimer <= 0) {
          this.warnTimer = Math.max(0.18, left / 14);
          sfx.warn(this.warnStep++);
        }
      }
      if (left <= 0) this.toFlood();
      ui.updateTideBar('썰물', Math.max(0, left), this.plan.ebb, left < 3 ? 2 : left < 8 ? 1 : 0);
      setMusicIntensity(0.18 + (1 - left / this.plan.ebb) * 0.4);

    } else if (this.state === 'flood') {
      this.t += dt;
      const k = Math.min(1, this.t / this.plan.flood);
      w.floodK = k;
      const eased = k * k * (3 - 2 * k);
      w.tideR = (TIDE_OUT - CREEP) + (TIDE_IN - (TIDE_OUT - CREEP)) * eased;

      if (!this.sharksOut && k > 0.06) {
        this.sharksOut = true;
        for (let i = 0; i < this.plan.sharks; i++) {
          this.mobs.push(new Shark((i / Math.max(1, this.plan.sharks)) * 6.28));
        }
      }
      if (!this.waveOut && k > 0.6) {
        this.waveOut = true;
        ui.shout('큰 파도!', '#ff5a4d');
        shake(1.0);
        for (let i = 0; i < 3; i++) this.waves.push(new LivingWave(Math.random() * 6.28));
      }
      if (k >= 1) this.toVillage();
      ui.updateTideBar('밀물', 1 - k, 1, k > 0.55 ? 2 : 1);
      setMusicIntensity(0.62 + k * 0.38);

    } else if (this.state === 'settle') {
      this.t += dt;
      w.tideR += (TIDE_IN - w.tideR) * Math.min(1, dt * 2);
      setMusicIntensity(0.12);
      ui.updateTideBar('정산', 1, 1, 0);
      if (this.t > SETTLE) this.openShop();
    }

    w.waterY = terrainHeight(w.tideR);
    this.water.material.uniforms.uTideR.value = w.tideR;
    this.water.material.uniforms.uWaterY.value = w.waterY;
    this.water.material.uniforms.uTime.value += dt;
    this.water.position.y = w.waterY;

    const active = this.state === 'ebb' || this.state === 'flood' || this.state === 'settle';

    /* ---- player ---- */
    pollInput();
    const st = p.update(dt, active && this.state !== 'settle' ? input : { x: 0, z: 0, dash: false }, w, this);

    const thrown = active && this.state !== 'settle' ? p.updateCharge(dt, input) : null;
    if (thrown) {
      const l = new Loot(thrown.type, thrown.from.x, thrown.from.z);
      l.launch(thrown.from, thrown.dir, thrown.dist);
      this.loot.push(l);
    }

    /* ---- drowning ---- */
    if (p.submerge > p.struggleMax) {
      const lost = p.wipeout();
      let v = 0;
      for (const c of lost) v += LOOT[c.type].v;
      this.runLost += v;
      if (v > 0) popup(`-${v}`, p.pos.x, p.pos.y + 2.4, p.pos.z, '#ff6a6a', 1.1);
      ui.shout('물에 삼켜졌다', '#ff5a4d');
    }
    const drownK = Math.min(1, p.submerge / p.struggleMax);
    ui.setVignette(Math.max(drownK * 0.9, this.state === 'flood' ? this.world.floodK * 0.28 : 0));

    /* ---- loot ---- */
    this.bankTimer -= dt;
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const l = this.loot[i];
      l.update(dt, w.waterY);
      const lp = l.obj.position;
      const lr = Math.hypot(lp.x, lp.z);

      // thrown into (or resting in) the village -> banked
      if (!l.flight && lr < R_VILLAGE) {
        this.bankItem(l.type, lp.x, lp.y, lp.z);
        l.remove(); this.loot.splice(i, 1);
        continue;
      }
      // swallowed by the sea
      if (!l.flight && w.waterY - groundY(lp.x, lp.z) > 2.6) {
        burst(lp.x, w.waterY, lp.z, 6,
          { color: 0xbfe8ff, spread: 1.4, up: 2, size: 0.22, lifeMin: 0.2, lifeMax: 0.4 });
        l.remove(); this.loot.splice(i, 1);
        continue;
      }
      // pickup
      if (!l.flight && active && this.state !== 'settle' && p.stun <= 0) {
        const d = Math.hypot(lp.x - p.pos.x, lp.z - p.pos.z);
        if (d < PLAYER.pickupRadius && p.canTake(l.type)) {
          p.take(l.type);
          if (LOOT[l.type].v >= 18) {
            popup(LOOT[l.type].label, lp.x, lp.y + 1.1, lp.z, '#ffe6a0', 0.38);
          }
          l.remove(); this.loot.splice(i, 1);
        }
      }
    }

    /* ---- auto-bank what you carried home ---- */
    if (st.inVillage && p.carry.length && this.bankTimer <= 0) {
      this.bankTimer = 0.085;
      const item = p.carry.pop();
      p.stack.remove(item.mesh);
      p.layoutStack();
      this.bankItem(item.type, p.pos.x, p.pos.y, p.pos.z);
    }
    if (!st.inVillage) this.bankCombo = 0;

    /* ---- mobs ---- */
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      const hit = m.update(dt, p, w);
      if (hit && active) {
        if (m instanceof Shark) {
          p.submerge += 1.1;
          sfx.hit(); shake(0.6);
          popup('상어!', p.pos.x, p.pos.y + 2.4, p.pos.z, '#ff6a6a', 0.9);
        } else {
          const lost = p.hurt(hit);
          for (const c of lost) {
            const l = new Loot(c.type, p.pos.x, p.pos.z);
            l.launch(new THREE.Vector3(p.pos.x, p.pos.y + 1.2, p.pos.z),
              hit.clone().multiplyScalar(-1), 4 + Math.random() * 3);
            this.loot.push(l);
          }
        }
      }
      if (m instanceof Shark && this.state === 'shop') { m.remove(); this.mobs.splice(i, 1); }
    }

    for (let i = this.waves.length - 1; i >= 0; i--) {
      if (this.waves[i].update(dt, p, w) === 'done') {
        this.waves[i].remove(); this.waves.splice(i, 1);
      }
    }

    /* ---- camera & hud ---- */
    const look = new THREE.Vector3(p.vel.x, 0, p.vel.z).multiplyScalar(0.12);
    updateCamera(p.pos, dt, look);
    updateFx(dt);
    updateMusic(dt);
    ui.updateHud(this, p);
    ui.drawMap(this, p, this.loot, this.mobs, w, (this.up.lens || 0) > 0);
    endInputFrame();
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.state !== 'title' && this.state !== 'over') this.step(dt);
    else {
      this.world.waterY = terrainHeight(this.world.tideR);
      this.water.material.uniforms.uTime.value += dt;
      updateCamera(this.player.pos, dt, null);
      updateFx(dt);
      updateMusic(dt);
    }
    renderer.render(scene, camera);
  }
}
