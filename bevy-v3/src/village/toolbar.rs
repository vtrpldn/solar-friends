use super::*;

#[derive(Component, Clone, Copy)]
enum Action {
    Build,
    Pause,
    Speed,
    Guide,
}

impl Action {
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
        }
    }

    fn label(self, village: &Village) -> String {
        match self {
            Self::Build if village.construction.menu => "Close build".into(),
            Self::Build => "Build".into(),
            Self::Pause if village.paused => "Resume".into(),
            Self::Pause => "Pause".into(),
            Self::Speed => format!("{}×", SPEEDS[village.speed].1),
            Self::Guide if village.guide.open() => "Close guide".into(),
            Self::Guide => "Guide".into(),
        }
    }
}

#[derive(Component)]
struct Toolbar;

pub(super) fn install(app: &mut App) {
    app.add_systems(Startup, spawn)
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
            for action in [Action::Build, Action::Pause, Action::Speed, Action::Guide] {
                row.spawn((
                    action,
                    Button,
                    Node {
                        padding: UiRect::axes(px(10), px(7)),
                        ..default()
                    },
                    BackgroundColor(Color::srgb_u8(58, 78, 61)),
                ))
                .with_child((Text::default(), ui_font(&assets, 17.0)));
            }
        });
}

fn handle_buttons(
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    mut village: ResMut<Village>,
    buttons: Query<(&Action, &Interaction), Changed<Interaction>>,
) {
    if !visible(&village, &setup, &saves, &sound) {
        return;
    }
    for (&action, &interaction) in &buttons {
        if interaction == Interaction::Pressed && action.available(&village) {
            match action {
                Action::Build => village.construction.toggle_build_menu(),
                Action::Pause => village.paused = !village.paused,
                Action::Speed => village.speed = (village.speed + 1) % SPEEDS.len(),
                Action::Guide => village.guide.toggle(),
            }
        }
    }
}

fn refresh(
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    village: Res<Village>,
    mut toolbar: Single<&mut Node, With<Toolbar>>,
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
    for (&action, &interaction, children, mut background) in &mut buttons {
        background.0 = if !action.available(&village) {
            Color::srgb_u8(40, 53, 43)
        } else if interaction == Interaction::None {
            Color::srgb_u8(58, 78, 61)
        } else {
            Color::srgb_u8(78, 105, 82)
        };
        if let Ok(mut text) = labels.get_mut(children[0]) {
            let label = action.label(&village);
            if text.0 != label {
                text.0 = label;
            }
        }
    }
}
