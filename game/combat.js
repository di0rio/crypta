import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng } from './noise.js';

// Enemies of the wild: shades that stalk and lunge, stone sentinels that fire slow orbs (the sword can bat them back),
// healing motes dropped by the fallen. All sword hits are resolved here.

const V2 = (p) => new THREE.Vector2(p[0], p[1]);

function buildShade() {
  const g = new THREE.Group();
  const cloak = new THREE.MeshStandardMaterial({ color: '#2b2145', roughness: 0.75 });
  const eyeM = new THREE.MeshStandardMaterial({ color: '#ffd0a0', emissive: '#ff6a2a', emissiveIntensity: 3 });
  const body = new THREE.Mesh(new THREE.LatheGeometry([[0.001, 0], [0.75, 0.05], [0.95, 0.5], [0.8, 1.3], [0.55, 1.9], [0.62, 2.3], [0.5, 2.75], [0.001, 3.0]].map(V2), 14), cloak);
  body.castShadow = true; g.add(body);
  [-0.22, 0.22].forEach((x) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), eyeM); e.position.set(x, 2.35, 0.5); g.add(e); });
  [-1, 1].forEach((s) => { const h = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 6), cloak); h.position.set(s * 0.38, 3.0, 0); h.rotation.z = -s * 0.5; h.castShadow = true; g.add(h); });
  return { g, eyeM, body };
}
function buildSentinel() {
  const g = new THREE.Group();
  const st = new THREE.MeshStandardMaterial({ color: '#9a917f', roughness: 0.9 });
  const eyeM = new THREE.MeshStandardMaterial({ color: '#c8f6ff', emissive: '#39c6ff', emissiveIntensity: 2 });
  [[1.9, 0.6, 1.9, 0.3], [1.3, 2.2, 1.3, 1.7], [1.7, 0.5, 1.7, 3.05], [1.0, 1.0, 1.0, 3.8]].forEach(([w, h, d, y]) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.12), st); m.position.y = y; m.castShadow = m.receiveShadow = true; g.add(m);
  });
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), eyeM); eye.position.set(0, 3.8, 0.45); g.add(eye);
  return { g, eyeM };
}

export function createCombat(scene, world, player, fx, audio, ui) {
  const R = rng(4242), enemies = [], orbs = [], motes = [];
  const orbGeo = new THREE.SphereGeometry(0.42, 12, 8), moteGeo = new THREE.SphereGeometry(0.28, 10, 8);

  function spawn(type, x, z) {
    const b = type === 'shade' ? buildShade() : buildSentinel();
    scene.add(b.g);
    const e = { type, g: b.g, eyeM: b.eyeM, x, z, hx: x, hz: z, vx: 0, vz: 0, hp: type === 'shade' ? 3 : 4, max: type === 'shade' ? 3 : 4,
      st: 'idle', t: R() * 2, wx: x, wz: z, face: R() * 6.28, hitId: -1, dead: false, flash: 0, dx: 0, dz: 1, r: type === 'shade' ? 0.9 : 1.2 };
    e.g.position.set(x, world.getHeight(x, z), z);
    enemies.push(e);
    return e;
  }
  // population: one shade as a first lesson, then guards at every ruin and along the far trail
  world.sites.forEach((s, i) => {
    if (i === 0) { spawn('shade', s.x + 26, s.z + 6); return; }
    if (s.kind === 'gate') {
      if (i > 1) spawn('sentinel', s.x + 10, s.z + 10);
      spawn('shade', s.x - 9, s.z + 8); if (i > 1) spawn('shade', s.x + 9, s.z - 9);
    } else {
      const n = 2 + (i % 2);
      for (let k = 0; k < n; k++) { const a = R() * 6.28; spawn('shade', s.x + Math.cos(a) * (s.r + 6), s.z + Math.sin(a) * (s.r + 6)); }
      if (i % 3 === 0) spawn('sentinel', s.x + s.r + 9, s.z);
    }
  });
  [7, 8, 9, 10].forEach((i) => { const t = world.trail[i]; if (world.getHeight(t[0], t[1]) > 2) { spawn('shade', t[0] + 12, t[1] + 4); spawn('shade', t[0] - 11, t[1] - 5); if (i > 8) spawn('sentinel', t[0] + 14, t[1] - 12); } });

  function drop(x, y, z) {
    const m = new THREE.Mesh(moteGeo, new THREE.MeshStandardMaterial({ color: '#d8ffd0', emissive: '#5dff8a', emissiveIntensity: 3 }));
    m.position.set(x, y, z); scene.add(m); motes.push({ m, x, y, z, vy: 5, t: 0 });
  }
  function fire(e, tx, tz) {
    const m = new THREE.Mesh(orbGeo, new THREE.MeshStandardMaterial({ color: '#c8f6ff', emissive: '#39c6ff', emissiveIntensity: 4 }));
    const y = world.getHeight(e.x, e.z) + 3.6, dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz) || 1;
    m.position.set(e.x, y, e.z); scene.add(m);
    orbs.push({ m, x: e.x, y, z: e.z, vx: dx / d * 10, vz: dz / d * 10, life: 5, back: false });
    audio.orb();
  }
  function damage(e, dmg, fromX, fromZ, kb) {
    e.hp -= dmg; e.flash = 0.18;
    const dx = e.x - fromX, dz = e.z - fromZ, d = Math.hypot(dx, dz) || 1;
    if (e.type === 'shade') { e.vx = dx / d * kb; e.vz = dz / d * kb; e.st = 'hurt'; e.t = 0.32; }
    fx.hit(e.x, e.g.position.y + 1.8, e.z, e.type === 'shade' ? '#ff8a4a' : '#7fe0ff');
    if (e.hp <= 0 && !e.dead) {
      e.dead = true; e.st = 'dying'; e.t = 0.45; audio.kill();
      fx.smoke(e.x, e.g.position.y + 0.6, e.z, e.type === 'shade' ? '#3a2d5c' : '#b9b0a0', 14, 1.4);
      if (R() < 0.55 || player.hp < 45) drop(e.x, e.g.position.y + 1.6, e.z);
      ui.kill();
    }
  }
  const out = { x: 0, y: 0, z: 0 };

  return {
    enemies, orbs,
    alive() { return enemies.filter((e) => !e.dead).length; },
    reset() {                                   // after the wanderer falls: the living go home and mend
      enemies.forEach((e) => { if (!e.dead) { e.x = e.hx; e.z = e.hz; e.hp = e.max; e.st = 'idle'; e.vx = e.vz = 0; } });
      orbs.forEach((o) => scene.remove(o.m)); orbs.length = 0;
    },
    update(dt, elapsed) {
      const p = player.pos, alive = player.dead <= 0;
      const hx = Math.sin(player.heading), hz = Math.cos(player.heading);
      const sw = player.atk > 0 ? 1 - player.atk / 0.3 : -1, swinging = sw > 0.15 && sw < 0.8;
      const finisher = player.atkN === 2;

      for (const e of enemies) {
        if (e.st === 'gone') continue;
        const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz);
        if (d > 75 && e.st !== 'dying') continue;                       // asleep when far away
        const gy = world.getHeight(e.x, e.z);
        e.t -= dt; if (e.flash > 0) e.flash -= dt;

        // the wanderer's sword
        if (swinging && !e.dead && e.hitId !== player.atkId && d < 3.2 + e.r && (dx * -hx + dz * -hz) / (d || 1) > 0.15 && Math.abs(p.y - gy) < 3.5) {
          e.hitId = player.atkId;
          damage(e, finisher ? 2 : 1, p.x, p.z, finisher ? 14 : 9);
          audio.hit(); ui.hitstop(finisher ? 0.09 : 0.05, finisher ? 0.16 : 0.08);
        }

        if (e.type === 'shade') {
          let mvx = 0, mvz = 0;
          if (e.st === 'idle') {
            if (e.t <= 0) { e.t = 2 + R() * 3; const a = R() * 6.28; e.wx = e.hx + Math.cos(a) * 5; e.wz = e.hz + Math.sin(a) * 5; }
            const wd = Math.hypot(e.wx - e.x, e.wz - e.z); if (wd > 0.5) { mvx = (e.wx - e.x) / wd * 1.4; mvz = (e.wz - e.z) / wd * 1.4; }
            if (d < 16 && alive) { e.st = 'chase'; e.t = 0.4; }
          } else if (e.st === 'chase') {
            if (!alive || d > 32) e.st = 'idle';
            else if (d < 5.4 && e.t <= 0) { e.st = 'wind'; e.t = 0.5; }
            else { const side = Math.sin(elapsed * 1.3 + e.hx) * 0.5; mvx = (dx / d - dz / d * side) * 4.8; mvz = (dz / d + dx / d * side) * 4.8; }
          } else if (e.st === 'wind') {                                    // telegraph: swell and flare
            if (e.t <= 0) { e.st = 'lunge'; e.t = 0.34; e.dx = dx / (d || 1); e.dz = dz / (d || 1); e.hitP = false; }
          } else if (e.st === 'lunge') {
            mvx = e.dx * 17; mvz = e.dz * 17;
            if (!e.hitP && d < 1.7 && Math.abs(p.y - gy) < 2.2) { e.hitP = true; player.hurt(20, e.x, e.z); }
            if (e.t <= 0) { e.st = 'rest'; e.t = 0.8; }
          } else if (e.st === 'rest') { if (e.t <= 0) { e.st = 'chase'; e.t = 0.5; } }
          else if (e.st === 'hurt') { e.vx *= Math.exp(-7 * dt); e.vz *= Math.exp(-7 * dt); mvx = e.vx; mvz = e.vz; if (e.t <= 0) { e.st = 'chase'; e.t = 0.25; } }
          else if (e.st === 'dying') { if (e.t <= 0) { e.st = 'gone'; scene.remove(e.g); continue; } }
          e.x += mvx * dt; e.z += mvz * dt;
          out.x = e.x; out.z = e.z; out.y = gy; world.resolve(out, e.r, null); e.x = out.x; e.z = out.z;
          if (e.st !== 'lunge' && e.st !== 'wind' && d > 0.1) e.face = Math.atan2(dx, dz);
          const k = e.st === 'wind' ? 1 + (0.5 - e.t) * 0.5 : e.st === 'dying' ? Math.max(0.01, e.t / 0.45) : 1;
          e.g.scale.set(k, e.st === 'lunge' ? 0.75 : e.st === 'dying' ? k : 1 + Math.sin(elapsed * 3 + e.hx) * 0.04, k);
          e.g.position.set(e.x, world.getHeight(e.x, e.z) + 0.15 + Math.sin(elapsed * 2.2 + e.hz) * 0.12, e.z);
          e.g.rotation.y = e.face; e.g.rotation.x = e.st === 'lunge' ? 0.5 : e.st === 'hurt' ? -0.35 : 0;
          e.eyeM.emissiveIntensity = e.flash > 0 ? 12 : e.st === 'wind' ? 3 + (0.5 - e.t) * 18 : 3;
        } else {                                                           // sentinel
          if (e.st === 'dying') { e.g.scale.setScalar(Math.max(0.01, e.t / 0.45)); if (e.t <= 0) { e.st = 'gone'; scene.remove(e.g); } continue; }
          if (e.st === 'idle') { if (d < 26 && alive && e.t <= 0) { e.st = 'aim'; e.t = 0.6; } }
          else if (e.st === 'aim') { if (e.t <= 0) { fire(e, p.x + player.vel.x * 0.6, p.z + player.vel.z * 0.6); e.st = 'idle'; e.t = 2.1; } }
          if (d > 0.1) e.g.rotation.y = Math.atan2(dx, dz);
          e.eyeM.emissiveIntensity = e.flash > 0 ? 14 : e.st === 'aim' ? 2 + (0.6 - e.t) * 16 : 2;
        }
        // bodies do not overlap the wanderer
        if (!e.dead && d < e.r + 0.7 && d > 1e-3) { const push = (e.r + 0.7 - d); p.x -= dx / d * push * 0.5; p.z -= dz / d * push * 0.5; }
      }

      // sentinel orbs: dodge them, or swing at the right moment to send them back
      for (let i = orbs.length - 1; i >= 0; i--) {
        const o = orbs[i]; o.life -= dt; o.x += o.vx * dt; o.z += o.vz * dt;
        o.y += (world.getHeight(o.x, o.z) + 1.9 - o.y) * Math.min(1, dt * 5);
        o.m.position.set(o.x, o.y, o.z); o.m.scale.setScalar(1 + Math.sin(elapsed * 14) * 0.12);
        const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
        let done = o.life <= 0;
        if (!o.back) {
          if (swinging && d < 3.4 && (dx * -hx + dz * -hz) > 0) {
            let tgt = null, td = 60; for (const e of enemies) if (!e.dead) { const ed = Math.hypot(e.x - o.x, e.z - o.z); if (ed < td) { td = ed; tgt = e; } }
            const tx = tgt ? tgt.x - o.x : hx, tz = tgt ? tgt.z - o.z : hz, tl = Math.hypot(tx, tz) || 1;
            o.vx = tx / tl * 22; o.vz = tz / tl * 22; o.back = true; o.life = 3; o.m.material.emissive.set('#ffd36b');
            audio.parry(); ui.hitstop(0.07, 0.1); fx.hit(o.x, o.y, o.z, '#ffd36b');
          } else if (d < 1.2 && Math.abs(p.y + 1.4 - o.y) < 2.2) { if (player.hurt(15, o.x, o.z)) done = true; }
        } else for (const e of enemies) if (!e.dead && Math.hypot(e.x - o.x, e.z - o.z) < e.r + 0.9) { damage(e, 2, o.x - o.vx, o.z - o.vz, 12); audio.hit(); done = true; break; }
        if (done) { fx.hit(o.x, o.y, o.z, '#7fe0ff'); scene.remove(o.m); orbs.splice(i, 1); }
      }

      // healing motes
      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i]; m.t += dt;
        const dx = p.x - m.x, dz = p.z - m.z, d = Math.hypot(dx, dz);
        if (d < 6 && alive) { const k = Math.min(1, dt * (3 + m.t * 4)); m.x += dx * k; m.z += dz * k; m.y += (p.y + 1.5 - m.y) * k; }
        else { m.vy -= 14 * dt; m.y = Math.max(world.getHeight(m.x, m.z) + 0.6, m.y + m.vy * dt); }
        m.m.position.set(m.x, m.y + Math.sin(elapsed * 4 + i) * 0.1, m.z);
        if (d < 1.2 && alive) { player.hp = Math.min(player.maxHp, player.hp + 20); audio.heal(); fx.hit(m.x, m.y, m.z, '#8dffa8'); scene.remove(m.m); motes.splice(i, 1); }
        else if (m.t > 40) { scene.remove(m.m); motes.splice(i, 1); }
      }
    }
  };
}
