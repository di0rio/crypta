import * as THREE from 'three';
import { clamp, lerp, smoothstep } from './noise.js';

// Sky dome + sun/moon light + fog, all driven by one time-of-day value (0..1, 0.5 = noon).

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const FRAG = /* glsl */`
uniform vec3 uTop, uHor, uSunDir, uSunCol, uCloud;
uniform float uNight, uTime;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHor, uTop, pow(h, 0.5));
  col = mix(col, uHor * 0.55, clamp(-d.y * 4.0, 0.0, 1.0));

  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(sd, 900.0) * 14.0 + pow(sd, 40.0) * 0.5 + pow(sd, 5.0) * 0.16);

  float md = max(dot(d, -uSunDir), 0.0);
  col += vec3(0.82, 0.88, 1.0) * (smoothstep(0.9990, 0.9994, md) * 2.2 + pow(md, 90.0) * 0.18) * uNight;

  // stars
  vec2 suv = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0))) * 110.0;
  vec2 cell = floor(suv); float r = hash(cell);
  float star = step(0.975, r) * (1.0 - smoothstep(0.0, 0.22, length(fract(suv) - 0.5)));
  star *= 0.55 + 0.45 * sin(uTime * 2.5 + r * 90.0);
  col += star * uNight * 3.0 * smoothstep(0.0, 0.2, d.y);

  // clouds on a plane above the camera
  if (d.y > 0.01) {
    vec2 uv = d.xz / (d.y + 0.18) * 0.9 + vec2(uTime * 0.006, uTime * 0.002);
    float c = smoothstep(0.48, 0.8, fbm(uv * 1.6));
    float lit = 0.55 + 0.45 * fbm(uv * 3.1 + 3.0);
    vec3 cc = uCloud * lit + uSunCol * pow(sd, 6.0) * 0.5;
    col = mix(col, cc, c * smoothstep(0.01, 0.2, d.y) * 0.9);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const C = (h) => new THREE.Color(h);
const K = {
  dayTop: C('#2a78d2'), dayHor: C('#bcdcf0'), nightTop: C('#050a1c'), nightHor: C('#1b2850'),
  duskTop: C('#3b3f86'), duskHor: C('#ff8548'),
  sunLow: C('#ff7a2e'), sunHigh: C('#fff3dc'), moon: C('#86a8ff'),
  cloudDay: C('#ffffff'), cloudDusk: C('#ffb08a'), cloudNight: C('#1c2644'),
  ground: C('#514a38')
};

export class Sky {
  constructor(scene) {
    this.time = 0.34;            // start in the morning
    this.dayLength = 420;        // seconds per full day
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.lightDir = new THREE.Vector3(0, 1, 0);
    this.dayF = 1; this.night = 0;
    this.grassLight = new THREE.Color(1, 1, 1);
    this.top = new THREE.Color(); this.hor = new THREE.Color();
    this._c = new THREE.Color();

    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    const s = this.sun.shadow;
    s.mapSize.set(2048, 2048); s.camera.near = 1; s.camera.far = 420;
    s.camera.left = s.camera.bottom = -75; s.camera.right = s.camera.top = 75;
    s.bias = -0.0005; s.normalBias = 0.5;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, K.ground, 1);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xbcdcf0, 0.0012);
    this.fog = scene.fog;

    this.uniforms = {
      uTop: { value: this.top }, uHor: { value: this.hor }, uSunDir: { value: this.sunDir },
      uSunCol: { value: new THREE.Color() }, uCloud: { value: new THREE.Color() }, uNight: { value: 0 }, uTime: { value: 0 }
    };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16),
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false }));
    this.dome.frustumCulled = false; this.dome.renderOrder = -10;
    scene.add(this.dome);
  }

  clock() {
    const m = Math.floor(this.time * 1440), hh = Math.floor(m / 60), mm = m % 60;
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }

  update(dt, focus, camPos, elapsed, speed) {
    this.time = (this.time + dt * speed / this.dayLength) % 1;
    const a = (this.time - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(a), Math.sin(a), 0.38).normalize();
    const sy = this.sunDir.y;
    const dayF = this.dayF = smoothstep(-0.12, 0.22, sy);
    const night = this.night = 1 - smoothstep(-0.3, -0.06, sy);
    const tw = clamp(1 - Math.abs(sy) / 0.3, 0, 1);

    this.top.copy(K.nightTop).lerp(K.dayTop, dayF).lerp(K.duskTop, tw * 0.45);
    this.hor.copy(K.nightHor).lerp(K.dayHor, dayF).lerp(K.duskHor, tw * 0.7);

    const u = this.uniforms;
    u.uSunCol.value.copy(K.sunLow).lerp(K.sunHigh, smoothstep(0.0, 0.45, sy)).multiplyScalar(smoothstep(-0.08, 0.05, sy));
    u.uCloud.value.copy(K.cloudNight).lerp(K.cloudDay, dayF).lerp(K.cloudDusk, tw * 0.6);
    u.uNight.value = night; u.uTime.value = elapsed;

    // one shadow-casting light: the sun by day, the moon by night
    const sunI = smoothstep(-0.04, 0.16, sy) * 2.8, moonI = smoothstep(-0.02, -0.2, sy) * 1.1;
    if (sunI >= moonI) { this.lightDir.copy(this.sunDir); this.sun.color.copy(u.uSunCol.value); this.sun.intensity = sunI; }
    else { this.lightDir.copy(this.sunDir).negate(); this.sun.color.copy(K.moon); this.sun.intensity = moonI; }
    if (this.lightDir.y < 0.08) { this.lightDir.y = 0.08; this.lightDir.normalize(); }
    this.sun.position.copy(focus).addScaledVector(this.lightDir, 200);
    this.sun.target.position.copy(focus);

    this.hemi.color.copy(this.top).lerp(this.hor, 0.5).lerp(K.moon, night * 0.5);
    this.hemi.intensity = lerp(0.55, 1.0, dayF) + tw * 0.25;
    this.fog.color.copy(this.hor).multiplyScalar(lerp(0.75, 0.95, dayF));
    this.fog.density = lerp(0.0017, 0.0011, dayF) + tw * 0.0005;

    // unlit shaders (grass) get one combined light colour
    this.grassLight.copy(this.hemi.color).multiplyScalar(this.hemi.intensity * 0.55)
      .add(this._c.copy(this.sun.color).multiplyScalar(this.sun.intensity * 0.3 * Math.max(0.25, this.lightDir.y + 0.35)));

    this.dome.position.copy(camPos);
  }
}
