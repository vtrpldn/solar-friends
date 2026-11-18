use super::*;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub(crate) enum LabOrder {
    Build {
        key: String,
        x: i32,
        z: i32,
        #[serde(default)]
        rotation: u8,
    },
    Produce {
        site: usize,
        recipe: String,
    },
    Buy {
        material: String,
        #[serde(default)]
        freight: bool,
    },
    Grid {
        enabled: bool,
    },
    CollectWater {
        site: usize,
    },
    Purify {
        site: usize,
    },
    ServiceWater {
        site: usize,
    },
}

impl Construction {
    pub(crate) fn lab_order(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        ground: ConstructionSite,
        clock: TownClock,
        order: &LabOrder,
    ) -> Result<(), String> {
        match order {
            LabOrder::Build {
                key,
                x,
                z,
                rotation,
            } => {
                if !catalog.projects.contains_key(key)
                    || *rotation > 3
                    || !(-30..94).contains(x)
                    || !(-30..94).contains(z)
                {
                    return Err("Choose a valid blueprint, location and rotation.".into());
                }
                let previous = self.plans.len();
                self.selection = Some(key.clone());
                self.rotation = *rotation;
                self.plan(catalog, stock, ground, IVec2::new(*x, *z), clock);
                self.selection = None;
                if self.plans.len() == previous {
                    return Err(self.status.clone());
                }
            }
            LabOrder::Produce { site, recipe } => {
                let id = site
                    .checked_sub(1)
                    .filter(|&id| id < self.plans.len())
                    .ok_or("Choose a finished building by its project number.")?;
                if !self
                    .recipes(catalog, id)
                    .iter()
                    .any(|(key, _)| *key == recipe)
                {
                    return Err("This recipe is unavailable at the chosen site.".into());
                }
                let previous = self.production.jobs.len();
                self.queue_batch(catalog, stock, id, recipe);
                if self.production.jobs.len() == previous {
                    return Err(self.production.notice.clone());
                }
            }
            LabOrder::Buy { material, freight } => {
                if !catalog.materials.contains_key(material) {
                    return Err("Unknown material.".into());
                }
                self.trade.buy(
                    catalog,
                    stock,
                    &mut self.market,
                    material,
                    (clock.seconds, clock.round_trip_km, *freight),
                )?;
            }
            LabOrder::Grid { enabled } => self.utilities.grid_off = !enabled,
            LabOrder::CollectWater { site } => self.queue_water(
                *site,
                WaterAction::Carry {
                    source: None,
                    channel: 1,
                },
            )?,
            LabOrder::Purify { site } => self.queue_water(*site, WaterAction::Purify)?,
            LabOrder::ServiceWater { site } => self.queue_water(*site, WaterAction::Sanitation)?,
        }
        Ok(())
    }
}
