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
            Self::Panel(UtilityPanel::Finances | UtilityPanel::Trade | UtilityPanel::Pantry) => {
                !village.stock.sandbox
            }
            Self::Panel(_) => true,
            Self::ClosePanel => village.utility_panel.is_some(),
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
        }
    }
}

#[derive(Component)]
struct Toolbar;

#[derive(Component)]
struct PanelMenu;

#[derive(Default, Resource)]
struct PanelPicker {
    open: bool,
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
                Action::Build,
                Action::Manage,
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
                spawn_button(menu, &assets, Action::ClosePanel);
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
    mut village: ResMut<Village>,
    mut picker: ResMut<PanelPicker>,
    keyboard: Res<ButtonInput<KeyCode>>,
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
                    picker.open = false;
                }
                Action::ClosePanel if picker.open => {
                    village.utility_panel = None;
                    picker.open = false;
                }
                Action::Panel(_) | Action::ClosePanel => {}
            }
        }
    }
}

fn refresh(
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    village: Res<Village>,
    picker: Res<PanelPicker>,
    mut toolbar: Single<&mut Node, (With<Toolbar>, Without<PanelMenu>)>,
    mut menu: Single<&mut Node, (With<PanelMenu>, Without<Toolbar>)>,
    mut buttons: Query<(&Action, &Interaction, &Children, &mut BackgroundColor)>,
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
    menu.display = if picker.open && Action::Manage.available(&village) {
        Display::Flex
    } else {
        Display::None
    };
    for (&action, &interaction, children, mut background) in &mut buttons {
        background.0 = if !action.available(&village) {
            Color::srgb_u8(40, 53, 43)
        } else if interaction == Interaction::None {
            Color::srgb_u8(58, 78, 61)
        } else {
            Color::srgb_u8(78, 105, 82)
        };
        if let Ok(mut text) = labels.get_mut(children[0]) {
            let label = action.label(&village, &picker);
            if text.0 != label {
                text.0 = label;
            }
        }
    }
}
