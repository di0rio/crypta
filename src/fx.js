import * as THREE from 'three';

// Small pooled particle system for game feel: dust under the feet, landing puffs, water splashes, ember sparks.

const MAX = 320;
const VERT = /* glsl */`
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
uniform float uScale;
varying float vA; varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  vA = aAlpha; vC = aColor;
}`;
const FRAG = /* glsl */`
varying float vA; varying vec3 vC;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.25, 0.5, d)) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vC, a);
}`;

export function createFx(scene) {
  const pos = new Float32Array(MAX * 3), size = new Float32Array(MAX), alpha = new Float32Array(MAX), col = new Float32Array(MAX * 3);
  const vel = new Float32Array(MAX * 3), life = new Float32Array(MAX), maxLife = new Float32Array(MAX), grow = new Float32Array(MAX), grav = new Float32Array(MAX), a0 = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const uniforms = { uScale: { value: 1000 } };
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthWrite: false }));
  pts.frustumCulled = false; pts.renderOrder = 5;
  scene.add(pts);
  let next = 0;
  const c = new THREE.Color();

  function emit(x, y, z, vx, vy, vz, sz, lf, color, alph, gr, gv) {
    const i = next; next = (next + 1) % MAX;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    size[i] = sz; life[i] = maxLife[i] = lf; a0[i] = alph; grow[i] = gr; grav[i] = gv;
    c.set(color); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const rnd = (a) => (Math.random() - 0.5) * a;

  return {
    setScale(v) { uniforms.uScale.value = v; },
    dust(p, color, n, power) {
      for (let i = 0; i < n; i++) emit(p.x + rnd(0.5), p.y + 0.12, p.z + rnd(0.5), rnd(1.6) * power, 0.5 + Math.random() * 0.9, rnd(1.6) * power, 0.35 + Math.random() * 0.3, 0.5 + Math.random() * 0.4, color, 0.5, 1.1, -0.6);
    },
    ring(p, color) {                                      // landing puff: a circle of dust rolling outward
      for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; emit(p.x, p.y + 0.15, p.z, Math.cos(a) * 3.2, 0.5, Math.sin(a) * 3.2, 0.5, 0.55, color, 0.55, 1.4, -0.4); }
    },
    splash(p) {
      for (let i = 0; i < 10; i++) emit(p.x + rnd(0.6), 0.05, p.z + rnd(0.6), rnd(2.4), 2 + Math.random() * 2.5, rnd(2.4), 0.2 + Math.random() * 0.15, 0.6, '#dff4ff', 0.8, 0.2, -9);
    },
    sparks(x, y, z) {
      for (let i = 0; i < 36; i++) { const a = Math.random() * 6.28, u = Math.random() * 2 - 1, s = 3 + Math.random() * 5, r = Math.sqrt(1 - u * u);
        emit(x, y, z, Math.cos(a) * r * s, u * s + 2, Math.sin(a) * r * s, 0.22 + Math.random() * 0.2, 0.7 + Math.random() * 0.6, i % 3 ? '#ffd36b' : '#fff6d8', 1, -0.5, -5); }
    },
    update(dt) {
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) { alpha[i] = 0; continue; }
        life[i] -= dt;
        const k = Math.max(0, life[i] / maxLife[i]);
        vel[i * 3 + 1] += grav[i] * dt; vel[i * 3] *= 1 - 2.2 * dt; vel[i * 3 + 2] *= 1 - 2.2 * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        size[i] = Math.max(0.02, size[i] + grow[i] * dt);
        alpha[i] = a0[i] * k;
      }
      geo.attributes.position.needsUpdate = geo.attributes.aSize.needsUpdate = geo.attributes.aAlpha.needsUpdate = geo.attributes.aColor.needsUpdate = true;
    }
  };
}
