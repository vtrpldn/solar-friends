use bevy::{
    asset::{RenderAssetUsages, embedded_asset, load_embedded_asset},
    input::mouse::{AccumulatedMouseScroll, MouseScrollUnit},
    prelude::*,
    render::render_resource::{Extent3d, TextureDimension, TextureFormat},
    ui::InteractionDisabled,
    window::PrimaryWindow,
};
use serde::{Deserialize, Serialize};

use crate::{
    save_library::SaveMenu,
    terrain::Terrain,
    theme,
    ui_font::{ui_font, ui_font_styled, ui_font_weight},
};

const BIOMES: [&str; 3] = ["Mata Atlântica", "Cerrado", "Caatinga"];
const LANDSCAPES: [&str; 3] = ["Gentle", "Rolling", "Rugged"];
const RESOURCES: [&str; 3] = ["Sparse", "Balanced", "Rich"];
const TOWN: [&str; 3] = ["Nearby", "Drive", "Remote"];
const SAVINGS: [&str; 3] = [
    "Tight · R$3,000",
    "Modest · R$10,000",
    "Comfortable · R$20,000",
];
const SUPPLIES: [&str; 3] = ["Essentials", "Camp", "Prepared"];
const WATER: [&str; 3] = ["Dry", "Seasonal", "Abundant"];

const PRESET_NAMES: [&str; crate::economy_reference::WORLD_PRESETS.len()] = [
    "Gentle beginning",
    "Starting from scratch",
    "Remote homestead",
];

#[derive(Clone, Copy, Default, PartialEq, Eq, Deserialize, Serialize)]
pub enum Mode {
    #[default]
    Story,
    Sandbox,
}

#[derive(Resource, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct WorldSetup {
    #[serde(skip)]
    pub open: bool,
    #[serde(skip)]
    choosing_land: bool,
    #[serde(skip)]
    restart: u64,
    #[serde(skip)]
    confirming_new: bool,
    #[serde(skip)]
    seed_entry: Option<String>,
    #[serde(default)]
    pub mode: Mode,
    seed: u32,
    biome: usize,
    landscape: usize,
    water: usize,
    #[serde(default = "balanced_resources")]
    resources: usize,
    savings: usize,
    supplies: usize,
    #[serde(default = "balanced_resources")]
    town: usize,
}

fn balanced_resources() -> usize {
    1
}

impl Default for WorldSetup {
    fn default() -> Self {
        let [biome, landscape, water, resources, savings, supplies, town] =
            crate::economy_reference::WORLD_DEFAULTS;
        Self {
            open: true,
            choosing_land: false,
            restart: 0,
            confirming_new: false,
            seed_entry: None,
            mode: Mode::Story,
            seed: 42,
            biome,
            landscape,
            water,
            resources,
            savings,
            supplies,
            town,
        }
    }
}

impl WorldSetup {
    pub fn session(&self) -> Self {
        Self {
            open: false,
            choosing_land: false,
            confirming_new: false,
            seed_entry: None,
            ..self.clone()
        }
    }

    pub fn valid_save(&self) -> bool {
        self.biome < BIOMES.len()
            && self.landscape < LANDSCAPES.len()
            && self.water < WATER.len()
            && self.resources < RESOURCES.len()
            && self.savings < SAVINGS.len()
            && self.supplies < SUPPLIES.len()
            && self.town < TOWN.len()
    }

    pub fn seed(&self) -> u32 {
        self.seed
    }

    fn reroll_seed(&mut self) {
        let time = crate::wall_clock::since_epoch();
        let entropy = time.subsec_nanos() ^ time.as_secs() as u32 ^ self.seed.rotate_left(13);
        let seed = (crate::terrain::land_random(entropy)() * f64::from(u32::MAX)) as u32;
        self.seed = if seed == 0 || seed == self.seed {
            self.seed.wrapping_add(1).max(1)
        } else {
            seed
        };
        self.seed_entry = None;
    }

    pub(crate) fn with_seed(mut self, seed: std::num::NonZeroU32) -> Self {
        self.seed = seed.get();
        self
    }

    pub(crate) fn with_preview_seed(mut self, seed: u32) -> Self {
        self.seed = seed;
        self
    }

    pub fn biome(&self) -> usize {
        self.biome
    }

    pub fn richness(&self) -> f64 {
        [0.6, 1.0, 1.6][self.resources]
    }

    pub fn round_trip_km(&self) -> u32 {
        crate::economy_reference::ROUND_TRIP_KM[self.town]
    }

    pub fn starting_cash(&self) -> u32 {
        crate::economy_reference::STARTING_CASH[self.savings]
    }

    pub fn supply_tier(&self) -> usize {
        self.supplies
    }

    fn plot_summary(&self) -> String {
        if self.mode == Mode::Sandbox {
            return "Unlimited money and supplies\nLand settings still shape this plot.".into();
        }
        let distance = self.round_trip_km();
        let minutes = crate::market::trip_seconds(distance) * 0.45;
        let cost = crate::market::fare_cents(distance) as f64 / 100.0;
        format!(
            "{} · {} supplies\nTown round trip · {distance} km\nAbout {minutes:.0} game minutes · R${cost:.2} fuel",
            SAVINGS[self.savings], SUPPLIES[self.supplies]
        )
    }

    pub fn water_factor(&self) -> f64 {
        [0.55, 1.0, 1.5][self.water]
    }

    pub fn terrain(&self) -> Terrain {
        Terrain::new(
            self.seed,
            self.water_factor(),
            [0.35, 1.0, 1.7][self.landscape],
        )
    }

    pub fn ground_color(&self) -> Color {
        let [red, green, blue] = [[159, 173, 114], [179, 173, 104], [182, 166, 123]][self.biome];
        Color::srgb_u8(red, green, blue)
    }

    fn edit_seed(&mut self, keyboard: &ButtonInput<KeyCode>) {
        let Some(entry) = &mut self.seed_entry else {
            return;
        };
        if keyboard.just_pressed(KeyCode::Escape) {
            self.seed_entry = None;
            return;
        }
        if keyboard.just_pressed(KeyCode::Enter) || keyboard.just_pressed(KeyCode::NumpadEnter) {
            self.apply_seed_entry();
            return;
        }
        Self::edit_seed_digits(entry, keyboard);
    }

    fn apply_seed_entry(&mut self) -> bool {
        let Some(entry) = &self.seed_entry else {
            return true;
        };
        let Ok(value) = entry.parse::<std::num::NonZeroU32>() else {
            return false;
        };
        self.seed = value.get();
        self.seed_entry = None;
        true
    }

    pub(crate) fn edit_seed_digits(entry: &mut String, keyboard: &ButtonInput<KeyCode>) {
        if keyboard.just_pressed(KeyCode::Backspace) {
            entry.pop();
        }
        for (digit, (top, keypad)) in [
            (KeyCode::Digit0, KeyCode::Numpad0),
            (KeyCode::Digit1, KeyCode::Numpad1),
            (KeyCode::Digit2, KeyCode::Numpad2),
            (KeyCode::Digit3, KeyCode::Numpad3),
            (KeyCode::Digit4, KeyCode::Numpad4),
            (KeyCode::Digit5, KeyCode::Numpad5),
            (KeyCode::Digit6, KeyCode::Numpad6),
            (KeyCode::Digit7, KeyCode::Numpad7),
            (KeyCode::Digit8, KeyCode::Numpad8),
            (KeyCode::Digit9, KeyCode::Numpad9),
        ]
        .into_iter()
        .enumerate()
        {
            if entry.len() < 10 && keyboard.any_just_pressed([top, keypad]) {
                entry.push(char::from(b'0' + digit as u8));
            }
        }
    }

    fn preset(&self) -> Option<usize> {
        let settings = [
            self.landscape,
            self.water,
            self.resources,
            self.savings,
            self.supplies,
            self.town,
        ];
        crate::economy_reference::WORLD_PRESETS
            .iter()
            .position(|preset| *preset == settings)
    }

    fn cycle_preset(&mut self, forward: bool) {
        let presets = crate::economy_reference::WORLD_PRESETS;
        let index = match self.preset() {
            Some(index) => (index + if forward { 1 } else { presets.len() - 1 }) % presets.len(),
            None if forward => 0,
            None => presets.len() - 1,
        };
        [
            self.landscape,
            self.water,
            self.resources,
            self.savings,
            self.supplies,
            self.town,
        ] = presets[index];
    }

    pub(crate) const WORLD_OPTIONS: [Action; 7] = [
        Action::Biome,
        Action::Landscape,
        Action::Water,
        Action::Resources,
        Action::Savings,
        Action::Supplies,
        Action::Town,
    ];

    const PICKER_OPTIONS: [Action; 8] = [
        Action::Preset,
        Action::Biome,
        Action::Landscape,
        Action::Water,
        Action::Resources,
        Action::Savings,
        Action::Supplies,
        Action::Town,
    ];

    pub(crate) fn cycle_world_option(&mut self, action: Action, forward: bool) {
        if matches!(action, Action::Preset) {
            self.cycle_preset(forward);
            return;
        }
        let (index, count) = match action {
            Action::Biome => (&mut self.biome, BIOMES.len()),
            Action::Landscape => (&mut self.landscape, LANDSCAPES.len()),
            Action::Water => (&mut self.water, WATER.len()),
            Action::Resources => (&mut self.resources, RESOURCES.len()),
            Action::Savings if self.mode == Mode::Story => (&mut self.savings, SAVINGS.len()),
            Action::Supplies if self.mode == Mode::Story => (&mut self.supplies, SUPPLIES.len()),
            Action::Town => (&mut self.town, TOWN.len()),
            _ => return,
        };
        *index = (*index + if forward { 1 } else { count - 1 }) % count;
    }

    fn picker_caption(action: Action) -> &'static str {
        match action {
            Action::Preset => "STARTING POINT",
            Action::Biome => "BIOME",
            Action::Landscape => "LANDSCAPE",
            Action::Water => "WATER",
            Action::Resources => "RESOURCES",
            Action::Savings => "SAVINGS",
            Action::Supplies => "SUPPLIES",
            Action::Town => "TOWN",
            Action::Seed => "LAND SEED",
            _ => "",
        }
    }

    fn button_value(&self, action: Action, has_village: bool) -> String {
        match action {
            Action::Preset => self
                .preset()
                .map_or("Custom", |index| PRESET_NAMES[index])
                .into(),
            Action::Biome => BIOMES[self.biome].into(),
            Action::Landscape => LANDSCAPES[self.landscape].into(),
            Action::Water => WATER[self.water].into(),
            Action::Resources => RESOURCES[self.resources].into(),
            Action::Savings if self.mode == Mode::Sandbox => "Unlimited".into(),
            Action::Savings => SAVINGS[self.savings].into(),
            Action::Supplies if self.mode == Mode::Sandbox => "Unlimited".into(),
            Action::Supplies => SUPPLIES[self.supplies].into(),
            Action::Town => TOWN[self.town].into(),
            Action::Seed => match &self.seed_entry {
                Some(entry) if entry.parse::<std::num::NonZeroU32>().is_err() => {
                    format!("{entry}|\nUse 1–4294967295 · Esc cancel")
                }
                Some(entry) => format!("{entry}|\nEnter apply · Esc cancel"),
                None => self.seed.to_string(),
            },
            _ => self.label(action, has_village),
        }
    }

    pub(crate) fn label(&self, action: Action, has_village: bool) -> String {
        match action {
            Action::New(Mode::Story) => "New game".into(),
            Action::New(Mode::Sandbox) => "New sandbox".into(),
            Action::Back => "Back to main menu".into(),
            Action::Preset => format!(
                "Starting point   ·   {}",
                self.preset().map_or("Custom", |index| PRESET_NAMES[index])
            ),
            Action::Biome => format!("Biome   ·   {}", BIOMES[self.biome]),
            Action::Landscape => format!("Landscape   ·   {}", LANDSCAPES[self.landscape]),
            Action::Water => format!("Water   ·   {}", WATER[self.water]),
            Action::Resources => format!("Resources   ·   {}", RESOURCES[self.resources]),
            Action::Savings if self.mode == Mode::Sandbox => "Savings   ·   Unlimited".into(),
            Action::Savings => SAVINGS[self.savings].into(),
            Action::Supplies if self.mode == Mode::Sandbox => "Supplies   ·   Unlimited".into(),
            Action::Supplies => format!("Supplies   ·   {}", SUPPLIES[self.supplies]),
            Action::Town => format!("Town   ·   {}", TOWN[self.town]),
            Action::Seed => match &self.seed_entry {
                Some(entry) if entry.parse::<std::num::NonZeroU32>().is_err() => {
                    format!("Seed {entry}|\nUse 1–4294967295 · Esc cancel")
                }
                Some(entry) => format!("Seed {entry}|\nEnter apply · Esc cancel"),
                None => format!("Land seed   ·   {}", self.seed),
            },
            Action::Reroll => "New plot".into(),
            Action::Explore if self.confirming_new => "Confirm new village".into(),
            Action::Explore if has_village => "Start new village".into(),
            Action::Explore => "Enter village".into(),
            Action::CancelNew => "Keep current village".into(),
            Action::Resume => "Resume current village".into(),
            Action::Continue(Mode::Story) => "Continue Story".into(),
            Action::Continue(Mode::Sandbox) => "Continue Sandbox".into(),
            Action::Library => "Saved villages".into(),
            Action::Sound => "Sound settings".into(),
        }
    }
}

#[derive(Component, Clone, Copy)]
pub(crate) enum Action {
    New(Mode),
    Back,
    Preset,
    Biome,
    Landscape,
    Water,
    Resources,
    Savings,
    Supplies,
    Town,
    Seed,
    Reroll,
    Explore,
    CancelNew,
    Resume,
    Continue(Mode),
    Library,
    Sound,
}

impl Action {
    fn enabled(self, mode: Mode) -> bool {
        mode == Mode::Story || !matches!(self, Self::Savings | Self::Supplies)
    }

    fn is_title_action(self) -> bool {
        matches!(
            self,
            Self::New(_) | Self::Resume | Self::Continue(_) | Self::Library | Self::Sound
        )
    }

    fn is_picker_value(self) -> bool {
        matches!(
            self,
            Self::Preset
                | Self::Biome
                | Self::Landscape
                | Self::Water
                | Self::Resources
                | Self::Savings
                | Self::Supplies
                | Self::Town
                | Self::Seed
        )
    }

    fn is_primary(self) -> bool {
        matches!(self, Self::New(Mode::Story) | Self::Explore)
    }
}

#[derive(Component, Clone, Copy)]
struct PickerStep(Action, bool);

#[derive(Component)]
struct ActionValueLabel;

#[derive(Component)]
struct SetupPanel;

#[derive(Component)]
struct TitleBackdrop;

#[derive(Component)]
struct SetupCaption;

#[derive(Component)]
struct SetupHeading;

#[derive(Component)]
struct SetupSubtitle;

#[derive(Component)]
struct TitleActionsGroup;

#[derive(Component)]
struct LandSetupBody;

#[derive(Component)]
struct LandSetupFooter;

#[derive(Component)]
struct PlotPreviewImage;

#[derive(Component)]
struct PlotSummary;

#[derive(Component)]
struct StoryResumeSummary;

const PREVIEW_SIZE: u32 = 128;

#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) struct SetupRefreshSet;

pub struct WorldSetupPlugin;

impl Plugin for WorldSetupPlugin {
    fn build(&self, app: &mut App) {
        embedded_asset!(app, "title-art.png");
        app.init_resource::<WorldSetup>()
            .add_systems(Startup, spawn_panel)
            .add_systems(Update, setup_input)
            .add_systems(
                Update,
                (
                    refresh_panel,
                    refresh_title,
                    paint_setup_buttons,
                    scroll_setup_panel,
                    refresh_preview,
                    refresh_story_resume,
                )
                    .chain()
                    .in_set(SetupRefreshSet)
                    .after(setup_input),
            );
    }
}

fn spawn_action_button(
    parent: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    setup: &WorldSetup,
    action: Action,
    visible: bool,
) {
    let primary = action.is_primary();
    let mut button = parent.spawn((
        action,
        Button,
        theme::button_node(Node {
            display: if visible {
                Display::Flex
            } else {
                Display::None
            },
            padding: UiRect::axes(px(16), px(9)),
            flex_shrink: 0.,
            flex_direction: FlexDirection::Column,
            ..default()
        }),
        theme::button(),
    ));
    if primary {
        button.insert((
            BackgroundColor(theme::INK),
            BorderColor::all(theme::INK),
            BoxShadow::new(Color::srgb_u8(0x26, 0x3d, 0x30), px(0), px(3), px(0), px(0)),
        ));
    }
    button.with_child((
        ActionValueLabel,
        Text::new(setup.button_value(action, false)),
        ui_font_styled(
            assets,
            16.0,
            600,
            if primary { theme::PAPER } else { theme::INK },
        ),
    ));
    if matches!(action, Action::Continue(Mode::Story)) {
        button.with_child((StoryResumeSummary, Text::default(), ui_font(assets, 13.0)));
    }
}

fn spawn_picker_row(
    parent: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    setup: &WorldSetup,
    action: Action,
) {
    parent
        .spawn((
            Node {
                align_items: AlignItems::Center,
                justify_content: JustifyContent::SpaceBetween,
                column_gap: px(10),
                padding: UiRect::axes(px(12), px(7)),
                border: UiRect::all(px(1)),
                border_radius: BorderRadius::all(px(12)),
                flex_shrink: 0.,
                ..default()
            },
            BackgroundColor(theme::CARD),
            BorderColor::all(theme::SUBTLE_BORDER),
        ))
        .with_children(|row| {
            // Clicking the value cycles forward; ‹ and › step in either direction.
            row.spawn((
                action,
                Button,
                Node {
                    flex_grow: 1.,
                    min_width: px(0),
                    flex_direction: FlexDirection::Column,
                    row_gap: px(1),
                    padding: UiRect::axes(px(4), px(2)),
                    border_radius: BorderRadius::all(px(8)),
                    ..default()
                },
                BackgroundColor(Color::NONE),
            ))
            .with_children(|value| {
                value.spawn((
                    Text::new(WorldSetup::picker_caption(action)),
                    ui_font_styled(assets, 10.0, 750, theme::CAPTION),
                ));
                value.spawn((
                    ActionValueLabel,
                    Text::new(setup.button_value(action, false)),
                    ui_font_weight(assets, 15.0, 600),
                ));
            });

            row.spawn(Node {
                column_gap: px(6),
                flex_shrink: 0.,
                ..default()
            })
            .with_children(|arrows| {
                for (forward, symbol) in [(false, "‹"), (true, "›")] {
                    arrows
                        .spawn((
                            PickerStep(action, forward),
                            Button,
                            theme::button_node(Node {
                                width: px(32),
                                height: px(32),
                                justify_content: JustifyContent::Center,
                                align_items: AlignItems::Center,
                                ..default()
                            }),
                            theme::button(),
                        ))
                        .with_child((Text::new(symbol), ui_font_weight(assets, 18.0, 750)));
                }
            });
        });
}

fn spawn_panel(mut commands: Commands, setup: Res<WorldSetup>, assets: Res<AssetServer>) {
    commands
        .spawn((
            TitleBackdrop,
            Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                width: percent(100),
                height: percent(100),
                ..default()
            },
            BackgroundColor(Color::srgb_u8(233, 224, 200)),
            GlobalZIndex(-1),
        ))
        .with_children(|backdrop| {
            backdrop.spawn((
                Node {
                    position_type: PositionType::Absolute,
                    top: px(25),
                    left: px(25),
                    right: px(25),
                    bottom: px(25),
                    border: UiRect::all(px(1)),
                    ..default()
                },
                BorderColor::all(Color::srgb_u8(139, 152, 117)),
            ));
            backdrop.spawn((
                Node {
                    position_type: PositionType::Absolute,
                    top: vh(7),
                    right: vw(6),
                    height: vh(37),
                    aspect_ratio: Some(0.9),
                    ..default()
                },
                ImageNode::new(load_embedded_asset!(&*assets, "title-art.png")),
            ));
        });

    commands
        .spawn((
            SetupPanel,
            UiTransform::default(),
            theme::panel_node(Node {
                position_type: PositionType::Absolute,
                left: px(32),
                top: px(32),
                padding: UiRect::all(px(26)),
                width: px(340),
                max_width: vw(94),
                max_height: vh(92),
                flex_direction: FlexDirection::Column,
                row_gap: px(10),
                overflow: Overflow::scroll_y(),
                ..default()
            }),
            theme::panel(),
            Interaction::default(),
            ScrollPosition::default(),
        ))
        .with_children(|panel| {
            panel.spawn((
                SetupCaption,
                Text::new("YOUR VILLAGE"),
                ui_font_styled(&assets, 11.0, 750, theme::CAPTION),
                Node {
                    display: Display::None,
                    flex_shrink: 0.,
                    ..default()
                },
            ));
            panel.spawn((
                SetupHeading,
                Text::new("Solar Friends"),
                ui_font_weight(&assets, 30.0, 750),
                Node {
                    flex_shrink: 0.,
                    ..default()
                },
            ));
            panel.spawn((
                SetupSubtitle,
                Text::new("Choose the land and the circumstances your friends arrive with."),
                ui_font_styled(&assets, 14.0, 400, theme::MUTED),
                Node {
                    display: Display::None,
                    flex_shrink: 0.,
                    ..default()
                },
            ));

            // Title screen actions.
            panel
                .spawn((
                    TitleActionsGroup,
                    Node {
                        flex_direction: FlexDirection::Column,
                        row_gap: px(8),
                        flex_shrink: 0.,
                        margin: UiRect::top(px(8)),
                        ..default()
                    },
                ))
                .with_children(|title| {
                    for action in [
                        Action::Resume,
                        Action::Continue(Mode::Story),
                        Action::New(Mode::Story),
                        Action::New(Mode::Sandbox),
                        Action::Continue(Mode::Sandbox),
                        Action::Library,
                        Action::Sound,
                    ] {
                        let visible = !matches!(action, Action::Resume | Action::Continue(_));
                        spawn_action_button(title, &assets, &setup, action, visible);
                    }
                });

            // Unified two-column land setup sheet: pickers on the left, plot preview on the right.
            panel
                .spawn((
                    LandSetupBody,
                    Node {
                        display: Display::None,
                        column_gap: px(24),
                        align_items: AlignItems::FlexStart,
                        flex_shrink: 0.,
                        margin: UiRect::top(px(6)),
                        ..default()
                    },
                ))
                .with_children(|body| {
                    body.spawn(Node {
                        flex_grow: 1.,
                        min_width: px(0),
                        flex_direction: FlexDirection::Column,
                        row_gap: px(7),
                        ..default()
                    })
                    .with_children(|pickers| {
                        for action in WorldSetup::PICKER_OPTIONS {
                            spawn_picker_row(pickers, &assets, &setup, action);
                        }
                    });

                    body.spawn(Node {
                        width: px(336),
                        flex_shrink: 0.,
                        flex_direction: FlexDirection::Column,
                        row_gap: px(10),
                        ..default()
                    })
                    .with_children(|preview_col| {
                        preview_col
                            .spawn((
                                Node {
                                    flex_direction: FlexDirection::Column,
                                    align_items: AlignItems::Center,
                                    row_gap: px(8),
                                    padding: UiRect::all(px(14)),
                                    border: UiRect::all(px(1)),
                                    border_radius: BorderRadius::all(px(16)),
                                    ..default()
                                },
                                BackgroundColor(theme::CARD),
                                BorderColor::all(theme::SUBTLE_BORDER),
                            ))
                            .with_children(|card| {
                                card.spawn((
                                    Text::new("PLOT PREVIEW"),
                                    ui_font_styled(&assets, 10.0, 750, theme::CAPTION),
                                    Node {
                                        align_self: AlignSelf::FlexStart,
                                        ..default()
                                    },
                                ));
                                card.spawn((
                                    PlotPreviewImage,
                                    ImageNode::default(),
                                    Node {
                                        width: px(280),
                                        height: px(280),
                                        ..default()
                                    },
                                ));
                                card.spawn((
                                    Text::new(
                                        "Blue river · Tan access road\nDarker ground is higher",
                                    ),
                                    ui_font_styled(&assets, 12.0, 400, theme::MUTED),
                                    Node {
                                        align_self: AlignSelf::FlexStart,
                                        ..default()
                                    },
                                ));
                            });

                        // Seed picker + reroll button.
                        preview_col
                            .spawn((
                                Node {
                                    align_items: AlignItems::Center,
                                    justify_content: JustifyContent::SpaceBetween,
                                    column_gap: px(10),
                                    padding: UiRect::axes(px(12), px(8)),
                                    border: UiRect::all(px(1)),
                                    border_radius: BorderRadius::all(px(12)),
                                    ..default()
                                },
                                BackgroundColor(theme::CARD),
                                BorderColor::all(theme::SUBTLE_BORDER),
                            ))
                            .with_children(|row| {
                                row.spawn((
                                    Action::Seed,
                                    Button,
                                    Node {
                                        flex_grow: 1.,
                                        min_width: px(0),
                                        flex_direction: FlexDirection::Column,
                                        row_gap: px(1),
                                        padding: UiRect::axes(px(4), px(2)),
                                        border_radius: BorderRadius::all(px(8)),
                                        ..default()
                                    },
                                    BackgroundColor(Color::NONE),
                                ))
                                .with_children(|seed| {
                                    seed.spawn((
                                        Text::new(WorldSetup::picker_caption(Action::Seed)),
                                        ui_font_styled(&assets, 10.0, 750, theme::CAPTION),
                                    ));
                                    seed.spawn((
                                        ActionValueLabel,
                                        Text::new(setup.button_value(Action::Seed, false)),
                                        ui_font_weight(&assets, 15.0, 600),
                                    ));
                                });
                                spawn_action_button(row, &assets, &setup, Action::Reroll, true);
                            });

                        // Plot summary inset.
                        preview_col
                            .spawn((
                                Node {
                                    padding: UiRect::axes(px(12), px(10)),
                                    border: UiRect::left(px(3)),
                                    border_radius: BorderRadius::all(px(8)),
                                    ..default()
                                },
                                BackgroundColor(theme::INSET),
                                BorderColor::all(theme::LEAF),
                            ))
                            .with_child((
                                PlotSummary,
                                Text::new(setup.plot_summary()),
                                ui_font_weight(&assets, 13.0, 500),
                            ));
                    });
                });

            // Footer action row on the land setup sheet.
            panel
                .spawn((
                    LandSetupFooter,
                    Node {
                        display: Display::None,
                        justify_content: JustifyContent::SpaceBetween,
                        align_items: AlignItems::Center,
                        column_gap: px(12),
                        padding: UiRect::top(px(14)),
                        margin: UiRect::top(px(6)),
                        border: UiRect::top(px(1)),
                        flex_shrink: 0.,
                        ..default()
                    },
                    BorderColor::all(theme::SUBTLE_BORDER),
                ))
                .with_children(|footer| {
                    spawn_action_button(footer, &assets, &setup, Action::Back, true);
                    footer
                        .spawn(Node {
                            column_gap: px(10),
                            align_items: AlignItems::Center,
                            ..default()
                        })
                        .with_children(|right| {
                            spawn_action_button(right, &assets, &setup, Action::CancelNew, false);
                            spawn_action_button(right, &assets, &setup, Action::Explore, true);
                        });
                });
        });
}

type SetupPanelStyle<'w, 's> = Single<
    'w,
    's,
    (
        &'static mut Node,
        &'static mut UiTransform,
        &'static mut BackgroundColor,
        &'static mut BorderColor,
        &'static mut BoxShadow,
    ),
    (
        With<SetupPanel>,
        Without<TitleBackdrop>,
        Without<SetupCaption>,
        Without<SetupSubtitle>,
        Without<TitleActionsGroup>,
        Without<LandSetupBody>,
        Without<LandSetupFooter>,
    ),
>;

type SetupSectionNodes<'w, 's> = (
    Single<
        'w,
        's,
        &'static mut Node,
        (
            With<TitleBackdrop>,
            Without<SetupPanel>,
            Without<SetupCaption>,
            Without<SetupSubtitle>,
            Without<TitleActionsGroup>,
            Without<LandSetupBody>,
            Without<LandSetupFooter>,
        ),
    >,
    Single<
        'w,
        's,
        &'static mut Node,
        (
            With<SetupCaption>,
            Without<SetupPanel>,
            Without<TitleBackdrop>,
            Without<SetupSubtitle>,
            Without<TitleActionsGroup>,
            Without<LandSetupBody>,
            Without<LandSetupFooter>,
        ),
    >,
    Single<
        'w,
        's,
        &'static mut Node,
        (
            With<SetupSubtitle>,
            Without<SetupPanel>,
            Without<TitleBackdrop>,
            Without<SetupCaption>,
            Without<TitleActionsGroup>,
            Without<LandSetupBody>,
            Without<LandSetupFooter>,
        ),
    >,
    Single<
        'w,
        's,
        &'static mut Node,
        (
            With<TitleActionsGroup>,
            Without<SetupPanel>,
            Without<TitleBackdrop>,
            Without<SetupCaption>,
            Without<SetupSubtitle>,
            Without<LandSetupBody>,
            Without<LandSetupFooter>,
        ),
    >,
    Single<
        'w,
        's,
        &'static mut Node,
        (
            With<LandSetupBody>,
            Without<SetupPanel>,
            Without<TitleBackdrop>,
            Without<SetupCaption>,
            Without<SetupSubtitle>,
            Without<TitleActionsGroup>,
            Without<LandSetupFooter>,
        ),
    >,
    Single<
        'w,
        's,
        &'static mut Node,
        (
            With<LandSetupFooter>,
            Without<SetupPanel>,
            Without<TitleBackdrop>,
            Without<SetupCaption>,
            Without<SetupSubtitle>,
            Without<TitleActionsGroup>,
            Without<LandSetupBody>,
        ),
    >,
);

fn refresh_title(
    setup: Res<WorldSetup>,
    saves: Res<SaveMenu>,
    sound: Res<crate::audio::SoundSettings>,
    (mut backdrop, mut caption, mut subtitle, mut title_group, mut land_body, mut land_footer): SetupSectionNodes,
    mut panel: SetupPanelStyle,
    mut heading: Single<(&mut Text, &mut TextFont, &mut TextColor), With<SetupHeading>>,
) {
    if !setup.is_changed() && !saves.is_changed() && !sound.is_changed() {
        return;
    }
    let title = !setup.choosing_land;
    backdrop.display = if title && setup.open && !saves.open && !sound.open {
        Display::Flex
    } else {
        Display::None
    };
    caption.display = if title { Display::None } else { Display::Flex };
    subtitle.display = if title { Display::None } else { Display::Flex };
    title_group.display = if title { Display::Flex } else { Display::None };
    land_body.display = if title { Display::None } else { Display::Flex };
    land_footer.display = if title { Display::None } else { Display::Flex };

    let (panel, transform, background, border, shadow) = &mut *panel;
    let (text, font, color) = &mut *heading;
    if title {
        panel.left = vw(8);
        panel.top = vh(6);
        panel.width = px(340);
        transform.translation = Val2::ZERO;
        // On the title screen the menu sits on the backdrop like V2's, without a card.
        background.0 = Color::NONE;
        **border = BorderColor::all(Color::NONE);
        **shadow = BoxShadow::default();
        text.0 = "Solar\nFriends".into();
        font.font_size = 66.;
        color.0 = Color::srgb_u8(54, 82, 63);
    } else {
        panel.left = percent(50);
        panel.top = px(28);
        panel.width = px(880);
        transform.translation = Val2::new(percent(-50), px(0));
        background.0 = theme::PAPER;
        **border = BorderColor::all(theme::EDGE);
        **shadow = theme::panel_shadow();
        text.0 = "Choose the land".into();
        font.font_size = 28.;
        color.0 = theme::INK;
    }
}

fn scroll_setup_panel(
    setup: Res<WorldSetup>,
    mut panel: Single<(&Node, &Interaction, &mut ScrollPosition), With<SetupPanel>>,
    scroll: Res<AccumulatedMouseScroll>,
) {
    let (node, interaction, position) = &mut *panel;
    if !setup.choosing_land || node.display == Display::None {
        position.y = 0.;
    } else if **interaction != Interaction::None && scroll.delta.y != 0. {
        let step = match scroll.unit {
            MouseScrollUnit::Line => 34.,
            MouseScrollUnit::Pixel => 1.,
        };
        position.y = (position.y - scroll.delta.y * step).max(0.);
    }
}

type SetupInputQueries<'w, 's> = (
    Query<'w, 's, (&'static Interaction, &'static Action), Changed<Interaction>>,
    Query<'w, 's, (&'static Interaction, &'static PickerStep), Changed<Interaction>>,
);

fn setup_input(
    mut setup: ResMut<WorldSetup>,
    keyboard: Res<ButtonInput<KeyCode>>,
    (buttons, step_buttons): SetupInputQueries,
    window: Single<&Window, With<PrimaryWindow>>,
    mut picker: Option<ResMut<crate::village::PanelPicker>>,
    (mut saves, mut sound, mut village, catalog): (
        ResMut<SaveMenu>,
        ResMut<crate::audio::SoundSettings>,
        ResMut<crate::village::Village>,
        Res<crate::catalog::Catalog>,
    ),
) {
    if !window.focused || saves.open || sound.open {
        return;
    }
    if !setup.open {
        if keyboard.just_pressed(KeyCode::Escape)
            && !village.advance_open()
            && !village.planning_roads()
        {
            if picker.as_mut().is_some_and(|menu| menu.dismiss()) || village.dismiss_game_view() {
                return;
            }
            if let Err(error) = crate::village::save_session(&saves, &village, &catalog) {
                village.save_notice = format!("Could not save village: {error}");
            }
            setup.open = true;
        }
        return;
    }
    if setup.seed_entry.is_some() && keyboard.get_just_pressed().len() > 0 {
        setup.edit_seed(&keyboard);
        return;
    }
    if setup.choosing_land && keyboard.just_pressed(KeyCode::Escape) {
        if setup.confirming_new {
            setup.confirming_new = false;
        } else {
            setup.choosing_land = false;
        }
        return;
    }
    for (interaction, &PickerStep(action, forward)) in &step_buttons {
        if *interaction == Interaction::Pressed && action.enabled(setup.mode) {
            setup.confirming_new = false;
            setup.cycle_world_option(action, forward);
        }
    }
    for (interaction, action) in &buttons {
        if *interaction != Interaction::Pressed || !action.enabled(setup.mode) {
            continue;
        }
        if !matches!(action, Action::Explore) {
            setup.confirming_new = false;
        }
        match action {
            Action::New(mode) => {
                setup.mode = *mode;
                setup.reroll_seed();
                setup.choosing_land = true;
            }
            Action::Back => setup.choosing_land = false,
            Action::Preset
            | Action::Biome
            | Action::Landscape
            | Action::Water
            | Action::Resources
            | Action::Savings
            | Action::Supplies
            | Action::Town => {
                setup.cycle_world_option(*action, true);
            }
            Action::Seed => {
                setup.seed_entry = Some(String::new());
            }
            Action::Reroll => setup.reroll_seed(),
            Action::Explore => {
                if !setup.apply_seed_entry() {
                    continue;
                }
                let autosave_exists = saves
                    .continue_path(setup.mode)
                    .is_ok_and(|path| crate::save::exists(&path));
                if (village.session_setup().is_some() || autosave_exists) && !setup.confirming_new {
                    setup.confirming_new = true;
                } else {
                    if let Err(error) =
                        crate::village::save_active_village(&saves, &village, &catalog)
                    {
                        village.save_notice =
                            format!("Could not preserve the named village: {error}");
                        return;
                    }
                    saves.attached = None;
                    setup.restart = setup.restart.wrapping_add(1);
                    setup.confirming_new = false;
                    setup.choosing_land = false;
                    setup.open = false;
                }
            }
            Action::CancelNew => setup.confirming_new = false,
            Action::Continue(_) | Action::Library => {}
            Action::Sound => sound.open = true,
            Action::Resume => {
                if let Some(active) = village.session_setup() {
                    *setup = active.session();
                }
            }
        }
    }
}

type SetupButtons<'w, 's> = Query<
    'w,
    's,
    (
        Entity,
        &'static Action,
        &'static Children,
        &'static mut Node,
        &'static mut BackgroundColor,
        Has<InteractionDisabled>,
    ),
    (Without<SetupPanel>, Without<PickerStep>),
>;

type StepButtons<'w, 's> = Query<
    'w,
    's,
    (Entity, &'static PickerStep, Has<InteractionDisabled>),
    (Without<SetupPanel>, Without<Action>),
>;

fn refresh_panel(
    mut commands: Commands,
    setup: Res<WorldSetup>,
    mut panel: Single<&mut Node, With<SetupPanel>>,
    (mut buttons, step_buttons): (SetupButtons, StepButtons),
    (village, saves, sound): (
        Res<crate::village::Village>,
        Res<SaveMenu>,
        Res<crate::audio::SoundSettings>,
    ),
    mut labels: Query<(&mut Text, &mut TextColor), With<ActionValueLabel>>,
) {
    if !setup.is_changed() && !saves.is_changed() && !sound.is_changed() {
        return;
    }
    panel.display = if setup.open && !saves.open && !sound.open {
        Display::Flex
    } else {
        Display::None
    };
    let has_village = village.session_setup().is_some();
    let autosave_exists = saves
        .continue_path(setup.mode)
        .is_ok_and(|path| crate::save::exists(&path));
    for (entity, &PickerStep(action, _), disabled) in &step_buttons {
        let enabled = action.enabled(setup.mode);
        if enabled == disabled {
            if enabled {
                commands.entity(entity).remove::<InteractionDisabled>();
            } else {
                commands.entity(entity).insert(InteractionDisabled);
            }
        }
    }
    for (entity, action, children, mut button, mut background, disabled) in &mut buttons {
        let enabled = action.enabled(setup.mode);
        if enabled == disabled {
            if enabled {
                commands.entity(entity).remove::<InteractionDisabled>();
            } else {
                commands.entity(entity).insert(InteractionDisabled);
            }
            if !action.is_primary() && !action.is_picker_value() {
                background.0 = theme::button_fill(Interaction::None, enabled);
            }
        }
        let visible = match action {
            Action::Resume => !setup.choosing_land && has_village,
            Action::Continue(mode) => {
                !setup.choosing_land
                    && !has_village
                    && saves
                        .continue_path(*mode)
                        .is_ok_and(|path| crate::save::exists(&path))
            }
            Action::CancelNew => setup.choosing_land && setup.confirming_new,
            Action::Library => !setup.choosing_land && !saves.preview,
            _ => action.is_title_action() != setup.choosing_land,
        };
        button.display = if visible {
            Display::Flex
        } else {
            Display::None
        };
        for child in children.iter() {
            if let Ok((mut label, mut color)) = labels.get_mut(child) {
                label.0 = setup.button_value(*action, has_village || autosave_exists);
                if action.is_picker_value() {
                    color.0 = if enabled { theme::INK } else { theme::MUTED };
                }
            }
        }
    }
}

type PaintActionButtons<'w, 's> = Query<
    'w,
    's,
    (
        &'static Action,
        &'static Interaction,
        &'static mut BackgroundColor,
        Option<&'static mut BorderColor>,
        Option<&'static mut BoxShadow>,
    ),
    Without<PickerStep>,
>;

type PaintStepButtons<'w, 's> = Query<
    'w,
    's,
    (
        &'static PickerStep,
        &'static Interaction,
        &'static mut BackgroundColor,
        &'static mut BorderColor,
        &'static mut BoxShadow,
    ),
    Without<Action>,
>;

fn paint_setup_buttons(
    setup: Res<WorldSetup>,
    mut action_buttons: PaintActionButtons,
    mut step_buttons: PaintStepButtons,
) {
    if !setup.open {
        return;
    }
    for (action, interaction, mut background, border, shadow) in &mut action_buttons {
        let enabled = action.enabled(setup.mode);
        if action.is_picker_value() {
            let fill = if matches!(action, Action::Seed) && setup.seed_entry.is_some() {
                theme::ACTIVE
            } else if enabled && *interaction == Interaction::Hovered {
                theme::BUTTON_HOVER
            } else if enabled && *interaction == Interaction::Pressed {
                theme::BUTTON_PRESSED
            } else {
                Color::NONE
            };
            if background.0 != fill {
                background.0 = fill;
            }
        } else if action.is_primary() {
            let fill = match interaction {
                Interaction::Hovered => Color::srgb_u8(0x4c, 0x62, 0x47),
                Interaction::Pressed => Color::srgb_u8(0x32, 0x42, 0x30),
                Interaction::None => theme::INK,
            };
            if background.0 != fill {
                background.0 = fill;
            }
        } else if let (Some(mut border), Some(mut shadow)) = (border, shadow) {
            theme::paint_button(
                *interaction,
                enabled,
                false,
                &mut background,
                &mut border,
                &mut shadow,
            );
        }
    }
    for (&PickerStep(action, _), interaction, mut background, mut border, mut shadow) in
        &mut step_buttons
    {
        theme::paint_button(
            *interaction,
            action.enabled(setup.mode),
            false,
            &mut background,
            &mut border,
            &mut shadow,
        );
    }
}

fn refresh_story_resume(
    setup: Res<WorldSetup>,
    saves: Res<SaveMenu>,
    village: Res<crate::village::Village>,
    catalog: Res<crate::catalog::Catalog>,
    mut label: Single<&mut Text, With<StoryResumeSummary>>,
    mut preview: Local<Option<crate::save::SaveSnapshot>>,
) {
    if !setup.open
        || village.session_setup().is_some()
        || (!setup.is_changed() && !saves.is_changed())
    {
        return;
    }
    let snapshot = saves
        .continue_path(Mode::Story)
        .ok()
        .and_then(|path| crate::save::snapshot(&path));
    if *preview != snapshot {
        label.0 = if snapshot.is_some() {
            crate::village::restore_continuation(&saves, Mode::Story, &catalog)
                .map(|(saved, _)| saved.story_resume_summary())
                .unwrap_or_default()
        } else {
            String::new()
        };
        *preview = snapshot;
    }
}

fn refresh_preview(
    setup: Res<WorldSetup>,
    (saves, sound): (Res<SaveMenu>, Res<crate::audio::SoundSettings>),
    mut image: Single<&mut ImageNode, With<PlotPreviewImage>>,
    mut summary: Single<&mut Text, With<PlotSummary>>,
    mut images: ResMut<Assets<Image>>,
    mut drawn: Local<Option<(u32, usize, usize, usize)>>,
) {
    if !setup.is_changed() && !saves.is_changed() && !sound.is_changed() {
        return;
    }
    let visible = setup.open && setup.choosing_land && !saves.open && !sound.open;
    if !visible {
        return;
    }
    summary.0 = setup.plot_summary();
    if setup.confirming_new {
        summary.0.push_str(match setup.mode {
            Mode::Story => "\nStarting over replaces the Story autosave.",
            Mode::Sandbox => "\nStarting over replaces the Sandbox autosave.",
        });
        summary
            .0
            .push_str("\nNamed villages and the other mode are kept.");
    }
    let mut preview = setup.clone();
    if let Some(seed) = setup
        .seed_entry
        .as_deref()
        .and_then(|entry| entry.parse::<std::num::NonZeroU32>().ok())
    {
        preview.seed = seed.get();
    }
    let key = (
        preview.seed,
        preview.biome,
        preview.landscape,
        preview.water,
    );
    if *drawn == Some(key) {
        return;
    }
    let terrain = preview.terrain();
    let base = preview.ground_color().to_srgba();
    let mut pixels = Vec::with_capacity((PREVIEW_SIZE * PREVIEW_SIZE * 4) as usize);
    for row in 0..PREVIEW_SIZE {
        let z = (row as f64 + 0.5) * 256.0 / f64::from(PREVIEW_SIZE) - 128.0;
        let (river, width) = terrain.river(z);
        for column in 0..PREVIEW_SIZE {
            let x = (column as f64 + 0.5) * 256.0 / f64::from(PREVIEW_SIZE) - 128.0;
            let rgb = if (x - river).abs() <= width {
                [105, 170, 160]
            } else if (crate::arrival::MAP_START..=crate::arrival::ROAD_END).contains(&(z as f32))
                && (x as f32 - crate::arrival::road_center(z as f32)).abs()
                    <= crate::arrival::road_width(z as f32)
            {
                [181, 142, 96]
            } else {
                let shade = (1.0 - terrain.height_at(x as f32, z as f32) * 0.047).clamp(0.45, 1.0);
                [base.red, base.green, base.blue]
                    .map(|channel| (channel * shade * 255.0).round() as u8)
            };
            pixels.extend_from_slice(&[rgb[0], rgb[1], rgb[2], 255]);
        }
    }
    image.image = images.add(Image::new(
        Extent3d {
            width: PREVIEW_SIZE,
            height: PREVIEW_SIZE,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        pixels,
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::RENDER_WORLD,
    ));
    *drawn = Some(key);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picker_steps_cycle_options_and_presets_in_both_directions() {
        let mut setup = WorldSetup::default();
        let initial_biome = setup.biome;
        setup.cycle_world_option(Action::Biome, true);
        assert_eq!(setup.biome, (initial_biome + 1) % BIOMES.len());
        setup.cycle_world_option(Action::Biome, false);
        assert_eq!(setup.biome, initial_biome);

        setup.cycle_world_option(Action::Preset, true);
        let first = setup.preset().unwrap();
        setup.cycle_world_option(Action::Preset, false);
        assert_eq!(
            setup.preset().unwrap(),
            (first + PRESET_NAMES.len() - 1) % PRESET_NAMES.len()
        );
    }

    #[test]
    fn land_setup_scrolls_under_the_pointer_and_resets_on_back() {
        let mut app = App::new();
        app.insert_resource(WorldSetup {
            choosing_land: true,
            ..default()
        })
        .insert_resource(AccumulatedMouseScroll {
            unit: MouseScrollUnit::Line,
            delta: Vec2::new(0., -1.),
        })
        .add_systems(Update, scroll_setup_panel);
        let panel = app
            .world_mut()
            .spawn((
                SetupPanel,
                Node::default(),
                Interaction::None,
                ScrollPosition::default(),
            ))
            .id();

        app.update();
        assert_eq!(app.world().get::<ScrollPosition>(panel).unwrap().y, 0.);
        *app.world_mut().get_mut::<Interaction>(panel).unwrap() = Interaction::Hovered;
        app.update();
        assert_eq!(app.world().get::<ScrollPosition>(panel).unwrap().y, 34.);
        app.world_mut().resource_mut::<WorldSetup>().choosing_land = false;
        app.update();
        assert_eq!(app.world().get::<ScrollPosition>(panel).unwrap().y, 0.);
    }
}
