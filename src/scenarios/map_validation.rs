//! Shared authored-land checks, independent of any settlement or cast.
use super::*;
pub(super) fn check(map: &Map, r: &mut Report) {
    if !valid_key(&map.id) || map.revision == 0 {
        r.push(
            "map.id",
            "invalid_identity",
            "Give this map a supported identity and positive revision.",
        );
    }
    let mut regions = HashSet::new();
    if map.regions.len() > 32 {
        r.push(
            "map.regions",
            "region_limit",
            "Use at most 32 named map regions.",
        );
    }
    for region in &map.regions {
        if !valid_key(&region.id)
            || !regions.insert(&region.id)
            || region.title.trim().is_empty()
            || region.title.chars().count() > 100
            || !(0..MAP_SIZE).contains(&region.x)
            || !(0..MAP_SIZE).contains(&region.y)
            || !(1..=MAP_SIZE).contains(&region.width)
            || !(1..=MAP_SIZE).contains(&region.height)
            || i64::from(region.x) + i64::from(region.width) > i64::from(MAP_SIZE)
            || i64::from(region.y) + i64::from(region.height) > i64::from(MAP_SIZE)
        {
            r.push("map.regions","invalid_region","Give each region a unique identity, a name up to 100 characters and a positive rectangle entirely inside the property.");
        }
    }
    if map.width != MAP_SIZE || map.height != MAP_SIZE || map.generator != "property-v1" {
        r.push(
            "map",
            "unsupported_map",
            "This game version supports 64 by 64 properties using its current landscape generator.",
        );
    }
    if let Some(biome) = &map.biome {
        if !biomes::get(&biome.id).is_some_and(|p| p.version == biome.version) {
            r.push(
                "map.biome",
                "unsupported_biome",
                "This biome or its content version is unavailable. Keep the original creation.",
            );
        }
        if map.terrain.is_none() || map.nature.is_none() || map.deposits.is_none() {
            r.push(
                "map.biome",
                "unresolved_biome",
                "A regional property needs its resolved terrain, natural plants and finite reserves.",
            );
        }
    }
    if !world::valid(&map.river) {
        r.push("map.river", "invalid_river", "Use a supported perennial river with 64 finite row centers and a connected course, or no river.");
    }
    if map.camp.iter().any(|n| !(8..=MAP_SIZE - 8).contains(n))
        || world::bank_in(map, map.camp[0], map.camp[1])
    {
        r.push(
            "map.camp",
            "invalid_camp",
            "Leave enough space around the arrival camp for the group and its daily errands.",
        );
    }
    if map
        .camera
        .iter()
        .any(|n| !n.is_finite() || !(0.0..=(MAP_SIZE - 1) as f32).contains(n))
    {
        r.push(
            "map.camera",
            "invalid_camera",
            "Choose a starting view inside the property.",
        );
    }
    if map.clearings.len() > 64
        || map.clearings.iter().any(|c| {
            !(1..=16).contains(&c.size)
                || !(0..MAP_SIZE).contains(&c.x)
                || !(0..MAP_SIZE).contains(&c.y)
                || c.x - c.size / 2 < 0
                || c.y - c.size / 2 < 0
                || c.x - c.size / 2 + c.size > MAP_SIZE
                || c.y - c.size / 2 + c.size > MAP_SIZE
                || !c.disturbance.is_finite()
                || !(0.0..=1.).contains(&c.disturbance)
        })
    {
        r.push(
            "map.clearings",
            "invalid_clearing",
            "Keep clearing brushes within the property and their supported sizes.",
        );
    }
    if let Some(patches) = &map.deposits {
        let mut keys = HashSet::new();
        let mut totals = [0u64; 3];
        let invalid = patches.len() > 64
            || patches.iter().any(|p| {
                let Some(material) = p.material_index() else {
                    return true;
                };
                totals[material - 2] += u64::from(p.quantity);
                !valid_key(&p.id)
                    || !keys.insert(&p.id)
                    || p.quantity == 0
                    || p.width < 1
                    || p.height < 1
                    || p.x < 0
                    || p.y < 0
                    || i64::from(p.x) + i64::from(p.width) > i64::from(MAP_SIZE)
                    || i64::from(p.y) + i64::from(p.height) > i64::from(MAP_SIZE)
            })
            || totals
                .iter()
                .enumerate()
                .any(|(i, n)| *n > resource_sites::LAND[i] as u64);
        if invalid {
            r.push("map.deposits","invalid_deposits","Use up to 64 uniquely named earth, stone or reclaimed patches inside the property, within the supported finite reserves.");
        }
    }
    if let Some(objects) = &map.nature {
        let mut ids = HashSet::new();
        let mut density = std::collections::HashMap::new();
        if objects.len() > 1000
            || objects.iter().any(|p| {
                let Some(index) = land::vegetation::species_index(&p.species) else {
                    return true;
                };
                let species = &land::vegetation::SPECIES[index];
                let count = density
                    .entry((p.x.floor() as i32, p.y.floor() as i32))
                    .or_insert(0);
                *count += 1;
                !valid_key(&p.id)
                    || !ids.insert(&p.id)
                    || !p.x.is_finite()
                    || !p.y.is_finite()
                    || !p.size.is_finite()
                    || !(-2.0..=66.0).contains(&p.x)
                    || !(-2.0..=66.0).contains(&p.y)
                    || !(species.min_size..=species.max_size).contains(&p.size)
                    || *count > 8
                    || world::bank_in(map, p.x.floor() as i32, p.y.floor() as i32)
            })
        {
            r.push("map.nature","invalid_nature","Use known species with unique identities, supported sizes and bounded density on inland ground.");
        }
    }
    if let Some(cells) = &map.terrain
        && (cells.len() != (MAP_SIZE * MAP_SIZE) as usize
            || cells.iter().any(|c| {
                land::habitat::by_key(&c.habitat).is_none()
                    || !c.fertility.is_finite()
                    || !(0.0..=1.0).contains(&c.fertility)
                    || !c.retention.is_finite()
                    || !(0.65..=1.35).contains(&c.retention)
                    || !c.cover.is_finite()
                    || !(0.0..=1.0).contains(&c.cover)
            }))
    {
        r.push("map.terrain","invalid_terrain","Use a complete 64 by 64 terrain grid with known habitats and supported fertility, retention and living cover.");
    }
}
