import * as THREE from 'three';
import { rng } from './noise.js';

// GPU grass: one instanced patch that wraps around the player, so the whole world looks covered.
// Blade positions are stable in world space; the vertex shader reads ground height from a texture.

const COMMON = /* glsl */`
uniform sampler2D uHeight;
uniform vec3 uPlayer;
uniform float uTime, uPatch, uSize, uN;
float hAt(vec2 p) {
  vec2 uv = ((p + uSize * 0.5) / (uSize / (uN - 1.0)) + 0.5) / uN;
  return texture2D(uHeight, uv).r;
}
vec2 wrap(vec2 base) { return base + uPatch * floor((uPlayer.xz - base) / uPatch + 0.5); }
`;

const GRASS_VERT = /* glsl */`
${COMMON}
attribute vec4 aOffset;
varying float vT; varying float vTint;
#include <fog_pars_vertex>
void main() {
  vec2 wp = wrap(aOffset.xy);
  float h = hAt(wp);
  float slope = length(vec2(hAt(wp + vec2(1.5, 0.0)) - h, hAt(wp + vec2(0.0, 1.5)) - h)) / 1.5;
  float d = distance(wp, uPlayer.xz);
  float s = 1.0 - smoothstep(uPatch * 0.34, uPatch * 0.5, d);
  s *= smoothstep(2.0, 3.4, h) * (1.0 - smoothstep(120.0, 150.0, h)) * (1.0 - smoothstep(0.4, 0.62, slope));
  float patchy = 0.55 + 0.45 * sin(wp.x * 0.11) * sin(wp.y * 0.13 + 1.7);
  float bh = (0.32 + aOffset.z * 0.6) * s * (0.6 + patchy * 0.7);
  float ang = aOffset.w * 6.2831;
  float t = position.y;
  vec3 pos = vec3(wp.x + cos(ang) * position.x, h + t * bh, wp.y + sin(ang) * position.x);
  float wind = sin(uTime * 1.5 + wp.x * 0.11 + wp.y * 0.08) * 0.55 + sin(uTime * 3.3 + wp.x * 0.45 + wp.y * 0.3) * 0.18;
  pos.x += wind * t * t * 0.5 * bh; pos.z += wind * 0.5 * t * t * 0.5 * bh;
  vec2 pd = wp - uPlayer.xz; float pl = length(pd);
  float push = (1.0 - smoothstep(0.0, 1.5, pl)) * t * step(abs(uPlayer.y - h), 1.5);
  pos.xz += pd / (pl + 0.001) * push * 0.6; pos.y -= push * 0.35 * bh;
  vT = t; vTint = aOffset.z * 0.6 + patchy * 0.4;
  vec4 mvPosition = viewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const GRASS_FRAG = /* glsl */`
uniform vec3 uBase, uTip, uDry, uLight;
varying float vT; varying float vTint;
#include <fog_pars_fragment>
void main() {
  vec3 c = mix(uBase, mix(uTip, uDry, smoothstep(0.55, 1.0, vTint) * 0.6), vT);
  c *= mix(0.55, 1.15, vT) * uLight;
  gl_FragColor = vec4(c, 1.0);
  #include <fog_fragment>
  // a non-finite pixel would be smeared into big squares by the bloom pass
  if (!(gl_FragColor.r >= 0.0 && gl_FragColor.r < 8.0 && gl_FragColor.g >= 0.0 && gl_FragColor.g < 8.0)) discard;
}`;

const FLY_VERT = /* glsl */`
${COMMON}
attribute vec4 aOffset;
uniform float uNight;
varying float vA;
void main() {
  vec2 wp = wrap(aOffset.xy);
  wp += vec2(sin(uTime * 0.5 + aOffset.w * 40.0), cos(uTime * 0.4 + aOffset.z * 40.0)) * 2.5;
  float h = hAt(wp);
  float y = h + 0.6 + aOffset.z * 2.6 + sin(uTime * 0.9 + aOffset.w * 30.0) * 0.5;
  float d = distance(wp, uPlayer.xz);
  vA = uNight * (1.0 - smoothstep(uPatch * 0.3, uPatch * 0.5, d)) * step(2.0, h) * (0.35 + 0.65 * abs(sin(uTime * 1.3 + aOffset.w * 60.0)));
  vec4 mv = viewMatrix * vec4(wp.x, y, wp.y, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = 90.0 / max(1.0, -mv.z);
}`;

const FLY_FRAG = /* glsl */`
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.0, 0.5, d);
  gl_FragColor = vec4(vec3(0.85, 1.0, 0.45) * 3.0 * a * a * vA, 1.0);
}`;

function offsets(count, patch, seed) {
  const r = rng(seed), a = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) { a[i * 4] = r() * patch; a[i * 4 + 1] = r() * patch; a[i * 4 + 2] = r(); a[i * 4 + 3] = r(); }
  return new THREE.InstancedBufferAttribute(a, 4);
}

export function createGrass(scene, world, sky) {
  const PATCH = 110, COUNT = 260000;
  const shared = {
    uHeight: { value: world.heightTex }, uPlayer: { value: new THREE.Vector3() }, uTime: { value: 0 },
    uPatch: { value: PATCH }, uSize: { value: world.SIZE }, uN: { value: world.N }
  };

  // blade: tapered strip, x = half width, y = 0..1 along the blade
  const w = 0.05;
  const blade = new THREE.InstancedBufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, -w * 0.75, 0.5, 0, w * 0.75, 0.5, 0, 0, 1, 0], 3));
  blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  blade.setAttribute('aOffset', offsets(COUNT, PATCH, 91));
  blade.instanceCount = COUNT;

  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uBase: { value: new THREE.Color('#2c5e24') }, uTip: { value: new THREE.Color('#7fc043') },
    uDry: { value: new THREE.Color('#c9c860') }, uLight: { value: new THREE.Color(1, 1, 1) }
  }]);
  Object.assign(uniforms, shared);
  const grass = new THREE.Mesh(blade, new THREE.ShaderMaterial({ vertexShader: GRASS_VERT, fragmentShader: GRASS_FRAG, uniforms, side: THREE.DoubleSide, fog: true }));
  grass.frustumCulled = false;
  scene.add(grass);

  const FP = 90, FC = 260;
  const fg = new THREE.BufferGeometry();
  const fo = offsets(FC, FP, 133);
  fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FC * 3), 3));
  fg.setAttribute('aOffset', new THREE.BufferAttribute(fo.array, 4));
  const fu = Object.assign({ uNight: { value: 0 } }, shared, { uPatch: { value: FP } });
  const flies = new THREE.Points(fg, new THREE.ShaderMaterial({ vertexShader: FLY_VERT, fragmentShader: FLY_FRAG, uniforms: fu, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flies.frustumCulled = false;
  scene.add(flies);

  return {
    update(playerPos, elapsed) {
      shared.uPlayer.value.copy(playerPos); shared.uTime.value = elapsed;
      uniforms.uLight.value.copy(sky.grassLight);
      fu.uNight.value = sky.night;
      flies.visible = sky.night > 0.01;
    }
  };
}
