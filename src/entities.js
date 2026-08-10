import * as THREE from 'three';
import { scene } from './gfx.js';
import { prop, rig } from './assets.js';
import { groundY } from './world.js';
import { LOOT, R_VILLAGE, R_SHORE, R_MAX } from './config.js';
import { burst, ripple, popup } from './fx.js';
import { sfx } from './audio.js';
import { addOutline } from './outline.js';

const VARIANTS = {
  crate: ['crate', 'crateB', 'crateC'],
  chest: ['chest', 'chestB'],
};

/**
 * A soft glowing rim on the sand under each piece of loot. It marks what is
 * pickable (the village is full of identical decorative crates) and its colour
 * climbs with value, so worth is readable at a glance without a label.
 */
const haloGeo = new THREE.PlaneGeometry(1.8, 1.8).rotateX(-Math.PI / 2);
const haloTex = (() => {
  const s = 128, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const c = cv.getContext('2d');
  const grd = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0.00, 'rgba(255,255,255,0)');
  grd.addColorStop(0.58, 'rgba(255,255,255,0)');
  grd.addColorStop(0.80, 'rgba(255,255,255,1)');
  grd.addColorStop(0.94, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1.00, 'rgba(255,255,255,0)');
  c.fillStyle = grd;
  c.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(cv);
})();
const haloMats = Object.fromEntries(Object.entries(LOOT).map(([type, def]) => [type,
  new THREE.MeshBasicMaterial({
    map: haloTex, color: def.ring[0], transparent: true, opacity: def.ring[2], depthWrite: false,
  })]));

/* ------------------------------------- loot ---------------------------------------- */

export class Loot {
  constructor(type, x, z) {
    const def = LOOT[type];
    this.type = type;
    this.def = def;
    const key = VARIANTS[def.model]
      ? VARIANTS[def.model][(Math.random() * VARIANTS[def.model].length) | 0]
      : def.model;
    this.obj = new THREE.Group();
    this.mesh = prop(key, { scale: def.s * 15 });
    this.obj.add(this.mesh);
    this.obj.position.set(x, groundY(x, z) + def.y, z);
    this.obj.rotation.y = Math.random() * 6.28;
    this.phase = Math.random() * 6.28;
    this.flight = null;
    this.dead = false;
    this.haloSize = def.ring[1];
    this.halo = new THREE.Mesh(haloGeo, haloMats[type]);
    this.halo.position.y = 0.05;
    this.halo.scale.setScalar(this.haloSize);
    this.obj.add(this.halo);
    scene.add(this.obj);
  }

  launch(from, dir, dist) {
    const to = new THREE.Vector3(from.x + dir.x * dist, 0, from.z + dir.z * dist);
    const r = Math.hypot(to.x, to.z);
    if (r > R_MAX + 2) to.multiplyScalar((R_MAX + 2) / r);
    to.y = groundY(to.x, to.z) + this.def.y;

    const T = 0.34 + dist * 0.048;
    const g = -26;
    this.obj.position.copy(from);
    this.halo.visible = false;
    this.flight = {
      t: 0, T,
      vx: (to.x - from.x) / T,
      vz: (to.z - from.z) / T,
      vy: (to.y - from.y - 0.5 * g * T * T) / T,
      g, to,
      spin: (Math.random() - 0.5) * 14,
    };
  }

  update(dt, waterY) {
    const p = this.obj.position;
    if (this.flight) {
      const f = this.flight;
      f.t += dt;
      f.vy += f.g * dt;
      p.x += f.vx * dt; p.z += f.vz * dt; p.y += f.vy * dt;
      this.mesh.rotation.x += f.spin * dt;
      this.mesh.rotation.z += f.spin * 0.6 * dt;
      const gy = groundY(p.x, p.z) + this.def.y;
      if (f.t >= f.T || p.y <= gy) {
        p.y = gy;
        this.mesh.rotation.set(0, 0, 0);
        this.flight = null;
        this.halo.visible = true;
        sfx.land();
        const splashy = waterY > groundY(p.x, p.z);
        burst(p.x, p.y + 0.1, p.z, 8, {
          color: splashy ? 0xdff6ff : 0xe0c894, spread: 2.2, up: 2.6, size: 0.24,
          lifeMin: 0.2, lifeMax: 0.45,
        });
        ripple(p.x, groundY(p.x, p.z), p.z, splashy ? 0x9fe8ff : 0xffe6a8, 3.4, 0.45);
      }
      return;
    }
    this.phase += dt;
    const base = groundY(p.x, p.z) + this.def.y;
    p.y = base + Math.sin(this.phase * 2.1) * 0.055;
    this.obj.rotation.y += (this.def.spin || 0.7) * dt;
    this.halo.scale.setScalar(this.haloSize * (1 + Math.sin(this.phase * 2.4) * 0.05));
  }

  remove() { scene.remove(this.obj); this.dead = true; }
}

/** Distribute loot over the seabed by depth band. */
export function spawnLoot(plan, out) {
  // Loot starts a real run away from the bank. Spawning it right on the beach
  // made shuttling the shallow ring strictly better than diving deep.
  const inner = R_SHORE + 5, outer = R_MAX - 2;
  for (const type in plan) {
    const def = LOOT[type];
    for (let i = 0; i < plan[type]; i++) {
      const t = def.band[0] + Math.random() * (def.band[1] - def.band[0]);
      const rad = inner + t * (outer - inner);
      const a = Math.random() * Math.PI * 2;
      const jitter = (Math.random() - 0.5) * 3;
      out.push(new Loot(type, Math.cos(a) * (rad + jitter), Math.sin(a) * (rad + jitter)));
    }
  }
  return out;
}

/* ------------------------------------- mobs ---------------------------------------- */

const MOB_A = { idle: 'idle', attack: 'attack', hit: 'hit' };

// The creature rigs are authored facing -Z, gameplay yaw points +Z at the target.
const MOB_FACING = Math.PI;

class Mob {
  constructor(key, scale) {
    const r = rig(key);
    this.obj = new THREE.Group();
    this.model = r.object;
    this.model.scale.setScalar(scale / 15);
    this.model.rotation.y = MOB_FACING;
    const box = new THREE.Box3().setFromObject(this.model);
    this.model.position.y = -box.min.y;
    addOutline(this.model, { thickness: 0.9, color: 0x1b1020 });
    this.obj.add(this.model);
    this.mixer = r.mixer;
    this.actions = r.actions;
    this.cur = null;
    this.play(MOB_A.idle);
    scene.add(this.obj);
    this.cooldown = 0;
  }
  play(name, fade = 0.2) {
    const a = this.actions[name];
    if (!a || a === this.cur) return;
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.cur) this.cur.fadeOut(fade);
    this.cur = a;
  }
  faceTo(x, z, dt, rate = 6) {
    const want = Math.atan2(x - this.obj.position.x, z - this.obj.position.z);
    let d = want - this.obj.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.obj.rotation.y += d * Math.min(1, dt * rate);
  }
  remove() { scene.remove(this.obj); }
}

/** Guards the deep. Dormant until you come close, then commits. */
export class DeepOne extends Mob {
  constructor(x, z) {
    super('deepone', 0.62);
    this.home = new THREE.Vector2(x, z);
    this.obj.position.set(x, groundY(x, z), z);
    this.awake = false;
    this.wakeT = 0;
    this.speed = 6.4;
    this.aggro = 11;
    this.reach = 1.5;   // stops at arm's length instead of walking into the player
  }
  update(dt, player, world) {
    const p = this.obj.position;
    const dx = player.pos.x - p.x, dz = player.pos.z - p.z;
    const d = Math.hypot(dx, dz);
    const inVillage = Math.hypot(player.pos.x, player.pos.z) < R_VILLAGE;

    if (inVillage) {
      this.awake = false;
      this.wakeT = 0;
      this.cooldown = 0;
    } else if (!this.awake && d < this.aggro) {
      this.awake = true; this.wakeT = 0.55;
      this.play(MOB_A.attack, 0.1);
      popup('!', p.x, p.y + 3.4, p.z, '#8ef2c6', 0.8);
      sfx.wake();
    }
    if (this.awake) {
      this.wakeT -= dt;
      const homeD = Math.hypot(p.x - this.home.x, p.z - this.home.y);
      const giveUp = d > this.aggro * 2.1 || homeD > 26;
      if (giveUp) { this.awake = false; this.play(MOB_A.idle); }
      else if (this.wakeT <= 0) {
        this.play(MOB_A.attack, 0.25);
        // Never step past the player. Overshooting flips the direction every
        // frame, which reads as the creature vibrating in place.
        const step = Math.min(this.speed * dt, d - this.reach);
        if (step > 0) { p.x += (dx / d) * step; p.z += (dz / d) * step; }
        if (d > 0.9) this.faceTo(player.pos.x, player.pos.z, dt, 5);
      }
    } else {
      const hx = this.home.x - p.x, hz = this.home.y - p.z;
      const hd = Math.hypot(hx, hz);
      if (hd > 0.6) { const s = 3 * dt / hd; p.x += hx * s; p.z += hz * s; }
      this.play(MOB_A.idle);
    }
    p.y = Math.max(groundY(p.x, p.z), world.waterY - 2.2);
    this.mixer.update(dt);

    this.cooldown -= dt;
    if (!inVillage && d < 1.9 && this.cooldown <= 0 && this.awake) {
      this.cooldown = 1.4;
      return new THREE.Vector3(-dx / d, 0, -dz / d);
    }
    return null;
  }
}

/** Rides the incoming tide. Only exists where there is water. */
export class Shark extends Mob {
  constructor(angle) {
    super('shark', 1.15);
    this.angle = angle;
    this.rad = R_MAX + 4;
    this.speed = 9.5;
    this.fin = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 1.1, 4),
      new THREE.MeshLambertMaterial({ color: 0x3d4f5c })
    );
    this.fin.rotation.y = Math.PI / 4;
    scene.add(this.fin);
  }
  update(dt, player, world) {
    const p = this.obj.position;
    const px = player.pos.x, pz = player.pos.z;
    const playerWet = player.depth > 0.5;

    let tx, tz;
    if (playerWet) {
      tx = px; tz = pz;
    } else {
      // patrol the waterline
      this.angle += dt * 0.45;
      tx = Math.cos(this.angle) * (world.tideR + 3);
      tz = Math.sin(this.angle) * (world.tideR + 3);
    }
    const dx = tx - p.x, dz = tz - p.z;
    const d = Math.max(0.001, Math.hypot(dx, dz));
    const reach = playerWet ? 1.7 : 0;
    const step = Math.min((playerWet ? this.speed * 1.25 : this.speed * 0.6) * dt, d - reach);
    if (step > 0) { p.x += (dx / d) * step; p.z += (dz / d) * step; }

    // never beach itself
    const r = Math.hypot(p.x, p.z);
    const minR = world.tideR - 1.5;
    if (r < minR) { const k = minR / r; p.x *= k; p.z *= k; }

    p.y = world.waterY - 0.55;
    if (d > 0.9) this.faceTo(tx, tz, dt, 4);
    this.play(playerWet ? MOB_A.attack : MOB_A.idle, 0.3);
    this.mixer.update(dt);

    this.fin.position.set(p.x, world.waterY + 0.35, p.z);
    this.fin.rotation.z = Math.sin(performance.now() * 0.004) * 0.12;

    this.cooldown -= dt;
    const pd = Math.hypot(px - p.x, pz - p.z);
    if (pd < 2.3 && this.cooldown <= 0 && playerWet) {
      this.cooldown = 1.6;
      return new THREE.Vector3((px - p.x) / pd, 0, (pz - p.z) / pd);
    }
    return null;
  }
  remove() { super.remove(); scene.remove(this.fin); }
}

/** Pure spectacle: the closing surge of the flood. */
export class LivingWave extends Mob {
  constructor(angle) {
    super('wave', 0.62);
    this.angle = angle;
    this.rad = R_MAX + 16;
    this.obj.position.set(Math.cos(angle) * this.rad, 0, Math.sin(angle) * this.rad);
    this.play(MOB_A.attack, 0.1);
  }
  update(dt, player, world) {
    this.rad -= dt * 17;
    const p = this.obj.position;
    p.x = Math.cos(this.angle) * this.rad;
    p.z = Math.sin(this.angle) * this.rad;
    p.y = world.waterY - 1.4;
    // it travels straight at the island, so face the middle
    this.obj.rotation.y = Math.atan2(-Math.cos(this.angle), -Math.sin(this.angle));
    this.mixer.update(dt);
    if (Math.random() < dt * 9) {
      burst(p.x, world.waterY + 0.5, p.z, 2,
        { color: 0xeafaff, spread: 2.4, up: 3.4, size: 0.3, lifeMin: 0.3, lifeMax: 0.65 });
    }
    return this.rad < R_VILLAGE ? 'done' : null;
  }
}
