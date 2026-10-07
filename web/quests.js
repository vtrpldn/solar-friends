// Text and objective views; Rust owns permanent completion and unlocks.
const count = (v, kind) =>
  v.buildings.filter((b) => b.kind === kind && b.progress >= 100).length;
const goal = (label, value, target, hint, build = null) => ({
  label,
  value: Math.min(value, target),
  target,
  done: value >= target,
  hint,
  build,
});
export const quests = [
  {
    title: "A Shared Beginning",
    person: "Our founding five",
    theme: "ARRIVAL",
    art: "grove",
    story:
      "Five neighbours. A patch of Brazilian earth. Let's make a place where everyone belongs.",
    reward: "Food forest + three new quest paths",
    building: "grove",
    after:
      "Our first roots are down. Open the journal and choose what we grow next.",
    objectives: (v) => [
      goal(
        "Welcome all five neighbours",
        +v.arrived,
        1,
        "Let everyone reach the clearing.",
      ),
      goal(
        "Build a cistern",
        count(v, "well"),
        1,
        "Water comes first. Plan a cistern and neighbours will build it during working hours.",
        "well",
      ),
      goal(
        "Build the first home",
        count(v, "home"),
        1,
        "Each home gives three neighbours a bed.",
        "home",
      ),
      goal(
        "Bring in our first harvest",
        v.harvests,
        1,
        "Build a garden, then ask Iara to tend it. Every harvest needs two water.",
        "garden",
      ),
      goal(
        "Serve a cooked meal",
        count(v, "kitchen") ? v.meals_served : 0,
        1,
        "Build a kitchen. Three food and one water make five meals; neighbours eat at mealtimes.",
        "kitchen",
      ),
      goal(
        "Give everyone a bed",
        count(v, "home"),
        2,
        "Build a second home. Gather timber if supplies run low.",
        "home",
      ),
      goal(
        "Welcome the next morning",
        v.mornings,
        1,
        "Let the village rest overnight. Morning begins at 06:00.",
      ),
    ],
  },
  {
    title: "Roots for Tomorrow",
    person: "Iara",
    theme: "GROW & NOURISH",
    art: "compost",
    story:
      "“A food forest feeds us today. Returning our scraps to the soil will feed us tomorrow.”",
    reward: "Compost station · richer harvests",
    building: "compost",
    after:
      "Build a compost station. Two kitchen scraps become one compost; gardens use it automatically for three extra food per harvest.",
    objectives: (v) => [
      goal(
        "Plant a food forest",
        count(v, "grove"),
        1,
        "Plan a food forest in a clearing. Its fruit supplements our food supply.",
        "grove",
      ),
      goal(
        "Gather fruit",
        v.progress.fruit,
        6,
        "Ask a neighbour to gather timber. With a finished food forest, each trip also brings two fruit.",
      ),
    ],
  },
  {
    title: "A Place to Gather",
    person: "Luz",
    theme: "CARE & CONNECTION",
    art: "square",
    story: "“We share the work. Let's make time to share our stories, too.”",
    reward: "Community square · gatherings & friendships",
    building: "square",
    after:
      "Build a community square. Host a gathering with five prepared meals; neighbours who attend grow closer. Once a day, between 08:00 and 18:00.",
    objectives: (v) => [
      goal(
        "Serve five cooked meals",
        v.meals_served,
        5,
        "Keep meals ready in the kitchen. Earlier meals already count.",
      ),
      goal(
        "Make time for every neighbour",
        v.progress.social_mask.toString(2).replaceAll("0", "").length,
        5,
        "Ask each neighbour to spend time together, or let them socialize in the evening. Finish one social break each.",
      ),
      {
        ...goal(
          "Host a welcome supper",
          +v.progress.welcome_supper,
          1,
          "Set aside five prepared meals, then invite at least three rested, fed neighbours to the kitchen. Start between 08:00 and 18:00.",
        ),
        action: "supper",
      },
    ],
  },
  {
    title: "Made by Our Hands",
    person: "Bento",
    theme: "MAKE & BUILD",
    art: "workshop",
    story:
      "“Many hands made these homes. With a few good tools, imagine what we could make next.”",
    reward: "Workshop · craft & conserve tools",
    building: "workshop",
    after:
      "Build a workshop. Eight timber crafts twelve tool uses: +2 timber or food per job, or 25% faster construction. Pause tool use to save materials.",
    objectives: (v) => [
      goal(
        "Gather timber together",
        v.progress.timber,
        40,
        "Ask neighbours to gather timber. Materials already gathered count, even after being spent.",
      ),
      {
        ...goal(
          "Set aside timber for a tool library",
          +v.progress.workshop_timber,
          1,
          "Contribute 24 timber to our tool library. This is spent once, separately from building the workshop.",
        ),
        action: "timber",
      },
      goal(
        "Finish a shared construction",
        v.progress.shared_builds,
        1,
        "Ask two neighbours to help with the same unfinished building. Both must contribute before it is complete.",
      ),
    ],
  },
];
export function buildingUnlocked(v, kind) {
  const quest = { grove: 0, compost: 1, square: 2, workshop: 3 }[kind];
  return quest === undefined || v.progress.completed[quest];
}
export function questStatus(v, id) {
  return v.progress.completed[id]
    ? "Complete"
    : id > 0 && !v.progress.completed[0]
      ? "After our arrival"
      : "Available";
}
