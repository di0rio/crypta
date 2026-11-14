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
uniform vec3 uTop, uHor, uSunDir, uSunCol, uCloud, uCloudDark;
uniform float uNight, uTime;
varying vec3 vDir;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) { s += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.7; a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHor, uTop, pow(h, 0.42));
  col = mix(col, uHor, exp(-h * 9.0) * 0.6);                         // haze band on the horizon
  col = mix(col, uHor * 0.5, clamp(-d.y * 4.0, 0.0, 1.0));

  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(sd, 6.0) * 0.14 + pow(sd, 60.0) * 0.45);   // glow
  col += uSunCol * smoothstep(0.99955, 0.99975, sd) * 30.0;         // disc

  // moon: lit disc with soft craters
  vec3 md3 = -uSunDir; float md = max(dot(d, md3), 0.0);
  float disc = smoothstep(0.99905, 0.99925, md);
  vec2 mc = (d - md3 * md).xy * 60.0;
  col += vec3(0.85, 0.9, 1.0) * (disc * (1.7 - 0.7 * noise(mc * 3.0 + 9.0)) + pow(md, 120.0) * 0.2 + pow(md, 12.0) * 0.05) * uNight;

  // stars + a faint band of the galaxy
  vec2 suv = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)));
  vec2 g = suv * vec2(160.0, 160.0); vec2 cell = floor(g); float r = hash(cell);
  vec2 sp = fract(g) - 0.5 - (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.6;
  float star = step(0.955, r) * (1.0 - smoothstep(0.0, 0.11 + 0.1 * fract(r * 77.0), length(sp)));
  star *= 0.6 + 0.4 * sin(uTime * 2.5 + r * 90.0);
  float band = exp(-pow((d.y * 0.8 + d.x * 0.55 - d.z * 0.25) * 3.2, 2.0));
  float fade = uNight * smoothstep(0.0, 0.22, d.y);
  col += (star * (2.2 + 4.0 * fract(r * 13.0)) * mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.75), fract(r * 31.0)) + vec3(0.1, 0.12, 0.2) * band * fbm(d.xz * 6.0)) * fade;

  // clouds: two drifting layers on a plane above the camera, lit toward the sun
  if (d.y > 0.01) {
    vec2 uv = d.xz / (d.y + 0.16);
    vec2 w1 = uv * 0.55 + vec2(uTime * 0.0045, uTime * 0.0015);
    float base = fbm(w1 + 0.35 * vec2(fbm(w1 * 1.7 + 4.0), fbm(w1 * 1.7 - 2.0)));
    float c = smoothstep(0.42, 0.72, base);
    float thick = smoothstep(0.5, 0.95, base);
    float wisp = smoothstep(0.55, 0.8, fbm(uv * 1.9 - vec2(uTime * 0.008, 0.0))) * 0.35;
    vec3 lit = uCloud + uSunCol * (0.25 + pow(sd, 4.0) * 1.1);
    vec3 cc = mix(lit, uCloudDark, thick * 0.75);
    float cover = clamp(c + wisp * (1.0 - c), 0.0, 1.0) * smoothstep(0.01, 0.16, d.y);
    col = mix(col, cc, cover * 0.92);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const C = (h) => new THREE.Color(h);
const K = {
  dayTop: C('#1f6fd0'), dayHor: C('#b4d8f0'), nightTop: C('#040917'), nightHor: C('#18244a'),
  duskTop: C('#3a3c8a'), duskHor: C('#ff7a3d'),
  sunLow: C('#ff6a24'), sunHigh: C('#fff1d6'), moon: C('#86a8ff'),
  cloudDay: C('#ffffff'), cloudDusk: C('#ff9d78'), cloudNight: C('#232f55'),
  darkDay: C('#7f8ea6'), darkDusk: C('#4a3a66'), darkNight: C('#0a1024'),
  ground: C('#514a38')
};

export class Sky {
  constructor(scene) {
    this.time = 0.34;            // start in the morning
    this.dayLength = 420;        // seconds per full day
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.lightDir = new THREE.Vector3(0, 1, 0);
    this.lightCol = new THREE.Color(1, 1, 1);      // sun/moon colour * intensity
    this.ambient = new THREE.Color(1, 1, 1);       // sky light for unlit shaders
    this.dayF = 1; this.night = 0;
    this.top = new THREE.Color(); this.hor = new THREE.Color();

    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    const s = this.sun.shadow;
    s.mapSize.set(4096, 4096); s.camera.near = 1; s.camera.far = 420;
    s.camera.left = s.camera.bottom = -62; s.camera.right = s.camera.top = 62;
    s.bias = -0.0004; s.normalBias = 0.35; s.radius = 2.5;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, K.ground, 1);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xbcdcf0, 0.0012);
    this.fog = scene.fog;

    this.uniforms = {
      uTop: { value: this.top }, uHor: { value: this.hor }, uSunDir: { value: this.sunDir },
      uSunCol: { value: new THREE.Color() }, uCloud: { value: new THREE.Color() }, uCloudDark: { value: new THREE.Color() },
      uNight: { value: 0 }, uTime: { value: 0 }
    };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24),
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
    const tw = clamp(1 - Math.abs(sy) / 0.32, 0, 1);

    this.top.copy(K.nightTop).lerp(K.dayTop, dayF).lerp(K.duskTop, tw * 0.5);
    this.hor.copy(K.nightHor).lerp(K.dayHor, dayF).lerp(K.duskHor, tw * 0.72);

    const u = this.uniforms;
    u.uSunCol.value.copy(K.sunLow).lerp(K.sunHigh, smoothstep(0.02, 0.5, sy)).multiplyScalar(smoothstep(-0.08, 0.05, sy));
    u.uCloud.value.copy(K.cloudNight).lerp(K.cloudDay, dayF).lerp(K.cloudDusk, tw * 0.65);
    u.uCloudDark.value.copy(K.darkNight).lerp(K.darkDay, dayF).lerp(K.darkDusk, tw * 0.7);
    u.uNight.value = night; u.uTime.value = elapsed;

    // one shadow-casting light: the sun by day, the moon by night
    const sunI = smoothstep(-0.04, 0.16, sy) * 3.0, moonI = smoothstep(-0.02, -0.2, sy) * 1.1;
    if (sunI >= moonI) { this.lightDir.copy(this.sunDir); this.sun.color.copy(u.uSunCol.value); this.sun.intensity = sunI; }
    else { this.lightDir.copy(this.sunDir).negate(); this.sun.color.copy(K.moon); this.sun.intensity = moonI; }
    if (this.lightDir.y < 0.1) { this.lightDir.y = 0.1; this.lightDir.normalize(); }
    this.sun.position.copy(focus).addScaledVector(this.lightDir, 200);
    this.sun.target.position.copy(focus);
    this.lightCol.copy(this.sun.color).multiplyScalar(this.sun.intensity);

    this.hemi.color.copy(this.top).lerp(this.hor, 0.5).lerp(K.moon, night * 0.5);
    this.hemi.intensity = lerp(0.6, 1.35, dayF) + tw * 0.25;
    this.ambient.copy(this.hemi.color).multiplyScalar(Math.min(this.hemi.intensity, 1.0) * 0.6);
    this.fog.color.copy(this.hor).multiplyScalar(lerp(0.75, 0.95, dayF));
    this.fog.density = lerp(0.0017, 0.00105, dayF) + tw * 0.0006;

    this.dome.position.copy(camPos);
  }
}
