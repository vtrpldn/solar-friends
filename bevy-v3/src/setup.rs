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
    ui_font::{ui_font_styled, ui_font_weight},
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

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
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

    /// Whether keys are going into the land seed field.
    pub fn entering_seed(&self) -> bool {
        self.seed_entry.is_some()
    }

    pub fn open_main_menu(&mut self) {
        self.open = true;
        self.choosing_land = false;
        self.confirming_new = false;
        self.seed_entry = None;
    }

    pub fn open_new_village(&mut self) {
        self.reroll_seed();
        self.open = true;
        self.choosing_land = true;
        self.confirming_new = false;
    }

    pub(crate) fn choosing_land(&self) -> bool {
        self.choosing_land
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
            Action::Continue(Mode::Story) => "Continue".into(),
            Action::Continue(Mode::Sandbox) => "Continue sandbox".into(),
            Action::Library => "Load village".into(),
            Action::Sound => "Sound settings".into(),
            Action::ArtCollection => "Browse the art collection ↗".into(),
        }
    }
}

#[derive(Component, Clone, Copy, Debug, PartialEq, Eq)]
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
    ArtCollection,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ButtonStyle {
    TitlePrimary,
    TitleRow,
    TitleLink,
    RaisedPaper,
    SetupPrimary,
    PickerValue,
}

impl Action {
    fn enabled(self, mode: Mode) -> bool {
        mode == Mode::Story || !matches!(self, Self::Savings | Self::Supplies)
    }

    fn is_title_action(self) -> bool {
        matches!(
            self,
            Self::New(_)
                | Self::Resume
                | Self::Continue(_)
                | Self::Library
                | Self::Sound
                | Self::ArtCollection
        )
    }

    fn style(self, has_village: bool, has_story_autosave: bool) -> ButtonStyle {
        match self {
            Self::Resume | Self::Continue(Mode::Story) => ButtonStyle::TitlePrimary,
            Self::New(Mode::Story) if !has_village && !has_story_autosave => {
                ButtonStyle::TitlePrimary
            }
            Self::New(_) | Self::Continue(Mode::Sandbox) | Self::Sound => ButtonStyle::TitleRow,
            Self::ArtCollection => ButtonStyle::TitleLink,
            Self::Library | Self::Back | Self::Reroll | Self::CancelNew => ButtonStyle::RaisedPaper,
            Self::Explore => ButtonStyle::SetupPrimary,
            _ => ButtonStyle::PickerValue,
        }
    }

    fn visible_on_title(
        self,
        has_village: bool,
        has_story_autosave: bool,
        has_sandbox_autosave: bool,
        preview: bool,
    ) -> bool {
        match self {
            Self::Resume => has_village,
            Self::Continue(Mode::Story) => !has_village && has_story_autosave,
            Self::Continue(Mode::Sandbox) => !has_village && has_sandbox_autosave,
            Self::Library => !preview,
            Self::New(_) | Self::Sound | Self::ArtCollection => true,
            _ => false,
        }
    }
}

#[derive(Resource, Default)]
struct TitleFocus(Option<Action>);

#[derive(Resource, Default)]
struct TitleStatus(String);

#[derive(Component, Clone, Copy)]
struct PickerStep(Action, bool);

#[derive(Component)]
struct ActionValueLabel;

#[derive(Component)]
struct SetupPanel;

#[derive(Component, Clone, Copy)]
enum SetupSection {
    Backdrop,
    Tagline,
    Caption,
    Subtitle,
    TitleGroup,
    LandBody,
    LandFooter,
}

#[derive(Component)]
struct SetupHeading;

#[derive(Component)]
struct TitleStatusText;

#[derive(Component)]
struct PlotPreviewImage;

#[derive(Component)]
struct PlotSummary;

#[derive(Component)]
struct ResumeSummary;

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
            .init_resource::<TitleFocus>()
            .init_resource::<TitleStatus>()
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

fn title_focus_outline() -> Outline {
    Outline {
        width: px(3.5),
        offset: px(3.5),
        color: Color::NONE,
    }
}

fn spawn_title_row_button(
    parent: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    setup: &WorldSetup,
    action: Action,
    visible: bool,
) {
    let primary = matches!(action.style(false, false), ButtonStyle::TitlePrimary);
    let is_settings = matches!(action, Action::Sound);
    let mut button = parent.spawn((
        action,
        Button,
        UiTransform::default(),
        title_focus_outline(),
        Node {
            display: if visible {
                Display::Flex
            } else {
                Display::None
            },
            width: percent(100),
            padding: if is_settings {
                UiRect::axes(px(22), px(10))
            } else {
                UiRect::axes(px(22), px(13))
            },
            margin: if is_settings {
                UiRect::top(px(8))
            } else {
                UiRect::ZERO
            },
            border: UiRect::all(px(1)),
            border_radius: BorderRadius::all(px(6)),
            flex_shrink: 0.,
            flex_direction: FlexDirection::Column,
            row_gap: px(4),
            ..default()
        },
        BackgroundColor(if primary {
            theme::TITLE_INK
        } else {
            Color::NONE
        }),
        BorderColor::all(if primary {
            theme::TITLE_INK
        } else {
            Color::NONE
        }),
        if primary {
            BoxShadow::new(theme::TITLE_PRIMARY_SHADOW, px(0), px(3.5), px(0), px(0))
        } else {
            BoxShadow::default()
        },
    ));
    button.with_child((
        ActionValueLabel,
        Text::new(setup.button_value(action, false)),
        ui_font_styled(
            assets,
            if is_settings { 17.5 } else { 22.0 },
            600,
            if primary {
                theme::TITLE_PRIMARY_TEXT
            } else {
                theme::TITLE_INK
            },
        ),
    ));
    if matches!(action, Action::Resume) {
        button.with_child((
            ResumeSummary,
            Text::default(),
            ui_font_styled(assets, 13.5, 400, theme::TITLE_PRIMARY_SUBTEXT),
            Node {
                display: Display::None,
                ..default()
            },
        ));
    }
    if matches!(action, Action::Continue(Mode::Story)) {
        button.with_child((
            StoryResumeSummary,
            Text::default(),
            ui_font_styled(assets, 13.5, 400, theme::TITLE_PRIMARY_SUBTEXT),
            Node {
                display: Display::None,
                ..default()
            },
        ));
    }
}

fn spawn_title_link_button(
    parent: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    setup: &WorldSetup,
) {
    parent
        .spawn((
            Action::ArtCollection,
            Button,
            UiTransform::default(),
            title_focus_outline(),
            Node {
                padding: UiRect::new(px(2), px(2), px(2), px(4)),
                border: UiRect::bottom(px(1.5)),
                border_radius: BorderRadius::all(px(3)),
                flex_shrink: 0.,
                ..default()
            },
            BackgroundColor(Color::NONE),
            BorderColor {
                bottom: theme::TITLE_INK,
                ..BorderColor::all(Color::NONE)
            },
            BoxShadow::default(),
        ))
        .with_child((
            ActionValueLabel,
            Text::new(setup.button_value(Action::ArtCollection, false)),
            ui_font_styled(assets, 15.0, 500, theme::TITLE_INK),
        ));
}

fn spawn_title_raised_button(
    parent: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    setup: &WorldSetup,
    action: Action,
    visible: bool,
) {
    parent
        .spawn((
            action,
            Button,
            UiTransform::default(),
            title_focus_outline(),
            theme::button_node(Node {
                display: if visible {
                    Display::Flex
                } else {
                    Display::None
                },
                padding: UiRect::axes(px(16), px(10)),
                flex_shrink: 0.,
                ..default()
            }),
            theme::button(),
        ))
        .with_child((
            ActionValueLabel,
            Text::new(setup.button_value(action, false)),
            ui_font_weight(assets, 17.0, 600),
        ));
}

fn spawn_action_button(
    parent: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    setup: &WorldSetup,
    action: Action,
    visible: bool,
) {
    let primary = matches!(action, Action::Explore);
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
            BoxShadow::new(theme::TITLE_PRIMARY_SHADOW, px(0), px(3), px(0), px(0)),
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
            SetupSection::Backdrop,
            Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                width: percent(100),
                height: percent(100),
                ..default()
            },
            BackgroundColor(theme::TITLE_BG),
            GlobalZIndex(-1),
        ))
        .with_children(|backdrop| {
            // Outer hairline frame matching V2's `.frame`.
            backdrop.spawn((
                Node {
                    position_type: PositionType::Absolute,
                    top: px(30),
                    left: px(30),
                    right: px(30),
                    bottom: px(30),
                    border: UiRect::all(px(1.25)),
                    ..default()
                },
                BorderColor::all(theme::TITLE_FRAME),
            ));

            // Right-side sun-and-leaf poster art with V2's caption underneath.
            backdrop
                .spawn(Node {
                    position_type: PositionType::Absolute,
                    left: vw(54),
                    top: vh(14),
                    width: vw(34),
                    height: vh(70),
                    flex_direction: FlexDirection::Column,
                    align_items: AlignItems::Center,
                    justify_content: JustifyContent::Center,
                    ..default()
                })
                .with_children(|art| {
                    art.spawn((
                        // Sized by width so the art keeps its shape: the column's width,
                        // but never taller than about half the window.
                        Node {
                            width: percent(100),
                            max_width: vh(46.8),
                            aspect_ratio: Some(0.9),
                            ..default()
                        },
                        // Shift right so the sun-and-stem mass centers above the caption.
                        UiTransform::from_translation(Val2::percent(10.8, 0.0)),
                        ImageNode::new(load_embedded_asset!(&*assets, "title-art.png")),
                    ));
                    art.spawn((
                        Text::new("GROW SOMETHING GOOD"),
                        TextLayout::new_with_justify(Justify::Center),
                        ui_font_styled(&assets, 13.0, 600, theme::TITLE_ART_CAPTION),
                        Node {
                            margin: UiRect::top(px(-4)),
                            ..default()
                        },
                    ));
                });

            // Bottom-left colophon aligned to the left brand axis (`left: 10vw`).
            backdrop
                .spawn(Node {
                    position_type: PositionType::Absolute,
                    left: vw(10),
                    bottom: px(50),
                    flex_direction: FlexDirection::Column,
                    row_gap: px(4),
                    ..default()
                })
                .with_children(|corner| {
                    corner.spawn((
                        Text::new("SOLAR FRIENDS"),
                        ui_font_styled(&assets, 11.5, 750, theme::TITLE_INK),
                    ));
                    corner.spawn((
                        Text::new("v3"),
                        ui_font_styled(&assets, 12.5, 400, Color::srgba_u8(0x36, 0x52, 0x3f, 0xcc)),
                    ));
                });
        });

    commands
        .spawn((
            SetupPanel,
            UiTransform::default(),
            theme::panel_node(Node {
                position_type: PositionType::Absolute,
                left: vw(10),
                top: vh(9.5),
                padding: UiRect::ZERO,
                width: px(460),
                max_width: vw(46),
                flex_direction: FlexDirection::Column,
                row_gap: px(0),
                overflow: Overflow::visible(),
                ..default()
            }),
            theme::panel(),
            Interaction::default(),
            ScrollPosition::default(),
        ))
        .with_children(|panel| {
            panel.spawn((
                SetupSection::Tagline,
                Text::new("A LITTLE LAND. A LIFE TOGETHER."),
                ui_font_styled(&assets, 11.5, 750, theme::TITLE_INK),
                Node {
                    margin: UiRect::bottom(px(18)),
                    flex_shrink: 0.,
                    ..default()
                },
            ));
            panel.spawn((
                SetupSection::Caption,
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
                Text::new("Solar\nFriends"),
                ui_font_styled(&assets, 100.0, 800, theme::TITLE_INK),
                bevy::text::LineHeight::RelativeToFont(0.88),
                Node {
                    flex_shrink: 0.,
                    ..default()
                },
            ));
            panel.spawn((
                SetupSection::Subtitle,
                Text::new("Choose the land and the circumstances your friends arrive with."),
                ui_font_styled(&assets, 14.0, 400, theme::MUTED),
                Node {
                    display: Display::None,
                    flex_shrink: 0.,
                    ..default()
                },
            ));

            // Title screen actions: primary block + plain text rows, then art link and Load village.
            panel
                .spawn((
                    SetupSection::TitleGroup,
                    Node {
                        flex_direction: FlexDirection::Column,
                        flex_shrink: 0.,
                        margin: UiRect::top(px(34)),
                        ..default()
                    },
                ))
                .with_children(|title| {
                    title
                        .spawn(Node {
                            width: px(340),
                            max_width: percent(100),
                            flex_direction: FlexDirection::Column,
                            row_gap: px(7),
                            ..default()
                        })
                        .with_children(|rows| {
                            for action in [
                                Action::Resume,
                                Action::Continue(Mode::Story),
                                Action::New(Mode::Story),
                                Action::New(Mode::Sandbox),
                                Action::Continue(Mode::Sandbox),
                                Action::Sound,
                            ] {
                                let visible =
                                    !matches!(action, Action::Resume | Action::Continue(_));
                                spawn_title_row_button(rows, &assets, &setup, action, visible);
                            }
                        });

                    title
                        .spawn(Node {
                            flex_direction: FlexDirection::Row,
                            align_items: AlignItems::Center,
                            flex_wrap: FlexWrap::Wrap,
                            column_gap: px(22),
                            row_gap: px(10),
                            margin: UiRect::new(px(22), px(0), px(24), px(0)),
                            ..default()
                        })
                        .with_children(|utility| {
                            spawn_title_link_button(utility, &assets, &setup);
                            spawn_title_raised_button(
                                utility,
                                &assets,
                                &setup,
                                Action::Library,
                                true,
                            );
                        });

                    title.spawn((
                        TitleStatusText,
                        Text::default(),
                        ui_font_styled(&assets, 14.0, 400, theme::TITLE_INK),
                        Node {
                            display: Display::None,
                            margin: UiRect::new(px(22), px(0), px(10), px(0)),
                            max_width: px(360),
                            ..default()
                        },
                    ));
                });

            // Unified two-column land setup sheet: pickers on the left, plot preview on the right.
            panel
                .spawn((
                    SetupSection::LandBody,
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
                    SetupSection::LandFooter,
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
    (With<SetupPanel>, Without<SetupSection>),
>;

type SetupHeadingStyle<'w, 's> = Single<
    'w,
    's,
    (
        &'static mut Text,
        &'static mut TextFont,
        &'static mut bevy::text::LineHeight,
        &'static mut TextColor,
    ),
    With<SetupHeading>,
>;

fn refresh_title(
    setup: Res<WorldSetup>,
    saves: Res<SaveMenu>,
    sound: Res<crate::audio::SoundSettings>,
    mut sections: Query<(&SetupSection, &mut Node), Without<SetupPanel>>,
    mut panel: SetupPanelStyle,
    mut heading: SetupHeadingStyle,
) {
    if !setup.is_changed() && !saves.is_changed() && !sound.is_changed() {
        return;
    }
    let title = !setup.choosing_land;
    let show_backdrop = title && setup.open && !saves.open && !sound.open;
    for (section, mut node) in &mut sections {
        let visible = match section {
            SetupSection::Backdrop => show_backdrop,
            SetupSection::Tagline | SetupSection::TitleGroup => title,
            SetupSection::Caption
            | SetupSection::Subtitle
            | SetupSection::LandBody
            | SetupSection::LandFooter => !title,
        };
        node.display = if visible {
            Display::Flex
        } else {
            Display::None
        };
    }

    let (panel, transform, background, border, shadow) = &mut *panel;
    let (text, font, line_height, color) = &mut *heading;
    if title {
        panel.left = vw(10);
        panel.top = vh(9.5);
        panel.width = px(460);
        panel.max_width = vw(46);
        panel.max_height = Val::Auto;
        panel.padding = UiRect::ZERO;
        panel.row_gap = px(0);
        panel.overflow = Overflow::visible();
        transform.translation = Val2::ZERO;
        // On the title screen the menu sits directly on the parchment backdrop like V2's.
        background.0 = Color::NONE;
        **border = BorderColor::all(Color::NONE);
        **shadow = BoxShadow::default();
        text.0 = "Solar\nFriends".into();
        font.font_size = 100.;
        font.weight = bevy::text::FontWeight(800);
        **line_height = bevy::text::LineHeight::RelativeToFont(0.88);
        color.0 = theme::TITLE_INK;
    } else {
        panel.left = percent(50);
        panel.top = px(28);
        panel.width = px(880);
        panel.max_width = vw(94);
        panel.max_height = vh(92);
        panel.padding = UiRect::all(px(26));
        panel.row_gap = px(10);
        panel.overflow = Overflow::scroll_y();
        transform.translation = Val2::new(percent(-50), px(0));
        background.0 = theme::PAPER;
        **border = BorderColor::all(theme::EDGE);
        **shadow = theme::panel_shadow();
        text.0 = "Choose the land".into();
        font.font_size = 28.;
        font.weight = bevy::text::FontWeight(750);
        **line_height = bevy::text::LineHeight::RelativeToFont(1.15);
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

fn has_autosave(saves: &SaveMenu, mode: Mode) -> bool {
    saves
        .continue_path(mode)
        .is_ok_and(|path| crate::save::exists(&path))
}

#[cfg(not(target_arch = "wasm32"))]
fn open_art_collection(
    status: &mut TitleStatus,
    collection_process: &mut Option<std::process::Child>,
) {
    if let Some(child) = collection_process.as_mut() {
        if matches!(child.try_wait(), Ok(Some(_))) {
            *collection_process = None;
        } else {
            status.0 = "The art collection is already open.".into();
            return;
        }
    }
    match crate::workshop::navigation::ArtTool::Collection.launch() {
        Ok(child) => {
            *collection_process = Some(child);
            status.0.clear();
        }
        Err(error) => {
            status.0 = format!("Could not open the art collection: {error}");
        }
    }
}

#[cfg(target_arch = "wasm32")]
fn open_art_collection(status: &mut TitleStatus, _collection_process: &mut Option<()>) {
    if let Err(error) = crate::workshop::navigation::ArtTool::Collection.open_in_browser() {
        status.0 = format!("Could not open the art collection: {error}");
    } else {
        status.0.clear();
    }
}

#[cfg(not(target_arch = "wasm32"))]
type CollectionProcess = Option<std::process::Child>;
#[cfg(target_arch = "wasm32")]
type CollectionProcess = Option<()>;

type SetupInputQueries<'w, 's> = (
    Query<'w, 's, (&'static Interaction, &'static Action), Changed<Interaction>>,
    Query<'w, 's, (&'static Interaction, &'static PickerStep), Changed<Interaction>>,
);

type SetupInputResources<'w> = (
    ResMut<'w, SaveMenu>,
    ResMut<'w, crate::audio::SoundSettings>,
    ResMut<'w, crate::village::Village>,
    Res<'w, crate::catalog::Catalog>,
    ResMut<'w, TitleFocus>,
    ResMut<'w, TitleStatus>,
);

fn setup_input(
    mut setup: ResMut<WorldSetup>,
    keyboard: Res<ButtonInput<KeyCode>>,
    (buttons, step_buttons): SetupInputQueries,
    window: Single<&Window, With<PrimaryWindow>>,
    mut picker: Option<ResMut<crate::village::PanelPicker>>,
    (mut saves, mut sound, mut village, catalog, mut focus, mut title_status): SetupInputResources,
    mut collection_process: Local<CollectionProcess>,
) {
    if !window.focused || saves.open || sound.open {
        focus.0 = None;
        return;
    }
    if !setup.open {
        focus.0 = None;
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
    if setup.choosing_land {
        focus.0 = None;
        if keyboard.just_pressed(KeyCode::Escape) {
            if setup.confirming_new {
                setup.confirming_new = false;
            } else {
                setup.choosing_land = false;
            }
            return;
        }
    }

    // Tab, the arrows and Enter reach the title rows through the shared keyboard focus.
    focus.0 = None;

    for (interaction, &PickerStep(action, forward)) in &step_buttons {
        if *interaction == Interaction::Pressed && action.enabled(setup.mode) {
            setup.confirming_new = false;
            setup.cycle_world_option(action, forward);
        }
    }

    let triggered: Vec<(Action, bool)> = buttons
        .iter()
        .filter_map(|(interaction, action)| {
            (*interaction == Interaction::Pressed && action.enabled(setup.mode))
                .then_some((*action, false))
        })
        .collect();

    for (action, from_keyboard) in triggered {
        if !matches!(action, Action::Explore) {
            setup.confirming_new = false;
        }
        if !matches!(action, Action::ArtCollection) && !title_status.0.is_empty() {
            title_status.0.clear();
        }
        match action {
            Action::New(mode) => {
                setup.mode = mode;
                setup.reroll_seed();
                setup.choosing_land = true;
                focus.0 = None;
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
                setup.cycle_world_option(action, true);
            }
            Action::Seed => {
                setup.seed_entry = Some(String::new());
            }
            Action::Reroll => setup.reroll_seed(),
            Action::Explore => {
                if !setup.apply_seed_entry() {
                    continue;
                }
                let autosave_exists = has_autosave(&saves, setup.mode);
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
            Action::Continue(mode) if from_keyboard => {
                focus.0 = None;
                crate::village::continue_saved_village(
                    mode,
                    &mut setup,
                    &mut village,
                    &mut saves,
                    &catalog,
                );
            }
            Action::Library if from_keyboard => {
                focus.0 = None;
                crate::village::open_save_library(&mut saves, setup.mode);
            }
            Action::Continue(_) | Action::Library => {}
            Action::Sound => {
                focus.0 = None;
                sound.open = true;
            }
            Action::ArtCollection => {
                open_art_collection(&mut title_status, &mut collection_process)
            }
            Action::Resume => {
                if let Some(active) = village.session_setup() {
                    focus.0 = None;
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
    (
        Without<SetupPanel>,
        Without<PickerStep>,
        Without<ResumeSummary>,
        Without<TitleStatusText>,
    ),
>;

type StepButtons<'w, 's> = Query<
    'w,
    's,
    (Entity, &'static PickerStep, Has<InteractionDisabled>),
    (Without<SetupPanel>, Without<Action>),
>;

type TitleDetailNodes<'w, 's> = (
    Single<
        'w,
        's,
        (&'static mut Text, &'static mut Node),
        (
            With<ResumeSummary>,
            Without<ActionValueLabel>,
            Without<SetupPanel>,
            Without<Action>,
            Without<TitleStatusText>,
        ),
    >,
    Single<
        'w,
        's,
        (&'static mut Text, &'static mut Node),
        (
            With<TitleStatusText>,
            Without<ActionValueLabel>,
            Without<SetupPanel>,
            Without<Action>,
            Without<ResumeSummary>,
        ),
    >,
);

type SetupPanelNode<'w, 's> = Single<
    'w,
    's,
    &'static mut Node,
    (
        With<SetupPanel>,
        Without<Action>,
        Without<ResumeSummary>,
        Without<TitleStatusText>,
    ),
>;

fn refresh_panel(
    mut commands: Commands,
    setup: Res<WorldSetup>,
    mut panel: SetupPanelNode,
    (mut buttons, step_buttons): (SetupButtons, StepButtons),
    (village, saves, sound, title_status): (
        Res<crate::village::Village>,
        Res<SaveMenu>,
        Res<crate::audio::SoundSettings>,
        Res<TitleStatus>,
    ),
    mut labels: Query<(&mut Text, &mut TextColor), With<ActionValueLabel>>,
    (mut resume_summary, mut status_text): TitleDetailNodes,
) {
    if !setup.is_changed()
        && !saves.is_changed()
        && !sound.is_changed()
        && !title_status.is_changed()
        && !(setup.open && village.is_changed())
    {
        return;
    }
    panel.display = if setup.open && !saves.open && !sound.open {
        Display::Flex
    } else {
        Display::None
    };
    let has_village = village.session_setup().is_some();
    let has_story_autosave = has_autosave(&saves, Mode::Story);
    let has_sandbox_autosave = has_autosave(&saves, Mode::Sandbox);
    let autosave_exists = has_autosave(&saves, setup.mode);

    let (resume_text, resume_node) = &mut *resume_summary;
    if has_village {
        let summary = village.resume_summary();
        resume_text.0 = summary;
        resume_node.display = if resume_text.0.is_empty() {
            Display::None
        } else {
            Display::Flex
        };
    } else {
        resume_text.0.clear();
        resume_node.display = Display::None;
    }

    let (status_label, status_node) = &mut *status_text;
    if status_label.0 != title_status.0 {
        status_label.0.clone_from(&title_status.0);
    }
    status_node.display = if title_status.0.is_empty() {
        Display::None
    } else {
        Display::Flex
    };

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
        let style = action.style(has_village, has_story_autosave);
        if enabled == disabled {
            if enabled {
                commands.entity(entity).remove::<InteractionDisabled>();
            } else {
                commands.entity(entity).insert(InteractionDisabled);
            }
            if matches!(style, ButtonStyle::RaisedPaper) {
                background.0 = theme::button_fill(Interaction::None, enabled);
            }
        }
        let visible = if action.is_title_action() {
            !setup.choosing_land
                && action.visible_on_title(
                    has_village,
                    has_story_autosave,
                    has_sandbox_autosave,
                    saves.preview,
                )
        } else if matches!(action, Action::CancelNew) {
            setup.choosing_land && setup.confirming_new
        } else {
            setup.choosing_land
        };
        button.display = if visible {
            Display::Flex
        } else {
            Display::None
        };
        for child in children.iter() {
            if let Ok((mut label, mut color)) = labels.get_mut(child) {
                label.0 = setup.button_value(*action, has_village || autosave_exists);
                let wanted = match style {
                    ButtonStyle::TitlePrimary => theme::TITLE_PRIMARY_TEXT,
                    ButtonStyle::TitleRow | ButtonStyle::TitleLink => theme::TITLE_INK,
                    ButtonStyle::SetupPrimary => theme::PAPER,
                    ButtonStyle::RaisedPaper => theme::INK,
                    ButtonStyle::PickerValue => {
                        if enabled {
                            theme::INK
                        } else {
                            theme::MUTED
                        }
                    }
                };
                if color.0 != wanted {
                    color.0 = wanted;
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
        Option<&'static mut UiTransform>,
        Option<&'static mut Outline>,
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
    (village, saves, focus): (Res<crate::village::Village>, Res<SaveMenu>, Res<TitleFocus>),
    mut action_buttons: PaintActionButtons,
    mut step_buttons: PaintStepButtons,
) {
    if !setup.open {
        return;
    }
    let has_village = village.session_setup().is_some();
    let has_story_autosave = has_autosave(&saves, Mode::Story);
    for (action, interaction, mut background, border, shadow, transform, outline) in
        &mut action_buttons
    {
        let enabled = action.enabled(setup.mode);
        let style = action.style(has_village, has_story_autosave);
        let focused = !setup.choosing_land && focus.0 == Some(*action);
        if let Some(mut outline) = outline {
            let ring = if focused {
                theme::FOCUS_RING
            } else {
                Color::NONE
            };
            if outline.color != ring {
                outline.color = ring;
            }
        }
        match style {
            ButtonStyle::TitlePrimary => {
                let fill = match interaction {
                    Interaction::Hovered => theme::TITLE_PRIMARY_HOVER,
                    Interaction::Pressed => theme::TITLE_PRIMARY_PRESSED,
                    Interaction::None => theme::TITLE_INK,
                };
                if background.0 != fill {
                    background.0 = fill;
                }
                if let Some(mut border) = border {
                    let edge = BorderColor::all(fill);
                    if *border != edge {
                        *border = edge;
                    }
                }
                if let Some(mut shadow) = shadow {
                    let lift = if *interaction == Interaction::Pressed {
                        1.0
                    } else {
                        3.5
                    };
                    let wanted =
                        BoxShadow::new(theme::TITLE_PRIMARY_SHADOW, px(0), px(lift), px(0), px(0));
                    if *shadow != wanted {
                        *shadow = wanted;
                    }
                }
                if let Some(mut transform) = transform {
                    let shift = match interaction {
                        Interaction::Hovered => Val2::px(4.0, 0.0),
                        Interaction::Pressed => Val2::px(2.0, 0.0),
                        Interaction::None => Val2::ZERO,
                    };
                    if transform.translation != shift {
                        transform.translation = shift;
                    }
                }
            }
            ButtonStyle::TitleRow => {
                let fill = match interaction {
                    Interaction::Pressed => theme::TITLE_ROW_PRESSED,
                    Interaction::Hovered => theme::TITLE_ROW_HOVER,
                    Interaction::None if focused => theme::TITLE_ROW_HOVER,
                    Interaction::None => Color::NONE,
                };
                if background.0 != fill {
                    background.0 = fill;
                }
                if let Some(mut border) = border {
                    let edge = BorderColor::all(Color::NONE);
                    if *border != edge {
                        *border = edge;
                    }
                }
                if let Some(mut shadow) = shadow {
                    let none = BoxShadow::default();
                    if *shadow != none {
                        *shadow = none;
                    }
                }
                if let Some(mut transform) = transform {
                    let shift = match interaction {
                        Interaction::Pressed => Val2::px(2.0, 0.0),
                        Interaction::Hovered => Val2::px(4.0, 0.0),
                        Interaction::None if focused => Val2::px(4.0, 0.0),
                        Interaction::None => Val2::ZERO,
                    };
                    if transform.translation != shift {
                        transform.translation = shift;
                    }
                }
            }
            ButtonStyle::TitleLink => {
                let fill = match interaction {
                    Interaction::Pressed => theme::TITLE_ROW_PRESSED,
                    Interaction::Hovered => theme::TITLE_ROW_HOVER,
                    Interaction::None if focused => theme::TITLE_ROW_HOVER,
                    Interaction::None => Color::NONE,
                };
                if background.0 != fill {
                    background.0 = fill;
                }
                if let Some(mut border) = border {
                    let underline = BorderColor {
                        bottom: theme::TITLE_INK,
                        ..BorderColor::all(Color::NONE)
                    };
                    if *border != underline {
                        *border = underline;
                    }
                }
                if let Some(mut transform) = transform
                    && transform.translation != Val2::ZERO
                {
                    transform.translation = Val2::ZERO;
                }
            }
            ButtonStyle::SetupPrimary => {
                let fill = match interaction {
                    Interaction::Hovered => Color::srgb_u8(0x4c, 0x62, 0x47),
                    Interaction::Pressed => Color::srgb_u8(0x32, 0x42, 0x30),
                    Interaction::None => theme::INK,
                };
                if background.0 != fill {
                    background.0 = fill;
                }
            }
            ButtonStyle::PickerValue => {
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
            }
            ButtonStyle::RaisedPaper => {
                if let (Some(mut border), Some(mut shadow)) = (border, shadow) {
                    theme::paint_button(
                        *interaction,
                        enabled,
                        false,
                        &mut background,
                        &mut border,
                        &mut shadow,
                    );
                }
                if let Some(mut transform) = transform
                    && transform.translation != Val2::ZERO
                {
                    transform.translation = Val2::ZERO;
                }
            }
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
    mut label: Single<(&mut Text, &mut Node), With<StoryResumeSummary>>,
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
        let (text, node) = &mut *label;
        text.0 = if snapshot.is_some() {
            crate::village::restore_continuation(&saves, Mode::Story, &catalog)
                .map(|(saved, _)| saved.story_resume_summary())
                .unwrap_or_default()
        } else {
            String::new()
        };
        node.display = if text.0.is_empty() {
            Display::None
        } else {
            Display::Flex
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

    #[test]
    fn title_primary_action_follows_active_session_then_story_save_then_new_game() {
        assert!(matches!(
            Action::New(Mode::Story).style(false, false),
            ButtonStyle::TitlePrimary
        ));
        assert!(matches!(
            Action::New(Mode::Sandbox).style(false, false),
            ButtonStyle::TitleRow
        ));
        assert!(matches!(
            Action::Continue(Mode::Story).style(false, true),
            ButtonStyle::TitlePrimary
        ));
        assert!(matches!(
            Action::New(Mode::Story).style(false, true),
            ButtonStyle::TitleRow
        ));
        assert!(matches!(
            Action::Resume.style(true, true),
            ButtonStyle::TitlePrimary
        ));
        assert!(matches!(
            Action::New(Mode::Story).style(true, false),
            ButtonStyle::TitleRow
        ));
        assert!(matches!(
            Action::ArtCollection.style(false, false),
            ButtonStyle::TitleLink
        ));
        assert!(matches!(
            Action::Library.style(false, false),
            ButtonStyle::RaisedPaper
        ));
    }

    #[test]
    fn title_keyboard_focus_cycles_visible_rows_shows_outline_and_activates() {
        let mut app = App::new();
        app.add_plugins((
            MinimalPlugins,
            AssetPlugin::default(),
            WindowPlugin::default(),
        ))
        .init_asset::<Image>()
        .init_asset::<Font>()
        .init_resource::<ButtonInput<KeyCode>>()
        .init_resource::<AccumulatedMouseScroll>()
        .init_resource::<SaveMenu>()
        .init_resource::<crate::audio::SoundSettings>()
        .init_resource::<crate::village::Village>()
        .init_resource::<crate::catalog::Catalog>()
        .add_plugins((WorldSetupPlugin, crate::ui_font::UiFontPlugin));
        app.finish();
        app.cleanup();
        // Keep test isolated from any real autosave on disk.
        let temp_dir =
            std::env::temp_dir().join(format!("solar-v3-title-focus-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();
        app.world_mut().resource_mut::<SaveMenu>().test_directory = Some(temp_dir.clone());
        app.update();

        // V2 poster copy and footer are present on the title screen.
        let texts: Vec<String> = {
            let world = app.world_mut();
            world
                .query::<&Text>()
                .iter(world)
                .map(|text| text.0.clone())
                .collect()
        };
        for expected in [
            "A LITTLE LAND. A LIFE TOGETHER.",
            "Solar\nFriends",
            "GROW SOMETHING GOOD",
            "SOLAR FRIENDS",
            "v3",
            "Browse the art collection ↗",
            "Load village",
        ] {
            assert!(
                texts.iter().any(|text| text == expected),
                "missing title text: {expected}"
            );
        }

        // Plain text row ("New sandbox") is transparent at rest and highlights + shifts on hover.
        let sandbox_entity = {
            let world = app.world_mut();
            world
                .query::<(Entity, &Action)>()
                .iter(world)
                .find_map(|(entity, action)| {
                    (*action == Action::New(Mode::Sandbox)).then_some(entity)
                })
                .unwrap()
        };
        assert_eq!(
            app.world()
                .get::<BackgroundColor>(sandbox_entity)
                .unwrap()
                .0,
            Color::NONE
        );
        *app.world_mut()
            .get_mut::<Interaction>(sandbox_entity)
            .unwrap() = Interaction::Hovered;
        app.update();
        assert_eq!(
            app.world()
                .get::<BackgroundColor>(sandbox_entity)
                .unwrap()
                .0,
            theme::TITLE_ROW_HOVER
        );
        assert_eq!(
            app.world()
                .get::<UiTransform>(sandbox_entity)
                .unwrap()
                .translation,
            Val2::px(4.0, 0.0)
        );
        *app.world_mut()
            .get_mut::<Interaction>(sandbox_entity)
            .unwrap() = Interaction::None;
        app.update();

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
