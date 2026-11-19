use super::*;

#[derive(Default)]
pub(super) struct RoadPlanning {
    anchor: Option<IVec2>,
    history: Vec<RoadStroke>,
}

struct RoadStroke {
    anchor: Option<IVec2>,
    first_project: usize,
    stock: Stock,
    market: Market,
}

impl Construction {
    pub(super) fn finished_road_cells(
        &self,
        catalog: &Catalog,
    ) -> std::collections::HashSet<IVec2> {
        let mut cells = std::collections::HashSet::new();
        for plan in &self.plans {
            if plan.removed
                || !matches!(plan.key.as_str(), "road" | "bridge")
                || plan.work < catalog.projects[&plan.key].work
            {
                continue;
            }
            for x in 0..plan.size.x {
                for z in 0..plan.size.y {
                    cells.insert(plan.position + IVec2::new(x, z));
                }
            }
        }
        cells
    }

    pub fn planning_roads(&self) -> bool {
        self.selection.as_deref() == Some("road") && self.moving.is_none()
    }

    pub fn finish_roads(&mut self) {
        self.road_planning = RoadPlanning::default();
        self.selection = None;
        self.menu = false;
        self.status.clear();
    }

    pub fn undo_roads(&mut self, stock: &mut Stock) {
        let Some(stroke) = self.road_planning.history.pop() else {
            self.status = "No road strokes to undo.".into();
            return;
        };
        self.plans.truncate(stroke.first_project);
        self.market = stroke.market;
        *stock = stroke.stock;
        self.road_planning.anchor = stroke.anchor;
        self.status = "Last road stroke undone.".into();
    }

    pub fn plan_roads(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        end: IVec2,
        clock: TownClock,
        extend: bool,
    ) {
        let start = self.road_planning.anchor.filter(|_| extend).unwrap_or(end);
        self.plan_road_stroke(catalog, stock, site, clock, start, end);
    }

    pub(super) fn plan_road_stroke(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        clock: TownClock,
        start: IVec2,
        end: IVec2,
    ) {
        let Some(cells) = Self::road_cells(start, end) else {
            self.status = "Choose a shorter road route (up to 128 cells).".into();
            return;
        };
        let definition = &catalog.projects["road"];
        let mut draft_stock = stock.clone();
        let mut draft_market = self.market.clone();
        let mut added = Vec::new();
        for position in cells {
            if self.has_road(position) {
                continue;
            }
            let mut tile = Blueprint {
                key: "road".into(),
                position,
                size: IVec2::ONE,
                rotation: 0,
                loads: catalog.loads(definition),
                delivered: 0,
                staged: 0,
                depot: None,
                work: 0.0,
                pickups: 0,
                fare: 0,
                removed: false,
                purchase: None,
                materials_paid: None,
            };
            if let Some(reason) = self.placement_error(
                site.terrain,
                site.land,
                site.camp,
                &tile,
                definition,
                (catalog, stock.sandbox, None),
            ) {
                self.status = format!("Road not placed. {reason}");
                return;
            }
            if let Err(reason) = Self::reserve_project(
                &mut draft_market,
                &mut draft_stock,
                catalog,
                &mut tile,
                clock,
            ) {
                self.status = format!("Road not placed. {reason}");
                return;
            }
            added.push(tile);
        }
        if added.is_empty() {
            self.status = "These road tiles are already planned.".into();
            return;
        }
        if self.plans.len() + added.len() > 128 * 128 {
            self.status = "This village has reached the project limit.".into();
            return;
        }
        self.road_planning.history.push(RoadStroke {
            anchor: self.road_planning.anchor,
            first_project: self.plans.len(),
            stock: std::mem::replace(stock, draft_stock),
            market: std::mem::replace(&mut self.market, draft_market),
        });
        self.road_planning.anchor = Some(end);
        self.status = format!("{} road tile(s) planned.", added.len());
        self.plans.extend(added);
    }

    pub fn is_road(&self, project: usize) -> bool {
        self.plans[project].key == "road"
    }

    fn has_road(&self, cell: IVec2) -> bool {
        self.plans
            .iter()
            .any(|plan| !plan.removed && plan.key == "road" && plan.position == cell)
    }

    fn road_cells(start: IVec2, end: IVec2) -> Option<impl Iterator<Item = IVec2>> {
        let delta = end - start;
        let length = delta.x.abs() + delta.y.abs();
        (length < 128).then(|| {
            (0..=length).map(move |i| {
                start
                    + IVec2::new(
                        delta.x.signum() * i.min(delta.x.abs()),
                        delta.y.signum() * (i - delta.x.abs()).max(0),
                    )
            })
        })
    }

    pub fn draw_road_route(
        &self,
        terrain: &Terrain,
        end: IVec2,
        extend: bool,
        gizmos: &mut Gizmos,
    ) {
        let start = self.road_planning.anchor.filter(|_| extend).unwrap_or(end);
        let Some(cells) = Self::road_cells(start, end) else {
            return;
        };
        let mut previous: Option<Vec2> = None;
        for cell in cells {
            let point = world_position(cell.x as f32, cell.y as f32);
            let color = if self.has_road(cell) {
                Color::srgb_u8(155, 162, 148)
            } else {
                Color::srgb_u8(217, 237, 165)
            };
            let on_ground = |point: Vec2| {
                Vec3::new(point.x, terrain.height_at(point.x, point.y) + 0.08, point.y)
            };
            if let Some(start) = previous {
                gizmos.linestrip(
                    (0..=4).map(|i| on_ground(start.lerp(point, i as f32 / 4.0))),
                    color,
                );
            }
            gizmos.linestrip(
                [
                    (-0.7, -0.7),
                    (-0.7, 0.7),
                    (0.7, 0.7),
                    (0.7, -0.7),
                    (-0.7, -0.7),
                ]
                .into_iter()
                .map(|(x, z)| on_ground(point + Vec2::new(x, z))),
                color,
            );
            previous = Some(point);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup::WorldSetup;

    #[test]
    fn resident_routes_prefer_finished_road_tiles() {
        let catalog = Catalog::default();
        let terrain = WorldSetup::default().terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut village = Construction::default();
        let from = Vec2::new(44.0, 36.0);
        let to = IVec2::new(56, 36);
        for x in 44..=56 {
            let tile = village.proposed_site(&catalog, "road", IVec2::new(x, 37));
            village.plans.push(tile);
        }
        let path = village.resident_route(&catalog, site, from, to).unwrap();
        assert!(path.iter().all(|cell| cell.y == 36.0));
        for tile in &mut village.plans {
            tile.work = catalog.projects["road"].work;
        }
        let path = village.resident_route(&catalog, site, from, to).unwrap();
        assert!(path.iter().filter(|cell| cell.y == 37.0).count() >= 12);
    }

    #[test]
    fn a_road_stroke_is_atomic_and_undo_restores_receipts_and_the_anchor() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let camp = IVec2::new(36, 36);
        let terrain = setup.terrain().with_camp(camp);
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        let mut construction = Construction {
            selection: Some("road".into()),
            ..default()
        };
        let anchor = IVec2::new(44, 36);
        construction.plan_roads(&catalog, &mut stock, site, anchor, clock, false);
        assert_eq!(construction.plans.len(), 1);
        let reserved = serde_json::to_value(&stock).unwrap();
        let market = serde_json::to_value(&construction.market).unwrap();

        construction.plan_roads(&catalog, &mut stock, site, IVec2::new(38, 34), clock, true);
        assert_eq!(construction.plans.len(), 1);
        assert!(construction.status.contains("Leave the tents clear"));
        assert_eq!(serde_json::to_value(&stock).unwrap(), reserved);
        assert_eq!(serde_json::to_value(&construction.market).unwrap(), market);

        construction.plan_roads(&catalog, &mut stock, site, IVec2::new(46, 38), clock, true);
        assert_eq!(
            construction
                .plans
                .iter()
                .map(|tile| tile.position)
                .collect::<Vec<_>>(),
            [(44, 36), (45, 36), (46, 36), (46, 37), (46, 38)].map(IVec2::from)
        );
        assert!(construction.plans.iter().all(|tile| tile.work == 0.0));
        construction.undo_roads(&mut stock);
        assert_eq!(construction.plans.len(), 1);
        assert_eq!(construction.road_planning.anchor, Some(anchor));
        assert_eq!(serde_json::to_value(&stock).unwrap(), reserved);
        assert_eq!(serde_json::to_value(&construction.market).unwrap(), market);

        stock.sandbox = true;
        let stone = stock.available("stone");
        construction.plan_roads(&catalog, &mut stock, site, IVec2::new(45, 36), clock, true);
        let tile = &construction.plans[1];
        assert!(tile.loads > 0);
        assert_eq!(tile.delivered, tile.loads);
        assert_eq!(tile.work, 0.0);
        assert_eq!(stock.available("stone"), stone);
    }
}
