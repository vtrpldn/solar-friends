export const exampleAuthoringProfiles={
 'first-clearing':{id:'first-clearing',title:'First clearing',biome:'mata-atlantica',description:'Five friends arrive at a small clearing in Mata Atlântica. A shed keeps the rain off and a shared store holds their first supplies. Plan homes, a kitchen and a modest garden while leaving the surrounding forest room to grow. There is no deadline.',introduction:'We have a roof to gather under, a shared store and a property to learn. Start small: keep the camp legible, build homes close to everyday services and protect the forest beyond the clearing.',completion:'The clearing has become a place to live. Keep tending the garden, resting and adapting the village. This is a beginning, not a finished ecovila.',chapters:[
  {title:'A place to come home to',description:'Five friends need two homes. Keep walking distances short and leave room for shared services.',goals:[{title:'Room for everyone',description:'Complete two homes. Each houses three people; the shed does not provide beds. Standard homes need one solar panel and one battery each. Use Supplies to compare shortages with town purchases, or choose a supported local building recipe. Keep money for food and maintenance.',kind:'buildings',building:'home',count:2},{title:'A place to gather',description:'Optional: leave a square where paths meet, with room for a future community space.',kind:'buildings',building:'square',count:1,optional:true}]},
  {title:'A shared table',description:'Food begins with land, water and time. A small garden and kitchen are enough for the first experiment.',goals:[{title:'Plant the first garden',description:'Complete a garden near the kitchen and a reachable water supply. Avoid building over every fertile patch.',kind:'buildings',building:'garden',count:1},{title:'Cook together',description:'Complete a kitchen. Check supplies and access before asking residents to build.',kind:'buildings',building:'kitchen',count:1}]},
  {title:'Learn from the land',description:'Give the residents time to tend crops, harvest and rest. Expand only when the first plot is working.',goals:[{title:'Two real harvests',description:'Let residents complete two harvests during this village. Starting food does not count as growing it.',kind:'harvests',count:2}]},
  {title:'Find a comfortable rhythm',description:'The first success is a pantry that lasts while people live their lives.',goals:[{title:'Keep the pantry healthy',description:'Maintain the pantry outcome for an observed hour. Food reserves and resident hunger must both stay healthy; pauses do not add time.',kind:'maintain',outcome:'pantry',minutes:60}]},
 ]},
 'before-the-dry-season':{
  id:'before-the-dry-season',title:'Before the dry season',biome:'cerrado',
  description:'A new group arrives in a Cerrado clearing with seven wet-season days to prepare. Choose where to catch and store water, start a modest garden and protect a usable reserve before the dry season. The calendar is compressed for this scenario.',
  introduction:'Marina, Davi, Joana, Ravi and Cecília have pooled their savings. Rain will not last. A cistern is only useful if it contains reachable fresh water; a growing plot needs a water route too. Keep the cultivated area small until storage and daily routines work.',
  completion:'Our first reserve is ready. The dry season will still test our choices: keep watching water levels, soil moisture and the food reserve before expanding.',
  weather:{season_days:7,intro_days:0},deadline:{day:8,time:'00:00'},
  cast:[
   {name:'Marina',look:'iara',background:'grower',biography:'A seed saver who wants a small, well-tended garden before expanding into the clearing.'},
   {name:'Davi',look:'bento',background:'builder',biography:'A practical builder who checks missing materials and transport before committing the shared fund.'},
   {name:'Joana',look:'luz',background:'cook',biography:'A cook who plans meals around the food the group can actually grow and store.'},
   {name:'Ravi',look:'caua',background:'hauler',biography:'An experienced mover who wants short, clear routes between storage, water and work.'},
   {name:'Cecília',look:'nina',background:'caretaker',biography:'A maintenance-minded neighbour who keeps an eye on tanks, fittings and the water reserve.'},
  ],
  chapters:[
   {title:'Catch the wet season',description:'Place water storage early enough to catch rain. Short walking routes matter as much as nominal tank capacity.',goals:[
    {title:'A cistern for the clearing',description:'Complete a cistern near the camp and future plots. Its tank needs a pump and plumbing from town. Check material stages and order missing parts through Supplies before spending the fund elsewhere. A kitchen also needs plumbing.',kind:'buildings',building:'well',count:1},
    {title:'Beds for the group',description:'Optional: complete two homes. Standard rooftop power needs imported panels and batteries, so compare that cost with water and food priorities.',kind:'buildings',building:'home',count:2,optional:true},
   ]},
   {title:'Grow within the water budget',description:'A small plot is easier to support than a large irrigated area. Residents still need time for hauling, meals and rest.',goals:[
    {title:'One manageable garden',description:'Complete one garden with a clear approach and nearby water. Leave room to inspect its soil moisture and growing state.',kind:'buildings',building:'garden',count:1},
    {title:'Two harvested crops',description:'Let residents collect two real harvests. Starting food and purchased food do not count as growing it.',kind:'harvests',count:2},
   ]},
   {title:'Keep a usable reserve',description:'Empty capacity does not help through dry weather. Maintain fresh water that residents can actually reach.',goals:[
    {title:'Fresh water for tomorrow',description:'Keep at least 60 reachable fresh-water units available for two observed hours. Incoming loads, carried water and the neighbour’s service do not count. Check tanks, access and consumption before expanding.',kind:'service',service:'fresh_water',minimum:60,minutes:120},
   ]},
  ],
 },
};
