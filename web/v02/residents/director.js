import { poseResident } from "./rig.js";
import {
  INTERACTIONS,
  interactionSlots,
  navigation,
  findRoute,
} from "./interactions.js";
export class ResidentDirector {
  constructor(actors, records, status = () => {}) {
    this.actors = actors;
    this.records = records;
    this.status = status;
    this.time = 0;
    this.task = null;
    this.homes = new Map(
      actors.map((a) => [
        a,
        { position: a.position.clone(), rotation: a.rotation.y },
      ]),
    );
  }
  stop() {
    for (const a of this.actors) {
      const home = this.homes.get(a);
      a.position.copy(home.position);
      a.rotation.y = home.rotation;
      poseResident(a.rig, "idle", 0);
    }
    this.task = null;
    this.status("Choose a prop and resident to rehearse an interaction.");
  }
  start(actorId, target, action, nearby = false) {
    const actor = this.actors.find((a) => a.userData.placement.id === actorId);
    if (!actor || !INTERACTIONS[target.asset]?.some(([id]) => id === action))
      throw Error("Choose a resident and a supported interaction.");
    this.stop();
    const others = this.actors
        .filter((a) => a !== actor)
        .map((a) => [a.position.x, a.position.z]),
      nav = navigation(this.records, others);
    const finalNav = navigation(
      this.records.filter((r) => r.id !== target.id),
      others,
    );
    const candidates = [];
    for (const slot of interactionSlots(target, this.records)) {
      const dx = slot.approach[0] - slot.at[0],
        dz = slot.approach[1] - slot.at[1],
        len = Math.hypot(dx, dz);
      const start = nearby
        ? [slot.approach[0] + dx / len, slot.approach[1] + dz / len]
        : [actor.position.x, actor.position.z];
      const route = findRoute(start, slot.approach, nav);
      if (!route) continue;
      let clear = true;
      for (let i = 0; i <= 20; i++) {
        const t = i / 20,
          x = slot.approach[0] * (1 - t) + slot.at[0] * t,
          z = slot.approach[1] * (1 - t) + slot.at[1] * t;
        const cx = Math.floor(x + 64),
          cz = Math.floor(z + 64);
        if (
          cx < 0 ||
          cz < 0 ||
          cx >= 128 ||
          cz >= 128 ||
          finalNav.blocked.has(finalNav.key(cx, cz))
        )
          clear = false;
      }
      if (clear) candidates.push({ slot, start, route });
    }
    candidates.sort((a, b) => a.route.length - b.route.length);
    if (!candidates.length)
      throw Error(
        "No clear approach. Leave room beside the prop or choose an outer garden section.",
      );
    const best = candidates[0];
    actor.position.set(best.start[0], 0, best.start[1]);
    this.task = {
      actor,
      target,
      action,
      ...best,
      path: best.route.map((p) => [...p]),
      phase: "walk",
      elapsed: 0,
    };
    this.status(`Walking to ${target.label || target.asset}…`);
  }
  tick(dt) {
    this.time += dt;
    const task = this.task;
    for (let i = 0; i < this.actors.length; i++)
      if (this.actors[i] !== task?.actor)
        poseResident(this.actors[i].rig, "idle", this.time + i, 0.15);
    if (!task) return;
    const a = task.actor;
    task.elapsed += dt;
    if (task.phase === "walk" || task.phase === "return") {
      let distance = dt * 1.25;
      while (distance > 0 && task.path.length) {
        const [x, z] = task.path[0],
          dx = x - a.position.x,
          dz = z - a.position.z,
          len = Math.hypot(dx, dz);
        if (len < 0.001) {
          task.path.shift();
          continue;
        }
        const step = Math.min(distance, len);
        a.position.x += (dx / len) * step;
        a.position.z += (dz / len) * step;
        const desired = Math.atan2(dx, dz),
          delta = Math.atan2(
            Math.sin(desired - a.rotation.y),
            Math.cos(desired - a.rotation.y),
          );
        a.rotation.y += delta * Math.min(1, dt * 12);
        distance -= step;
        if (step === len) task.path.shift();
      }
      poseResident(
        a.rig,
        task.phase === "return" ? "carry-walk" : "walk",
        this.time,
        Math.min(1, dt * 12),
      );
      if (!task.path.length) {
        if (task.phase === "return") {
          task.phase = "holding";
          this.status("Holding the sample crate · Stop restores the scene.");
        } else {
          task.phase = "enter";
          task.entry = [a.position.x, a.position.z];
          task.elapsed = 0;
        }
      }
    } else if (task.phase === "enter") {
      const t = Math.min(1, task.elapsed / 0.8),
        smooth = t * t * (3 - 2 * t);
      a.position.x = task.entry[0] * (1 - smooth) + task.slot.at[0] * smooth;
      a.position.z = task.entry[1] * (1 - smooth) + task.slot.at[1] * smooth;
      const delta = Math.atan2(
        Math.sin(task.slot.yaw - a.rotation.y),
        Math.cos(task.slot.yaw - a.rotation.y),
      );
      a.rotation.y += delta * Math.min(1, dt * 10);
      poseResident(a.rig, task.action, this.time, Math.min(1, dt * 8));
      if (t === 1) {
        a.rotation.y = task.slot.yaw;
        task.phase = "action";
        task.elapsed = 0;
        this.status(
          INTERACTIONS[task.target.asset].find(
            ([id]) => id === task.action,
          )[1] + " · preview running",
        );
      }
    } else {
      poseResident(a.rig, task.action, this.time, Math.min(1, dt * 10));
      if (
        task.action === "carry" &&
        task.phase === "action" &&
        task.elapsed > 1.2
      ) {
        task.phase = "return";
        task.path = [
          task.slot.approach,
          ...task.route.slice(0, -1).reverse(),
          task.start,
        ];
        this.status("Carrying the sample crate back…");
      }
    }
  }
}
