import { MAP_HALF } from "./map-size.js";
import { roadCenter } from "./road-layout.js";
import { vehiclePose, ARRIVAL_DURATION } from "./arrival.js";
export const TRIP_DURATION = 55;
export const DRIVE_DURATION = 18;
export function carDoor(index) {
  const parked = vehiclePose(ARRIVAL_DURATION, index);
  return { x: index ? 34.75 : 30.25, z: (parked.z + 0.3) / 2 + 32 };
}
export function townCarPose(trip, index) {
  const parked = vehiclePose(ARRIVAL_DURATION, index);
  if (
    !trip ||
    trip.vehicle !== index ||
    ["boarding", "unloading"].includes(trip.phase)
  )
    return { ...parked, visible: true };
  if (trip.phase === "away") return { ...parked, visible: false };
  const outgoing = trip.phase === "outbound";
  const elapsed = outgoing
    ? TRIP_DURATION - trip.left
    : DRIVE_DURATION - trip.left;
  const t = Math.max(0, Math.min(1, elapsed / DRIVE_DURATION));
  const smooth = t * t * (3 - 2 * t);
  const fraction = outgoing ? smooth : 1 - smooth;
  const z = parked.z + (-MAP_HALF - 8 - parked.z) * fraction;
  const x = roadCenter(z) + (parked.x - roadCenter(parked.z)) * (1 - fraction);
  const ahead = z + (outgoing ? -0.1 : 0.1);
  const tangent = Math.atan2(roadCenter(ahead) - roadCenter(z), ahead - z);
  // Turn out of the parking space before heading towards the road exit.
  const turn = outgoing ? Math.min(1, t * 10) : 1;
  return { x, z, yaw: tangent * turn, visible: true };
}
