use super::*;
use crate::{
    construction::{FarmControl, ProjectAction, TradeOrder, TradePolicy},
    farming::FarmAction,
    terrain::Brush,
    time_advance::AdvanceAction,
};

#[derive(Component, Clone, Copy)]
enum Action {
    Build,
    CampPreset(usize),
    Setup,
    View,
    Camera(crate::CameraAction),
    GridOverlay,
    Library,
    Sound,
    Volume { effects: bool, delta: i16 },
    RotatePlacement,
    CancelPlacement,
    ConnectRoad,
    UndoRoad,
    FinishRoad,
    Terrain,
    TerrainBrush(Brush),
    TerrainRadius(bool),
    UndoTerrain,
    Advance(AdvanceAction),
    ResizeField(IVec2),
    Pause,
    Speed,
    Guide,
    Lenses,
    Lens(usize),
    LensPage,
    LensFilter(bool),
    LensSite(bool),
    ClearLens,
    Manage,
    Panel(UtilityPanel),
    ClosePanel,
    Page(bool),
    Project(usize),
    Recipes,
    Gather,
    Beds,
    Farm(FarmControl),
    Recipe(usize),
    RecipePage(bool),
    SelectedProject(ProjectAction),
    TradeItem(usize),
    Trade(TradeOrder),
    TradePolicy(TradePolicy),
    ProjectFilter,
    Resident(usize),
    Home(bool),
    ListedHome(usize),
    Shift(bool),
    Ledger,
    PantryBatches,
    PantryPriority,
    PantryPolicy(i8, i64, bool),
    Grid,
    Water(WaterCommand),
    AutomaticUpkeep,
    UpkeepBudget { restock: bool, increase: bool },
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
        if matches!(
            self,
            Self::Lenses | Self::Lens(_) | Self::LensPage | Self::ClearLens
        ) {
            return !village.guide.open()
                && !village.construction.editing_search
                && (matches!(self, Self::Lenses) || village.lenses.open);
        }
        if matches!(self, Self::Guide) {
            return !village.construction.editing_search;
        }
        if let Self::Advance(action) = self {
            return !village.map_input_blocked()
                && !village.planning_roads()
                && !village.terrain_editor.open
                && (matches!(action, AdvanceAction::Toggle)
                    || (village.advance.open && village.advance.running.is_none()));
        }
        if matches!(self, Self::ConnectRoad | Self::UndoRoad | Self::FinishRoad) {
            return village.planning_roads() && !village.map_input_blocked();
        }
        if !village.map_input_blocked() && !village.advance_open() && !village.planning_roads() {
            match self {
                Self::Terrain => return true,
                Self::TerrainBrush(_) | Self::TerrainRadius(_) | Self::UndoTerrain => {
                    return village.terrain_editor.open;
                }
                _ => {}
            }
        }
        if village.map_input_blocked()
            || village.advance_open()
            || village.planning_roads()
            || village.terrain_editor.open
        {
            return false;
        }
        match self {
            Self::Terrain | Self::TerrainBrush(_) | Self::TerrainRadius(_) | Self::UndoTerrain => {
                false
            }
            Self::Advance(_) => false,
            Self::Beds => {
                village.utility_panel.is_none()
                    && !village.construction.menu
                    && !village.construction.production.open
                    && village.construction.has_selected_plot()
            }
            Self::Farm(_) => {
                village.utility_panel.is_none()
                    && village.construction.farming.open
                    && !village.construction.menu
                    && !village.construction.production.open
            }
            Self::Recipes => village.utility_panel.is_none() && !village.construction.menu,
            Self::Recipe(_) | Self::RecipePage(_) => {
                village.utility_panel.is_none()
                    && village.construction.production.open
                    && !village.construction.menu
            }
            Self::Gather => {
                village.utility_panel.is_none()
                    && !village.construction.menu
                    && !village.construction.is_placing()
                    && village.construction.gathering.has_selection()
            }
            Self::View | Self::Camera(_) | Self::GridOverlay => !village.trade_open(),
            Self::Setup | Self::Library | Self::Sound => true,
            Self::Volume { .. } => false,
            Self::CampPreset(_) => {
                village.camp.is_none() && village.arrival_time >= ARRIVAL_DURATION
            }
            Self::Build => village.utility_panel.is_none(),
            Self::RotatePlacement | Self::CancelPlacement => village.construction.placing_project(),
            Self::ResizeField(_) => {
                village.construction.placing_field()
                    || (village.utility_panel.is_none()
                        && village.construction.can_resize_selected_field())
            }
            Self::Pause => true,
            Self::Speed => {
                !village.construction.menu
                    && !village.construction.production.open
                    && !village.construction.farming.open
                    && village.utility_panel.is_none()
            }
            Self::Lenses | Self::Lens(_) | Self::LensPage | Self::ClearLens => false,
            Self::LensFilter(_) => village.lenses.has_filter(),
            Self::LensSite(_) => village.lenses.network_view().is_some(),
            Self::Guide | Self::ConnectRoad | Self::UndoRoad | Self::FinishRoad => true,
            Self::Manage => !village.construction.menu && !village.construction.is_placing(),
            Self::Panel(
                UtilityPanel::Finances
                | UtilityPanel::Trade
                | UtilityPanel::Pantry
                | UtilityPanel::Upkeep,
            ) => !village.stock.sandbox,
            Self::Panel(_) => true,
            Self::ClosePanel => village.utility_panel.is_some(),
            Self::Grid => village.utility_panel == Some(UtilityPanel::Power),
            Self::Water(_) => village.utility_panel == Some(UtilityPanel::Water),
            Self::AutomaticUpkeep | Self::UpkeepBudget { .. } => {
                village.utility_panel == Some(UtilityPanel::Upkeep)
            }
            Self::SelectedProject(_) => village.utility_panel.is_none(),
            Self::TradeItem(_) | Self::Trade(_) | Self::TradePolicy(_) => village.trade_open(),
            Self::Project(_) | Self::ProjectFilter => {
                village.utility_panel == Some(UtilityPanel::Projects)
            }
            Self::Resident(_) => matches!(
                village.utility_panel,
                Some(UtilityPanel::Residents | UtilityPanel::Finances)
            ),
            Self::PantryBatches => village.utility_panel == Some(UtilityPanel::Pantry),
            Self::PantryPriority | Self::PantryPolicy(..) => {
                village.utility_panel == Some(UtilityPanel::Pantry)
                    && village.pantry_batch_page.is_none()
            }
            Self::Page(_) if village.utility_panel == Some(UtilityPanel::Pantry) => {
                village.pantry_batch_page.is_some()
            }
            Self::Shift(_) | Self::Ledger => village.utility_panel == Some(UtilityPanel::Finances),
            Self::Home(_) | Self::ListedHome(_) => {
                village.utility_panel == Some(UtilityPanel::Residents)
            }
            Self::Page(_) if village.utility_panel == Some(UtilityPanel::Finances) => {
                village.finance_history_open
            }
            Self::Page(_) => matches!(
                village.utility_panel,
                Some(
                    UtilityPanel::Projects
                        | UtilityPanel::Inventory
                        | UtilityPanel::Events
                        | UtilityPanel::Residents
                        | UtilityPanel::Trade
                )
            ),
        }
    }

    fn label(self, village: &Village, picker: &PanelPicker) -> String {
        match self {
            Self::Build if village.construction.menu => "Close build".into(),
            Self::Build => "Build".into(),
            Self::CampPreset(index) => {
                ["Camp in shade", "Camp near entrance", "Camp in clearing"][index].into()
            }
            Self::Setup => "Setup".into(),
            Self::View if picker.view_open => "Close view".into(),
            Self::View => "View".into(),
            Self::GridOverlay if village.show_grid => "Hide grid".into(),
            Self::GridOverlay => "Show grid".into(),
            Self::Camera(action) => match action {
                crate::CameraAction::Camp => "Focus camp",
                crate::CameraAction::Reset => "Reset camera",
                crate::CameraAction::River => "Focus river",
                crate::CameraAction::Turn(false) => "Rotate left",
                crate::CameraAction::Turn(true) => "Rotate right",
                crate::CameraAction::Zoom(false) => "Zoom out",
                crate::CameraAction::Zoom(true) => "Zoom in",
            }
            .into(),
            Self::Library => "Saved villages".into(),
            Self::Sound => "Sound settings".into(),
            Self::Volume { .. } => String::new(),
            Self::RotatePlacement => "Rotate".into(),
            Self::CancelPlacement => "Cancel placement".into(),
            Self::ConnectRoad if village.connect_road_strokes => "Connected route".into(),
            Self::ConnectRoad => "Single road tile".into(),
            Self::UndoRoad => "Undo road stroke".into(),
            Self::FinishRoad => "Finish roads".into(),
            Self::Terrain if village.terrain_editor.open => "Finish terrain".into(),
            Self::Terrain => "Terrain tools".into(),
            Self::TerrainBrush(brush) => match brush {
                Brush::Raise => "Raise",
                Brush::Lower => "Lower",
                Brush::Flatten => "Flatten",
                Brush::Smooth => "Smooth",
            }
            .into(),
            Self::TerrainRadius(true) => "Next radius".into(),
            Self::TerrainRadius(false) => "Previous radius".into(),
            Self::UndoTerrain => "Undo terrain edit".into(),
            Self::Advance(action) => match action {
                AdvanceAction::Toggle if village.advance.running.is_some() => "Stop advance".into(),
                AdvanceAction::Toggle if village.advance.open => "Close advance".into(),
                AdvanceAction::Toggle => "Advance days".into(),
                AdvanceAction::Adjust(days) => format!("{days:+} day(s)"),
                AdvanceAction::Method if village.advance.fast => "Fast approximate".into(),
                AdvanceAction::Method => "Exact replay".into(),
                AdvanceAction::Start => "Start advance".into(),
            },
            Self::ResizeField(delta) => format!(
                "{} {}",
                if delta.x != 0 { "Width" } else { "Depth" },
                if delta.x + delta.y > 0 { "+" } else { "−" }
            ),
            Self::Pause if village.paused => "Resume".into(),
            Self::Pause => "Pause".into(),
            Self::Speed => format!("{}×", SPEEDS[village.speed].1),
            Self::Guide if village.guide.open() => "Close guide".into(),
            Self::Guide => "Guide".into(),
            Self::Lenses if village.lenses.open => "Close lenses".into(),
            Self::Lenses => "Map lenses".into(),
            Self::LensPage => "Other lenses".into(),
            Self::LensSite(false) => "Previous facility".into(),
            Self::LensSite(true) => "Next facility".into(),
            Self::LensFilter(false) => "Previous filter".into(),
            Self::LensFilter(true) => "Next filter".into(),
            Self::ClearLens => "Clear lens".into(),
            Self::Lens(row) => village
                .lenses
                .choices()
                .get(row)
                .map(|(_, _, name)| *name)
                .unwrap_or_default()
                .into(),
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
            Self::Project(_) | Self::TradeItem(_) | Self::Recipe(_) => String::new(),
            Self::Recipes if village.construction.production.open => "Close recipes".into(),
            Self::Recipes => "Recipes".into(),
            Self::Gather => "Gather resource".into(),
            Self::Beds if village.construction.farming.open => "Close beds".into(),
            Self::Beds => "Beds".into(),
            Self::Farm(action) => match action {
                FarmControl::NextBed => "Next bed",
                FarmControl::Irrigation => "Toggle irrigation",
                FarmControl::Residues => "Toggle residue collection",
                FarmControl::Crop => "Change crop",
                FarmControl::Density => "Change density",
                FarmControl::Work(FarmAction::Prepare) => "Prepare soil",
                FarmControl::Work(FarmAction::Plant) => "Sow",
                FarmControl::Work(FarmAction::Harvest) => "Harvest",
                FarmControl::Work(FarmAction::Clear) => "Clear bed",
                FarmControl::Work(FarmAction::Amend) => "Amend soil",
                FarmControl::Work(FarmAction::Collect) => "Collect residues",
            }
            .into(),
            Self::RecipePage(false) => "Previous recipes".into(),
            Self::RecipePage(true) => "Next recipes".into(),
            Self::SelectedProject(action) => match action {
                ProjectAction::Prioritize => "Prioritize project",
                ProjectAction::Move => "Move building",
                ProjectAction::Salvage => "Cancel or salvage",
                ProjectAction::Demolish => "Demolish",
            }
            .into(),
            Self::Trade(TradeOrder::Buy { freight: false }) => "Buy for pickup".into(),
            Self::Trade(TradeOrder::Buy { freight: true }) => "Buy for delivery".into(),
            Self::Trade(TradeOrder::Sell) => "Reserve sale".into(),
            Self::Trade(TradeOrder::Cancel) => "Cancel last order".into(),
            Self::TradePolicy(policy) => match policy {
                TradePolicy::HouseholdRestock => "Toggle household restock",
                TradePolicy::AutomaticSale => "Toggle auto sale",
                TradePolicy::Reserve(false) => "Keep one pack less",
                TradePolicy::Reserve(true) => "Keep one pack more",
                TradePolicy::Limit => "Cycle sale limit",
                TradePolicy::Trigger => "Cycle sale trigger",
            }
            .into(),
            Self::Resident(index) if index == village.selected_resident => {
                format!("› {}", NAMES[index])
            }
            Self::Resident(index) => NAMES[index].into(),
            Self::Home(true) => "Assign selected home".into(),
            Self::Home(false) => "Clear home assignment".into(),
            Self::ListedHome(_) => String::new(),
            Self::Shift(false) => "Toggle day shift".into(),
            Self::Shift(true) => "Toggle weekday shifts".into(),
            Self::Ledger if village.finance_history_open => "Close ledger".into(),
            Self::Ledger => "Open ledger".into(),
            Self::PantryBatches if village.pantry_batch_page.is_some() => {
                "Close food batches".into()
            }
            Self::PantryBatches => "Food batches".into(),
            Self::PantryPriority => "Change food priority".into(),
            Self::PantryPolicy(_, _, true) => "Toggle food restock".into(),
            Self::PantryPolicy(-1, _, false) => "Reserve −1".into(),
            Self::PantryPolicy(1, _, false) => "Reserve +1".into(),
            Self::PantryPolicy(_, budget, false) if budget < 0 => "Budget −R$25".into(),
            Self::PantryPolicy(_, _, false) => "Budget +R$25".into(),
            Self::Grid if village.construction.utilities.grid_off => "Connect grid".into(),
            Self::Grid => "Disconnect grid".into(),
            Self::Water(command) => match command {
                WaterCommand::Camp { source: true } => "Camp source".into(),
                WaterCommand::Camp { source: false } => "Camp destination".into(),
                WaterCommand::NextChannel => {
                    format!("Channel · {}", WATER_CHANNELS[village.water_panel.channel])
                }
                WaterCommand::Policy(true) => "Auto drinking reserve".into(),
                WaterCommand::Policy(false) => "Auto sanitation".into(),
                WaterCommand::River => "Collect river water".into(),
                WaterCommand::Carry => "Carry from source".into(),
                WaterCommand::Purify => "Purify water".into(),
                WaterCommand::Sanitation => "Service waste".into(),
            },
            Self::AutomaticUpkeep => "Toggle auto maintenance".into(),
            Self::UpkeepBudget { restock, increase } => format!(
                "{} {} R$25",
                if restock { "Restock" } else { "Parts" },
                if increase { "+" } else { "−" }
            ),
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
    view_open: bool,
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
    sound.open
        || saves.open
        || (!setup.open && (village.camp.is_some() || village.arrival_time >= ARRIVAL_DURATION))
}

fn spawn(mut commands: Commands, assets: Res<AssetServer>) {
    commands
        .spawn((
            Toolbar,
            Interaction::None,
            bevy::ui::FocusPolicy::Block,
            Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                bottom: px(20),
                right: px(20),
                max_width: Val::Vw(94.0),
                flex_wrap: FlexWrap::Wrap,
                justify_content: JustifyContent::FlexEnd,
                row_gap: px(5),
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
                Action::Setup,
                Action::View,
                Action::Library,
                Action::Sound,
                Action::Recipes,
                Action::Gather,
                Action::Beds,
                Action::RotatePlacement,
                Action::CancelPlacement,
                Action::ConnectRoad,
                Action::UndoRoad,
                Action::FinishRoad,
                Action::Terrain,
                Action::Advance(AdvanceAction::Toggle),
                Action::Manage,
                Action::ClosePanel,
                Action::Pause,
                Action::Speed,
                Action::Guide,
                Action::Lenses,
                Action::LensFilter(false),
                Action::LensFilter(true),
                Action::LensSite(false),
                Action::LensSite(true),
            ] {
                spawn_button(row, &assets, action);
            }
            for index in 0..CAMP_SITES.len() {
                spawn_button(row, &assets, Action::CampPreset(index));
            }
            for effects in [false, true] {
                for delta in [-5, 5] {
                    spawn_button(row, &assets, Action::Volume { effects, delta });
                }
            }
            row.spawn((
                PanelMenu,
                Interaction::None,
                bevy::ui::FocusPolicy::Block,
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
                use crate::CameraAction::*;
                for action in [
                    Camp,
                    Reset,
                    River,
                    Turn(false),
                    Turn(true),
                    Zoom(false),
                    Zoom(true),
                ] {
                    spawn_button(menu, &assets, Action::Camera(action));
                }
                spawn_button(menu, &assets, Action::GridOverlay);
                for row in 0..9 {
                    spawn_button(menu, &assets, Action::Lens(row));
                }
                spawn_button(menu, &assets, Action::LensPage);
                spawn_button(menu, &assets, Action::ClearLens);
                for action in [
                    AdvanceAction::Adjust(-7),
                    AdvanceAction::Adjust(-1),
                    AdvanceAction::Adjust(1),
                    AdvanceAction::Adjust(7),
                    AdvanceAction::Method,
                    AdvanceAction::Start,
                ] {
                    spawn_button(menu, &assets, Action::Advance(action));
                }
                for action in [
                    ProjectAction::Prioritize,
                    ProjectAction::Move,
                    ProjectAction::Salvage,
                    ProjectAction::Demolish,
                ] {
                    spawn_button(menu, &assets, Action::SelectedProject(action));
                }
                for action in [
                    FarmControl::NextBed,
                    FarmControl::Irrigation,
                    FarmControl::Residues,
                    FarmControl::Crop,
                    FarmControl::Density,
                ]
                .into_iter()
                .chain(
                    [
                        FarmAction::Prepare,
                        FarmAction::Plant,
                        FarmAction::Harvest,
                        FarmAction::Clear,
                        FarmAction::Amend,
                        FarmAction::Collect,
                    ]
                    .into_iter()
                    .map(FarmControl::Work),
                ) {
                    spawn_button(menu, &assets, Action::Farm(action));
                }
                for brush in [Brush::Raise, Brush::Lower, Brush::Flatten, Brush::Smooth] {
                    spawn_button(menu, &assets, Action::TerrainBrush(brush));
                }
                spawn_button(menu, &assets, Action::TerrainRadius(false));
                spawn_button(menu, &assets, Action::TerrainRadius(true));
                spawn_button(menu, &assets, Action::UndoTerrain);
                for delta in [IVec2::NEG_X, IVec2::X, IVec2::NEG_Y, IVec2::Y] {
                    spawn_button(menu, &assets, Action::ResizeField(delta));
                }
                for (panel, _) in Action::PANELS {
                    spawn_button(menu, &assets, Action::Panel(panel));
                }
                for index in 0..NAMES.len() {
                    spawn_button(menu, &assets, Action::Resident(index));
                }
                spawn_button(menu, &assets, Action::Shift(false));
                spawn_button(menu, &assets, Action::Shift(true));
                spawn_button(menu, &assets, Action::Ledger);
                spawn_button(menu, &assets, Action::PantryBatches);
                spawn_button(menu, &assets, Action::PantryPriority);
                for (reserve, budget, toggle) in [
                    (-1, 0, false),
                    (1, 0, false),
                    (0, -2_500, false),
                    (0, 2_500, false),
                    (0, 0, true),
                ] {
                    spawn_button(menu, &assets, Action::PantryPolicy(reserve, budget, toggle));
                }
                spawn_button(menu, &assets, Action::Grid);
                for command in [
                    WaterCommand::Camp { source: true },
                    WaterCommand::Camp { source: false },
                    WaterCommand::NextChannel,
                    WaterCommand::River,
                    WaterCommand::Carry,
                    WaterCommand::Purify,
                    WaterCommand::Sanitation,
                    WaterCommand::Policy(true),
                    WaterCommand::Policy(false),
                ] {
                    spawn_button(menu, &assets, Action::Water(command));
                }
                spawn_button(menu, &assets, Action::AutomaticUpkeep);
                for restock in [false, true] {
                    for increase in [false, true] {
                        spawn_button(menu, &assets, Action::UpkeepBudget { restock, increase });
                    }
                }
                spawn_button(menu, &assets, Action::Home(true));
                spawn_button(menu, &assets, Action::Home(false));
                for row in 0..HOME_ROWS {
                    spawn_button(menu, &assets, Action::ListedHome(row));
                }
                spawn_button(menu, &assets, Action::ProjectFilter);
                for order in [
                    TradeOrder::Buy { freight: false },
                    TradeOrder::Buy { freight: true },
                    TradeOrder::Sell,
                    TradeOrder::Cancel,
                ] {
                    spawn_button(menu, &assets, Action::Trade(order));
                }
                for policy in [
                    TradePolicy::HouseholdRestock,
                    TradePolicy::AutomaticSale,
                    TradePolicy::Reserve(false),
                    TradePolicy::Reserve(true),
                    TradePolicy::Limit,
                    TradePolicy::Trigger,
                ] {
                    spawn_button(menu, &assets, Action::TradePolicy(policy));
                }
                spawn_button(menu, &assets, Action::RecipePage(false));
                spawn_button(menu, &assets, Action::RecipePage(true));
                for row in 0..crate::construction::PAGE_KEYS.len() {
                    spawn_button(menu, &assets, Action::Project(row));
                    spawn_button(menu, &assets, Action::Recipe(row));
                    spawn_button(menu, &assets, Action::TradeItem(row));
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
    (mut setup, mut saves, mut sound): (
        ResMut<WorldSetup>,
        ResMut<SaveMenu>,
        ResMut<SoundSettings>,
    ),
    (catalog, land): (Res<Catalog>, Res<Land>),
    (mut village, mut pointer): (ResMut<Village>, ResMut<CampPointer>),
    mut picker: ResMut<PanelPicker>,
    keyboard: Res<ButtonInput<KeyCode>>,
    mut camera: Single<(&mut VillageCamera, &mut Projection)>,
    buttons: Query<(&Action, &Interaction), Changed<Interaction>>,
) {
    if !visible(&village, &setup, &saves, &sound) {
        picker.view_open = false;
        picker.open = false;
        return;
    }
    if keyboard.just_pressed(KeyCode::Escape) || !Action::Manage.available(&village) {
        picker.open = false;
    }
    if keyboard.just_pressed(KeyCode::Escape) || !Action::View.available(&village) {
        picker.view_open = false;
    }
    let (camera, projection) = &mut *camera;
    for (&action, &interaction) in &buttons {
        if interaction != Interaction::Pressed {
            continue;
        }
        if sound.open {
            match action {
                Action::Sound => sound.open = false,
                Action::Volume { effects, delta } => sound.adjust_volume(effects, delta),
                _ => {}
            }
            continue;
        }
        if saves.open {
            if matches!(action, Action::Library) {
                library_ui::toggle_library(&mut saves, setup.mode);
            }
            continue;
        }
        if !setup.open
            && (village.camp.is_some() || matches!(action, Action::CampPreset(_)))
            && action.available(&village)
        {
            match action {
                Action::Sound => {
                    sound.open = true;
                    picker.open = false;
                }
                Action::Volume { .. } => {}
                Action::View => {
                    picker.view_open = !picker.view_open;
                    picker.open = false;
                }
                Action::Camera(action) if picker.view_open => {
                    if let Projection::Orthographic(projection) = &mut **projection {
                        crate::apply_camera_action(action, &village, &setup, camera, projection);
                    }
                }
                Action::GridOverlay if picker.view_open => village.show_grid = !village.show_grid,
                Action::Camera(_) | Action::GridOverlay => {}
                Action::CampPreset(index) => pointer.preset = Some(CAMP_SITES[index].1),
                Action::Setup => {
                    setup.open = true;
                    picker.open = false;
                }
                Action::Library => {
                    library_ui::toggle_library(&mut saves, setup.mode);
                    picker.open = false;
                }
                Action::Build => {
                    village.construction.toggle_build_menu();
                    picker.open = false;
                }
                Action::RotatePlacement => village.construction.rotate_placement(),
                Action::CancelPlacement => village.construction.cancel_placement(),
                Action::ConnectRoad => village.connect_road_strokes = !village.connect_road_strokes,
                Action::UndoRoad => {
                    let town = &mut *village;
                    town.construction.undo_roads(&mut town.stock);
                }
                Action::FinishRoad => village.finish_road_planning(),
                Action::Terrain => {
                    village.terrain_editor.toggle();
                    picker.open = false;
                }
                Action::TerrainBrush(brush) => village.terrain_editor.select_brush(brush),
                Action::TerrainRadius(forward) => village.terrain_editor.cycle_radius(forward),
                Action::UndoTerrain => village.terrain_editor.undo(),
                Action::Advance(action) => {
                    if village.advance.apply(action) {
                        village.checkpoint_advance();
                    }
                    picker.open = false;
                }
                Action::ResizeField(delta) if village.construction.placing_field() => {
                    village.construction.resize_field_placement(delta);
                }
                Action::ResizeField(delta) if !picker.open => {
                    if let Some(camp) = village.camp {
                        let terrain = village.terrain(&setup);
                        let sandbox = village.stock.sandbox;
                        village.construction.resize_selected_field(
                            &catalog,
                            ConstructionSite {
                                terrain: &terrain,
                                land: &land,
                                camp,
                            },
                            delta,
                            sandbox,
                        );
                    }
                }
                Action::ResizeField(_) => {}
                Action::Pause => village.paused = !village.paused,
                Action::Speed => village.speed = (village.speed + 1) % SPEEDS.len(),
                Action::Lenses => {
                    village.lenses.toggle();
                    picker.open = false;
                }
                Action::Lens(row) => {
                    if let Some(&(_, lens, _)) = village.lenses.choices().get(row) {
                        village.lenses.choose(Some(lens));
                    }
                }
                Action::LensPage => village.lenses.turn_page(),
                Action::LensSite(forward) => village.focus_network_site(&setup, camera, forward),
                Action::LensFilter(forward) => {
                    village
                        .lenses
                        .adjust_filter(catalog.materials.len(), forward);
                }
                Action::ClearLens => village.lenses.choose(None),
                Action::Guide => {
                    village.guide.toggle();
                    picker.open = false;
                }
                Action::Manage => {
                    picker.open = !picker.open;
                    picker.view_open = false;
                }
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
                Action::Page(forward) if village.trade_open() => {
                    village.construction.page_trade(&catalog, forward)
                }
                Action::Page(forward) => village.change_panel_page(&catalog, forward),
                Action::TradeItem(row) if !picker.open => {
                    village.construction.select_trade_row(&catalog, row)
                }
                Action::Project(row) if !picker.open => {
                    village.focus_project_row(&catalog, &setup, camera, row);
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
                Action::Shift(repeat) if !picker.open => {
                    let resident = village.selected_resident;
                    if repeat {
                        village.construction.toggle_weekday_shift(resident);
                    } else {
                        village.construction.toggle_shift(resident);
                    }
                }
                Action::Ledger if !picker.open => {
                    village.finance_history_open = !village.finance_history_open;
                    village.finance_history_page = 0;
                }
                Action::Grid if !picker.open => {
                    let utilities = &mut village.construction.utilities;
                    utilities.grid_off = !utilities.grid_off;
                }
                Action::AutomaticUpkeep if !picker.open => {
                    village.construction.toggle_automatic_upkeep()
                }
                Action::UpkeepBudget { restock, increase } if !picker.open => {
                    village.construction.adjust_upkeep_budget(restock, increase);
                }
                Action::Water(command) if !picker.open => {
                    let town = &mut *village;
                    town.water_panel.apply(command, &mut town.construction);
                }
                Action::PantryBatches if !picker.open => {
                    village.pantry_batch_page = village.pantry_batch_page.is_none().then_some(0);
                }
                Action::PantryPriority if !picker.open => {
                    village.stock.pantry.priority = village.stock.pantry.priority.next();
                }
                Action::PantryPolicy(reserve, budget, toggle) if !picker.open => {
                    village
                        .construction
                        .trade
                        .pantry_controls(reserve, budget, toggle);
                }
                Action::Trade(order) if !picker.open => {
                    let town = &mut *village;
                    town.construction.place_trade_order(
                        &catalog,
                        &mut town.stock,
                        TownClock {
                            seconds: town.clock,
                            round_trip_km: setup.round_trip_km(),
                        },
                        order,
                    );
                }
                Action::TradePolicy(policy) if !picker.open => {
                    village.construction.adjust_trade_policy(&catalog, policy);
                }
                Action::SelectedProject(action) if !picker.open => {
                    let town = &mut *village;
                    town.construction
                        .apply_project_action(&catalog, &mut town.stock, action);
                }
                Action::Gather => {
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
                Action::Recipes => {
                    village.construction.toggle_recipes(&catalog);
                    picker.open = false;
                }
                Action::RecipePage(forward) if !picker.open => {
                    village.construction.page_recipes(&catalog, forward)
                }
                Action::Recipe(row) if !picker.open => {
                    let town = &mut *village;
                    town.construction
                        .queue_recipe_row(&catalog, &mut town.stock, row);
                }
                Action::Beds => {
                    village.construction.toggle_beds();
                    picker.open = false;
                }
                Action::Farm(action) if !picker.open => {
                    let town = &mut *village;
                    town.construction.apply_farm_control(
                        &catalog,
                        &mut town.stock,
                        action,
                        TownClock {
                            seconds: town.clock,
                            round_trip_km: setup.round_trip_km(),
                        },
                    );
                }
                Action::Panel(_)
                | Action::Project(_)
                | Action::Recipe(_)
                | Action::RecipePage(_)
                | Action::Farm(_)
                | Action::SelectedProject(_)
                | Action::TradeItem(_)
                | Action::Trade(_)
                | Action::TradePolicy(_)
                | Action::ProjectFilter
                | Action::Resident(_)
                | Action::Home(_)
                | Action::ListedHome(_)
                | Action::Shift(_)
                | Action::Ledger
                | Action::PantryBatches
                | Action::PantryPriority
                | Action::PantryPolicy(..)
                | Action::Grid
                | Action::Water(_)
                | Action::AutomaticUpkeep
                | Action::UpkeepBudget { .. } => {}
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
        &'static ChildOf,
        &'static mut BackgroundColor,
        &'static mut Node,
    ),
    (Without<Toolbar>, Without<PanelMenu>),
>;

type PanelNode<'w, 's> =
    Single<'w, 's, (Entity, &'static mut Node), (With<PanelMenu>, Without<Toolbar>)>;

fn refresh(
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    (village, catalog): (Res<Village>, Res<Catalog>),
    mut picker: ResMut<PanelPicker>,
    mut toolbar: Single<&mut Node, (With<Toolbar>, Without<PanelMenu>)>,
    mut menu: PanelNode,
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
    let (menu_id, menu) = &mut *menu;
    let show_view = picker.view_open && Action::View.available(&village);
    let show_lenses = Action::LensPage.available(&village);
    let show_beds = !picker.open && Action::Farm(FarmControl::NextBed).available(&village);
    let show_recipes = !picker.open && Action::RecipePage(true).available(&village);
    let recipes = if show_recipes {
        village.construction.recipe_page_labels(&catalog)
    } else {
        Vec::new()
    };
    let show_selected_project = !picker.open
        && Action::SelectedProject(ProjectAction::Salvage).available(&village)
        && village
            .construction
            .project_action_available(&catalog, ProjectAction::Salvage);
    let show_advance = Action::Advance(AdvanceAction::Start).available(&village);
    let show_terrain = Action::UndoTerrain.available(&village);
    let show_field_size = Action::ResizeField(IVec2::ZERO).available(&village);
    let show_projects = !picker.open && Action::ProjectFilter.available(&village);
    let show_trade = !picker.open && Action::TradeItem(0).available(&village);
    let trade_items = if show_trade {
        village.construction.trade_page_labels(&catalog)
    } else {
        Vec::new()
    };
    let show_pantry = !picker.open && Action::PantryBatches.available(&village);
    let show_finances = !picker.open && Action::Ledger.available(&village);
    let show_power = !picker.open && Action::Grid.available(&village);
    let show_water = !picker.open && Action::Water(WaterCommand::River).available(&village);
    let show_upkeep = !picker.open && Action::AutomaticUpkeep.available(&village);
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
    menu.display = if show_view
        || show_lenses
        || show_beds
        || show_recipes
        || show_selected_project
        || show_advance
        || show_terrain
        || show_field_size
        || show_projects
        || show_residents
        || show_finances
        || show_pantry
        || show_trade
        || show_power
        || show_upkeep
        || show_water
        || (picker.open && Action::Manage.available(&village))
    {
        Display::Flex
    } else {
        Display::None
    };
    if saves.open || sound.open {
        menu.display = Display::None;
    }
    for (&action, &interaction, children, parent, mut background, mut node) in &mut buttons {
        let show = match action {
            Action::Lens(row) => show_lenses && row < village.lenses.choices().len(),
            Action::LensPage | Action::ClearLens => show_lenses,
            Action::LensFilter(_) | Action::LensSite(_) => action.available(&village),
            Action::Advance(AdvanceAction::Toggle) => true,
            Action::Volume { .. } => false,
            Action::Advance(_) => show_advance,
            Action::Page(_) if village.utility_panel == Some(UtilityPanel::Residents) => {
                show_residents && home_pages > 1
            }
            Action::Page(_)
            | Action::ClosePanel
            | Action::RotatePlacement
            | Action::CancelPlacement
            | Action::ConnectRoad
            | Action::UndoRoad
            | Action::FinishRoad => action.available(&village),
            Action::ResizeField(_) => !picker.open && show_field_size,
            Action::TerrainBrush(_) | Action::TerrainRadius(_) | Action::UndoTerrain => {
                show_terrain
            }
            Action::Project(row) => projects.get(row).is_some(),
            Action::Recipes => {
                action.available(&village) && village.construction.has_recipes(&catalog)
            }
            Action::RecipePage(_) => show_recipes,
            Action::Beds | Action::Gather => action.available(&village),
            Action::Farm(_) => show_beds,
            Action::Recipe(row) => recipes.get(row).is_some(),
            Action::SelectedProject(action) => {
                show_selected_project
                    && village
                        .construction
                        .project_action_available(&catalog, action)
            }
            Action::TradeItem(row) => trade_items.get(row).is_some(),
            Action::Trade(_) | Action::TradePolicy(_) => show_trade,
            Action::ProjectFilter => show_projects,
            Action::ListedHome(row) => homes.get(row).is_some(),
            Action::Resident(_) => show_residents || show_finances,
            Action::Shift(_) | Action::Ledger => show_finances,
            Action::PantryBatches | Action::PantryPriority | Action::PantryPolicy(..) => {
                show_pantry && action.available(&village)
            }
            Action::Home(_) => show_residents,
            Action::Grid => show_power,
            Action::Water(_) => show_water,
            Action::AutomaticUpkeep | Action::UpkeepBudget { .. } => show_upkeep,
            Action::Panel(_) => picker.open,
            _ => true,
        };
        let show = if matches!(action, Action::Camera(_) | Action::GridOverlay) {
            show_view
        } else {
            show && !(show_view && parent.parent() == *menu_id)
        };
        let show = if sound.open {
            matches!(action, Action::Sound | Action::Volume { .. })
        } else if saves.open {
            matches!(action, Action::Library)
        } else if village.camp.is_none() {
            matches!(action, Action::CampPreset(_)) && action.available(&village)
        } else if matches!(action, Action::CampPreset(_)) {
            false
        } else {
            show
        };
        node.display = if show { Display::Flex } else { Display::None };
        if !show {
            continue;
        }
        background.0 = if !action.available(&village)
            && !matches!(
                action,
                Action::Volume { .. } | Action::Library | Action::Sound
            ) {
            Color::srgb_u8(40, 53, 43)
        } else if interaction == Interaction::None {
            Color::srgb_u8(58, 78, 61)
        } else {
            Color::srgb_u8(78, 105, 82)
        };
        if let Ok(mut text) = labels.get_mut(children[0]) {
            let label = match action {
                Action::Sound if sound.open => "Close sound settings".into(),
                Action::Volume { effects, delta } => format!(
                    "{} {}% {}",
                    if effects { "Effects" } else { "Music" },
                    sound.volume(effects),
                    if delta < 0 { "−" } else { "+" }
                ),
                Action::Library if saves.open => "Close saved villages".into(),
                Action::Project(row) => projects[row].clone(),
                Action::Recipe(row) => recipes[row].clone(),
                Action::TradeItem(row) => trade_items[row].clone(),
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
