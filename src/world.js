import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm, ridged, vnoise, rng, clamp, lerp, smoothstep } from './noise.js';
import { patch, NOISE, shared } from './shade.js';

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
  const terrain = new THREE.Mesh(geo, patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }), 'terrain'));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // height texture for GPU grass/fireflies (same grid as the mesh)
  const half = new Uint16Array(N * N);
  for (let i = 0; i < N * N; i++) half[i] = THREE.DataUtils.toHalfFloat(H[i]);
  const heightTex = new THREE.DataTexture(half, N, N, THREE.RedFormat, THREE.HalfFloatType);
  heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter;
  heightTex.needsUpdate = true;

  // ---------- water ----------
  // depth comes from the height texture: shallow turquoise -> deep blue, foam along the shore
  const waterUniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uAmb: { value: new THREE.Color(1, 1, 1) },
    uLightDir: { value: new THREE.Vector3(0, 1, 0) }, uLightCol: { value: new THREE.Color(1, 1, 1) },
    uSize: { value: SIZE }, uN: { value: N }
  }]);
  waterUniforms.uHeight = { value: heightTex }; waterUniforms.uTime = shared.uTime;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 3, SIZE * 3), new THREE.ShaderMaterial({
    uniforms: waterUniforms, transparent: true, depthWrite: false, fog: true,
    vertexShader: `
      varying vec3 vWPos;
      #include <fog_pars_vertex>
      void main() {
        vWPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vec4 mvPosition = viewMatrix * vec4(vWPos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform sampler2D uHeight; uniform vec3 uTop, uHor, uAmb, uLightDir, uLightCol; uniform float uTime, uSize, uN;
      varying vec3 vWPos;
      #include <fog_pars_fragment>
      ${NOISE}
      float hAt(vec2 p) { vec2 uv = ((p + uSize * 0.5) / (uSize / (uN - 1.0)) + 0.5) / uN; return texture2D(uHeight, clamp(uv, 0.0, 1.0)).r; }
      float wave(vec2 p) {
        return wnoise(p * 0.3 + uTime * vec2(0.22, 0.1)) * 0.6 + wnoise(p * 0.85 - uTime * vec2(0.18, 0.27)) * 0.3 + wnoise(p * 2.6 + uTime * 0.45) * 0.1;
      }
      void main() {
        vec2 p = vWPos.xz;
        float e = 0.3, h0 = wave(p);
        vec3 n = normalize(vec3(-(wave(p + vec2(e, 0.0)) - h0) / e * 0.45, 1.0, -(wave(p + vec2(0.0, e)) - h0) / e * 0.45));
        vec3 V = normalize(cameraPosition - vWPos);
        float fres = 0.05 + 0.9 * pow(1.0 - max(dot(n, V), 0.0), 4.0);
        vec3 R = reflect(-V, n); R.y = abs(R.y);
        vec3 sky = mix(uHor, uTop, pow(R.y, 0.45));
        float depth = max(0.0, -hAt(p));
        vec3 body = mix(vec3(0.09, 0.5, 0.48), vec3(0.015, 0.11, 0.22), 1.0 - exp(-depth * 0.22)) * uAmb;
        vec3 col = mix(body, sky, fres);
        float rl = max(dot(R, uLightDir), 0.0);
        col += uLightCol * (pow(rl, 260.0) * 5.0 + pow(rl, 24.0) * 0.12);
        float shore = 1.0 - smoothstep(0.0, 1.1, depth);
        float lap = 0.5 + 0.5 * sin(uTime * 1.4 - depth * 7.0);
        float foam = shore * smoothstep(0.5, 0.78, wnoise(p * 1.5 + uTime * 0.35) * 0.7 + shore * 0.45 + lap * 0.18);
        col = mix(col, uAmb * 1.25 + uLightCol * 0.2, foam * 0.85);
        float alpha = clamp(mix(0.25, 0.97, 1.0 - exp(-depth * 0.9)) + fres * 0.5 + foam, 0.0, 1.0);
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
      }`
  }));
  water.rotation.x = -Math.PI / 2; water.position.y = WATER; water.renderOrder = 2;
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
  // jitter by position (not by vertex index) so duplicated seam vertices stay welded
  function organic(geo, amt) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const j1 = vnoise(x * 2.3 + y * 1.1, z * 2.3 - y * 0.7, 41) - 0.5, j2 = vnoise(x * 1.7 - 9, z * 1.7 + y * 1.3, 42) - 0.5;
      p.setXYZ(i, x * (1 + j1 * amt), y + j2 * amt * 0.9, z * (1 + j1 * amt));
    }
    geo.computeVertexNormals();
    return geo;
  }
  const trunkMat = patch(new THREE.MeshStandardMaterial({ color: '#5b4232', roughness: 1, flatShading: true }), 'plain');
  const leafMat = patch(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true }), 'leaves');
  function forest(count, trunkGeo, leafGeo, colA, colB, colC, accept) {
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count), leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
    let n = 0;
    for (let tries = 0; tries < count * 30 && n < count; tries++) {
      const x = (R() - 0.5) * (SIZE - 80), z = (R() - 0.5) * (SIZE - 80), h = getHeight(x, z);
      if (Math.hypot(x, z) < 34 || !accept(x, z, h)) continue;
      getSlope(x, z, sl); if (sl.length() > 0.55) continue;
      const s = 0.75 + R() * 1.15;
      ps.set(x, h - 0.35, z); qt.setFromEuler(eu.set((R() - 0.5) * 0.1, R() * 6.28, (R() - 0.5) * 0.1)); sc.set(s, s * (0.85 + R() * 0.4), s);
      m4.compose(ps, qt, sc); trunks.setMatrixAt(n, m4); leaves.setMatrixAt(n, m4);
      tmp.copy(colA).lerp(colB, R()); if (R() > 0.92) tmp.lerp(colC, 0.75);
      leaves.setColorAt(n, tmp);
      addCollider(x, z, 0.45 * s);
      n++;
    }
    trunks.count = leaves.count = n;
    trunks.castShadow = leaves.castShadow = true; leaves.receiveShadow = true;
    scene.add(trunks, leaves);
  }
  const fmask = (x, z) => fbm(x * 0.0055, z * 0.0055, 3, 21);
  // pines: five drooping skirts
  const pineLeaf = mergeGeometries([[2.75, 3.4, 2.0], [2.35, 3.3, 3.7], [1.9, 3.1, 5.4], [1.4, 2.9, 7.0], [0.85, 2.6, 8.5]]
    .map(([r, h, y], i) => organic(new THREE.ConeGeometry(r, h, 9, 2).rotateY(i * 0.7).translate(0, y + h / 2, 0), 0.24)));
  forest(2400, new THREE.CylinderGeometry(0.2, 0.45, 4.2, 7).translate(0, 2.1, 0), pineLeaf,
    C('#2c6b3c'), C('#4f8a3c'), C('#8fa04a'), (x, z, h) => h > 3.5 && h < 140 && fmask(x, z) > 0.5 + R() * 0.08);
  // broadleaf trees in the lowlands
  const oakLeaf = mergeGeometries([[2.5, 0, 6.2, 0], [1.9, 1.7, 5.3, 0.6], [2.0, -1.5, 5.6, -0.8], [1.7, 0.3, 7.9, -0.3], [1.5, -0.4, 5.0, 1.6]]
    .map(([r, x, y, z]) => organic(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), 0.3)));
  forest(900, organic(new THREE.CylinderGeometry(0.3, 0.6, 5.2, 7).translate(0, 2.6, 0), 0.25), oakLeaf,
    C('#4f9440'), C('#86b045'), C('#d9a441'), (x, z, h) => h > 3.2 && h < 55 && fmask(x + 300, z - 200) > 0.52 + R() * 0.1);
  // bushes
  const BUSH = 2200, bushes = new THREE.InstancedMesh(organic(new THREE.IcosahedronGeometry(1, 1), 0.45), leafMat, BUSH);
  let nb = 0;
  for (let i = 0; nb < BUSH && i < BUSH * 20; i++) {
    const x = (R() - 0.5) * (SIZE - 80), z = (R() - 0.5) * (SIZE - 80), h = getHeight(x, z);
    if (h < 3 || h > 120 || Math.hypot(x, z) < 12 || fmask(x, z) < 0.43) continue;
    const s = 0.5 + R() * 1.1;
    ps.set(x, h + s * 0.25, z); qt.setFromEuler(eu.set(0, R() * 6.28, 0)); sc.set(s * (1 + R() * 0.5), s * 0.7, s * (1 + R() * 0.5));
    m4.compose(ps, qt, sc); bushes.setMatrixAt(nb, m4);
    bushes.setColorAt(nb, tmp.set('#3f7d36').lerp(tmp2.set('#7ea63f'), R()));
    nb++;
  }
  bushes.count = nb; bushes.castShadow = bushes.receiveShadow = true;
  scene.add(bushes);

  // ---------- rocks ----------
  const ROCKS = 900;
  const rocks = new THREE.InstancedMesh(organic(new THREE.IcosahedronGeometry(1, 1), 0.5), patch(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true }), 'stone'), ROCKS);
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
  const stone = patch(new THREE.MeshStandardMaterial({ color: '#b3ab98', roughness: 1, flatShading: true }), 'stone');
  const stoneD = patch(new THREE.MeshStandardMaterial({ color: '#8e8778', roughness: 1, flatShading: true }), 'stone');
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
    getHeight, getSlope, resolve, heightTex, waterUniforms, N, SIZE, WATER,
    update(t) { beacon.rotation.y = t * 0.4; beacon.position.y = y + 14 + Math.sin(t * 0.8) * 1.5; }
  };
}
