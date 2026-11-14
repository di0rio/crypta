import * as THREE from 'three';
import { clamp, lerp } from './noise.js';

// The wanderer: built from primitives, animated procedurally (no asset files).
// Forward is +Z in model space; root.rotation.y = heading.

const mat = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85 }, o));
function part(geo, material, x, y, z) {
  const m = new THREE.Mesh(geo, material); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; return m;
}
function dampAngle(a, b, k) {
  const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * k;
}

function buildCharacter() {
  const skin = mat('#e0b089'), tunic = mat('#ece2c8'), poncho = mat('#2f7377', { side: THREE.DoubleSide }),
    ponchoTrim = mat('#e9c46a', { side: THREE.DoubleSide }), dark = mat('#3a3040'), hair = mat('#2a1c16'),
    scarfM = mat('#d63a2f'), leather = mat('#7a5232'), steel = mat('#c9ced6', { roughness: 0.35, metalness: 0.7 });

  const root = new THREE.Group(), body = new THREE.Group();
  body.position.y = 0.95; root.add(body);

  body.add(part(new THREE.BoxGeometry(0.36, 0.22, 0.24), dark, 0, 0, 0));
  const torso = part(new THREE.CapsuleGeometry(0.185, 0.3, 4, 12), tunic, 0, 0.32, 0); body.add(torso);
  body.add(part(new THREE.CylinderGeometry(0.2, 0.2, 0.07, 12), leather, 0, 0.1, 0));              // belt
  body.add(part(new THREE.ConeGeometry(0.46, 0.5, 12, 1, true), poncho, 0, 0.44, 0));
  body.add(part(new THREE.CylinderGeometry(0.465, 0.47, 0.05, 12, 1, true), ponchoTrim, 0, 0.2, 0));

  const head = new THREE.Group(); head.position.set(0, 0.8, 0); body.add(head);
  head.add(part(new THREE.SphereGeometry(0.17, 18, 14), skin));
  const hairCap = part(new THREE.SphereGeometry(0.185, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), hair, 0, 0.012, -0.012); head.add(hairCap);
  head.add(part(new THREE.ConeGeometry(0.07, 0.2, 6), hair, 0, 0.1, -0.17).rotateX(-1.9));     // tied tuft
  [-0.062, 0.062].forEach((x) => head.add(part(new THREE.SphereGeometry(0.022, 8, 6), dark, x, 0.005, 0.155)));
  head.add(part(new THREE.TorusGeometry(0.15, 0.045, 8, 16), scarfM, 0, -0.15, 0).rotateX(Math.PI / 2)); // scarf wrap

  // scarf tail: a chain of pivots trailing behind
  const scarf = []; let parent = body, sy = 0.66, sz = -0.13;
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Group(); p.position.set(i === 0 ? 0.05 : 0, i === 0 ? sy : 0, i === 0 ? sz : -0.2);
    p.add(part(new THREE.BoxGeometry(0.15 - i * 0.012, 0.035, 0.21), scarfM, 0, 0, -0.1));
    parent.add(p); scarf.push(p); parent = p;
  }

  // sword on the back
  const sword = new THREE.Group(); sword.position.set(-0.02, 0.38, -0.2); sword.rotation.z = 0.6;
  sword.add(part(new THREE.BoxGeometry(0.06, 0.82, 0.03), leather, 0, 0, 0));
  sword.add(part(new THREE.BoxGeometry(0.2, 0.035, 0.05), steel, 0, 0.43, 0));
  sword.add(part(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 6), dark, 0, 0.55, 0));
  body.add(sword);

  function limb(x, y, upLen, lowLen, r, upMat, lowMat, endGeo, endMat, endZ) {
    const a = new THREE.Group(); a.position.set(x, y, 0);
    a.add(part(new THREE.CapsuleGeometry(r, upLen - r * 2, 3, 8), upMat, 0, -upLen / 2, 0));
    const b = new THREE.Group(); b.position.y = -upLen; a.add(b);
    b.add(part(new THREE.CapsuleGeometry(r * 0.88, lowLen - r * 2, 3, 8), lowMat, 0, -lowLen / 2, 0));
    b.add(part(endGeo, endMat, 0, -lowLen, endZ));
    body.add(a);
    return [a, b];
  }
  const hand = new THREE.SphereGeometry(0.055, 8, 6), foot = new THREE.BoxGeometry(0.11, 0.09, 0.24);
  const [armL, elbowL] = limb(0.27, 0.5, 0.3, 0.27, 0.058, tunic, skin, hand, skin, 0);
  const [armR, elbowR] = limb(-0.27, 0.5, 0.3, 0.27, 0.058, tunic, skin, hand, skin, 0);
  const [legL, kneeL] = limb(0.1, -0.05, 0.43, 0.42, 0.075, dark, leather, foot, leather, 0.05);
  const [legR, kneeR] = limb(-0.1, -0.05, 0.43, 0.42, 0.075, dark, leather, foot, leather, 0.05);
  armL.rotation.z = 0.12; armR.rotation.z = -0.12;

  return { root, body, head, torso, scarf, armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR };
}

export class Player {
  constructor(scene, world, camera, dom) {
    this.world = world; this.camera = camera;
    this.rig = buildCharacter(); scene.add(this.rig.root);
    this.pos = new THREE.Vector3(0, world.getHeight(0, 6), 6);
    this.vel = new THREE.Vector3();
    this.heading = Math.PI; this.turn = 0;
    this.grounded = true; this.swim = false;
    this.stamina = 100; this.staminaWait = 0; this.exhausted = false;
    this.roll = 0; this.phase = 0; this.airT = 0; this.land = 0;
    this.yaw = 0; this.pitch = 0.2; this.dist = 5.6; this.fov = 58;
    this.camTarget = this.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
    this.keys = {}; this.active = false;
    this._sl = new THREE.Vector2(); this._v = new THREE.Vector3();
    this.pose = { legL: 0, legR: 0, kneeL: 0, kneeR: 0, armL: 0, armR: 0, elbowL: 0, elbowR: 0, armZ: 0.12, lean: 0, bob: 0, tilt: 0 };

    addEventListener('keydown', (e) => { this.keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });
    let drag = false;
    dom.addEventListener('mousedown', (e) => { if (!this.active) return; if (e.button === 2) this.keys.Roll = true; if (document.pointerLockElement !== dom) { drag = true; dom.requestPointerLock && dom.requestPointerLock(); } });
    addEventListener('mouseup', (e) => { drag = false; if (e.button === 2) this.keys.Roll = false; });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.active || (document.pointerLockElement !== dom && !drag)) return;
      this.yaw -= e.movementX * 0.0026; this.pitch = clamp(this.pitch + e.movementY * 0.0022, -0.45, 1.35);
    });
    dom.addEventListener('wheel', (e) => { this.dist = clamp(this.dist + Math.sign(e.deltaY) * 0.8, 3, 16); }, { passive: true });
  }

  update(dt, elapsed) {
    const k = this.keys, w = this.world, p = this.pos, v = this.vel;
    // arrow keys also turn the camera (keyboard-only play)
    const ax = (k.ArrowLeft ? 1 : 0) - (k.ArrowRight ? 1 : 0), ay = (k.ArrowDown ? 1 : 0) - (k.ArrowUp ? 1 : 0);
    this.yaw += ax * dt * 1.8; this.pitch = clamp(this.pitch + ay * dt * 1.1, -0.45, 1.35);

    let ix = 0, iz = 0;
    if (this.active) { ix = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0); iz = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0); }
    const il = Math.hypot(ix, iz); if (il > 0) { ix /= il; iz /= il; }
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    const wx = -sn * iz + cs * ix, wz = -cs * iz - sn * ix;

    const ground = w.getHeight(p.x, p.z);
    this.swim = ground < w.WATER - 1.15 && p.y <= w.WATER - 1.0;

    // stamina
    const wantSprint = this.active && (k.ShiftLeft || k.ShiftRight) && il > 0 && !this.exhausted && !this.swim;
    if (wantSprint && this.grounded) { this.stamina -= 13 * dt; this.staminaWait = 0.9; }
    else if (this.staminaWait > 0) this.staminaWait -= dt; else this.stamina = Math.min(100, this.stamina + 26 * dt);
    if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; }
    if (this.exhausted && this.stamina > 30) this.exhausted = false;

    // roll
    if (this.active && (k.KeyQ || k.Roll) && this.roll <= 0 && this.grounded && !this.swim && this.stamina > 18) {
      this.roll = 0.6; this.stamina -= 18; this.staminaWait = 0.9;
      if (il > 0) this.heading = Math.atan2(wx, wz);
    }
    k.Roll = false;

    const maxSpeed = this.swim ? 3.2 : wantSprint ? 10.5 : 6.2;
    if (this.roll > 0) {
      this.roll -= dt;
      const rs = 12 * Math.min(1, this.roll / 0.25 + 0.35);
      v.x = Math.sin(this.heading) * rs; v.z = Math.cos(this.heading) * rs;
    } else {
      const acc = this.grounded || this.swim ? 11 : 2.5, kk = 1 - Math.exp(-acc * dt);
      v.x += (wx * maxSpeed - v.x) * kk; v.z += (wz * maxSpeed - v.z) * kk;
    }

    // steep slopes push back down
    w.getSlope(p.x, p.z, this._sl);
    const steep = this._sl.length();
    if (this.grounded && steep > 1.0) { const f = (steep - 1.0) * 22 * dt; v.x -= this._sl.x / steep * f; v.z -= this._sl.y / steep * f; }

    // jump + gravity
    if (this.active && k.Space && this.grounded && this.roll <= 0 && !this.swim) { v.y = 10.5; this.grounded = false; }
    v.y -= 30 * dt;
    p.x += v.x * dt; p.z += v.z * dt; p.y += v.y * dt;
    const lim = w.SIZE / 2 - 12; p.x = clamp(p.x, -lim, lim); p.z = clamp(p.z, -lim, lim);
    w.resolve(p, 0.4);

    const g2 = w.getHeight(p.x, p.z), floorY = Math.max(g2, w.WATER - 1.15);
    const wasAir = !this.grounded;
    if (p.y <= floorY + (this.grounded ? 0.35 : 0)) {
      if (wasAir && v.y < -9) this.land = 0.22;
      p.y = floorY; v.y = 0; this.grounded = true; this.airT = 0;
    } else { this.grounded = false; this.airT += dt; }
    if (this.land > 0) this.land -= dt;

    // facing
    const sp = Math.hypot(v.x, v.z);
    const prevH = this.heading;
    if (sp > 0.6 && this.roll <= 0) this.heading = dampAngle(this.heading, Math.atan2(v.x, v.z), 1 - Math.exp(-12 * dt));
    let dh = this.heading - prevH; if (dh > Math.PI) dh -= Math.PI * 2; if (dh < -Math.PI) dh += Math.PI * 2;
    this.turn = lerp(this.turn, dh / Math.max(dt, 1e-4), 1 - Math.exp(-8 * dt));

    this.animate(dt, elapsed, sp, wantSprint);
    this.updateCamera(dt, wantSprint);
  }

  animate(dt, elapsed, sp, sprint) {
    const r = this.rig, P = this.pose, A = clamp(sp / 6.2, 0, 1.25);
    this.phase += dt * (sp > 0.3 ? 5.5 + sp * 0.75 : 0);
    const ph = this.phase, s = Math.sin(ph), c = Math.cos(ph);
    let t = { legL: 0, legR: 0, kneeL: 0.04, kneeR: 0.04, armL: 0, armR: 0, elbowL: -0.15, elbowR: -0.15, armZ: 0.12, lean: 0, bob: 0, tilt: 0 };
    const breath = Math.sin(elapsed * 1.6);

    if (this.roll > 0) {
      t = { legL: -1.9, legR: -1.9, kneeL: 2.2, kneeR: 2.2, armL: -1.2, armR: -1.2, elbowL: -1.8, elbowR: -1.8, armZ: 0.3, lean: 0.5, bob: -0.5, tilt: 0 };
    } else if (this.swim) {
      t.lean = 1.1; t.bob = -0.25 + Math.sin(elapsed * 2.2) * 0.04;
      t.armL = -1.6 + s * 0.9; t.armR = -1.6 - s * 0.9; t.elbowL = t.elbowR = -0.3;
      t.legL = 0.3 + c * 0.5; t.legR = 0.3 - c * 0.5; t.kneeL = t.kneeR = 0.4;
    } else if (!this.grounded && this.airT > 0.08) {
      const up = this.vel.y > 0;
      t.legL = up ? -0.9 : -0.35; t.legR = up ? 0.25 : 0.1; t.kneeL = up ? 1.3 : 0.5; t.kneeR = up ? 0.6 : 0.3;
      t.armL = t.armR = up ? -0.7 : -2.2; t.armZ = up ? 0.5 : 0.9; t.elbowL = t.elbowR = -0.4; t.lean = up ? 0.12 : -0.05;
    } else if (A > 0.05) {
      const amp = Math.min(A, 1) * (sprint ? 1.15 : 0.85);
      t.legL = -s * amp; t.legR = s * amp;
      t.kneeL = (0.15 + Math.max(0, c) * 1.25) * amp; t.kneeR = (0.15 + Math.max(0, -c) * 1.25) * amp;
      t.armL = s * amp * 0.9; t.armR = -s * amp * 0.9;
      t.elbowL = t.elbowR = -(0.35 + amp * 0.75);
      t.lean = amp * (sprint ? 0.34 : 0.2);
      t.bob = Math.abs(c) * 0.07 * amp - 0.03 * amp;
      t.tilt = clamp(-this.turn * 0.07, -0.35, 0.35);
    } else {
      t.armL = t.armR = 0.04 + breath * 0.02; t.bob = breath * 0.008;
    }
    if (this.land > 0) { t.bob -= 0.22 * (this.land / 0.22); t.kneeL += 0.5; t.kneeR += 0.5; t.legL -= 0.35; t.legR -= 0.35; }

    const kq = 1 - Math.exp(-(this.roll > 0 ? 22 : 15) * dt);
    for (const key in t) P[key] += (t[key] - P[key]) * kq;

    r.legL.rotation.x = P.legL; r.legR.rotation.x = P.legR; r.kneeL.rotation.x = P.kneeL; r.kneeR.rotation.x = P.kneeR;
    r.armL.rotation.x = P.armL; r.armR.rotation.x = P.armR; r.elbowL.rotation.x = P.elbowL; r.elbowR.rotation.x = P.elbowR;
    r.armL.rotation.z = P.armZ; r.armR.rotation.z = -P.armZ;
    r.body.position.y = 0.95 + P.bob;
    r.body.rotation.x = P.lean + (this.roll > 0 ? (1 - this.roll / 0.6) * Math.PI * 2 : 0);
    r.body.rotation.z = P.tilt;
    r.body.rotation.y = Math.sin(ph) * 0.12 * Math.min(A, 1);
    r.head.rotation.x = -P.lean * 0.55; r.head.rotation.y = -r.body.rotation.y + clamp(this.turn * 0.05, -0.4, 0.4);
    r.torso.scale.setScalar(1 + breath * 0.012);

    // scarf trails with speed and flutters
    const f = clamp(sp / 9, 0, 1), fall = clamp(-this.vel.y / 14, -0.6, 1);
    for (let i = 0; i < r.scarf.length; i++) {
      const sg = r.scarf[i];
      const wave = Math.sin(elapsed * (5 + f * 7) - i * 0.9) * (0.06 + f * 0.2);
      sg.rotation.x = (i === 0 ? lerp(-1.25, 0.1, f) - P.lean + fall * 0.9 : lerp(-0.05, 0.02, f)) + wave;
      sg.rotation.y = Math.sin(elapsed * (2 + f * 5) + i * 0.7) * (0.05 + f * 0.12) + (i === 0 ? clamp(this.turn * 0.12, -0.7, 0.7) : 0);
    }

    r.root.position.copy(this.pos);
    r.root.rotation.y = this.heading;
  }

  updateCamera(dt, sprint) {
    const cam = this.camera, w = this.world;
    this._v.set(this.pos.x, this.pos.y + 1.55, this.pos.z);
    const kxz = 1 - Math.exp(-9 * dt), ky = 1 - Math.exp(-5 * dt);
    this.camTarget.x += (this._v.x - this.camTarget.x) * kxz; this.camTarget.z += (this._v.z - this.camTarget.z) * kxz;
    this.camTarget.y += (this._v.y - this.camTarget.y) * ky;
    const cp = Math.cos(this.pitch);
    cam.position.set(this.camTarget.x + Math.sin(this.yaw) * cp * this.dist, this.camTarget.y + Math.sin(this.pitch) * this.dist, this.camTarget.z + Math.cos(this.yaw) * cp * this.dist);
    const minY = Math.max(w.getHeight(cam.position.x, cam.position.z), w.WATER) + 0.5;
    if (cam.position.y < minY) cam.position.y = minY;
    cam.lookAt(this.camTarget);
    this.fov += ((sprint ? 66 : 58) - this.fov) * (1 - Math.exp(-4 * dt));
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}
