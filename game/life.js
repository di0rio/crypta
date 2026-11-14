import * as THREE from 'three';
import { rng } from './noise.js';

// Small birds in flocks on the ground. Come close and they burst into the air and fly off; they settle again later.

export function createLife(scene, world, player, audio) {
  const R = rng(909), birds = [], flocks = [];
  const spots = [];
  world.trail.forEach((t, i) => { if (i > 0 && i < 10) spots.push([t[0] + (i % 2 ? 9 : -10), t[1] + 6]); });
  world.sites.forEach((s) => spots.push([s.x + s.r + 5, s.z - 7]));
  for (let i = 0; i < 10; i++) spots.push([(R() - 0.5) * 420, (R() - 0.5) * 420 - 60]);
  spots.forEach(([x, z]) => {
    if (world.getHeight(x, z) < 2.5) return;
    const f = { x, z, st: 0, t: 0, from: birds.length, n: 4 + Math.floor(R() * 4) };
    for (let k = 0; k < f.n; k++) {
      const a = R() * 6.28, r = R() * 2.6;
      birds.push({ hx: x + Math.cos(a) * r, hz: z + Math.sin(a) * r, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: R() * 6.28, ph: R() * 6, delay: R() * 0.35, hop: R() * 3, col: k });
    }
    flocks.push(f);
  });
  const N = birds.length;
  const bodyM = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 });
  const body = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 8, 6).scale(0.8, 0.8, 1.5), bodyM, N);
  const wingGeo = new THREE.PlaneGeometry(0.5, 0.26).translate(0.25, 0, 0).rotateX(-Math.PI / 2);
  const wingM = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, side: THREE.DoubleSide });
  const wingL = new THREE.InstancedMesh(wingGeo, wingM, N), wingR = new THREE.InstancedMesh(wingGeo, wingM, N);
  const cols = ['#f4f1e8', '#e9c46a', '#7fb7e6', '#e87a5a'].map((c) => new THREE.Color(c));
  birds.forEach((b, i) => { b.x = b.hx; b.z = b.hz; b.y = world.getHeight(b.hx, b.hz) + 0.2; const c = cols[(Math.floor(b.hx) + b.col) & 3]; body.setColorAt(i, c); wingL.setColorAt(i, c); wingR.setColorAt(i, c); });
  body.castShadow = true; body.frustumCulled = wingL.frustumCulled = wingR.frustumCulled = false;
  scene.add(body, wingL, wingR);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), qw = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0);

  return {
    count: N,
    update(dt, elapsed) {
      const pp = player.pos, speed = Math.hypot(player.vel.x, player.vel.z);
      for (const f of flocks) {
        const d = Math.hypot(pp.x - f.x, pp.z - f.z);
        f.t += dt;
        if (f.st === 0 && d < (speed > 7 ? 13 : 8.5)) {                    // startled
          f.st = 1; f.t = 0; if (d < 40) audio.rustle();
          for (let i = f.from; i < f.from + f.n; i++) {
            const b = birds[i], ax = b.x - pp.x, az = b.z - pp.z, al = Math.hypot(ax, az) || 1, sp = 7 + R() * 4;
            b.vx = ax / al * sp + (R() - 0.5) * 3; b.vz = az / al * sp + (R() - 0.5) * 3; b.vy = 4.5 + R() * 2.5; b.delay = R() * 0.4;
          }
        } else if (f.st === 1 && f.t > 7) { f.st = 2; f.t = 0; }
        else if (f.st === 2 && f.t > 18 && d > 45) {                        // they come back once it is quiet
          f.st = 0; for (let i = f.from; i < f.from + f.n; i++) { const b = birds[i]; b.x = b.hx; b.z = b.hz; b.y = world.getHeight(b.hx, b.hz) + 0.2; }
        }
        const live = d < 110;
        for (let i = f.from; i < f.from + f.n; i++) {
          const b = birds[i]; let flap = 0, sc = 1;
          if (f.st === 2 || !live) sc = 0;
          else if (f.st === 1) {
            if (f.t > b.delay) {
              b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vy += (2.2 - b.vy) * dt * 0.8;
              b.yaw = Math.atan2(b.vx, b.vz); flap = Math.sin(elapsed * 26 + b.ph) * 1.0;
              sc = Math.max(0, 1 - Math.max(0, f.t - 5.5) / 1.5);
            }
          } else {                                                          // pecking and hopping about
            b.hop -= dt;
            if (b.hop <= 0) { b.hop = 0.8 + R() * 2.5; b.yaw += (R() - 0.5) * 2; b.x += Math.sin(b.yaw) * 0.25; b.z += Math.cos(b.yaw) * 0.25; }
            b.y = world.getHeight(b.x, b.z) + 0.2 + Math.max(0, Math.sin((b.hop % 0.3) / 0.3 * Math.PI)) * 0.06;
            flap = -1.25;                                                   // folded
          }
          p.set(b.x, b.y, b.z); s.setScalar(sc);
          q.setFromEuler(e.set(f.st === 0 ? Math.sin(elapsed * 3 + b.ph) * 0.25 + 0.2 : -0.15, b.yaw, 0));
          m.compose(p, q, sc ? s : zero); body.setMatrixAt(i, m);
          qw.setFromEuler(e.set(0, 0, flap)); qw.premultiply(q); m.compose(p, qw, sc ? s : zero); wingL.setMatrixAt(i, m);
          qw.setFromEuler(e.set(0, Math.PI, -flap)); qw.premultiply(q); m.compose(p, qw, sc ? s : zero); wingR.setMatrixAt(i, m);
        }
      }
      body.instanceMatrix.needsUpdate = wingL.instanceMatrix.needsUpdate = wingR.instanceMatrix.needsUpdate = true;
    }
  };
}
