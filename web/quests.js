// Text and objective views; Rust owns permanent completion and unlocks.
export const storyBuildingKinds = ["home","garden","well","kitchen","grove","warehouse","compost","square","workshop","greenhouse","coop","solar_farm","streetlight","eco_toilet","wetland","banana_treatment","biodigester","hydro","orchard","goat_pasture","apiary"];
const actionGoal = (action, label, value, target, hint, page) => ({...goal(label,value,target,hint),action,...(page?{page}:{})});
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
const lessons = [
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
      "Place a free cistern blueprint, then check Construction. Buy its pump in Town. Arrival barrels hold the first fresh water; neighbours can fetch treated water from the neighbouring farm and carry loads to homes, kitchens and growing plots. Rain fills the cistern itself. Supplies shows each container and carrier. Forecast the workweek to compare current supplies and schedules.",
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
        "Build a garden and ask Iara to tend it. A helping request covers one work session: plant first, then let neighbours water the growing crop. Lettuce takes about three moist growing hours on suitable soil. If the pantry is already healthy, return to the ripe bed and request its harvest. Open Land views beside the minimap to compare fertility and moisture before choosing a clearing.",
        "garden",
      ),
      goal(
        "Serve a cooked meal",
        count(v, "kitchen") ? v.meals_served : 0,
        1,
        "Build a kitchen. Three food and one fresh water make five meals. Washing leaves greywater in this kitchen’s buffer; neighbours carry closed containers to the neighbouring service point until local treatment is available. Check Supplies → Ecology → Where waste is if the buffer is full.",
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
      "Build a compost station near the kitchen and gardens. Neighbours carry two scraps there, turn them into one compost, then deliver it to a growing plot for an enriched harvest.",
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
        "Ask a neighbour to forage food. Their saved request in People shows travel, breaks and completion. With a finished food forest, each forest trip brings six ingredients.",
      ),
      actionGoal("land", "Plant timber trees", +v.economy.sources.some(s=>s.material===0&&(s.planted||s.harvests>0)), 1, "Mark a timber plot in Construction. Neighbours must deliver four timber seedlings from the arrival store, then spend a community work session planting and watering. The first stock comes with the village; order more in Trade for replanting. Trees need about four moist growing days on suitable soil before whole trees can be harvested; start early."),
      actionGoal("land", "Cultivate bamboo", +v.economy.sources.some(s=>s.material===1&&(s.planted||s.harvests>0)), 1, "Mark a bamboo plot. A neighbour delivers one bamboo start and plants it using two irrigation water; the arrival store carries the first start. Moist growth takes about two days on suitable soil; shoots regrow after cutting. Poor soil and heavy tree shade slow growth. Town purchases can bridge the wait."),
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
      goal("Build our community square",count(v,"square"),1,"Make a place to meet near homes and the kitchen. Roads help guests and cooked meals reach the shared table. They disturb their ground; removing a road leaves soil to restore. After the welcome supper, gatherings at the square strengthen friendships.","square"),
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
          "Plan five prepared meals. Neighbours have until the following evening to carry them to the shared table, then at least three rested, fed neighbours must arrive. Open Supplies to follow delivery or cancel.",
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
      "Build a workshop and a greenhouse. Delivering eight timber to its workbench lets a neighbour craft twelve tool uses. Tools must reach a project to give 25% faster construction; moist greenhouse beds raise seedlings.",
    objectives: (v) => [
      goal("Build a storage house",count(v,"warehouse"),1,"Short roads between the arrival store, storage houses and worksites reduce hauling time. Incoming orders and queued salvage also reserve space. A storage house adds 300 receiving spaces. Buildings offers resident demolition, salvage and moving; clear stock before dismantling a store.","warehouse"),
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
      goal("Craft a set of tools",v.progress.tools_crafted,1,"Keep eight timber available and ask Bento to craft during community hours. He brings inputs to an open workshop and resumes the saved batch after breaks. Finished tools travel onward to projects and harvests.","workshop"),
      goal("Build a compost station",count(v,"compost"),1,"Neighbours turn delivered kitchen scraps into compost. Ask a neighbour to turn extra scraps, or buy mature compost in Trade. In Land views, queue soil work: two delivered compost and a neighbour's time gradually restore its soil.","compost"),
      goal("Bring in an enriched harvest",v.progress.enriched_harvests,1,"Keep the kitchen, compost station and gardens connected by short paths. Neighbours carry scraps for composting and deliver mature compost to the plot before its harvest.","garden"),
      goal("Build a greenhouse",count(v,"greenhouse"),1,"Order the covering and finish a greenhouse. Its protected beds raise seedlings.","greenhouse"),
      actionGoal("supplies", "Raise a greenhouse seedling",v.progress.seedlings_raised||0,1,"Plant and keep the greenhouse moist. Eight base hours of moist growth raises a seedling. Soil and light affect the time; check Growing plots in Supplies. Rain does not water covered beds.","ecology"),
      actionGoal("supplies", "Plant a seedling outdoors",v.progress.seedlings_used||0,1,"Keep garden replanting enabled and harvest a mature bed. Neighbours haul a vegetable seedling from the greenhouse store to this garden. Its next attended planting uses that delivered seedling for a growth head start. Choose lettuce, beans, tomatoes, maize, cassava or fodder in Buildings → Growing plan.","ecology"),
    ],
  },
  {
    title: "A Fuller Table", person: "Nina", theme: "CARE & ABUNDANCE",
    art: "coop", building: "solar_farm", reward: "Solar farm + street lights · shared power",
    story: "“A few hens, a little care, and fresh eggs for everyone. We can grow without rushing.”",
    after: "Our table is more varied. Now collect sunshine to keep our shared buildings and paths lit after dusk.",
    objectives: v => [
      goal("Establish a fruit orchard",count(v,"orchard"),1,"An orchard needs four delivered tree seedlings and two compost to build. Keep its roots moist; its first fruit takes six growing days. Mature trees fruit every two growing days.","orchard"),
      goal("Harvest orchard fruit",v.progress.orchard_fruit||0,1,"Neighbours water and harvest fruit trees during community hours when ingredients are needed. The trees remain planted. Place a tended apiary within six tiles for a larger harvest.","orchard"),
      goal("Rotate after beans",v.progress.crop_rotations||0,1,"Harvest beans in a garden, then change its next crop to lettuce, tomatoes, maize or cassava. Harvesting the following crop improves soil nutrients and cover. Fodder grass feeds livestock; cassava and beans dry half as quickly as lettuce.","garden"),
      goal("Care for dairy goats",v.progress.milk_collected||0,1,"Build a goat pasture. Buy a dairy goat pair for its final stage in Trade. Grow fodder grass or buy feed. Residents bring two fodder and two fresh drinking water, feed the goats and return the next day to collect milk. Keep care enabled.","goat_pasture"),
      goal("Collect stingless bee honey",v.progress.honey_collected||0,1,"Build an apiary and buy a stingless bee colony for its final stage. Place it within six tiles of an orchard, food forest or planted bean/tomato garden. A resident inspects the hive; honey grows over twelve daylight hours and must be collected.","apiary"),
      goal("Build a chicken coop",count(v,"coop"),1,"Finish a coop and keep at least nine ingredients in the pantry.","coop"),
      actionGoal("supplies", "Cook with our eggs",+v.progress.egg_meal,1,"Enable cooking with eggs in Supplies. Two eggs, two ingredients and one fresh water make seven meals when a neighbour cooks.","pantry"),
      {...goal("Collect our first three eggs",v.progress.eggs_collected||0,3,"Enable hen feeding in Supplies. Three ingredients feed a batch; eggs arrive after twelve daylight hours.","coop"),buildTarget:1},
    ],
  },
  {
    title: "Sunshine to Share", person: "Our founding five", theme: "ENERGY & INDEPENDENCE",
    art: "solar_farm", building: "solar_farm", reward: "Ecological toilet + reed bed · close the water loop",
    story: "“The sun gives us more than warm mornings. Let's save a little of it for the evening.”",
    after: "Our evenings are lit. Next, separate household wastewater and turn greywater into irrigation water.",
    objectives: v => [
      goal("Build a solar farm",count(v,"solar_farm"),1,"Order solar equipment in Town. A completed farm generates through daylight and adds 36 battery capacity. Open the Tree shade land view before placing it; visible perimeter trees, food forests, timber, bamboo and banana beds reduce its sunlight.","solar_farm"),
      goal("Light a village path",count(v,"streetlight"),1,"Place a street light beside a road. It draws from our shared battery after dusk.","streetlight"),
      actionGoal("power", "Light a path after dusk",+v.progress.night_lights,1,"In Power → Plan an electrical cable, choose the solar farm and street light. Queue the route, buy its missing kit in Trade, and let neighbours deliver and install it. Leave the light enabled after dusk. Only its connected circuit can supply it; rooftop batteries stay private."),
      goal("Store twelve energy",Math.floor(v.power.stored),12,"Let daytime solar generation charge the battery. Open Power to watch generation, charge and demand.",null),
    ],
  },

  {
    title:"Water Comes Around",person:"Iara & Nina",theme:"WATER & SANITATION",art:"wetland",building:"biodigester",reward:"Biodigester · cooking gas & cured compost",
    story:"“Fresh water for our bodies, reclaimed water for our roots. Each has its own place.”",
    after:"Our water has a second life. Now give sealed toilet waste and kitchen scraps a safe, useful destination.",
    objectives:v=>[
      goal("Build an ecological toilet",count(v,"eco_toilet"),1,"Residents use it daily. Deliver fresh water for handwashing and leave space in its local greywater and sewage buffers. Neighbours carry closed service containers, or you can install separate compatible lines through Pipes & pumps.","eco_toilet"),
      goal("Build a lined reed bed",count(v,"wetland"),1,"A reed bed filters household greywater. Its output is irrigation water, never drinking water.","wetland"),
      goal("Build a banana treatment bed",count(v,"banana_treatment"),1,"A sealed basin planted with banana trees treats toilet sewage through its soil and roots. Its water stays separate from our drinking and irrigation stores.","banana_treatment"),
      actionGoal("supplies","Treat five toilet waste",Math.floor(v.circular.waste_treated ?? 0),5,"Enable banana treatment in Water & waste. Sewage must reach this bed through closed service containers or a sewage line. Each finished bed treats one delivered sewage every four game hours, with no power, water or food output.","ecology"),
      actionGoal("supplies","Five private toilet visits",v.circular.toilet_visits,5,"Let residents visit during their own daily routines. Keep one fresh water delivered to the toilet per visit, with room in its separate greywater and sewage buffers.","ecology"),
      actionGoal("supplies","Catch rain in our cistern",+v.progress.rain_caught,1,"Check the seven-day forecast from the village clock for rain. A completed cistern catches it when there is space. In Supplies → Water → Where water is → Pipes & pumps, connect it to a household or kitchen to reduce carrying. Residents install the kit. Connect the finished pump to a generator in Power; manual carrying remains available while its cable is missing or its circuit is empty.","water"),
      actionGoal("supplies","Filter eight irrigation water",Math.floor(v.circular.water_reused),8,"Keep greywater filtration enabled. Neighbours deliver closed containers to the reed bed, or install a greywater line from a home or kitchen. Twelve delivered greywater becomes eight irrigation over six hours; the bed reserves its own output and input-return space.","ecology"),
      actionGoal("supplies","Use reclaimed irrigation",+v.progress.reclaimed_irrigation,1,"A garden or cultivated material plot uses reclaimed water first when it needs watering. If food reserves are healthy, ask a neighbour to Tend garden in People; routine food work pauses at a healthy pantry. Neighbours carry reclaimed water, or install a separate irrigation line from the reed bed in Supplies → Water → Where water is → Pipes & pumps.","water"),
    ],
  },
  {
    title:"Scraps into Energy",person:"Luz",theme:"CLOSE THE LOOP",art:"biodigester",building:"biodigester",reward:"Local construction · build with the land",
    story:"“A careful little cycle: scraps, sealed waste, cooking gas, then compost when it is ready.”",
    after:"Gas stretches our cooking, and cured digestate returns to the soil. Let's build our next home from local earth.",
    objectives:v=>[
      goal("Build a biodigester",count(v,"biodigester"),1,"Order its equipment and complete the sealed installation.","biodigester"),
      actionGoal("supplies","Complete a digestion batch",v.circular.batches,1,"Enable automatic feeding in Supplies. Pause banana treatment when waste is scarce so two sealed waste can reach the digester. Two delivered scraps complete its feed; digestion takes eight hours.","ecology"),
      actionGoal("supplies","Cook a meal with biogas",+v.progress.biogas_meal,1,"Enable biogas cooking for an extra meal per pot. If a pot waits for eggs, buy them or switch off eggs in Supplies. Fresh water is still required.","ecology"),
      actionGoal("supplies","Finish curing digestate",+v.progress.digestate_cured,1,"Wait a full day after digestion. Cured compost remains in a pile at that plot until neighbours collect it; its later use will not erase this milestone.","ecology"),
    ],
  },
  {
    title:"Homes of Earth",person:"Bento & Cauã",theme:"LOCAL MATERIALS & EXCHANGE",art:"adobe-gable",building:"hydro",reward:"River generator · dependable evening power",
    story:"“Use what the land can give, renew what grows, and buy the pieces we cannot make here.”",
    after:"Our adobe home brings local earth into everyday life. Next, meet the river that keeps moving after sunset.",
    objectives:v=>[
      actionGoal("land","Harvest the five local materials",[0,1,2,3,4].filter(m=>v.economy.sources.some(s=>s.material===m&&s.harvests>0)).length,5,"Open Land and request a mature harvest batch for timber and bamboo. Place earth, stone and salvage extraction sites and request their batches too; stone belongs on southeast ground. Residents work 09:00–12:00 and 15:00–16:00. Extraction reserves are finite; clearing a site does not refill them. Missing: "+["timber","bamboo","earth","stone","salvage"].filter((_,m)=>!v.economy.sources.some(s=>s.material===m&&s.harvests>0)).join(", ")+"."),
      actionGoal("land","Replant a harvested timber plot",+v.progress.timber_replanted,1,"Harvest all four whole trees, then enable replanting or request it. Four timber seedlings must reach the plot, then a resident replants with two irrigation water. Buy starts in Trade or use our remaining planting stock."),
      actionGoal("preparation","Prepare building materials locally",v.progress.prepared_batches||0,1,"Choose Local or Adobe for an unfinished project before materials are committed. Supply raw earth, timber and salvage. Neighbours bring inputs to camp or a workshop, then prepare materials there during community hours. Follow each saved batch in Preparing materials; zero reserve makes only what projects need."),
      {...goal("Complete an adobe home",+v.economy.projects.some(p=>p.recipe==="adobe"&&v.buildings.some(b=>b.id===p.building&&b.kind==="home"&&b.progress>=100)),1,"Plan a home, choose Adobe before building starts, then connect it to stores and workshops with roads. Set its priority in Projects to keep deliveries moving alongside daily care. Imported fittings and roofing still matter.","home"),recipe:"adobe"},
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
      actionGoal("situations","Follow through on a community agreement",v.situations.resolved_count,1,"Choose shared shifts or a day off in Situations, then ask another neighbour for cooking help. Bring the pot's missing ingredients. The person needs 72 minutes of rest or company, and a full day must pass. Luz offers a story check-in if no concern arose."),
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
      actionGoal("supplies","Keep a healthy food reserve",Math.floor(v.food),18,"Keep eighteen ingredients for household cooking, then let neighbours enjoy their free time. Trade still protects its larger 36-ingredient reserve before accepting a sale.","pantry"),
      actionGoal("supplies","Keep fresh water ready",Math.floor(v.water),20,"Keep twenty fresh water in the cistern. Reclaimed water irrigates plants; drinking and cooking need fresh water.","water"),
      actionGoal("gathering","Meet again at our square",v.progress.gatherings,2,"Plan another gathering at the square between 08:00 and 18:00. Allow delivery through the following evening and give at least three fed, rested neighbours time to arrive. Follow preparation in Supplies."),
    ],
  },

];
// Required planning outcomes and optional lessons have separate progress.
const lesson=(v,chapter,label)=>{const found=lessons[chapter].objectives(v).find(o=>o.label===label);if(!found)throw Error('Missing Story lesson: '+label);return found;};
const observed=(v,index,label,hours,hint,action='supplies',page='pantry')=>{
 const s=v.progress.outcomes||{},best=s.best?.[index]||0,current=s.current?.[index]||0;
 const detail=s.last_sample==null?' The first observation appears after the simulation advances.':index===0||index===1||index===4?` Last observation: ${s.food_at_stores||0} reachable, unclaimed portions${s.food_access?'':'; at least one neighbour lacks food access'}.`:'';
 return {...actionGoal(action,label,Math.floor(best/6)/10,hours,`${hint} The journal checks every fifteen game minutes. A lapse restarts the current period; earlier success still counts. Current: ${(current/60).toFixed(1)} h; best: ${(best/60).toFixed(1)} h.${detail}`,page),unit:'h'};
};
const primary=[
 v=>lessons[0].objectives(v).slice(0,5),
 v=>[
  goal('Establish a perennial food source',+(count(v,'grove')>0||count(v,'orchard')>0),1,'Choose a food forest for regular gathering, or an orchard for slower, lasting fruit. Leave access for harvesting and water.', v.buildings.some(b=>b.kind==='orchard')&&!v.buildings.some(b=>b.kind==='grove')?'orchard':'grove'),
  actionGoal('people','Gather fruit from our perennial plants',+(v.progress.fruit>=6||v.progress.orchard_fruit>0),1,'A food forest supplies fruit during gathering. If the pantry is healthy, ask a neighbour for one gathering batch in People. Orchard trees need time and water before their first harvest. Choose the cycle that fits our plans.'),
  actionGoal('land','Plant a renewable material crop',+v.economy.sources.some(s=>s.material<2&&(s.planted||s.harvests>0)),1,'Choose timber trees or bamboo. Mark a plot near its future users and let neighbours deliver starts, plant and water. You can buy construction supplies while it grows.'),
  observed(v,0,'Keep twelve edible portions for six hours',6,'Ingredients, prepared meals, milk and honey count when neighbours can reach them before spoilage. Cargo and cooking inputs do not. Keep hunger at 65 or less and energy at least 25.'),
 ],
 v=>['Build our community square','Host a welcome supper'].map(label=>lesson(v,2,label)),
 v=>[
  actionGoal('town','Receive an order from town',+!!v.progress.outcomes?.order_received,1,'Choose delivery or a resident pickup. Confirmed prices and arrival terms stay agreed. Combine project needs to save fees, or spend a neighbour’s time bringing a small basket home sooner.'),
  actionGoal('preparation','Complete a short project delivery',+(v.progress.outcomes?.shortest_delivery!=null&&v.progress.outcomes.shortest_delivery<=30),1,'Deliver construction supplies from pickup to an unfinished building in at most thirty game minutes. Nearby stores and useful roads shorten the trip; the workweek forecast compares actual routes and schedules.'+(v.progress.outcomes?.shortest_delivery==null?'':` Best completed delivery: ${v.progress.outcomes.shortest_delivery.toFixed(1)} minutes.`)),
  actionGoal('town','Bring in a contribution or resource trade',+(v.economy.work_day.some(d=>d>=0)||v.progress.surplus_sold||v.progress.parts_exchanged||v.progress.outcomes?.resources_sold),1,'Enable a personal outside shift, sell genuinely spare materials, or trade food above the household reserve. Outside income costs village working time; local production keeps people here.'),
 ],
 v=>[
  actionGoal(count(v,'workshop')?'preparation':'town','Make tools or put bought tools to use',+(v.progress.tools_crafted>0||(v.simulation.materials?.spent?.[15]||0)>0),1,'Build a workshop and deliver timber to craft tools, or buy tools and let them reach construction or a harvest. Everyone can still do ordinary work without them.'),
  actionGoal('supplies','Improve a growing plot',+(v.progress.enriched_harvests>0||v.progress.outcomes?.soil_improved),1,'Use delivered compost before a harvest, or restore a plot through Land views. Compost can be turned from scraps or bought. Compare soil and walking distances before adding more beds.','ecology'),
 ],
 v=>[
  actionGoal('supplies','Add a different local food cycle',+(v.progress.eggs_collected>=3||v.progress.milk_collected>0||v.progress.honey_collected>0||v.progress.orchard_fruit>0||v.progress.crop_rotations>0),1,'Choose hens, goats, bees, orchard fruit, or a bean rotation followed by another crop. Each needs different land, supplies and resident time. Bought produce helps the pantry but does not establish a local cycle.','ecology'),
  observed(v,1,'Keep eight edible portions for a day',24,'Let the food plan support daily life: eight reachable, unclaimed portions, hunger no higher than 65 and energy at least 25. Buy a reserve or improve local growing and delivery.'),
 ],
 v=>['Build a solar farm','Light a village path','Light a path after dusk'].map(label=>lesson(v,6,label)),
 v=>[
  ...['Build an ecological toilet','Build a lined reed bed','Five private toilet visits','Filter eight irrigation water','Use reclaimed irrigation'].map(label=>lesson(v,7,label)),
  observed(v,2,'Keep household services ready for twelve hours',12,'Occupied homes and kitchens need fresh water and room for washing greywater; completed toilets need handwashing water and sewage room. Short manual trips or installed, powered lines can both work. Keep hunger at 65 or less and energy at least 25.','supplies','water'),
 ],
 v=>['Build a biodigester','Complete a digestion batch','Cook a meal with biogas'].map(label=>lesson(v,8,label)),
 v=>[
  goal('Give everyone a village bed',count(v,'home'),2,'Finish a second home. Choose prepared materials, local bamboo or adobe before materials are committed. Compare outside purchases, local preparation and the working week; earlier homes count.','home'),
  actionGoal('town','Keep R$ 100 for the next need',Math.min(100,Math.floor(v.economy.money/100)),100,'Keep a small emergency fund after housing. Outside jobs and genuine surplus can rebuild it. Existing stock reduces new purchases; local preparation costs resident time.',null),
 ],
 v=>[
  observed(v,3,'Supply a village light for four night hours',4,'Use stored sunshine or add a river generator. An enabled street light needs an actual connected supply after dusk; rooftop batteries stay private. Earlier successful evenings count.','power'),
  observed(v,2,'Keep local services ready for twelve hours',12,'Manual carrying and installed lines are alternatives. Water and waste buffers must remain usable while neighbours eat, rest and work. Check equipment condition before a pump or battery needs service.','supplies','water'),
 ],
 v=>[
  ...lessons[11].objectives(v),
  actionGoal('people','Leave a full day with majority leisure',+!!v.progress.outcomes?.leisure_day,1,'Observe a complete game day with more than half of each neighbour’s waking village time for rest, company and hobbies. Outside shifts and sleep are separate. Reduce repeated requests or shorten service trips if work crowds it out.'),
 ],
 v=>[
  goal('Keep beds for everyone',count(v,'home'),2,'Keep two completed homes so all five neighbours can sleep here.','home'),
  observed(v,4,'Keep the village comfortable for twelve dry hours',12,'Check the actual season forecast. Keep six reachable, unclaimed portions, beds for everyone and usable household water/waste buffers through a dry period. Hunger stays at most 65, energy at least 25 and company at least 25. Soil, irrigation, crop choices or a purchased reserve can bridge dry weather.'),
  observed(v,2,'Keep local services ready for twelve hours',12,'Continue fresh-water delivery and safe waste handling. Use the service forecast and local buffers to decide whether pipes are worth the equipment and resident installation.','supplies','water'),
  actionGoal('people','Keep a day with majority leisure',+!!v.progress.outcomes?.leisure_day,1,'A full observed day should leave each neighbour more time for rest, company and hobbies than chores, travel and meals. Earlier success counts.'),
  lesson(v,12,'Meet again at our square'),
 ],
];
const guide=(action,label,hint,page)=>({...actionGoal(action,label,0,1,hint,page),guide:true});
const extras=[
 v=>lessons[0].objectives(v).slice(5),
 v=>[...lessons[1].objectives(v).slice(2),...lessons[5].objectives(v).slice(0,2)],
 v=>lessons[2].objectives(v).slice(1,3),
 v=>[...lessons[3].objectives(v).filter(o=>o.label!=='Receive a town delivery'),
  actionGoal('people','Set a broad work preference',+v.workforce.preferences.some(row=>row.some(n=>n!==1)),1,'Open a neighbour in People and choose Often, As needed or Avoid for building, hauling, food, materials or care. These guide shared jobs; needs, sleep, agreements and outside shifts still come first. Watch who takes the next available job.'),
  guide('preparation','Compare the next working week','Use Forecast workweek in Construction before committing more projects. It replays actual supplied work, routes, needs and outside shifts on a copy. The result is conditional: future purchases or changed plans require another forecast.'),
 ],
 v=>[...lessons[4].objectives(v),
  guide('preparation','Manage saved production batches','Preparing materials shows each worksite, delivered inputs, held batches and reserved output room. A zero reserve makes only what projects need. Pause a station to retain its work; cancelling a batch returns its available inputs once. Full stores can block output.'),
  guide('preparation','Choose hand tools or powered workshop tools','A workshop can keep its hand bench, or use powered tools for faster attended work. Select its operating mode in Construction and install a paid electrical connection in Power. An outage preserves the saved batch; switch back to hand work if that suits the village.'),
 ],
 v=>lessons[5].objectives(v),
 v=>[lesson(v,6,'Store twelve energy')],
 v=>[...['Build a banana treatment bed','Treat five toilet waste','Catch rain in our cistern'].map(label=>lesson(v,7,label)),
  guide('supplies','Compare carrying with fresh-water pipes','Water → Pipes & pumps compares actual ports, route length and the installation kit. Queue a line, buy its missing parts and let neighbours deliver and install it. Pumps need their own electrical supply. Carrying remains a viable alternative; a distant cistern is not a remote shared tank.','water'),
  guide('supplies','Keep water and waste routes separate','Fresh water, reclaimed irrigation, greywater and sealed sewage use compatible ports and local buffers. Plan greywater from a kitchen or home to a reed bed; route toilet sewage to a digester or banana bed. Pausing or dismantling a line preserves owned contents and requires resident work.','water'),
 ],
 v=>[lesson(v,8,'Finish curing digestate')],
 v=>[...lessons[9].objectives(v),guide('land_map','Read the land before expanding','Use Land views to compare fertility, moisture, retention, shade and disturbance. Protect good growing soil when placing homes. Roads and foundations leave lasting marks; two delivered compost and attended restoration can recover soil without refilling a depleted stone or earth patch.'),actionGoal('preparation','Complete an expansion within R$ 1.200 of external spending',+(v.progress.outcomes?.best_housing_spend!=null&&v.progress.outcomes.best_housing_spend<=120000),1,'Optional: net external spending while a second or later home is built must stay at most R$ 1.200. Salaries and sales do not hide purchases; refunds reduce spending. Existing materials and local work can save cash. Other purchases during construction count too.'+(v.progress.outcomes?.best_housing_spend==null?'':` Best completed expansion: R$ ${(v.progress.outcomes.best_housing_spend/100).toFixed(2)}.`))],
 v=>[...lessons[10].objectives(v),guide('weather','Prepare for wet and dry periods','Open the seven-day forecast from the clock. The calendar alternates twenty-one-day wet and dry periods; the first two weeks keep familiar arrival weather. The same conditions affect roots, rain collection, solar output and river flow. Choose modest food and energy reserves, irrigation or purchases before a shortage.'),actionGoal('supplies','Complete real equipment service',v.maintenance.jobs.filter(j=>j.finished!=null&&!j.cancelled).length,1,'Equipment can be serviced at 70% condition. Follow its warnings, buy or reserve spare parts and let a neighbour deliver and fit them. You can prepare while healthy; waiting for wear is optional.','ecology'),actionGoal('town','Use a firm seasonal purchase',+v.economy.orders.some(o=>o.status==='delivered'&&o.terms?.active),1,'After the arrival period, compare regular prices, limited weekly offers and the freight forecast. Buy supplies you need; confirmed terms survive later price changes.')],
 v=>[actionGoal('people','Learn through useful work',+v.skills.people.some(p=>p.experience.some(n=>n>=12)),1,'People → Field notes shows six skills learned through completed work and paid outside shifts. Small bonuses grow gradually, with daily practice limits; ordinary jobs stay open to everyone. Match preferences to growing experience while keeping time for hobbies.')],
 v=>[actionGoal('build','Explore every building at your own pace',storyBuildingKinds.filter(k=>count(v,k)>0).length,storyBuildingKinds.length,'The remaining building types are optional. Revisit earlier chapters to compare local food, material, water and power paths without blocking our story.')],
];
const revised={
 0:{after:'Our first daily routines are taking shape. Next, choose how food and renewable materials will grow.'},
 3:{after:'Good supplies and short trips give us time back. A workshop can replace bought tools; a greenhouse can raise seedlings. Choose the investments our plans need.'},
 4:{after:'Improved soil and useful tools make room for another food cycle. Choose hens, fruit, goats, bees or a rotation.'},
 5:{story:'“Fruit, hens, goats and bees offer different ways to fill the table. We can choose a rhythm we have time to care for.”'},
 8:{after:'Gas stretches our cooking. Digestate still needs a day of curing before it feeds the soil. Now make room for everyone with a housing plan we can support.'},
 9:{story:'“Earth, bamboo and prepared parts all have a cost. Match our next home to the materials, money and time we can spare.”',after:'Everyone has a bed and a small fund remains. Next, make our evening light and household services dependable.'},
 10:{title:'Power Through the Evening',theme:'WORKING SERVICES',story:'“Stored sunshine, river power and shorter service trips can each make daily life easier. Choose what earns its place here.”',after:'Reliable services give us time back. Let us protect that time for the people who care for this village.'},
 12:{after:'Our thirteen chapters are complete. Keep shaping Vila Aurora at your own pace; the journal’s optional paths remain open.'},
};
export const quests=lessons.map((q,index)=>({...q,...revised[index],objectives:primary[index],options:extras[index]}));

export const unlockQuest = { grove:0, warehouse:0, orchard:0, goat_pasture:4, apiary:4, compost:1, eco_toilet:6, square:1, workshop:3, greenhouse:3, wetland:6, banana_treatment:6, coop:4, biodigester:7, solar_farm:5, hydro:9, streetlight:5 };
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
  if(objective?.action)return {type:objective.action,...(objective.page?{page:objective.page}:{})};
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
  if(!objective?.build)return objective?{type:"people"}:null;
  const kind=objective.build, buildings=state.village.buildings.filter(b=>b.kind===kind&&(!objective.recipe||state.village.economy.projects.some(p=>p.building===b.id&&p.recipe===objective.recipe)));
  const matches=p=>p.kind===kind&&(!objective.recipe||p.recipe===objective.recipe);
  const project=state.environment.economy.projects.find(p=>matches(p)&&!p.paused)||state.environment.economy.projects.find(matches);
  if(project)return {type:'project',id:project.building,project};
  if(buildings.filter(b=>b.progress>=100).length>=(objective.buildTarget??objective.target))return {type:'visit',id:buildings.find(b=>b.progress>=100).id};
  return {type:'plan',kind};
}
