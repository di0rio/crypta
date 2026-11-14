import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createWorld } from './world.js';
import { Sky } from './sky.js';
import { createGrass } from './grass.js';
import { Player } from './player.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.3, 2400);

const world = createWorld(scene);
const sky = new Sky(scene);
const grass = createGrass(scene, world, sky);
const player = new Player(scene, world, camera, canvas);

const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.7, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

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
  canvas.requestPointerLock && canvas.requestPointerLock();
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
  world.update(elapsed);
  grass.update(player.pos, elapsed);
  bloom.strength = 0.32 + sky.night * 0.35;
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
  go(x, z) { player.pos.set(x, world.getHeight(x, z) + 1, z); player.vel.set(0, 0, 0); },
  enter() { $('enter').click(); }
};
