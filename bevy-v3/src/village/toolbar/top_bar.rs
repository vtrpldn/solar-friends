//! The always-visible top of the screen, after V2's header: four stat cards on the left
//! and a clock card on the right, with Guide and Lenses beneath it.
//!
//! Every control here is an ordinary toolbar [`Action`], so clicks, labels and state
//! changes go through the same code as the rest of the toolbar. Stat cards and the
//! weather line carry [`CustomLabel`] because this module writes their text.

use super::*;
use crate::theme;
use crate::ui_font::{ui_font_styled, ui_font_weight};

/// Toolbar buttons that live in the top bar and stay visible whenever it is.
#[derive(Component)]
pub(super) struct TopBarItem;

/// Toolbar buttons whose text this module writes instead of `Action::label`.
#[derive(Component)]
pub(super) struct CustomLabel;

#[derive(Component)]
struct TopBar;

#[derive(Component)]
struct CardValue(UtilityPanel);

#[derive(Component)]
struct CardStatus(UtilityPanel);

#[derive(Component)]
struct ClockText;

#[derive(Component)]
struct DateText;

#[derive(Component)]
struct WeatherText;

const CARDS: [(UtilityPanel, &str); 4] = [
    (UtilityPanel::Finances, "Savings"),
    (UtilityPanel::Pantry, "Food portions"),
    (UtilityPanel::Power, "Battery · kWh"),
    (UtilityPanel::Water, "Water & sanitation"),
];

/// Status text for a problem the player should look at.
const ALERT: Color = Color::srgb_u8(0xb0, 0x5a, 0x3c);

pub(super) fn install(app: &mut App) {
    app.add_systems(Startup, spawn)
        .add_systems(Update, refresh.after(village_input))
        .add_systems(PostUpdate, measure.after(bevy::ui::UiSystems::Layout))
        .add_systems(Update, super::super::place_below_top_bar);
}

/// Records where the top bar ends, so panels open below it however its cards wrap.
/// Only the stat cards count: left-hand panels sit beneath them, beside the clock.
fn measure(bar: Single<(&Node, &Children), With<TopBar>>, sizes: Query<&ComputedNode>) {
    let (node, children) = *bar;
    if node.display == Display::None {
        return;
    }
    let Some(computed) = children.first().and_then(|cards| sizes.get(*cards).ok()) else {
        return;
    };
    let height = computed.size().y * computed.inverse_scale_factor();
    if height > 0. {
        // 18 px from the window top, then a 12 px gap.
        super::super::set_top_bar_clearance(18. + height + 12.);
    }
}

/// Whether the top bar shows: in a village, outside the setup, save and sound screens.
pub(super) fn visible(
    village: &Village,
    setup: &WorldSetup,
    saves: &SaveMenu,
    sound: &SoundSettings,
) -> bool {
    !setup.open
        && !saves.open
        && !sound.open
        && village.setup.is_some()
        && (village.camp.is_some() || village.arrival_time >= ARRIVAL_DURATION)
}

pub(super) fn key_chip(parent: &mut ChildSpawnerCommands, assets: &AssetServer, key: &str) {
    parent
        .spawn((
            Node {
                padding: UiRect::axes(px(5), px(1)),
                border: UiRect::all(px(1)),
                border_radius: BorderRadius::all(px(5)),
                ..default()
            },
            BackgroundColor(theme::KEY),
            BorderColor::all(theme::EDGE),
        ))
        .with_child((Text::new(key), ui_font_weight(assets, 11.0, 600)));
}

/// A top-bar button: label text first, as the toolbar's refresh expects, then a key chip.
fn top_button(
    parent: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    action: Action,
    key: Option<&str>,
) {
    parent
        .spawn((
            action,
            Button,
            TopBarItem,
            theme::button_node(Node {
                padding: UiRect::axes(px(10), px(5)),
                column_gap: px(6),
                align_items: AlignItems::Center,
                ..default()
            }),
            theme::button(),
        ))
        .with_children(|button| {
            button.spawn((Text::default(), ui_font_weight(assets, 14.0, 600)));
            if let Some(key) = key {
                key_chip(button, assets, key);
            }
        });
}

fn spawn(mut commands: Commands, assets: Res<AssetServer>) {
    commands
        .spawn((
            TopBar,
            Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                top: px(18),
                left: px(22),
                right: px(22),
                justify_content: JustifyContent::SpaceBetween,
                align_items: AlignItems::FlexStart,
                column_gap: px(16),
                ..default()
            },
            bevy::ui::FocusPolicy::Pass,
        ))
        .with_children(|bar| {
            // V2 centres the stat cards in the space left of the clock card.
            bar.spawn(Node {
                column_gap: px(8),
                flex_wrap: FlexWrap::Wrap,
                row_gap: px(8),
                flex_grow: 1.,
                flex_shrink: 1.,
                justify_content: JustifyContent::Center,
                ..default()
            })
            .with_children(|cards| {
                for (panel, caption) in CARDS {
                    stat_card(cards, &assets, panel, caption);
                }
            });
            bar.spawn(Node {
                flex_direction: FlexDirection::Column,
                align_items: AlignItems::FlexEnd,
                row_gap: px(10),
                flex_shrink: 0.,
                ..default()
            })
            .with_children(|right| {
                right
                    .spawn((
                        theme::panel_node(Node {
                            padding: UiRect::axes(px(14), px(10)),
                            flex_direction: FlexDirection::Column,
                            row_gap: px(6),
                            ..default()
                        }),
                        theme::panel(),
                    ))
                    .with_children(|clock| {
                        clock
                            .spawn(Node {
                                column_gap: px(8),
                                align_items: AlignItems::Center,
                                ..default()
                            })
                            .with_children(|row| {
                                row.spawn((
                                    ClockText,
                                    Text::default(),
                                    ui_font_weight(&assets, 18.0, 750),
                                    Node {
                                        margin: UiRect::right(px(4)),
                                        ..default()
                                    },
                                ));
                                top_button(row, &assets, Action::Pause, Some("Space"));
                                top_button(row, &assets, Action::Speed, Some("1–4"));
                                top_button(row, &assets, Action::Advance, None);
                            });
                        clock
                            .spawn(Node {
                                justify_content: JustifyContent::SpaceBetween,
                                align_items: AlignItems::Center,
                                column_gap: px(12),
                                ..default()
                            })
                            .with_children(|row| {
                                row.spawn((
                                    DateText,
                                    Text::default(),
                                    ui_font_weight(&assets, 13.0, 500),
                                ));
                                row.spawn((
                                    Action::Forecast,
                                    Button,
                                    TopBarItem,
                                    CustomLabel,
                                    Node {
                                        padding: UiRect::axes(px(6), px(2)),
                                        border_radius: BorderRadius::all(px(8)),
                                        ..default()
                                    },
                                    BackgroundColor(Color::NONE),
                                    BorderColor::all(Color::NONE),
                                    BoxShadow::default(),
                                ))
                                .with_child((
                                    WeatherText,
                                    Text::default(),
                                    ui_font_weight(&assets, 13.0, 600),
                                ));
                            });
                    });
                right
                    .spawn(Node {
                        column_gap: px(8),
                        ..default()
                    })
                    .with_children(|row| {
                        top_button(row, &assets, Action::Guide, Some("F1"));
                        top_button(row, &assets, Action::Lenses, Some("Shift+L"));
                    });
            });
        });
}

fn stat_card(
    parent: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    panel: UtilityPanel,
    caption: &str,
) {
    parent
        .spawn((
            Action::ResourcePanel(panel),
            Button,
            TopBarItem,
            CustomLabel,
            theme::button_node(Node {
                padding: UiRect::new(px(8), px(12), px(7), px(7)),
                column_gap: px(8),
                align_items: AlignItems::Center,
                // One width for every card, so they wrap into a tidy grid as in V2.
                min_width: px(172),
                ..default()
            }),
            theme::button(),
        ))
        .with_children(|card| {
            if let Some(slot) = super::super::thumbnails::icon_slot(panel) {
                card.spawn((
                    super::super::thumbnails::ThumbnailImage(slot),
                    ImageNode::default(),
                    Node {
                        width: px(40),
                        height: px(30),
                        flex_shrink: 0.,
                        ..default()
                    },
                ));
            }
            card.spawn(Node {
                flex_direction: FlexDirection::Column,
                ..default()
            })
            .with_children(|text| {
                text.spawn((
                    CardValue(panel),
                    Text::default(),
                    ui_font_weight(assets, 19.0, 750),
                ));
                text.spawn((
                    Text::new(caption),
                    ui_font_styled(assets, 11.0, 600, theme::CAPTION),
                ));
                text.spawn((
                    CardStatus(panel),
                    Text::default(),
                    ui_font_styled(assets, 12.0, 500, theme::MUTED),
                ));
            });
        });
}

/// Card values and statuses, in [`CARDS`] order.
fn card_text(
    village: &Village,
    rates: Option<[f64; 4]>,
    temperature: f64,
) -> [(String, String, bool); 4] {
    let stock = &village.stock;
    let utilities = &village.construction.utilities;
    let [food, power, water] = village.construction.need_cards(stock, temperature);
    let rate =
        |index: usize, unit| resource_trends::hourly_rate(rates.map(|rates| rates[index]), unit);
    let savings = if stock.sandbox {
        ("Unlimited".into(), "Sandbox".into(), false)
    } else {
        let balance = stock.balance() as f64 / 100.0;
        (format!("R${balance:.2}"), rate(0, "R$"), balance < 0.0)
    };
    let portions = if stock.sandbox {
        "Unlimited".into()
    } else {
        stock.food_portions().to_string()
    };
    [
        savings,
        (portions, food.0, food.1),
        (
            format!("{:.1}", utilities.stored_energy()),
            power.0,
            power.1,
        ),
        (
            format!("{:.0} L", utilities.stored_drinking_water()),
            water.0,
            water.1,
        ),
    ]
}

type CardTexts<'w, 's> = (
    Query<'w, 's, (&'static CardValue, &'static mut Text), Without<CardStatus>>,
    Query<
        'w,
        's,
        (
            &'static CardStatus,
            &'static mut Text,
            &'static mut TextColor,
        ),
        Without<CardValue>,
    >,
);

type ClockTexts<'w, 's> = (
    Single<'w, 's, &'static mut Text, (With<ClockText>, Without<CardValue>, Without<CardStatus>)>,
    Single<
        'w,
        's,
        &'static mut Text,
        (
            With<DateText>,
            Without<ClockText>,
            Without<CardValue>,
            Without<CardStatus>,
        ),
    >,
    Single<
        'w,
        's,
        &'static mut Text,
        (
            With<WeatherText>,
            Without<DateText>,
            Without<ClockText>,
            Without<CardValue>,
            Without<CardStatus>,
        ),
    >,
);

fn refresh(
    (setup, village, saves, sound): (
        Res<WorldSetup>,
        Res<Village>,
        Res<SaveMenu>,
        Res<SoundSettings>,
    ),
    mut bar: Single<&mut Node, With<TopBar>>,
    (mut values, mut statuses): CardTexts,
    (mut clock, mut date, mut weather): ClockTexts,
    mut trends: Local<resource_trends::ResourceTrends>,
) {
    let show = visible(&village, &setup, &saves, &sound);
    let display = if show { Display::Flex } else { Display::None };
    if bar.display != display {
        bar.display = display;
    }
    if !show {
        return;
    }
    let utilities = &village.construction.utilities;
    let rates = trends.sample(
        village.session_serial,
        village.clock,
        [
            village.stock.balance() as f64 / 100.0,
            f64::from(village.stock.food_portions()),
            utilities.stored_energy(),
            utilities.stored_drinking_water(),
        ],
    );
    let conditions = village.weather(&setup);
    let cards = card_text(&village, rates, conditions.temperature);
    let index = |panel: UtilityPanel| {
        CARDS
            .iter()
            .position(|(card, _)| *card == panel)
            .expect("every card has text")
    };
    for (value, mut text) in &mut values {
        let wanted = &cards[index(value.0)].0;
        if text.0 != *wanted {
            text.0.clone_from(wanted);
        }
    }
    for (status, mut text, mut color) in &mut statuses {
        let (_, wanted, alert) = &cards[index(status.0)];
        if text.0 != *wanted {
            text.0.clone_from(wanted);
        }
        let tone = if *alert { ALERT } else { theme::MUTED };
        if color.0 != tone {
            color.0 = tone;
        }
    }
    let minute = crate::weather::game_minutes(village.clock);
    let wanted = format!(
        "Day {} · {:02}:{:02}",
        minute / 1440 + 1,
        minute / 60 % 24,
        minute % 60
    );
    if clock.0 != wanted {
        clock.0 = wanted;
    }
    let wanted = crate::weather::calendar_label(village.clock);
    if date.0 != wanted {
        date.0 = wanted;
    }
    let wanted = conditions.summary(village.clock);
    if weather.0 != wanted {
        weather.0 = wanted;
    }
}
