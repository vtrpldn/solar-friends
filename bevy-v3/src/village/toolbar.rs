use super::*;

#[derive(Component, Clone, Copy)]
enum Action {
    Build,
    Pause,
    Speed,
    Guide,
    Manage,
    Panel(UtilityPanel),
    ClosePanel,
    Page(bool),
    Project(usize),
    ProjectFilter,
    Resident(usize),
    Home(bool),
    ListedHome(usize),
}

impl Action {
    const PANELS: [(UtilityPanel, &'static str); 10] = [
        (UtilityPanel::Residents, "Residents"),
        (UtilityPanel::Projects, "Projects"),
        (UtilityPanel::Inventory, "Stores"),
        (UtilityPanel::Power, "Power"),
        (UtilityPanel::Water, "Water"),
        (UtilityPanel::Upkeep, "Maintenance"),
        (UtilityPanel::Events, "Events"),
        (UtilityPanel::Finances, "Finances"),
        (UtilityPanel::Trade, "Trade"),
        (UtilityPanel::Pantry, "Pantry"),
    ];

    fn available(self, village: &Village) -> bool {
        if matches!(self, Self::Guide) {
            return !village.construction.editing_search;
        }
        if village.map_input_blocked()
            || village.advance_open()
            || village.planning_roads()
            || village.terrain_editor.open
        {
            return false;
        }
        match self {
            Self::Build => village.utility_panel.is_none(),
            Self::Pause => true,
            Self::Speed => {
                !village.construction.menu
                    && !village.construction.production.open
                    && !village.construction.farming.open
                    && village.utility_panel.is_none()
            }
            Self::Guide => true,
            Self::Manage => !village.construction.menu && !village.construction.is_placing(),
            Self::Panel(
                UtilityPanel::Finances
                | UtilityPanel::Trade
                | UtilityPanel::Pantry
                | UtilityPanel::Upkeep,
            ) => !village.stock.sandbox,
            Self::Panel(_) => true,
            Self::ClosePanel => village.utility_panel.is_some(),
            Self::Project(_) | Self::ProjectFilter => {
                village.utility_panel == Some(UtilityPanel::Projects)
            }
            Self::Resident(_) | Self::Home(_) | Self::ListedHome(_) => {
                village.utility_panel == Some(UtilityPanel::Residents)
            }
            Self::Page(_) => matches!(
                village.utility_panel,
                Some(
                    UtilityPanel::Projects
                        | UtilityPanel::Inventory
                        | UtilityPanel::Events
                        | UtilityPanel::Residents
                )
            ),
        }
    }

    fn label(self, village: &Village, picker: &PanelPicker) -> String {
        match self {
            Self::Build if village.construction.menu => "Close build".into(),
            Self::Build => "Build".into(),
            Self::Pause if village.paused => "Resume".into(),
            Self::Pause => "Pause".into(),
            Self::Speed => format!("{}×", SPEEDS[village.speed].1),
            Self::Guide if village.guide.open() => "Close guide".into(),
            Self::Guide => "Guide".into(),
            Self::Manage if picker.open => "Close menu".into(),
            Self::Manage => "Manage".into(),
            Self::Panel(panel) => Self::PANELS
                .iter()
                .find_map(|(item, label)| (*item == panel).then_some(*label))
                .unwrap_or_default()
                .into(),
            Self::ClosePanel => "Close panel".into(),
            Self::Page(false) => "Previous page".into(),
            Self::Page(true) => "Next page".into(),
            Self::ProjectFilter if village.open_projects_only => "Show all projects".into(),
            Self::ProjectFilter => "Show underway".into(),
            Self::Project(_) => String::new(),
            Self::Resident(index) if index == village.selected_resident => {
                format!("› {}", NAMES[index])
            }
            Self::Resident(index) => NAMES[index].into(),
            Self::Home(true) => "Assign selected home".into(),
            Self::Home(false) => "Clear home assignment".into(),
            Self::ListedHome(_) => String::new(),
        }
    }
}

#[derive(Component)]
struct Toolbar;

#[derive(Component)]
struct PanelMenu;

const HOME_ROWS: usize = 4;

#[derive(Default, Resource)]
struct PanelPicker {
    open: bool,
    home_page: usize,
    visible_homes: [Option<usize>; HOME_ROWS],
}

pub(super) fn install(app: &mut App) {
    app.init_resource::<PanelPicker>()
        .add_systems(Startup, spawn)
        .add_systems(
            Update,
            handle_buttons
                .after(read_camp_pointer)
                .before(village_input),
        )
        .add_systems(Update, refresh.after(village_input));
}

fn visible(village: &Village, setup: &WorldSetup, saves: &SaveMenu, sound: &SoundSettings) -> bool {
    village.camp.is_some() && !setup.open && !saves.open && !sound.open
}

fn spawn(mut commands: Commands, assets: Res<AssetServer>) {
    commands
        .spawn((
            Toolbar,
            Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                bottom: px(20),
                right: px(20),
                column_gap: px(5),
                padding: UiRect::all(px(6)),
                ..default()
            },
            BackgroundColor(Color::srgb_u8(31, 45, 35)),
        ))
        .with_children(|row| {
            for action in [
                Action::Page(false),
                Action::Page(true),
                Action::Build,
                Action::Manage,
                Action::ClosePanel,
                Action::Pause,
                Action::Speed,
                Action::Guide,
            ] {
                spawn_button(row, &assets, action);
            }
            row.spawn((
                PanelMenu,
                Node {
                    display: Display::None,
                    position_type: PositionType::Absolute,
                    right: px(0),
                    bottom: percent(100),
                    width: px(240),
                    flex_wrap: FlexWrap::Wrap,
                    padding: UiRect::all(px(6)),
                    row_gap: px(5),
                    column_gap: px(5),
                    ..default()
                },
                BackgroundColor(Color::srgb_u8(31, 45, 35)),
            ))
            .with_children(|menu| {
                for (panel, _) in Action::PANELS {
                    spawn_button(menu, &assets, Action::Panel(panel));
                }
                for index in 0..NAMES.len() {
                    spawn_button(menu, &assets, Action::Resident(index));
                }
                spawn_button(menu, &assets, Action::Home(true));
                spawn_button(menu, &assets, Action::Home(false));
                for row in 0..HOME_ROWS {
                    spawn_button(menu, &assets, Action::ListedHome(row));
                }
                spawn_button(menu, &assets, Action::ProjectFilter);
                for row in 0..crate::construction::PAGE_KEYS.len() {
                    spawn_button(menu, &assets, Action::Project(row));
                }
            });
        });
}

fn spawn_button(parent: &mut ChildSpawnerCommands, assets: &AssetServer, action: Action) {
    parent
        .spawn((
            action,
            Button,
            Node {
                padding: UiRect::axes(px(10), px(7)),
                ..default()
            },
            BackgroundColor(Color::srgb_u8(58, 78, 61)),
        ))
        .with_child((Text::default(), ui_font(assets, 17.0)));
}

fn handle_buttons(
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    catalog: Res<Catalog>,
    mut village: ResMut<Village>,
    mut picker: ResMut<PanelPicker>,
    keyboard: Res<ButtonInput<KeyCode>>,
    mut camera: Single<&mut VillageCamera>,
    buttons: Query<(&Action, &Interaction), Changed<Interaction>>,
) {
    if !visible(&village, &setup, &saves, &sound) {
        picker.open = false;
        return;
    }
    if keyboard.just_pressed(KeyCode::Escape) || !Action::Manage.available(&village) {
        picker.open = false;
    }
    for (&action, &interaction) in &buttons {
        if interaction == Interaction::Pressed && action.available(&village) {
            match action {
                Action::Build => {
                    village.construction.toggle_build_menu();
                    picker.open = false;
                }
                Action::Pause => village.paused = !village.paused,
                Action::Speed => village.speed = (village.speed + 1) % SPEEDS.len(),
                Action::Guide => {
                    village.guide.toggle();
                    picker.open = false;
                }
                Action::Manage => picker.open = !picker.open,
                Action::Panel(panel) if picker.open => {
                    village.utility_panel = Some(panel);
                    match panel {
                        UtilityPanel::Projects => village.projects_page = 0,
                        UtilityPanel::Inventory => village.inventory_page = 0,
                        UtilityPanel::Events => village.event_page = 0,
                        UtilityPanel::Residents => picker.home_page = 0,
                        _ => {}
                    }
                    picker.open = false;
                }
                Action::ClosePanel => {
                    village.utility_panel = None;
                    picker.open = false;
                }
                Action::Page(forward) if village.utility_panel == Some(UtilityPanel::Residents) => {
                    let pages = village
                        .construction
                        .home_options(&catalog)
                        .count()
                        .div_ceil(HOME_ROWS)
                        .max(1);
                    let page = picker.home_page.min(pages - 1);
                    picker.home_page = (page + if forward { 1 } else { pages - 1 }) % pages;
                }
                Action::Page(forward) => village.change_panel_page(&catalog, forward),
                Action::Project(row) if !picker.open => {
                    village.focus_project_row(&catalog, &setup, &mut camera, row);
                }
                Action::ProjectFilter if !picker.open => {
                    village.open_projects_only = !village.open_projects_only;
                    village.projects_page = 0;
                }
                Action::Resident(index) if !picker.open => village.select_resident(index),
                Action::Home(assign) if !picker.open => village.set_resident_home(&catalog, assign),
                Action::ListedHome(row) if !picker.open => {
                    if let Some(home) = picker.visible_homes[row] {
                        let resident = village.selected_resident;
                        village.housing_notice = village
                            .construction
                            .assign_home(resident, &catalog, home)
                            .unwrap_or_else(str::to_owned);
                    }
                }
                Action::Panel(_)
                | Action::Project(_)
                | Action::ProjectFilter
                | Action::Resident(_)
                | Action::Home(_)
                | Action::ListedHome(_) => {}
            }
        }
    }
}

type ToolbarButtons<'w, 's> = Query<
    'w,
    's,
    (
        &'static Action,
        &'static Interaction,
        &'static Children,
        &'static mut BackgroundColor,
        &'static mut Node,
    ),
    (Without<Toolbar>, Without<PanelMenu>),
>;

fn refresh(
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    (village, catalog): (Res<Village>, Res<Catalog>),
    mut picker: ResMut<PanelPicker>,
    mut toolbar: Single<&mut Node, (With<Toolbar>, Without<PanelMenu>)>,
    mut menu: Single<&mut Node, (With<PanelMenu>, Without<Toolbar>)>,
    mut buttons: ToolbarButtons,
    mut labels: Query<&mut Text>,
) {
    toolbar.display = if visible(&village, &setup, &saves, &sound) {
        Display::Flex
    } else {
        Display::None
    };
    if toolbar.display == Display::None {
        return;
    }
    let show_projects = !picker.open && Action::ProjectFilter.available(&village);
    let show_residents = !picker.open && Action::Home(true).available(&village);
    let projects = if show_projects {
        village.construction.project_page_labels(
            &catalog,
            village.projects_page,
            village.open_projects_only,
        )
    } else {
        Vec::new()
    };
    let homes: Vec<_> = if show_residents {
        village.construction.home_options(&catalog).collect()
    } else {
        Vec::new()
    };
    let home_pages = homes.len().div_ceil(HOME_ROWS).max(1);
    picker.home_page = picker.home_page.min(home_pages - 1);
    let homes = &homes[(picker.home_page * HOME_ROWS)..];
    picker.visible_homes = std::array::from_fn(|row| homes.get(row).map(|option| option.0));
    menu.display =
        if show_projects || show_residents || (picker.open && Action::Manage.available(&village)) {
            Display::Flex
        } else {
            Display::None
        };
    for (&action, &interaction, children, mut background, mut node) in &mut buttons {
        let show = match action {
            Action::Page(_) if village.utility_panel == Some(UtilityPanel::Residents) => {
                show_residents && home_pages > 1
            }
            Action::Page(_) | Action::ClosePanel => action.available(&village),
            Action::Project(row) => projects.get(row).is_some(),
            Action::ProjectFilter => show_projects,
            Action::ListedHome(row) => homes.get(row).is_some(),
            Action::Resident(_) | Action::Home(_) => show_residents,
            Action::Panel(_) => picker.open,
            _ => true,
        };
        node.display = if show { Display::Flex } else { Display::None };
        if !show {
            continue;
        }
        background.0 = if !action.available(&village) {
            Color::srgb_u8(40, 53, 43)
        } else if interaction == Interaction::None {
            Color::srgb_u8(58, 78, 61)
        } else {
            Color::srgb_u8(78, 105, 82)
        };
        if let Ok(mut text) = labels.get_mut(children[0]) {
            let label = match action {
                Action::Project(row) => projects[row].clone(),
                Action::ListedHome(row) => {
                    let (home, name, occupants, beds) = homes[row];
                    format!("{name} #{} · {occupants}/{beds} beds", home + 1)
                }
                _ => action.label(&village, &picker),
            };
            if text.0 != label {
                text.0 = label;
            }
        }
    }
}
