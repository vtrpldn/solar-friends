//! Decode and validate privately before a running world can be replaced.
use crate::*;

pub(crate) fn decode(data: &str) -> Option<Save> {
    let Ok(mut raw) = serde_json::from_str::<serde_json::Value>(data) else {
        return None;
    };
    let original_version = raw["village"]["version"].as_u64();
    if original_version.is_some_and(|v| v >= 31) && !raw["village"]["skills"].is_object() {
        return None;
    }
    if raw["view_only"] == true {
        return None;
    }
    if raw["village"]["version"] == 23 {
        raw["village"]["version"] = SAVE_VERSION.into();
        if raw["village"]["skills"].is_null() && raw["village"]["mode"] == "sandbox" {
            raw["village"]["skills"] = serde_json::to_value(skills::State {
                enabled: false,
                ..Default::default()
            })
            .unwrap();
        }
    }
    if matches!(raw["village"]["version"].as_u64(), Some(24..=26 | 29..=42)) {
        raw["village"]["version"] = SAVE_VERSION.into();
    }
    if raw["village"]["market"].is_null() && raw["village"]["mode"] == "sandbox" {
        raw["village"]["market"] = serde_json::to_value(market::State {
            enabled: false,
            ..Default::default()
        })
        .unwrap();
    }
    if raw["village"]["version"] == 3 {
        organics::author_fixture(&mut raw);
    }
    if matches!(original_version, Some(3 | 23..=26 | 29..=30)) && !skills::migrate(&mut raw) {
        return None;
    }
    if matches!(original_version, Some(3 | 23..=26 | 29..=31)) && !workforce::migrate(&mut raw) {
        return None;
    }
    if original_version.is_some_and(|v| v >= 32) && !raw["village"]["workforce"].is_object() {
        return None;
    }
    if matches!(original_version, Some(3 | 23..=26 | 29..=32)) && !simulation::migrate(&mut raw) {
        return None;
    }
    if original_version.is_some_and(|v| v >= 33) && !raw["village"]["simulation"].is_object() {
        return None;
    }
    if matches!(original_version, Some(3 | 23..=26 | 29..=33))
        && !resident_preferences::migrate(&mut raw)
    {
        return None;
    }
    if matches!(original_version, Some(3 | 23..=26 | 29..=35))
        && !occupations::migrate_records(&mut raw)
    {
        return None;
    }
    if matches!(original_version, Some(3 | 23..=26 | 29..=36)) && !relationships::migrate(&mut raw)
    {
        return None;
    }
    if original_version.is_some_and(|v| v >= 37)
        && !raw["village"]["progress"]["friendships"].is_object()
    {
        return None;
    }
    if matches!(original_version, Some(3 | 23..=26 | 29..=37)) && !participation::migrate(&mut raw)
    {
        return None;
    }
    if !participation::valid_raw(&raw) {
        return None;
    }
    if matches!(original_version, Some(3 | 23..=26 | 29..=38)) && !personality::migrate(&mut raw) {
        return None;
    }
    if matches!(original_version, Some(3 | 23..=26 | 29..=39))
        && !resident_appearance::migrate(&mut raw)
    {
        return None;
    }
    let legacy_social = matches!(original_version, Some(3 | 23..=26 | 29..=40));
    if legacy_social && !social_participation::migrate(&mut raw) {
        return None;
    }
    if !social_participation::valid_raw(&raw, legacy_social) {
        return None;
    }
    let legacy_history = matches!(original_version, Some(3 | 23..=26 | 29..=41));
    if legacy_history && !roster_history::migrate(&mut raw) {
        return None;
    }
    if !roster_history::valid_raw(&raw, legacy_history) {
        return None;
    }
    if matches!(original_version, Some(3 | 23..=26 | 29..=42)) && !gatherings::migrate(&mut raw) {
        return None;
    }
    fn canonical_keys(value: &serde_json::Value) -> bool {
        value.as_object().is_none_or(|people| {
            people.keys().all(|key| {
                key.parse::<usize>()
                    .ok()
                    .is_some_and(|id| id.to_string() == *key)
            })
        })
    }
    if !canonical_keys(&raw["village"]["progress"]["friendships"])
        || raw["village"]["progress"]["friendships"]
            .as_object()
            .is_some_and(|rows| rows.values().any(|row| !canonical_keys(row)))
        || [
            "outside_jobs",
            "outside_committed_days",
            "work_day",
            "outside_professions",
        ]
        .iter()
        .any(|field| !canonical_keys(&raw["village"]["economy"][field]))
        || raw["village"]["simulation"]["days"]
            .as_array()
            .is_some_and(|days| days.iter().any(|d| !canonical_keys(&d["residents"])))
        || !canonical_keys(&raw["village"]["skills"]["people"])
        || !canonical_keys(&raw["village"]["workforce"]["preferences"])
        || raw["village"]["workforce"]["days"]
            .as_array()
            .is_some_and(|days| days.iter().any(|d| !canonical_keys(&d["residents"])))
    {
        return None;
    }
    let Ok(save) = serde_json::from_value::<Save>(raw) else {
        return None;
    };
    validate(save)
}

pub(crate) fn validate(mut save: Save) -> Option<Save> {
    if !scenarios::valid_origin(&save.village)
        || !scenarios::matches_residents(&save.village, &save.residents)
    {
        return None;
    }
    if save.village.economy.outside_committed_day < -1
        || save.village.economy.outside_committed_day > (save.village.minutes / 1440.) as i32
    {
        return None;
    }
    occupations::migrate(&mut save);
    if !occupations::matches_residents(&save.village.economy, &save.residents) {
        return None;
    }
    resource_sites::retire_legacy(&mut save.village, &mut save.residents);
    if save.village.version == 3 && !land::initialise(&mut save.village) {
        return None;
    }
    let v = &save.village;
    if !relationships::valid(v, &save.residents) {
        return None;
    }
    let mut road_tiles = std::collections::HashSet::new();
    if v.roads.len() > ((MAP_SIZE - 2) * (MAP_SIZE - 2)) as usize
        || v.roads.iter().any(|&(x, y)| {
            !(1..=MAP_SIZE - 2).contains(&x)
                || !(1..=MAP_SIZE - 2).contains(&y)
                || crate::world::bank(v, x, y)
                || !road_tiles.insert((x, y))
        })
    {
        return None;
    }
    if !logistics::valid(v, &save.residents)
        || !scenarios::valid_origin(v)
        || !workforce::valid(v)
        || !workforce::matches_residents(v, &save.residents)
        || !skills::valid(v)
        || !skills::matches_residents(v, &save.residents)
        || !market::valid(v)
        || !production::valid(v)
        || !freshness::valid(v)
        || !processes::valid(v)
        || !land::valid(v)
        || !restoration::valid(v)
        || !water::valid(v, &save.residents)
        || !pipes::valid(v)
        || !gatherings::valid(v)
        || !simulation::valid(v)
        || !building_work::valid(v)
        || !supplies::valid(v)
        || !power::valid(v)
        || !economy::valid(v)
        || !sanitation::valid(v)
        || !maintenance::valid(v)
    {
        return None;
    }
    if !town_pickup::valid(v, &save.residents) {
        return None;
    }
    let mut work_ids = std::collections::HashSet::new();
    let all_ids = v
        .building_jobs
        .iter()
        .filter_map(|j| j.id)
        .chain(v.production.sites.iter().map(|s| s.id))
        .chain(v.production.batches.iter().map(|b| b.id))
        .chain(
            v.logistics
                .iter()
                .flat_map(|s| s.stores.iter().map(|p| p.id)),
        )
        .chain(
            v.logistics
                .iter()
                .flat_map(|s| s.shipments.iter().map(|h| h.id)),
        )
        .chain(v.progress.gathering_delivery.iter().map(|p| p.id))
        .chain(v.processes.batches.iter().map(|p| p.id))
        .chain(v.land.deposits.iter().map(|d| d.id))
        .chain(v.restoration.iter().map(|j| j.id))
        .chain(v.maintenance.jobs.iter().map(|j| j.id))
        .chain(v.water_supply.tanks.iter().map(|p| p.id))
        .chain(v.water_supply.trips.iter().map(|p| p.id))
        .chain(v.pipes.lines.iter().map(|p| p.id))
        .chain(v.power.network.nodes.iter().map(|n| n.id))
        .chain(v.power.battery_jobs.iter().map(|j| j.id))
        .chain(
            save.residents
                .iter()
                .filter_map(|r| r.help.as_ref().map(|q| q.id)),
        );
    if !all_ids.into_iter().all(|id| work_ids.insert(id))
        || save
            .residents
            .iter()
            .any(|r| !requests::valid(v, r) || !walking::valid(v, r))
    {
        return None;
    }
    let p = &v.progress;
    if !situations::valid(v)
        || p.tracked >= progression::CHAPTER_COUNT
        || !social_participation::valid(v)
        || p.tool_uses > 1_000_000
        || p.gathering_day < -1
        || !p.gathering_until.is_finite()
        || p.gathering_until < 0.
        || (p.gathering_until > 0.
            && (p.gathering_until <= v.minutes || p.gathering_until > v.minutes + 120.))
    {
        return None;
    }
    if !scenarios::journal::valid(v)
        || !outcomes::valid(v)
        || !sandbox::valid(v)
        || !matches!(v.version, 3 | SAVE_VERSION)
        || (v.map_size != MAP_SIZE && v.map_size != 20)
        || [v.camp.0, v.camp.1]
            .iter()
            .any(|n| !n.is_finite() || !(1.0..=(MAP_SIZE - 2) as f32).contains(n))
        || crate::world::bank(v, v.camp.0 as i32, v.camp.1 as i32)
        // This is a decoding safety bound, not the player creator's release limit.
        // Complete record ownership remains authoritative for every saved person.
        || save.residents.is_empty()
        || save.residents.len() > 64
        || v.buildings.len() > ((MAP_SIZE - 2) * (MAP_SIZE - 2)) as usize
        || !v.minutes.is_finite()
        || v.minutes < 0.
        || [v.wood, v.food, v.water]
            .iter()
            .any(|n| !n.is_finite() || *n < 0.)
    {
        return None;
    }
    let mut ids = std::collections::HashSet::new();
    if save.residents.iter().any(|r| {
        !r.appearance.valid()
            || r.name.trim().is_empty()
            || r.name.chars().count() > 80
            || r.pronouns.chars().count() > 40
            || r.biography.chars().count() > 600
            || !ids.insert(r.id)
            || [r.energy, r.hunger, r.social, r.happiness]
                .iter()
                .any(|n| !n.is_finite() || !(0.0..=100.).contains(n))
            || [r.x, r.y, r.target_x, r.target_y]
                .iter()
                .any(|n| !n.is_finite() || !(0.0..=MAP_SIZE as f32).contains(n))
            || !r.remaining.is_finite()
            || !r.work_check_at.is_finite()
            || !(0.0..=v.minutes).contains(&r.work_check_at)
            || !(0.0..=100.).contains(&r.remaining)
            || r.visit_building
                .is_some_and(|id| !v.buildings.iter().any(|b| b.id == id))
            || r.activity_building
                .is_some_and(|id| !v.buildings.iter().any(|b| b.id == id))
            || r.activity_material.is_some_and(|i| {
                if r.task == "source" {
                    v.economy.sources.get(i).is_none_or(|s| !s.active)
                } else if r.task == "restore" {
                    u32::try_from(i).ok().is_none_or(|id| {
                        restoration::job(v, simulation::Id(id)).is_none_or(|j| !j.active())
                    })
                } else if r.task == "utility" {
                    u32::try_from(i)
                        .ok()
                        .is_none_or(|id| !utilities::crew_exists(v, simulation::Id(id)))
                } else {
                    i >= economy::COUNT
                }
            })
            || r.activity_store.is_some_and(|id| {
                r.task != "eat"
                    || !v
                        .logistics
                        .as_ref()
                        .is_some_and(|s| s.stores.iter().any(|p| p.id == id))
            })
            || r.activity_batch.is_some_and(|id| {
                production::batch(v, id).is_none_or(|b| {
                    !production::matches_task(b.material, &r.task)
                        || Some(b.material) != r.activity_material
                })
            })
            || r.last_sanitation_day < -1
            || r.last_sanitation_day > (v.minutes / 1440.) as i32
            || (r.task == "building_work"
                && r.activity_building
                    .is_none_or(|id| building_work::job(v, id).is_none()))
            || (r.task == "restore" && r.activity_material.is_none())
            || (r.task == "utility" && r.activity_material.is_none())
            || !TASKS.contains(&r.task.as_str())
            || !mobility::valid(v, r)
            || !sleep::valid(r, v.minutes)
            || !r.routine_preferences.valid()
    }) {
        return None;
    }
    if v.buildings.iter().any(|b| {
        !b.next_visit.is_finite()
            || b.next_visit < 0.
            || !ecology::valid(b)
            || !agriculture::valid(v, b)
            || !participation::owned(v, &b.contributors)
            || economy::recipe(&b.kind, "standard").is_none()
            || !(1..=MAP_SIZE - 2).contains(&b.x)
            || !(1..=MAP_SIZE - 2).contains(&b.y)
            || if b.kind == "hydro" {
                !crate::world::hydro(v, b.x, b.y)
            } else {
                !crate::world::inland_footprint(v, &b.kind, b.x, b.y)
            }
            || !b.progress.is_finite()
            || !(0.0..=100.).contains(&b.progress)
    }) {
        return None;
    }
    if !logistics::valid(v, &save.residents) {
        return None;
    }
    if save.village.version == 3 {
        save.village.freshness = freshness::State::default();
        if !logistics::initialise(&mut save.village) {
            return None;
        }
        save.village.version = SAVE_VERSION;
        if !power::initialise(&mut save.village) {
            return None;
        }
        if !water::initialise(&mut save.village) {
            return None;
        }
        if !processes::initialise(&mut save.village) {
            return None;
        }
        if !water::valid(&save.village, &save.residents)
            || !processes::valid(&save.village)
            || !power::valid(&save.village)
        {
            return None;
        }
        economy::rebalance(&mut save.village);
    }
    Some(save)
}
