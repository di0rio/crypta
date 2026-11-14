import * as THREE from 'three';

// Embers: small lights resting at ruins and along the trail. Gathering them is the first goal of the game;
// each one also widens the wanderer's breath (max stamina). A faint beam marks each one from afar and a
// small arrow on the ground points to the nearest.

export function createQuest(scene, world, player, ui, onPick) {
  const geo = new THREE.OctahedronGeometry(0.5, 0);
  const halo = new THREE.SphereGeometry(0.95, 12, 8);
  const beamGeo = new THREE.CylinderGeometry(0.2, 0.32, 70, 8, 1, true).translate(0, 35, 0);
  const embers = world.emberSpots.map(([x, y, z], i) => {
    const g = new THREE.Group();
    const core = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#fff1c4', emissive: '#ffb23d', emissiveIntensity: 4 }));
    const glow = new THREE.Mesh(halo, new THREE.MeshBasicMaterial({ color: '#ffb23d', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: '#ffcf7a', transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    g.add(core, glow); g.position.set(x, y, z); beam.position.set(x, y, z); scene.add(g, beam);
    return { g, core, glow, beam, x, y, z, i, phase: i * 1.7, taken: false, t: 0, pull: 0 };
  });
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.1, 3).rotateX(Math.PI / 2).scale(1, 0.25, 1),
    new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.8, depthWrite: false }));
  scene.add(arrow);
  let count = 0;
  ui.set(count, embers.length);

  function take(e, silent) {
    e.taken = true; count++; e.beam.visible = false;
    player.maxStamina += 6; player.stamina = player.maxStamina;
    if (silent) e.g.visible = false;
    ui.set(count, embers.length, !silent);
    if (count === embers.length) world.wake();
  }

  return {
    get count() { return count; }, total: embers.length, embers,
    takenIdx() { return embers.filter((e) => e.taken).map((e) => e.i); },
    takeRemote(i) { const e = embers[i]; if (e && !e.taken) { take(e, false); e.beam.visible = false; } },
    restore(list) { (list || []).forEach((i) => { if (embers[i] && !embers[i].taken) take(embers[i], true); }); },
    update(dt, elapsed) {
      const p = player.pos;
      let near = null, nd = 1e9;
      for (const e of embers) {
        if (e.taken) {
          if (!e.g.visible) continue;
          e.t += dt * 2.2;                                     // burst: swell, rise, fade
          const k = Math.min(e.t, 1);
          e.g.scale.setScalar(1 + k * 2.4); e.g.position.y = e.y + k * 1.6;
          e.core.material.emissiveIntensity = 4 * (1 - k); e.glow.material.opacity = 0.3 * (1 - k);
          if (k >= 1) e.g.visible = false;
          continue;
        }
        e.g.rotation.y = elapsed * 1.3 + e.phase;
        e.g.position.set(e.x, e.y + Math.sin(elapsed * 1.8 + e.phase) * 0.22 * (1 - Math.min(1, e.pull)), e.z);
        e.glow.scale.setScalar(1 + Math.sin(elapsed * 3 + e.phase) * 0.12);
        e.beam.material.opacity = 0.055 + Math.sin(elapsed * 1.1 + e.phase) * 0.02;
        const dx = p.x - e.x, dz = p.z - e.z, dy = p.y + 1.3 - e.y, d2 = dx * dx + dz * dz;
        if (d2 < nd) { nd = d2; near = e; }
        // once the wanderer is close the ember lets go and flies to them, faster and faster
        if (e.pull > 0 || (d2 < 6.5 * 6.5 && Math.abs(dy) < 6)) {
          e.pull += dt * 2.4; e.beam.visible = false;
          const k = Math.min(1, dt * (2 + e.pull * 9));
          e.x += (p.x - e.x) * k; e.z += (p.z - e.z) * k; e.y += (p.y + 1.7 - e.y) * k;
          e.g.scale.setScalar(1 - Math.min(0.5, e.pull * 0.25));
        }
        if (d2 < 1.3 * 1.3 && Math.abs(dy - 0.4) < 2.2) {
          take(e, false);
          if (count === embers.length) ui.say('A Torre desperta.');
          else if (count === 1) ui.say('Uma brasa. Seu fôlego cresce.');
          if (onPick) onPick(e, count, count === embers.length);
        }
      }
      // guide arrow on the ground, toward the nearest ember still out there
      const d = Math.sqrt(nd);
      arrow.visible = !!near && !near.taken && d > 9 && player.active;
      if (arrow.visible) {
        const dx = (near.x - p.x) / d, dz = (near.z - p.z) / d, r = 2.6 + Math.sin(elapsed * 3) * 0.25;
        const ax = p.x + dx * r, az = p.z + dz * r;
        arrow.position.set(ax, Math.max(world.getHeight(ax, az), world.WATER) + 0.35, az);
        arrow.rotation.y = Math.atan2(dx, dz);
        arrow.material.opacity = 0.45 + Math.sin(elapsed * 3) * 0.2;
      }
    }
  };
}
