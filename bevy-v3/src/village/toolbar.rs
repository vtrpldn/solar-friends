use super::*;
use crate::{
    construction::{FarmControl, ProjectAction, TradeOrder, TradePolicy, WorkGroup},
    farming::FarmAction,
    terrain::Brush,
    time_advance::AdvanceAction,
};

pub(super) const PANEL_WIDTH: f32 = 240.0;

#[derive(Component, Clone, Copy)]
enum Action {
    Build,
    CampPreset(usize),
    Setup,
    View,
    CameraControls,
    Camera(crate::CameraAction),
    GridOverlay,
    Forecast,
    Diagnostics,
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
    PickFlattenHeight,
    UndoTerrain,
    RedoTerrain,
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
    ResourcePanel(UtilityPanel),
    GridFromFinances,
    StoresFromUpkeep,
    PantryFromStores,
    ClosePanel,
    Page(bool),
    Project(usize),
    Recipes,
    Gather,
    Beds,
    Farm(FarmControl),
    Recipe(usize),
    RecipePage(bool),
    CraftWorkspace,
    MoveCraft,
    FacilityIrrigation,
    SelectedProject(ProjectAction),
    FocusSelectedProject,
    DeselectProject,
    TradeItem(usize),
    TradeQueue,
    TradeQueued(usize),
    HoldTradeQueued(usize),
    Trade(TradeOrder),
    TradePolicy(TradePolicy),
    ProjectFilter,
    InventoryView,
    InventoryItem(usize),
    InventorySearch,
    Resident(usize),
    WorkPriority(WorkGroup),
    WorkerReservation(bool),
    Home(bool),
    ListedHome(usize),
    Shift(bool),
    Ledger,
    ExpansionReserve,
    PantryBatches,
    PantryPriority,
    PantryTransport,
    PantryBudget,
    AutoCook,
    CookingTarget { preserved: bool, increase: bool },
    PantryPolicy(i8, i64, bool),
    Grid,
    BuildingPower,
    Cooling,
    Water(WaterCommand),
    NextWasteTank,
    InstallWaterLink,
    InstallPowerLink,
    NextPowerShortage,
    UtilityLinkPage(bool),
    ToggleUtilityLink,
    RemoveUtilityLink,
    CancelUtilityInstallation,
    NextUtilityInstallation,
    AutomaticUpkeep,
    UpkeepJob(usize),
    UpkeepBudget { restock: bool },
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
        if matches!(self, Self::InventorySearch) {
            return village.utility_panel == Some(UtilityPanel::Inventory)
                && !village.guide.open()
                && !village.lenses.open
                && !village.advance_open()
                && !village.terrain_editor.open;
        }
        if matches!(self, Self::Guide) {
            return !village.construction.editing_search;
        }
        if let Self::Advance(action) = self {
            return village.camp.is_some()
                && !village.map_input_blocked()
                && !village.planning_roads()
                && !village.terrain_editor.open
                && (matches!(action, AdvanceAction::Toggle)
                    || (village.advance.open
                        && village.advance.running.is_none()
                        && (!matches!(action, AdvanceAction::Start)
                            || village.advance.can_start())));
        }
        if matches!(self, Self::ConnectRoad | Self::UndoRoad | Self::FinishRoad) {
            return village.planning_roads()
                && !village.map_input_blocked()
                && (!matches!(self, Self::UndoRoad) || village.construction.can_undo_roads());
        }
        if !village.map_input_blocked() && !village.advance_open() && !village.planning_roads() {
            match self {
                Self::Terrain => return true,
                Self::PickFlattenHeight => return village.terrain_editor.can_pick_flatten_height(),
                Self::TerrainBrush(_) | Self::TerrainRadius(_) => {
                    return village.terrain_editor.open;
                }
                Self::UndoTerrain => {
                    return village.terrain_editor.open && village.terrain_editor.can_undo();
                }
                Self::RedoTerrain => {
                    return village.terrain_editor.open && village.terrain_editor.can_redo();
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
            Self::Terrain
            | Self::TerrainBrush(_)
            | Self::TerrainRadius(_)
            | Self::PickFlattenHeight
            | Self::UndoTerrain
            | Self::RedoTerrain => false,
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
            Self::Recipe(_)
            | Self::RecipePage(_)
            | Self::FacilityIrrigation
            | Self::CraftWorkspace
            | Self::MoveCraft => {
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
            Self::View
            | Self::CameraControls
            | Self::Camera(_)
            | Self::GridOverlay
            | Self::Forecast
            | Self::Diagnostics => !village.trade_open(),
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
            Self::ResourcePanel(panel) => {
                village.utility_panel.is_none()
                    && Self::Manage.available(village)
                    && Self::Panel(panel).available(village)
            }
            Self::GridFromFinances => {
                village.utility_panel == Some(UtilityPanel::Finances)
                    && !village.finance_history_open
            }
            Self::StoresFromUpkeep => village.utility_panel == Some(UtilityPanel::Upkeep),
            Self::PantryFromStores => {
                village.utility_panel == Some(UtilityPanel::Inventory)
                    && !village.inventory_equipment
                    && !village.editing_inventory
                    && Self::Panel(UtilityPanel::Pantry).available(village)
            }
            Self::Panel(UtilityPanel::Finances | UtilityPanel::Trade | UtilityPanel::Upkeep) => {
                !village.stock.sandbox
            }
            Self::Panel(_) => true,
            Self::ClosePanel => village.utility_panel.is_some(),
            Self::Grid => village.utility_panel == Some(UtilityPanel::Power),
            Self::BuildingPower | Self::Cooling => {
                matches!(village.utility_panel, None | Some(UtilityPanel::Power))
                    && !village.construction.menu
                    && !village.construction.is_placing()
                    && self.facility_switch(village).is_some()
            }
            Self::UtilityLinkPage(_) | Self::ToggleUtilityLink => village.utility_link_count() > 0,
            Self::RemoveUtilityLink => village.can_remove_selected_utility_link(),
            Self::NextUtilityInstallation => village.has_queued_utility_installation(),
            Self::CancelUtilityInstallation => village.can_cancel_selected_installation(),
            Self::InstallPowerLink => village.utility_panel == Some(UtilityPanel::Power),
            Self::NextPowerShortage => {
                village.utility_panel == Some(UtilityPanel::Power)
                    && village
                        .construction
                        .utilities
                        .power_shortages()
                        .next()
                        .is_some()
            }
            Self::Water(_) | Self::InstallWaterLink => {
                village.utility_panel == Some(UtilityPanel::Water)
            }
            Self::NextWasteTank => {
                village.utility_panel == Some(UtilityPanel::Water)
                    && village
                        .construction
                        .utilities
                        .waste_tanks_needing_attention()
                        .next()
                        .is_some()
            }
            Self::AutomaticUpkeep | Self::UpkeepBudget { .. } | Self::UpkeepJob(_) => {
                village.utility_panel == Some(UtilityPanel::Upkeep)
            }
            Self::SelectedProject(_) => village.utility_panel.is_none(),
            Self::FocusSelectedProject | Self::DeselectProject => {
                village.selected_project_focus().is_some()
            }
            Self::TradeItem(_)
            | Self::TradeQueue
            | Self::TradeQueued(_)
            | Self::HoldTradeQueued(_)
            | Self::Trade(_)
            | Self::TradePolicy(_) => village.trade_open(),
            Self::InventorySearch => false,
            Self::InventoryItem(_) => village.utility_panel == Some(UtilityPanel::Inventory),
            Self::InventoryView => village.utility_panel == Some(UtilityPanel::Inventory),
            Self::Project(_) | Self::ProjectFilter => {
                village.utility_panel == Some(UtilityPanel::Projects)
            }
            Self::WorkPriority(_) | Self::WorkerReservation(_) => {
                village.utility_panel == Some(UtilityPanel::Residents)
            }
            Self::Resident(_) => matches!(
                village.utility_panel,
                Some(UtilityPanel::Residents | UtilityPanel::Finances)
            ),
            Self::PantryBatches => village.utility_panel == Some(UtilityPanel::Pantry),
            Self::AutoCook | Self::CookingTarget { .. } if village.stock.sandbox => false,
            Self::PantryPriority
            | Self::PantryTransport
            | Self::PantryBudget
            | Self::PantryPolicy(..)
            | Self::AutoCook
            | Self::CookingTarget { .. } => {
                village.utility_panel == Some(UtilityPanel::Pantry)
                    && village.pantry_batch_page.is_none()
            }
            Self::Page(_) if village.utility_panel == Some(UtilityPanel::Pantry) => {
                village.pantry_batch_page.is_some()
            }
            Self::Shift(_) | Self::Ledger => village.utility_panel == Some(UtilityPanel::Finances),
            Self::ExpansionReserve => {
                village.utility_panel == Some(UtilityPanel::Finances)
                    && !village.finance_history_open
            }
            Self::Home(_) | Self::ListedHome(_) => {
                village.utility_panel == Some(UtilityPanel::Residents)
            }
            Self::Page(_) if village.utility_panel == Some(UtilityPanel::Finances) => {
                village.finance_history_open
            }
            Self::Page(_) if village.utility_panel == Some(UtilityPanel::Upkeep) => {
                village.construction.upkeep_pages() > 1
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

    fn facility_switch(self, village: &Village) -> Option<bool> {
        let building = village.construction.production.selected?;
        let utilities = &village.construction.utilities;
        match self {
            Self::BuildingPower => utilities.building_switch(building),
            Self::Cooling => utilities.cooling_switch(building),
            _ => None,
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
            Self::CameraControls => "Keyboard & camera".into(),
            Self::GridOverlay if village.show_grid => "Hide grid".into(),
            Self::GridOverlay => "Show grid".into(),
            Self::Forecast if village.show_forecast => "Hide forecast".into(),
            Self::Forecast => "Show forecast".into(),
            Self::Diagnostics => "Copy bug report".into(),
            Self::Camera(action) => match action {
                crate::CameraAction::Camp => "Focus camp",
                crate::CameraAction::Reset => "Reset camera",
                crate::CameraAction::River => "Focus river",
                crate::CameraAction::Overview => "Whole plot",
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
            Self::PickFlattenHeight => "Pick a new flatten height".into(),
            Self::UndoTerrain => "Undo terrain edit".into(),
            Self::RedoTerrain => "Redo terrain edit".into(),
            Self::Advance(action) => match action {
                AdvanceAction::Toggle if village.advance.running.is_some() => "Stop advance".into(),
                AdvanceAction::Toggle if village.advance.open => "Close advance".into(),
                AdvanceAction::Toggle => "Advance days".into(),
                AdvanceAction::Adjust(days) => format!("{days:+} day(s)"),
                AdvanceAction::Start => "Start advance".into(),
                AdvanceAction::Digit(_) | AdvanceAction::Backspace => String::new(),
            },
            Self::ResizeField(delta) => format!(
                "{} {}",
                if delta.x != 0 { "Width" } else { "Depth" },
                if delta.x + delta.y > 0 { "+" } else { "−" }
            ),
            Self::Pause if village.planning_pause() && village.paused => "Resume on close".into(),
            Self::Pause if village.planning_pause() => "Stay paused on close".into(),
            Self::Pause if village.paused => "Resume".into(),
            Self::Pause => "Pause".into(),
            Self::Speed => village.speed_label(),
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
            Self::ResourcePanel(UtilityPanel::Finances) => "Savings".into(),
            Self::ResourcePanel(UtilityPanel::Pantry) => "Food portions".into(),
            Self::ResourcePanel(UtilityPanel::Power) => "Battery".into(),
            Self::GridFromFinances => "Manage grid power".into(),
            Self::StoresFromUpkeep => "Manage service supplies".into(),
            Self::PantryFromStores => "Manage food".into(),
            Self::Panel(panel) | Self::ResourcePanel(panel) => Self::PANELS
                .iter()
                .find_map(|(item, label)| (*item == panel).then_some(*label))
                .unwrap_or_default()
                .into(),
            Self::ClosePanel => "Close panel".into(),
            Self::Page(false) => "Previous page".into(),
            Self::Page(true) => "Next page".into(),
            Self::InventorySearch if village.editing_inventory => "Done searching".into(),
            Self::InventorySearch => "Find material".into(),
            Self::InventoryView if village.inventory_equipment => "Show resources".into(),
            Self::InventoryView => "Show items and equipment".into(),
            Self::ProjectFilter if village.open_projects_only => "Show all projects".into(),
            Self::ProjectFilter => "Show underway".into(),
            Self::Project(_)
            | Self::TradeItem(_)
            | Self::InventoryItem(_)
            | Self::Recipe(_)
            | Self::FacilityIrrigation => String::new(),
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
            Self::CraftWorkspace => "Next workspace".into(),
            Self::MoveCraft => "Move unfinished job".into(),
            Self::RecipePage(false) => "Previous recipes".into(),
            Self::RecipePage(true) => "Next recipes".into(),
            Self::FocusSelectedProject => "Find in village".into(),
            Self::DeselectProject => "Close project".into(),
            Self::SelectedProject(action) => match action {
                ProjectAction::Prioritize => "Prioritize project",
                ProjectAction::Move => "Move building",
                ProjectAction::Copy => "Copy blueprint",
                ProjectAction::Salvage => "Cancel or salvage",
                ProjectAction::Demolish => "Demolish",
            }
            .into(),
            Self::TradeQueue if village.construction.trade.queue_page.is_some() => {
                "Browse materials".into()
            }
            Self::TradeQueue => "View orders".into(),
            Self::TradeQueued(_) | Self::HoldTradeQueued(_) => String::new(),
            Self::Trade(TradeOrder::Buy { freight: false }) => "Buy for pickup".into(),
            Self::Trade(TradeOrder::Buy { freight: true }) => "Buy for delivery".into(),
            Self::Trade(TradeOrder::Sell {
                hold_for_pickup: false,
            }) => "Reserve sale".into(),
            Self::Trade(TradeOrder::Sell {
                hold_for_pickup: true,
            }) => "Sell on shared trip".into(),
            Self::Trade(TradeOrder::Cancel) => "Cancel last order".into(),
            Self::TradePolicy(policy) => match policy {
                TradePolicy::HouseholdRestock => "Toggle household restock",
                TradePolicy::AutomaticSale => "Toggle auto sale",
                TradePolicy::Reserve(false) => "Keep one pack less",
                TradePolicy::Reserve(true) => "Keep one pack more",
                TradePolicy::Limit => "Cycle sale limit",
                TradePolicy::Trigger => "Cycle sale trigger",
                TradePolicy::MinimumLoad => "Change minimum load",
                TradePolicy::DispatchWait => "Change dispatch wait",
                TradePolicy::DispatchNow => "Send waiting loads now",
            }
            .into(),
            Self::Resident(index) if index == village.selected_resident => {
                format!("› {}", NAMES[index])
            }
            Self::Resident(index) => NAMES[index].into(),
            Self::WorkPriority(group) => village.construction.work_priority_label(group),
            Self::WorkerReservation(essential) => {
                village.construction.worker_reservation_label(essential)
            }
            Self::Home(true) => "Assign selected home".into(),
            Self::Home(false) => "Clear home assignment".into(),
            Self::ListedHome(_) => String::new(),
            Self::Shift(false) => "Toggle day shift".into(),
            Self::Shift(true) => "Toggle weekday shifts".into(),
            Self::Ledger if village.finance_history_open => "Close ledger".into(),
            Self::Ledger => "Open ledger".into(),
            Self::ExpansionReserve => budget_label(
                village,
                BudgetTarget::ExpansionReserve,
                "Set construction cash reserve",
            ),
            Self::PantryBatches if village.pantry_batch_page.is_some() => {
                "Close food batches".into()
            }
            Self::PantryBatches => "Food batches".into(),
            Self::PantryPriority => {
                format!("Chill first · {}", village.stock.pantry.priority.label())
            }
            Self::PantryTransport if village.construction.supplier_construction() => {
                "Purchases: supplier freight".into()
            }
            Self::PantryTransport => "Purchases: resident pickup".into(),
            Self::PantryBudget => {
                budget_label(village, BudgetTarget::Food, "Set daily food budget")
            }
            Self::AutoCook if village.construction.production.kitchen_policy.automatic => {
                "Automatic cooking on".into()
            }
            Self::AutoCook => "Automatic cooking off".into(),
            Self::CookingTarget {
                preserved,
                increase,
            } => format!(
                "{} {:.1}d {}",
                if preserved {
                    "Dried target"
                } else {
                    "Fresh target"
                },
                f64::from(
                    village
                        .construction
                        .production
                        .kitchen_policy
                        .half_days(preserved)
                ) / 2.0,
                if increase { "+" } else { "−" }
            ),
            Self::PantryPolicy(_, _, true) if village.construction.trade.household_restock_off => {
                "Automatic food purchases off".into()
            }
            Self::PantryPolicy(_, _, true) => "Automatic food purchases on".into(),
            Self::PantryPolicy(-1, _, false) => "Reserve −0.5d".into(),
            Self::PantryPolicy(1, _, false) => "Reserve +0.5d".into(),
            Self::PantryPolicy(_, budget, false) if budget < 0 => "Budget −R$25".into(),
            Self::PantryPolicy(_, _, false) => "Budget +R$25".into(),
            Self::Grid if village.construction.utilities.grid_off => "Connect grid".into(),
            Self::Grid => "Disconnect grid".into(),
            Self::BuildingPower if self.facility_switch(village) == Some(true) => {
                "Switch building off".into()
            }
            Self::BuildingPower => "Switch building on".into(),
            Self::Cooling if self.facility_switch(village) == Some(true) => "Pause cooling".into(),
            Self::Cooling => "Resume cooling".into(),
            Self::NextWasteTank => "Next waste tank".into(),
            Self::InstallWaterLink => "Install water connection".into(),
            Self::InstallPowerLink => "Install power connection".into(),
            Self::NextPowerShortage => "Next building without power".into(),
            Self::UtilityLinkPage(false) => "Previous connection".into(),
            Self::UtilityLinkPage(true) => "Next connection".into(),
            Self::ToggleUtilityLink => "Switch connection".into(),
            Self::RemoveUtilityLink => "Remove manual connection".into(),
            Self::CancelUtilityInstallation => "Cancel installation".into(),
            Self::NextUtilityInstallation => "Next installation".into(),
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
            Self::AutomaticUpkeep => format!(
                "Automatic maintenance {}",
                if village.construction.automatic_upkeep() {
                    "on"
                } else {
                    "off"
                }
            ),
            Self::UpkeepJob(_) => String::new(),
            Self::UpkeepBudget { restock: false } => budget_label(
                village,
                BudgetTarget::MaintenanceParts,
                "Set parts allowance",
            ),
            Self::UpkeepBudget { restock: true } => budget_label(
                village,
                BudgetTarget::MaintenanceShopping,
                "Set feed and repair budget",
            ),
        }
    }
}

fn budget_label(village: &Village, target: BudgetTarget, label: &str) -> String {
    match &village.budget_entry {
        Some((active, entry)) if *active == target => {
            format!("R${entry} · Enter to set · Esc to cancel")
        }
        _ => label.into(),
    }
}

#[derive(Component)]
struct Toolbar;

#[derive(Component)]
struct PanelMenu;

#[derive(Component)]
struct ActionDetails;

const HOME_ROWS: usize = 4;

#[derive(Default, Resource)]
pub(crate) struct PanelPicker {
    open: bool,
    home_page: usize,
    view_open: bool,
    visible_homes: [Option<usize>; HOME_ROWS],
}

impl PanelPicker {
    pub(crate) fn dismiss(&mut self) -> bool {
        let was_open = self.open || self.view_open;
        self.open = false;
        self.view_open = false;
        was_open
    }
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
                Action::Forecast,
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
                Action::ResourcePanel(UtilityPanel::Finances),
                Action::ResourcePanel(UtilityPanel::Pantry),
                Action::ResourcePanel(UtilityPanel::Power),
                Action::ResourcePanel(UtilityPanel::Water),
                Action::ClosePanel,
                Action::InventoryView,
                Action::InventorySearch,
                Action::PantryFromStores,
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
                    width: px(PANEL_WIDTH),
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
                    Overview,
                    Turn(false),
                    Turn(true),
                    Zoom(false),
                    Zoom(true),
                ] {
                    spawn_button(menu, &assets, Action::Camera(action));
                }
                spawn_button(menu, &assets, Action::CameraControls);
                spawn_button(menu, &assets, Action::GridOverlay);
                spawn_button(menu, &assets, Action::Forecast);
                spawn_button(menu, &assets, Action::Diagnostics);
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
                    AdvanceAction::Start,
                ] {
                    spawn_button(menu, &assets, Action::Advance(action));
                }
                spawn_button(menu, &assets, Action::FocusSelectedProject);
                spawn_button(menu, &assets, Action::DeselectProject);
                for action in [
                    ProjectAction::Prioritize,
                    ProjectAction::Move,
                    ProjectAction::Copy,
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
                spawn_button(menu, &assets, Action::PickFlattenHeight);
                spawn_button(menu, &assets, Action::UndoTerrain);
                spawn_button(menu, &assets, Action::RedoTerrain);
                for delta in [IVec2::NEG_X, IVec2::X, IVec2::NEG_Y, IVec2::Y] {
                    spawn_button(menu, &assets, Action::ResizeField(delta));
                }
                for (panel, _) in Action::PANELS {
                    spawn_button(menu, &assets, Action::Panel(panel));
                }
                for index in 0..NAMES.len() {
                    spawn_button(menu, &assets, Action::Resident(index));
                }
                for group in WorkGroup::ALL {
                    spawn_button(menu, &assets, Action::WorkPriority(group));
                }
                spawn_button(menu, &assets, Action::WorkerReservation(true));
                spawn_button(menu, &assets, Action::WorkerReservation(false));
                spawn_button(menu, &assets, Action::Shift(false));
                spawn_button(menu, &assets, Action::Shift(true));
                spawn_button(menu, &assets, Action::Ledger);
                spawn_button(menu, &assets, Action::ExpansionReserve);
                spawn_button(menu, &assets, Action::GridFromFinances);
                spawn_button(menu, &assets, Action::PantryBatches);
                spawn_button(menu, &assets, Action::PantryPriority);
                spawn_button(menu, &assets, Action::PantryTransport);
                spawn_button(menu, &assets, Action::PantryBudget);
                spawn_button(menu, &assets, Action::AutoCook);
                for preserved in [false, true] {
                    for increase in [false, true] {
                        spawn_button(
                            menu,
                            &assets,
                            Action::CookingTarget {
                                preserved,
                                increase,
                            },
                        );
                    }
                }
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
                spawn_button(menu, &assets, Action::InstallPowerLink);
                spawn_button(menu, &assets, Action::NextPowerShortage);
                spawn_button(menu, &assets, Action::UtilityLinkPage(false));
                spawn_button(menu, &assets, Action::UtilityLinkPage(true));
                spawn_button(menu, &assets, Action::ToggleUtilityLink);
                spawn_button(menu, &assets, Action::RemoveUtilityLink);
                spawn_button(menu, &assets, Action::CancelUtilityInstallation);
                spawn_button(menu, &assets, Action::NextUtilityInstallation);
                spawn_button(menu, &assets, Action::BuildingPower);
                spawn_button(menu, &assets, Action::Cooling);
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
                spawn_button(menu, &assets, Action::NextWasteTank);
                spawn_button(menu, &assets, Action::InstallWaterLink);
                spawn_button(menu, &assets, Action::AutomaticUpkeep);
                spawn_button(menu, &assets, Action::StoresFromUpkeep);
                for row in 0..Construction::UPKEEP_ROWS {
                    spawn_button(menu, &assets, Action::UpkeepJob(row));
                }
                for restock in [false, true] {
                    spawn_button(menu, &assets, Action::UpkeepBudget { restock });
                }
                spawn_button(menu, &assets, Action::Home(true));
                spawn_button(menu, &assets, Action::Home(false));
                for row in 0..HOME_ROWS {
                    spawn_button(menu, &assets, Action::ListedHome(row));
                }
                spawn_button(menu, &assets, Action::ProjectFilter);
                spawn_button(menu, &assets, Action::TradeQueue);
                for order in [
                    TradeOrder::Buy { freight: false },
                    TradeOrder::Buy { freight: true },
                    TradeOrder::Sell {
                        hold_for_pickup: false,
                    },
                    TradeOrder::Sell {
                        hold_for_pickup: true,
                    },
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
                    TradePolicy::MinimumLoad,
                    TradePolicy::DispatchWait,
                    TradePolicy::DispatchNow,
                ] {
                    spawn_button(menu, &assets, Action::TradePolicy(policy));
                }
                spawn_button(menu, &assets, Action::FacilityIrrigation);
                spawn_button(menu, &assets, Action::RecipePage(false));
                spawn_button(menu, &assets, Action::RecipePage(true));
                spawn_button(menu, &assets, Action::CraftWorkspace);
                spawn_button(menu, &assets, Action::MoveCraft);
                for row in 0..crate::construction::INVENTORY_ROWS {
                    spawn_button(menu, &assets, Action::InventoryItem(row));
                }
                for row in 0..crate::construction::PAGE_KEYS.len() {
                    spawn_button(menu, &assets, Action::Project(row));
                    spawn_button(menu, &assets, Action::Recipe(row));
                    spawn_button(menu, &assets, Action::TradeItem(row));
                    spawn_button(menu, &assets, Action::TradeQueued(row));
                    spawn_button(menu, &assets, Action::HoldTradeQueued(row));
                }
            });
            row.spawn((
                ActionDetails,
                Text::default(),
                ui_font(&assets, 15.0),
                Visibility::Hidden,
                BackgroundColor(Color::srgb_u8(31, 45, 35)),
                Node {
                    position_type: PositionType::Absolute,
                    right: px(PANEL_WIDTH + 8.),
                    bottom: percent(100),
                    width: px(254),
                    padding: UiRect::all(px(10)),
                    ..default()
                },
            ));
        });
}

fn spawn_button(parent: &mut ChildSpawnerCommands, assets: &AssetServer, action: Action) {
    let trade_button = matches!(
        action,
        Action::TradeItem(_)
            | Action::TradeQueue
            | Action::TradeQueued(_)
            | Action::HoldTradeQueued(_)
            | Action::Trade(_)
            | Action::TradePolicy(_)
    );
    let (vertical_padding, font_size) = if trade_button { (4, 15.0) } else { (7, 17.0) };
    let mut button = parent.spawn((
        action,
        Button,
        Node {
            padding: UiRect::axes(px(10), px(vertical_padding)),
            ..default()
        },
        BackgroundColor(Color::srgb_u8(58, 78, 61)),
    ));
    if matches!(action, Action::View | Action::Forecast) {
        button.insert(crate::audio::DisclosureSound);
    }
    button.with_child((Text::default(), ui_font(assets, font_size)));
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
    window: Single<&Window, With<PrimaryWindow>>,
    mut camera: Single<(&mut VillageCamera, &mut Projection)>,
    buttons: Query<(&Action, &Interaction), Changed<Interaction>>,
) {
    if !visible(&village, &setup, &saves, &sound) {
        picker.view_open = false;
        picker.open = false;
        return;
    }
    if !Action::Manage.available(&village) {
        picker.open = false;
    }
    if !Action::View.available(&village) {
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
                Action::CameraControls if picker.view_open => {
                    village.guide.open_camera_controls();
                    picker.view_open = false;
                }
                Action::Camera(action) if picker.view_open => {
                    if let Projection::Orthographic(projection) = &mut **projection {
                        crate::apply_camera_action(action, &village, &setup, camera, projection);
                    }
                }
                Action::GridOverlay if picker.view_open => village.show_grid = !village.show_grid,
                Action::Forecast => village.show_forecast = !village.show_forecast,
                Action::Diagnostics if picker.view_open => {
                    village.save_notice = diagnostics::copy_notice(&village, &catalog, &window);
                }
                Action::Camera(_)
                | Action::CameraControls
                | Action::GridOverlay
                | Action::Diagnostics => {}
                Action::CampPreset(index) => pointer.preset = Some(CAMP_SITES[index].1),
                Action::Setup => {
                    if let Err(error) = save_session(&saves, &village, &catalog) {
                        village.save_notice = format!("Could not save village: {error}");
                    }
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
                Action::PickFlattenHeight => village.terrain_editor.pick_flatten_height(),
                Action::UndoTerrain => village.terrain_editor.undo(),
                Action::RedoTerrain => village.terrain_editor.redo(),
                Action::Advance(action) => {
                    village.apply_advance_action(action);
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
                Action::Panel(panel) | Action::ResourcePanel(panel)
                    if picker.open || matches!(action, Action::ResourcePanel(_)) =>
                {
                    village.utility_panel = Some(panel);
                    match panel {
                        UtilityPanel::Projects => village.projects_page = 0,
                        UtilityPanel::Inventory => village.inventory_page = 0,
                        UtilityPanel::Events => village.event_page = 0,
                        UtilityPanel::Upkeep => village.upkeep_page = 0,
                        UtilityPanel::Residents => picker.home_page = 0,
                        _ => {}
                    }
                    picker.open = false;
                }
                Action::ClosePanel => {
                    village.utility_panel = None;
                    picker.open = false;
                }
                Action::GridFromFinances => village.utility_panel = Some(UtilityPanel::Power),
                Action::StoresFromUpkeep => {
                    village.utility_panel = Some(UtilityPanel::Inventory);
                    village.inventory_page = 0;
                }
                Action::PantryFromStores => {
                    village.utility_panel = Some(UtilityPanel::Pantry);
                    village.pantry_batch_page = None;
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
                Action::Page(forward) => village.change_panel_page(&catalog, &land, forward),
                Action::TradeQueue if !picker.open => village.construction.toggle_trade_queue(),
                Action::HoldTradeQueued(row) if !picker.open => {
                    let town = &mut *village;
                    town.construction.toggle_trade_queue_hold(
                        &town.stock,
                        row,
                        setup.round_trip_km(),
                    );
                }
                Action::TradeQueued(row) if !picker.open => {
                    let town = &mut *village;
                    town.construction
                        .cancel_trade_queue_row(&catalog, &mut town.stock, row);
                }
                Action::TradeItem(row) if !picker.open => {
                    village.construction.select_trade_row(&catalog, row)
                }
                Action::Project(row) if !picker.open => {
                    village.focus_project_row(&catalog, &setup, camera, row);
                }
                Action::InventoryItem(row) if !picker.open => {
                    let (_, mut rows) = crate::construction::inventory_rows(
                        &catalog,
                        village.inventory_page,
                        village.inventory_equipment,
                        &village.inventory_search,
                    );
                    if let Some((_, id, _)) = rows.nth(row)
                        && village.construction.select_trade_material(&catalog, id)
                    {
                        village.utility_panel = Some(UtilityPanel::Trade);
                        village.editing_inventory = false;
                    }
                }
                Action::InventorySearch => village.editing_inventory = !village.editing_inventory,
                Action::InventoryView => village.toggle_inventory_view(),
                Action::ProjectFilter if !picker.open => {
                    village.open_projects_only = !village.open_projects_only;
                    village.projects_page = 0;
                }
                Action::Resident(index) if !picker.open => village.select_resident(index),
                Action::WorkerReservation(essential) if !picker.open => {
                    village.construction.cycle_worker_reservation(essential);
                }
                Action::WorkPriority(group) if !picker.open => {
                    village.construction.cycle_work_priority(group);
                }
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
                Action::ExpansionReserve if !picker.open => {
                    village.budget_entry = Some((BudgetTarget::ExpansionReserve, String::new()));
                }
                Action::Ledger if !picker.open => {
                    village.finance_history_open = !village.finance_history_open;
                    village.finance_history_page = 0;
                }
                Action::BuildingPower | Action::Cooling if !picker.open => {
                    let construction = &mut village.construction;
                    if let Some(building) = construction.production.selected {
                        if matches!(action, Action::Cooling) {
                            construction.utilities.toggle_cooling(building);
                        } else {
                            construction.utilities.toggle(building);
                        }
                    }
                }
                Action::Grid if !picker.open => {
                    let utilities = &mut village.construction.utilities;
                    utilities.grid_off = !utilities.grid_off;
                }
                Action::AutomaticUpkeep if !picker.open => {
                    village.construction.toggle_automatic_upkeep()
                }
                Action::UpkeepJob(row) if !picker.open => {
                    let page = village.upkeep_page;
                    if let Some(point) = village.construction.focus_upkeep_job(page, row) {
                        let terrain = village.terrain(&setup);
                        camera.target =
                            Vec3::new(point.x, terrain.height_at(point.x, point.y), point.y);
                        village.utility_panel = None;
                    }
                }
                Action::UpkeepBudget { restock } if !picker.open => {
                    let target = if restock {
                        BudgetTarget::MaintenanceShopping
                    } else {
                        BudgetTarget::MaintenanceParts
                    };
                    village.budget_entry = Some((target, String::new()));
                }
                Action::UtilityLinkPage(forward) if !picker.open => {
                    village.move_utility_link(forward)
                }
                Action::ToggleUtilityLink if !picker.open => village.toggle_selected_utility_link(),
                Action::NextUtilityInstallation if !picker.open => {
                    village.focus_next_utility_installation(&setup, camera)
                }
                Action::CancelUtilityInstallation if !picker.open => {
                    village.cancel_selected_installation()
                }
                Action::RemoveUtilityLink if !picker.open => village.remove_selected_utility_link(),
                Action::NextPowerShortage if !picker.open => {
                    village.focus_next_power_shortage(&setup, camera)
                }
                Action::InstallPowerLink if !picker.open => {
                    village.queue_selected_power_connection()
                }
                Action::InstallWaterLink if !picker.open => {
                    village.queue_selected_water_connection()
                }
                Action::NextWasteTank if !picker.open => {
                    village.focus_next_waste_tank(&setup, camera)
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
                Action::AutoCook if !picker.open => {
                    village.construction.production.kitchen_policy.toggle()
                }
                Action::CookingTarget {
                    preserved,
                    increase,
                } if !picker.open => {
                    village
                        .construction
                        .production
                        .kitchen_policy
                        .change(preserved, if increase { 1 } else { -1 });
                }
                Action::PantryTransport if !picker.open => {
                    village.construction.toggle_supplier_construction()
                }
                Action::PantryBudget if !picker.open => {
                    village.budget_entry = Some((BudgetTarget::Food, String::new()));
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
                Action::FocusSelectedProject if !picker.open => {
                    village.focus_selected_project(&setup, camera);
                }
                Action::DeselectProject if !picker.open => {
                    village.construction.clear_selected_project()
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
                Action::FacilityIrrigation if !picker.open => {
                    village.construction.cycle_facility_irrigation(&catalog);
                }
                Action::RecipePage(forward) if !picker.open => {
                    village.construction.page_recipes(&catalog, forward)
                }
                Action::CraftWorkspace if !picker.open => {
                    village.construction.cycle_craft_workspace(&catalog, true);
                }
                Action::MoveCraft if !picker.open => {
                    let town = &mut *village;
                    town.construction
                        .move_selected_craft(&catalog, &mut town.stock);
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
                | Action::ResourcePanel(_)
                | Action::Project(_)
                | Action::Recipe(_)
                | Action::RecipePage(_)
                | Action::CraftWorkspace
                | Action::MoveCraft
                | Action::FacilityIrrigation
                | Action::Farm(_)
                | Action::SelectedProject(_)
                | Action::FocusSelectedProject
                | Action::DeselectProject
                | Action::TradeItem(_)
                | Action::InventoryItem(_)
                | Action::TradeQueue
                | Action::TradeQueued(_)
                | Action::HoldTradeQueued(_)
                | Action::Trade(_)
                | Action::TradePolicy(_)
                | Action::ProjectFilter
                | Action::Resident(_)
                | Action::WorkPriority(_)
                | Action::WorkerReservation(_)
                | Action::Home(_)
                | Action::ListedHome(_)
                | Action::Shift(_)
                | Action::Ledger
                | Action::ExpansionReserve
                | Action::PantryBatches
                | Action::PantryPriority
                | Action::PantryTransport
                | Action::PantryBudget
                | Action::AutoCook
                | Action::CookingTarget { .. }
                | Action::PantryPolicy(..)
                | Action::Grid
                | Action::BuildingPower
                | Action::Cooling
                | Action::Water(_)
                | Action::NextWasteTank
                | Action::InstallWaterLink
                | Action::InstallPowerLink
                | Action::NextPowerShortage
                | Action::UtilityLinkPage(_)
                | Action::ToggleUtilityLink
                | Action::RemoveUtilityLink
                | Action::CancelUtilityInstallation
                | Action::NextUtilityInstallation
                | Action::AutomaticUpkeep
                | Action::UpkeepJob(_)
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

type ActionTooltip<'w, 's> = Single<'w, 's, (Entity, &'static mut Visibility), With<ActionDetails>>;

fn refresh(
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    (village, catalog): (Res<Village>, Res<Catalog>),
    mut picker: ResMut<PanelPicker>,
    mut toolbar: Single<&mut Node, (With<Toolbar>, Without<PanelMenu>)>,
    mut menu: PanelNode,
    mut buttons: ToolbarButtons,
    (mut labels, mut details): (Query<&mut Text>, ActionTooltip),
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
    let craft_workspace = show_recipes
        .then(|| village.construction.craft_workspace_label(&catalog))
        .flatten();
    let irrigation = show_recipes
        .then(|| village.construction.facility_irrigation(&catalog))
        .flatten();
    let recipes = if show_recipes {
        village.construction.recipe_page_labels(&catalog)
    } else {
        Vec::new()
    };
    let show_selected_project =
        !picker.open && Action::SelectedProject(ProjectAction::Salvage).available(&village);
    let show_advance = Action::Advance(AdvanceAction::Adjust(1)).available(&village);
    let show_terrain = Action::TerrainBrush(Brush::Raise).available(&village);
    let show_field_size = Action::ResizeField(IVec2::ZERO).available(&village);
    let show_projects = !picker.open && Action::ProjectFilter.available(&village);
    let show_trade = !picker.open && Action::TradeItem(0).available(&village);
    let show_trade_queue = show_trade && village.construction.trade.queue_page.is_some();
    let trade_queue = if show_trade_queue {
        village.construction.trade_queue_labels(&catalog)
    } else {
        Vec::new()
    };
    let trade_items = if show_trade && !show_trade_queue {
        village.construction.trade_page_labels(&catalog)
    } else {
        Vec::new()
    };
    let inventory_items: Vec<_> = if !picker.open && Action::InventoryItem(0).available(&village) {
        crate::construction::inventory_rows(
            &catalog,
            village.inventory_page,
            village.inventory_equipment,
            &village.inventory_search,
        )
        .1
        .map(|(_, _, item)| (item.pack > 0 && item.price > 0.).then_some(item.name.as_str()))
        .collect()
    } else {
        Vec::new()
    };
    let show_pantry = !picker.open && Action::PantryBatches.available(&village);
    let show_finances = !picker.open && Action::Ledger.available(&village);
    let show_facility_switches = !picker.open
        && (Action::BuildingPower.available(&village) || Action::Cooling.available(&village));
    let show_power = !picker.open && Action::Grid.available(&village);
    let show_water = !picker.open && Action::Water(WaterCommand::River).available(&village);
    let show_upkeep = !picker.open && Action::AutomaticUpkeep.available(&village);
    let upkeep_jobs = if show_upkeep {
        village
            .construction
            .upkeep_job_labels(&catalog, village.upkeep_page)
    } else {
        Vec::new()
    };
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
        || show_facility_switches
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
    let mut action_details = String::new();
    for (&action, &interaction, children, parent, mut background, mut node) in &mut buttons {
        let show = match action {
            Action::Lens(row) => show_lenses && row < village.lenses.choices().len(),
            Action::LensPage | Action::ClearLens => show_lenses,
            Action::LensFilter(_) | Action::LensSite(_) => action.available(&village),
            Action::Advance(AdvanceAction::Toggle) => action.available(&village),
            Action::Volume { .. } => false,
            Action::Advance(_) => show_advance,
            Action::Page(_) if village.utility_panel == Some(UtilityPanel::Residents) => {
                show_residents && home_pages > 1
            }
            Action::Page(_)
            | Action::InventorySearch
            | Action::InventoryView
            | Action::ClosePanel
            | Action::RotatePlacement
            | Action::CancelPlacement
            | Action::ConnectRoad
            | Action::FinishRoad => action.available(&village),
            Action::UndoRoad => Action::FinishRoad.available(&village),
            Action::ResizeField(_) => !picker.open && show_field_size,
            Action::PickFlattenHeight => action.available(&village),
            Action::TerrainBrush(_)
            | Action::TerrainRadius(_)
            | Action::UndoTerrain
            | Action::RedoTerrain => show_terrain,
            Action::Project(row) => projects.get(row).is_some(),
            Action::Recipes => {
                action.available(&village) && village.construction.has_recipes(&catalog)
            }
            Action::RecipePage(_) => show_recipes,
            Action::CraftWorkspace => craft_workspace
                .as_ref()
                .is_some_and(|(_, count)| *count > 1),
            Action::MoveCraft => craft_workspace.is_some(),
            Action::FacilityIrrigation => irrigation.is_some(),
            Action::Beds | Action::Gather => action.available(&village),
            Action::Farm(_) => show_beds,
            Action::Recipe(row) => recipes.get(row).is_some(),
            Action::FocusSelectedProject | Action::DeselectProject => {
                show_selected_project && action.available(&village)
            }
            Action::SelectedProject(action) => {
                show_selected_project
                    && village.construction.project_action_available(
                        &catalog,
                        action,
                        village.stock.sandbox,
                    )
            }
            Action::TradeItem(row) => trade_items.get(row).is_some(),
            Action::InventoryItem(row) => inventory_items.get(row).is_some_and(Option::is_some),
            Action::TradeQueue => show_trade,
            Action::TradeQueued(row) => trade_queue.get(row).is_some_and(|entry| entry.can_cancel),
            Action::HoldTradeQueued(row) => trade_queue
                .get(row)
                .is_some_and(|entry| entry.held.is_some()),
            Action::Trade(_) | Action::TradePolicy(_) => show_trade && !show_trade_queue,
            Action::ProjectFilter => show_projects,
            Action::ListedHome(row) => homes.get(row).is_some(),
            Action::Resident(_) => show_residents || show_finances,
            Action::WorkPriority(_) | Action::WorkerReservation(_) => show_residents,
            Action::Shift(_) | Action::Ledger => show_finances,
            Action::ExpansionReserve | Action::GridFromFinances => {
                show_finances && !village.finance_history_open
            }
            Action::PantryBatches
            | Action::PantryPriority
            | Action::PantryTransport
            | Action::PantryBudget
            | Action::PantryPolicy(..)
            | Action::AutoCook
            | Action::CookingTarget { .. } => show_pantry && action.available(&village),
            Action::Home(_) => show_residents,
            Action::Grid | Action::InstallPowerLink => show_power,
            Action::NextPowerShortage => show_power && action.available(&village),
            Action::UtilityLinkPage(_)
            | Action::ToggleUtilityLink
            | Action::RemoveUtilityLink
            | Action::CancelUtilityInstallation
            | Action::NextUtilityInstallation => {
                (show_power || show_water) && action.available(&village)
            }
            Action::BuildingPower | Action::Cooling => {
                show_facility_switches && action.available(&village)
            }
            Action::Water(_) | Action::InstallWaterLink => show_water,
            Action::NextWasteTank => show_water && action.available(&village),
            Action::AutomaticUpkeep | Action::UpkeepBudget { .. } | Action::StoresFromUpkeep => {
                show_upkeep
            }
            Action::UpkeepJob(row) => upkeep_jobs.get(row).is_some(),
            Action::Panel(_) => picker.open,
            Action::ResourcePanel(_) => !picker.open && !show_view && action.available(&village),
            Action::PantryFromStores => !picker.open && !show_view && action.available(&village),
            _ => true,
        };
        let show = if matches!(action, Action::Forecast) {
            if parent.parent() == *menu_id {
                show_view
            } else {
                !show_view && !picker.open && action.available(&village)
            }
        } else if matches!(
            action,
            Action::Camera(_) | Action::CameraControls | Action::GridOverlay | Action::Diagnostics
        ) {
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
        if interaction != Interaction::None {
            let description = match action {
                Action::CampPreset(index) => Some(
                    [
                        "Cool afternoons, but a longer walk from the unloading point.",
                        "Quick unloading beside the entrance clearing.",
                        "Dry, roomy ground. You’ll need to make your own shade.",
                    ][index]
                        .into(),
                ),
                Action::UndoRoad if !village.construction.can_undo_roads() => {
                    Some("Place a road stroke before trying to undo it.".into())
                }
                Action::UndoTerrain if !village.terrain_editor.can_undo() => {
                    Some("There are no terrain edits to undo in this session.".into())
                }
                Action::RedoTerrain if !village.terrain_editor.can_redo() => {
                    Some("Undo a terrain edit before trying to redo it.".into())
                }
                Action::Recipe(row) => {
                    village
                        .construction
                        .recipe_row_details(&catalog, &village.stock, row)
                }
                _ => None,
            };
            if let Some(description) = description {
                action_details = description;
            }
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
                Action::UpkeepJob(row) => upkeep_jobs[row].clone(),
                Action::Recipe(row) => recipes[row].clone(),
                Action::MoveCraft => craft_workspace
                    .as_ref()
                    .expect("visible craft destination")
                    .0
                    .clone(),
                Action::FacilityIrrigation => irrigation.map_or_else(String::new, |policy| {
                    format!("Irrigation · {}", policy.label())
                }),
                Action::TradeItem(row) => trade_items[row].clone(),
                Action::InventoryItem(row) => format!("Trade · {}", inventory_items[row].unwrap()),
                Action::TradeQueued(row) => format!("Cancel {}", trade_queue[row].label),
                Action::HoldTradeQueued(row) if trade_queue[row].held == Some(true) => {
                    format!("Order {} · Allow own trip", row + 1)
                }
                Action::HoldTradeQueued(row) => format!("Order {} · Hold for pickup", row + 1),
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
    let (details_id, visibility) = &mut *details;
    **visibility = if action_details.is_empty() {
        Visibility::Hidden
    } else {
        Visibility::Inherited
    };
    if let Ok(mut text) = labels.get_mut(*details_id)
        && text.0 != action_details
    {
        text.0 = action_details;
    }
}
