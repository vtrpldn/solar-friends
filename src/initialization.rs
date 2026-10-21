//! Fresh-world construction. This path never repairs or restages a running save.
use crate::*;

impl Default for Village {
    fn default() -> Self {
        Self {
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
            activity_claims: std::array::from_fn(|_| None),
            workforce_peers: std::array::from_fn(|_| None),
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
    let dx = camp.0 - CAMP.0;
    let dy = camp.1 - CAMP.1;
    [
        ("Iara", "Patient · gardener", "garden"),
        ("Bento", "Practical · builder", "build"),
        ("Luz", "Sociable · cook", "cook"),
        ("Cauã", "Curious · forager", "gather"),
        ("Nina", "Thoughtful · caretaker", "water"),
    ]
    .into_iter()
    .enumerate()
    .map(|(id, (name, traits, favorite))| Resident {
        id,
        name: name.into(),
        trait_name: traits.into(),
        favorite: favorite.into(),
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
    })
    .collect()
}

/// Domain state is assembled before the new ECS instance becomes observable.
pub(crate) fn create(mut village: Village, residents: Vec<Resident>) -> Result<Game, String> {
    simulation::start_materials(&mut village);
    if !land::initialise(&mut village) {
        return Err("The starting land could not be initialized.".into());
    }
    if !logistics::initialise(&mut village) {
        return Err("Starting supplies do not fit the available storage.".into());
    }
    production::sync(&mut village);
    if !water::initialise(&mut village) {
        return Err("Starting water does not fit compatible tanks.".into());
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
