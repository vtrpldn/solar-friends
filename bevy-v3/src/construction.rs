use bevy::prelude::*;

use crate::{
    arrival::{MAP_START, ROAD_END, road_center, road_width, world_position},
    catalog::{Catalog, Project},
    stock::Stock,
    terrain::Terrain,
};

const ESSENTIALS: [(KeyCode, &str); 4] = [
    (KeyCode::Digit1, "gathering"),
    (KeyCode::Digit2, "well"),
    (KeyCode::Digit3, "shelter"),
    (KeyCode::Digit4, "toilet"),
];

#[derive(Default)]
pub struct Construction {
    pub menu: bool,
    selection: Option<&'static str>,
    rotation: u8,
    status: String,
    plans: Vec<Blueprint>,
}

struct Blueprint {
    key: &'static str,
    position: IVec2,
    size: IVec2,
}

impl Construction {
    pub fn is_placing(&self) -> bool {
        self.selection.is_some()
    }

    pub fn input(&mut self, keyboard: &ButtonInput<KeyCode>, catalog: &Catalog) {
        if keyboard.just_pressed(KeyCode::KeyB) {
            self.menu = !self.menu;
            self.selection = None;
            self.status.clear();
        }
        if !self.menu {
            return;
        }
        if let Some(id) = ESSENTIALS
            .iter()
            .find_map(|(key, id)| keyboard.just_pressed(*key).then_some(*id))
            && catalog.projects[id].camp_essential
        {
            self.selection = Some(id);
            self.rotation = 0;
            self.status.clear();
        }
        if self.selection.is_some() && keyboard.just_pressed(KeyCode::KeyR) {
            self.rotation = (self.rotation + 1) % 4;
        }
    }

    pub fn instructions(&self, catalog: &Catalog) -> String {
        if !self.menu {
            return "B Build · Space Pause".into();
        }
        if let Some(key) = self.selection {
            let definition = &catalog.projects[key];
            let degrees = u32::from(self.rotation) * 90;
            return format!(
                "{} · {} loads · {:.0} work seconds\nClick to plan · R Rotate ({degrees}°) · B Close\n{}",
                definition.name,
                catalog.loads(definition),
                definition.work,
                self.status
            );
        }
        format!(
            "Camp essentials\n1 {} · 2 {}\n3 {} · 4 {}\nB Close\n{}",
            catalog.projects["gathering"].name,
            catalog.projects["well"].name,
            catalog.projects["shelter"].name,
            catalog.projects["toilet"].name,
            self.status
        )
    }

    pub fn plan(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        terrain: &Terrain,
        camp: IVec2,
        position: IVec2,
    ) {
        let Some(key) = self.selection else { return };
        let definition = &catalog.projects[key];
        let blueprint = Blueprint {
            key,
            position,
            size: size(definition, self.rotation),
        };
        if let Some(error) = self.placement_error(terrain, camp, &blueprint, definition.repeatable)
        {
            self.status = error.into();
            return;
        }
        if let Err(id) = stock.reserve(&definition.materials) {
            self.status = format!("Not enough {} in supplies.", catalog.materials[&id].name);
            return;
        }
        self.plans.push(blueprint);
        self.selection = None;
        self.status = format!("{} planned. Materials reserved.", definition.name);
    }

    fn placement_error(
        &self,
        terrain: &Terrain,
        camp: IVec2,
        blueprint: &Blueprint,
        repeatable: bool,
    ) -> Option<&'static str> {
        if !repeatable
            && self
                .plans
                .iter()
                .any(|project| project.key == blueprint.key)
        {
            return Some("Already planned.");
        }
        let start = blueprint.position;
        let end = start + blueprint.size;
        if start.cmplt(IVec2::splat(-30)).any() || end.cmpgt(IVec2::splat(94)).any() {
            return Some("Keep buildings inside the plot boundary.");
        }
        let overlaps = |plot_start: IVec2, plot_end: IVec2| {
            start.cmplt(plot_end).all() && end.cmpgt(plot_start).all()
        };
        if overlaps(camp + IVec2::new(-1, -3), camp + IVec2::new(4, 1)) {
            return Some("Leave the tents clear.");
        }
        if overlaps(IVec2::new(32, -13), IVec2::new(33, -12)) {
            return Some("Leave the supplies accessible.");
        }
        if self
            .plans
            .iter()
            .any(|other| overlaps(other.position, other.position + other.size))
        {
            return Some("Another project occupies that space.");
        }
        for column in start.x..end.x {
            for row in start.y..end.y {
                let Vec2 { x, y: z } = world_position(column as f32, row as f32);
                if (MAP_START..=ROAD_END).contains(&z)
                    && (x - road_center(z)).abs() < road_width(z) + 1.0
                {
                    return Some("Keep the access road and parking clear.");
                }
                let (center, width) = terrain.river(f64::from(z));
                if (f64::from(x) - center).abs() <= width + 2.9 {
                    return Some("Keep projects back from the riverbank.");
                }
            }
        }
        None
    }

    pub fn draw(&self, terrain: &Terrain, gizmos: &mut Gizmos) {
        for plan in &self.plans {
            let left_top =
                world_position(plan.position.x as f32, plan.position.y as f32) - Vec2::ONE;
            let right_bottom = left_top + plan.size.as_vec2() * 2.0;
            let corners = [
                left_top,
                Vec2::new(left_top.x, right_bottom.y),
                right_bottom,
                Vec2::new(right_bottom.x, left_top.y),
                left_top,
            ];
            gizmos.linestrip(
                corners.map(|point| {
                    Vec3::new(point.x, terrain.height_at(point.x, point.y) + 0.1, point.y)
                }),
                Color::srgb_u8(230, 244, 158),
            );
        }
    }
}

fn size(definition: &Project, rotation: u8) -> IVec2 {
    let [width, depth] = definition.size;
    if rotation.is_multiple_of(2) {
        IVec2::new(width, depth)
    } else {
        IVec2::new(depth, width)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup::WorldSetup;

    #[test]
    fn blueprint_reserves_supplies_only_after_valid_placement() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let terrain = setup.terrain();
        let camp = IVec2::new(36, 36);
        let mut construction = Construction {
            selection: Some("gathering"),
            ..default()
        };

        construction.plan(&catalog, &mut stock, &terrain, camp, camp);
        assert_eq!(stock.available("wood"), 36);
        assert!(construction.plans.is_empty());

        construction.plan(&catalog, &mut stock, &terrain, camp, IVec2::new(44, 36));
        assert_eq!(stock.available("wood"), 28);
        assert_eq!(stock.available("hardware"), 6);
        assert_eq!(construction.plans.len(), 1);

        construction.selection = Some("well");
        construction.plan(&catalog, &mut stock, &terrain, camp, IVec2::new(50, 36));
        assert_eq!(stock.available("hardware"), 6);
        assert_eq!(construction.plans.len(), 1);
    }
}
