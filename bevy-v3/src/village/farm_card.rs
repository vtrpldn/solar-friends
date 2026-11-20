//! Cultivation controls for the selected growing site.
use super::*;
use crate::{
    construction::FarmControl,
    farming::{Bed, Crop, FarmAction, Stage},
    theme,
    ui_font::ui_font_styled,
};

#[derive(Component)]
struct FarmCard(Vec<(Entity, Vec<Item>)>);

#[derive(Component)]
struct Active(bool);

#[derive(Clone, Copy, PartialEq, Component)]
enum Command {
    Close,
    Scope(bool),
    Bed(usize),
    Crop(Crop),
    Density(f64),
    Water(bool),
    Residues(bool),
    Work(FarmAction),
    Balances,
}

#[derive(PartialEq)]
enum Item {
    Text(String, u16),
    Chip(String),
    Growth(u8),
    Button(Command, String, bool, bool),
}

use Item::{Button as Control, Text as Label};
type Rows = Vec<Vec<Item>>;

fn caption(label: &str) -> Vec<Item> {
    vec![Label(label.into(), 750)]
}

fn stepper(label: String, previous: Command, next: Command, enabled: bool) -> Vec<Item> {
    vec![
        Control(previous, "‹".into(), enabled, false),
        Label(label, 600),
        Control(next, "›".into(), enabled, false),
    ]
}

fn selected(v: &Village, picker: &PanelPicker) -> Option<usize> {
    let c = &v.construction;
    (!picker.open
        && !v.map_input_blocked()
        && !v.advance_open()
        && !v.planning_roads()
        && !v.terrain_editor.open
        && v.utility_panel.is_none()
        && !c.menu
        && !c.production.open
        && c.farming.open
        && c.has_selected_plot())
    .then_some(c.production.selected)
    .flatten()
}

fn common<T: Copy + PartialEq>(beds: &[&Bed], value: impl Fn(&Bed) -> T) -> Option<T> {
    let first = value(beds.first()?);
    beds.iter().all(|bed| value(bed) == first).then_some(first)
}

fn model(v: &Village, site: usize, catalog: &Catalog, clock: TownClock) -> Rows {
    let c = &v.construction;
    let f = &c.farming;
    let beds = &f.plots[&site].beds;
    let count = beds.len();
    if count == 0 {
        return vec![caption("No planting beds")];
    }
    let index = f.bed.min(count - 1);
    let whole = f.whole_plot;
    let bed = &beds[index];
    let mut stages = std::collections::BTreeMap::new();
    let mut care = Vec::new();
    let mut planting = Vec::new();
    let mut scope = Vec::new();
    let mut summary = Vec::new();
    for (i, b) in beds.iter().enumerate() {
        let stage = c.cultivation_stage(site, i, clock.seconds);
        let stage = if matches!(b.stage, Stage::Growing | Stage::Harvestable | Stage::Failed)
            || stage == "Planting"
        {
            format!("{}: {stage}", b.crop.label())
        } else {
            stage.into()
        };
        *stages.entry(stage).or_insert(0usize) += 1;
        if whole || i == index {
            let busy = f.jobs.iter().any(|j| j.site == site && j.bed == i);
            scope.push(b);
            if !busy {
                care.push(b);
                if b.editable() {
                    planting.push(b);
                }
            }
        }
    }
    for (stage, n) in stages {
        summary.push(Item::Chip(format!("{n} {stage}")));
    }
    let area: f64 = beds.iter().map(Bed::area).sum();
    let mut rows = vec![
        caption("FOOD & FARMING"),
        vec![Label(
            format!("{} cultivation", c.cultivation_name(site)),
            700,
        )],
        vec![Label(format!("{count} beds on {area:.1} m²"), 400)],
        summary,
        vec![
            Control(Command::Scope(true), "Whole plot".into(), true, whole),
            Control(Command::Scope(false), "One bed".into(), true, !whole),
        ],
    ];
    if !whole {
        rows.push(stepper(
            format!("Bed {} of {count}", index + 1),
            Command::Bed((index + count - 1) % count + 1),
            Command::Bed((index + 1) % count + 1),
            count > 1,
        ));
        rows.push(vec![Label(
            format!(
                "{}: {}  ({:.0}%)",
                bed.crop.label(),
                c.cultivation_stage(site, index, clock.seconds),
                bed.growth * 100.
            ),
            600,
        )]);
        if matches!(bed.stage, Stage::Growing | Stage::Harvestable) {
            rows.push(vec![Item::Growth(
                (bed.growth.clamp(0., 1.) * 100.).round() as u8,
            )]);
            if let Some((days, _)) = bed.harvest_timing(clock.seconds) {
                rows.push(vec![Label(
                    format!(
                        "{:.1} kg recoverable, {days:.1} days left to harvest",
                        bed.yield_kg(clock.seconds)
                    ),
                    600,
                )]);
            } else if bed.moisture < 0.2 {
                rows.push(vec![Label("Wilting. Restore irrigation.".into(), 600)]);
            }
        }
        rows.push(vec![Label(
            format!(
                "Moisture {:.0}%    Fertility {:.0}%",
                bed.moisture * 100.,
                bed.fertility * 100.
            ),
            400,
        )]);
    }
    rows.push(caption("BED WORK"));
    let queued = scope.len() - care.len();
    if queued > 0 {
        rows.push(vec![Label(format!("Beds with work queued: {queued}"), 600)]);
    }
    for (action, name) in FarmAction::ALL.into_iter().zip([
        "Prepare soil",
        "Sow",
        "Harvest",
        "Clear crop",
        "Amend soil",
        "Collect residues",
    ]) {
        let mut reason = None;
        let mut enabled = false;
        if !c.utilities.enabled(site) {
            reason = Some("Reopen this growing site.".into());
        } else {
            for b in &care {
                match b.requirements(action, clock.seconds) {
                    Ok((inputs, _)) => {
                        match c.farm_supply_check(&inputs, action, catalog, &v.stock, clock) {
                            Ok(()) => {
                                enabled = true;
                                break;
                            }
                            Err(message) => {
                                reason = Some(message);
                            }
                        }
                    }
                    Err(message) if reason.is_none() => {
                        reason = Some(
                            match (action, b.stage) {
                                (FarmAction::Prepare, Stage::Prepared) => {
                                    "Soil is ready. Choose Sow."
                                }
                                (
                                    FarmAction::Plant,
                                    Stage::Growing | Stage::Harvestable | Stage::Failed,
                                ) => "Harvest or clear the crop, then prepare the soil.",
                                (FarmAction::Harvest, Stage::Unprepared | Stage::Prepared) => {
                                    "Sow a crop and let it ripen."
                                }
                                _ => message,
                            }
                            .into(),
                        )
                    }
                    Err(_) => {}
                }
            }
        }
        let confirm = action == FarmAction::Clear
            && f.pending_crop_clear == Some((site, (!whole).then_some(index)));
        let mut row = vec![Control(
            Command::Work(action),
            if confirm { "Confirm clear crop" } else { name }.into(),
            enabled,
            enabled,
        )];
        if !enabled {
            row.push(Label(
                reason.unwrap_or_else(|| "Wait for queued work to finish.".into()),
                400,
            ));
        }
        rows.push(row);
    }
    if !f.notice.is_empty() {
        rows.push(vec![Label(
            f.notice
                .replace(" or press 4 again", "")
                .replace(" · ", ", "),
            400,
        )]);
    }
    rows.push(caption("PLANTING & CARE"));
    let crop = common(&planting, |b| b.crop);
    let ci = Crop::ALL.iter().position(|c| Some(*c) == crop);
    let crops = Crop::ALL.len();
    rows.push(stepper(
        format!(
            "Crop: {}",
            crop.map_or(
                if planting.is_empty() {
                    "Locked"
                } else {
                    "Mixed"
                },
                Crop::label
            )
        ),
        Command::Crop(Crop::ALL[ci.map_or(crops - 1, |i| (i + crops - 1) % crops)]),
        Command::Crop(Crop::ALL[ci.map_or(0, |i| (i + 1) % crops)]),
        !planting.is_empty(),
    ));
    let density = common(&planting, |b| b.density);
    let spacing = [0.5, 1., 1.5];
    let di = spacing.iter().position(|d| Some(*d) == density);
    rows.push(stepper(
        format!(
            "Spacing: {}",
            di.map_or(
                if planting.is_empty() {
                    "Locked"
                } else {
                    "Mixed"
                },
                |i| ["Wide", "Standard", "Dense"][i]
            )
        ),
        Command::Density(spacing[di.map_or(2, |i| (i + 2) % 3)]),
        Command::Density(spacing[di.map_or(0, |i| (i + 1) % 3)]),
        !planting.is_empty(),
    ));
    if planting.is_empty() {
        rows.push(vec![Label(
            "Finish queued work or clear a bed to change planting settings.".into(),
            400,
        )]);
    }
    for (title, values, current, commands) in [
        (
            "IRRIGATION",
            ["On", "Off"],
            common(&care, |b| b.irrigation),
            [Command::Water(true), Command::Water(false)],
        ),
        (
            "AFTER HARVEST",
            ["Collect residues", "Leave cover"],
            common(&care, |b| b.collect_residues),
            [Command::Residues(true), Command::Residues(false)],
        ),
    ] {
        rows.push(caption(title));
        rows.push(
            commands
                .into_iter()
                .enumerate()
                .map(|(i, cmd)| {
                    Control(
                        cmd,
                        values[i].into(),
                        !care.is_empty(),
                        current == Some(i == 0),
                    )
                })
                .collect(),
        );
    }
    rows.push(vec![Control(
        Command::Balances,
        if f.show_balances {
            "Hide balances"
        } else {
            "Show balances"
        }
        .into(),
        true,
        f.show_balances,
    )]);
    if f.show_balances {
        for (name, amount, unit) in [
            (
                "Rain",
                scope.iter().map(|b| b.rain_liters).sum::<f64>(),
                "L",
            ),
            (
                "Irrigation",
                scope.iter().map(|b| b.irrigated_liters).sum(),
                "L",
            ),
            (
                "Evaporated",
                scope.iter().map(|b| b.evaporated_liters).sum(),
                "L",
            ),
            ("Drained", scope.iter().map(|b| b.drained_liters).sum(), "L"),
            (
                "Standing crop",
                scope.iter().map(|b| b.standing_biomass()).sum(),
                "kg",
            ),
            ("Residues", scope.iter().map(|b| b.residue_kg).sum(), "kg"),
            ("Compost", scope.iter().map(|b| b.amendment_kg).sum(), "kg"),
            (
                "Soil organic matter",
                scope.iter().map(|b| b.soil_organic_kg).sum(),
                "kg",
            ),
            (
                "Decomposition losses",
                scope.iter().map(|b| b.decomposed_gas_kg).sum(),
                "kg",
            ),
        ] {
            rows.push(vec![Label(format!("{name}   {amount:.1} {unit}"), 400)]);
        }
    }
    rows.push(vec![Control(
        Command::Close,
        "Close cultivation".into(),
        true,
        false,
    )]);
    rows
}

pub(super) fn install(app: &mut App) {
    app.add_systems(Update, (input, refresh, paint).chain().after(village_input));
}

pub(super) fn spawn(menu: &mut ChildSpawnerCommands, _: &AssetServer) {
    menu.spawn((
        FarmCard(Vec::new()),
        theme::panel_node(Node {
            display: Display::None,
            flex_direction: FlexDirection::Column,
            width: percent(100),
            flex_shrink: 0.,
            row_gap: px(5),
            padding: UiRect::all(px(10)),
            ..default()
        }),
        theme::panel(),
    ));
}

fn draw(row: &mut ChildSpawnerCommands, item: &Item, assets: &AssetServer) {
    match item {
        Label(value, weight) => {
            let (size, color) = match weight {
                750 => (11., theme::CAPTION),
                700 => (21., theme::INK),
                _ => (14., theme::INK),
            };
            row.spawn((
                Text::new(value),
                ui_font_styled(
                    assets,
                    size,
                    if *weight == 700 { 750 } else { *weight },
                    color,
                ),
            ));
        }
        Item::Growth(value) => {
            row.spawn((
                Node {
                    width: percent(100),
                    height: px(6),
                    border_radius: BorderRadius::all(px(3)),
                    overflow: Overflow::clip(),
                    ..default()
                },
                BackgroundColor(theme::TRACK),
            ))
            .with_child((
                Node {
                    width: percent(*value as f32),
                    height: percent(100),
                    ..default()
                },
                BackgroundColor(theme::LEAF),
            ));
        }
        Item::Chip(value) => {
            row.spawn((
                Node {
                    padding: UiRect::axes(px(7), px(3)),
                    border_radius: BorderRadius::all(px(8)),
                    ..default()
                },
                BackgroundColor(theme::ACTIVE),
            ))
            .with_child((
                Text::new(value),
                ui_font_styled(assets, 13., 600, theme::INK),
            ));
        }
        Control(cmd, label, enabled, active) => {
            let mut entity = row.spawn((
                theme::button_node(Node {
                    padding: UiRect::axes(px(9), px(4)),
                    ..default()
                }),
                theme::button(),
            ));
            if *enabled {
                entity.insert((Button, *cmd, Active(*active)));
            }
            let mut fill = BackgroundColor::default();
            let mut border = BorderColor::default();
            let mut shadow = BoxShadow::default();
            theme::paint_button(
                Interaction::None,
                *enabled,
                *active,
                &mut fill,
                &mut border,
                &mut shadow,
            );
            entity.insert((fill, border, shadow)).with_child((
                Text::new(label),
                ui_font_styled(
                    assets,
                    14.,
                    600,
                    if *enabled { theme::INK } else { theme::MUTED },
                ),
            ));
        }
    }
}

#[allow(clippy::type_complexity)]
fn paint(
    buttons: Query<
        (
            &Active,
            &Interaction,
            &mut BackgroundColor,
            &mut BorderColor,
            &mut BoxShadow,
        ),
        Changed<Interaction>,
    >,
) {
    for (active, interaction, mut fill, mut edge, mut shadow) in buttons {
        theme::paint_button(
            *interaction,
            true,
            active.0,
            &mut fill,
            &mut edge,
            &mut shadow,
        );
    }
}

#[allow(clippy::too_many_arguments)]
fn refresh(
    mut commands: Commands,
    v: Res<Village>,
    picker: Res<PanelPicker>,
    catalog: Res<Catalog>,
    setup: Res<WorldSetup>,
    assets: Res<AssetServer>,
    mut card: Single<(Entity, &mut Node, &mut FarmCard)>,
) {
    let (root, node, card) = &mut *card;
    let previous = &mut card.0;
    let Some(site) = selected(&v, &picker) else {
        node.display = Display::None;
        return;
    };
    node.display = Display::Flex;
    let rows = model(
        &v,
        site,
        &catalog,
        TownClock {
            seconds: v.clock,
            round_trip_km: setup.round_trip_km(),
        },
    );
    let keep = rows.len().min(previous.len());
    for (id, _) in previous.drain(keep..) {
        commands.entity(id).despawn();
    }
    for (i, items) in rows.into_iter().enumerate() {
        let id = if let Some((id, old)) = previous.get_mut(i) {
            if *old == items {
                continue;
            }
            commands.entity(*id).despawn_children();
            *id
        } else {
            commands
                .spawn((
                    ChildOf(*root),
                    Node {
                        align_items: AlignItems::Center,
                        flex_wrap: FlexWrap::Wrap,
                        column_gap: px(6),
                        row_gap: px(3),
                        ..default()
                    },
                ))
                .id()
        };
        commands.entity(id).with_children(|row| {
            for item in &items {
                draw(row, item, &assets);
            }
        });
        if i == previous.len() {
            previous.push((id, items));
        } else {
            previous[i].1 = items;
        }
    }
}

fn input(
    mut v: ResMut<Village>,
    picker: Res<PanelPicker>,
    catalog: Res<Catalog>,
    setup: Res<WorldSetup>,
    buttons: Query<(&Command, &Interaction), Changed<Interaction>>,
) {
    if selected(&v, &picker).is_none() {
        return;
    }
    let Some((&cmd, _)) = buttons.iter().find(|(_, i)| **i == Interaction::Pressed) else {
        return;
    };
    let v = &mut *v;
    let action = match cmd {
        Command::Close => {
            v.construction.toggle_beds();
            return;
        }
        Command::Bed(n) => {
            v.construction.select_bed_number(n);
            return;
        }
        Command::Scope(whole) if whole == v.construction.farming.whole_plot => return,
        Command::Scope(_) => FarmControl::WholePlot,
        Command::Crop(c) => FarmControl::Crop(Some(c)),
        Command::Density(d) => FarmControl::Density(Some(d)),
        Command::Water(on) => FarmControl::Irrigation(Some(on)),
        Command::Residues(on) => FarmControl::Residues(Some(on)),
        Command::Work(a) => FarmControl::Work(a),
        Command::Balances => FarmControl::Balances,
    };
    v.construction.apply_farm_control(
        &catalog,
        &mut v.stock,
        action,
        TownClock {
            seconds: v.clock,
            round_trip_km: setup.round_trip_km(),
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::farming::Plot;

    fn garden_app() -> App {
        let mut app = App::new();
        app.add_plugins((
            MinimalPlugins,
            AssetPlugin::default(),
            crate::ui_font::UiFontPlugin,
        ))
        .init_asset::<Font>()
        .init_resource::<Village>()
        .init_resource::<Catalog>()
        .init_resource::<PanelPicker>()
        .init_resource::<WorldSetup>()
        .add_systems(
            Startup,
            |mut commands: Commands, assets: Res<AssetServer>| {
                commands
                    .spawn(Node::default())
                    .with_children(|menu| spawn(menu, &assets));
            },
        );
        install(&mut app);
        let mut village = app.world_mut().resource_mut::<Village>();
        village.stock.sandbox = true;
        village
            .construction
            .farming
            .plots
            .insert(0, Plot::new("garden", IVec2::splat(4)).unwrap());
        village.construction.production.selected = Some(0);
        app
    }

    fn display(app: &mut App) -> Display {
        app.world_mut()
            .query_filtered::<&Node, With<FarmCard>>()
            .single(app.world())
            .unwrap()
            .display
    }

    #[test]
    fn selected_garden_shows_card_only_while_cultivation_is_open() {
        let mut app = garden_app();
        app.update();
        assert_eq!(display(&mut app), Display::None);
        app.world_mut()
            .resource_mut::<Village>()
            .construction
            .toggle_beds();
        app.update();
        assert_eq!(display(&mut app), Display::Flex);
        app.world_mut()
            .resource_mut::<Village>()
            .construction
            .production
            .selected = None;
        app.update();
        assert_eq!(display(&mut app), Display::None);
    }

    fn press(app: &mut App, wanted: Command) {
        let world = app.world_mut();
        let (_, mut interaction) = world
            .query_filtered::<(&Command, &mut Interaction), With<Button>>()
            .iter_mut(world)
            .find(|(cmd, _)| **cmd == wanted)
            .unwrap();
        *interaction = Interaction::Pressed;
        app.update();
    }

    #[test]
    fn crop_stepper_and_prepare_button_apply_to_the_whole_garden() {
        let mut app = garden_app();
        app.world_mut()
            .resource_mut::<Village>()
            .construction
            .toggle_beds();
        app.update();
        let next = app.world().resource::<Village>().construction.farming.plots[&0].beds[0]
            .crop
            .next();
        press(&mut app, Command::Crop(next));
        assert!(
            app.world().resource::<Village>().construction.farming.plots[&0]
                .beds
                .iter()
                .all(|b| b.crop == next)
        );
        press(&mut app, Command::Work(FarmAction::Prepare));
        let farming = &app.world().resource::<Village>().construction.farming;
        assert_eq!(farming.jobs.len(), farming.plots[&0].beds.len());
        assert!(farming.jobs.iter().all(|j| j.action == FarmAction::Prepare));
    }
}
