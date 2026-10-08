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
    reward: "Food forest · fruit gathering",
    building: "grove",
    after:
      "Our first roots are down. Follow Roots for Tomorrow to grow our food forest.",
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
        "Place a free cistern blueprint, then check Projects. Buy its pump in Town; neighbours carry river water while it is being built. You can plan homes, a garden and a kitchen while supplies arrive.",
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
        "Build a garden and ask Iara to tend it. Plant first, water for two water, then allow three game hours of moist growth before harvesting.",
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
        "Build a second home. Check Projects for materials and order missing equipment in Town.",
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
        "Ask a neighbour to forage food. With a finished food forest, each trip also brings two fruit.",
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
    reward: "Workshop + greenhouse · tools & seedlings",
    building: "workshop",
    after:
      "Build a workshop and a greenhouse. Eight free timber crafts twelve tool uses for 25% faster construction; moist greenhouse beds raise seedlings.",
    objectives: (v) => [
      goal(
        "Receive a town delivery",
        +v.economy.orders.some(o=>o.status==='delivered'),
        1,
        "Combine project purchases in Town and let the supplies arrive.",
      ),
      {
        ...goal(
          "Support a shared tool library",
          +v.progress.tool_library,
          1,
          "Contribute R$ 120 from our shared fund once. Outside shifts and surplus sales can replenish it.",
        ),
        action: "tool_library",
      },
      goal(
        "Finish a shared construction",
        v.progress.shared_builds,
        1,
        "Ask two neighbours to help with the same unfinished building. Both must contribute before it is complete.",
      ),
    ],
  },
  {
    title: "Growing Resilience", person: "Bento & Iara", theme: "CRAFT & CULTIVATE",
    art: "greenhouse", building: "coop", reward: "Chicken coop · caring for hens & fresh eggs",
    story: "“Good tools, living soil, and seedlings under glass. Let's make our harvests more dependable.”",
    after: "A resilient garden makes room for a fuller table. Build a chicken coop and keep food aside for the hens.",
    objectives: v => [
      goal("Build a workshop", count(v,"workshop"),1,"Finish a workshop in Projects, then let Bento make tools.","workshop"),
      goal("Craft a set of tools",v.progress.tools_crafted,1,"Keep eight free timber at the workshop. Ask Bento to craft during normal work hours.","workshop"),
      goal("Build a compost station",count(v,"compost"),1,"Kitchen scraps become compost for our gardens.","compost"),
      goal("Bring in an enriched harvest",v.progress.enriched_harvests,1,"Make compost from kitchen scraps. The next garden harvest uses it automatically.","garden"),
      goal("Build a greenhouse",count(v,"greenhouse"),1,"Order the covering and finish a greenhouse. Its protected beds raise seedlings.","greenhouse"),
    ],
  },
  {
    title: "A Fuller Table", person: "Nina", theme: "CARE & ABUNDANCE",
    art: "coop", building: "solar_farm", reward: "Solar farm + street lights · shared power",
    story: "“A few hens, a little care, and fresh eggs for everyone. We can grow without rushing.”",
    after: "Our table is more varied. Now collect sunshine to keep our shared buildings and paths lit after dusk.",
    objectives: v => [
      goal("Build a chicken coop",count(v,"coop"),1,"Finish a coop and keep at least nine ingredients in the pantry.","coop"),
      {...goal("Collect our first three eggs",v.progress.eggs_collected||0,3,"Enable hen feeding in Supplies. Three ingredients feed a batch; eggs arrive after twelve daylight hours.","coop"),buildTarget:1},
    ],
  },
  {
    title: "Sunshine to Share", person: "Our founding five", theme: "ENERGY & INDEPENDENCE",
    art: "solar_farm", building: "solar_farm", reward: "A flourishing village · keep growing at your own pace",
    story: "“The sun gives us more than warm mornings. Let's save a little of it for the evening.”",
    after: "All seven chapters are complete. Every building is unlocked. Keep tending Vila Aurora, with the same resources and rhythms you've learned.",
    objectives: v => [
      goal("Build a solar farm",count(v,"solar_farm"),1,"Order panels, batteries and electrical equipment in Town, then complete the solar farm.","solar_farm"),
      goal("Light a village path",count(v,"streetlight"),1,"Place a street light beside a road. It draws from our shared battery after dusk.","streetlight"),
      goal("Store twelve energy",Math.floor(v.power.stored),12,"Let the farm charge in daylight. Open Power to watch generation, charge and demand.",null),
    ],
  },

];
export const unlockQuest = { grove:0, compost:1, square:2, workshop:3, greenhouse:3, coop:4, solar_farm:5, streetlight:5 };
export const questCompleted = (v,id) => id<4 ? v.progress.completed[id] : (v.progress.later_completed||[false,false,false])[id-4];
export const questAvailable = (v,id) => id===0 || questCompleted(v,id-1);
export const completedQuests = v => quests.map((_,i)=>questCompleted(v,i));
export function buildingUnlocked(v,kind) {
  return v.mode==='sandbox' || unlockQuest[kind]===undefined || questCompleted(v,unlockQuest[kind]);
}
export function questStatus(v,id) {
  return questCompleted(v,id) ? "Complete" : questAvailable(v,id) ? "Available" : `After ${quests[id-1].title}`;
}

// Goals always provide a next step through planning, construction and use.
export function goalRoute(state, objective) {
  if(objective?.action)return {type:objective.action};
  if(!objective?.build)return null;
  const kind=objective.build, buildings=state.village.buildings.filter(b=>b.kind===kind);
  const project=state.environment.economy.projects.find(p=>p.kind===kind&&!p.paused)||state.environment.economy.projects.find(p=>p.kind===kind);
  if(project)return {type:'project',id:project.building,project};
  if(buildings.filter(b=>b.progress>=100).length>=(objective.buildTarget??objective.target))return {type:'visit',id:buildings.find(b=>b.progress>=100).id};
  return {type:'plan',kind};
}
