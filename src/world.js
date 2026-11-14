import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm, ridged, vnoise, rng, clamp, lerp, smoothstep } from './noise.js';

export const SIZE = 1600;      // world edge in metres
export const SEG = 400;        // terrain cells per edge (4 m each)
export const WATER = 0;
const N = SEG + 1, CELL = SIZE / SEG, HALF = SIZE / 2;
const SEED = 7;

function heightAt(x, z) {
  const d = Math.hypot(x, z);
  let h = (fbm(x * 0.0021, z * 0.0021, 5, SEED) - 0.43) * 150;                 // rolling hills and lake basins
  const m = smoothstep(360, 760, d);
  h += m * (50 + ridged(x * 0.0036 + 50, z * 0.0036, 4, SEED) * 210);          // mountain ring
  h += (vnoise(x * 0.045, z * 0.045, SEED + 3) - 0.5) * 1.6;                   // small bumps
  return lerp(h, 7, smoothstep(140, 20, d) * 0.9);                             // gentle plateau at the spawn
}

export function createWorld(scene) {
  // ---------- heightfield ----------
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = heightAt(-HALF + i * CELL, -HALF + j * CELL);

  function getHeight(x, z) {
    const fx = clamp((x + HALF) / CELL, 0, SEG - 0.001), fz = clamp((z + HALF) / CELL, 0, SEG - 0.001);
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, k = iz * N + ix;
    const a = H[k], b = H[k + 1], c = H[k + N], d = H[k + N + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }
  // gradient (dh/dx, dh/dz)
  function getSlope(x, z, out) {
    out.x = (getHeight(x + 1, z) - getHeight(x - 1, z)) * 0.5;
    out.y = (getHeight(x, z + 1) - getHeight(x, z - 1)) * 0.5;
    return out;
  }

  // ---------- terrain mesh ----------
  const pos = new Float32Array(N * N * 3), idx = new Uint32Array(SEG * SEG * 6);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = (j * N + i) * 3;
    pos[k] = -HALF + i * CELL; pos[k + 1] = H[j * N + i]; pos[k + 2] = -HALF + j * CELL;
  }
  let q = 0;
  for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();

  const C = (hex) => new THREE.Color(hex);
  const grassA = C('#4f8a35'), grassB = C('#86a83e'), sand = C('#cdbb8c'), wet = C('#7d7458'),
    rock = C('#84807a'), rockD = C('#5d5a56'), snow = C('#f1f4f8'), tmp = new THREE.Color(), tmp2 = new THREE.Color();
  const nor = geo.attributes.normal.array, col = new Float32Array(N * N * 3);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, x = pos[k * 3], h = pos[k * 3 + 1], z = pos[k * 3 + 2], ny = nor[k * 3 + 1];
    const n1 = vnoise(x * 0.018, z * 0.018, 11), n2 = vnoise(x * 0.09, z * 0.09, 12);
    tmp.copy(grassA).lerp(grassB, clamp(n1 * 1.2 - 0.1 + (n2 - 0.5) * 0.3, 0, 1));
    if (h < 3) tmp.lerpColors(sand, tmp, smoothstep(1.2, 3, h));
    if (h < 0.6) tmp.lerp(wet, smoothstep(0.6, -1.5, h));
    tmp2.copy(rock).lerp(rockD, n2);
    tmp.lerp(tmp2, smoothstep(0.84, 0.66, ny));
    tmp.lerp(snow, smoothstep(150, 190, h + n1 * 30) * smoothstep(0.45, 0.75, ny));
    col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // height texture for GPU grass/fireflies (same grid as the mesh)
  const half = new Uint16Array(N * N);
  for (let i = 0; i < N * N; i++) half[i] = THREE.DataUtils.toHalfFloat(H[i]);
  const heightTex = new THREE.DataTexture(half, N, N, THREE.RedFormat, THREE.HalfFloatType);
  heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter;
  heightTex.needsUpdate = true;

  // ---------- water ----------
  const water = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 3, SIZE * 3),
    new THREE.MeshStandardMaterial({ color: '#2d7f9c', transparent: true, opacity: 0.8, roughness: 0.08, metalness: 0.1 }));
  water.rotation.x = -Math.PI / 2; water.position.y = WATER;
  scene.add(water);

  // ---------- colliders (trees, pillars): circles in a hash grid ----------
  const grid = new Map(), GC = 16;
  function addCollider(x, z, r) {
    const key = Math.floor(x / GC) + ',' + Math.floor(z / GC);
    let a = grid.get(key); if (!a) grid.set(key, a = []);
    a.push(x, z, r);
  }
  function resolve(p, radius) {
    const cx = Math.floor(p.x / GC), cz = Math.floor(p.z / GC);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const a = grid.get((cx + i) + ',' + (cz + j)); if (!a) continue;
      for (let k = 0; k < a.length; k += 3) {
        const dx = p.x - a[k], dz = p.z - a[k + 1], rr = a[k + 2] + radius, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), push = (rr - d) / d; p.x += dx * push; p.z += dz * push; }
      }
    }
  }

  const R = rng(SEED * 101), sl = new THREE.Vector2();
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), eu = new THREE.Euler();

  // ---------- trees ----------
  const TREES = 2600;
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.42, 3.4, 6).translate(0, 1.7, 0);
  const cones = [];
  [[2.5, 4.2, 2.6], [2.0, 3.8, 4.6], [1.45, 3.4, 6.5], [0.9, 2.8, 8.2]].forEach(([r, h, y]) => cones.push(new THREE.ConeGeometry(r, h, 7).translate(0, y + h / 2 - 1.2, 0)));
  const leafGeo = mergeGeometries(cones);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: '#5a4030', roughness: 1, flatShading: true }), TREES);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }), TREES);
  const leafA = C('#2f6b3a'), leafB = C('#5d8f3a'), leafC = C('#c9a24a');
  let nt = 0;
  for (let tries = 0; tries < 60000 && nt < TREES; tries++) {
    const x = (R() - 0.5) * (SIZE - 80), z = (R() - 0.5) * (SIZE - 80), h = getHeight(x, z);
    if (h < 3.5 || h > 135 || Math.hypot(x, z) < 34) continue;
    if (fbm(x * 0.0055, z * 0.0055, 3, 21) < 0.5 + R() * 0.08) continue;
    getSlope(x, z, sl); if (sl.length() > 0.55) continue;
    const s = 0.8 + R() * 1.1;
    ps.set(x, h - 0.3, z); qt.setFromEuler(eu.set((R() - 0.5) * 0.08, R() * 6.28, (R() - 0.5) * 0.08)); sc.set(s, s * (0.9 + R() * 0.35), s);
    m4.compose(ps, qt, sc); trunks.setMatrixAt(nt, m4); leaves.setMatrixAt(nt, m4);
    const cr = R(); tmp.copy(leafA).lerp(leafB, R()); if (cr > 0.93) tmp.lerp(leafC, 0.8);
    leaves.setColorAt(nt, tmp);
    addCollider(x, z, 0.45 * s);
    nt++;
  }
  trunks.count = leaves.count = nt;
  trunks.castShadow = leaves.castShadow = true; leaves.receiveShadow = true;
  trunks.instanceMatrix.needsUpdate = leaves.instanceMatrix.needsUpdate = true;
  scene.add(trunks, leaves);

  // ---------- rocks ----------
  const ROCKS = 900;
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true }), ROCKS);
  for (let i = 0; i < ROCKS; i++) {
    const x = (R() - 0.5) * (SIZE - 60), z = (R() - 0.5) * (SIZE - 60), h = getHeight(x, z);
    const big = R() > 0.9, s = big ? 2.5 + R() * 4 : 0.35 + R() * 1.3;
    ps.set(x, h - s * 0.25, z); qt.setFromEuler(eu.set(R() * 6.28, R() * 6.28, R() * 6.28)); sc.set(s * (0.8 + R() * 0.6), s * (0.5 + R() * 0.5), s * (0.8 + R() * 0.6));
    m4.compose(ps, qt, sc); rocks.setMatrixAt(i, m4);
    rocks.setColorAt(i, tmp.copy(rock).lerp(rockD, R()));
    if (big && Math.hypot(x, z) > 20) addCollider(x, z, s * 0.75);
  }
  rocks.castShadow = rocks.receiveShadow = true;
  scene.add(rocks);

  // ---------- ruins ----------
  const stone = new THREE.MeshStandardMaterial({ color: '#a39c8c', roughness: 1, flatShading: true });
  const stoneD = new THREE.MeshStandardMaterial({ color: '#7f796c', roughness: 1, flatShading: true });
  const ruins = new THREE.Group(); scene.add(ruins);
  function block(w, h, d, x, y, z, ry, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || stone);
    m.position.set(x, y, z); m.rotation.y = ry || 0; m.castShadow = m.receiveShadow = true; ruins.add(m); return m;
  }
  function pillar(x, z, w, h, ry) {
    const base = getHeight(x, z) - 1.2;
    block(w * 1.35, 1.6, w * 1.35, x, base + 0.8, z, ry, stoneD);
    block(w, h, w, x, base + 1.6 + h / 2, z, ry);
    addCollider(x, z, w * 0.8);
    return base + 1.6 + h;
  }
  function ring(cx, cz, rad, n, hBase) {
    let prev = null;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
      const broken = R() < 0.3, h = broken ? 2.5 + R() * 4 : hBase + R() * 1.5;
      const top = pillar(x, z, 2.4, h, -a);
      if (broken) { const m = block(2.4, 2.4, 5 + R() * 3, x + Math.cos(a) * 4, getHeight(x + Math.cos(a) * 4, z + Math.sin(a) * 4) + 0.7, z + Math.sin(a) * 4, R() * 3); m.rotation.z = 0.2; }
      const cur = broken ? null : { x, z, top };
      if (cur && prev) {
        const mx = (x + prev.x) / 2, mz = (z + prev.z) / 2, len = Math.hypot(x - prev.x, z - prev.z) + 2.6;
        block(len, 1.8, 3, mx, Math.max(top, prev.top) + 0.9, mz, -Math.atan2(z - prev.z, x - prev.x));
      }
      prev = cur;
    }
    block(7, 1.2, 7, cx, getHeight(cx, cz) + 0.2, cz, 0.4, stoneD);     // altar
    block(3, 1.6, 3, cx, getHeight(cx, cz) + 1.4, cz, 0.4);
    addCollider(cx, cz, 2.4);
  }
  function gate(cx, cz, ry) {
    const dx = Math.cos(ry) * 7, dz = -Math.sin(ry) * 7;
    const t1 = pillar(cx + dx, cz + dz, 4, 20, ry), t2 = pillar(cx - dx, cz - dz, 4, 20, ry);
    block(22, 3.5, 5, cx, Math.max(t1, t2) + 1.75, cz, ry);
    block(26, 1.5, 6.5, cx, Math.max(t1, t2) + 4.2, cz, ry, stoneD);
  }
  ring(0, -46, 17, 12, 10);
  gate(0, -110, 0);
  // more sites on flat ground across the map
  let sites = 0;
  for (let tries = 0; tries < 4000 && sites < 9; tries++) {
    const x = (R() - 0.5) * 1300, z = (R() - 0.5) * 1300, h = getHeight(x, z);
    if (h < 5 || h > 110 || Math.hypot(x, z) < 180) continue;
    getSlope(x, z, sl); if (sl.length() > 0.12) continue;
    if (sites % 3 === 2) gate(x, z, R() * 3.14); else ring(x, z, 12 + R() * 10, 9 + Math.floor(R() * 6), 8 + R() * 5);
    sites++;
  }

  // the Spire: a colossal landmark with a light on top, visible from the spawn
  const spire = new THREE.Group(), SX = 0, SZ = -560, sBase = getHeight(SX, SZ) - 6;
  let y = sBase, rad = 26;
  for (let i = 0; i < 9; i++) {
    const h = 30 - i * 1.5, r2 = rad * 0.84;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r2, rad, h, 8), i % 2 ? stoneD : stone);
    seg.position.set(SX, y + h / 2, SZ); seg.rotation.y = i * 0.35; seg.castShadow = seg.receiveShadow = true; spire.add(seg);
    y += h; rad = r2;
  }
  const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(7, 0), new THREE.MeshStandardMaterial({ color: '#ffe2a0', emissive: '#ffb84a', emissiveIntensity: 5 }));
  beacon.position.set(SX, y + 14, SZ); spire.add(beacon);
  scene.add(spire);
  addCollider(SX, SZ, 27);

  return {
    getHeight, getSlope, resolve, heightTex, N, SIZE, WATER,
    update(t) { beacon.rotation.y = t * 0.4; beacon.position.y = y + 14 + Math.sin(t * 0.8) * 1.5; }
  };
}
