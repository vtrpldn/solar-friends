use super::*;

pub(super) fn check(d: &Definition) -> Report {
    let mut r = Report::default();
    super::map_validation::check(&d.map, &mut r);
    journal::check(d, &mut r);
    story_adapter::check(d, &mut r);
    residents::check(d, &mut r);
    relationships::check(d, &mut r);
    experience::check(d, &mut r);
    if d.format != FORMAT || d.schema != SCHEMA {
        r.push(
            "schema",
            "unsupported_format",
            "This scenario format is not supported.",
        );
    }
    if !valid_key(&d.id) || d.revision == 0 {
        r.push(
            "id",
            "invalid_identity",
            "Give this creation a valid identity and revision.",
        );
    }
    if d.title.trim().is_empty()
        || d.title.chars().count() > 100
        || d.description.chars().count() > 2000
    {
        r.push(
            "title",
            "invalid_title",
            "Use a title of up to 100 characters and a description of up to 2,000 characters.",
        );
    }
    if d.rules.weather.as_ref().is_some_and(|p| !p.valid()) {
        r.push("rules.weather", "invalid_weather", "Use a 7–90 day season, 0–100 percent rain chances, 0.5–2 drying factors and at most 14 days of beginner weather.");
    }
    if !d.start.minutes.is_finite() || !(0.0..=5_000_000.).contains(&d.start.minutes) {
        r.push(
            "start.minutes",
            "invalid_date",
            "Choose a valid starting date and time.",
        );
    }
    if !(0..=1_000_000_000).contains(&d.start.funds) {
        r.push(
            "start.funds",
            "invalid_funds",
            "Starting funds must be within the supported range.",
        );
    }
    if !d.start.fresh_water.is_finite() || !(0.0..=20_000.).contains(&d.start.fresh_water) {
        r.push(
            "start.fresh_water",
            "invalid_water",
            "Choose a valid amount of starting fresh water.",
        );
    }
    super::liquids::check(d, &mut r);
    super::farming::check(d, &mut r);
    super::orchards::check(d, &mut r);
    super::animals::check(d, &mut r);
    super::batteries::check(d, &mut r);
    super::routes::check(d, &mut r);
    super::equipment::check(d, &mut r);
    super::recovery::check(d, &mut r);
    super::arrival::check(d, &mut r);
    super::sites::check(d, &mut r);
    if d.start.buildings.len() > MAX_BUILDINGS
        || d.start.roads.len() > (MAP_SIZE * MAP_SIZE) as usize
    {
        r.push(
            "start.buildings",
            "too_many_objects",
            "This property contains more buildings or roads than this game version supports.",
        );
    }
    let mut ids = HashSet::new();
    for (i, b) in d.start.buildings.iter().enumerate().take(MAX_BUILDINGS + 1) {
        let path = format!("start.buildings.{i}");
        if !valid_key(&b.id) || !ids.insert(&b.id) {
            r.push(
                &path,
                "duplicate_building",
                "Each starting building needs its own identity.",
            );
        }
        if !progression::BUILDINGS.contains(&b.kind.as_str())
            || !matches!(b.recipe.as_str(), "standard" | "local" | "adobe")
            || economy::recipe(&b.kind, &b.recipe).is_none()
        {
            r.push(
                &path,
                "unknown_building",
                "Choose a supported building and construction recipe.",
            );
        }
        if !(1..MAP_SIZE - 1).contains(&b.x) || !(1..MAP_SIZE - 1).contains(&b.y) {
            r.push(
                &path,
                "building_outside_map",
                "Keep this building inside the property.",
            );
        }
        if let Some(key) = &b.appearance {
            let index = HOME_APPEARANCES.iter().position(|s| *s == key);
            if b.kind != "home"
                || index.is_none()
                || index.is_some_and(|n| (n >= 4) != (b.recipe == "adobe"))
            {
                r.push(
                    &path,
                    "invalid_appearance",
                    "Choose an appearance compatible with this house's wall recipe.",
                );
            }
        }
    }
    if d.start.inventories.len() > MAX_BUILDINGS + 1 {
        r.push(
            "start.inventories",
            "too_many_stores",
            "There are too many starting supply locations.",
        );
    }
    let mut owners = HashSet::new();
    for (i, p) in d
        .start
        .inventories
        .iter()
        .enumerate()
        .take(MAX_BUILDINGS + 2)
    {
        let path = format!("start.inventories.{i}");
        let key = match &p.owner {
            InventoryOwner::Camp => "camp".to_string(),
            InventoryOwner::Building(key) => {
                if !d.start.buildings.iter().any(|b| b.id == *key) {
                    r.push(
                        &path,
                        "missing_store",
                        "This supply location refers to a building that is missing.",
                    );
                }
                format!("building:{key}")
            }
        };
        if !owners.insert(key) {
            r.push(
                &path,
                "duplicate_store",
                "List each starting supply location only once.",
            );
        }
        if !super::supplies::valid_food(p, d.start.minutes) {
            r.push(&path,"invalid_starting_food","Food batches need perishable materials, positive quantities that fit their stock, and supported ages shorter than the food’s shelf life. Unspecified units start fresh.");
        }
        if p.items.len() > economy::COUNT
            || p.items
                .iter()
                .any(|(key, n)| !economy::NAMES.contains(&key.as_str()) || *n > economy::CAPACITY)
        {
            r.push(
                &path,
                "invalid_material",
                "Choose known supplies in amounts that fit their storage.",
            );
        }
    }
    r
}

fn placement_issue(path: &str, b: &Structure, reason: &str) -> Report {
    let mut report = Report::error(path, "invalid_placement", reason);
    report.issues[0].at = Some([b.x, b.y]);
    report.issues[0].entity = Some(b.id.clone());
    report
}

pub(super) fn build(d: Definition) -> Result<(Game, Report), Report> {
    let mut report = check(&d);
    if report.has_errors() {
        return Err(report);
    }
    let mut v = Village {
        mode: d.rules.mode,
        camp: (d.map.camp[0] as f32, d.map.camp[1] as f32),
        minutes: d.start.minutes,
        wood: 0.,
        food: 0.,
        water: if d.start.liquids.is_some() {
            0.
        } else {
            d.start.fresh_water
        },
        climate: climate::State {
            enabled: d.rules.climate,
        },
        skills: skills::State {
            enabled: d.rules.learning,
            ..Default::default()
        },
        market: market::State {
            enabled: d.rules.market,
            ..Default::default()
        },
        maintenance: maintenance::State {
            enabled: d.rules.maintenance,
            automatic: d.rules.maintenance,
            ..Default::default()
        },
        sandbox_rules: sandbox::Rules {
            logistics: d.rules.logistics,
            land: d.rules.land,
            utilities: d.rules.utilities,
            supplied_energy: 0.,
        },
        economy: economy::Economy {
            stock: [0; economy::COUNT],
            money: d.start.funds,
            ledger: vec![economy::Entry {
                minute: d.start.minutes,
                amount: d.start.funds,
                note: "Starting community fund".into(),
            }],
            ..Default::default()
        },
        events: vec![d.description.clone()],
        ..Default::default()
    };
    v.scenario = Some(std::sync::Arc::new(Origin {
        schema: SCHEMA,
        batteries: BTreeMap::new(),
        routes: BTreeMap::new(),
        definition: d.clone(),
        buildings: BTreeMap::new(),
        residents: residents::bindings(&d),
    }));
    v.simulation.seed = d.map.seed;
    v.economy.land = land::opening_reserves(&v);
    let mut buildings = BTreeMap::new();
    for (i, b) in d.start.buildings.iter().enumerate() {
        let path = format!("start.buildings.{i}");
        if let Err(reason) = building_work::placement(&v, &b.kind, b.x, b.y, None) {
            return Err(placement_issue(&path, b, reason));
        }
        let completed = b.state == BuildingState::Completed;
        let id = v.economy.next_building;
        v.economy.next_building += 1;
        buildings.insert(b.id.clone(), id);
        v.buildings.push(Building {
            id,
            kind: b.kind.clone(),
            x: b.x,
            y: b.y,
            progress: if completed { 100. } else { 0. },
            contributors: crate::participation::Set::new(),
            next_visit: 0.,
            visits: 0,
            crop: b
                .crop
                .as_ref()
                .map_or_else(Default::default, |c| super::farming::resolve(c, &b.kind)),
            poultry: crate::supplies::Poultry {
                remaining: if b.kind == "coop" {
                    b.animals.as_ref().map_or(0., |a| a.care_remaining)
                } else {
                    0.
                },
            },
            agriculture: b.orchard.as_ref().map_or_else(
                || {
                    b.animals.as_ref().map_or_else(Default::default, |a| {
                        super::animals::resolve(a, &b.kind, d.start.minutes)
                    })
                },
                super::orchards::resolve,
            ),
        });
        if !completed || b.kind == "home" || b.recipe != "standard" {
            let appearance = b
                .appearance
                .as_ref()
                .and_then(|key| HOME_APPEARANCES.iter().position(|s| *s == key))
                .unwrap_or(if b.recipe == "adobe" {
                    4
                } else if b.kind == "home" && b.recipe == "local" {
                    1
                } else {
                    0
                }) as u8;
            v.economy.projects.push(economy::Project {
                building: id,
                recipe: b.recipe.clone(),
                appearance: Some(appearance),
                priority: 1,
                paused: false,
                stage: if completed {
                    economy::recipe(&b.kind, &b.recipe).unwrap().len()
                } else {
                    0
                },
                labour: 0.,
                committed: false,
                reserved: [0; economy::COUNT],
                consumed: [0; economy::COUNT],
            });
        }
    }
    let mut roads = HashSet::new();
    for (i, &[x, y]) in d.start.roads.iter().enumerate() {
        let reason = if !(1..MAP_SIZE - 1).contains(&x) || !(1..MAP_SIZE - 1).contains(&y) {
            Some("Keep road tiles inside the property, one cell away from the map edge.")
        } else if world::bank(&v, x, y) {
            Some("Choose dry land away from the riverbank for this road.")
        } else if !roads.insert([x, y]) {
            Some("This road cell is listed more than once. Keep one tile per cell.")
        } else if v.buildings.iter().any(|b| interactions::occupies(b, x, y)) {
            Some("Keep each road tile on clear land beside buildings.")
        } else {
            None
        };
        if let Some(reason) = reason {
            let mut error = Report::error(
                &format!("start.roads.{i}"),
                "invalid_road",
                reason,
            );
            error.issues[0].at = Some([x, y]);
            return Err(error);
        }
        v.roads.push((x, y));
    }
    let mut opening = vec![];
    for (i, inventory) in d.start.inventories.iter().enumerate() {
        let building = match &inventory.owner {
            InventoryOwner::Camp => None,
            InventoryOwner::Building(key) => Some(buildings[key]),
        };
        let items =
            std::array::from_fn(|i| inventory.items.get(economy::NAMES[i]).copied().unwrap_or(0));
        opening.push(initialization::OpeningStore {
            building,
            items,
            food_lots: super::supplies::resolved_food(inventory, d.start.minutes),
            path: format!("start.inventories.{i}"),
        });
    }
    v.scenario = Some(std::sync::Arc::new(Origin {
        schema: SCHEMA,
        batteries: BTreeMap::new(),
        routes: BTreeMap::new(),
        definition: d.clone(),
        buildings,
        residents: residents::bindings(&d),
    }));
    let mut residents = residents::create(&d, &mut v);
    residents::apply(&d, &mut residents, &mut v);
    relationships::apply(&d, &mut v);
    navigation::refresh(&mut v);
    super::arrival::apply(&d, &mut residents, &v);
    super::arrival::validate_positions(&d, &residents, &v)?;
    for resident in &residents {
        if !navigation::clear(&v, resident.x, resident.y)
            || !navigation::clear(&v, resident.target_x, resident.target_y)
            || navigation::route(
                &v,
                [resident.x, resident.y],
                [resident.target_x, resident.target_y],
            )
            .is_err()
        {
            return Err(Report::error(
                "map.camp",
                "blocked_arrival",
                "Leave a clear route from the group's arrival positions to their camp.",
            ));
        }
    }
    let opening_people = residents.clone();
    let mut game = initialization::create_authored(v, residents, &opening)?;
    super::farming::initialize_ground(&mut game.app.world_mut().resource_mut::<Village>());
    super::orchards::initialize_ground(&mut game.app.world_mut().resource_mut::<Village>());
    journal::initialize(&mut game.app.world_mut().resource_mut::<Village>());
    journal::observe(
        &mut game.app.world_mut().resource_mut::<Village>(),
        &opening_people,
    );
    {
        let v = game.app.world().resource::<Village>();
        if v.water_supply
            .tanks
            .iter()
            .any(|p| p.owner == water::Owner::Ground)
        {
            return Err(Report::error(
                "start.fresh_water",
                "water_capacity",
                "Add compatible water storage or reduce the starting water amount.",
            ));
        }
        super::setup::review(v, &d, &opening_people, &mut report);
        let residents = game
            .app
            .world_mut()
            .query::<&Resident>()
            .iter(game.app.world())
            .cloned()
            .collect();
        let save = Save {
            village: game.app.world().resource::<Village>().clone(),
            residents,
        };
        if persistence::validate(save).is_none() {
            return Err(Report::error(
                "start",
                "invalid_start",
                "The starting setup does not satisfy the village's resource, access, or equipment rules.",
            ));
        }
    }
    report.ok = true;
    Ok((game, report))
}
