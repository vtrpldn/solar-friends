import {HOME_DESIGNS} from './home-designs.js';
// Design targets only; production and resource rules remain separate.
export const FUNCTIONAL_PROGRAM = {
  ...Object.fromEntries(HOME_DESIGNS.map(d=>[d.id,{site:d.site,shell:d.shell,targetUsableArea:null,capacity:{residents:d.beds},requirements:'Exterior shell only; no rooms or indoor furnishings. The grid site includes roof and access clearance; occupancy follows existing housing assumptions.'}])) ,
  "home-cottage": {
    "site": [
      4,
      4
    ],
    "shell": [
      6,
      6
    ],
    "targetUsableArea": null,
    "capacity": {
      "residents": 1
    },
    "requirements": "Exterior shell only; no modeled rooms or indoor furniture. Occupancy is a mechanics assumption, not a measured room capacity."
  },
  "home-longhouse": {
    "site": [
      7,
      4
    ],
    "shell": [
      12,
      6
    ],
    "targetUsableArea": null,
    "capacity": {
      "residents": 3
    },
    "requirements": "Exterior shell only; no modeled rooms or indoor furniture. Occupancy is a mechanics assumption, not a measured room capacity."
  },
  "groundwater-well": {
    "site": [
      2,
      2
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Keep human-scale wellhead and covered collection point; groundwater yield is independent of surface footprint."
  },
  "water-pump": {
    "site": [
      1,
      1
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Measured pump body plus service clearance; no enlargement to fill the cell."
  },
  "home-family": {
    "site": [
      6,
      5
    ],
    "shell": [
      10,
      8
    ],
    "targetUsableArea": null,
    "capacity": {
      "residents": 3
    },
    "requirements": "Exterior shell only; no modeled rooms or indoor furniture. Occupancy is a mechanics assumption, not a measured room capacity."
  },
  "home-shared": {
    "site": [
      6,
      6
    ],
    "shell": [
      10.5,
      9.5
    ],
    "targetUsableArea": null,
    "capacity": {
      "residents": 4
    },
    "requirements": "Exterior shell only; no modeled rooms or indoor furniture. Occupancy is a mechanics assumption, not a measured room capacity."
  },
  "road": {
    "site": [
      1,
      1
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Use measured object dimensions from the physical-scale audit; reserve working clearance separately. No uniform mesh scaling. Use the realistic narrow bridge directly; resource deposits represent exposed collection areas, not total underground volume."
  },
  "bridge": {
    "site": [
      8,
      1
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Use measured object dimensions from the physical-scale audit; reserve working clearance separately. No uniform mesh scaling. Use the realistic narrow bridge directly; resource deposits represent exposed collection areas, not total underground volume."
  },
  "house": {
    "site": [
      5,
      5
    ],
    "shell": [
      8,
      8
    ],
    "targetUsableArea": null,
    "capacity": {
      "residents": 2
    },
    "requirements": "Exterior shell only; no modeled rooms or indoor furniture. Occupancy is a mechanics assumption, not a measured room capacity."
  },
  "shed": {
    "site": [
      3,
      3
    ],
    "shell": [
      5,
      4
    ],
    "targetUsableArea": 19.5,
    "capacity": {},
    "requirements": "Human-height roof and posts, dry work surface and open movement through the structure."
  },
  "orchard": {
    "site": [
      5,
      5
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {
      "trees": 4
    },
    "requirements": "Initial design assumes compact cultivated trees on ~4m centers; species-dependent, mature crown spacing must be reviewed."
  },
  "goat_pasture": {
    "site": [
      6,
      5
    ],
    "shell": [
      3,
      3
    ],
    "targetUsableArea": null,
    "capacity": {
      "goats": 2
    },
    "requirements": "9m\u00b2 shelter plus outdoor pen, water/feed trough and gate; supplied feed or separately modeled grazing remains necessary."
  },
  "apiary": {
    "site": [
      2,
      2
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {
      "hiveBoxes": 3
    },
    "requirements": "Separate raised hive boxes and working access; species and forage constrain production, not reserved area."
  },
  "hydro": {
    "site": [
      3,
      3
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Turbine/generator housing, intake and maintenance access; power depends on head and flow, not site area."
  },
  "eco_toilet": {
    "site": [
      2,
      2
    ],
    "shell": [
      1.8,
      2.2
    ],
    "targetUsableArea": 2.5,
    "capacity": {
      "toilets": 1
    },
    "requirements": "Actual seated fixture, door opening, standing room and separate rear service access; no accessibility certification implied."
  },
  "banana_treatment": {
    "site": [
      3,
      4
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Separate engineered bed boundary from plant canopy; measure effective treatment area, not leaves."
  },
  "wetland": {
    "site": [
      3,
      5
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Show inlet, outlet, planted media and access. Record effective bed area; treatment capacity remains uncalibrated pending hydraulic loading."
  },
  "biodigester": {
    "site": [
      4,
      4
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Dimension reactor, feed inlet, gas handling and service path; record vessel volume and avoid claiming throughput from site area."
  },
  "warehouse": {
    "site": [
      5,
      4
    ],
    "shell": [
      8,
      6
    ],
    "targetUsableArea": 40,
    "capacity": {},
    "requirements": "Shelves, receiving space and clear aisle. Storage volume must later be derived from racks, not floor area alone."
  },
  "solar_farm": {
    "site": [
      4,
      4
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {
      "panels": 6
    },
    "requirements": "Model individual panels around1.1\u00d71.8m; retain row spacing, tilt and service access. Electrical output needs a separate rated-panel decision."
  },
  "streetlight": {
    "site": [
      1,
      1
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Use measured object dimensions from the physical-scale audit; reserve working clearance separately. No uniform mesh scaling. Use the realistic narrow bridge directly; resource deposits represent exposed collection areas, not total underground volume."
  },
  "kitchen": {
    "site": [
      6,
      5
    ],
    "shell": [
      10,
      8
    ],
    "targetUsableArea": 68,
    "capacity": {
      "cooks": 2,
      "diningSeats": 8
    },
    "requirements": "Separate preparation, cooking, washing, pantry and dining zones; access routes do not cross appliances."
  },
  "grove": {
    "site": [
      4,
      4
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {
      "clumps": 4
    },
    "requirements": "Approx3m between clump centers; accessible harvesting paths. Do not imply mature output immediately."
  },
  "garden": {
    "site": [
      4,
      6
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {
      "beds": 4
    },
    "requirements": "Four 1.2\u00d74m beds =19.2m\u00b2 planted; central/end circulation and working clearances shown explicitly."
  },
  "greenhouse": {
    "site": [
      4,
      6
    ],
    "shell": [
      6,
      10
    ],
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Two 1.2m-wide beds, central 1m aisle and end access; calculate planted area from final meshes."
  },
  "well": {
    "site": [
      3,
      3
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Dimension actual tank geometry, report geometric litres, separate clean/untreated storage and preserve maintenance access. Existing abstract water units require later calibration."
  },
  "compost": {
    "site": [
      3,
      2
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {
      "bays": 3
    },
    "requirements": "Three roughly1m\u00b3 bays and wheelbarrow access; output depends on actual feedstock."
  },
  "square": {
    "site": [
      5,
      5
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {
      "seats": 12
    },
    "requirements": "Human-sized seating, open gathering space and through circulation."
  },
  "workshop": {
    "site": [
      5,
      4
    ],
    "shell": [
      8,
      6
    ],
    "targetUsableArea": 39,
    "capacity": {
      "workstations": 2
    },
    "requirements": "Two 2\u00d70.85m benches, stock racks, assembly space and clear circulation; machine footprints only if machines are actually modeled."
  },
  "coop": {
    "site": [
      4,
      4
    ],
    "shell": [
      2,
      2
    ],
    "targetUsableArea": null,
    "capacity": {
      "hens": 6
    },
    "requirements": "4m\u00b2 coop with perches and nest boxes, separate run, feed/water and human cleaning access."
  },
  "home-veranda": {
    "site": [
      5,
      5
    ],
    "shell": [
      8,
      8
    ],
    "targetUsableArea": null,
    "capacity": {
      "residents": 2
    },
    "requirements": "Exterior shell only; no modeled rooms or indoor furniture. Occupancy is a mechanics assumption, not a measured room capacity."
  },
  "home-gable": {
    "site": [
      5,
      5
    ],
    "shell": [
      8,
      8
    ],
    "targetUsableArea": null,
    "capacity": {
      "residents": 2
    },
    "requirements": "Exterior shell only; no modeled rooms or indoor furniture. Occupancy is a mechanics assumption, not a measured room capacity."
  },
  "home-courtyard": {
    "site": [
      5,
      5
    ],
    "shell": [
      8,
      8
    ],
    "targetUsableArea": null,
    "capacity": {
      "residents": 2
    },
    "requirements": "Exterior shell only; no modeled rooms or indoor furniture. Occupancy is a mechanics assumption, not a measured room capacity."
  },
  "adobe-gable": {
    "site": [
      5,
      5
    ],
    "shell": [
      8,
      8
    ],
    "targetUsableArea": null,
    "capacity": {
      "residents": 2
    },
    "requirements": "Exterior shell only; no modeled rooms or indoor furniture. Occupancy is a mechanics assumption, not a measured room capacity."
  },
  "adobe-veranda": {
    "site": [
      5,
      5
    ],
    "shell": [
      8,
      8
    ],
    "targetUsableArea": null,
    "capacity": {
      "residents": 2
    },
    "requirements": "Exterior shell only; no modeled rooms or indoor furniture. Occupancy is a mechanics assumption, not a measured room capacity."
  },
  "goat-pasture-empty": {
    "site": [
      6,
      5
    ],
    "shell": [
      3,
      3
    ],
    "targetUsableArea": null,
    "capacity": {
      "goats": 2
    },
    "requirements": "9m\u00b2 shelter plus outdoor pen, water/feed trough and gate; supplied feed or separately modeled grazing remains necessary."
  },
  "supply-0": {
    "site": [
      6,
      6
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Four fast-growing timber trees at 3 m spacing on a 6 × 6 m plot, with 1.5 m boundary setbacks. Six favorable growing years per rotation; raw logs require processing."
  },
  "supply-1": {
    "site": [
      3,
      3
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Show mature clump extent and cutting access; canopy/roots are distinct from solid culms."
  },
  "supply-2": {
    "site": [
      1,
      1
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Use measured object dimensions from the physical-scale audit; reserve working clearance separately. No uniform mesh scaling. Use the realistic narrow bridge directly; resource deposits represent exposed collection areas, not total underground volume."
  },
  "supply-3": {
    "site": [
      1,
      1
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Use measured object dimensions from the physical-scale audit; reserve working clearance separately. No uniform mesh scaling. Use the realistic narrow bridge directly; resource deposits represent exposed collection areas, not total underground volume."
  },
  "supply-5": {
    "site": [
      1,
      1
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Use measured object dimensions from the physical-scale audit; reserve working clearance separately. No uniform mesh scaling. Use the realistic narrow bridge directly; resource deposits represent exposed collection areas, not total underground volume."
  },
  "supply-6": {
    "site": [
      1,
      1
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Use measured object dimensions from the physical-scale audit; reserve working clearance separately. No uniform mesh scaling. Use the realistic narrow bridge directly; resource deposits represent exposed collection areas, not total underground volume."
  },
  "rain-barrel": {
    "site": [
      1,
      1
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Use measured object dimensions from the physical-scale audit; reserve working clearance separately. No uniform mesh scaling. Use the realistic narrow bridge directly; resource deposits represent exposed collection areas, not total underground volume."
  },
  "tool-rack": {
    "site": [
      1,
      1
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Use measured object dimensions from the physical-scale audit; reserve working clearance separately. No uniform mesh scaling. Use the realistic narrow bridge directly; resource deposits represent exposed collection areas, not total underground volume."
  },
  "seedling-bench": {
    "site": [
      1,
      1
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Use measured object dimensions from the physical-scale audit; reserve working clearance separately. No uniform mesh scaling. Use the realistic narrow bridge directly; resource deposits represent exposed collection areas, not total underground volume."
  },
  "woodpile": {
    "site": [
      1,
      1
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Use measured object dimensions from the physical-scale audit; reserve working clearance separately. No uniform mesh scaling. Use the realistic narrow bridge directly; resource deposits represent exposed collection areas, not total underground volume."
  },
  "picnic-table": {
    "site": [
      2,
      2
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Use measured object dimensions from the physical-scale audit; reserve working clearance separately. No uniform mesh scaling. Use the realistic narrow bridge directly; resource deposits represent exposed collection areas, not total underground volume."
  },
  "garden-bench": {
    "site": [
      1,
      1
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Use measured object dimensions from the physical-scale audit; reserve working clearance separately. No uniform mesh scaling. Use the realistic narrow bridge directly; resource deposits represent exposed collection areas, not total underground volume."
  },
  "clothesline": {
    "site": [
      2,
      1
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Use measured object dimensions from the physical-scale audit; reserve working clearance separately. No uniform mesh scaling. Use the realistic narrow bridge directly; resource deposits represent exposed collection areas, not total underground volume."
  },
  "hammock": {
    "site": [
      2,
      1
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Use measured object dimensions from the physical-scale audit; reserve working clearance separately. No uniform mesh scaling. Use the realistic narrow bridge directly; resource deposits represent exposed collection areas, not total underground volume."
  },
  "wayfinding-sign": {
    "site": [
      1,
      1
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Use measured object dimensions from the physical-scale audit; reserve working clearance separately. No uniform mesh scaling. Use the realistic narrow bridge directly; resource deposits represent exposed collection areas, not total underground volume."
  },
  "wash-station": {
    "site": [
      1,
      1
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Use measured object dimensions from the physical-scale audit; reserve working clearance separately. No uniform mesh scaling. Use the realistic narrow bridge directly; resource deposits represent exposed collection areas, not total underground volume."
  },
  "farm-gate": {
    "site": [
      1,
      1
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Use measured object dimensions from the physical-scale audit; reserve working clearance separately. No uniform mesh scaling. Use the realistic narrow bridge directly; resource deposits represent exposed collection areas, not total underground volume."
  },
  "fire-circle": {
    "site": [
      1,
      1
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Use measured object dimensions from the physical-scale audit; reserve working clearance separately. No uniform mesh scaling. Use the realistic narrow bridge directly; resource deposits represent exposed collection areas, not total underground volume."
  },
  "canvas-tent-teal": {
    "site": [
      2,
      2
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Use measured object dimensions from the physical-scale audit; reserve working clearance separately. No uniform mesh scaling. Use the realistic narrow bridge directly; resource deposits represent exposed collection areas, not total underground volume."
  },
  "canvas-tent-ochre": {
    "site": [
      2,
      2
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Use measured object dimensions from the physical-scale audit; reserve working clearance separately. No uniform mesh scaling. Use the realistic narrow bridge directly; resource deposits represent exposed collection areas, not total underground volume."
  },
  "reading-room": {
    "site": [
      5,
      4
    ],
    "shell": [
      8,
      6
    ],
    "targetUsableArea": 40,
    "capacity": {
      "seats": 8
    },
    "requirements": "Bookshelves, reading tables, quiet seats and clear routes."
  },
  "outdoor-classroom": {
    "site": [
      5,
      5
    ],
    "shell": [
      8,
      8
    ],
    "targetUsableArea": 56,
    "capacity": {
      "learnerSeats": 12,
      "teachingPositions": 1
    },
    "requirements": "Human-scale seats/tables, teaching space and access aisles; roof posts cannot block seats."
  },
  "community-hall": {
    "site": [
      7,
      6
    ],
    "shell": [
      12,
      10
    ],
    "targetUsableArea": 100,
    "capacity": {
      "seatedCapacity": 24
    },
    "requirements": "Flexible tables/chairs, storage and clear entrances; capacity is a game design target, not occupancy certification."
  },
  "exercise-garden": {
    "site": [
      5,
      5
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {},
    "requirements": "Full-size bars and exercise stations with movement clearances; avoid overlapping activity zones."
  },
  "volleyball-court": {
    "site": [
      11,
      7
    ],
    "shell": null,
    "targetUsableArea": null,
    "capacity": {
      "players": 4
    },
    "requirements": "16\u00d78m playing area plus3m clear perimeter =22\u00d714m site; do not render it as a tiny decorative patch."
  }
};

// Player-facing summaries omit authoring instructions and uncalibrated rates.
export const FUNCTIONAL_DESCRIPTIONS = {
  shed: 'Open timber work shelter with a dry bench and space to move around it.',
  workshop: 'Two-person repair workshop with separate benches, an assembly table and stock racks.',
  kitchen: 'Community kitchen with two cooking positions, washing and pantry space, and dining for eight.',
  warehouse: 'Community storehouse with four shelving units, a receiving space and a central aisle.',
  'reading-room': 'Quiet reading room with shelves, two shared tables and eight seats.',
  'outdoor-classroom': 'Covered classroom with twelve seats, tables and a clear teaching area.',
  'community-hall': 'Open-front community hall with six tables and seating for twenty-four.',
  orchard: 'Four compact fruit trees spaced four metres apart, with access for tending and harvest.',
  grove: 'Four banana clumps spaced three metres apart, with harvesting paths between them.',
  garden: 'Four growing beds with central and end aisles. 19.2 square metres are planted.',
  greenhouse: 'Walk-in greenhouse with two long growing beds, a central aisle and access at both ends. 19.2 square metres are planted.',
  goat_pasture: 'Shelter and exercise pen for two goats, with a feeding trough and water. Grazing land is separate.',
  'goat-pasture-empty': 'Empty goat shelter and exercise pen, ready for two goats. Grazing land is separate.',
  coop: 'Six-hen coop with perches, nesting boxes, feed, water and an enclosed outdoor run.',
  apiary: 'Three raised stingless-bee hive boxes with space to inspect each colony.',
  solar_farm: 'Six ground-mounted solar panels in two rows, with space for maintenance.',
  banana_treatment: 'A 24-square-metre treatment bed with banana planting and separate inlet and outlet.',
  wetland: 'A 32-square-metre planted treatment bed with inlet, outlet and perimeter access.',
  compost: 'Three one-cubic-metre compost bays with a clear working area in front.',
  square: 'An open gathering square with twelve bench seats and room to pass through.',
  'exercise-garden': 'Outdoor exercise stations with separate spaces for bars, balance and stretching.',
  'volleyball-court': 'A 16 × 8 metre sand court with three metres of clear space around the playing area.',
  'supply-0': 'Four timber trees at 3 m spacing; a six-year minimum rotation yields raw logs, with four seedlings needed to replant.',
  'supply-1': 'A mature bamboo clump with cutting and carrying space around it.',
  eco_toilet: 'Single dry-toilet building with a human-sized doorway, ventilation and rear service access.',
};
