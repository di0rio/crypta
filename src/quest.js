import * as THREE from 'three';

// Embers: small lights resting at ruins and along the trail. Gathering them is the first goal of the game;
// each one also widens the wanderer's breath (max stamina).

export function createQuest(scene, world, player, ui) {
  const geo = new THREE.OctahedronGeometry(0.5, 0);
  const halo = new THREE.SphereGeometry(0.95, 12, 8);
  const embers = world.emberSpots.map(([x, y, z], i) => {
    const g = new THREE.Group();
    const core = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#fff1c4', emissive: '#ffb23d', emissiveIntensity: 4 }));
    const glow = new THREE.Mesh(halo, new THREE.MeshBasicMaterial({ color: '#ffb23d', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(core, glow); g.position.set(x, y, z); scene.add(g);
    return { g, core, glow, x, y, z, phase: i * 1.7, taken: false, t: 0 };
  });
  let count = 0;
  ui.set(count, embers.length);

  return {
    get count() { return count; }, total: embers.length, embers,
    update(dt, elapsed) {
      const p = player.pos;
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
        e.g.position.y = e.y + Math.sin(elapsed * 1.8 + e.phase) * 0.22;
        e.glow.scale.setScalar(1 + Math.sin(elapsed * 3 + e.phase) * 0.12);
        const dx = p.x - e.x, dz = p.z - e.z, dy = p.y + 1.3 - e.y;
        if (dx * dx + dz * dz < 3.6 * 3.6 && Math.abs(dy) < 4) {
          e.taken = true; count++;
          player.maxStamina += 6; player.stamina = player.maxStamina;
          ui.set(count, embers.length, true);
          if (count === embers.length) { world.wake(); ui.say('A Torre desperta.'); }
          else if (count === 1) ui.say('Uma brasa. Seu fôlego cresce.');
        }
      }
    }
  };
}
