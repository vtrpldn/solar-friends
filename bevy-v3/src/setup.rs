use bevy::{prelude::*, window::PrimaryWindow};
use serde::{Deserialize, Serialize};

use crate::{terrain::Terrain, ui_font::ui_font};

const BIOMES: [&str; 3] = ["Mata Atlântica", "Cerrado", "Caatinga"];
const LANDSCAPES: [&str; 3] = ["Gentle", "Rolling", "Rugged"];
const SAVINGS: [&str; 3] = [
    "Tight · R$3,000",
    "Modest · R$10,000",
    "Comfortable · R$20,000",
];
const SUPPLIES: [&str; 3] = ["Essentials", "Camp", "Prepared"];
const WATER: [&str; 3] = ["Dry", "Seasonal", "Abundant"];

#[derive(Resource, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct WorldSetup {
    #[serde(skip)]
    pub open: bool,
    seed: u32,
    biome: usize,
    landscape: usize,
    water: usize,
    savings: usize,
    supplies: usize,
}

impl Default for WorldSetup {
    fn default() -> Self {
        Self {
            open: true,
            seed: 42,
            biome: 0,
            landscape: 1,
            water: 1,
            savings: 1,
            supplies: 1,
        }
    }
}

impl WorldSetup {
    pub fn session(&self) -> Self {
        Self {
            open: false,
            ..self.clone()
        }
    }

    pub fn valid_save(&self) -> bool {
        self.biome < BIOMES.len()
            && self.landscape < LANDSCAPES.len()
            && self.water < WATER.len()
            && self.savings < SAVINGS.len()
            && self.supplies < SUPPLIES.len()
    }

    pub fn starting_cash(&self) -> u32 {
        [3_000, 10_000, 20_000][self.savings]
    }

    pub fn supply_scale(&self) -> (u32, u32) {
        [(6, 10), (1, 1), (17, 10)][self.supplies]
    }

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
            Action::Savings => SAVINGS[self.savings].into(),
            Action::Supplies => format!("Supplies   ·   {}", SUPPLIES[self.supplies]),
            Action::Seed => format!("Land seed   ·   {}", self.seed),
            Action::Explore => "Enter village".into(),
        }
    }
}

#[derive(Component, Clone, Copy)]
enum Action {
    Biome,
    Landscape,
    Water,
    Savings,
    Supplies,
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

fn spawn_panel(mut commands: Commands, setup: Res<WorldSetup>, assets: Res<AssetServer>) {
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
            panel.spawn((Text::new("Solar Friends"), ui_font(&assets, 30.0)));
            panel.spawn((Text::new("Choose the land"), ui_font(&assets, 18.0)));
            for action in [
                Action::Biome,
                Action::Landscape,
                Action::Water,
                Action::Savings,
                Action::Supplies,
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
                    .with_child((Text::new(setup.label(action)), ui_font(&assets, 17.0)));
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
            Action::Savings => setup.savings = (setup.savings + 1) % SAVINGS.len(),
            Action::Supplies => setup.supplies = (setup.supplies + 1) % SUPPLIES.len(),
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
