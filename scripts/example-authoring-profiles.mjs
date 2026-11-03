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
  introduction:'Iara, Bento, Luz, Cauã and Nina have pooled their savings. Rain will not last. A cistern is only useful if it contains reachable fresh water; a growing plot needs a water route too. Keep the cultivated area small until storage and daily routines work.',
  completion:'Our first reserve is ready. The dry season will still test our choices: keep watching water levels, soil moisture and the food reserve before expanding.',
  weather:{season_days:7,intro_days:0},deadline:{day:8,time:'00:00'},
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
 'an-inherited-village':{
  id:'an-inherited-village',title:'An inherited village',biome:'caatinga',
  description:'An established Caatinga property has homes, food plots and useful equipment, but its pump and shared battery have failed. The founding friends have taken responsibility for the property. Inspect what is already here, service it with real parts and make everyday water, sanitation and lighting dependable.',
  introduction:'We inherited buildings, not a working system. The cistern holds water but its pump needs service; the solar battery is also failed. Open Buildings to inspect equipment jobs, and Supplies to obtain tools and missing service parts. Keep the paths and utility lines clear before expanding.',
  completion:'The inherited village works again: reachable water, usable sanitation, food and a lit path. Keep watching equipment condition and the water reserve as dry weather continues. Repair and care remain part of daily life.',
  freshWater:100,
  inheritedBuildings:[['home',27,32],['home',28,36],['well',35,33],['kitchen',32,36],['garden',35,36],['solar_farm',25,29],['streetlight',31,34],['workshop',25,36],['eco_toilet',39,34],['banana_treatment',39,37]],
  routes:[{kind:'fresh',from:'35, 33',to:'32, 36'},{kind:'fresh',from:'35, 33',to:'39, 34'},{kind:'sewage',from:'39, 34',to:'39, 37'},{kind:'electricity',from:'25, 29',to:'31, 34'},{kind:'electricity',from:'25, 29',to:'Fresh water pump',toOccurrence:0},{kind:'electricity',from:'25, 29',to:'Fresh water pump',toOccurrence:1}],
  equipment:[{label:'Water pump',condition:0,occurrence:0},{label:'Water pump',condition:0,occurrence:1},{label:'Battery system · 25, 29',condition:0}],
  chapters:[
   {title:'Inspect before expanding',description:'The buildings already exist. Find the failed pump and shared battery, obtain their service kits and allow residents to do the work.',goals:[
    {title:'Reachable fresh water',description:'Maintain 30 reachable fresh-water units for one observed hour. An inaccessible or empty tank does not help. Service the failed water pump; its kit uses fittings, plumbing and a tool.',kind:'service',service:'fresh_water',minimum:30,minutes:60},
   ]},
   {title:'Restore the evening path',description:'The inherited cable connects the solar farm and streetlight. Daytime generation alone cannot keep the path lit at night.',goals:[
    {title:'A dependable night light',description:'Keep one connected streetlight fully lit for one observed hour after dark. The shared battery needs resident service, electrical parts and a tool. Order tools through Supplies if local preparation cannot provide them yet.',kind:'service',service:'night_lights',minimum:1,minutes:60},
   ]},
   {title:'Keep daily routines working',description:'Food and sanitation need physical supplies, local access and capacity. Starting structures do not grant service history.',goals:[
    {title:'A usable ecological toilet',description:'Maintain a reachable ecological toilet for one observed hour, with fresh handwashing water and room for greywater and sewage. The inherited sewage route leads to a banana treatment bed; it produces no edible bananas.',kind:'service',service:'toilets',minimum:1,minutes:60},
    {title:'Food people can reach',description:'Maintain at least 12 accessible edible portions for one observed hour. Incoming orders, carried cargo and eggs needing cooking do not count.',kind:'service',service:'food',minimum:12,minutes:60},
   ]},
  ],
 },
};
