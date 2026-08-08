import * as THREE from 'three';
import { scene, shake } from './gfx.js';
import { rig, prop } from './assets.js';
import { groundY } from './world.js';
import { PLAYER, R_VILLAGE, R_MAX, LOOT, loadPenalty } from './config.js';
import { burst, ripple, popup } from './fx.js';
import { sfx } from './audio.js';
import { addOutline } from './outline.js';

const A = {
  idle: '01_Idle_1',
  walk: '04_Walk',
  run: '05_Run',
  jump: '07_Jump_Stand',
  throw: '10_Action_One-Handed_High',
  hit: '19_Suprised_Scared',
  cheer: '18_Success_Celebration',
  tread: '30_Treading_Water',
  swim: '31_Swimming',
  scan: '26_Looking_Horizon',
};

const MODEL_FACING = -Math.PI / 2; // the diver rig is authored facing +X, gameplay faces +Z

export class Player {
  constructor() {
    const r = rig('player');
    this.obj = new THREE.Group();
    this.model = r.object;
    this.model.scale.setScalar(PLAYER.scale);
    this.model.rotation.y = MODEL_FACING;
    addOutline(this.model, { thickness: 0.0085, color: 0x15222c });
    this.pivot = new THREE.Group();
    this.pivot.add(this.model);
    this.obj.add(this.pivot);
    scene.add(this.obj);

    this.mixer = r.mixer;
    this.actions = r.actions;
    for (const k in this.actions) this.actions[k].setEffectiveWeight(0);
    this.current = null;
    this.play(A.idle, 0);

    this.stack = new THREE.Group();
    this.stack.position.y = 1.25;
    this.obj.add(this.stack);

    this.pos = new THREE.Vector3(0, 0, 6);
    this.vel = new THREE.Vector3();
    this.face = 0;
    this.carry = [];
    this.capacity = PLAYER.baseCapacity;
    this.speedMul = 1;
    this.throwMul = 1;
    this.struggleMax = PLAYER.struggleBase;

    this.dashT = 0; this.dashCd = 0; this.dashDir = new THREE.Vector3(0, 0, 1);
    this.stun = 0;
    this.charge = 0; this.charging = false;
    this.submerge = 0;
    this.wet = 0;
    this.throwAnimT = 0;
    this.splashT = 0;
    this.alive = true;
  }

  get weight() { return this.carry.reduce((s, c) => s + LOOT[c.type].w, 0); }
  get radius() { return Math.hypot(this.pos.x, this.pos.z); }

  play(name, fade = 0.18) {
    const next = this.actions[name];
    if (!next || this.current === next) return;
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = next;
  }

  playOnce(name, speed = 1) {
    const a = this.actions[name];
    if (!a) return 0;
    a.reset().setLoop(THREE.LoopOnce, 1).setEffectiveWeight(1).setEffectiveTimeScale(speed);
    a.clampWhenFinished = true;
    a.play();
    if (this.current && this.current !== a) this.current.fadeOut(0.12);
    this.current = a;
    return a.getClip().duration / speed;
  }

  /* -------------------------------- carrying ------------------------------------- */

  canTake(type) { return this.weight + LOOT[type].w <= this.capacity; }

  take(type) {
    const def = LOOT[type];
    const mesh = prop(def.model === 'crate' ? 'crate' : def.model, { scale: def.s * 15 * 0.55 });
    const item = { type, mesh };
    this.carry.push(item);
    this.stack.add(mesh);
    this.layoutStack();
    sfx.pickup(Math.min(3, Math.floor(def.w / 2)));
    if (def.w >= 5) { sfx.heavy(); shake(0.16); }
    burst(this.pos.x, this.pos.y + 1.1, this.pos.z, 8,
      { color: 0xffd45e, spread: 1.6, up: 2.4, size: 0.24, lifeMin: 0.25, lifeMax: 0.5 });
    return item;
  }

  layoutStack() {
    let y = 0;
    this.carry.forEach((c, i) => {
      const box = new THREE.Box3().setFromObject(c.mesh);
      const h = Math.max(0.16, box.max.y - box.min.y);
      c.mesh.position.set(
        Math.sin(i * 2.4) * 0.09,
        y,
        Math.cos(i * 1.7) * 0.09,
      );
      c.mesh.rotation.y = i * 0.9;
      c.baseY = y;
      y += h * (i < 5 ? 0.92 : 0.6);
    });
    this.stackHeight = y;
  }

  dropAll(scatter) {
    const out = this.carry.slice();
    for (const c of out) this.stack.remove(c.mesh);
    this.carry.length = 0;
    this.layoutStack();
    return out;
  }

  /* --------------------------------- update -------------------------------------- */

  update(dt, input, world, game) {
    const wasSub = this.submerge;
    const gy = groundY(this.pos.x, this.pos.z);
    const depth = world.waterY - gy;
    this.depth = depth;

    // ---- movement
    const stunned = this.stun > 0;
    if (stunned) this.stun -= dt;

    let wish = new THREE.Vector3(input.x, 0, input.z);
    const moving = wish.lengthSq() > 0.001 && !stunned;

    let speed = PLAYER.speed * this.speedMul * loadPenalty(this.weight);
    if (depth > 0.15) speed *= depth > 1.3 ? 0.42 : depth > 0.6 ? 0.66 : 0.86;

    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vel.copy(this.dashDir).multiplyScalar(PLAYER.dashSpeed * (0.5 + this.dashT / PLAYER.dashTime * 0.5));
    } else {
      const target = moving ? wish.multiplyScalar(speed) : new THREE.Vector3();
      const k = Math.min(1, dt * (moving ? PLAYER.accel / speed : 14));
      this.vel.lerp(target, k);
    }

    if (this.dashCd > 0) this.dashCd -= dt;
    if (input.dash && this.dashCd <= 0 && !stunned && depth < 1.3) {
      const d = (moving ? new THREE.Vector3(input.x, 0, input.z) :
        new THREE.Vector3(Math.sin(this.face), 0, Math.cos(this.face))).normalize();
      this.dashDir.copy(d);
      this.dashT = PLAYER.dashTime;
      this.dashCd = PLAYER.dashCd;
      sfx.dash();
      ripple(this.pos.x, gy, this.pos.z, 0xffffff, 4, 0.4);
      burst(this.pos.x, gy + 0.2, this.pos.z, 12,
        { color: depth > 0.05 ? 0xcdf3ff : 0xe8d3a4, spread: 3, up: 1.8, size: 0.26, lifeMin: 0.2, lifeMax: 0.45 });
    }

    this.pos.addScaledVector(this.vel, dt);

    // keep the player on the island shelf
    const r = this.radius;
    const LIMIT = R_MAX + 4;
    if (r > LIMIT) {
      this.pos.multiplyScalar(LIMIT / r);
      this.vel.multiplyScalar(0.3);
    }

    // ---- facing
    if (this.vel.lengthSq() > 0.6) {
      const want = Math.atan2(this.vel.x, this.vel.z);
      let d = want - this.face;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.face += d * Math.min(1, dt * PLAYER.turn);
    }
    this.pivot.rotation.y = this.face;

    // ---- vertical placement: float when swimming
    const ny = groundY(this.pos.x, this.pos.z);
    const swimming = depth > 1.3;
    const targetY = swimming ? world.waterY - 0.72 : ny;
    this.pos.y += (targetY - this.pos.y) * Math.min(1, dt * 9);
    this.obj.position.copy(this.pos);

    // subtle bob + lean
    const spd = this.vel.length();
    this.model.position.y = swimming ? Math.sin(performance.now() * 0.003) * 0.06 : 0;
    this.pivot.rotation.z = -THREE.MathUtils.clamp(spd * 0.012, 0, 0.14) * (this.dashT > 0 ? 2 : 1);

    // ---- animation
    this.throwAnimT -= dt;
    if (this.throwAnimT <= 0) {
      if (stunned) this.play(A.hit, 0.08);
      else if (swimming) this.play(spd > 1.4 ? A.swim : A.tread, 0.22);
      else if (this.dashT > 0) this.play(A.run, 0.06);
      else if (spd > 5.2) this.play(A.run, 0.16);
      else if (spd > 0.55) this.play(A.walk, 0.16);
      else this.play(A.idle, 0.25);
    }
    const animSpeed = swimming ? 1 : THREE.MathUtils.clamp(spd / 8.4, 0.65, 1.85);
    if (this.current) this.current.setEffectiveTimeScale(this.throwAnimT > 0 ? 1.6 : animSpeed);
    this.mixer.update(dt);

    // ---- carried stack wobble
    const t = performance.now() * 0.004;
    this.carry.forEach((c, i) => {
      c.mesh.position.y = c.baseY + Math.sin(t * 2 + i) * 0.012 * (i + 1);
      c.mesh.rotation.z = Math.sin(t * 1.5 + i * 0.7) * 0.03 * (i + 1) - spd * 0.004;
    });
    this.stack.position.y = 1.22;

    // ---- water feedback
    this.splashT -= dt;
    if (depth > 0.05 && spd > 2 && this.splashT <= 0) {
      this.splashT = 0.09;
      burst(this.pos.x, world.waterY, this.pos.z, 4,
        { color: 0xdff6ff, spread: 1.4, up: 2.6, size: 0.2, lifeMin: 0.2, lifeMax: 0.4 });
      if (Math.random() < 0.3) sfx.splash(false);
    }

    // ---- drowning
    this.submerge = swimming ? this.submerge + dt : Math.max(0, this.submerge - dt * 2.2);
    if (!wasSub && swimming) { sfx.splash(true); shake(0.3); }

    return { swimming, depth, inVillage: r < R_VILLAGE };
  }

  /* ---------------------------------- throwing ------------------------------------ */

  updateCharge(dt, input) {
    if (this.carry.length === 0 || this.stun > 0) {
      this.charging = false; this.charge = 0;
      return null;
    }
    if (input.throwHeld) {
      this.charging = true;
      this.charge = Math.min(1, this.charge + dt / PLAYER.chargeTime);
      return null;
    }
    if (this.charging) {
      this.charging = false;
      const power = this.charge;
      this.charge = 0;
      return this.doThrow(power);
    }
    return null;
  }

  doThrow(power) {
    const item = this.carry.pop();
    if (!item) return null;
    this.stack.remove(item.mesh);
    this.layoutStack();
    this.throwAnimT = 0.42;
    this.playOnce(A.throw, 1.5);
    sfx.throw_(power);
    const dist = (PLAYER.throwBase + PLAYER.throwCharge * power) * this.throwMul
      / (1 + LOOT[item.type].w * 0.045);
    const dir = new THREE.Vector3(Math.sin(this.face), 0, Math.cos(this.face));
    return {
      type: item.type,
      from: new THREE.Vector3(this.pos.x, this.pos.y + 1.4, this.pos.z),
      dir, dist,
    };
  }

  hurt(knockDir) {
    if (this.stun > 0) return [];
    this.stun = 0.6;
    sfx.hit();
    shake(0.5);
    this.vel.copy(knockDir).multiplyScalar(14);
    const lost = this.carry.splice(Math.max(0, this.carry.length - 2), 2);
    for (const c of lost) this.stack.remove(c.mesh);
    this.layoutStack();
    popup('!', this.pos.x, this.pos.y + 2.2, this.pos.z, '#ff6a6a', 0.9);
    return lost;
  }

  wipeout() {
    const lost = this.dropAll();
    sfx.wipeout();
    shake(1.2);
    burst(this.pos.x, this.pos.y + 0.6, this.pos.z, 46,
      { color: 0xdff6ff, spread: 6, up: 7, size: 0.42, lifeMin: 0.5, lifeMax: 1.1 });
    this.submerge = 0;
    this.stun = 0.9;
    // wash ashore
    const a = Math.atan2(this.pos.z, this.pos.x);
    this.pos.set(Math.cos(a) * (R_VILLAGE - 2.5), 0, Math.sin(a) * (R_VILLAGE - 2.5));
    this.vel.set(0, 0, 0);
    return lost;
  }

  celebrate() { this.playOnce(A.cheer, 1); this.throwAnimT = 2.4; }
  reset() {
    this.dropAll();
    this.pos.set(0, 0, 7);
    this.vel.set(0, 0, 0);
    this.submerge = 0; this.stun = 0; this.charge = 0;
  }
}
