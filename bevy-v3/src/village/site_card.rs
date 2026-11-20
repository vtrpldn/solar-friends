//! Cards in the right-hand `PanelMenu` for:
//! 1. The Recipes panel of a selected production building.
//! 2. A selected natural resource site (tree, stone, clay, forage, etc.) with its Gather action.

use super::*;
use crate::{
    gathering::SelectedSite,
    theme,
    ui_font::{ui_font_styled, ui_font_weight},
};
use bevy::ui::FocusPolicy;

#[derive(Component)]
pub(super) struct NaturalSiteCard;

#[derive(Component)]
pub(super) struct RecipesCard;

#[derive(Component, Clone, Copy, PartialEq, Eq, Debug)]
enum SiteAction {
    Gather,
    Recipe(usize),
    RecipePage(bool),
    FacilityIrrigation,
    CraftWorkspace(bool),
    MoveCraft,
    /// Back to the building's own card.
    Close,
}

#[derive(Component)]
struct ActionButton {
    action: SiteAction,
    enabled: bool,
}

pub(super) fn install(app: &mut App) {
    app.add_systems(
        Update,
        handle_actions
            .after(read_camp_pointer)
            .before(village_input),
    )
    .add_systems(
        Update,
        (refresh_site, refresh_recipes, paint_buttons).after(village_input),
    );
}

pub(super) fn spawn(menu: &mut ChildSpawnerCommands, _assets: &AssetServer) {
    menu.spawn((
        NaturalSiteCard,
        Node {
            display: Display::None,
            width: percent(100),
            flex_direction: FlexDirection::Column,
            row_gap: px(8),
            padding: UiRect::bottom(px(6)),
            ..default()
        },
    ));
    menu.spawn((
        RecipesCard,
        Node {
            display: Display::None,
            width: percent(100),
            flex_direction: FlexDirection::Column,
            row_gap: px(8),
            padding: UiRect::bottom(px(6)),
            ..default()
        },
    ));
}

fn menu_context_open(village: &Village, picker: &toolbar::PanelPicker) -> bool {
    !picker.open
        && village.utility_panel.is_none()
        && !village.construction.menu
        && !village.map_input_blocked()
        && !village.advance_open()
        && !village.planning_roads()
        && !village.terrain_editor.open
}

fn handle_actions(
    setup: Res<WorldSetup>,
    (catalog, land): (Res<Catalog>, Res<Land>),
    mut village: ResMut<Village>,
    picker: Res<toolbar::PanelPicker>,
    buttons: Query<(&ActionButton, &Interaction), Changed<Interaction>>,
) {
    if setup.open || village.camp.is_none() || !menu_context_open(&village, &picker) {
        return;
    }
    for (button, interaction) in &buttons {
        if *interaction != Interaction::Pressed || !button.enabled {
            continue;
        }
        match button.action {
            SiteAction::Gather => {
                let seed = village.terrain(&setup).seed;
                let clock = village.clock;
                village.construction.gathering.queue(
                    &catalog,
                    &land,
                    seed,
                    setup.richness(),
                    clock,
                );
            }
            SiteAction::Recipe(row) => {
                let town = &mut *village;
                town.construction
                    .queue_recipe_row(&catalog, &mut town.stock, row);
            }
            SiteAction::RecipePage(forward) => {
                village.construction.page_recipes(&catalog, forward);
            }
            SiteAction::FacilityIrrigation => {
                village.construction.cycle_facility_irrigation(&catalog);
            }
            SiteAction::CraftWorkspace(forward) => {
                village
                    .construction
                    .cycle_craft_workspace(&catalog, forward);
            }
            SiteAction::MoveCraft => {
                let town = &mut *village;
                town.construction
                    .move_selected_craft(&catalog, &mut town.stock);
            }
            SiteAction::Close => village.construction.toggle_recipes(&catalog),
        }
        return;
    }
}

type ActionButtons<'w, 's> = Query<
    'w,
    's,
    (
        &'static ActionButton,
        &'static Interaction,
        &'static mut BackgroundColor,
        &'static mut BorderColor,
        &'static mut BoxShadow,
    ),
    Or<(Changed<Interaction>, Added<ActionButton>)>,
>;

fn paint_buttons(mut buttons: ActionButtons) {
    for (button, interaction, mut fill, mut edge, mut shadow) in &mut buttons {
        theme::paint_button(
            *interaction,
            button.enabled,
            false,
            &mut fill,
            &mut edge,
            &mut shadow,
        );
    }
}

#[allow(clippy::too_many_arguments)]
fn refresh_site(
    mut commands: Commands,
    (village, setup, catalog): (Res<Village>, Res<WorldSetup>, Res<Catalog>),
    (land, picker, assets): (Res<Land>, Res<toolbar::PanelPicker>, Res<AssetServer>),
    mut card: Single<(Entity, &mut Node), With<NaturalSiteCard>>,
    mut shown: Local<Option<SelectedSite>>,
) {
    let content = (menu_context_open(&village, &picker) && !village.construction.is_placing())
        .then(|| {
            let seed = village.terrain(&setup).seed;
            village.construction.gathering.selected_site(
                &catalog,
                &land,
                (seed, setup.richness(), village.clock),
                |job| {
                    village
                        .construction
                        .gathering_route_blocked(job, village.clock)
                },
            )
        })
        .flatten();
    let display = if content.is_some() {
        Display::Flex
    } else {
        Display::None
    };
    if card.1.display != display {
        card.1.display = display;
    }
    let Some(site) = content else {
        *shown = None;
        return;
    };
    if shown.as_ref() == Some(&site) {
        return;
    }
    let entity = card.0;
    commands.entity(entity).despawn_children();
    commands.entity(entity).with_children(|parent| {
        parent.spawn((
            Text::new(site.state_caption),
            ui_font_styled(&assets, 11.0, 750, theme::CAPTION),
        ));
        parent.spawn((Text::new(&site.name), ui_font_weight(&assets, 20.0, 750)));
        if let Some(fraction) = site.progress {
            spawn_meter(parent, fraction);
        }
        parent
            .spawn((
                Node {
                    flex_direction: FlexDirection::Column,
                    row_gap: px(3),
                    padding: UiRect::axes(px(12), px(9)),
                    border_radius: BorderRadius::all(px(12)),
                    ..default()
                },
                BackgroundColor(theme::ACTIVE),
            ))
            .with_children(|inset| {
                inset.spawn((
                    Text::new(&site.status),
                    ui_font_weight(&assets, 14.0, 450),
                    bevy::text::LineHeight::RelativeToFont(1.35),
                ));
                inset.spawn((
                    Text::new(format!("{} game minutes of work", site.work_minutes)),
                    ui_font_styled(&assets, 13.0, 450, theme::MUTED),
                ));
            });
        if !site.yields.is_empty() {
            parent.spawn((
                Text::new("YIELDS"),
                ui_font_styled(&assets, 11.0, 750, theme::CAPTION),
            ));
            for (name, amount) in &site.yields {
                parent
                    .spawn(Node {
                        justify_content: JustifyContent::SpaceBetween,
                        column_gap: px(8),
                        ..default()
                    })
                    .with_children(|row| {
                        row.spawn((Text::new(name), ui_font_weight(&assets, 13.5, 600)));
                        row.spawn((
                            Text::new(amount),
                            ui_font_styled(&assets, 13.5, 450, theme::MUTED),
                        ));
                    });
            }
        }
        spawn_action_button(
            parent,
            &assets,
            SiteAction::Gather,
            "Gather resource",
            site.can_gather,
        );
        if let Some(reason) = &site.reason {
            parent.spawn((
                Text::new(reason),
                ui_font_styled(&assets, 13.0, 450, theme::MUTED),
                bevy::text::LineHeight::RelativeToFont(1.35),
            ));
        }
        if let Some(notice) = &site.notice
            && site.reason.as_deref() != Some(notice.as_str())
        {
            parent.spawn((
                Text::new(notice),
                ui_font_styled(&assets, 13.0, 450, theme::MUTED),
                bevy::text::LineHeight::RelativeToFont(1.35),
            ));
        }
    });
    *shown = Some(site);
}

#[derive(PartialEq)]
struct RecipePageSnapshot {
    page: usize,
    pages: usize,
    irrigation: Option<&'static str>,
    craft_move: Option<(String, usize)>,
    notice: Option<String>,
    rows: Vec<RecipeRowSnapshot>,
}

#[derive(PartialEq)]
struct RecipeRowSnapshot {
    row: usize,
    name: String,
    work_minutes: u32,
    inputs: Vec<(String, String, String, bool)>,
    outputs: Vec<(String, String)>,
    water_liters: f64,
    notes: Vec<String>,
    action_label: &'static str,
    can_start: bool,
    reason: Option<String>,
}

#[allow(clippy::too_many_arguments)]
fn refresh_recipes(
    mut commands: Commands,
    (village, catalog, picker, assets): (
        Res<Village>,
        Res<Catalog>,
        Res<toolbar::PanelPicker>,
        Res<AssetServer>,
    ),
    mut card: Single<(Entity, &mut Node), With<RecipesCard>>,
    mut shown: Local<Option<RecipePageSnapshot>>,
) {
    let content = menu_context_open(&village, &picker)
        .then(|| village.construction.recipe_page(&catalog, &village.stock))
        .flatten()
        .map(|page| RecipePageSnapshot {
            page: page.page,
            pages: page.pages,
            irrigation: page.irrigation,
            craft_move: page.craft_move,
            notice: page.notice,
            rows: page
                .rows
                .into_iter()
                .map(|row| RecipeRowSnapshot {
                    row: row.row,
                    name: row.name,
                    work_minutes: row.work_minutes,
                    inputs: row.inputs,
                    outputs: row.outputs,
                    water_liters: row.water_liters,
                    notes: row.notes,
                    action_label: row.action_label,
                    can_start: row.can_start,
                    reason: row.reason,
                })
                .collect(),
        });
    let display = if content.is_some() {
        Display::Flex
    } else {
        Display::None
    };
    if card.1.display != display {
        card.1.display = display;
    }
    let Some(page) = content else {
        *shown = None;
        return;
    };
    if shown.as_ref() == Some(&page) {
        return;
    }
    let entity = card.0;
    commands.entity(entity).despawn_children();
    commands.entity(entity).with_children(|parent| {
        // The way back sits at the top, where the player opened this list.
        parent
            .spawn(Node {
                justify_content: JustifyContent::SpaceBetween,
                align_items: AlignItems::Center,
                ..default()
            })
            .with_children(|header| {
                header.spawn((
                    Text::new("RECIPES"),
                    ui_font_styled(&assets, 11.0, 750, theme::CAPTION),
                ));
                spawn_action_button(header, &assets, SiteAction::Close, "Back to building", true);
            });
        if let Some(irrigation) = page.irrigation {
            spawn_stepper(
                parent,
                &assets,
                "IRRIGATION",
                SiteAction::FacilityIrrigation,
                irrigation,
                SiteAction::FacilityIrrigation,
                true,
            );
        }
        if let Some((move_label, count)) = &page.craft_move {
            parent
                .spawn((
                    Node {
                        flex_direction: FlexDirection::Column,
                        row_gap: px(6),
                        padding: UiRect::all(px(10)),
                        border: UiRect::all(px(1)),
                        border_radius: BorderRadius::all(px(12)),
                        ..default()
                    },
                    BackgroundColor(theme::CARD),
                    BorderColor::all(theme::SUBTLE_BORDER),
                ))
                .with_children(|box_node| {
                    if *count > 1 {
                        spawn_stepper(
                            box_node,
                            &assets,
                            "WORKSPACE",
                            SiteAction::CraftWorkspace(false),
                            format!("{count} eligible"),
                            SiteAction::CraftWorkspace(true),
                            true,
                        );
                    }
                    spawn_action_button(box_node, &assets, SiteAction::MoveCraft, move_label, true);
                });
        }
        if let Some(notice) = &page.notice {
            parent
                .spawn((
                    Node {
                        padding: UiRect::axes(px(10), px(8)),
                        border_radius: BorderRadius::all(px(10)),
                        ..default()
                    },
                    BackgroundColor(theme::INSET),
                ))
                .with_child((
                    Text::new(notice),
                    ui_font_styled(&assets, 13.0, 450, theme::MUTED),
                    bevy::text::LineHeight::RelativeToFont(1.35),
                ));
        }
        for row in &page.rows {
            spawn_recipe_row(parent, &assets, row);
        }
        if page.pages > 1 {
            spawn_stepper(
                parent,
                &assets,
                "RECIPE PAGES",
                SiteAction::RecipePage(false),
                format!("{} of {}", page.page + 1, page.pages),
                SiteAction::RecipePage(true),
                true,
            );
        }
    });
    *shown = Some(page);
}

fn spawn_recipe_row(
    parent: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    row: &RecipeRowSnapshot,
) {
    parent
        .spawn((
            Node {
                flex_direction: FlexDirection::Column,
                row_gap: px(6),
                padding: UiRect::all(px(10)),
                border: UiRect::all(px(1)),
                border_radius: BorderRadius::all(px(12)),
                ..default()
            },
            BackgroundColor(theme::CARD),
            BorderColor::all(theme::SUBTLE_BORDER),
        ))
        .with_children(|card| {
            card.spawn(Node {
                justify_content: JustifyContent::SpaceBetween,
                align_items: AlignItems::Baseline,
                column_gap: px(6),
                ..default()
            })
            .with_children(|header| {
                header.spawn((Text::new(&row.name), ui_font_weight(assets, 15.0, 700)));
                header.spawn((
                    Text::new(format!("{} min", row.work_minutes)),
                    ui_font_styled(assets, 12.5, 450, theme::MUTED),
                ));
            });
            if !row.inputs.is_empty() {
                card.spawn((
                    Text::new("INPUTS"),
                    ui_font_styled(assets, 10.5, 750, theme::CAPTION),
                ));
                for (name, needed, available, enough) in &row.inputs {
                    let color = if *enough {
                        theme::MUTED
                    } else {
                        theme::NEED_LOW
                    };
                    card.spawn(Node {
                        justify_content: JustifyContent::SpaceBetween,
                        column_gap: px(6),
                        ..default()
                    })
                    .with_children(|line| {
                        line.spawn((Text::new(name), ui_font_weight(assets, 13.0, 500)));
                        line.spawn((
                            Text::new(format!("{needed} / {available}")),
                            ui_font_styled(assets, 13.0, 450, color),
                        ));
                    });
                }
            }
            if !row.outputs.is_empty() {
                card.spawn((
                    Text::new("OUTPUTS"),
                    ui_font_styled(assets, 10.5, 750, theme::CAPTION),
                ));
                for (name, amount) in &row.outputs {
                    card.spawn(Node {
                        justify_content: JustifyContent::SpaceBetween,
                        column_gap: px(6),
                        ..default()
                    })
                    .with_children(|line| {
                        line.spawn((Text::new(name), ui_font_weight(assets, 13.0, 500)));
                        line.spawn((
                            Text::new(amount),
                            ui_font_styled(assets, 13.0, 450, theme::MUTED),
                        ));
                    });
                }
            }
            if row.water_liters > 0.0 {
                card.spawn((
                    Text::new(format!("Needs {} L of water", row.water_liters)),
                    ui_font_styled(assets, 12.5, 450, theme::MUTED),
                ));
            }
            for note in &row.notes {
                card.spawn((
                    Text::new(note),
                    ui_font_styled(assets, 12.5, 450, theme::MUTED),
                    bevy::text::LineHeight::RelativeToFont(1.35),
                ));
            }
            spawn_action_button(
                card,
                assets,
                SiteAction::Recipe(row.row),
                row.action_label,
                row.can_start,
            );
            if let Some(reason) = &row.reason {
                card.spawn((
                    Text::new(reason),
                    ui_font_styled(assets, 12.5, 450, theme::MUTED),
                    bevy::text::LineHeight::RelativeToFont(1.35),
                ));
            }
        });
}

fn spawn_meter(parent: &mut ChildSpawnerCommands, fraction: f32) {
    parent
        .spawn((
            Node {
                height: px(6),
                flex_shrink: 0.0,
                border_radius: BorderRadius::all(px(3)),
                overflow: Overflow::clip(),
                ..default()
            },
            BackgroundColor(theme::TRACK),
        ))
        .with_child((
            Node {
                width: percent(fraction.clamp(0.0, 1.0) * 100.0),
                height: percent(100),
                ..default()
            },
            BackgroundColor(theme::LEAF),
        ));
}

fn spawn_action_button(
    parent: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    action: SiteAction,
    label: impl Into<String>,
    enabled: bool,
) {
    parent
        .spawn((
            ActionButton { action, enabled },
            Button,
            FocusPolicy::Pass,
            theme::button_node(Node {
                padding: UiRect::axes(px(12), px(6)),
                align_self: AlignSelf::FlexStart,
                ..default()
            }),
            theme::button(),
        ))
        .with_child((
            FocusPolicy::Pass,
            Text::new(label),
            ui_font_weight(assets, 13.0, 600),
        ));
}

fn spawn_stepper(
    parent: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    label: &str,
    previous: SiteAction,
    value: impl Into<String>,
    next: SiteAction,
    enabled: bool,
) {
    parent
        .spawn(Node {
            flex_direction: FlexDirection::Column,
            row_gap: px(4),
            ..default()
        })
        .with_children(|col| {
            col.spawn((
                Text::new(label),
                ui_font_styled(assets, 10.5, 750, theme::CAPTION),
            ));
            col.spawn(Node {
                flex_direction: FlexDirection::Row,
                align_items: AlignItems::Center,
                column_gap: px(8),
                ..default()
            })
            .with_children(|row| {
                spawn_action_button(row, assets, previous, "‹", enabled);
                row.spawn((Text::new(value), ui_font_weight(assets, 13.5, 500)));
                spawn_action_button(row, assets, next, "›", enabled);
            });
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_app() -> App {
        let mut app = App::new();
        app.add_plugins((MinimalPlugins, AssetPlugin::default()))
            .init_asset::<Font>();
        let mut setup = WorldSetup::default();
        setup.open = false;
        let land = Land::generate(&setup);
        let village = Village {
            camp: Some(CLEARING_CAMP),
            arrival_time: ARRIVAL_DURATION,
            ..default()
        };
        app.insert_resource(setup)
            .insert_resource(Catalog::default())
            .insert_resource(land)
            .insert_resource(village)
            .init_resource::<toolbar::PanelPicker>()
            .add_systems(
                Startup,
                |mut commands: Commands, assets: Res<AssetServer>| {
                    commands.spawn(Node::default()).with_children(|menu| {
                        spawn(menu, &assets);
                    });
                },
            )
            .add_systems(
                Update,
                (handle_actions, refresh_site, refresh_recipes).chain(),
            );
        app.update();
        app
    }

    #[test]
    fn natural_site_card_appears_and_gather_queues_job() {
        let mut app = test_app();
        let site_index = {
            let land = app.world().resource::<Land>();
            land.sites().next().expect("at least one natural site").0
        };
        app.world_mut()
            .resource_scope(|world, mut village: Mut<Village>| {
                let land = world.resource::<Land>();
                village
                    .construction
                    .gathering
                    .select(land, Some(site_index));
            });
        app.update();

        let display = app
            .world_mut()
            .query_filtered::<&Node, With<NaturalSiteCard>>()
            .single(app.world())
            .expect("natural site card")
            .display;
        assert_eq!(display, Display::Flex);

        let gather_button = app
            .world_mut()
            .query::<(Entity, &ActionButton)>()
            .iter(app.world())
            .find_map(|(entity, button)| (button.action == SiteAction::Gather).then_some(entity))
            .expect("gather button");
        assert!(
            app.world()
                .resource::<Village>()
                .construction
                .gathering
                .orders
                .is_empty()
        );
        app.world_mut()
            .entity_mut(gather_button)
            .insert(Interaction::Pressed);
        app.update();

        assert!(
            app.world()
                .resource::<Village>()
                .construction
                .gathering
                .orders
                .contains_key(&site_index)
        );
    }

    #[test]
    fn recipes_card_appears_and_pressing_recipe_queues_batch() {
        let mut app = test_app();
        app.world_mut()
            .resource_scope(|world, mut village: Mut<Village>| {
                let catalog = world.resource::<Catalog>();
                village.stock.sandbox = true;
                let key = catalog
                    .projects
                    .iter()
                    .find_map(|(key, project)| {
                        catalog
                            .production
                            .values()
                            .any(|recipe| recipe.kind == project.kind)
                            .then(|| key.clone())
                    })
                    .expect("a production building in catalog");
                village.construction.add_built_test_facility(catalog, &key);
                village.construction.select_built_project(0);
                village.construction.toggle_recipes(catalog);
            });
        app.update();

        let display = app
            .world_mut()
            .query_filtered::<&Node, With<RecipesCard>>()
            .single(app.world())
            .expect("recipes card")
            .display;
        assert_eq!(display, Display::Flex);

        let recipe_button = app
            .world_mut()
            .query::<(Entity, &ActionButton)>()
            .iter(app.world())
            .find_map(|(entity, button)| (button.action == SiteAction::Recipe(0)).then_some(entity))
            .expect("first recipe button");
        assert!(
            app.world()
                .resource::<Village>()
                .construction
                .production
                .jobs
                .is_empty()
        );
        app.world_mut()
            .entity_mut(recipe_button)
            .insert(Interaction::Pressed);
        app.update();

        assert_eq!(
            app.world()
                .resource::<Village>()
                .construction
                .production
                .jobs
                .len(),
            1
        );
    }
}
