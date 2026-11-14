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

const V2 = (p) => new THREE.Vector2(p[0], p[1]);
function lathe(pts, seg, material, sz) {
  const m = part(new THREE.LatheGeometry(pts.map(V2), seg), material);
  if (sz) m.scale.z = sz;
  return m;
}
// tapered tube hanging down from the origin
const tube = (r0, r1, len, material) => part(new THREE.CylinderGeometry(r0, r1, len, 12), material, 0, -len / 2, 0);
const ball = (r, material, x, y, z, sx, sy, sz) => { const m = part(new THREE.SphereGeometry(r, 14, 10), material, x, y, z); if (sx) m.scale.set(sx, sy, sz); return m; };

function buildCharacter() {
  const DS = { side: THREE.DoubleSide };
  const skin = mat('#e3b38d', { roughness: 0.7 }), tunic = mat('#efe6cf'), tunicD = mat('#e2d6b8', DS), dark = mat('#352c3d'),
    hair = mat('#2b1b15', { roughness: 0.55 }), scarfM = mat('#d8392e'), leather = mat('#7b5231'), leatherD = mat('#55371f'),
    steel = mat('#c9ced6', { roughness: 0.3, metalness: 0.75 }), gold = mat('#e6bf5a', { roughness: 0.4, metalness: 0.55 }),
    white = mat('#ffffff', { roughness: 0.3 });

  const root = new THREE.Group(), body = new THREE.Group();
  body.position.y = 0.95; root.add(body);

  // pelvis, short tunic skirt, torso
  body.add(lathe([[0.001, -0.15], [0.12, -0.14], [0.17, -0.05], [0.168, 0.06], [0.15, 0.1]], 16, dark, 0.8));
  body.add(lathe([[0.158, 0.12], [0.186, 0.02], [0.202, -0.09]], 18, tunicD, 0.82));
  const torso = lathe([[0.001, 0.0], [0.15, 0.02], [0.16, 0.12], [0.152, 0.24], [0.18, 0.4], [0.185, 0.5], [0.15, 0.58], [0.075, 0.64], [0.065, 0.71]], 18, tunic, 0.76);
  body.add(torso);
  const belt = part(new THREE.TorusGeometry(0.162, 0.028, 8, 20).rotateX(Math.PI / 2), leather, 0, 0.1, 0); belt.scale.z = 0.8; body.add(belt);
  body.add(part(new THREE.BoxGeometry(0.06, 0.055, 0.02), gold, 0, 0.1, 0.135));
  body.add(part(new THREE.BoxGeometry(0.09, 0.1, 0.07), leatherD, 0.17, 0.02, 0.03));

  // capelet: lathe with a wavy hem, longer at front and back, banded with vertex colours
  const pg = new THREE.LatheGeometry([[0.08, 0.665], [0.13, 0.63], [0.24, 0.55], [0.33, 0.45], [0.385, 0.35], [0.4, 0.3]].map(V2), 36);
  const pp = pg.attributes.position, pc = new Float32Array(pp.count * 3);
  const cA = new THREE.Color('#2c7479'), cB = new THREE.Color('#f0d48a'), cC = new THREE.Color('#1c4d52'), ct = new THREE.Color();
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i), r = Math.hypot(x, z) || 1e-6, ang = Math.atan2(z, x);
    const t = clamp((0.665 - y) / 0.365, 0, 1), rr = r * (1 + t * 0.07 * Math.sin(ang * 7));
    const drop = t * t * (0.09 * Math.abs(Math.sin(ang)) + 0.03 * Math.sin(ang * 3 + 1));
    pp.setXYZ(i, x / r * rr, y - drop, z / r * rr * 0.86);
    if (t > 0.86 || (t > 0.62 && t < 0.7)) ct.copy(cB); else ct.copy(cA).lerp(cC, t * 0.6);
    pc[i * 3] = ct.r; pc[i * 3 + 1] = ct.g; pc[i * 3 + 2] = ct.b;
  }
  pg.setAttribute('color', new THREE.BufferAttribute(pc, 3)); pg.computeVertexNormals();
  const poncho = part(pg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
  body.add(poncho);

  // head
  const head = new THREE.Group(); head.position.set(0, 0.87, 0); head.scale.setScalar(1.3); body.add(head);
  root.scale.setScalar(1.45);
  head.add(ball(0.165, skin, 0, 0, 0, 1, 1.06, 1.03));
  [-1, 1].forEach((sd) => {
    head.add(ball(0.036, skin, sd * 0.162, -0.012, 0, 0.5, 1, 0.8));
    head.add(ball(0.027, dark, sd * 0.062, 0.012, 0.15, 1, 1.35, 0.5));
    head.add(ball(0.008, white, sd * 0.055, 0.03, 0.165));
    const brow = part(new THREE.BoxGeometry(0.055, 0.013, 0.012), hair, sd * 0.062, 0.064, 0.158); brow.rotation.z = -sd * 0.16; head.add(brow);
    head.add(part(new THREE.CapsuleGeometry(0.028, 0.1, 3, 8), hair, sd * 0.152, -0.05, 0.055));
  });
  head.add(ball(0.022, skin, 0, -0.03, 0.166));
  head.add(part(new THREE.SphereGeometry(0.183, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), hair, 0, 0.022, -0.016));
  head.add(ball(0.155, hair, 0, -0.035, -0.065, 1.06, 1, 0.82));
  for (let i = -2; i <= 2; i++) {
    const b = part(new THREE.ConeGeometry(0.038, 0.1, 5), hair, i * 0.052, 0.085 - Math.abs(i) * 0.014, 0.148);
    b.rotation.set(Math.PI + 0.35, 0, i * 0.12); head.add(b);
  }
  // ponytail chain
  const tail = []; let tp = head;
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Group(); p.position.set(0, i === 0 ? 0.05 : 0, i === 0 ? -0.18 : -0.11);
    p.add(part(new THREE.BoxGeometry(0.075 - i * 0.013, 0.075 - i * 0.013, 0.12), hair, 0, 0, -0.055));
    tp.add(p); tail.push(p); tp = p;
  }

  // scarf: wrap, knot and a long tail
  const wrap = part(new THREE.TorusGeometry(0.105, 0.052, 10, 20).rotateX(Math.PI / 2), scarfM, 0, 0.69, 0.005); wrap.scale.z = 0.92; body.add(wrap);
  body.add(ball(0.05, scarfM, 0.07, 0.67, -0.1));
  const scarf = []; let parent = body;
  for (let i = 0; i < 7; i++) {
    const p = new THREE.Group(); p.position.set(i === 0 ? 0.07 : 0, i === 0 ? 0.66 : 0, i === 0 ? -0.13 : -0.19);
    p.add(part(new THREE.BoxGeometry(0.16 - i * 0.012, 0.028, 0.2), scarfM, 0, 0, -0.1));
    parent.add(p); scarf.push(p); parent = p;
  }

  // sword on the back
  const sword = new THREE.Group(); sword.position.set(0, 0.4, -0.2); sword.rotation.z = 0.65;
  sword.add(part(new THREE.BoxGeometry(0.065, 0.7, 0.035), leatherD, 0, 0, 0));
  sword.add(part(new THREE.BoxGeometry(0.07, 0.06, 0.04), gold, 0, -0.33, 0));
  sword.add(part(new THREE.BoxGeometry(0.21, 0.032, 0.05), steel, 0, 0.37, 0));
  sword.add(part(new THREE.CylinderGeometry(0.02, 0.02, 0.17, 8), leatherD, 0, 0.47, 0));
  sword.add(ball(0.03, gold, 0, 0.57, 0));
  body.add(sword);

  function limb(x, y, upLen, lowLen, up, low, deco) {
    const a = new THREE.Group(); a.position.set(x, y, 0);
    a.add(ball(up[0] * 1.04, up[2])); a.add(tube(up[0], up[1], upLen, up[2]));
    const b = new THREE.Group(); b.position.y = -upLen; a.add(b);
    b.add(ball(up[1] * 1.1, up[2])); b.add(tube(low[0], low[1], lowLen, low[2]));
    deco(b, lowLen);
    body.add(a);
    return [a, b];
  }
  const armDeco = (b, len) => {
    b.add(part(new THREE.CylinderGeometry(0.05, 0.046, 0.13, 12), leather, 0, -len * 0.55, 0));
    b.add(ball(0.05, skin, 0, -len - 0.03, 0, 0.85, 1.15, 0.6));
    b.add(ball(0.019, skin, 0, -len - 0.015, 0.035));
  };
  const legDeco = (b, len) => {
    b.add(part(new THREE.CylinderGeometry(0.078, 0.074, 0.055, 12), leatherD, 0, -0.03, 0));
    b.add(part(new THREE.BoxGeometry(0.105, 0.085, 0.2), leather, 0, -len - 0.02, 0.045));
    b.add(ball(0.056, leather, 0, -len - 0.028, 0.135, 0.95, 0.75, 1.2));
    b.add(part(new THREE.BoxGeometry(0.112, 0.022, 0.255), leatherD, 0, -len - 0.066, 0.06));
  };
  const [armL, elbowL] = limb(0.215, 0.52, 0.29, 0.26, [0.064, 0.05, tunic], [0.045, 0.038, skin], armDeco);
  const [armR, elbowR] = limb(-0.215, 0.52, 0.29, 0.26, [0.064, 0.05, tunic], [0.045, 0.038, skin], armDeco);
  const [legL, kneeL] = limb(0.095, -0.06, 0.42, 0.4, [0.088, 0.068, dark], [0.067, 0.056, leather], legDeco);
  const [legR, kneeR] = limb(-0.095, -0.06, 0.42, 0.4, [0.088, 0.068, dark], [0.067, 0.056, leather], legDeco);

  return { root, body, head, torso, scarf, tail, poncho, armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR };
}

export class Player {
  constructor(scene, world, camera, dom) {
    this.world = world; this.camera = camera;
    this.rig = buildCharacter(); scene.add(this.rig.root);
    this.pos = new THREE.Vector3(0, world.getHeight(0, 6), 6);
    this.vel = new THREE.Vector3();
    this.heading = Math.PI; this.turn = 0;
    this.grounded = true; this.swim = false;
    this.stamina = 100; this.maxStamina = 100; this.staminaWait = 0; this.exhausted = false;
    this.roll = 0; this.phase = 0; this.airT = 0; this.land = 0;
    this.yaw = 0; this.pitch = 0.52; this.dist = 18; this.distT = 18; this.jumpBuf = 0; this.rollBuf = 0; this.coyote = 0; this.fov = 30;
    this.camTarget = this.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
    this.keys = {}; this.active = false; this.events = []; this.stepN = 0;
    this.hit = { tree: false, bush: false, wall: false, wallTop: 0, nx: 0, nz: 0, x: 0, z: 0 }; this.climb = null; this.pushT = 0; this.bumpCd = 0; this.rustleCd = 0;
    this.squash = 0; this.squashV = 0; this.shake = 0; this.shakeT = 0; this.landV = 0;
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
      this.yaw -= e.movementX * 0.0026; this.pitch = clamp(this.pitch + e.movementY * 0.0022, 0.22, 1.4);
    });
    dom.addEventListener('wheel', (e) => { this.distT = clamp(this.distT + Math.sign(e.deltaY) * 1.6, 7, 34); }, { passive: true });
  }

  update(dt, elapsed) {
    const k = this.keys, w = this.world, p = this.pos, v = this.vel;
    // arrow keys also turn the camera (keyboard-only play)
    const ax = (k.ArrowLeft ? 1 : 0) - (k.ArrowRight ? 1 : 0), ay = (k.ArrowDown ? 1 : 0) - (k.ArrowUp ? 1 : 0);
    this.yaw += ax * dt * 1.8; this.pitch = clamp(this.pitch + ay * dt * 1.1, 0.22, 1.4);

    let ix = 0, iz = 0;
    if (this.active) { ix = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0); iz = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0); }
    const il = Math.hypot(ix, iz); if (il > 0) { ix /= il; iz /= il; }
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    const wx = -sn * iz + cs * ix, wz = -cs * iz - sn * ix;

    const ground = w.getHeight(p.x, p.z);
    this.swim = ground < w.WATER - 1.15 && p.y <= w.WATER - 1.0;

    // stamina
    const wantSprint = this.active && (k.ShiftLeft || k.ShiftRight) && il > 0 && !this.exhausted && !this.swim;
    if (wantSprint && this.grounded) { this.stamina -= 9 * dt; this.staminaWait = 0.5; }
    else if (this.staminaWait > 0) this.staminaWait -= dt; else this.stamina = Math.min(this.maxStamina, this.stamina + 36 * dt);
    if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; }
    if (this.exhausted && this.stamina > 14) this.exhausted = false;

    // buffered inputs: a press slightly too early still counts; coyote time forgives leaving a ledge
    this.jumpBuf -= dt; this.rollBuf -= dt;
    if (this.active && k.Space) this.jumpBuf = 0.12;
    if (this.active && (k.KeyQ || k.Roll)) this.rollBuf = 0.16;
    this.coyote = this.grounded ? 0.12 : this.coyote - dt;

    // roll
    if (this.rollBuf > 0 && this.roll <= 0 && this.coyote > 0 && !this.swim && this.stamina > 8) {
      this.rollBuf = 0;
      this.roll = 0.5; this.stamina -= 12; this.staminaWait = 0.5; this.events.push('roll'); this.squashV = -2.6;
      if (il > 0) this.heading = Math.atan2(wx, wz);
    }
    k.Roll = false;

    const maxSpeed = this.swim ? 4.4 : wantSprint ? 10.5 : 6.2;
    if (this.climb) {
      // holding on costs breath; W climbs, S descends, A/D shuffle, Space kicks off, Shift hurries
      const c = this.climb, fast = k.ShiftLeft || k.ShiftRight;
      this.stamina -= (fast ? 19 : 11) * dt; this.staminaWait = 0.5;
      v.set(0, 0, 0);
      const up = k.KeyW ? 1 : k.KeyS ? -1 : 0, side = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
      p.y += up * (fast ? 4.4 : 3.0) * dt;
      p.x += c.nz * side * 1.8 * dt; p.z += -c.nx * side * 1.8 * dt;
      p.x -= c.nx * 0.05; p.z -= c.nz * 0.05;                 // lean in so the wall keeps answering
      this.phase += dt * 7.5 * (up !== 0 || side !== 0 ? 1 : 0);
      this.heading = dampAngle(this.heading, Math.atan2(-c.nx, -c.nz), 1 - Math.exp(-18 * dt));
      w.resolve(p, 0.55, this.hit);
      const gy = w.floorAt(p.x, p.z, p.y);
      if (p.y >= c.top - 0.35) {                              // mantle onto the top
        p.y = c.top; p.x -= c.nx * 1.0; p.z -= c.nz * 1.0; this.climb = null; this.grounded = true; this.squashV = 2.2; this.events.push('mantle');
      } else if (this.jumpBuf > 0 && !this.climbJustStarted) { // kick off the wall
        this.climb = null; this.jumpBuf = 0; v.x = c.nx * 6.5; v.z = c.nz * 6.5; v.y = 9; this.events.push('jump'); this.squashV = 3;
      } else if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; this.climb = null; }
      else if (!this.hit.wall || (up < 0 && p.y <= gy + 0.05)) { this.climb = null; }
      else { c.nx = this.hit.nx; c.nz = this.hit.nz; c.top = this.hit.wallTop; }
      if (!k.Space) this.climbJustStarted = false;
      this.grounded = !this.climb ? this.grounded : false; this.airT = 0; this.coyote = 0;
      if (this.land > 0) this.land -= dt;
      this.turn = 0;
      this.animate(dt, elapsed, 0, false);
      this.updateCamera(dt, false);
      return;
    }
    if (this.roll > 0) {
      this.roll -= dt;
      // steerable, and it hands its speed back to the run instead of stalling at the end
      if (il > 0) this.heading = dampAngle(this.heading, Math.atan2(wx, wz), 1 - Math.exp(-7 * dt));
      const rs = lerp(Math.max(maxSpeed, 7.5), 13.5, Math.min(1, this.roll / 0.35));
      v.x = Math.sin(this.heading) * rs; v.z = Math.cos(this.heading) * rs;
    } else {
      const acc = this.grounded ? 28 : this.swim ? 12 : 8, kk = 1 - Math.exp(-acc * dt);
      v.x += (wx * maxSpeed - v.x) * kk; v.z += (wz * maxSpeed - v.z) * kk;
    }

    // steep slopes push back down
    w.getSlope(p.x, p.z, this._sl);
    const steep = this._sl.length();
    if (this.grounded && steep > 1.4) { const f = (steep - 1.4) * 16 * dt; v.x -= this._sl.x / steep * f; v.z -= this._sl.y / steep * f; }

    // jump + gravity
    if (this.jumpBuf > 0 && this.coyote > 0 && this.roll < 0.3 && !this.swim) {
      v.y = 10.5; this.grounded = false; this.coyote = 0; this.jumpBuf = 0; this.roll = 0; this.events.push('jump'); this.squashV = 3.4;
    }
    if (!k.Space && v.y > 4.5 && !this.grounded) v.y -= 38 * dt;          // release early = shorter hop
    v.y -= 30 * dt;
    p.x += v.x * dt; p.z += v.z * dt; p.y += v.y * dt;
    const lim = w.SIZE / 2 - 12; p.x = clamp(p.x, -lim, lim); p.z = clamp(p.z, -lim, lim);
    const spd0 = Math.hypot(v.x, v.z);
    w.resolve(p, 0.55, this.hit);
    this.bumpCd -= dt; this.rustleCd -= dt;
    if (this.hit.tree && spd0 > 5.5 && this.bumpCd <= 0) { this.bumpCd = 0.6; this.events.push('bump'); this.squashV = -1.6; }
    if (this.hit.bush && spd0 > 2 && this.rustleCd <= 0) { this.rustleCd = 0.3; this.events.push('rustle'); }
    // push into a wall taller than a step and the wanderer grabs it
    if (this.hit.wall && this.hit.wallTop > p.y + 0.6 && il > 0 && (wx * -this.hit.nx + wz * -this.hit.nz) > 0.72 && !this.exhausted && this.roll <= 0 && !this.swim) {
      this.pushT += dt;
      if (this.pushT > 0.1 || !this.grounded) {
        this.climb = { nx: this.hit.nx, nz: this.hit.nz, top: this.hit.wallTop }; this.pushT = 0; this.climbJustStarted = true;
        v.set(0, 0, 0); this.events.push('grab'); this.squashV = -1.5;
      }
    } else this.pushT = 0;

    const g2 = w.floorAt(p.x, p.z, p.y), floorY = Math.max(g2, w.WATER - 1.15);
    const wasAir = !this.grounded;
    if (p.y <= floorY + (this.grounded ? 0.35 : 0)) {
      if (wasAir && this.airT > 0.12) { this.events.push('land'); this.landV = -v.y; this.squashV = -Math.min(5.5, 1.5 + this.landV * 0.28); }
      if (wasAir && v.y < -17) this.land = 0.18;
      p.y = floorY; v.y = 0; this.grounded = true; this.airT = 0;
    } else { this.grounded = false; this.airT += dt; }
    if (this.land > 0) this.land -= dt;

    // facing
    const sp = Math.hypot(v.x, v.z);
    const prevH = this.heading;
    if (sp > 0.6 && this.roll <= 0) this.heading = dampAngle(this.heading, Math.atan2(v.x, v.z), 1 - Math.exp(-20 * dt));
    let dh = this.heading - prevH; if (dh > Math.PI) dh -= Math.PI * 2; if (dh < -Math.PI) dh += Math.PI * 2;
    this.turn = lerp(this.turn, dh / Math.max(dt, 1e-4), 1 - Math.exp(-8 * dt));

    this.animate(dt, elapsed, sp, wantSprint);
    this.updateCamera(dt, wantSprint);
  }

  animate(dt, elapsed, sp, sprint) {
    const r = this.rig, P = this.pose, A = clamp(sp / 6.2, 0, 1.25);
    this.phase += dt * (sp > 0.3 ? 5.5 + sp * 0.75 : 0);
    const stepN = Math.floor(this.phase / Math.PI);        // one footfall per half cycle
    if (stepN !== this.stepN) {
      this.stepN = stepN;
      if (this.climb) this.events.push('grab');
      if (sp > 1 && this.roll <= 0 && (this.grounded || this.swim)) this.events.push(this.swim ? 'swim' : sprint ? 'stepRun' : 'step');
    }
    const ph = this.phase, s = Math.sin(ph), c = Math.cos(ph);
    let t = { legL: 0, legR: 0, kneeL: 0.04, kneeR: 0.04, armL: 0, armR: 0, elbowL: -0.15, elbowR: -0.15, armZ: 0.12, lean: 0, bob: 0, tilt: 0 };
    const breath = Math.sin(elapsed * 1.6);

    if (this.climb) {
      t = { legL: -0.7 + c * 0.55, legR: -0.7 - c * 0.55, kneeL: 1.2 - c * 0.5, kneeR: 1.2 + c * 0.5, armL: -2.5 + s * 0.45, armR: -2.5 - s * 0.45, elbowL: -0.5 - s * 0.4, elbowR: -0.5 + s * 0.4, armZ: 0.28, lean: -0.08, bob: Math.abs(s) * 0.04, tilt: s * 0.06 };
    } else if (this.roll > 0) {
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
      t.armL = s * amp * 0.62; t.armR = -s * amp * 0.62; t.armZ = 0.12 + amp * 0.24;
      t.elbowL = t.elbowR = -(0.35 + amp * 0.75);
      t.lean = amp * (sprint ? 0.34 : 0.2);
      t.bob = Math.abs(c) * 0.07 * amp - 0.03 * amp;
      t.tilt = clamp(-this.turn * 0.07, -0.35, 0.35);
    } else {
      t.armL = t.armR = 0.04 + breath * 0.02; t.bob = breath * 0.008;
    }
    if (this.land > 0) { t.bob -= 0.22 * (this.land / 0.22); t.kneeL += 0.5; t.kneeR += 0.5; t.legL -= 0.35; t.legR -= 0.35; }

    const kq = 1 - Math.exp(-(this.roll > 0 ? 26 : 21) * dt);
    for (const key in t) P[key] += (t[key] - P[key]) * kq;

    r.legL.rotation.x = P.legL; r.legR.rotation.x = P.legR; r.kneeL.rotation.x = P.kneeL; r.kneeR.rotation.x = P.kneeR;
    r.armL.rotation.x = P.armL; r.armR.rotation.x = P.armR; r.elbowL.rotation.x = P.elbowL; r.elbowR.rotation.x = P.elbowR;
    r.armL.rotation.z = P.armZ; r.armR.rotation.z = -P.armZ;
    r.body.position.y = 0.95 + P.bob;
    r.body.rotation.x = P.lean + (this.roll > 0 ? (1 - this.roll / 0.6) * Math.PI * 2 : 0);
    r.body.rotation.z = P.tilt;
    r.body.rotation.y = Math.sin(ph) * 0.12 * Math.min(A, 1);
    r.head.rotation.x = -P.lean * 0.55; r.head.rotation.y = -r.body.rotation.y + clamp(this.turn * 0.05, -0.4, 0.4);
    r.torso.scale.set(1 + breath * 0.012, 1 + breath * 0.006, 0.76 * (1 + breath * 0.03));

    // scarf trails with speed and flutters
    const f = clamp(sp / 9, 0, 1), fall = clamp(-this.vel.y / 14, -0.6, 1);
    for (let i = 0; i < r.scarf.length; i++) {
      const sg = r.scarf[i];
      const wave = Math.sin(elapsed * (5 + f * 7) - i * 0.9) * (0.06 + f * 0.2);
      sg.rotation.x = (i === 0 ? lerp(-1.25, 0.1, f) - P.lean + fall * 0.9 : lerp(-0.05, 0.02, f)) + wave;
      sg.rotation.y = Math.sin(elapsed * (2 + f * 5) + i * 0.7) * (0.05 + f * 0.12) + (i === 0 ? clamp(this.turn * 0.12, -0.7, 0.7) : 0);
    }

    for (let i = 0; i < r.tail.length; i++) {
      r.tail[i].rotation.x = (i === 0 ? lerp(-1.0, 0.25, f) - P.lean * 0.5 + fall * 0.6 : 0.06) + Math.sin(elapsed * (4 + f * 6) - i * 1.1) * (0.04 + f * 0.14);
      r.tail[i].rotation.y = Math.sin(elapsed * (3 + f * 4) + i) * (0.03 + f * 0.1);
    }
    // capelet lifts with speed and balloons when falling
    const flare = 1 + f * 0.07 + Math.max(0, fall) * 0.2;
    r.poncho.rotation.x = -P.lean * 0.3 - f * 0.1;
    r.poncho.scale.set(flare, 1 - Math.max(0, fall) * 0.1, flare);

    // squash & stretch on a damped spring
    this.squashV += (-this.squash * 190 - this.squashV * 15) * dt; this.squash += this.squashV * dt;
    const q = clamp(this.squash, -0.35, 0.35);
    r.root.scale.set(1.45 * (1 - q * 0.55), 1.45 * (1 + q), 1.45 * (1 - q * 0.55));

    r.root.position.copy(this.pos);
    r.root.rotation.y = this.heading;
  }

  updateCamera(dt, sprint) {
    const cam = this.camera, w = this.world;
    this._v.set(this.pos.x, this.pos.y + 1.5, this.pos.z);
    const kxz = 1 - Math.exp(-22 * dt), ky = 1 - Math.exp(-12 * dt);
    this.dist += (this.distT - this.dist) * (1 - Math.exp(-10 * dt));
    this.camTarget.x += (this._v.x - this.camTarget.x) * kxz; this.camTarget.z += (this._v.z - this.camTarget.z) * kxz;
    this.camTarget.y += (this._v.y - this.camTarget.y) * ky;
    const cp = Math.cos(this.pitch);
    cam.position.set(this.camTarget.x + Math.sin(this.yaw) * cp * this.dist, this.camTarget.y + Math.sin(this.pitch) * this.dist, this.camTarget.z + Math.cos(this.yaw) * cp * this.dist);
    const minY = Math.max(w.getHeight(cam.position.x, cam.position.z), w.WATER) + 2.4;
    if (cam.position.y < minY) cam.position.y = minY;
    cam.lookAt(this.camTarget);
    if (this.shake > 0.002) {
      this.shakeT += dt;
      cam.position.x += Math.sin(this.shakeT * 61) * this.shake; cam.position.y += Math.sin(this.shakeT * 73 + 1.3) * this.shake;
      this.shake *= Math.exp(-9 * dt);
    }
    this.fov += ((sprint ? 33 : 30) - this.fov) * (1 - Math.exp(-4 * dt));
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}
