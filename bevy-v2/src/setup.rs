use bevy::{prelude::*, window::PrimaryWindow};

use crate::terrain::Terrain;

const BIOMES: [&str; 3] = ["Mata Atlântica", "Cerrado", "Caatinga"];
const LANDSCAPES: [&str; 3] = ["Gentle", "Rolling", "Rugged"];
const WATER: [&str; 3] = ["Dry", "Seasonal", "Abundant"];

#[derive(Resource)]
pub struct WorldSetup {
    pub open: bool,
    seed: u32,
    biome: usize,
    landscape: usize,
    water: usize,
}

impl Default for WorldSetup {
    fn default() -> Self {
        Self {
            open: true,
            seed: 42,
            biome: 0,
            landscape: 1,
            water: 1,
        }
    }
}

impl WorldSetup {
    pub fn terrain(&self) -> Terrain {
        Terrain::new(
            self.seed,
            [0.55, 1.0, 1.5][self.water],
            [0.35, 1.0, 1.7][self.landscape],
        )
    }

    pub fn ground_color(&self) -> Color {
        let [red, green, blue] = [[159, 173, 114], [179, 173, 104], [182, 166, 123]][self.biome];
        Color::srgb_u8(red, green, blue)
    }

    fn label(&self, action: Action) -> String {
        match action {
            Action::Biome => format!("Biome   ·   {}", BIOMES[self.biome]),
            Action::Landscape => format!("Landscape   ·   {}", LANDSCAPES[self.landscape]),
            Action::Water => format!("Water   ·   {}", WATER[self.water]),
            Action::Seed => format!("Land seed   ·   {}", self.seed),
            Action::Explore => "Explore land".into(),
        }
    }
}

#[derive(Component, Clone, Copy)]
enum Action {
    Biome,
    Landscape,
    Water,
    Seed,
    Explore,
}

#[derive(Component)]
struct SetupPanel;

pub struct WorldSetupPlugin;

impl Plugin for WorldSetupPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<WorldSetup>()
            .add_systems(Startup, spawn_panel)
            .add_systems(Update, (setup_input, refresh_panel).chain());
    }
}

fn spawn_panel(mut commands: Commands, setup: Res<WorldSetup>) {
    commands
        .spawn((
            SetupPanel,
            Node {
                position_type: PositionType::Absolute,
                left: px(32),
                top: px(32),
                padding: UiRect::all(px(24)),
                width: px(340),
                flex_direction: FlexDirection::Column,
                row_gap: px(10),
                ..default()
            },
            BackgroundColor(Color::srgb_u8(31, 45, 35)),
        ))
        .with_children(|panel| {
            panel.spawn((Text::new("Solar Friends"), TextFont::from_font_size(30.0)));
            panel.spawn((Text::new("Choose the land"), TextFont::from_font_size(18.0)));
            for action in [
                Action::Biome,
                Action::Landscape,
                Action::Water,
                Action::Seed,
                Action::Explore,
            ] {
                panel
                    .spawn((
                        action,
                        Button,
                        Node {
                            padding: UiRect::axes(px(14), px(10)),
                            ..default()
                        },
                        BackgroundColor(Color::srgb_u8(62, 83, 65)),
                    ))
                    .with_child((
                        Text::new(setup.label(action)),
                        TextFont::from_font_size(17.0),
                    ));
            }
        });
}

fn setup_input(
    mut setup: ResMut<WorldSetup>,
    keyboard: Res<ButtonInput<KeyCode>>,
    buttons: Query<(&Interaction, &Action), Changed<Interaction>>,
    window: Single<&Window, With<PrimaryWindow>>,
) {
    if !window.focused {
        return;
    }
    if !setup.open {
        if keyboard.just_pressed(KeyCode::Escape) {
            setup.open = true;
        }
        return;
    }
    for (interaction, action) in &buttons {
        if *interaction != Interaction::Pressed {
            continue;
        }
        match action {
            Action::Biome => setup.biome = (setup.biome + 1) % BIOMES.len(),
            Action::Landscape => setup.landscape = (setup.landscape + 1) % LANDSCAPES.len(),
            Action::Water => setup.water = (setup.water + 1) % WATER.len(),
            Action::Seed => setup.seed = setup.seed.wrapping_add(1),
            Action::Explore => setup.open = false,
        }
    }
}

fn refresh_panel(
    setup: Res<WorldSetup>,
    mut panel: Single<&mut Node, With<SetupPanel>>,
    buttons: Query<(&Action, &Children)>,
    mut labels: Query<&mut Text>,
) {
    if !setup.is_changed() {
        return;
    }
    panel.display = if setup.open {
        Display::Flex
    } else {
        Display::None
    };
    for (action, children) in &buttons {
        if let Some(child) = children.first()
            && let Ok(mut label) = labels.get_mut(*child)
        {
            label.0 = setup.label(*action);
        }
    }
}
