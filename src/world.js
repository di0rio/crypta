import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
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

  // ---------- trail and grass mask ----------
  // A dirt trail leads from the spawn, around the first ring, through the gate and on to the Spire.
  const TRAIL = [[0, 12], [3, -14], [-14, -34], [-21, -52], [-10, -70], [0, -84], [0, -128], [-14, -180], [12, -250], [-6, -330], [4, -420], [0, -500]];
  function trailDist(x, z) {
    let best = 1e9;
    for (let i = 0; i < TRAIL.length - 1; i++) {
      const ax = TRAIL[i][0], az = TRAIL[i][1], bx = TRAIL[i + 1][0] - ax, bz = TRAIL[i + 1][1] - az;
      const t = clamp(((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz), 0, 1);
      const d = Math.hypot(x - ax - bx * t, z - az - bz * t);
      if (d < best) best = d;
    }
    return best - (vnoise(x * 0.09, z * 0.09, 61) - 0.5) * 2.4;
  }
  // mask: 0 = bare (trail), ~0.25 = short lawn with tufts, 1 = tall meadow
  const M = new Float32Array(N * N), TR = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -HALF + i * CELL, z = -HALF + j * CELL;
    const meadow = smoothstep(0.4, 0.58, fbm(x * 0.017, z * 0.017, 3, 55));
    const tr = smoothstep(5.0, 1.6, trailDist(x, z));
    TR[j * N + i] = tr; M[j * N + i] = (0.24 + 0.76 * meadow) * (1 - tr);
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
  const grassA = C('#6aa84f'), grassB = C('#9ccb62'), sand = C('#e6d3a0'), wet = C('#a39570'),
    rock = C('#aaa093'), rockD = C('#8a8177'), lawn = C('#9fd066'), dirt = C('#cfae7c'), snow = C('#f1f4f8'), tmp = new THREE.Color(), tmp2 = new THREE.Color();
  const nor = geo.attributes.normal.array, col = new Float32Array(N * N * 3);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, x = pos[k * 3], h = pos[k * 3 + 1], z = pos[k * 3 + 2], ny = nor[k * 3 + 1];
    const n1 = vnoise(x * 0.018, z * 0.018, 11), n2 = vnoise(x * 0.09, z * 0.09, 12);
    tmp.copy(grassA).lerp(grassB, clamp(n1 * 1.2 - 0.1 + (n2 - 0.5) * 0.3, 0, 1));
    tmp.lerp(lawn, (1 - smoothstep(0.24, 0.9, M[k])) * 0.4);
    if (h > 1) tmp.lerp(dirt, TR[k] * (0.75 + n2 * 0.25));
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
  // R = height, G = grass mask
  const half = new Uint16Array(N * N * 2);
  for (let i = 0; i < N * N; i++) { half[i * 2] = THREE.DataUtils.toHalfFloat(H[i]); half[i * 2 + 1] = THREE.DataUtils.toHalfFloat(M[i]); }
  const heightTex = new THREE.DataTexture(half, N, N, THREE.RGFormat, THREE.HalfFloatType);
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
  // Each entry is 9 floats: [type, x, z, a, b, c, d, base, top]
  //   type 0 = circle (a = radius, b = kind: 0 solid, 1 tree, 2 bush - soft, reports but does not push)
  //   type 1 = oriented box (a = half width, b = half depth, c = cos, d = sin of its Y rotation)
  //   base/top = vertical extent: you can stand on a box, walk under one, or climb its side
  const grid = new Map(), GC = 16, E = 9, TALL = 2.4, STEP = 0.6;
  function put(x, z, t, a, b, c, d, base, top) {
    const key = Math.floor(x / GC) + ',' + Math.floor(z / GC);
    let arr = grid.get(key); if (!arr) grid.set(key, arr = []);
    arr.push(t, x, z, a, b, c, d, base === undefined ? -1e9 : base, top === undefined ? 1e9 : top);
  }
  const addCollider = (x, z, r, kind) => put(x, z, 0, r, kind || 0, 0, 0);
  const addBox = (x, z, hw, hd, ry, base, top) => put(x, z, 1, hw, hd, Math.cos(ry), Math.sin(ry), base, top);
  // pushes p out of every solid at its height; returns the deepest overlap found (before pushing).
  // `hit` reports trees, bushes and climbable walls (with the wall's top and outward normal).
  function resolve(p, radius, hit, dry) {
    const cx = Math.floor(p.x / GC), cz = Math.floor(p.z / GC);
    let deep = 0;
    if (hit) { hit.tree = hit.bush = hit.wall = false; hit.wallTop = -1e9; }
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const a = grid.get((cx + i) + ',' + (cz + j)); if (!a) continue;
      for (let k = 0; k < a.length; k += E) {
        const dx = p.x - a[k + 1], dz = p.z - a[k + 2];
        if (a[k] === 0) {
          const rr = a[k + 3] + radius, d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr) continue;
          if (a[k + 4] === 2) { if (hit) { hit.bush = true; hit.x = a[k + 1]; hit.z = a[k + 2]; } continue; }
          const d = Math.sqrt(d2) || 1e-4;
          if (rr - d > deep) deep = rr - d;
          if (hit && a[k + 4] === 1) { hit.tree = true; hit.x = a[k + 1]; hit.z = a[k + 2]; }
          if (!dry) { const push = (rr - d) / d; p.x += (d2 > 1e-8 ? dx : 1e-4) * push; p.z += dz * push; }
        } else {
          if (p.y >= a[k + 8] - 0.3 || p.y + TALL < a[k + 7]) continue;        // standing on it, or walking under it
          const c = a[k + 5], sn = a[k + 6], hw = a[k + 3] + radius, hd = a[k + 4] + radius;
          let lx = dx * c - dz * sn, lz = dx * sn + dz * c;
          const px = hw - Math.abs(lx), pz = hd - Math.abs(lz);
          if (px <= 0 || pz <= 0) continue;
          const ox = p.x, oz = p.z;
          if (px < radius && pz < radius) {                 // rounded corner: slide around it instead of snagging
            const qx = (lx < 0 ? -1 : 1) * (hw - radius), qz = (lz < 0 ? -1 : 1) * (hd - radius), ex = lx - qx, ez = lz - qz, ed = Math.hypot(ex, ez) || 1e-4;
            if (ed >= radius) continue;
            if (radius - ed > deep) deep = radius - ed;
            if (dry) continue;
            lx = qx + ex / ed * radius; lz = qz + ez / ed * radius;
          } else {
            if (Math.min(px, pz) > deep) deep = Math.min(px, pz);
            if (dry) continue;
            if (px < pz) lx = (lx < 0 ? -hw : hw); else lz = (lz < 0 ? -hd : hd);
          }
          p.x = a[k + 1] + lx * c + lz * sn; p.z = a[k + 2] - lx * sn + lz * c;
          if (hit && a[k + 8] > hit.wallTop) {
            const nx = p.x - ox, nz = p.z - oz, nl = Math.hypot(nx, nz);
            if (nl > 1e-5) { hit.wall = true; hit.wallTop = a[k + 8]; hit.nx = nx / nl; hit.nz = nz / nl; }
          }
        }
      }
    }
    return deep;
  }
  // ground under a point for something whose feet are at y: terrain, or the top of a box it can step onto
  function floorAt(x, z, y) {
    let f = getHeight(x, z);
    const cx = Math.floor(x / GC), cz = Math.floor(z / GC);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const a = grid.get((cx + i) + ',' + (cz + j)); if (!a) continue;
      for (let k = 0; k < a.length; k += E) {
        if (a[k] !== 1 || a[k + 8] > y + STEP || a[k + 8] <= f) continue;
        const dx = x - a[k + 1], dz = z - a[k + 2], c = a[k + 5], sn = a[k + 6];
        if (Math.abs(dx * c - dz * sn) <= a[k + 3] + 0.15 && Math.abs(dx * sn + dz * c) <= a[k + 4] + 0.15) f = a[k + 8];
      }
    }
    return f;
  }
  const probe = { x: 0, y: 0, z: 0 };
  const penetration = (x, z, radius, y) => { probe.x = x; probe.z = z; probe.y = y === undefined ? getHeight(x, z) : y; return resolve(probe, radius, null, true); };

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
  const trunkMat = patch(new THREE.MeshStandardMaterial({ color: '#8a5d40', roughness: 0.8 }), 'plain');
  const leafMat = patch(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.62 }), 'leaves');
  function forest(count, trunkGeo, leafGeo, colA, colB, colC, accept) {
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count), leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
    let n = 0;
    for (let tries = 0; tries < count * 30 && n < count; tries++) {
      const x = (R() - 0.5) * (SIZE - 80), z = (R() - 0.5) * (SIZE - 80), h = getHeight(x, z);
      if (Math.hypot(x, z) < 34 || !accept(x, z, h) || trailDist(x, z) < 6.5) continue;
      getSlope(x, z, sl); if (sl.length() > 0.55) continue;
      const s = 0.75 + R() * 1.15;
      ps.set(x, h - 0.35, z); qt.setFromEuler(eu.set((R() - 0.5) * 0.1, R() * 6.28, (R() - 0.5) * 0.1)); sc.set(s, s * (0.85 + R() * 0.4), s);
      m4.compose(ps, qt, sc); trunks.setMatrixAt(n, m4); leaves.setMatrixAt(n, m4);
      tmp.copy(colA).lerp(colB, R()); if (R() > 0.92) tmp.lerp(colC, 0.75);
      leaves.setColorAt(n, tmp);
      addCollider(x, z, 0.45 * s, 1);
      n++;
    }
    trunks.count = leaves.count = n;
    trunks.castShadow = leaves.castShadow = true; leaves.receiveShadow = true;
    scene.add(trunks, leaves);
  }
  const fmask = (x, z) => fbm(x * 0.0055, z * 0.0055, 3, 21);
  // pines: five drooping skirts
  const pineLeaf = organic(new THREE.LatheGeometry([[0.3, 1.7], [2.5, 2.0], [2.75, 2.6], [2.1, 3.6], [1.35, 4.2], [2.05, 4.5], [2.2, 5.0], [1.6, 6.0],
    [1.0, 6.5], [1.55, 6.8], [1.65, 7.2], [1.1, 8.2], [0.6, 8.8], [0.95, 9.05], [1.0, 9.4], [0.5, 10.4], [0.001, 11.0]].map((p) => new THREE.Vector2(p[0], p[1])), 16), 0.12);
  forest(2400, new THREE.CylinderGeometry(0.22, 0.5, 4.2, 10).translate(0, 2.1, 0), pineLeaf,
    C('#3f9272'), C('#62ad73'), C('#a9c95e'), (x, z, h) => h > 3.5 && h < 140 && fmask(x, z) > 0.5 + R() * 0.08);
  // broadleaf trees in the lowlands
  const oakLeaf = mergeGeometries([[2.5, 0, 6.2, 0], [1.9, 1.7, 5.3, 0.6], [2.0, -1.5, 5.6, -0.8], [1.7, 0.3, 7.9, -0.3], [1.5, -0.4, 5.0, 1.6]]
    .map(([r, x, y, z]) => organic(new THREE.SphereGeometry(r, 12, 9).translate(x, y, z), 0.22)));
  forest(900, organic(new THREE.CylinderGeometry(0.32, 0.65, 5.2, 10).translate(0, 2.6, 0), 0.2), oakLeaf,
    C('#6fb854'), C('#a6d060'), C('#f3a3b7'), (x, z, h) => h > 3.2 && h < 55 && fmask(x + 300, z - 200) > 0.52 + R() * 0.1);
  // bushes
  const BUSH = 2200, bushes = new THREE.InstancedMesh(organic(new THREE.SphereGeometry(1, 10, 7), 0.35), leafMat, BUSH);
  let nb = 0;
  for (let i = 0; nb < BUSH && i < BUSH * 20; i++) {
    const x = (R() - 0.5) * (SIZE - 80), z = (R() - 0.5) * (SIZE - 80), h = getHeight(x, z);
    if (h < 3 || h > 120 || Math.hypot(x, z) < 12 || fmask(x, z) < 0.43 || trailDist(x, z) < 4.5) continue;
    const s = 0.5 + R() * 1.1;
    ps.set(x, h + s * 0.25, z); qt.setFromEuler(eu.set(0, R() * 6.28, 0)); sc.set(s * (1 + R() * 0.5), s * 0.7, s * (1 + R() * 0.5));
    m4.compose(ps, qt, sc); bushes.setMatrixAt(nb, m4);
    bushes.setColorAt(nb, tmp.set('#7fbf5a').lerp(tmp2.set('#b7dc6a'), R()).multiplyScalar(1.7));
    addCollider(x, z, s * 0.9, 2);
    nb++;
  }
  bushes.count = nb; bushes.castShadow = bushes.receiveShadow = true;
  scene.add(bushes);

  // ---------- rocks ----------
  const ROCKS = 900;
  const rocks = new THREE.InstancedMesh(organic(new THREE.SphereGeometry(1, 10, 7), 0.4), patch(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }), 'stone'), ROCKS);
  for (let i = 0; i < ROCKS; i++) {
    const x = (R() - 0.5) * (SIZE - 60), z = (R() - 0.5) * (SIZE - 60), h = getHeight(x, z);
    const big = R() > 0.9, s = big ? 2.5 + R() * 4 : 0.35 + R() * 1.3;
    ps.set(x, h - s * 0.25, z); qt.setFromEuler(eu.set(R() * 6.28, R() * 6.28, R() * 6.28)); sc.set(s * (0.8 + R() * 0.6), s * (0.5 + R() * 0.5), s * (0.8 + R() * 0.6));
    m4.compose(ps, qt, sc); rocks.setMatrixAt(i, m4);
    rocks.setColorAt(i, tmp.copy(rock).lerp(rockD, R()));
    if (s > 0.9 && Math.hypot(x, z) > 14) addCollider(x, z, (sc.x + sc.z) * 0.44);
  }
  rocks.castShadow = rocks.receiveShadow = true;
  scene.add(rocks);

  // ---------- trail lanterns ----------
  const lampGeo = mergeGeometries([
    new RoundedBoxGeometry(1.0, 0.4, 1.0, 2, 0.1).translate(0, 0.2, 0),
    new RoundedBoxGeometry(0.46, 1.4, 0.46, 2, 0.08).translate(0, 1.1, 0),
    new RoundedBoxGeometry(0.9, 0.16, 0.9, 2, 0.06).translate(0, 1.86, 0),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => new RoundedBoxGeometry(0.14, 0.62, 0.14, 1, 0.04).translate(a * 0.33, 2.2, b * 0.33)),
    new RoundedBoxGeometry(1.2, 0.24, 1.2, 2, 0.1).translate(0, 2.62, 0),
    new RoundedBoxGeometry(0.6, 0.22, 0.6, 2, 0.1).translate(0, 2.84, 0)
  ]);
  const lampSpots = [];
  for (let i = 0, acc = 14; i < TRAIL.length - 1; i++) {
    const ax = TRAIL[i][0], az = TRAIL[i][1], dx = TRAIL[i + 1][0] - ax, dz = TRAIL[i + 1][1] - az, len = Math.hypot(dx, dz);
    for (; acc < len; acc += 34) {
      const side = lampSpots.length % 2 ? 1 : -1, t = acc / len;
      const x = ax + dx * t + (-dz / len) * 4.6 * side, z = az + dz * t + (dx / len) * 4.6 * side;
      if (getHeight(x, z) > 1.5) lampSpots.push([x, z, Math.atan2(dx, dz)]);
    }
    acc -= len;
  }
  const lampMat = patch(new THREE.MeshStandardMaterial({ color: '#cfc4b0', roughness: 0.85 }), 'stone');
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const lampLevel = new Float32Array(64), lampLit = new Uint8Array(64); let litNow = 0;
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampSpots.length), glows = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), glowMat, lampSpots.length);
  lampSpots.forEach(([x, z, ry], i) => {
    const h = getHeight(x, z) - 0.12;
    ps.set(x, h, z); qt.setFromEuler(eu.set(0, ry, 0)); sc.set(1, 1, 1); m4.compose(ps, qt, sc); lamps.setMatrixAt(i, m4);
    ps.set(x, h + 2.2, z); m4.compose(ps, qt, sc); glows.setMatrixAt(i, m4);
    addCollider(x, z, 0.6);
  });
  lamps.castShadow = lamps.receiveShadow = true;
  scene.add(lamps, glows);

  // ---------- mushrooms ----------
  const MUSH = 700, stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 0.34, 8).translate(0, 0.17, 0), new THREE.MeshStandardMaterial({ color: '#f3ead6', roughness: 0.7 }), MUSH);
  const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.75, 1).translate(0, 0.3, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45 }), MUSH);
  const capCols = [C('#e8503f'), C('#f0a23c'), C('#b98be8'), C('#f3ead6')];
  let nm = 0;
  for (let tries = 0; tries < 5000 && nm < MUSH; tries++) {
    const cx = (R() - 0.5) * (SIZE - 200), cz = (R() - 0.5) * (SIZE - 200), ch = getHeight(cx, cz);
    if (ch < 3 || ch > 100 || fmask(cx, cz) < 0.47) continue;
    const cc = capCols[Math.floor(R() * capCols.length)], cnt = 3 + Math.floor(R() * 6);
    for (let k = 0; k < cnt && nm < MUSH; k++) {
      const x = cx + (R() - 0.5) * 3.2, z = cz + (R() - 0.5) * 3.2, s = 0.7 + R() * 1.5;
      ps.set(x, getHeight(x, z) - 0.03, z); qt.setFromEuler(eu.set((R() - 0.5) * 0.3, R() * 6.28, (R() - 0.5) * 0.3)); sc.set(s, s, s);
      m4.compose(ps, qt, sc); stems.setMatrixAt(nm, m4); caps.setMatrixAt(nm, m4); caps.setColorAt(nm, cc);
      nm++;
    }
  }
  stems.count = caps.count = nm; caps.castShadow = true;
  scene.add(stems, caps);

  // ---------- ruins ----------
  const stone = patch(new THREE.MeshStandardMaterial({ color: '#d2c7b2', roughness: 0.85 }), 'stone');
  const stoneD = patch(new THREE.MeshStandardMaterial({ color: '#ab9f8c', roughness: 0.85 }), 'stone');
  const ruins = new THREE.Group(); scene.add(ruins);
  function block(w, h, d, x, y, z, ry, mat) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(0.42, Math.min(w, h, d) * 0.14)), mat || stone);
    m.position.set(x, y, z); m.rotation.y = ry || 0; m.castShadow = m.receiveShadow = true; ruins.add(m); return m;
  }
  function pillar(x, z, w, h, ry) {
    const base = getHeight(x, z) - 1.2;
    block(w * 1.35, 1.6, w * 1.35, x, base + 0.8, z, ry, stoneD);
    block(w, h, w, x, base + 1.6 + h / 2, z, ry);
    addBox(x, z, w * 0.675, w * 0.675, ry || 0, base, base + 1.6 + h);
    return base + 1.6 + h;
  }
  const emberSpots = [];
  function ring(cx, cz, rad, n, hBase) {
    let prev = null;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
      const broken = R() < 0.3, h = broken ? 2.5 + R() * 4 : hBase + R() * 1.5;
      const top = pillar(x, z, 2.4, h, -a);
      if (broken) {
        const L = 5 + R() * 3, dr = R() * 3, bx = x + Math.cos(a) * 4, bz = z + Math.sin(a) * 4;
        const m = block(2.4, 2.4, L, bx, getHeight(bx, bz) + 0.7, bz, dr); m.rotation.z = 0.2;
        addBox(bx, bz, 1.25, L / 2, dr, getHeight(bx, bz) - 0.6, getHeight(bx, bz) + 1.9);
      }
      const cur = broken ? null : { x, z, top };
      if (cur && prev) {
        const mx = (x + prev.x) / 2, mz = (z + prev.z) / 2, len = Math.hypot(x - prev.x, z - prev.z) + 2.6;
        const ly = Math.max(top, prev.top), lr = -Math.atan2(z - prev.z, x - prev.x);
        block(len, 1.8, 3, mx, ly + 0.9, mz, lr);
        addBox(mx, mz, len / 2, 1.5, lr, ly, ly + 1.8);
      }
      prev = cur;
    }
    block(7, 1.2, 7, cx, getHeight(cx, cz) + 0.2, cz, 0.4, stoneD);     // altar
    block(3, 1.6, 3, cx, getHeight(cx, cz) + 1.4, cz, 0.4);
    addBox(cx, cz, 3.5, 3.5, 0.4, getHeight(cx, cz) - 0.4, getHeight(cx, cz) + 0.8);
    addBox(cx, cz, 1.5, 1.5, 0.4, getHeight(cx, cz) + 0.6, getHeight(cx, cz) + 2.2);
    emberSpots.push([cx, getHeight(cx, cz) + 3.6, cz]);
  }
  function gate(cx, cz, ry) {
    const dx = Math.cos(ry) * 7, dz = -Math.sin(ry) * 7;
    const t1 = pillar(cx + dx, cz + dz, 4, 20, ry), t2 = pillar(cx - dx, cz - dz, 4, 20, ry);
    const gt = Math.max(t1, t2);
    block(22, 3.5, 5, cx, gt + 1.75, cz, ry);
    block(26, 1.5, 6.5, cx, gt + 4.2, cz, ry, stoneD);
    addBox(cx, cz, 11, 2.5, ry, gt, gt + 3.5); addBox(cx, cz, 13, 3.25, ry, gt + 3.5, gt + 4.95);
    emberSpots.push([cx, gt + 4.95 + 1.7, cz]);                      // on top of the gate: a climb to earn it
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

  [1, 7, 8, 9, 10].forEach((i) => { const x = TRAIL[i][0], z = TRAIL[i][1]; if (getHeight(x, z) > 1) emberSpots.push([x, getHeight(x, z) + 1.7, z]); });

  // the Spire: a colossal landmark with a light on top, visible from the spawn
  const spire = new THREE.Group(), SX = 0, SZ = -560, sBase = getHeight(SX, SZ) - 6;
  let y = sBase, rad = 26;
  for (let i = 0; i < 9; i++) {
    const h = 30 - i * 1.5, r2 = rad * 0.84;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r2, rad, h, 20), i % 2 ? stoneD : stone);
    seg.position.set(SX, y + h / 2, SZ); seg.rotation.y = i * 0.35; seg.castShadow = seg.receiveShadow = true; spire.add(seg);
    y += h; rad = r2;
  }
  const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(7, 0), new THREE.MeshStandardMaterial({ color: '#ffe2a0', emissive: '#ffb84a', emissiveIntensity: 5 }));
  beacon.position.set(SX, y + 14, SZ); spire.add(beacon);
  scene.add(spire);
  addCollider(SX, SZ, 27);

  return {
    getHeight, getSlope, resolve, heightTex, waterUniforms, N, SIZE, WATER,
    trailDist, emberSpots,
    wake() { beacon.material.emissiveIntensity = 16; beacon.scale.setScalar(1.6); },
    penetration, floorAt, lampSpots,
    pollLit() { const n = litNow; litNow = 0; return n; },
    update(t, night, pp, dt) {
      beacon.rotation.y = t * 0.4; beacon.position.y = y + 14 + Math.sin(t * 0.8) * 1.5;
      // lanterns glow at night and flare up when the wanderer comes close
      for (let i = 0; i < lampSpots.length; i++) {
        const near = pp ? Math.hypot(pp.x - lampSpots[i][0], pp.z - lampSpots[i][1]) < 9 : false;
        if (near && !lampLit[i]) { lampLit[i] = 1; litNow++; }
        const target = 0.7 + night * 4.5 + (lampLit[i] ? 1.6 : 0) + (near ? 2.2 : 0) + Math.sin(t * 7 + i) * 0.2;
        lampLevel[i] += (target - lampLevel[i]) * Math.min(1, (dt || 0.016) * 4);
        glows.setColorAt(i, tmp.setRGB(lampLevel[i], lampLevel[i] * 0.6, lampLevel[i] * 0.22));
      }
      if (glows.instanceColor) glows.instanceColor.needsUpdate = true;
    }
  };
}
