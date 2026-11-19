use crate::{
    resident_animation::Motion,
    weather::{DAY, HOUR},
};

use super::{resident_work::approach_points, *};

#[derive(Deserialize, Serialize)]
pub(super) struct Upkeep {
    pub(super) automatic: bool,
    budget: u64,
    day: u64,
    used: u64,
    #[serde(default)]
    restock_budget: u64,
    #[serde(default)]
    restock_used: u64,
    #[serde(skip)]
    next_restock: f64,

    assets: BTreeMap<usize, Asset>,
    jobs: BTreeMap<usize, Service>,
    #[serde(default)]
    vehicles: [Vehicle; 2],
    #[serde(default)]
    next_vehicle: usize,
}

impl Default for Upkeep {
    fn default() -> Self {
        Self {
            automatic: true,
            budget: 10_000,
            day: 0,
            used: 0,
            restock_budget: 0,
            restock_used: 0,
            next_restock: 0.0,
            assets: BTreeMap::new(),
            jobs: BTreeMap::new(),
            vehicles: std::array::from_fn(|_| Vehicle::default()),
            next_vehicle: 0,
        }
    }
}

#[derive(Deserialize, Serialize)]
struct Vehicle {
    condition: f64,
    kilometers: u64,
    service: Option<Service>,
}

impl Default for Vehicle {
    fn default() -> Self {
        Self {
            condition: 100.0,
            kilometers: 0,
            service: None,
        }
    }
}

#[derive(Clone, Copy)]
enum Target {
    Building(usize),
    Vehicle(usize),
}

#[derive(Deserialize, Serialize)]
struct Asset {
    condition: f64,
    age: f64,
    battery_age: f64,
}

impl Default for Asset {
    fn default() -> Self {
        Self {
            condition: 100.0,
            age: 0.0,
            battery_age: 0.0,
        }
    }
}

#[derive(Clone, Copy, Deserialize, Serialize)]
enum Kind {
    Service,
    Battery,
    Replacement,
    Soil,
}

impl Kind {
    fn duration(self) -> f64 {
        match self {
            Self::Service => 240.0,
            Self::Battery => 360.0,
            Self::Replacement => 1800.0,
            Self::Soil => 60.0,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Service => "Servicing equipment",
            Self::Battery => "Replacing batteries",
            Self::Replacement => "Replacing worn parts",
            Self::Soil => "Amending soil",
        }
    }
}

#[derive(Deserialize, Serialize)]
struct Service {
    kind: Kind,
    worker: Option<usize>,
    parts_paid: bool,
    work: f64,
}

impl Upkeep {
    pub(super) fn valid(&self, count: usize) -> bool {
        self.next_vehicle < self.vehicles.len()
            && self.vehicles.iter().all(|vehicle| {
                (0.0..=100.0).contains(&vehicle.condition)
                    && vehicle.service.as_ref().is_none_or(|job| {
                        matches!(job.kind, Kind::Service)
                            && (0.0..=job.kind.duration()).contains(&job.work)
                            && job.worker.is_none_or(|id| id < 5)
                    })
            })
            && self.budget <= 10_000_000
            && self.used <= 10_000_000
            && self.restock_budget <= 10_000_000
            && self.restock_used <= 10_000_000
            && self.assets.iter().all(|(&id, asset)| {
                id < count
                    && (0.0..=100.0).contains(&asset.condition)
                    && asset.age.is_finite()
                    && asset.age >= 0.0
                    && asset.battery_age.is_finite()
                    && asset.battery_age >= 0.0
            })
            && self.jobs.iter().all(|(&id, job)| {
                id < count
                    && (0.0..=job.kind.duration()).contains(&job.work)
                    && job.worker.is_none_or(|index| index < 5)
            })
    }

    pub(super) fn remove(&mut self, index: usize) {
        self.assets.remove(&index);
        self.jobs.remove(&index);
    }

    pub(super) fn servicing(&self, index: usize) -> bool {
        self.jobs
            .get(&index)
            .is_some_and(|job| job.worker.is_some() || job.parts_paid)
    }

    fn activity(&self, index: usize) -> Option<&Service> {
        self.services().find(|job| job.worker == Some(index))
    }
    fn services(&self) -> impl Iterator<Item = &Service> {
        self.jobs.values().chain(
            self.vehicles
                .iter()
                .filter_map(|vehicle| vehicle.service.as_ref()),
        )
    }

    pub(super) fn trip_vehicles(&self) -> impl Iterator<Item = usize> {
        [self.next_vehicle, 1 - self.next_vehicle]
            .into_iter()
            .filter(|&index| {
                let vehicle = &self.vehicles[index];
                vehicle.condition > 10.0
                    && vehicle
                        .service
                        .as_ref()
                        .is_none_or(|job| job.worker.is_none() && !job.parts_paid)
            })
    }

    pub(super) fn dispatch_vehicle(&mut self, vehicle: usize) {
        self.next_vehicle = 1 - vehicle;
    }

    pub(super) fn record_distance(&mut self, index: usize, kilometers: u32) {
        let car = &mut self.vehicles[index];
        car.kilometers = car.kilometers.saturating_add(u64::from(kilometers));
        car.condition = (car.condition - f64::from(kilometers) * 30.0 / 5000.0).max(0.0);
    }
}

impl Construction {
    pub fn toggle_automatic_upkeep(&mut self) {
        self.upkeep.automatic = !self.upkeep.automatic;
    }

    pub fn adjust_upkeep_budget(&mut self, restock: bool, increase: bool) {
        let budget = if restock {
            &mut self.upkeep.restock_budget
        } else {
            &mut self.upkeep.budget
        };
        *budget = if increase {
            (*budget + 2_500).min(10_000_000)
        } else {
            budget.saturating_sub(2_500)
        };
    }

    pub fn upkeep_input(&mut self, keys: &ButtonInput<KeyCode>) {
        if keys.just_pressed(KeyCode::KeyT) {
            self.toggle_automatic_upkeep();
        }
        if keys.any_just_pressed([KeyCode::BracketLeft, KeyCode::BracketRight]) {
            self.adjust_upkeep_budget(
                keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]),
                !keys.just_pressed(KeyCode::BracketLeft),
            );
        }
    }

    pub(super) fn restock_upkeep(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        land: &Land,
        clock: TownClock,
    ) {
        let remaining = self
            .upkeep
            .restock_budget
            .saturating_sub(self.upkeep.restock_used);
        if stock.sandbox || remaining == 0 || clock.seconds < self.upkeep.next_restock {
            return;
        }
        self.upkeep.next_restock = clock.seconds + 10.0;
        let local_forage = self.gathering.orders.keys().any(|&id| {
            land.site(id)
                .is_some_and(|site| site.recipe() == "gather-wild-forage")
        });
        let mut supplies = Vec::new();
        if !local_forage {
            for (&index, pen) in &self.livestock.animals {
                let project = &catalog.projects[&self.plans[index].key];
                let ration = &catalog.animal_rations[&project.kind];
                if self.utilities.enabled(index)
                    && !self.changes.contains_key(&index)
                    && pen.fed_days(ration) <= 0.25
                {
                    supplies.push(("fodder".to_owned(), ration.fodder));
                }
            }
        }
        if self.upkeep.automatic {
            for (&index, job) in &self.upkeep.jobs {
                if !job.parts_paid && !matches!(job.kind, Kind::Soil) {
                    supplies.extend(parts(
                        job.kind,
                        Some(&catalog.projects[&self.plans[index].key]),
                        catalog,
                    ));
                }
            }
            for job in self
                .upkeep
                .vehicles
                .iter()
                .filter_map(|car| car.service.as_ref())
            {
                if !job.parts_paid {
                    supplies.extend(parts(job.kind, None, catalog));
                }
            }
        }
        let freight = self.supplier_construction;
        let transport = if freight {
            crate::market::freight_cents(clock.round_trip_km)
        } else if self.sale_trip_for_return_purchase().is_some() {
            0
        } else {
            crate::market::fare_cents(clock.round_trip_km)
        };
        for (id, units) in supplies {
            let item = &catalog.materials[&id];
            let cost = (item.price * 100.0).round() as u64 + transport;
            if stock.available(&id) >= units
                || item.pack == 0
                || cost > remaining
                || self
                    .trade
                    .orders
                    .iter()
                    .any(|order| order.buying && order.material == id)
                || self
                    .trade
                    .delivery
                    .as_ref()
                    .is_some_and(|order| order.material == id)
                || self
                    .production
                    .jobs
                    .iter()
                    .any(|job| catalog.production[&job.recipe].output.contains_key(&id))
            {
                continue;
            }
            if self
                .buy_from_town(catalog, stock, clock, &id, freight)
                .is_ok()
            {
                self.upkeep.restock_used += cost;
                self.record_event(
                    clock.seconds,
                    format!("Ordered {} for maintenance and animal care.", item.name),
                );
                break;
            }
        }
    }

    pub(super) fn service_materials<'a>(
        &'a self,
        catalog: &'a Catalog,
    ) -> impl Iterator<Item = BTreeMap<String, u32>> + 'a {
        self.upkeep
            .jobs
            .iter()
            .filter(|(_, job)| job.parts_paid)
            .map(|(&index, job)| {
                parts(
                    job.kind,
                    Some(&catalog.projects[&self.plans[index].key]),
                    catalog,
                )
            })
            .chain(self.upkeep.vehicles.iter().filter_map(|vehicle| {
                let job = vehicle.service.as_ref()?;
                job.parts_paid.then(|| parts(job.kind, None, catalog))
            }))
    }

    pub fn upkeep_status(&self, catalog: &Catalog) -> String {
        let u = &self.upkeep;
        let setting = if u.automatic { "on" } else { "off" };
        let mut text = format!(
            "Maintenance · Automatic {setting} · T Switch\nR${:.0} / R${:.0} parts today · [ ] Budget\nR${:.0} / R${:.0} restocking today · Shift+[ ] Budget",
            u.used as f64 / 100.0,
            u.budget as f64 / 100.0,
            u.restock_used as f64 / 100.0,
            u.restock_budget as f64 / 100.0,
        );
        for (index, car) in u.vehicles.iter().enumerate() {
            let service = car.service.as_ref().map_or_else(String::new, |job| {
                if job.parts_paid {
                    format!(" · service {:.0}%", job.work / job.kind.duration() * 100.0)
                } else {
                    " · service queued".into()
                }
            });
            text.push_str(&format!(
                "\nVehicle {} · {:.0}% condition · {} km{service}",
                index + 1,
                car.condition,
                car.kilometers
            ));
        }
        for (&index, job) in u.jobs.iter().take(6) {
            let name = &catalog.projects[&self.plans[index].key].name;
            let status = if job.worker.is_some() {
                format!("{:.0}% complete", job.work / job.kind.duration() * 100.0)
            } else {
                "Awaiting worker, parts, or budget".into()
            };
            text.push_str(&format!(
                "\n{name} #{} · {} · {status}",
                index + 1,
                job.kind.label()
            ));
        }
        if let Some(index) = self.production.selected
            && let Some(asset) = u.assets.get(&index)
        {
            text.push_str(&format!(
                "\nSelected · Condition {:.0}% · Age {:.1} years · Battery {:.1} years",
                asset.condition,
                asset.age / 365.0,
                asset.battery_age / 365.0
            ));
        }
        text
    }

    pub(super) fn working_upkeep(&self, worker: usize) -> bool {
        self.upkeep.activity(worker).is_some()
    }

    pub(super) fn service_motion(&self, worker: usize) -> Option<Motion> {
        self.upkeep.activity(worker).map(|job| {
            if self.residents[worker].path.is_empty() {
                Motion::Work
            } else if job.parts_paid {
                Motion::CarryWalk
            } else {
                Motion::Walk
            }
        })
    }

    pub(super) fn service_activity(&self, worker: usize) -> Option<&'static str> {
        self.upkeep.activity(worker).map(|job| job.kind.label())
    }

    pub(super) fn age_assets(&mut self, catalog: &Catalog, clock: f64, dt: f64) {
        let day = ((clock + 9.0 * HOUR) / DAY).floor() as u64;
        if self.upkeep.day != day {
            self.upkeep.day = day;
            self.upkeep.used = 0;
            self.upkeep.restock_used = 0;
        }
        if self.upkeep.automatic {
            for vehicle in &mut self.upkeep.vehicles {
                if vehicle.condition < 70.0 && vehicle.service.is_none() {
                    vehicle.service = Some(Service {
                        kind: Kind::Service,
                        worker: None,
                        parts_paid: false,
                        work: 0.0,
                    });
                }
            }
        }
        for (index, plan) in self.plans.iter().enumerate() {
            let def = &catalog.projects[&plan.key];
            if plan.removed || plan.work < def.work || self.changes.contains_key(&index) {
                continue;
            }
            let interval = match def.kind.as_str() {
                "home" | "shed" | "warehouse" | "groundwater-well" => 365.0,
                "kitchen" | "workshop" | "well" | "solar_farm" | "greenhouse" => 180.0,
                "water-pump" | "hydro" => 90.0,
                _ => 0.0,
            };
            let replacement_years = match def.kind.as_str() {
                "water-pump" | "well" => 10.0,
                "home" | "shed" | "warehouse" | "kitchen" => 20.0,
                "solar_farm" => 25.0,
                _ => 0.0,
            };
            let battery = def.materials.get("batteries").copied().unwrap_or(0) as f64
                + if self.utilities.has_rooftop_solar(index) {
                    1.0
                } else {
                    0.0
                };
            let poor_soil = self
                .production
                .growing_sites
                .get(&index)
                .is_some_and(|soil| soil.fertility < 0.7);
            if interval <= 0.0 && battery <= 0.0 && !poor_soil {
                continue;
            }
            let asset = self.upkeep.assets.entry(index).or_default();
            if interval > 0.0 {
                asset.condition = (asset.condition - dt / DAY * 30.0 / interval).max(0.0);
            }
            if replacement_years > 0.0 {
                asset.age += dt / DAY;
            }
            if battery > 0.0 {
                asset.battery_age += dt / DAY;
            }
            self.utilities.update_condition(
                index,
                (asset.condition / 40.0).min(1.0),
                battery * 4.0 * (1.0 - asset.battery_age / (8.0 * 365.0) * 0.2).max(0.8),
            );
            let kind = if self.upkeep.automatic
                && replacement_years > 0.0
                && asset.age >= replacement_years * 365.0
            {
                Kind::Replacement
            } else if self.upkeep.automatic && asset.battery_age >= 8.0 * 365.0 {
                Kind::Battery
            } else if poor_soil {
                Kind::Soil
            } else if self.upkeep.automatic && asset.condition < 70.0 {
                Kind::Service
            } else {
                continue;
            };
            self.upkeep.jobs.entry(index).or_insert(Service {
                kind,
                worker: None,
                parts_paid: false,
                work: 0.0,
            });
        }
    }

    pub(super) fn tick_upkeep(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        dt: f32,
    ) {
        if stock.sandbox {
            return;
        }
        let targets: Vec<_> = self.upkeep.jobs.keys().copied().collect();
        for id in targets {
            let mut job = self.upkeep.jobs.remove(&id).expect("queued service");
            if !self.step_service(Target::Building(id), &mut job, (catalog, stock), site, dt) {
                self.upkeep.jobs.insert(id, job);
            }
        }
        for index in 0..self.upkeep.vehicles.len() {
            if self.active_trips().any(|trip| trip.vehicle == index) {
                continue;
            }
            let Some(mut job) = self.upkeep.vehicles[index].service.take() else {
                continue;
            };
            if !self.step_service(Target::Vehicle(index), &mut job, (catalog, stock), site, dt) {
                self.upkeep.vehicles[index].service = Some(job);
            }
        }
    }

    fn step_service(
        &mut self,
        target: Target,
        job: &mut Service,
        (catalog, stock): (&Catalog, &mut Stock),
        site: ConstructionSite,
        dt: f32,
    ) -> bool {
        if self.reservation_pass.is_some() && job.worker.is_some() {
            return false;
        }
        let project = match target {
            Target::Building(id) => {
                let project = &self.plans[id];
                if project.removed {
                    return true;
                }
                if self.changes.contains_key(&id) {
                    return false;
                }
                Some(project)
            }
            Target::Vehicle(_) => None,
        };
        let service_path = |construction: &Self, from| match target {
            Target::Building(_) => {
                let project = project.expect("building service");
                approach_points(project.position, project.size, from)
                    .into_iter()
                    .find_map(|cell| construction.resident_route(catalog, site, from, cell))
            }
            Target::Vehicle(index) => {
                construction.resident_route(catalog, site, from, crate::arrival::car_door(index))
            }
        };
        if !self.upkeep.automatic && !matches!(job.kind, Kind::Soil) {
            if let Some(worker) = job.worker.take() {
                self.residents[worker].path.clear();
            }
            return false;
        }
        let parts = parts(
            job.kind,
            project.map(|project| &catalog.projects[&project.key]),
            catalog,
        );
        let cost = if matches!(job.kind, Kind::Soil) {
            0
        } else {
            parts
                .iter()
                .map(|(id, units)| {
                    let item = &catalog.materials[id];
                    (100.0 * item.price * f64::from(*units) / f64::from(item.pack.max(1))).round()
                        as u64
                })
                .sum()
        };
        let affordable = |stock: &Stock, used: u64| {
            stock.missing(&parts).is_none() && used + cost <= self.upkeep.budget
        };
        let target_path = |index: usize, from: Vec2| {
            if job.parts_paid {
                service_path(self, from)
            } else {
                self.resident_route(catalog, site, from, SUPPLY_SPOTS[index])
            }
        };
        if let Some(worker) = job.worker
            && self.residents[worker].health.energy < 25.0
        {
            self.residents[worker].path.clear();
            job.worker = None;
            return false;
        }
        let worker = if let Some(index) = job.worker {
            index
        } else {
            if (!job.parts_paid && !affordable(stock, self.upkeep.used))
                || self
                    .upkeep
                    .services()
                    .any(|service| service.worker.is_some())
            {
                return false;
            }
            let picked = (0..self.residents.len())
                .filter(|&index| {
                    self.work_candidate(index) && self.residents[index].health.energy >= 25.0
                })
                .find_map(|index| {
                    target_path(index, self.residents[index].position).map(|path| (index, path))
                });
            let Some((index, path)) = picked else {
                return false;
            };
            job.worker = Some(index);
            self.residents[index].path = path;
            self.residents[index].leisure.visit = None;
            index
        };
        if self.reservation_pass.is_some() {
            return false;
        }
        let resident = &mut self.residents[worker];
        resident.move_along_path(dt, job.parts_paid);
        if !resident.path.is_empty() {
            return false;
        }
        if !job.parts_paid {
            if !affordable(stock, self.upkeep.used) {
                job.worker = None;
                return false;
            }
            let from = self.residents[worker].position;
            let Some(path) = service_path(self, from) else {
                job.worker = None;
                return false;
            };
            stock.reserve_available(&parts);
            self.upkeep.used += cost;
            job.parts_paid = true;
            self.residents[worker].path = path;
            return false;
        }
        let resident = &mut self.residents[worker];
        resident.health.energy = (resident.health.energy - f64::from(dt) * 0.12).max(0.0);
        job.work = (job.work + f64::from(dt)).min(job.kind.duration());
        if job.work < job.kind.duration() {
            return false;
        }
        let id = match target {
            Target::Building(index) => index,
            Target::Vehicle(index) => {
                self.upkeep.vehicles[index].condition = 100.0;
                return true;
            }
        };
        let asset = self.upkeep.assets.entry(id).or_default();
        match job.kind {
            Kind::Service => asset.condition = 100.0,
            Kind::Replacement => {
                asset.condition = 100.0;
                asset.age = 0.0;
            }
            Kind::Battery => asset.battery_age = 0.0,
            Kind::Soil => {
                if let Some(soil) = self.production.growing_sites.get_mut(&id) {
                    soil.fertility = (soil.fertility + 0.3).min(1.0);
                }
            }
        }
        true
    }
}

fn parts(kind: Kind, definition: Option<&Project>, catalog: &Catalog) -> BTreeMap<String, u32> {
    let pair = |a: &str, b: &str| BTreeMap::from([(a.into(), 1), (b.into(), 1)]);
    match kind {
        Kind::Service => pair("tools", "hardware"),
        Kind::Battery => pair("batteries", "electrical"),
        Kind::Soil => {
            let definition = definition.expect("soil amendment target");
            let area = catalog
                .production
                .values()
                .find_map(|recipe| {
                    (recipe.kind == definition.kind)
                        .then(|| recipe.biology.as_ref()?.care)
                        .flatten()
                        .map(|[area, _]| area)
                })
                .unwrap_or(16.0);
            BTreeMap::from([("compost".into(), (area * 0.25).ceil() as u32)])
        }
        Kind::Replacement => {
            let definition = definition.expect("replacement target");
            match definition.kind.as_str() {
                "solar_farm" => BTreeMap::from([
                    (
                        "panels".into(),
                        definition.materials.get("panels").copied().unwrap_or(1),
                    ),
                    ("electrical".into(), 1),
                ]),
                "well" | "water-pump" => pair("pumps", "plumbing"),
                _ => ["tiles", "roofing", "wood", "hardware"]
                    .into_iter()
                    .filter_map(|id| {
                        definition.materials.get(id).map(|&units| {
                            (
                                id.into(),
                                if id == "wood" {
                                    units.div_ceil(4)
                                } else {
                                    units
                                },
                            )
                        })
                    })
                    .collect(),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup::WorldSetup;

    #[test]
    fn upkeep_restock_reserves_fare_and_does_not_duplicate_an_inbound_pack() {
        let catalog = Catalog::default();
        let setup = crate::setup::WorldSetup::default();
        let land = Land::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        stock.reserve_available(&BTreeMap::from([(
            "hardware".into(),
            stock.available("hardware"),
        )]));
        stock.receive(&BTreeMap::from([("tools".into(), 1)]));
        let mut village = Construction::default();
        village.upkeep.vehicles[0].condition = 60.0;
        village.age_assets(&catalog, 0.0, 0.1);
        let fare = crate::market::fare_cents(12);
        let price = (catalog.materials["hardware"].price * 100.0).round() as u64;
        village.upkeep.restock_budget = price + fare - 1;
        let clock = |seconds| TownClock {
            seconds,
            round_trip_km: 12,
        };
        village.restock_upkeep(&catalog, &mut stock, &land, clock(0.0));
        assert!(village.trade.orders.is_empty());
        village.upkeep.restock_budget = (price + fare) * 2;
        village.restock_upkeep(&catalog, &mut stock, &land, clock(10.0));
        village.restock_upkeep(&catalog, &mut stock, &land, clock(20.0));
        assert_eq!(village.trade.orders.len(), 1);
        assert_eq!(village.trade.orders[0].material, "hardware");
        assert_eq!(village.upkeep.restock_used, price + fare);
    }

    #[test]
    fn upkeep_restock_can_use_freight_without_a_resident_pickup() {
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        stock.reserve_available(&BTreeMap::from([(
            "hardware".into(),
            stock.available("hardware"),
        )]));
        let mut village = Construction::default();
        village.toggle_supplier_construction();
        village.upkeep.vehicles[0].condition = 60.0;
        village.age_assets(&catalog, 0.0, 0.1);

        let cost = (catalog.materials["hardware"].price * 100.0).round() as u64
            + crate::market::freight_cents(12);
        village.upkeep.restock_budget = cost;
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        village.restock_upkeep(&catalog, &mut stock, &Land::default(), clock);

        assert_eq!(
            village.trade.delivery.as_ref().unwrap().material,
            "hardware"
        );
        assert!(village.trade.orders.is_empty());
        assert_eq!(village.upkeep.restock_used, cost);
        assert_eq!(village.market.committed_fares(), 0);
    }

    #[test]
    fn a_returning_vehicle_records_mileage_and_recovers_with_service() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        stock.sandbox = true;
        let land = Land::default();
        let camp = IVec2::new(36, 36);
        let terrain = setup.terrain().with_camp(camp);
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut village = Construction {
            selection: Some("kitchen".into()),
            ..default()
        };
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        village.plan(&catalog, &mut stock, site, IVec2::new(44, 36), clock);
        stock.sandbox = false;
        stock.receive(&parts(Kind::Service, None, &catalog));
        village.upkeep.record_distance(1, 5_000);
        village.plans[0].pickups = 1;
        village.trip = Some(TownTrip {
            project: 0,
            farm_bed: None,
            market_order: false,
            exports: 0,
            return_purchase: None,
            driver: 4,
            vehicle: 1,
            elapsed: 54.95,
            duration: 55.0,
            boarded: true,
        });
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        assert!(village.trip.is_none());
        assert_eq!(village.upkeep.vehicles[1].kilometers, 5_012);
        assert!(village.upkeep.vehicles[1].condition < 70.0);
        assert_eq!(village.upkeep.vehicles[0].kilometers, 0);

        village.upkeep.budget = 20_000;
        village.age_assets(&catalog, 0.1, 0.1);
        for _ in 0..6_000 {
            village.tick_upkeep(&catalog, &mut stock, site, 0.1);
            if village.upkeep.vehicles[1].service.is_none() {
                break;
            }
        }
        assert_eq!(village.upkeep.vehicles[1].condition, 100.0);
        assert_eq!(village.upkeep.vehicles[1].kilometers, 5_012);
        village.upkeep.dispatch_vehicle(0);
        assert_eq!(village.upkeep.trip_vehicles().collect::<Vec<_>>(), [1, 0]);
        let save = serde_json::to_string(&village).unwrap();
        let restored: Construction = serde_json::from_str(&save).unwrap();
        assert_eq!(restored.upkeep.trip_vehicles().next(), Some(1));
        assert_eq!(restored.upkeep.vehicles[1].kilometers, 5_012);
    }

    #[test]
    fn scheduled_maintenance_uses_parts_and_restores_building_condition() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        stock.sandbox = true;
        let land = Land::default();
        let camp = IVec2::new(36, 36);
        let terrain = setup.terrain().with_camp(camp);
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut village = Construction {
            selection: Some("kitchen".into()),
            ..default()
        };
        village.plan(
            &catalog,
            &mut stock,
            site,
            IVec2::new(44, 36),
            TownClock {
                seconds: 0.0,
                round_trip_km: 12,
            },
        );
        stock.sandbox = false;
        stock.receive(&parts(
            Kind::Service,
            Some(&catalog.projects["kitchen"]),
            &catalog,
        ));
        let tools = stock.available("tools");
        village.upkeep.budget = 0;
        village.age_assets(&catalog, 185.0 * DAY, 185.0 * DAY);
        assert!(village.upkeep.assets[&0].condition < 70.0);
        village.tick_upkeep(&catalog, &mut stock, site, 0.1);
        assert!(village.upkeep.jobs[&0].worker.is_none());
        assert_eq!(stock.available("tools"), tools);

        village.upkeep.budget = 20_000;
        for _ in 0..6_000 {
            village.tick_upkeep(&catalog, &mut stock, site, 0.1);
            if village.upkeep.jobs.is_empty() {
                break;
            }
        }
        assert_eq!(village.upkeep.assets[&0].condition, 100.0);
        assert_eq!(stock.available("tools"), tools - 1);
        assert!(village.upkeep.used > 0);
        let json = serde_json::to_string(&village).unwrap();
        let loaded: Construction = serde_json::from_str(&json).unwrap();
        assert_eq!(loaded.upkeep.assets[&0].condition, 100.0);
        assert!(loaded.valid_save(&catalog, &stock));
    }
}
