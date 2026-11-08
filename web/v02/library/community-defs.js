// Shared footprint, construction and activity definitions; safe in the pure simulation.
export const COMMUNITY = {
  "reading-room": {
    name: "Village reading room",
    size: [2, 2],
    category: "Learning",
    materials: { wood: 12, walls: 16, tiles: 18, hardware: 3, tools: 2 },
    activity: "Reading and sharing stories",
    sheltered: true,
    recovery: 0.045,
    description:
      "A quiet book room with shaded reading benches. Residents visit to unwind and share stories.",
  },
  "outdoor-classroom": {
    name: "Outdoor classroom",
    size: [3, 2],
    category: "Learning",
    materials: { wood: 20, frames: 6, tiles: 24, hardware: 4 },
    activity: "Sharing practical knowledge",
    sheltered: true,
    recovery: 0.035,
    description:
      "A roofed learning space with a chalkboard and work tables. Friends exchange practical knowledge during free time.",
  },
  "community-hall": {
    name: "Community hall",
    size: [3, 2],
    category: "Community",
    materials: { wood: 20, walls: 24, frames: 8, tiles: 30, hardware: 6 },
    activity: "Gathering with neighbors",
    sheltered: true,
    recovery: 0.04,
    description:
      "An open-front hall for conversation and village gatherings, with a long table and noticeboard.",
  },
  "exercise-garden": {
    name: "Exercise garden",
    size: [2, 2],
    category: "Recreation",
    materials: { wood: 12, hardware: 4, stone: 6 },
    activity: "Stretching in the exercise garden",
    sheltered: false,
    recovery: 0.035,
    description:
      "Timber parallel bars, stepping logs and a stretching deck. A gentle outdoor break between projects.",
  },
  "volleyball-court": {
    name: "Volleyball court",
    size: [4, 3],
    category: "Recreation",
    materials: { earth: 24, wood: 4, tarp: 2, hardware: 4 },
    activity: "Taking a break at the court",
    sheltered: false,
    recovery: 0.03,
    description:
      "A sand court with a net and spectator benches. A recreation destination; organized matches are not simulated yet.",
  },
};
