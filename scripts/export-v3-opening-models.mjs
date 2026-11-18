// Regenerate the standalone desktop game's opening models from the V2 artwork.
import { AnimationClip, QuaternionKeyframeTrack, VectorKeyframeTrack } from "three";
import { exportModels } from "./v3-model-export.mjs";
import { createTent } from "../web/v02/library/camping.js";
import { createJimny } from "../web/v02/library/vehicles.js";
import { createResident, poseResident, RESIDENT_IDS } from "../web/v02/residents/rig.js";

const models = [
  ...RESIDENT_IDS.filter((id) => id !== "resident").map((id) => [id, createResident(id)]),
  ...[0, 1].flatMap((variant) => [
    [`tent-${variant}`, createTent(variant)],
    [`car-${variant}`, createJimny(variant)],
  ]),
];
const cycle = [
  ["idle", Math.PI],
  ["walk", Math.PI / 4],
  ["carry-walk", Math.PI / 4],
  ["work", Math.PI * 2 / 3],
  ["wash", Math.PI * 2 / 3],
  ["eat", Math.PI * 2 / 2.6],
  ["chat", Math.PI * 2 / 1.5],
  ["stretch", Math.PI * 2 / 0.9],
  ["chop", 1.4],
  ["rest", Math.PI],
];

function bakeResident(name, root) {
  const { rig } = root;
  const clips = cycle.map(([action, duration]) => {
    const frames = Math.ceil(duration * 24);
    const times = [];
    const joints = rig.joints.map((joint) => ({joint, positions: [], rotations: []}));
    for (let frame = 0; frame <= frames; frame++) {
      const time = frame * duration / frames;
      poseResident(rig, action, frame === frames ? 0 : time);
      times.push(time);
      for (const { joint, positions, rotations } of joints) {
        positions.push(...joint.position.toArray());
        rotations.push(...joint.quaternion.toArray());
      }
    }
    return new AnimationClip(`${name}-${action}`, duration, joints.flatMap(({joint, positions, rotations}) => [
      new VectorKeyframeTrack(`${joint.uuid}.position`, times, positions),
      new QuaternionKeyframeTrack(`${joint.uuid}.quaternion`, times, rotations),
    ])).optimize();
  });
  poseResident(rig, "idle", 0);
  return clips;
}

const animations = models.map(([name, model]) => model.rig ? bakeResident(name, model) : []);
await exportModels(models, new URL("../bevy-v3/src/opening.glb", import.meta.url), animations);
