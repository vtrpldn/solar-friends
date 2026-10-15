// Text and objective views; Rust owns permanent completion and unlocks.
export const storyBuildingKinds = ["home","garden","well","kitchen","grove","warehouse","compost","square","workshop","greenhouse","coop","solar_farm","streetlight","eco_toilet","wetland","banana_treatment","biodigester","hydro"];
const actionGoal = (action, label, value, target, hint) => ({...goal(label,value,target,hint),action});
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
    reward: "Food forest + storage · gathering & keeping supplies",
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
        "Neighbours choose their own bedtimes and sleep six to nine hours as needed. Without a bed they stay outside overnight. Time speeds to 16× while everyone is sleeping or at an outside job; normal speed returns with them.",
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
    reward: "Compost + community square · soil & friendship",
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
        "Ask a neighbour to forage food. Their saved request in People shows travel, breaks and completion. With a finished food forest, each trip also brings two fruit.",
      ),
      actionGoal("land", "Plant timber trees", +v.economy.sources.some(s=>s.material===0), 1, "Open Land in Projects and plant a timber plot. It needs water and four moist days before whole trees can be harvested; start early."),
      actionGoal("land", "Cultivate bamboo", +v.economy.sources.some(s=>s.material===1), 1, "Place a bamboo plot. Moist growth takes two days; shoots regrow after cutting. Two compost can enrich a material plot for faster growth. Town purchases can bridge the wait."),
    ],
  },
  {
    title: "A Place to Gather",
    person: "Luz",
    theme: "CARE & CONNECTION",
    art: "square",
    story: "“We share the work. Let's make time to share our stories, too.”",
    reward: "Shared work · storage, town trips & income",
    building: "square",
    after:
      "Keep meeting at our square. Next, organise storage, town trips and income to support the work we share.",
    objectives: (v) => [
      goal("Build our community square",count(v,"square"),1,"Make a place to meet. After the welcome supper, gatherings at the square strengthen friendships.","square"),
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
      goal("Build a storage house",count(v,"warehouse"),1,"Incoming orders and queued salvage also reserve space. A storage house adds 300 receiving spaces. Buildings offers resident demolition, salvage and moving; clear stock before dismantling a store.","warehouse"),
      actionGoal("town", "Bring home an outside-job contribution", +v.economy.work_day.some(day=>day>=0),1,"Enable one personal occupation in Town. Residents leave for their 09:00–17:00 shift and contribute its income after returning. Jobs are optional; you may disable them after this lesson."),
      actionGoal("town", "Collect an order by truck", +v.economy.orders.some(o=>o.status==="delivered"&&o.pickup_by!=null),1,"Buy a small basket, choose resident pickup and an available driver. The truck holds 40 units; it must return before supplies count. Larger orders use next-day delivery."),
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
        "Ask two neighbours to help with the same unfinished building. Set its priority first if several projects are planned. Help includes bringing supplies and returning after breaks; both neighbours must contribute before completion.",
      ),
    ],
  },
  {
    title: "Growing Resilience", person: "Bento & Iara", theme: "CRAFT & CULTIVATE",
    art: "greenhouse", building: "coop", reward: "Chicken coop · varied meals",
    story: "“Good tools, living soil, and seedlings under glass. Let's make our harvests more dependable.”",
    after: "A resilient garden makes room for a fuller table. Build a chicken coop and keep food aside for the hens.",
    objectives: v => [
      goal("Build a workshop", count(v,"workshop"),1,"Finish a workshop in Projects, then let Bento make tools.","workshop"),
      goal("Craft a set of tools",v.progress.tools_crafted,1,"Keep eight free timber at the workshop. Ask Bento to craft during normal work hours.","workshop"),
      goal("Build a compost station",count(v,"compost"),1,"Kitchen scraps become compost for our gardens.","compost"),
      goal("Bring in an enriched harvest",v.progress.enriched_harvests,1,"Make compost from kitchen scraps. The next garden harvest uses it automatically.","garden"),
      goal("Build a greenhouse",count(v,"greenhouse"),1,"Order the covering and finish a greenhouse. Its protected beds raise seedlings.","greenhouse"),
      actionGoal("supplies", "Raise a greenhouse seedling",v.progress.seedlings_raised||0,1,"Plant and keep the greenhouse moist. Eight hours of moist growth raises a seedling; rain does not water covered beds."),
      actionGoal("supplies", "Plant a seedling outdoors",v.progress.seedlings_used||0,1,"Keep garden replanting enabled and harvest a mature bed. Its next planting uses an available seedling for a growth head start. Supplies also lets you choose beans, lettuce or tomatoes."),
    ],
  },
  {
    title: "A Fuller Table", person: "Nina", theme: "CARE & ABUNDANCE",
    art: "coop", building: "solar_farm", reward: "Solar farm + street lights · shared power",
    story: "“A few hens, a little care, and fresh eggs for everyone. We can grow without rushing.”",
    after: "Our table is more varied. Now collect sunshine to keep our shared buildings and paths lit after dusk.",
    objectives: v => [
      goal("Build a chicken coop",count(v,"coop"),1,"Finish a coop and keep at least nine ingredients in the pantry.","coop"),
      actionGoal("supplies", "Cook with our eggs",+v.progress.egg_meal,1,"Enable cooking with eggs in Supplies. Two eggs, two ingredients and one fresh water make seven meals when a neighbour cooks."),
      {...goal("Collect our first three eggs",v.progress.eggs_collected||0,3,"Enable hen feeding in Supplies. Three ingredients feed a batch; eggs arrive after twelve daylight hours.","coop"),buildTarget:1},
    ],
  },
  {
    title: "Sunshine to Share", person: "Our founding five", theme: "ENERGY & INDEPENDENCE",
    art: "solar_farm", building: "solar_farm", reward: "Ecological toilet + reed bed · close the water loop",
    story: "“The sun gives us more than warm mornings. Let's save a little of it for the evening.”",
    after: "Our evenings are lit. Next, separate household wastewater and turn greywater into irrigation water.",
    objectives: v => [
      goal("Build a solar farm",count(v,"solar_farm"),1,"Order solar equipment in Town. A completed farm generates through daylight and adds 36 battery capacity.","solar_farm"),
      goal("Light a village path",count(v,"streetlight"),1,"Place a street light beside a road. It draws from our shared battery after dusk.","streetlight"),
      actionGoal("power", "Light a path after dusk",+v.progress.night_lights,1,"Finish a street light and leave it enabled in Power. Wait for the battery to actually supply it after dusk. Buildings without roof panels use the same village grid."),
      goal("Store twelve energy",Math.floor(v.power.stored),12,"Let daytime solar generation charge the battery. Open Power to watch generation, charge and demand.",null),
    ],
  },

  {
    title:"Water Comes Around",person:"Iara & Nina",theme:"WATER & SANITATION",art:"wetland",building:"biodigester",reward:"Biodigester · cooking gas & cured compost",
    story:"“Fresh water for our bodies, reclaimed water for our roots. Each has its own place.”",
    after:"Our water has a second life. Now give sealed toilet waste and kitchen scraps a safe, useful destination.",
    objectives:v=>[
      goal("Build an ecological toilet",count(v,"eco_toilet"),1,"Residents use it daily. Keep fresh water for handwashing; waste stays sealed.","eco_toilet"),
      goal("Build a lined reed bed",count(v,"wetland"),1,"A reed bed filters household greywater. Its output is irrigation water, never drinking water.","wetland"),
      goal("Build a banana treatment bed",count(v,"banana_treatment"),1,"A sealed basin planted with banana trees treats toilet sewage through its soil and roots. Its water stays separate from our drinking and irrigation stores.","banana_treatment"),
      actionGoal("supplies","Treat five toilet waste",Math.floor(v.circular.waste_treated ?? 0),5,"Enable banana treatment in Water & waste. Each finished bed treats one waste every four game hours. It needs no power and produces no water or food."),
      actionGoal("supplies","Five private toilet visits",v.circular.toilet_visits,5,"Let residents visit during their own daily routines. Keep one fresh water available per visit."),
      actionGoal("supplies","Catch rain in our cistern",+v.progress.rain_caught,1,"Rain falls 14:00–17:00 on two days out of three. A completed cistern catches it when there is space."),
      actionGoal("supplies","Filter eight irrigation water",Math.floor(v.circular.water_reused),8,"Keep greywater filtration enabled. Twelve greywater becomes eight reclaimed water over six hours."),
      actionGoal("supplies","Use reclaimed irrigation",+v.progress.reclaimed_irrigation,1,"A garden or cultivated material plot uses reclaimed water first when it needs watering. Keep a planted plot growing."),
    ],
  },
  {
    title:"Scraps into Energy",person:"Luz",theme:"CLOSE THE LOOP",art:"biodigester",building:"biodigester",reward:"Local construction · build with the land",
    story:"“A careful little cycle: scraps, sealed waste, cooking gas, then compost when it is ready.”",
    after:"Gas stretches our cooking, and cured digestate returns to the soil. Let's build our next home from local earth.",
    objectives:v=>[
      goal("Build a biodigester",count(v,"biodigester"),1,"Order its equipment and complete the sealed installation.","biodigester"),
      actionGoal("supplies","Complete a digestion batch",v.circular.batches,1,"Enable automatic feeding in Supplies. Two sealed waste and two kitchen scraps take eight hours to make four gas and two digestate."),
      actionGoal("supplies","Cook a meal with biogas",+v.progress.biogas_meal,1,"Enable biogas cooking. The next pot uses one gas and yields one extra meal; fresh water is still required."),
      actionGoal("supplies","Finish curing digestate",+v.progress.digestate_cured,1,"Wait a full day after digestion. Digestate becomes usable compost only after curing; its later use will not erase this milestone."),
    ],
  },
  {
    title:"Homes of Earth",person:"Bento & Cauã",theme:"LOCAL MATERIALS & EXCHANGE",art:"adobe-gable",building:"hydro",reward:"River generator · dependable evening power",
    story:"“Use what the land can give, renew what grows, and buy the pieces we cannot make here.”",
    after:"Our adobe home brings local earth into everyday life. Next, meet the river that keeps moving after sunset.",
    objectives:v=>[
      actionGoal("land","Harvest the five local materials",[0,1,2,3,4].filter(m=>v.economy.sources.some(s=>s.material===m&&s.harvests>0)).length,5,"Open Land and request a mature harvest batch for timber and bamboo. Place earth, stone and salvage extraction sites and request their batches too; stone belongs on southeast ground. Residents work 09:00–12:00 and 15:00–16:00. Extraction reserves are finite; clearing a site does not refill them. Missing: "+["timber","bamboo","earth","stone","salvage"].filter((_,m)=>!v.economy.sources.some(s=>s.material===m&&s.harvests>0)).join(", ")+"."),
      actionGoal("land","Replant a harvested timber plot",+v.progress.timber_replanted,1,"Harvest all four whole trees, then enable replanting or request it. A resident plants the next crop using R$ 40 and two irrigation water."),
      actionGoal("preparation","Prepare building materials locally",v.progress.prepared_batches||0,1,"Choose Local or Adobe for an unfinished project before materials are committed. Supply raw earth/timber/salvage; neighbours prepare frames, walls and fittings at camp, and tiles at the workshop when the project needs them."),
      {...goal("Complete an adobe home",+v.economy.projects.some(p=>p.recipe==="adobe"&&v.buildings.some(b=>b.id===p.building&&b.kind==="home"&&b.progress>=100)),1,"Plan a home, choose Adobe before building starts, then follow its stages in Projects. Imported fittings and roofing still matter.","home"),recipe:"adobe"},
      actionGoal("town","Sell genuine surplus",+v.progress.surplus_sold,1,"Ask for extra garden harvests or gathering in People until you have at least 37 ingredients, then sell one in Town. Normal chores keep a smaller healthy pantry; this one-off sale must leave the protected 36-ingredient reserve."),
      actionGoal("town","Exchange with our neighbour",+v.progress.parts_exchanged,1,"Set aside four ingredients above the 36 reserve and exchange them for two fittings in Town. The neighbour trades once per day."),
    ],
  },
  {
    title:"The River Keeps Giving",person:"Nina",theme:"RIVER ENERGY",art:"hydro",building:"hydro",reward:"Community care · a rhythm worth keeping",
    story:"“The river can cover part of our evening demand while the solar panels rest.”",
    after:"Sun and water share the grid. What matters now is making room for the people who care for it.",
    objectives:v=>[
      goal("Place a river generator",count(v,"hydro"),1,"Choose a river cell with land access and order turbine equipment. This generator adds eighteen battery capacity.","hydro"),
      actionGoal("power","Generate river power after dusk",+v.progress.river_night,1,"Wait for the completed generator to run after dusk. Power shows its live output: rain increases flow and dry days reduce it. Switch unneeded loads off to stretch the battery."),
    ],
  },
  {
    title:"Room to Breathe",person:"Luz & our founding five",theme:"REST & SHARED CARE",art:"square",building:"square",reward:"A village in balance · our final chapter",
    story:"“Our village is more than the things we build. Let's protect time to simply live here.”",
    after:"An agreement matters when we follow through. Keep the food healthy and leave time for everyone's own interests.",
    objectives:v=>[
      actionGoal("situations","Follow through on a community agreement",v.situations.resolved_count,1,"Open Situations and choose shared shifts or a day off. Other neighbours must actually cook, the person needs 72 minutes of rest or company, and a full day must pass. If no concern arose, Luz offers a story check-in for personal time."),
      actionGoal("people","Let everyone enjoy a hobby",(v.progress.hobby_mask||0).toString(2).replaceAll("0","").length,5,"Let normal leisure unfold: walks, birdwatching, stretching, daydreaming and stargazing. Turn off outside jobs or release repeated requests if they leave too little time."),
    ],
  },
  {
    title:"A Village in Balance",person:"Our founding five",theme:"LIFE TOGETHER",art:"grove",building:"square",reward:"Our story continues · every building unlocked",
    story:"“A village fed by its land, connected to its neighbours, with time enough to enjoy both.”",
    after:"All thirteen chapters are complete. Keep growing Vila Aurora at your own pace, with every building and the rhythms we have learned together.",
    objectives:v=>[
      actionGoal("build","Make room for every village building",storyBuildingKinds.filter(k=>count(v,k)>0).length,storyBuildingKinds.length,"Finish every kind of building introduced by the journal. Open Build to find any missing plans."),
      goal("Keep beds for everyone",count(v,"home"),2,"Two homes provide six beds for our five neighbours.","home"),
      actionGoal("supplies","Keep a healthy food reserve",Math.floor(v.food),18,"Keep eighteen ingredients for household cooking, then let neighbours enjoy their free time. Trade still protects its larger 36-ingredient reserve before accepting a sale."),
      actionGoal("supplies","Keep fresh water ready",Math.floor(v.water),20,"Keep twenty fresh water in the cistern. Reclaimed water irrigates plants; drinking and cooking need fresh water."),
      actionGoal("gathering","Meet again at our square",v.progress.gatherings,2,"Set aside five meals and host another gathering at the square, between 08:00 and 18:00. At least three fed, rested neighbours must attend."),
    ],
  },

];
export const unlockQuest = { grove:0, warehouse:0, compost:1, eco_toilet:6, square:1, workshop:3, greenhouse:3, wetland:6, banana_treatment:6, coop:4, biodigester:7, solar_farm:5, hydro:9, streetlight:5 };
export const questCompleted = (v,id) => id<4 ? v.progress.completed[id] : (v.progress.later_completed||[])[id-4] || false;
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
  if(objective?.build){
    const fits=b=>b.kind===objective.build&&(!objective.recipe||state.village.economy.projects.some(p=>p.building===b.id&&p.recipe===objective.recipe));
    const ready=state.village.buildings.filter(b=>fits(b)&&b.progress>=100).length;
    const moving=(state.village.building_jobs||[]).filter(j=>j.action==='move'&&j.original_progress>=100&&state.village.buildings.some(b=>b.id===j.building&&fits(b)));
    if(moving.length&&ready+(moving.length)>=(objective.buildTarget??objective.target))return {type:'visit',id:moving[0].building};
  }
  if(objective?.recipe && !state.village.economy.projects.some(p=>p.recipe===objective.recipe&&state.village.buildings.some(b=>b.id===p.building&&b.progress>=100))) {
    const project=state.environment.economy.projects.find(p=>p.kind===objective.build&&p.recipe===objective.recipe);
    return project?{type:"project",id:project.building,project}:{type:"plan",kind:objective.build,recipe:objective.recipe};
  }
  if(!objective?.build)return null;
  const kind=objective.build, buildings=state.village.buildings.filter(b=>b.kind===kind);
  const project=state.environment.economy.projects.find(p=>p.kind===kind&&!p.paused)||state.environment.economy.projects.find(p=>p.kind===kind);
  if(project)return {type:'project',id:project.building,project};
  if(buildings.filter(b=>b.progress>=100).length>=(objective.buildTarget??objective.target))return {type:'visit',id:buildings.find(b=>b.progress>=100).id};
  return {type:'plan',kind};
}
