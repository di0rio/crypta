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
import { createAudio } from './audio.js';
import { createFx } from './fx.js';
import { createCombat } from './combat.js';
import { createBoss, NEED } from './boss.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 2400);

const world = createWorld(scene);
const sky = new Sky(scene);
const grass = createGrass(scene, world, sky);
const player = new Player(scene, world, camera, canvas);
const audio = createAudio(), fx = createFx(scene);

// water reads the same sky colours and light as everything else
const wu = world.waterUniforms;
wu.uTop.value = sky.top; wu.uHor.value = sky.hor; wu.uAmb.value = sky.ambient;
wu.uLightDir.value = sky.lightDir; wu.uLightCol.value = sky.lightCol;

// final grade, after tone mapping: gentle contrast curve, saturation, vignette, a little grain
const Grade = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uWarm: { value: 0 }, uFlash: { value: 0 }, uHurt: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uWarm, uFlash, uHurt; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.28);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, 1.07);
      c *= mix(vec3(1.0), vec3(1.05, 1.0, 0.93), uWarm);
      vec2 q = vUv - 0.5;
      c *= 1.0 - dot(q, q) * 0.45;
      c += vec3(1.0, 0.82, 0.45) * uFlash * (0.16 + dot(q, q) * 0.9);
      c = mix(c, vec3(0.75, 0.06, 0.04), clamp(uHurt * dot(q, q) * 2.6, 0.0, 0.85));
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
  renderer.setSize(w, h, false); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
  fx.setScale(h * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360)));
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
}, (e, n, all) => { audio.ember(n, all); fx.sparks(e.x, e.y, e.z); freeze = 0.07; flash = 1; player.shake = Math.max(player.shake, 0.12); player.squashV = 3; save(); });

// ---------- combat, boss, life and death ----------
const hpEl = $('hp'), bossEl = $('boss'), bossBar = $('boss-bar'), fadeEl = $('fade'), winEl = $('win');
for (let i = 0; i < 5; i++) hpEl.appendChild(document.createElement('i'));
const stats = { kills: 0, deaths: 0, t0: performance.now() };
const checkpoint = { x: 0, z: 6, lamps: new Set() };
const say = (text) => { toast.textContent = text; toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('show'), 4200); };
const cui = {
  say,
  hitstop(t, sh) { freeze = Math.max(freeze, t); player.shake = Math.max(player.shake, sh || 0); },
  shake(v) { player.shake = Math.max(player.shake, v); },
  flash() { flash = 1; },
  kill() { stats.kills++; },
  boss(f) { bossEl.classList.toggle('hidden', f === null); if (f !== null) bossBar.style.width = Math.max(0, f * 100).toFixed(1) + '%'; },
  win() {
    setTimeout(() => {
      const s = Math.floor((performance.now() - stats.t0) / 1000);
      $('win-stats').textContent = 'tempo ' + Math.floor(s / 60) + 'min ' + (s % 60) + 's · brasas ' + quest.count + '/' + quest.total + ' · quedas ' + stats.deaths + ' · inimigos ' + stats.kills;
      winEl.classList.remove('hidden'); if (document.exitPointerLock) document.exitPointerLock();
    }, 4500);
    sky.time = 0.27;                                              // dawn breaks over the fallen giant
  }
};
$('win-go').addEventListener('click', () => { winEl.classList.add('hidden'); const l = canvas.requestPointerLock && canvas.requestPointerLock(); if (l && l.catch) l.catch(() => {}); });
const combat = createCombat(scene, world, player, fx, audio, cui);
const boss = createBoss(scene, world, player, fx, audio, cui, quest);
function respawn() {
  stats.deaths++;
  player.pos.set(checkpoint.x, world.getHeight(checkpoint.x, checkpoint.z) + 0.3, checkpoint.z); player.vel.set(0, 0, 0); player.camTarget.copy(player.pos);
  player.hp = player.maxHp; player.stamina = player.maxStamina; player.exhausted = false; player.inv = 2; player.dead = 0;
  combat.reset(); boss.reset(); say('Você desperta junto à luz.');
}

// ---------- save (this browser only) ----------
const SAVE = 'ermo.save.v1';
function save() {
  try { localStorage.setItem(SAVE, JSON.stringify({ taken: quest.takenIdx(), x: player.pos.x, z: player.pos.z, time: sky.time, yaw: player.yaw })); } catch (e) {}
}
try {
  const d = JSON.parse(localStorage.getItem(SAVE) || 'null');
  if (d && isFinite(d.x) && isFinite(d.z)) {
    quest.restore(d.taken);
    player.pos.set(d.x, world.getHeight(d.x, d.z) + 0.5, d.z); player.camTarget.copy(player.pos);
    if (isFinite(d.time)) sky.time = d.time; if (isFinite(d.yaw)) player.yaw = d.yaw;
    $('reset').classList.remove('hidden');
  }
} catch (e) {}
$('reset').addEventListener('click', () => { try { localStorage.removeItem(SAVE); } catch (e) {} location.reload(); });
setInterval(() => { if (player.active) save(); }, 5000);
addEventListener('keydown', (e) => { if (e.code === 'KeyM') audio.toggleMute(); });
const start = $('start'), hud = $('hud'), clock = $('clock'), stam = $('stamina'), arc = $('stamina-arc'), hint = $('hint');
$('loading').textContent = '';
$('enter').addEventListener('click', () => {
  start.classList.add('out'); hud.classList.remove('hidden'); player.active = true; audio.init();
  const lock = canvas.requestPointerLock && canvas.requestPointerLock();
  if (lock && lock.catch) lock.catch(() => {});
  setTimeout(() => hint.classList.add('fade'), 14000);
});

// ---------- loop ----------
const timer = new THREE.Clock();
let elapsed = 0, uiT = 0, fpsAcc = 0, fpsN = 0, freeze = 0, flash = 0;
const prMax = Math.min(devicePixelRatio, 1.5); let pr = prMax;
function sim(dt) {
  const wasDead = player.dead > 0;
  elapsed += dt; player.update(dt, elapsed); quest.update(dt, elapsed); combat.update(dt, elapsed); boss.update(dt, elapsed);
  if (wasDead && player.dead <= 0) respawn();
  for (const ev of player.events) {
    const p = player.pos, wet = p.y < world.WATER + 0.25, dirt = world.trailDist(p.x, p.z) < 2.6, soil = dirt ? '#d9bf94' : '#b9dc8a';
    if (ev === 'step' || ev === 'stepRun') {
      audio.step(wet ? 'water' : dirt ? 'dirt' : 'grass', ev === 'stepRun');
      if (wet) fx.splash(p); else if (dirt) fx.dust(p, soil, ev === 'stepRun' ? 3 : 1, 1); else if (ev === 'stepRun') fx.dust(p, soil, 2, 0.8);
    } else if (ev === 'jump') { audio.jump(); fx.dust(p, soil, 4, 1.2); }
    else if (ev === 'land') { audio.land(); if (wet) fx.splash(p); else fx.ring(p, soil); player.shake = Math.max(player.shake, Math.min(0.22, player.landV * 0.012)); }
    else if (ev === 'bump') { audio.bump(); fx.leaves(player.hit.x, p.y + 6, player.hit.z, 16, 3.2, '#5faa62'); player.shake = Math.max(player.shake, 0.1); }
    else if (ev === 'rustle') { audio.rustle(); fx.leaves(player.hit.x, p.y + 1.1, player.hit.z, 5, 1.2, '#9fd66a'); }
    else if (ev === 'roll') { audio.roll(); fx.dust(p, soil, 6, 1.5); }
    else if (ev === 'swim') { audio.swim(); fx.splash(p); }
    else if (ev === 'grab') { audio.step('dirt', false); fx.dust({ x: p.x, y: p.y + 2.2, z: p.z }, '#d8cdb8', 1, 0.5); }
    else if (ev === 'mantle') { audio.land(); fx.dust(p, '#d8cdb8', 5, 1.2); }
    else if (ev === 'swing') audio.slash(player.atkN);
    else if (ev === 'hurt') { audio.hurt(); player.shake = Math.max(player.shake, 0.35); freeze = Math.max(freeze, 0.08); fx.hit(p.x, p.y + 1.5, p.z, '#ff5a4a'); }
    else if (ev === 'dead') audio.die();
  }
  player.events.length = 0;
  fx.update(dt);
}
function frame() {
  requestAnimationFrame(frame);
  const raw = timer.getDelta(), dt = Math.min(raw, 0.05);
  // adaptive resolution: drop the pixel ratio when the frame rate sags, raise it back when there is room
  if (player.active && !document.hidden) {
    fpsAcc += raw; fpsN++;
    if (fpsAcc >= 2) {
      const avg = fpsAcc / fpsN, was = pr;
      if (avg > 1 / 38 && pr > 0.6) pr = Math.max(0.6, pr - 0.15); else if (avg < 1 / 57 && pr < prMax) pr = Math.min(prMax, pr + 0.1);
      if (pr !== was) { renderer.setPixelRatio(pr); resize(); }
      fpsAcc = fpsN = 0;
    }
  }
  if (!player.active) player.yaw += dt * 0.05;                       // slow orbit behind the title
  // hit-stop: a few frames of near-freeze when an ember lands
  if (freeze > 0) { freeze -= raw; sim(dt * 0.06); } else sim(dt);
  flash *= Math.exp(-5 * dt);
  if (world.pollLit()) {                                           // a lit lantern is a place to come back to
    audio.lamp();
    let bi = -1, bd = 1e9; world.lampSpots.forEach((l, i) => { const d = Math.hypot(l[0] - player.pos.x, l[1] - player.pos.z); if (d < bd) { bd = d; bi = i; } });
    if (bi >= 0 && player.active) {
      const l = world.lampSpots[bi], td = world.trailDist(l[0], l[1]);
      checkpoint.x = l[0] - Math.sin(l[2] + Math.PI / 2) * 0; checkpoint.z = l[1]; checkpoint.x = l[0] + (player.pos.x - l[0]) * 0.4; checkpoint.z = l[1] + (player.pos.z - l[1]) * 0.4;
      if (player.hp < player.maxHp) { player.hp = player.maxHp; audio.heal(); }
      if (!checkpoint.lamps.size) say('Lanterna acesa. Aqui você renasce.');
      checkpoint.lamps.add(bi);
    }
  }
  sky.update(dt, player.pos, camera.position, elapsed, player.keys.KeyT ? 60 : 1);
  shared.uTime.value = elapsed; shared.uCloud.value = sky.dayF;
  shared.uFocus.value[0] = player.pos.x; shared.uFocus.value[1] = player.pos.y + 1.6; shared.uFocus.value[2] = player.pos.z;
  audio.update(dt, Math.hypot(player.vel.x, player.vel.z), sky.night, elapsed);
  world.update(elapsed, sky.night, player.pos, dt);
  grass.update(player.pos);
  bloom.strength = 0.3 + sky.night * 0.35 + flash * 0.5;
  grade.uniforms.uHurt.value = Math.max(player.hurtT / 0.4, player.hp <= 20 && player.dead <= 0 ? 0.3 + Math.sin(elapsed * 5) * 0.12 : 0);
  fadeEl.style.opacity = player.dead > 0 ? Math.min(1, Math.max(0, (1.9 - player.dead) / 1.3)).toFixed(2) : Math.max(0, +fadeEl.style.opacity - dt * 1.5).toFixed(2);
  grade.uniforms.uFlash.value = flash; grade.uniforms.uTime.value = elapsed; grade.uniforms.uWarm.value = sky.dayF * (1 - sky.night);
  composer.render();

  uiT -= dt;
  if (uiT <= 0) {
    uiT = 0.1;
    clock.textContent = sky.clock();
    arc.style.strokeDashoffset = (150.8 * (1 - player.stamina / player.maxStamina)).toFixed(1);
    stam.classList.toggle('show', player.stamina < player.maxStamina - 0.5);
    stam.classList.toggle('low', player.exhausted);
    const pips = Math.ceil(player.hp / 20);
    for (let i = 0; i < 5; i++) hpEl.children[i].className = i < pips ? 'on' : '';
  }
}
frame();

// console helpers: ERMO.time(0.8) for dusk, ERMO.go(x, z) to teleport
window.ERMO = {
  player, sky, world, renderer, scene, quest, combat, boss, stats, checkpoint,
  step(n, dt) { for (let i = 0; i < n; i++) sim(dt || 1 / 60); },
  time(t) { sky.time = t; },
  go(x, z) { player.pos.set(x, world.getHeight(x, z) + 1, z); player.vel.set(0, 0, 0); player.camTarget.copy(player.pos); },
  enter() { $('enter').click(); }
};
