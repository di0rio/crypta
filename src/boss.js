import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { patch } from './shade.js';

// The Colossus: a stone giant asleep at the foot of the Spire. It wakes once enough embers are gathered.
// Its crystals (two knees, then the chest) are the only places the sword bites, and only while they are exposed:
// after a stomp the leg is stuck for a moment; with both knees broken it falls to its knees and bares the chest.

export const NEED = 10;                 // embers required to wake it

const lerp = (a, b, t) => a + (b - a) * t;

export function createBoss(scene, world, player, fx, audio, ui, quest) {
  const A = world.arena, HOME = { x: A.x, z: A.z - 18 };
  const stone = patch(new THREE.MeshStandardMaterial({ color: '#b9ad98', roughness: 0.9 }), 'stone');
  const stoneD = patch(new THREE.MeshStandardMaterial({ color: '#8f8472', roughness: 0.9 }), 'stone');
  const eyeM = new THREE.MeshStandardMaterial({ color: '#201a14', emissive: '#ff7a2a', emissiveIntensity: 0 });
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.16), m); b.position.set(x || 0, y || 0, z || 0); b.castShadow = b.receiveShadow = true; return b; };
  const grp = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); parent.add(g); return g; };
  function crystal(parent, x, y, z, hp) {
    const mat = new THREE.MeshStandardMaterial({ color: '#d6fbff', emissive: '#2fd0ff', emissiveIntensity: 1.2 });
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.95, 0), mat); m.position.set(x, y, z); m.scale.set(1, 1.5, 0.7); parent.add(m);
    return { m, mat, hp, max: hp, hitId: -1, wp: new THREE.Vector3() };
  }

  const root = new THREE.Group(); scene.add(root);
  const hips = grp(root, 0, 6.9, 0); hips.add(box(4.4, 1.9, 2.8, stoneD));
  const torso = grp(hips, 0, 1.0, 0); torso.add(box(5.8, 5.0, 3.6, stone, 0, 2.6, 0)); torso.add(box(6.6, 1.4, 4.0, stoneD, 0, 4.9, 0));
  const head = grp(torso, 0, 6.4, 0.2); head.add(box(2.7, 2.5, 2.7, stone, 0, 0.6, 0)); head.add(box(1.9, 0.38, 0.3, eyeM, 0, 0.7, 1.3));
  const arm = (s) => { const sh = grp(torso, s * 3.9, 4.4, 0); sh.add(box(1.7, 3.8, 1.7, stone, 0, -1.7, 0)); const el = grp(sh, 0, -3.6, 0); el.add(box(1.9, 3.4, 1.9, stoneD, 0, -1.6, 0)); el.add(box(2.5, 2.2, 2.5, stone, 0, -4.0, 0)); return [sh, el]; };
  const leg = (s) => { const hp = grp(hips, s * 1.5, -0.4, 0); hp.add(box(2.0, 3.2, 2.0, stone, 0, -1.5, 0)); const kn = grp(hp, 0, -3.1, 0); kn.add(box(2.2, 3.0, 2.2, stoneD, 0, -1.4, 0)); kn.add(box(2.6, 1.0, 3.6, stone, 0, -3.0, 0.5)); return [hp, kn]; };
  const [shL, elL] = arm(1), [shR, elR] = arm(-1), [hipL, kneeL] = leg(1), [hipR, kneeR] = leg(-1);
  const crystals = [crystal(kneeL, 0, 0.1, 1.25, 4), crystal(kneeR, 0, 0.1, 1.25, 4), crystal(torso, 0, 3.0, 2.0, 9)];

  // ground telegraphs and effects
  const ringM = new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const waves = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 48).rotateX(Math.PI / 2), ringM.clone()); m.visible = false; scene.add(m); return { m, r: 0, on: false, hitP: false }; });
  const markM = new THREE.MeshBasicMaterial({ color: '#ff5a3a', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const fan = new THREE.Mesh(new THREE.CircleGeometry(17, 24, Math.PI / 2 - 1.15, 2.3).rotateX(-Math.PI / 2), markM.clone()); scene.add(fan);
  const rocks = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), stoneD); m.castShadow = true; m.visible = false; scene.add(m);
    const mark = new THREE.Mesh(new THREE.CircleGeometry(4.5, 28).rotateX(-Math.PI / 2), markM.clone()); scene.add(mark);
    return { m, mark, on: false, t: 0, sx: 0, sy: 0, sz: 0, tx: 0, tz: 0 };
  });

  const S = { st: 'sleep', t: 0, x: HOME.x, z: HOME.z, face: 0, cd: 2, phase: 0, walk: 0, slam: false, told: 0, deadT: 0, kneels: 0 };
  // joint targets per pose: [hipsY, torsoX, headX, shLx, shLz, elLx, shRx, shRz, elRx, hipLx, kneeLx, hipRx, kneeRx]
  const POSE = {
    sleep: [2.4, 1.15, 0.5, -0.9, 0.3, -1.6, -0.9, -0.3, -1.6, -1.5, 2.3, -1.5, 2.3],
    stand: [6.9, 0.08, 0, 0.05, 0.12, -0.2, 0.05, -0.12, -0.2, 0, 0.05, 0, 0.05],
    lift: [6.7, -0.12, -0.1, -0.5, 0.5, -0.4, -0.5, -0.5, -0.4, 0, 0.05, -1.25, 1.5],
    stuck: [5.6, 0.35, 0.2, 0.3, 0.3, -0.5, 0.3, -0.3, -0.5, -0.35, 0.8, -0.75, 1.3],
    windup: [6.8, -0.1, 0, 0.1, 0.2, -0.3, -2.4, -0.9, -0.5, 0.1, 0.1, -0.1, 0.1],
    swing: [6.5, 0.35, 0.1, 0.3, 0.3, -0.3, -0.7, 1.1, -0.1, -0.2, 0.3, 0.1, 0.2],
    raise: [6.9, -0.25, -0.3, -2.9, 0.25, -0.3, -2.9, -0.25, -0.3, 0, 0.05, 0, 0.05],
    cast: [6.6, 0.45, 0.2, -0.9, 0.2, -0.2, -0.9, -0.2, -0.2, -0.1, 0.2, -0.1, 0.2],
    kneel: [3.5, 0.75, 0.45, 0.5, 0.5, -0.9, 0.5, -0.5, -0.9, -0.2, 1.75, -0.2, 1.75],
    dead: [1.6, 1.5, 0.7, 0.9, 1.0, -0.3, 0.9, -1.0, -0.3, -1.45, 1.6, -1.45, 1.6]
  };
  const cur = POSE.sleep.slice();
  const tmp = new THREE.Vector3();
  let pose = 'sleep', rate = 3, shownDeny = 0;

  function hp() { return crystals.reduce((s, c) => s + Math.max(0, c.hp), 0); }
  function total() { return crystals.reduce((s, c) => s + c.max, 0); }
  function exposed(i) { return i < 2 ? (S.st === 'stuck' || S.st === 'kneel') : (S.st === 'kneel' || (S.st === 'stuck' && crystals[0].hp <= 0 && crystals[1].hp <= 0)); }
  function setPose(name, r) { pose = name; rate = r; }
  function ground() { return world.getHeight(S.x, S.z); }
  function shock(delay) { const w = waves[delay ? 1 : 0]; w.on = true; w.r = delay ? -6 : 2.5; w.hitP = false; w.m.visible = true; }

  function reset() {
    if (S.st === 'dead') return;
    S.st = 'sleep'; S.x = HOME.x; S.z = HOME.z; S.face = 0; S.cd = 2; S.kneels = 0; setPose('sleep', 3);
    crystals.forEach((c) => { c.hp = c.max; c.m.visible = true; });
    waves.forEach((w) => { w.on = false; w.m.visible = false; }); rocks.forEach((r) => { r.on = false; r.m.visible = false; r.mark.material.opacity = 0; });
    fan.material.opacity = 0; ui.boss(null);
  }

  return {
    S, crystals, reset, hp, total,
    get dead() { return S.st === 'dead'; },
    update(dt, elapsed) {
      const p = player.pos, dx = p.x - S.x, dz = p.z - S.z, d = Math.hypot(dx, dz), gy = ground(), alive = player.dead <= 0;
      S.t -= dt; S.cd -= dt;
      const rage = S.kneels > 0 ? 0.72 : 1;                         // second act: everything comes faster

      if (S.st === 'sleep') {
        if (d < 34 && alive) {
          if (quest.count >= NEED) { S.st = 'wake'; S.t = 3.2; setPose('stand', 1.1); audio.roar(); ui.say('O Colosso desperta.'); ui.boss(1); ui.shake(0.5); }
          else if (elapsed - shownDeny > 9) { shownDeny = elapsed; ui.say('O Colosso dorme. Brasas: ' + quest.count + ' / ' + NEED); }
        }
      } else if (S.st === 'wake') {
        if (Math.random() < dt * 14) fx.smoke(S.x + (Math.random() - 0.5) * 8, gy, S.z + (Math.random() - 0.5) * 8, '#c9bda6', 1, 1.6);
        if (S.t <= 0) { S.st = 'walk'; S.cd = 1.2; }
      } else if (S.st === 'walk') {
        setPose('stand', 4);
        const want = Math.atan2(dx, dz); let da = want - S.face; da = Math.atan2(Math.sin(da), Math.cos(da));
        S.face += Math.max(-1, Math.min(1, da / (dt * 0.9 || 1))) * dt * 0.9;
        if (d > 8.5 && alive) { S.x += Math.sin(S.face) * 2.6 * dt / rage; S.z += Math.cos(S.face) * 2.6 * dt / rage; S.walk += dt * 2.2 / rage; }
        const ad = Math.hypot(S.x - A.x, S.z - A.z); if (ad > A.r - 6) { S.x = A.x + (S.x - A.x) / ad * (A.r - 6); S.z = A.z + (S.z - A.z) / ad * (A.r - 6); }
        const stepS = Math.sin(S.walk * Math.PI);
        if (Math.sign(stepS) !== S.lastStep && d > 8.5) { S.lastStep = Math.sign(stepS); audio.stomp(); ui.shake(0.12); fx.smoke(S.x, gy, S.z, '#c9bda6', 4, 1.2); }
        if (S.cd <= 0 && alive && Math.abs(da) < 0.7) {
          if (d < 11) { S.st = 'lift'; S.t = 0.95 * rage; setPose('lift', 5); }
          else if (d < 20) { S.st = 'windup'; S.t = 1.05 * rage; setPose('windup', 4); }
          else { S.st = 'raise'; S.t = 0.9 * rage; setPose('raise', 5); }
        }
        if (!alive) S.cd = 1.5;
      } else if (S.st === 'lift') {
        if (S.t <= 0) {                                                // the stomp lands
          S.st = 'stuck'; S.t = 2.7; setPose('stuck', 22);
          audio.stomp(); ui.shake(0.55); fx.smoke(S.x, gy, S.z, '#d6c9b0', 18, 2.2); shock(false); if (S.kneels > 0) shock(true);
          if (d < 4.6 && Math.abs(p.y - gy) < 3) player.hurt(30, S.x, S.z);
        }
      } else if (S.st === 'stuck') {
        if (S.t <= 0) { S.st = 'walk'; S.cd = 1.3 * rage; }
      } else if (S.st === 'windup') {
        fan.material.opacity = 0.16 + (1 - Math.max(0, S.t)) * 0.2;
        if (S.t <= 0) {
          S.st = 'swing'; S.t = 0.9; setPose('swing', 16); audio.roll(); ui.shake(0.3); fan.material.opacity = 0;
          const ang = Math.atan2(dx, dz) - S.face, a2 = Math.atan2(Math.sin(ang), Math.cos(ang));
          if (d < 17.5 && Math.abs(a2) < 1.15 && p.y - world.getHeight(p.x, p.z) < 4) player.hurt(35, S.x, S.z);
          fx.smoke(S.x + Math.sin(S.face) * 9, gy, S.z + Math.cos(S.face) * 9, '#d6c9b0', 12, 2.5);
        }
      } else if (S.st === 'swing') {
        if (S.t <= 0) { S.st = 'walk'; S.cd = 1.1 * rage; }
      } else if (S.st === 'raise') {
        if (S.t <= 0) {
          S.st = 'cast'; S.t = 1.0; setPose('cast', 14); audio.roll();
          rocks.forEach((r, i) => {
            r.on = true; r.t = 0; r.dur = 1.5 + i * 0.35; r.sx = S.x + (i ? 4 : -4); r.sz = S.z; r.sy = gy + 15;
            r.tx = p.x + player.vel.x * (0.7 + i * 0.5) + (i ? 2 : 0); r.tz = p.z + player.vel.z * (0.7 + i * 0.5);
            r.m.visible = true; r.mark.position.set(r.tx, world.getHeight(r.tx, r.tz) + 0.12, r.tz);
          });
        }
      } else if (S.st === 'cast') {
        if (S.t <= 0) { S.st = 'walk'; S.cd = 1.0 * rage; }
      } else if (S.st === 'kneel') {
        if (S.t <= 0) { S.st = 'walk'; S.cd = 1.0; ui.say('Ele se levanta.'); audio.roar(); ui.shake(0.3); }
      } else if (S.st === 'dead') {
        S.deadT += dt;
        if (S.deadT < 3 && Math.random() < dt * 20) fx.smoke(S.x + (Math.random() - 0.5) * 10, gy, S.z + (Math.random() - 0.5) * 10, '#d6c9b0', 2, 2);
      }

      // pose blending
      const tgt = POSE[pose], k = 1 - Math.exp(-rate * dt);
      for (let i = 0; i < cur.length; i++) cur[i] += (tgt[i] - cur[i]) * k;
      const ws = S.st === 'walk' ? Math.sin(S.walk * Math.PI) * 0.45 : 0;
      hips.position.y = cur[0] + (S.st === 'walk' ? Math.abs(Math.cos(S.walk * Math.PI)) * 0.25 : 0);
      torso.rotation.x = cur[1]; head.rotation.x = cur[2]; torso.rotation.y = pose === 'windup' ? -0.7 : pose === 'swing' ? 0.9 : 0;
      shL.rotation.x = cur[3] - ws * 0.5; shL.rotation.z = cur[4]; elL.rotation.x = cur[5];
      shR.rotation.x = cur[6] + ws * 0.5; shR.rotation.z = cur[7]; elR.rotation.x = cur[8];
      hipL.rotation.x = cur[9] + ws; kneeL.rotation.x = cur[10] + Math.max(0, -ws) * 0.9; hipR.rotation.x = cur[11] - ws; kneeR.rotation.x = cur[12] + Math.max(0, ws) * 0.9;
      root.position.set(S.x, gy, S.z); root.rotation.y = S.face;
      fan.position.set(S.x, gy + 0.15, S.z); fan.rotation.y = S.face;
      eyeM.emissiveIntensity = S.st === 'sleep' || S.st === 'dead' ? 0 : 3 + Math.sin(elapsed * 5) * 0.6 + (S.st === 'windup' || S.st === 'lift' || S.st === 'raise' ? 5 : 0);

      // crystals: glow when open, take the sword only then
      const sw = player.atk > 0 ? 1 - player.atk / 0.3 : -1, swinging = sw > 0.15 && sw < 0.8;
      crystals.forEach((c, i) => {
        if (c.hp <= 0) return;
        const open = exposed(i) && S.st !== 'sleep';
        c.mat.emissiveIntensity = open ? 5 + Math.sin(elapsed * 9) * 1.5 : 0.7;
        c.m.rotation.y = elapsed * (open ? 2.5 : 0.4);
        c.m.getWorldPosition(c.wp);
        if (swinging && c.hitId !== player.atkId && S.st !== 'sleep' && S.st !== 'wake' && Math.hypot(c.wp.x - p.x, c.wp.z - p.z) < 4.2 && c.wp.y - p.y < 7.5) {
          c.hitId = player.atkId;
          if (!open) { audio.clank(); fx.hit(c.wp.x, c.wp.y, c.wp.z, '#cfd6dc'); ui.hitstop(0.03, 0.05); return; }
          c.hp -= player.atkN === 2 ? 2 : 1; audio.hit(); fx.hit(c.wp.x, c.wp.y, c.wp.z, '#7fe9ff'); ui.hitstop(0.07, 0.16); ui.boss(hp() / total());
          if (c.hp <= 0) {
            c.m.visible = false; audio.crystal(); fx.sparks(c.wp.x, c.wp.y, c.wp.z); ui.hitstop(0.14, 0.4); ui.flash();
            if (crystals[2].hp <= 0) {                                   // the end
              S.st = 'dead'; S.deadT = 0; setPose('dead', 1.6); ui.boss(null); audio.roar(); audio.victory(); ui.shake(0.8); ui.win();
            } else if (crystals[0].hp <= 0 && crystals[1].hp <= 0) { S.st = 'kneel'; S.t = 7.5; S.kneels++; setPose('kneel', 3); audio.roar(); ui.shake(0.6); ui.say('Ele cai de joelhos. O peito!'); }
          }
        }
      });

      // shockwaves: jump or roll through
      waves.forEach((w) => {
        if (!w.on) return;
        w.r += 15 * dt;
        if (w.r > 0) {
          w.m.visible = true; w.m.position.set(S.x, gy + 0.3, S.z); w.m.scale.set(w.r, 6 + w.r * 0.2, w.r); w.m.material.opacity = Math.max(0, 0.75 * (1 - w.r / 30));
          if (!w.hitP && Math.abs(d - w.r) < 1.1 && p.y - world.getHeight(p.x, p.z) < 0.9) { w.hitP = true; player.hurt(25, S.x, S.z); }
        } else w.m.visible = false;
        if (w.r > 30) { w.on = false; w.m.visible = false; }
      });
      // boulders
      rocks.forEach((r) => {
        if (!r.on) { r.mark.material.opacity = Math.max(0, r.mark.material.opacity - dt * 2); return; }
        r.t += dt; const q = Math.min(1, r.t / r.dur), ty = world.getHeight(r.tx, r.tz);
        r.m.position.set(lerp(r.sx, r.tx, q), lerp(r.sy, ty, q) + Math.sin(q * Math.PI) * 16, lerp(r.sz, r.tz, q)); r.m.rotation.x += dt * 4;
        r.mark.material.opacity = 0.2 + q * 0.4;
        if (q >= 1) {
          r.on = false; r.m.visible = false; audio.stomp(); ui.shake(0.3); fx.smoke(r.tx, ty, r.tz, '#d6c9b0', 14, 2); fx.ring({ x: r.tx, y: ty, z: r.tz }, '#d6c9b0');
          if (Math.hypot(p.x - r.tx, p.z - r.tz) < 4.6 && Math.abs(p.y - ty) < 3.5) player.hurt(30, r.tx, r.tz);
        }
      });

      // its body is solid
      if (S.st !== 'dead' && d < 4.2 && d > 1e-3 && Math.abs(p.y - gy) < 9) { p.x = S.x + dx / d * 4.2; p.z = S.z + dz / d * 4.2; }
    }
  };
}
