//! Fresh-world construction. This path never repairs or restages a running save.
use crate::*;

impl Default for Village {
    fn default() -> Self {
        Self {
            scenario: None,
            mode: modes::Mode::Story,
            sandbox_rules: sandbox::Rules::default(),
            simulation: simulation::State::default(),
            climate: climate::State { enabled: true },
            maintenance: maintenance::State {
                enabled: true,
                automatic: true,
                ..Default::default()
            },
            logistics: None,
            navigation: None,
            workforce: workforce::State::default(),
            skills: skills::State::default(),
            market: market::State::default(),
            production: production::State::default(),
            freshness: freshness::State::default(),
            processes: processes::State::default(),
            land: land::State::default(),
            restoration: vec![],
            water_supply: water::State::default(),
            pipes: pipes::State::default(),
            activity_claims: Default::default(),
            workforce_peers: Default::default(),
            version: SAVE_VERSION,
            map_size: MAP_SIZE,
            camp: CAMP,
            minutes: 480.,
            wood: 32.,
            economy: economy::Economy::default(),
            food: 36.,
            supplies: supplies::Supplies::default(),
            power: power::Power::default(),
            circular: sanitation::Circular::default(),
            water: 32.,
            meals: 0,
            meals_served: 0,
            buildings: vec![],
            building_jobs: vec![],
            roads: vec![],
            events: vec!["Five friends, one empty lot. Your new beginning starts here.".into()],
            harvests: 0,
            seedlings: 0,
            arrived: false,
            mornings: 0,
            progress: Progress::default(),
            situations: situations::Situations::default(),
        }
    }
}

pub(crate) fn founding_residents(camp: (f32, f32)) -> Vec<Resident> {
    use resident_preferences::{BENTO_V1, CAUA_V1, IARA_V1, LUZ_V1, NINA_V1};
    let dx = camp.0 - CAMP.0;
    let dy = camp.1 - CAMP.1;
    [
        ("Iara", "Patient · gardener", "garden", IARA_V1),
        ("Bento", "Practical · builder", "build", BENTO_V1),
        ("Luz", "Sociable · cook", "cook", LUZ_V1),
        ("Cauã", "Curious · forager", "gather", CAUA_V1),
        ("Nina", "Thoughtful · caretaker", "water", NINA_V1),
    ]
    .into_iter()
    .enumerate()
    .map(
        |(id, (name, traits, favorite, routine_preferences))| Resident {
            id,
            name: name.into(),
            trait_name: traits.into(),
            favorite: favorite.into(),
            routine_preferences,
            energy: 88. - id as f32 * 3.,
            hunger: 22. + id as f32 * 3.,
            social: 70.,
            happiness: 75.,
            x: 7.5 + id as f32 * 1.25 + dx,
            y: 18.5 + id as f32 * 0.15 + dy,
            target_x: CAMP.0 + (id as f32 - 2.) * 1.25 + dx,
            target_y: CAMP.1 + dy,
            task: "arrive".into(),
            reason: "Walking into the clearing with our founding group.".into(),
            remaining: 0.,
            requested: false,
            work_check_at: 0.,
            help: None,
            activity_batch: None,
            activity_store: None,
            walking: walking::State::default(),
            last_meal_slot: -1,
            last_sanitation_day: -1,
            visit_building: None,
            activity_building: None,
            activity_material: None,
            trip: None,
            sleep: sleep::Routine::default(),
        },
    )
    .collect()
}

/// Domain state is assembled before the new ECS instance becomes observable.
pub(crate) fn create(village: Village, residents: Vec<Resident>) -> Result<Game, String> {
    build(village, residents, None).map_err(|report| report.issues[0].message.clone())
}

pub(crate) struct OpeningStore {
    pub owner: logistics::Owner,
    pub items: economy::Bundle,
    pub path: String,
}

pub(crate) fn create_authored(
    village: Village,
    residents: Vec<Resident>,
    opening: &[OpeningStore],
) -> Result<Game, scenarios::Report> {
    build(village, residents, Some(opening))
}

fn build(
    mut village: Village,
    residents: Vec<Resident>,
    opening: Option<&[OpeningStore]>,
) -> Result<Game, scenarios::Report> {
    use scenarios::Report;
    if !land::initialise(&mut village) {
        return Err(Report::error(
            "map",
            "invalid_land",
            "The starting land could not be initialized.",
        ));
    }
    if let Some(origin) = &village.scenario {
        let explicit_nature = origin.definition.map.nature.is_some();
        let clearings = origin.definition.map.clearings.clone();
        for c in clearings {
            if explicit_nature {
                land::disturb_soil(&mut village, c.size, c.x, c.y, c.disturbance);
            } else {
                land::disturb_plot(&mut village, c.size, c.x, c.y, c.disturbance);
            }
        }
        let buildings = village.buildings.clone();
        for b in buildings.iter().filter(|b| b.progress >= 100.) {
            land::disturb(&mut village, &b.kind, b.x, b.y);
        }
        for (x, y) in village.roads.clone() {
            land::disturb_plot(&mut village, 1, x, y, 0.18);
        }
    }
    if !logistics::initialise(&mut village) {
        return Err(Report::error(
            "start.inventories",
            "storage_capacity",
            "Starting supplies do not fit the available storage.",
        ));
    }
    production::sync(&mut village);
    if let Some(opening) = opening {
        for inventory in opening {
            let Some(store) = village
                .logistics
                .as_mut()
                .unwrap()
                .stores
                .iter_mut()
                .find(|p| p.owner == inventory.owner)
            else {
                return Err(Report::error(
                    &inventory.path,
                    "incompatible_store",
                    "This building does not provide the selected supply storage. Choose a completed storage house, pantry, or project site.",
                ));
            };
            if inventory.items.iter().sum::<u32>() > store.capacity {
                return Err(Report::error(
                    &inventory.path,
                    "storage_capacity",
                    "Reduce these supplies or assign them to additional storage.",
                ));
            }
            store.items = inventory.items;
            for (i, n) in store.items.into_iter().enumerate() {
                freshness::add(&mut store.food_lots, i, n, village.minutes);
            }
        }
        logistics::sync_totals(&mut village);
        if economy::storage(&village) > economy::capacity(&village) {
            return Err(Report::error(
                "start.inventories",
                "storage_capacity",
                "Add general storage or reduce the village's combined starting supplies.",
            ));
        }
        if !power::initialise(&mut village) {
            return Err(Report::error(
                "start.buildings",
                "invalid_equipment",
                "The starting electrical equipment could not be initialized.",
            ));
        }
    }
    simulation::start_materials(&mut village);
    if !water::initialise(&mut village) {
        return Err(Report::error(
            "start.fresh_water",
            "water_capacity",
            "Starting water does not fit compatible tanks.",
        ));
    }
    maintenance::sync(&mut village);
    let mut app = App::new();
    app.insert_resource(Step::default())
        .insert_resource(village)
        .insert_resource(devtools::Diagnostics::default())
        .add_systems(Update, (simulate, devtools::record).chain());
    for resident in residents {
        app.world_mut().spawn(resident);
    }
    Ok(Game { app })
}
