import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
import { createWorld } from './world.js';
import { Sky } from './sky.js';
import { createGrass } from './grass.js';
import { Player } from './player.js';
import { shared } from './shade.js';
import { createQuest } from './quest.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 2400);

const world = createWorld(scene);
const sky = new Sky(scene);
const grass = createGrass(scene, world, sky);
const player = new Player(scene, world, camera, canvas);

// water reads the same sky colours and light as everything else
const wu = world.waterUniforms;
wu.uTop.value = sky.top; wu.uHor.value = sky.hor; wu.uAmb.value = sky.ambient;
wu.uLightDir.value = sky.lightDir; wu.uLightCol.value = sky.lightCol;

// final grade, after tone mapping: gentle contrast curve, saturation, vignette, a little grain
const Grade = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uWarm: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uWarm; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.28);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, 1.07);
      c *= mix(vec3(1.0), vec3(1.05, 1.0, 0.93), uWarm);
      vec2 q = vUv - 0.5;
      c *= 1.0 - dot(q, q) * 0.45;
      c += (fract(sin(dot(vUv * 913.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.018;
      gl_FragColor = vec4(c, 1.0);
    }`
};

const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.75, 0.92);
composer.addPass(bloom);
// tilt-shift: sharp band across the middle, soft top and bottom = miniature look
const tiltH = new ShaderPass(HorizontalTiltShiftShader), tiltV = new ShaderPass(VerticalTiltShiftShader);
tiltH.uniforms.r.value = tiltV.uniforms.r.value = 0.5;
composer.addPass(tiltH); composer.addPass(tiltV);
composer.addPass(new OutputPass());
const grade = new ShaderPass(Grade);
composer.addPass(grade);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  tiltH.uniforms.h.value = 2.2 / w; tiltV.uniforms.v.value = 2.2 / h;
}
addEventListener('resize', resize); resize();

// ---------- UI ----------
const $ = (id) => document.getElementById(id);
const embersEl = $('embers'), toast = $('toast');
let toastT = 0;
const quest = createQuest(scene, world, player, {
  set(n, total, flash) { embersEl.textContent = 'BRASAS ' + n + ' / ' + total; if (flash) { embersEl.classList.remove('flash'); void embersEl.offsetWidth; embersEl.classList.add('flash'); } },
  say(text) { toast.textContent = text; toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('show'), 4200); }
});
const start = $('start'), hud = $('hud'), clock = $('clock'), stam = $('stamina'), arc = $('stamina-arc'), hint = $('hint');
$('loading').textContent = '';
$('enter').addEventListener('click', () => {
  start.classList.add('out'); hud.classList.remove('hidden'); player.active = true;
  const lock = canvas.requestPointerLock && canvas.requestPointerLock();
  if (lock && lock.catch) lock.catch(() => {});
  setTimeout(() => hint.classList.add('fade'), 14000);
});

// ---------- loop ----------
const timer = new THREE.Clock();
let elapsed = 0, uiT = 0;
function sim(dt) { elapsed += dt; player.update(dt, elapsed); quest.update(dt, elapsed); }
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(timer.getDelta(), 0.05);
  if (!player.active) player.yaw += dt * 0.05;                       // slow orbit behind the title
  sim(dt);
  sky.update(dt, player.pos, camera.position, elapsed, player.keys.KeyT ? 60 : 1);
  shared.uTime.value = elapsed; shared.uCloud.value = sky.dayF;
  world.update(elapsed, sky.night);
  grass.update(player.pos);
  bloom.strength = 0.3 + sky.night * 0.35;
  grade.uniforms.uTime.value = elapsed; grade.uniforms.uWarm.value = sky.dayF * (1 - sky.night);
  composer.render();

  uiT -= dt;
  if (uiT <= 0) {
    uiT = 0.1;
    clock.textContent = sky.clock();
    arc.style.strokeDashoffset = (150.8 * (1 - player.stamina / player.maxStamina)).toFixed(1);
    stam.classList.toggle('show', player.stamina < player.maxStamina - 0.5);
    stam.classList.toggle('low', player.exhausted);
  }
}
frame();

// console helpers: ERMO.time(0.8) for dusk, ERMO.go(x, z) to teleport
window.ERMO = {
  player, sky, world, renderer, scene, quest,
  step(n, dt) { for (let i = 0; i < n; i++) sim(dt || 1 / 60); },
  time(t) { sky.time = t; },
  go(x, z) { player.pos.set(x, world.getHeight(x, z) + 1, z); player.vel.set(0, 0, 0); player.camTarget.copy(player.pos); },
  enter() { $('enter').click(); }
};
