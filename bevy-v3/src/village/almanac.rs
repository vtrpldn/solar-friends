//! The heading and headline numbers of an open panel, after V2's "Village almanac"
//! sheets: a small caption, a title, then big number tiles above the details.

pub(super) mod sites;

use super::*;
use crate::{
    theme,
    ui_font::{ui_font_styled, ui_font_weight},
};

#[derive(Component)]
pub(super) struct SheetHeader;

#[derive(Component)]
pub(super) enum SheetText {
    Caption,
    Title,
}

#[derive(Component)]
pub(super) struct SheetTiles;

#[derive(Component)]
pub(super) enum TileText {
    Value(usize),
    Label(usize),
    Note(usize),
}

const TILES: usize = 4;

/// Spawns the header and tile row as the first children of the status card.
pub(super) fn spawn(card: &mut ChildSpawnerCommands, assets: &AssetServer) {
    card.spawn((
        SheetHeader,
        Node {
            display: Display::None,
            flex_direction: FlexDirection::Column,
            row_gap: px(2),
            flex_shrink: 0.,
            ..default()
        },
    ))
    .with_children(|header| {
        header.spawn((
            SheetText::Caption,
            Text::default(),
            ui_font_styled(assets, 11.0, 750, theme::CAPTION),
        ));
        header.spawn((
            SheetText::Title,
            Text::default(),
            ui_font_weight(assets, 26.0, 750),
        ));
    });
    card.spawn((
        SheetTiles,
        Node {
            display: Display::None,
            column_gap: px(10),
            flex_shrink: 0.,
            ..default()
        },
    ))
    .with_children(|row| {
        for index in 0..TILES {
            row.spawn((
                Node {
                    flex_direction: FlexDirection::Column,
                    flex_grow: 1.,
                    flex_basis: px(0),
                    padding: UiRect::axes(px(12), px(10)),
                    border: UiRect::left(px(3)),
                    border_radius: BorderRadius::all(px(12)),
                    ..default()
                },
                BackgroundColor(theme::BUTTON),
                BorderColor::all(theme::EDGE),
            ))
            .with_children(|tile| {
                tile.spawn((
                    TileText::Label(index),
                    Text::default(),
                    ui_font_styled(assets, 11.0, 750, theme::CAPTION),
                ));
                tile.spawn((
                    TileText::Value(index),
                    Text::default(),
                    ui_font_weight(assets, 22.0, 750),
                ));
                tile.spawn((
                    TileText::Note(index),
                    Text::default(),
                    ui_font_styled(assets, 12.0, 500, theme::MUTED),
                ));
            });
        }
    });
    sites::spawn_list(card);
}

/// Caption and title for a panel, in V2's words where V2 had the screen.
pub(super) fn heading(panel: UtilityPanel) -> (&'static str, &'static str) {
    match panel {
        UtilityPanel::Residents => ("OUR LITTLE CREW", "Our residents"),
        UtilityPanel::Projects => ("VILLAGE WORK", "Your projects"),
        UtilityPanel::Inventory => ("VILLAGE ALMANAC", "Stores"),
        UtilityPanel::Crafting => ("VILLAGE ALMANAC", "Crafting"),
        UtilityPanel::Power => ("VILLAGE ALMANAC", "Power"),
        UtilityPanel::Water => ("VILLAGE ALMANAC", "Water & sanitation"),
        UtilityPanel::Upkeep => ("VILLAGE ALMANAC", "Maintenance"),
        UtilityPanel::Events => ("VILLAGE ALMANAC", "Village events"),
        UtilityPanel::Finances => ("VILLAGE ALMANAC", "Finances"),
        UtilityPanel::Trade => ("VILLAGE ALMANAC", "Town trade"),
        UtilityPanel::Pantry => ("VILLAGE ALMANAC", "Food & pantry"),
    }
}

fn visible_panel(
    village: &Village,
    setup: &WorldSetup,
    saves: &SaveMenu,
    sound: &SoundSettings,
) -> Option<UtilityPanel> {
    village.utility_panel.filter(|_| {
        !village.guide.open()
            && !village.lenses.open
            && !setup.open
            && !saves.open
            && !sound.open
            && !build_menu::visible(setup, village, saves, sound)
    })
}

/// Headline tiles as (label, value, note), or none for panels without them.
fn tiles(village: &Village) -> Option<[(String, String, String); TILES]> {
    let utilities = &village.construction.utilities;
    match village.utility_panel? {
        UtilityPanel::Water => {
            let (water, capacity) = utilities.water_totals();
            let names = ["DRINKING WATER", "IRRIGATION", "GREYWATER", "SEWAGE"];
            Some(std::array::from_fn(|channel| {
                (
                    names[channel].to_owned(),
                    format!("{:.1} L", water[channel]),
                    format!("of {:.0} L", capacity[channel]),
                )
            }))
        }
        UtilityPanel::Power => {
            let (generation, demand, stored, capacity, grid) = utilities.power_figures();
            let grid_state = if utilities.grid_off {
                "Grid switched off"
            } else {
                "Backup when short"
            };
            Some([
                (
                    "SOLAR & HYDRO".into(),
                    format!("{generation:.2} kW"),
                    "Generating now".into(),
                ),
                (
                    "DEMAND".into(),
                    format!("{demand:.2} kW"),
                    "Requested by buildings".into(),
                ),
                (
                    "BATTERY".into(),
                    format!("{stored:.1} kWh"),
                    format!("of {capacity:.1} kWh"),
                ),
                ("GRID".into(), format!("{grid:.2} kW"), grid_state.into()),
            ])
        }
        UtilityPanel::Finances if !village.finance_history_open && !village.stock.sandbox => {
            let (_, expenses, _) = village.stock.finance_totals();
            Some([
                (
                    "SHARED SAVINGS".into(),
                    format!("R${:.2}", village.stock.balance() as f64 / 100.0),
                    String::new(),
                ),
                (
                    "RECORDED SPEND".into(),
                    format!("R${:.2}", expenses as f64 / 100.0),
                    "Since records began".into(),
                ),
                (
                    "EXPANSION RESERVE".into(),
                    format!(
                        "R${:.2}",
                        village.construction.expansion_reserve_cents() as f64 / 100.0
                    ),
                    "Protected for expansion".into(),
                ),
                (
                    "GRID ELECTRICITY".into(),
                    format!("R${:.2}/h", utilities.grid_cost_per_hour()),
                    "At current use".into(),
                ),
            ])
        }
        UtilityPanel::Pantry if village.pantry_batch_page.is_none() => {
            let stock = &village.stock;
            let (portions, days, risk) = if stock.sandbox {
                (
                    ("EDIBLE PORTIONS".into(), "Unlimited".into(), String::new()),
                    ("RESERVE COVERAGE".into(), "Unlimited".into(), String::new()),
                    ("SPOILAGE RISK".into(), "Inactive".into(), String::new()),
                )
            } else {
                let portions = stock.food_portions();
                let forecast = stock
                    .pantry
                    .forecast(village.clock, 2, |id| stock.available(id));
                let days = f64::from(portions) / f64::from(forecast.target);
                (
                    (
                        "EDIBLE PORTIONS".into(),
                        portions.to_string(),
                        "Ready to eat".into(),
                    ),
                    (
                        "RESERVE COVERAGE".into(),
                        format!("{days:.1} days"),
                        format!("At {} portions per day", forecast.target),
                    ),
                    (
                        "SPOILAGE RISK".into(),
                        format!("{:.1} portions", forecast.at_risk),
                        "Over the next game day".into(),
                    ),
                )
            };
            Some([
                portions,
                days,
                risk,
                (
                    "POWERED COLD STORAGE".into(),
                    format!("{:.0} L", utilities.powered_cold_storage()),
                    format!("of {:.0} L installed", utilities.installed_cold_storage()),
                ),
            ])
        }
        _ => None,
    }
}

type SheetNodes<'w, 's> = (
    Single<'w, 's, &'static mut Node, (With<SheetHeader>, Without<SheetTiles>)>,
    Single<'w, 's, &'static mut Node, (With<SheetTiles>, Without<SheetHeader>)>,
);

pub(super) fn refresh(
    village: Res<Village>,
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    (mut header, mut row): SheetNodes,
    mut sheet_texts: Query<(&SheetText, &mut Text), Without<TileText>>,
    mut tile_texts: Query<(&TileText, &mut Text), Without<SheetText>>,
) {
    let panel = visible_panel(&village, &setup, &saves, &sound);
    let display = if panel.is_some() {
        Display::Flex
    } else {
        Display::None
    };
    if header.display != display {
        header.display = display;
    }
    if let Some(panel) = panel {
        let (caption, title) = heading(panel);
        for (part, mut text) in &mut sheet_texts {
            let wanted = match part {
                SheetText::Caption => caption,
                SheetText::Title => title,
            };
            if text.0 != wanted {
                text.0 = wanted.into();
            }
        }
    }
    let tiles = panel.and_then(|_| tiles(&village));
    let display = if tiles.is_some() {
        Display::Flex
    } else {
        Display::None
    };
    if row.display != display {
        row.display = display;
    }
    let Some(tiles) = tiles else {
        return;
    };
    for (part, mut text) in &mut tile_texts {
        let wanted = match *part {
            TileText::Label(index) => &tiles[index].0,
            TileText::Value(index) => &tiles[index].1,
            TileText::Note(index) => &tiles[index].2,
        };
        if text.0 != *wanted {
            text.0.clone_from(wanted);
        }
    }
}
