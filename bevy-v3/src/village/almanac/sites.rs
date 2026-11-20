//! Building cards share the almanac sheet's wheel scrolling.

mod actions;
pub(in crate::village) mod connections;

pub(in crate::village) use actions::{input, paint};

use super::*;
use bevy::ui::FocusPolicy;

#[derive(Component)]
pub(in crate::village) struct SiteList;

#[derive(Component)]
pub(in crate::village) enum Reading {
    Status(usize),
    ActionNote(usize),
    Meter(usize, usize),
}

#[derive(Component)]
pub(in crate::village) struct MeterFill(usize, usize);

struct Meter {
    label: &'static str,
    unit: &'static str,
    level: f64,
    capacity: f64,
    warning: Option<&'static str>,
}

impl Meter {
    fn label(&self) -> String {
        let mut label = format!(
            "{} · {:.1} / {:.1} {}",
            self.label, self.level, self.capacity, self.unit
        );
        if let Some(warning) = self.warning {
            label.push_str(" · Tank ");
            label.push_str(warning);
        }
        label
    }

    fn width(&self) -> Val {
        Val::Percent((self.level / self.capacity).clamp(0., 1.) as f32 * 100.)
    }
}

struct Site {
    id: usize,
    status: String,
    action_note: String,
    meters: Vec<Meter>,
}

impl Site {
    fn new(village: &Village, panel: UtilityPanel, id: usize) -> Option<Self> {
        let utilities = &village.construction.utilities;
        let (status, meters) = if panel == UtilityPanel::Power {
            let meters = utilities
                .battery_meter(id)
                .map(|(level, capacity)| Meter {
                    label: "Battery",
                    unit: "kWh",
                    level,
                    capacity,
                    warning: None,
                })
                .into_iter()
                .collect();
            (utilities.power_site_status(id)?, meters)
        } else {
            let site = utilities.water_site(id)?;
            let meters = ["Drinking water", "Irrigation water", "Greywater", "Sewage"]
                .into_iter()
                .enumerate()
                .filter(|&(channel, _)| site.capacity[channel] > 0.)
                .map(|(channel, label)| Meter {
                    label,
                    unit: "L",
                    level: site.levels[channel],
                    capacity: site.capacity[channel],
                    warning: (channel >= 2)
                        .then(|| {
                            crate::utilities::waste_tank_warning(
                                site.levels[channel],
                                site.capacity[channel],
                            )
                        })
                        .flatten(),
                })
                .collect();
            let mut status = String::from(if site.enabled { "Open" } else { "Switched off" });
            if let Some(job) = village
                .construction
                .water_card_job_status(id, village.clock)
            {
                use std::fmt::Write;
                let _ = write!(status, " · {job}");
            }
            if let Some((area, roof)) = utilities.rain_catchment(id) {
                use std::fmt::Write;
                let _ = write!(status, " · Rain catchment {area:.0} m²");
                if let Some(roof) = roof {
                    let _ = write!(status, " · Includes roof #{roof}");
                }
            }
            (status, meters)
        };
        let action_note = if panel == UtilityPanel::Water {
            actions::water_blockers(&village.construction, id)
        } else {
            String::new()
        };
        Some(Self {
            id,
            status,
            action_note,
            meters,
        })
    }
}

pub(in crate::village) fn spawn_list(card: &mut ChildSpawnerCommands) {
    card.spawn((
        SiteList,
        FocusPolicy::Pass,
        Node {
            display: Display::None,
            flex_direction: FlexDirection::Column,
            flex_shrink: 0.,
            row_gap: px(10),
            padding: UiRect::bottom(px(8)),
            ..default()
        },
    ));
}

fn spawn_site(
    list: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    site: &Site,
    index: usize,
    name: String,
    panel: UtilityPanel,
    construction: &Construction,
) {
    list.spawn((
        FocusPolicy::Pass,
        // A flat inset on the dialog's paper, like the other almanac cards.
        Node {
            flex_direction: FlexDirection::Column,
            padding: UiRect::all(px(14)),
            row_gap: px(5),
            border: UiRect::all(px(1)),
            border_radius: BorderRadius::all(px(14)),
            ..default()
        },
        BackgroundColor(theme::CARD),
        BorderColor::all(theme::SUBTLE_BORDER),
    ))
    .with_children(|card| {
        card.spawn((
            FocusPolicy::Pass,
            Node {
                align_items: AlignItems::Center,
                column_gap: px(8),
                ..default()
            },
        ))
        .with_children(|heading| {
            if let Some(slot) = thumbnails::icon_slot(panel) {
                heading.spawn((
                    thumbnails::ThumbnailImage(slot),
                    FocusPolicy::Pass,
                    ImageNode::default(),
                    Node {
                        width: px(30),
                        height: px(30),
                        flex_shrink: 0.,
                        ..default()
                    },
                ));
            }
            heading.spawn((
                FocusPolicy::Pass,
                Text::new(name),
                ui_font_weight(assets, 17., 750),
            ));
        });
        card.spawn((
            FocusPolicy::Pass,
            Reading::Status(index),
            Text::new(&site.status),
            ui_font_styled(assets, 13., 400, theme::MUTED),
        ));
        for (channel, meter) in site.meters.iter().enumerate() {
            card.spawn((
                FocusPolicy::Pass,
                Reading::Meter(index, channel),
                Text::new(meter.label()),
                ui_font_weight(assets, 13., 600),
            ));
            card.spawn((
                FocusPolicy::Pass,
                Node {
                    height: px(8),
                    border_radius: BorderRadius::MAX,
                    ..default()
                },
                BackgroundColor(theme::TRACK),
            ))
            .with_child((
                FocusPolicy::Pass,
                MeterFill(index, channel),
                Node {
                    width: meter.width(),
                    height: percent(100.),
                    border_radius: BorderRadius::MAX,
                    ..default()
                },
                BackgroundColor(theme::LEAF),
            ));
        }
        actions::spawn(card, assets, construction, panel, site.id);
        if panel == UtilityPanel::Water {
            card.spawn((
                FocusPolicy::Pass,
                Reading::ActionNote(index),
                Text::new(&site.action_note),
                ui_font_styled(assets, 13., 400, theme::MUTED),
            ));
        }
    });
}

fn current_panel(
    village: &Village,
    setup: &WorldSetup,
    saves: &SaveMenu,
    sound: &SoundSettings,
) -> Option<UtilityPanel> {
    visible_panel(village, setup, saves, sound)
        .filter(|panel| matches!(panel, UtilityPanel::Water | UtilityPanel::Power))
}

type SiteLayout = (Option<UtilityPanel>, Vec<(usize, usize)>);

type ListNode<'w, 's> =
    Single<'w, 's, (Entity, &'static mut Node), (With<SiteList>, Without<MeterFill>)>;

pub(in crate::village) fn refresh(
    mut commands: Commands,
    (village, catalog, assets): (Res<Village>, Res<Catalog>, Res<AssetServer>),
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    mut list: ListNode,
    mut readings: Query<(&Reading, &mut Text)>,
    mut fills: Query<(&MeterFill, &mut Node), Without<SiteList>>,
    mut previous: Local<SiteLayout>,
) {
    let panel = current_panel(&village, &setup, &saves, &sound);
    let utilities = &village.construction.utilities;
    let mut sites = Vec::new();
    if let Some(panel) = panel {
        let ids: Vec<_> = if panel == UtilityPanel::Power {
            utilities.power_ids().collect()
        } else {
            utilities.water_ids().collect()
        };
        sites.extend(
            ids.into_iter()
                .filter_map(|id| Site::new(&village, panel, id)),
        );
    }

    let display = if sites.is_empty() {
        Display::None
    } else {
        Display::Flex
    };
    if list.1.display != display {
        list.1.display = display;
    }
    let layout = (
        panel,
        sites
            .iter()
            .map(|site| (site.id, site.meters.len()))
            .collect(),
    );
    if *previous != layout {
        let mut list = commands.entity(list.0);
        list.despawn_related::<Children>();
        if let Some(panel) = panel {
            list.with_children(|list| {
                for (index, site) in sites.iter().enumerate() {
                    let name = village.construction.connection_site_name(&catalog, site.id);
                    spawn_site(
                        list,
                        &assets,
                        site,
                        index,
                        name,
                        panel,
                        &village.construction,
                    );
                }
            });
        }
        *previous = layout;
        return;
    }

    for (reading, mut text) in &mut readings {
        let wanted = match *reading {
            Reading::Status(index) => sites[index].status.clone(),
            Reading::ActionNote(index) => sites[index].action_note.clone(),
            Reading::Meter(index, channel) => sites[index].meters[channel].label(),
        };
        if text.0 != wanted {
            text.0 = wanted;
        }
    }
    for (&MeterFill(index, channel), mut node) in &mut fills {
        let width = sites[index].meters[channel].width();
        if node.width != width {
            node.width = width;
        }
    }
}
