use crate::{farming::Stage, resident_animation::Motion};

use super::{resident_work::approach_points, *};

const LOAD: f64 = 12.0;
const EPSILON: f64 = 0.00001;
pub(super) const CHANNELS: [&str; 4] = ["Drinking", "Irrigation", "Greywater", "Sewage"];

#[derive(Clone, Copy, Deserialize, Serialize)]
pub enum WaterAction {
    Carry {
        source: Option<usize>,
        channel: usize,
    },
    Purify,
    Sanitation,
    InstallCable {
        to: usize,
        required: f64,
    },
    InstallPipe {
        to: usize,
        channel: usize,
        required: f64,
    },
}

impl WaterAction {
    fn connection(self, from: usize) -> Option<(usize, usize, Option<usize>)> {
        match self {
            Self::InstallCable { to, .. } => Some((from, to, None)),
            Self::InstallPipe { to, channel, .. } => Some((from, to, Some(channel))),
            _ => None,
        }
    }

    fn installation(self) -> Option<(usize, f64)> {
        match self {
            Self::InstallPipe { to, required, .. } | Self::InstallCable { to, required } => {
                Some((to, required))
            }
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Deserialize, Serialize)]
enum WaterPhase {
    Approach,
    Deliver,
    Staged(IVec2),
}

#[derive(Deserialize, Serialize)]
pub(super) struct WaterJob {
    action: WaterAction,
    phase: WaterPhase,
    worker: Option<usize>,
    carried: f64,
    work: f64,
    retry: f64,
    #[serde(default)]
    waiting_for_access: bool,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    automatic: bool,
}

impl WaterJob {
    pub(super) fn assigned_to(&self, index: usize) -> bool {
        self.worker == Some(index)
    }

    pub(super) fn label(&self) -> &'static str {
        match (self.action, self.phase) {
            (WaterAction::Purify, _) => "Purifying water by hand",
            (WaterAction::Sanitation, _) => "Servicing sealed waste tanks",
            (WaterAction::InstallCable { .. }, _) => "Installing a power connection",
            (WaterAction::InstallPipe { .. }, _) => "Installing a water connection",
            (_, WaterPhase::Deliver) => "Carrying water to the reservoir",
            (_, WaterPhase::Staged(_)) => "Sealed water waiting beside the reservoir",
            _ => "Collecting water",
        }
    }
}

impl Construction {
    pub fn queue_power_connection(
        &mut self,
        stock: &mut Stock,
        from: usize,
        to: usize,
    ) -> Result<(), &'static str> {
        self.queue_utility_connection(stock, from, to, None)
    }

    pub fn queue_water_connection(
        &mut self,
        stock: &mut Stock,
        from: usize,
        to: usize,
        channel: usize,
    ) -> Result<(), &'static str> {
        self.queue_utility_connection(stock, from, to, Some(channel))
    }

    fn queue_utility_connection(
        &mut self,
        stock: &mut Stock,
        from: usize,
        to: usize,
        channel: Option<usize>,
    ) -> Result<(), &'static str> {
        let (action, bill, _) = self.connection_plan(from, to, channel)?;
        if !stock.sandbox && stock.missing(&bill).is_some() {
            return Err("Not enough materials to install this connection.");
        }
        self.queue_installation(from, action)?;
        if !stock.sandbox {
            stock.reserve_available(&bill);
        }
        Ok(())
    }

    fn connection_plan(
        &self,
        from: usize,
        to: usize,
        channel: Option<usize>,
    ) -> Result<(WaterAction, BTreeMap<String, u32>, f64), &'static str> {
        if from == to {
            return Err("Choose different endpoints.");
        }
        let source = self
            .utilities
            .water_site(from)
            .ok_or("Choose a completed source.")?;
        let target = self
            .utilities
            .water_site(to)
            .ok_or("Choose a completed destination.")?;
        if !source.enabled || from > 0 && self.changes.contains_key(&(from - 1)) {
            return Err("Choose an open source.");
        }
        if !target.enabled || to > 0 && self.changes.contains_key(&(to - 1)) {
            return Err("Choose an open destination.");
        }
        if channel.is_some_and(|c| {
            c >= CHANNELS.len() || source.capacity[c] <= 0.0 || target.capacity[c] <= 0.0
        }) {
            return Err("Both ends need storage for this water class.");
        }
        let connected = channel.map_or_else(
            || self.utilities.power_link_exists(from, to),
            |c| self.utilities.water_link_exists(from, to, c),
        );
        if connected || self.queued_connection(from, to, channel).is_some() {
            return Err("Already connected or planned.");
        }
        let distance = f64::from(
            source
                .location
                .as_vec2()
                .distance(target.location.as_vec2()),
        );
        let units = (distance / 4.0).ceil().max(1.0) as u32;
        let required = 20.0 + distance * 3.0;
        let (action, bill) = if let Some(channel) = channel {
            (
                WaterAction::InstallPipe {
                    to,
                    channel,
                    required,
                },
                BTreeMap::from([("plumbing".into(), units), ("pumps".into(), 1)]),
            )
        } else {
            (
                WaterAction::InstallCable { to, required },
                BTreeMap::from([("electrical".into(), units)]),
            )
        };
        Ok((action, bill, distance))
    }

    pub fn connection_quote(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        (from, to, channel): (usize, usize, Option<usize>),
    ) -> String {
        use std::fmt::Write;
        if from == to || self.queued_connection(from, to, channel).is_some() {
            return String::new();
        }
        let (action, bill, distance) = match self.connection_plan(from, to, channel) {
            Ok(plan) => plan,
            Err(reason) => return format!("\n{reason}"),
        };
        let (_, required) = action.installation().expect("connection installation");
        let mut text = format!(
            "\n{:.0} m · {:.0} person-minutes",
            distance * 2.0,
            required * 0.45
        );
        if stock.sandbox {
            text.push_str(" · Free in Sandbox");
        } else {
            for (id, amount) in bill {
                let missing = amount.saturating_sub(stock.available(&id));
                let _ = write!(text, " · {amount} {}", catalog.materials[&id].name);
                if missing > 0 {
                    let _ = write!(text, " ({missing} missing)");
                }
            }
        }
        text
    }

    fn queue_installation(&mut self, from: usize, action: WaterAction) -> Result<(), &'static str> {
        if !self
            .utilities
            .water_site(from)
            .is_some_and(|site| site.enabled)
            || from > 0 && self.changes.contains_key(&(from - 1))
        {
            return Err("Choose an open source.");
        }
        if self.water_jobs.contains_key(&from)
            || self
                .pending_connections
                .iter()
                .any(|&(source, _)| source == from)
        {
            self.pending_connections.push((from, action));
            Ok(())
        } else {
            self.queue_water(from, action)
        }
    }

    fn promote_pending_connections(&mut self) {
        let mut retained = Vec::new();
        for (source, action) in std::mem::take(&mut self.pending_connections) {
            if self.queue_water(source, action).is_err() {
                retained.push((source, action));
            }
        }
        self.pending_connections = retained;
    }

    pub fn queue_water(&mut self, target: usize, action: WaterAction) -> Result<(), &'static str> {
        if self.water_jobs.contains_key(&target) {
            return Err("A water job is already queued here.");
        }
        let site = self
            .utilities
            .water_site(target)
            .ok_or("Select a water facility.")?;
        if !site.enabled || target > 0 && self.changes.contains_key(&(target - 1)) {
            return Err("Choose an open facility.");
        }
        match action {
            WaterAction::Carry { source, channel } => {
                if channel >= CHANNELS.len() || source == Some(target) {
                    return Err("Choose different water endpoints.");
                }
                if source.is_none() && channel != 1 {
                    return Err("River water must be filtered before drinking.");
                }
                if site.capacity[channel] <= 0.0 {
                    return Err("The destination cannot store that water class.");
                }
                if site.space(channel) < 0.1 {
                    return Err("Destination is full.");
                }
                if let Some(id) = source {
                    let source = self
                        .utilities
                        .water_site(id)
                        .ok_or("Select a water source.")?;
                    if !source.enabled
                        || source.levels[channel] < 0.1
                        || id > 0 && self.changes.contains_key(&(id - 1))
                    {
                        return Err("Source is empty or closed.");
                    }
                }
            }
            WaterAction::Purify => {
                if site.capacity[0] <= 0.0 || site.capacity[1] <= 0.0 {
                    return Err(
                        "Choose a reservoir with separate untreated and drinking-water storage.",
                    );
                }
                if site.levels[1] < 1.0 {
                    return Err("Bring untreated water here first.");
                }
                if site.space(0) < 1.0 {
                    return Err("Drinking-water storage is full.");
                }
            }
            WaterAction::Sanitation if site.levels[2] + site.levels[3] < 1.0 => {
                return Err("There is no accumulated waste to remove.");
            }
            WaterAction::Sanitation
            | WaterAction::InstallPipe { .. }
            | WaterAction::InstallCable { .. } => {}
        }
        self.water_jobs.insert(
            target,
            WaterJob {
                action,
                phase: WaterPhase::Approach,
                worker: None,
                carried: 0.0,
                work: 0.0,
                retry: 0.0,
                waiting_for_access: false,
                automatic: false,
            },
        );
        Ok(())
    }

    pub(super) fn valid_water_jobs(&self) -> bool {
        let mut workers = [false; 5];
        let valid_pending = self.pending_connections.iter().all(|&(source, action)| {
            let Some((_, to, channel)) = action.connection(source) else {
                return false;
            };
            let Some((_, required)) = action.installation() else {
                return false;
            };
            let (Some(a), Some(b)) = (
                self.utilities.water_site(source),
                self.utilities.water_site(to),
            ) else {
                return false;
            };
            source != to
                && required
                    == 20.0 + 3.0 * f64::from(a.location.as_vec2().distance(b.location.as_vec2()))
                && channel.is_none_or(|c| {
                    c < CHANNELS.len() && a.capacity[c] > 0.0 && b.capacity[c] > 0.0
                })
        });
        valid_pending
            && self.water_jobs.iter().all(|(&target, job)| {
                let Some(site) = self.utilities.water_site(target) else {
                    return false;
                };
                let numeric = (0.0..=LOAD).contains(&job.carried)
                    && (0.0..=job
                        .action
                        .installation()
                        .map_or(45.0, |(_, required)| required))
                        .contains(&job.work)
                    && job.retry.is_finite()
                    && job.retry >= 0.0;
                let action = match job.action {
                    WaterAction::Carry { source, channel } => {
                        channel < CHANNELS.len()
                            && site.capacity[channel] > 0.0
                            && source != Some(target)
                            && source
                                .map_or(channel == 1, |id| self.utilities.water_site(id).is_some())
                    }
                    WaterAction::InstallPipe {
                        to,
                        channel,
                        required,
                    } => {
                        to != target
                            && channel < CHANNELS.len()
                            && site.capacity[channel] > 0.0
                            && self.utilities.water_site(to).is_some_and(|destination| {
                                destination.capacity[channel] > 0.0
                                    && required
                                        == 20.0
                                            + 3.0
                                                * f64::from(
                                                    site.location
                                                        .as_vec2()
                                                        .distance(destination.location.as_vec2()),
                                                )
                            })
                            && job.carried == 0.0
                            && matches!(job.phase, WaterPhase::Approach)
                    }
                    WaterAction::InstallCable { to, required } => {
                        to != target
                            && self.utilities.water_site(to).is_some_and(|destination| {
                                required
                                    == 20.0
                                        + 3.0
                                            * f64::from(
                                                site.location
                                                    .as_vec2()
                                                    .distance(destination.location.as_vec2()),
                                            )
                            })
                            && job.carried == 0.0
                            && matches!(job.phase, WaterPhase::Approach)
                    }
                    _ => job.carried == 0.0 && matches!(job.phase, WaterPhase::Approach),
                };
                let worker = job.worker.is_none_or(|id| {
                    id < workers.len() && !std::mem::replace(&mut workers[id], true)
                });
                numeric && action && worker
            })
    }

    pub(super) fn water_job_at(&self, index: usize) -> bool {
        let id = index + 1;
        self.pending_connections.iter().any(|&(from, action)| {
            from == id || action.installation().is_some_and(|(to, _)| to == id)
        }) || self.water_jobs.contains_key(&id) || self.water_jobs.values().any(|job| {
            matches!(job.action, WaterAction::Carry { source: Some(source), .. } if source == id)
                || job.action.installation().is_some_and(|(to, _)| to == id)
        })
    }

    pub(super) fn working_water(&self, worker: usize) -> bool {
        self.water_jobs
            .values()
            .any(|job| job.worker == Some(worker))
    }

    pub(super) fn water_motion(&self, index: usize) -> Option<Motion> {
        let job = self
            .water_jobs
            .values()
            .find(|job| job.worker == Some(index))?;
        Some(match job.phase {
            WaterPhase::Deliver => Motion::CarryWalk,
            _ if !self.residents[index].path.is_empty() => Motion::Walk,
            _ => Motion::Work,
        })
    }

    pub(super) fn water_activity(&self, index: usize) -> Option<&'static str> {
        self.water_jobs
            .values()
            .find(|job| job.worker == Some(index))
            .map(WaterJob::label)
    }

    fn water_job_wait(&self, target: usize, job: &WaterJob) -> Option<&'static str> {
        if let WaterAction::Carry { channel, .. } = job.action
            && !matches!(job.phase, WaterPhase::Deliver)
            && self
                .utilities
                .water_site(target)
                .is_some_and(|site| site.space(channel) <= EPSILON)
        {
            return Some(if matches!(job.phase, WaterPhase::Staged(_)) {
                "Destination full · Sealed water waiting beside the reservoir"
            } else {
                "Waiting for space at the destination"
            });
        }
        if !matches!(job.phase, WaterPhase::Approach) {
            return None;
        }
        match job.action {
            WaterAction::Carry {
                source: Some(source),
                channel,
            } => {
                let stocked = self
                    .utilities
                    .water_site(source)
                    .is_some_and(|node| node.enabled && node.levels[channel] >= 0.1);
                let alternate = job.automatic
                    && channel == 0
                    && self
                        .utilities
                        .water_sources()
                        .any(|(id, _, _)| id != target && id != source);
                (!stocked && !alternate).then_some("Waiting for water at the source")
            }
            WaterAction::Carry { source: None, .. } => self
                .utilities
                .watershed_sample()
                .filter(|water| water.river_reserve_liters < 0.1)
                .map(|_| "Waiting for river flow"),
            _ => None,
        }
    }

    pub(super) fn water_route_blocked(&self, target: usize, job: &WaterJob, clock: f64) -> bool {
        self.water_job_wait(target, job).is_none()
            && ((job.waiting_for_access && job.retry > clock)
                || job
                    .worker
                    .is_some_and(|index| self.residents[index].waiting_for_route()))
    }

    pub(super) fn water_job_status(
        &self,
        target: usize,
        job: &WaterJob,
        clock: f64,
    ) -> &'static str {
        if self.water_route_blocked(target, job, clock) {
            "Waiting for access"
        } else {
            self.water_job_wait(target, job).unwrap_or_else(|| {
                if job.worker.is_some() || matches!(job.phase, WaterPhase::Staged(_)) {
                    job.label()
                } else {
                    "Waiting for a resident"
                }
            })
        }
    }

    pub fn connection_summary(&self, catalog: &Catalog, selected: usize, power: bool) -> String {
        let (connection, count, shortcut, arrow) = if power {
            (
                self.utilities
                    .power_link(selected)
                    .map(|(from, to, enabled)| (from, to, "Power", enabled)),
                self.utilities.power_link_count(),
                "T",
                "↔",
            )
        } else {
            (
                self.utilities.water_link(selected),
                self.utilities.water_link_count(),
                "G",
                "→",
            )
        };
        let Some((from, to, kind, enabled)) = connection else {
            return String::new();
        };
        let status = if enabled { "on" } else { "off" };
        format!(
            "\nConnection {}/{count} · {kind} · {} {arrow} {} · {status}\n[ / ] Select connection · {shortcut} Switch connection",
            selected.saturating_add(1).min(count),
            self.connection_site_name(catalog, from),
            self.connection_site_name(catalog, to),
        )
    }

    fn connection_site_name(&self, catalog: &Catalog, id: usize) -> String {
        match id.checked_sub(1).and_then(|index| self.plans.get(index)) {
            Some(plan) => format!("{} #{id}", catalog.projects[&plan.key].name),
            None if id == 0 => "Camp".into(),
            None => "Unavailable".into(),
        }
    }

    pub fn queued_utility_connections(
        &self,
        power: bool,
    ) -> impl Iterator<Item = (usize, usize, Option<usize>)> + '_ {
        self.water_jobs
            .iter()
            .map(|(&from, job)| (from, job.action))
            .chain(self.pending_connections.iter().copied())
            .filter_map(move |(from, action)| {
                action
                    .connection(from)
                    .filter(|edge| edge.2.is_none() == power)
            })
    }

    pub fn draw_utility_installations(
        &self,
        terrain: &Terrain,
        view: crate::utilities::NetworkView,
        gizmos: &mut Gizmos,
    ) {
        use crate::utilities::NetworkView;
        let power = view == NetworkView::Power;
        for (from, to, channel) in self.queued_utility_connections(power) {
            if channel.is_some_and(|channel| match view {
                NetworkView::Liquid(selected) => channel != selected,
                NetworkView::Sanitation => channel < 2,
                _ => false,
            }) {
                continue;
            }
            let progress = self
                .active_connection(from, to, channel)
                .map_or(0.0, |job| {
                    let (_, required) = job.action.installation().expect("installation");
                    (job.work / required).clamp(0.0, 1.0) as f32
                });
            self.utilities
                .draw_queued_connection(terrain, (from, to), channel, progress, gizmos);
        }
    }

    pub fn queued_installation_hint(&self, power: bool) -> String {
        let count = self.queued_utility_connections(power).count();
        if count == 0 {
            return String::new();
        }
        let noun = if count == 1 {
            "installation"
        } else {
            "installations"
        };
        format!(
            "\n{count} queued {noun} · Page Up Next installation · Dashed lines under construction"
        )
    }

    fn active_connection(
        &self,
        from: usize,
        to: usize,
        channel: Option<usize>,
    ) -> Option<&WaterJob> {
        let matches = |source, destination| {
            self.water_jobs
                .get(&source)
                .filter(|job| job.action.connection(source) == Some((source, destination, channel)))
        };
        matches(from, to).or_else(|| {
            if channel.is_none() {
                matches(to, from)
            } else {
                None
            }
        })
    }

    pub fn queued_connection(
        &self,
        from: usize,
        to: usize,
        channel: Option<usize>,
    ) -> Option<(usize, usize, Option<usize>)> {
        self.queued_utility_connections(channel.is_none())
            .find(|&edge| {
                edge == (from, to, channel) || (channel.is_none() && edge == (to, from, None))
            })
    }

    pub fn cancel_connection_installation(
        &mut self,
        from: usize,
        to: usize,
        channel: Option<usize>,
    ) -> bool {
        let Some(edge) = self.queued_connection(from, to, channel) else {
            return false;
        };
        if self.active_connection(from, to, channel).is_some() {
            if let Some(job) = self.water_jobs.remove(&edge.0)
                && let Some(worker) = job.worker
            {
                self.residents[worker].path.clear();
            }
        } else {
            self.pending_connections
                .retain(|&(source, action)| action.connection(source) != Some(edge));
        }
        true
    }

    pub fn power_installation_summary(&self, catalog: &Catalog, from: usize, to: usize) -> String {
        use std::fmt::Write;
        let mut text = format!(
            "\nNew line · {} ↔ {}\nShift-click source · Click destination · C Camp · U Install line",
            self.connection_site_name(catalog, from),
            self.connection_site_name(catalog, to),
        );
        if let Some(job) = self.active_connection(from, to, None)
            && let WaterAction::InstallCable { required, .. } = job.action
        {
            let _ = write!(
                text,
                "\n{} · {:.0}% installed",
                job.label(),
                100.0 * job.work / required
            );
        }
        text
    }

    pub fn power_shortage_summary(&self, catalog: &Catalog) -> String {
        use std::fmt::Write;
        const VISIBLE_SHORTAGES: usize = 4;
        let mut shortages = self.utilities.power_shortages().peekable();
        if shortages.peek().is_none() {
            return String::new();
        }
        let mut text = String::from("\nWaiting for power · Page Down Next building");
        for id in shortages.by_ref().take(VISIBLE_SHORTAGES) {
            if let Some(plan) = id.checked_sub(1).and_then(|index| self.plans.get(index)) {
                let name = &catalog.projects[&plan.key].name;
                let _ = write!(text, "\n{name} #{id}");
            } else {
                text.push_str("\nCamp");
            }
        }
        let remaining = shortages.count();
        if remaining > 0 {
            let _ = write!(text, "\n{remaining} more");
        }
        text
    }

    pub fn waste_tank_summary(&self, catalog: &Catalog) -> String {
        use std::fmt::Write;
        const VISIBLE_WARNINGS: usize = 4;
        let mut details = String::new();
        let mut count = 0;
        for (id, _, tank, warning) in self.utilities.waste_tanks_needing_attention() {
            count += 1;
            if count > VISIBLE_WARNINGS {
                continue;
            }
            if let Some(plan) = id.checked_sub(1).and_then(|index| self.plans.get(index)) {
                let name = &catalog.projects[&plan.key].name;
                let _ = write!(details, "\n{name} #{id} · {tank} tank {warning}");
            } else {
                let _ = write!(details, "\nCamp · {tank} tank {warning}");
            }
        }
        if count == 0 {
            return details;
        }
        if count > VISIBLE_WARNINGS {
            let _ = write!(details, "\n{} more tanks", count - VISIBLE_WARNINGS);
        }
        let subject = if count == 1 {
            "tank needs"
        } else {
            "tanks need"
        };
        format!("\n{count} waste {subject} attention · Page Down Next tank{details}")
    }

    pub fn water_panel(
        &self,
        target: usize,
        source: Option<usize>,
        channel: usize,
        clock: f64,
    ) -> String {
        let utilities = &self.utilities;
        let name = |id| {
            utilities
                .water_site(id)
                .map_or("Unavailable", |site| site.kind)
        };
        let Some(site) = utilities.water_site(target) else {
            return "Click a water facility to select it.".into();
        };
        let mut text = format!(
            "Target · {} #{target} · {}\nClick target · Shift-click source · C Camp\n1 Drinking · 2 Irrigation · 3 Greywater · 4 Sewage\nR River · T Carry from {} · Y Purify · K Service waste · U Install connection\nM Drinking reserve {} · L Sanitation {}",
            site.kind,
            CHANNELS[channel],
            source.map_or("selected source", name),
            if site.maintain_fresh { "on" } else { "off" },
            if site.maintain_sanitation {
                "on"
            } else {
                "off"
            },
        );
        use std::fmt::Write;
        for (channel, label) in CHANNELS.iter().enumerate() {
            if site.capacity[channel] > 0.0 {
                let _ = write!(
                    text,
                    "\n{label} {:.1}/{:.0} L",
                    site.levels[channel], site.capacity[channel]
                );
                if channel >= 2
                    && let Some(warning) = crate::utilities::waste_tank_warning(
                        site.levels[channel],
                        site.capacity[channel],
                    )
                {
                    let _ = write!(text, " · Tank {warning}");
                }
            }
        }
        let selected_job =
            source.and_then(|from| self.active_connection(from, target, Some(channel)));
        let selected_waiting = selected_job.is_none()
            && source.is_some_and(|from| {
                self.queued_connection(from, target, Some(channel))
                    .is_some()
            });
        if selected_waiting {
            text.push_str("\nInstallation queued · Waiting for other work at the source");
        } else if let Some(job) = selected_job
            .or_else(|| self.water_jobs.get(&target))
            .or_else(|| {
                self.water_jobs.values().find(
                    |job| matches!(job.action, WaterAction::InstallPipe { to, .. } if to == target),
                )
            })
        {
            let status = self.water_job_status(target, job, clock);
            let _ = write!(text, "\n{status}");
            match job.action {
                WaterAction::InstallPipe { required, .. } => {
                    let _ = write!(text, " · {:.0}% installed", 100.0 * job.work / required);
                }
                WaterAction::Purify | WaterAction::Sanitation => {
                    let required = if matches!(job.action, WaterAction::Purify) {
                        30.0
                    } else {
                        45.0
                    };
                    let _ = write!(text, " · {:.0}% complete", 100.0 * job.work / required);
                }
                WaterAction::Carry { .. } if job.carried > EPSILON => {
                    let _ = write!(text, " · {:.1} L carried", job.carried);
                }
                _ => {}
            }
            if let Some(worker) = job.worker {
                let _ = write!(text, " · {}", super::resident_work::NAMES[worker]);
            }
        }
        text
    }

    pub(super) fn water_route(
        &self,
        worker: usize,
        catalog: &Catalog,
        site: ConstructionSite,
        id: usize,
    ) -> Option<VecDeque<Vec2>> {
        let facility = self.utilities.water_site(id)?;
        let from = self.residents[worker].position;
        if id == 0 {
            return self.resident_route(catalog, site, from, SUPPLY_SPOTS[worker]);
        }
        approach_points(facility.location, facility.size, from)
            .into_iter()
            .find_map(|cell| self.resident_route(catalog, site, from, cell))
    }

    fn river_route(
        &self,
        worker: usize,
        catalog: &Catalog,
        site: ConstructionSite,
    ) -> Option<VecDeque<Vec2>> {
        let from = self.residents[worker].position;
        let mut access = (-28..92)
            .flat_map(|row| {
                let (center, width) = site.terrain.river(f64::from(row - 32) * 2.0);
                [
                    IVec2::new((32.0 + (center - width - 4.0) / 2.0).floor() as i32, row),
                    IVec2::new((32.0 + (center + width + 4.0) / 2.0).ceil() as i32, row),
                ]
            })
            .collect::<Vec<_>>();
        access.sort_by(|a, b| {
            a.as_vec2()
                .distance_squared(from)
                .total_cmp(&b.as_vec2().distance_squared(from))
        });
        access
            .into_iter()
            .find_map(|cell| self.resident_route(catalog, site, from, cell))
    }

    pub(super) fn maintain_water(&mut self, catalog: &Catalog, sandbox: bool) {
        let ids = self.utilities.water_ids().collect::<Vec<_>>();
        for id in ids {
            if self.water_jobs.contains_key(&id) {
                continue;
            }
            let site = self.utilities.water_site(id).expect("water facility");
            if !site.enabled {
                continue;
            }
            let reserve = site.capacity[0].min(50.0);
            let below_reserve = site.levels[0] < reserve - (reserve * 0.25).min(12.0);
            let irrigate = id
                .checked_sub(1)
                .and_then(|id| self.farming.plots.get(&id))
                .is_some_and(|plot| {
                    site.levels[1] < (site.capacity[1] * 0.5).min(12.0)
                        && plot.beds.iter().any(|bed| {
                            bed.irrigation
                                && matches!(bed.stage, Stage::Growing | Stage::Harvestable)
                        })
                });
            let crop_or_grove = irrigate
                || id.checked_sub(1).is_some_and(|site_id| {
                    site.capacity[1] > 0.0
                        && site.levels[1] < (site.capacity[1] * 0.5).min(12.0)
                        && self
                            .production
                            .growing_sites
                            .get(&site_id)
                            .is_some_and(|soil| soil.irrigation.target() > 0.0)
                        && self.production.jobs.iter().any(|job| {
                            job.site == site_id
                                && job.phase == crate::production::Phase::Growing
                                && matches!(
                                    job.recipe.as_str(),
                                    "fruit" | "bananas" | "wood" | "bamboo"
                                )
                        })
                });
            let batch_water = id.checked_sub(1).is_some_and(|site_id| {
                site.capacity[1] > 0.0
                    && site.levels[0] + site.levels[1] < 4.0
                    && self.production.jobs.iter().any(|job| {
                        job.site == site_id
                            && !job.watered
                            && matches!(job.recipe.as_str(), "fruit" | "bananas")
                    })
            });
            let kitchen_needs_drainage = !sandbox
                && site.kind == "kitchen"
                && id.checked_sub(1).is_some_and(|target| {
                    self.production.jobs.iter().any(|job| {
                        let water = catalog.production[&job.recipe].water;
                        job.site == target
                            && job.phase != crate::production::Phase::Return
                            && !job.watered
                            && water > 0.0
                            && !self.utilities.greywater_space(id, water)
                    })
                });
            let needs_drinking_water = !sandbox
                && id.checked_sub(1).is_some_and(|target| {
                    let animal_care = catalog.animal_rations.get(site.kind).is_some_and(|ration| {
                        site.levels[0] + 1e-8 < ration.water
                            && self
                                .livestock
                                .animals
                                .get(&target)
                                .is_some_and(|pen| pen.fed_days(ration) <= 0.25)
                    });
                    animal_care
                        || self.production.jobs.iter().any(|job| {
                            job.site == target
                                && !job.watered
                                && job.phase != crate::production::Phase::Return
                                && catalog.production[&job.recipe].water > site.levels[0] + 1e-8
                        })
                });
            let action = if kitchen_needs_drainage && site.maintain_sanitation {
                Some(WaterAction::Sanitation)
            } else if needs_drinking_water && !kitchen_needs_drainage {
                self.utilities
                    .water_sources()
                    .filter(|(source, _, _)| *source != id)
                    .min_by_key(|(_, location, _)| location.distance_squared(site.location))
                    .map(|(source, _, _)| WaterAction::Carry {
                        source: Some(source),
                        channel: 0,
                    })
            } else if site.maintain_fresh && below_reserve {
                if site.levels[1] >= site.space(0).min(12.0)
                    || (site.levels[0] < 10.0 && site.levels[1] >= 1.0)
                {
                    Some(WaterAction::Purify)
                } else {
                    let source = self
                        .utilities
                        .water_ids()
                        .filter(|&other| other != id)
                        .filter_map(|other| {
                            let node = self.utilities.water_site(other)?;
                            (node.enabled
                                && node.levels[1] >= 1.0
                                && matches!(
                                    node.kind,
                                    "groundwater-well" | "rain-barrel" | "water-pump"
                                ))
                            .then_some((node.location.distance_squared(site.location), other))
                        })
                        .min()
                        .map(|(_, source)| source);
                    Some(WaterAction::Carry { source, channel: 1 })
                }
            } else if site.maintain_sanitation
                && [2, 3]
                    .into_iter()
                    .any(|i| site.capacity[i] > 0.0 && site.levels[i] >= site.capacity[i] * 0.5)
            {
                Some(WaterAction::Sanitation)
            } else if crop_or_grove || batch_water {
                Some(WaterAction::Carry {
                    source: None,
                    channel: 1,
                })
            } else {
                None
            };
            if let Some(action) = action
                && self.queue_water(id, action).is_ok()
            {
                self.water_jobs
                    .get_mut(&id)
                    .expect("queued water job")
                    .automatic = true;
            }
        }
    }

    #[cfg(test)]
    pub(super) fn tick_water_work(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        clock: f64,
        dt: f32,
    ) {
        self.maintain_water(catalog, stock.sandbox);
        self.tick_water_group(catalog, stock, site, clock, dt, None);
    }

    pub(super) fn tick_water_group(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        clock: f64,
        dt: f32,
        group: Option<WorkGroup>,
    ) {
        if self.reservation_pass.is_none() && !self.pending_connections.is_empty() {
            self.promote_pending_connections();
        }
        let ids = self
            .water_jobs
            .iter()
            .filter_map(|(&id, job)| {
                let work = if matches!(
                    job.action,
                    WaterAction::Sanitation
                        | WaterAction::InstallPipe { .. }
                        | WaterAction::InstallCable { .. }
                ) {
                    WorkGroup::Maintenance
                } else {
                    WorkGroup::Essentials
                };
                group.is_none_or(|group| group == work).then_some(id)
            })
            .collect::<Vec<_>>();
        for id in ids {
            // Keep the slot occupied while choosing a worker for another job.
            let mut job = self.water_jobs.remove(&id).expect("queued water job");
            if !self.step_water(id, &mut job, (catalog, stock), site, clock, dt) {
                self.water_jobs.insert(id, job);
            }
        }
    }

    fn alternate_drinking_source(
        &self,
        worker: usize,
        catalog: &Catalog,
        site: ConstructionSite,
        target: usize,
        original: usize,
    ) -> Option<(usize, VecDeque<Vec2>)> {
        let destination = self.utilities.water_site(target)?;
        let mut candidates: Vec<_> = self
            .utilities
            .water_sources()
            .filter(|&(id, _, _)| id != target && id != original)
            .map(|(id, location, _)| (location.distance_squared(destination.location), id))
            .collect();
        candidates.sort_unstable();
        candidates.into_iter().find_map(|(_, id)| {
            self.water_route(worker, catalog, site, id)
                .map(|path| (id, path))
        })
    }

    fn step_water(
        &mut self,
        id: usize,
        job: &mut WaterJob,
        (catalog, stock): (&Catalog, &mut Stock),
        site: ConstructionSite,
        clock: f64,
        dt: f32,
    ) -> bool {
        if self.reservation_pass.is_some() && job.worker.is_some() {
            return false;
        }
        if !self
            .utilities
            .water_site(id)
            .is_some_and(|node| node.enabled)
        {
            if let Some(worker) = job.worker.take() {
                if matches!(job.phase, WaterPhase::Deliver) {
                    job.phase =
                        WaterPhase::Staged(self.residents[worker].position.round().as_ivec2());
                }
                self.residents[worker].path.clear();
            }
            return false;
        }
        if self.water_job_wait(id, job).is_some() {
            if let Some(worker) = job.worker.take() {
                self.residents[worker].path.clear();
            }
            job.waiting_for_access = false;
            return false;
        }
        let worker = if let Some(worker) = job.worker {
            worker
        } else {
            if clock < job.retry {
                return false;
            }
            if self.reservation_pass.is_none() {
                job.retry = clock + 3.0;
                job.waiting_for_access = false;
            }
            let mut attempted_route = false;
            let picked = (0..self.residents.len())
                .filter(|&index| {
                    self.work_candidate(index) && self.residents[index].health.energy >= 25.0
                })
                .find_map(|index| {
                    attempted_route = true;
                    let mut chosen_action = job.action;
                    let path = match (job.action, job.phase) {
                        (_, WaterPhase::Staged(point)) => self.resident_route(
                            catalog,
                            site,
                            self.residents[index].position,
                            point,
                        ),
                        (WaterAction::Carry { source: None, .. }, _) => {
                            self.river_route(index, catalog, site)
                        }
                        (
                            WaterAction::Carry {
                                source: Some(source),
                                channel,
                            },
                            _,
                        ) => {
                            let route = self
                                .utilities
                                .water_site(source)
                                .filter(|node| {
                                    !job.automatic || (node.enabled && node.levels[channel] >= 0.1)
                                })
                                .and_then(|_| self.water_route(index, catalog, site, source));
                            route.or_else(|| {
                                if !job.automatic || channel != 0 {
                                    return None;
                                }
                                let (alternate, path) = self
                                    .alternate_drinking_source(index, catalog, site, id, source)?;
                                chosen_action = WaterAction::Carry {
                                    source: Some(alternate),
                                    channel,
                                };
                                Some(path)
                            })
                        }
                        _ => self.water_route(index, catalog, site, id),
                    }?;
                    Some((index, path, chosen_action))
                });
            let Some((index, path, chosen_action)) = picked else {
                if self.reservation_pass.is_none() {
                    job.waiting_for_access = attempted_route;
                }
                return false;
            };
            job.waiting_for_access = false;
            job.action = chosen_action;
            self.residents[index].path = path;
            self.residents[index].leisure.visit = None;
            job.worker = Some(index);
            index
        };

        if self.reservation_pass.is_some() {
            return false;
        }
        let carrying = matches!(job.phase, WaterPhase::Deliver);
        let boost = if carrying && !self.residents[worker].path.is_empty() {
            stock.use_tool(
                worker,
                "bucket",
                ToolTask::Water(id),
                f64::from(dt),
                self.repairing(catalog, "bucket"),
            )
        } else {
            1.0
        };
        self.residents[worker].move_with_pace(dt, carrying, boost as f32);
        if !self.residents[worker].path.is_empty() {
            return false;
        }
        if let WaterAction::Carry { source, channel } = job.action {
            if matches!(job.phase, WaterPhase::Deliver) {
                job.carried -= self.utilities.deliver_water(id, channel, job.carried);
                if job.carried > EPSILON {
                    job.phase =
                        WaterPhase::Staged(self.residents[worker].position.round().as_ivec2());
                    job.worker = None;
                    return false;
                }
                return true;
            }
            let Some(path) = self.water_route(worker, catalog, site, id) else {
                job.worker = None;
                job.waiting_for_access = true;
                job.retry = clock + 3.0;
                return false;
            };
            if matches!(job.phase, WaterPhase::Approach) {
                let capacity = self
                    .utilities
                    .water_site(id)
                    .map_or(0.0, |node| node.space(channel));
                job.carried = self
                    .utilities
                    .take_water(source, channel, capacity.min(LOAD));
                if job.carried <= EPSILON {
                    job.worker = None;
                    return false;
                }
            }
            self.residents[worker].path = path;
            job.phase = WaterPhase::Deliver;
            return false;
        }

        self.residents[worker].health.energy =
            (self.residents[worker].health.energy - f64::from(dt) * 0.06).max(0.0);
        let boost = if matches!(job.action, WaterAction::Sanitation) {
            stock.use_tool(
                worker,
                "cleaning-kit",
                ToolTask::Water(id),
                f64::from(dt),
                self.repairing(catalog, "cleaning-kit"),
            )
        } else {
            1.0
        };
        job.work += f64::from(dt) * boost;
        let name = super::resident_work::NAMES[worker];
        match job.action {
            WaterAction::Purify if job.work >= 30.0 => {
                let liters = self.utilities.purify_water(id);
                if liters > EPSILON {
                    self.record_event(
                        clock,
                        format!("{name} purified {liters:.1} L of drinking water."),
                    );
                }
            }
            WaterAction::Sanitation if job.work >= 45.0 => {
                let liters = self.utilities.service_waste(id);
                if liters > EPSILON {
                    self.record_event(
                        clock,
                        format!("{name} removed {liters:.1} L of waste for off-site treatment."),
                    );
                }
            }
            WaterAction::InstallCable { to, required } if job.work >= required => {
                self.utilities.install_power_link(id, to);
                self.record_event(clock, format!("{name} installed a power connection."));
            }
            WaterAction::InstallPipe {
                to,
                channel,
                required,
            } if job.work >= required => {
                self.utilities.install_water_link(id, to, channel);
                self.record_event(clock, format!("{name} installed a water connection."));
            }
            _ => return false,
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup::WorldSetup;

    #[test]
    fn residents_finish_a_queued_water_connection_after_reload() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut town = Construction::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        stock.receive(&BTreeMap::from([
            ("plumbing".into(), 2),
            ("pumps".into(), 2),
        ]));
        let pumps = stock.available("pumps");
        for x in [42, 46] {
            let mut tank = town.proposed_site(&catalog, "rain-barrel", IVec2::new(x, 36));
            tank.work = catalog.projects["rain-barrel"].work;
            town.plans.push(tank);
        }
        town.tick_services(&catalog, &setup, &mut stock, 0.0, 0.1);
        town.utilities.deliver_water(1, 1, 10.0);
        town.queue_water_connection(&mut stock, 1, 2, 1).unwrap();
        assert_eq!(stock.available("pumps"), pumps - 1);
        assert!(!town.utilities.water_link_exists(1, 2, 1));

        town.tick_water_work(&catalog, &mut stock, site, 0.1, 0.1);
        let worker = town.water_jobs[&1].worker.unwrap();
        assert!(!town.cancel_connection_installation(2, 1, Some(1)));
        assert!(town.cancel_connection_installation(1, 2, Some(1)));
        assert!(town.residents[worker].path.is_empty());
        assert_eq!(stock.available("pumps"), pumps - 1);
        town.queue_water_connection(&mut stock, 1, 2, 1).unwrap();

        stock.receive(&BTreeMap::from([("electrical".into(), 1)]));
        town.queue_power_connection(&mut stock, 1, 2).unwrap();
        assert_eq!(town.pending_connections.len(), 1);

        let mut town: Construction =
            serde_json::from_str(&serde_json::to_string(&town).unwrap()).unwrap();
        assert!(town.valid_water_jobs());
        for step in 1..4_000 {
            let clock = f64::from(step) * 0.1;
            town.tick_water_work(&catalog, &mut stock, site, clock, 0.1);
            if !town.water_jobs.contains_key(&1) && town.pending_connections.is_empty() {
                town.tick_services(&catalog, &setup, &mut stock, clock, 0.1);
                break;
            }
        }
        assert!(town.utilities.water_link_exists(1, 2, 1));
        assert!(town.utilities.power_link_exists(1, 2));
        assert!(town.utilities.water_site(2).unwrap().levels[1] > 0.0);
        let row = (0..town.utilities.water_link_count())
            .find(|&row| town.utilities.is_manual_link(row, false))
            .unwrap();
        town.utilities.remove_manual_link(row, false);
        assert!(!town.utilities.water_link_exists(1, 2, 1));
    }

    #[test]
    fn automatic_sanitation_clears_a_kitchen_blocked_on_water_and_greywater() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let mut town = Construction::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut kitchen = town.proposed_site(&catalog, "kitchen", IVec2::new(44, 36));
        kitchen.work = catalog.projects["kitchen"].work;
        town.plans.push(kitchen);
        town.tick_services(&catalog, &setup, &mut stock, 0.0, 0.1);
        town.utilities.take_water(Some(1), 0, 6.0);
        town.utilities.deliver_water(1, 2, 24.0);
        stock.receive(&catalog.production["cook_greens"].input);
        town.queue_batch(&catalog, &mut stock, 0, "cook_greens");

        town.maintain_water(&catalog, false);
        assert!(!town.water_jobs.contains_key(&1));
        assert!(town.utilities.set_water_policy(1, false, true));
        town.maintain_water(&catalog, false);
        assert!(matches!(
            town.water_jobs[&1].action,
            WaterAction::Sanitation
        ));

        town.water_jobs.remove(&1);
        assert_eq!(town.utilities.service_waste(1), 24.0);
        town.maintain_water(&catalog, false);
        assert!(matches!(
            town.water_jobs[&1].action,
            WaterAction::Carry { channel: 0, .. }
        ));
    }

    #[test]
    fn automatic_drinking_delivery_can_reselect_a_source_that_runs_dry() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut town = Construction::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        for (key, cell) in [("well", IVec2::new(42, 36)), ("coop", IVec2::new(48, 36))] {
            let mut plan = town.proposed_site(&catalog, key, cell);
            plan.work = catalog.projects[key].work;
            town.plans.push(plan);
        }
        town.tick_services(&catalog, &setup, &mut stock, 0.0, 0.1);
        town.utilities.deliver_water(1, 0, 4.0);
        town.queue_water(
            2,
            WaterAction::Carry {
                source: Some(1),
                channel: 0,
            },
        )
        .unwrap();
        town.utilities.take_water(Some(1), 0, 4.0);
        town.tick_water_group(&catalog, &mut stock, site, 1.0, 0.1, None);
        let waiting = &town.water_jobs[&2];
        assert!(waiting.worker.is_none());
        assert_eq!(
            town.water_job_status(2, waiting, 1.0),
            "Waiting for water at the source"
        );
        assert!(!town.water_route_blocked(2, waiting, 1.0));

        town.water_jobs.get_mut(&2).unwrap().automatic = true;
        town.tick_water_group(&catalog, &mut stock, site, 5.0, 0.1, None);
        assert!(matches!(
            town.water_jobs[&2].action,
            WaterAction::Carry {
                source: Some(0),
                channel: 0
            }
        ));
        assert!(town.water_jobs[&2].worker.is_some());
    }

    #[test]
    fn a_dry_coop_receives_drinking_water_for_automatic_care() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut town = Construction::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let ration = &catalog.animal_rations["coop"];
        stock.receive(&BTreeMap::from([("fodder".into(), ration.fodder)]));
        let mut coop = town.proposed_site(&catalog, "coop", IVec2::new(40, -13));
        coop.work = catalog.projects["coop"].work;
        town.plans.push(coop);
        town.tick_services(&catalog, &setup, &mut stock, 0.0, 0.1);
        town.utilities.take_water(Some(1), 0, 6.0);
        town.tick_animals(&catalog, &mut stock, &land, 0.0, 0.1);
        assert!(town.production.jobs.is_empty());

        for step in 0..2_000 {
            let clock = f64::from(step) * 0.1;
            town.tick_water_work(&catalog, &mut stock, site, clock, 0.1);
            if town.utilities.potable_at(1) >= ration.water {
                break;
            }
        }
        assert!(town.utilities.potable_at(1) >= ration.water);
        town.tick_animals(&catalog, &mut stock, &land, 200.0, 0.1);
        assert_eq!(town.production.jobs[0].recipe, "care-coop");
    }

    #[test]
    fn a_hauler_stages_excess_water_and_another_trip_delivers_it() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut town = Construction::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        town.utilities.sync(
            [Facility {
                id: 1,
                kind: "water-storage",
                location: IVec2::new(42, -13),
                size: IVec2::ONE,
                batteries: 0,
                panels: 0,
                working: false,
            }]
            .into_iter(),
        );
        let camp = town.utilities.water_site(0).unwrap();
        assert!(camp.maintain_fresh && camp.maintain_sanitation);
        assert!(town.utilities.water_site(1).unwrap().maintain_fresh);
        assert!(town.utilities.set_water_policy(0, true, false));
        assert!(town.utilities.set_water_policy(1, true, false));
        let amount = |town: &Construction, id| town.utilities.water_site(id).unwrap().levels[1];
        assert_eq!(town.utilities.deliver_water(1, 1, 20.0), 20.0);
        town.residents[0].position = Vec2::new(41.0, -13.0);
        let order = serde_json::from_str(
            r#"{"type":"carry-water","source":1,"site":0,"channel":"irrigation"}"#,
        )
        .unwrap();
        town.lab_order(
            &catalog,
            &mut stock,
            site,
            TownClock {
                seconds: 0.0,
                round_trip_km: setup.round_trip_km(),
            },
            &order,
            setup.richness(),
        )
        .unwrap();
        town.utilities.deliver_water(0, 1, 60.0);
        assert_eq!(
            town.water_job_status(0, &town.water_jobs[&0], 0.0),
            "Waiting for space at the destination"
        );
        town.utilities.take_water(Some(0), 1, 60.0);
        for cell in approach_points(IVec2::new(42, -13), IVec2::ONE, town.residents[0].position) {
            let obstacle = town.proposed_site(&catalog, "supply-5", cell);
            town.plans.push(obstacle);
        }
        town.tick_water_work(&catalog, &mut stock, site, 0.0, 0.1);
        assert_eq!(amount(&town, 1), 20.0);
        assert!(
            town.lab_stop_reason(super::super::LabStop::Blocked, 0.0)
                .is_some()
        );
        assert!(
            town.water_panel(0, Some(1), 1, 0.0)
                .contains("Waiting for access")
        );
        town.plans.clear();
        town.tick_water_work(&catalog, &mut stock, site, 3.0, 0.1);
        assert!(
            town.lab_stop_reason(super::super::LabStop::Blocked, 3.0)
                .is_none()
        );
        assert_eq!(amount(&town, 0), 0.0);
        assert_eq!(amount(&town, 1), 8.0);
        assert_eq!(town.water_jobs[&0].carried, 12.0);
        town.utilities.deliver_water(0, 1, 58.0);

        for step in 31..400 {
            town.tick_water_work(&catalog, &mut stock, site, f64::from(step) * 0.1, 0.1);
            if matches!(town.water_jobs[&0].phase, WaterPhase::Staged(_)) {
                break;
            }
        }
        assert_eq!(amount(&town, 0), 60.0);
        assert_eq!(town.water_jobs[&0].carried, 10.0);
        assert!(
            town.water_job_status(0, &town.water_jobs[&0], 40.0)
                .starts_with("Destination full")
        );
        assert!(!town.working_water(0));
        let json = serde_json::to_string(&town).unwrap();
        let mut town: Construction = serde_json::from_str(&json).unwrap();
        assert!(town.valid_water_jobs());

        town.utilities.take_water(Some(0), 1, 11.0);
        for step in 400..500 {
            town.tick_water_work(&catalog, &mut stock, site, f64::from(step) * 0.1, 0.1);
        }
        assert!(town.water_jobs.is_empty());
        assert_eq!(amount(&town, 0), 59.0);
        assert_eq!(amount(&town, 1), 8.0);

        assert!(town.utilities.drink(0, 12.0));
        town.queue_water(0, WaterAction::Purify).unwrap();
        for step in 500..900 {
            town.tick_water_work(&catalog, &mut stock, site, f64::from(step) * 0.1, 0.1);
        }
        assert!(town.water_jobs.is_empty());
        assert_eq!(amount(&town, 0), 47.0);
        assert_eq!(town.utilities.potable_at(0), 40.0);
        assert!(
            town.event_log(0, "")
                .1
                .contains("purified 12.0 L of drinking water")
        );

        assert!(town.utilities.receive_sewage(0, 7.5));
        town.queue_water(0, WaterAction::Sanitation).unwrap();
        for step in 900..1_900 {
            town.tick_water_work(&catalog, &mut stock, site, f64::from(step) * 0.1, 0.1);
        }
        assert!(town.water_jobs.is_empty());
        assert_eq!(town.utilities.water_site(0).unwrap().levels[3], 0.0);
        assert!(
            town.event_log(0, "")
                .1
                .contains("removed 7.5 L of waste for off-site treatment")
        );
    }
}
