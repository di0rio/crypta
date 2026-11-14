import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createWorld } from './world.js';
import { Sky } from './sky.js';
import { createGrass } from './grass.js';
import { Player } from './player.js';
import { shared } from './shade.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.3, 2400);

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
      c = mix(vec3(l), c, 1.16);
      c *= mix(vec3(1.0), vec3(1.05, 1.0, 0.93), uWarm);
      vec2 q = vUv - 0.5;
      c *= 1.0 - dot(q, q) * 0.62;
      c += (fract(sin(dot(vUv * 913.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.018;
      gl_FragColor = vec4(c, 1.0);
    }`
};

const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.75, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass(Grade);
composer.addPass(grade);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------- UI ----------
const $ = (id) => document.getElementById(id);
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
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(timer.getDelta(), 0.05);
  elapsed += dt;
  if (!player.active) player.yaw += dt * 0.05;                       // slow orbit behind the title
  player.update(dt, elapsed);
  sky.update(dt, player.pos, camera.position, elapsed, player.keys.KeyT ? 60 : 1);
  shared.uTime.value = elapsed; shared.uCloud.value = sky.dayF;
  world.update(elapsed);
  grass.update(player.pos);
  bloom.strength = 0.3 + sky.night * 0.35;
  grade.uniforms.uTime.value = elapsed; grade.uniforms.uWarm.value = sky.dayF * (1 - sky.night);
  composer.render();

  uiT -= dt;
  if (uiT <= 0) {
    uiT = 0.1;
    clock.textContent = sky.clock();
    arc.style.strokeDashoffset = (150.8 * (1 - player.stamina / 100)).toFixed(1);
    stam.classList.toggle('show', player.stamina < 99.5);
    stam.classList.toggle('low', player.exhausted);
  }
}
frame();

// console helpers: ERMO.time(0.8) for dusk, ERMO.go(x, z) to teleport
window.ERMO = {
  player, sky, world, renderer, scene,
  time(t) { sky.time = t; },
  go(x, z) { player.pos.set(x, world.getHeight(x, z) + 1, z); player.vel.set(0, 0, 0); player.camTarget.copy(player.pos); },
  enter() { $('enter').click(); }
};
