import * as THREE from 'three';
import { rng } from './noise.js';
import { NOISE, shared } from './shade.js';

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
float mAt(vec2 p) {
  vec2 uv = ((p + uSize * 0.5) / (uSize / (uN - 1.0)) + 0.5) / uN;
  return texture2D(uHeight, uv).g;
}
vec2 wrap(vec2 base) { return base + uPatch * floor((uPlayer.xz - base) / uPatch + 0.5); }
`;

const GRASS_VERT = /* glsl */`
${COMMON}
${NOISE}
attribute vec4 aOffset;
uniform vec3 uSunDir;
uniform float uCloud;
varying float vT; varying float vDry; varying float vShade; varying float vBack; varying float vSheen; varying vec3 vFlower;
#include <fog_pars_vertex>
void main() {
  vec2 wp = wrap(aOffset.xy);
  float h = hAt(wp);
  float slope = length(vec2(hAt(wp + vec2(1.5, 0.0)) - h, hAt(wp + vec2(0.0, 1.5)) - h)) / 1.5;
  float d = distance(wp, uPlayer.xz);
  float s = 1.0 - smoothstep(uPatch * 0.34, uPatch * 0.5, d);
  s *= smoothstep(2.0, 3.4, h) * (1.0 - smoothstep(120.0, 150.0, h)) * (1.0 - smoothstep(0.4, 0.62, slope));
  s *= smoothstep(0.7, 2.6, distance(vec3(wp.x, h, wp.y), cameraPosition));   // keep blades out of the lens
  float big = wfbm(wp * 0.03);                       // meadow-scale variation: tall lush vs short dry
  float clump = wnoise(wp * 0.45);
  float m = mAt(wp);                                  // 0 trail, ~0.25 lawn, 1 meadow
  s *= smoothstep(0.08, 0.2, m) * smoothstep(0.2, 0.5, wnoise(wp * 0.8 + 11.0) + m * 0.95);   // tufts on the lawn, full cover in meadows
  float patchF = smoothstep(0.6, 0.68, wnoise(wp * 0.075 + 5.0));   // flowers grow in groups
  float flower = step(0.965, aOffset.w) * patchF;
  float bh = (0.3 + aOffset.z * 0.42) * s * (0.42 + 0.58 * m) * (0.75 + big * 0.6) * (0.75 + clump * 0.45) * (1.0 + flower * 0.25);
  float ang = aOffset.w * 6.2831 * 37.0;
  float t = position.y;
  float wide = 1.0 + flower * 2.4 * step(0.6, t) * step(t, 0.9);
  vec3 pos = vec3(wp.x + cos(ang) * position.x * wide, h + t * bh, wp.y + sin(ang) * position.x * wide);

  // wind: steady sway plus gusts that travel across the field
  float gust = smoothstep(0.35, 0.8, wnoise(wp * 0.035 - uTime * vec2(0.45, 0.2)));
  float sway = sin(uTime * 1.5 + wp.x * 0.11 + wp.y * 0.08) * 0.35 + sin(uTime * 3.3 + wp.x * 0.45 + wp.y * 0.3) * 0.14;
  float bend = (sway + gust * 0.9) * t * t * bh;
  pos.x += bend * 0.62; pos.z += bend * 0.3; pos.y -= abs(bend) * 0.22;

  // the wanderer parts the grass
  vec2 pd = wp - uPlayer.xz; float pl = length(pd);
  float push = (1.0 - smoothstep(0.0, 1.5, pl)) * t * step(abs(uPlayer.y - h), 1.5);
  pos.xz += pd / (pl + 0.001) * push * 0.6; pos.y -= push * 0.35 * bh;

  vT = t; vDry = clamp(0.75 - big * 1.5 + (aOffset.z - 0.5) * 0.3, 0.0, 1.0) * 0.7;
  vShade = 1.0 - 0.62 * uCloud * cloudShadow(wp, uTime);
  vSheen = gust * t;
  vec2 toBlade = normalize(pos.xz - cameraPosition.xz + 0.0001);
  vBack = pow(max(dot(toBlade, normalize(uSunDir.xz + 0.0001)), 0.0), 3.0) * t * (1.0 - smoothstep(0.1, 0.75, uSunDir.y));
  float fc = fract(wnoise(wp * 0.021 + 2.0) * 3.0 + aOffset.z * 0.12);     // one colour family per group
  vFlower = flower * (fc < 0.4 ? vec3(1.0, 0.96, 0.85) : fc < 0.7 ? vec3(1.0, 0.78, 0.2) : fc < 0.88 ? vec3(0.72, 0.5, 1.0) : vec3(1.0, 0.45, 0.5));

  vec4 mvPosition = viewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const GRASS_FRAG = /* glsl */`
uniform vec3 uBase, uTip, uDry, uAmb, uSun;
varying float vT; varying float vDry; varying float vShade; varying float vBack; varying float vSheen; varying vec3 vFlower;
#include <fog_pars_fragment>
void main() {
  vec3 c = mix(uBase, mix(uTip, uDry, vDry), vT) * mix(0.45, 1.1, vT);
  float fl = step(0.001, vFlower.r) * step(0.66, vT);
  c = mix(c, vFlower, fl);
  vec3 light = uAmb + uSun * vShade * (0.5 + 0.5 * vT);
  c *= light;
  c += uSun * vShade * (vBack * 0.55 * vec3(1.0, 0.85, 0.45) + vSheen * 0.07);
  gl_FragColor = vec4(c, 1.0);
  #include <fog_fragment>
  // a non-finite pixel would be smeared into big squares by the bloom pass
  if (!(gl_FragColor.r >= 0.0 && gl_FragColor.r < 8.0 && gl_FragColor.g >= 0.0 && gl_FragColor.g < 8.0)) discard;
}`;

// fireflies at night, drifting pollen by day
const FLY_VERT = /* glsl */`
${COMMON}
attribute vec4 aOffset;
uniform float uNight;
varying float vA; varying float vN;
void main() {
  vec2 wp = wrap(aOffset.xy);
  wp += vec2(sin(uTime * 0.5 + aOffset.w * 40.0), cos(uTime * 0.4 + aOffset.z * 40.0)) * 2.5;
  float h = hAt(wp);
  float y = h + 0.5 + aOffset.z * 3.2 + sin(uTime * 0.9 + aOffset.w * 30.0) * 0.5;
  float d = distance(wp, uPlayer.xz);
  float fade = (1.0 - smoothstep(uPatch * 0.3, uPatch * 0.5, d)) * step(2.0, h);
  float isFly = step(0.5, aOffset.w);
  vN = isFly;
  vA = fade * mix((1.0 - uNight) * 0.5, uNight * (0.35 + 0.65 * abs(sin(uTime * 1.3 + aOffset.w * 60.0))), isFly);
  vec4 mv = viewMatrix * vec4(wp.x, y, wp.y, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = mix(26.0, 90.0, isFly) / max(1.0, -mv.z);
}`;

const FLY_FRAG = /* glsl */`
uniform vec3 uSun;
varying float vA; varying float vN;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.0, 0.5, d);
  vec3 col = mix(uSun * 0.5 + 0.25, vec3(0.85, 1.0, 0.45) * 3.0, vN);
  gl_FragColor = vec4(col * a * a * vA, 1.0);
}`;

function offsets(count, patch, seed) {
  const r = rng(seed), a = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) { a[i * 4] = r() * patch; a[i * 4 + 1] = r() * patch; a[i * 4 + 2] = r(); a[i * 4 + 3] = r(); }
  return a;
}

export function createGrass(scene, world, sky) {
  const PATCH = 84, COUNT = 190000;
  const common = {
    uHeight: { value: world.heightTex }, uPlayer: { value: new THREE.Vector3() }, uTime: shared.uTime,
    uSize: { value: world.SIZE }, uN: { value: world.N }
  };

  // blade: tapered strip, x = half width, y = 0..1 along the blade
  const w = 0.07;
  const blade = new THREE.InstancedBufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, -w * 0.8, 0.45, 0, w * 0.8, 0.45, 0, -w * 0.45, 0.8, 0, w * 0.45, 0.8, 0, 0, 1, 0], 3));
  blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6]);
  blade.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets(COUNT, PATCH, 91), 4));
  blade.instanceCount = COUNT;

  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uBase: { value: new THREE.Color('#3d8539') }, uTip: { value: new THREE.Color('#9ed162') }, uDry: { value: new THREE.Color('#dccf72') },
    uAmb: { value: new THREE.Color(1, 1, 1) }, uSun: { value: new THREE.Color(1, 1, 1) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }
  }]);
  Object.assign(uniforms, common, { uPatch: { value: PATCH }, uCloud: shared.uCloud });
  const grass = new THREE.Mesh(blade, new THREE.ShaderMaterial({ vertexShader: GRASS_VERT, fragmentShader: GRASS_FRAG, uniforms, side: THREE.DoubleSide, fog: true }));
  grass.frustumCulled = false;
  scene.add(grass);

  const FP = 90, FC = 520;
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FC * 3), 3));
  fg.setAttribute('aOffset', new THREE.BufferAttribute(offsets(FC, FP, 133), 4));
  const fu = Object.assign({ uNight: { value: 0 }, uSun: uniforms.uSun, uPatch: { value: FP } }, common);
  const flies = new THREE.Points(fg, new THREE.ShaderMaterial({ vertexShader: FLY_VERT, fragmentShader: FLY_FRAG, uniforms: fu, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flies.frustumCulled = false;
  scene.add(flies);

  return {
    update(playerPos) {
      common.uPlayer.value.copy(playerPos);
      uniforms.uAmb.value.copy(sky.ambient); uniforms.uSun.value.copy(sky.lightCol).multiplyScalar(0.36);
      uniforms.uSunDir.value.copy(sky.lightDir);
      fu.uNight.value = sky.night;
    }
  };
}
