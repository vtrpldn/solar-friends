import { createResident, animateResident } from '../residents/rig.js';
import { communityVisitors } from './village-life.js';

// Neighbours and course participants at a running event. They are drawn where
// the event is and never saved: the simulation only keeps how many came.
const SHIRTS = ['#c98f5a', '#6f8f7a', '#b9665a', '#8a7fa8', '#d1b565', '#5f86a0'];
const SKIN = ['#8d573a', '#bb8055', '#a66a45', '#c08a62', '#7b4a31', '#b77b4e'];
export function createVisitors(scene, { world, finish = model => model }) {
  const pool = new Map();
  const make = look => {
    const root = createResident('resident');
    root.traverse(o => {
      if (!o.isMesh) return;
      const hex = o.material.color.getHexString(), color = hex === 'd3ad58' ? SHIRTS[look] : hex === 'b87950' ? SKIN[look] : null;
      if (color) { o.material = o.material.clone(); o.material.color.set(color); }
    });
    finish(root);
    scene.add(root);
    return root;
  };
  return {
    count: () => pool.size,
    update(s, time, dt) {
      const visitors = communityVisitors(s), seen = new Set();
      for (const v of visitors) {
        seen.add(v.key);
        let g = pool.get(v.key);
        if (!g) pool.set(v.key, g = make(v.look));
        g.position.copy(world(v.x, v.z));
        const to = world(v.facing.x, v.facing.z);
        g.rotation.y = Math.atan2(to.x - g.position.x, to.z - g.position.z);
        animateResident(g.rig, v.pose, time + v.look * 1.3, dt);
      }
      for (const [key, g] of pool) if (!seen.has(key)) {
        scene.remove(g);
        g.traverse(o => { if (o.isMesh && o.material.userData?.visitor) o.material.dispose(); });
        pool.delete(key);
      }
    },
  };
}
