// Opening goals are outcomes, not a prescribed construction sequence.
export const OPENING_PROJECTS = {
  "rain-tent": {
    name: "Shared rain tent",
    asset: "canvas-tent-ochre",
    size: [2, 2],
    materials: { wood: 4, tarp: 1, hardware: 1 },
    work: 110,
    kind: "rain-shelter",
    category: "First camp",
    description:
      "A quick dry place to take turns resting. Uses our only spare tarp; leaves the roof sheets for storage. Temporary: it provides cover, not extra beds.",
  },
  "covered-stores": {
    name: "Covered supply rack",
    asset: "covered-supply-rack",
    size: [2, 1],
    materials: { wood: 12, roofing: 6, hardware: 2 },
    work: 230,
    kind: "covered-storage",
    category: "First camp",
    description:
      "A raised, roofed rack keeps our supplies dry and adds storage. Uses the same six roof sheets as the permanent shelter.",
  },
  "tarp-stores": {
    name: "Tarp-covered supplies",
    asset: "tarp-covered-supplies",
    size: [1, 1],
    materials: { wood: 4, tarp: 1 },
    work: 85,
    kind: "camp-storage",
    category: "First camp",
    description:
      "Raise the crates and tie down our spare tarp. Fast and inexpensive, but the tarp cannot also cover a shared rain tent. No extra storage capacity.",
  },
};
export function openingProgress(s, projects) {
  const complete = (predicate) =>
    s.projects.some(
      (p) => p.work >= projects[p.key].work && predicate(projects[p.key], p),
    );
  const gathering = complete(
    (d, p) =>
      p.key === "gathering" ||
      d.kind === "square" ||
      d.kind === "community-hall",
  );
  const shelter = complete(
    (d) =>
      ["shed", "rain-shelter"].includes(d.kind) ||
      d.kind === "home" ||
      ["reading-room", "community-hall", "outdoor-classroom"].includes(d.kind),
  );
  const supplies = complete(
    (d, p) =>
      ["warehouse", "covered-storage"].includes(d.kind) ||
      p.key === "tarp-stores",
  );
  return {
    gathering,
    shelter,
    supplies,
    count: Number(gathering) + Number(shelter) + Number(supplies),
    ready:
      gathering &&
      shelter &&
      supplies &&
      !s.trip &&
      (!s.rainSeen || s.rainResolved),
  };
}
export function openingRecap(s, projects) {
  const complete = (id) =>
    s.projects.some((p) => p.key === id && p.work >= projects[id].work);
  const protection = complete("rain-tent")
    ? "You kept the first shelter light and temporary."
    : "You invested in a lasting roof.";
  const storage = complete("tarp-stores")
    ? "The spare tarp kept the supplies safe."
    : "Your raised storage will serve future projects.";
  return `${protection} ${storage} ${s.opening?.townTrips || 0} town trips, R$${s.money.toFixed(2)} still shared. There is more to build, but tonight everyone has a place here.`;
}
