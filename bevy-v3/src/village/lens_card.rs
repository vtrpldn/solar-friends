use bevy::ui::FocusPolicy;

use super::*;
use crate::{
    theme,
    ui_font::{ui_font_styled, ui_font_weight},
};

const LENS_CARD_TOP: f32 = 142.0;

#[derive(Component)]
struct LensCard;

#[derive(Component)]
struct ClearLabel;

#[derive(Component, Clone, Copy)]
enum LensCardAction {
    Close,
    Select(MapLens),
    NormalView,
}

pub(super) fn install(app: &mut App) {
    app.add_systems(Startup, spawn)
        .add_systems(Update, input.after(read_camp_pointer).before(village_input))
        .add_systems(Update, refresh.after(show_hud));
}

fn visible(village: &Village, setup: &WorldSetup, saves: &SaveMenu, sound: &SoundSettings) -> bool {
    village.lenses.open
        && !village.guide.open()
        && !setup.open
        && !saves.open
        && !sound.open
        && !build_menu::visible(setup, village, saves, sound)
}

fn spawn(mut commands: Commands, assets: Res<AssetServer>) {
    commands
        .spawn((
            LensCard,
            Interaction::None,
            FocusPolicy::Block,
            GlobalZIndex(12),
            theme::panel_node(Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                right: px(22),
                top: px(LENS_CARD_TOP),
                width: px(304),
                flex_direction: FlexDirection::Column,
                padding: UiRect::all(px(16)),
                row_gap: px(12),
                ..default()
            }),
            theme::panel(),
        ))
        .with_children(|card| {
            card.spawn(Node {
                align_items: AlignItems::Center,
                justify_content: JustifyContent::SpaceBetween,
                column_gap: px(8),
                ..default()
            })
            .with_children(|header| {
                header
                    .spawn(Node {
                        flex_direction: FlexDirection::Column,
                        row_gap: px(1),
                        ..default()
                    })
                    .with_children(|left| {
                        left.spawn((
                            Text::new("READ THE LAND"),
                            ui_font_styled(&assets, 10., 750, theme::CAPTION),
                        ));
                        left.spawn((Text::new("Map lenses"), ui_font_weight(&assets, 21., 750)));
                    });
                header
                    .spawn((
                        LensCardAction::Close,
                        Button,
                        Node {
                            width: px(30),
                            height: px(30),
                            border: UiRect::all(px(2)),
                            border_radius: BorderRadius::MAX,
                            align_items: AlignItems::Center,
                            justify_content: JustifyContent::Center,
                            flex_shrink: 0.,
                            ..default()
                        },
                        theme::button(),
                    ))
                    .with_child((Text::new("×"), ui_font_weight(&assets, 18., 700)));
            });

            card.spawn(Node {
                display: Display::Grid,
                grid_template_columns: RepeatedGridTrack::flex(2, 1.0),
                column_gap: px(7),
                row_gap: px(8),
                width: percent(100),
                ..default()
            })
            .with_children(|grid| {
                for (lens, label) in LensPicker::all_choices() {
                    grid.spawn((
                        LensCardAction::Select(lens),
                        Button,
                        theme::button_node(Node {
                            padding: UiRect::axes(px(9), px(8)),
                            align_items: AlignItems::Center,
                            justify_content: JustifyContent::FlexStart,
                            ..default()
                        }),
                        theme::button(),
                    ))
                    .with_child((Text::new(label), ui_font_weight(&assets, 13., 600)));
                }
                grid.spawn((
                    LensCardAction::NormalView,
                    Button,
                    theme::button_node(Node {
                        padding: UiRect::axes(px(9), px(8)),
                        align_items: AlignItems::Center,
                        justify_content: JustifyContent::FlexStart,
                        ..default()
                    }),
                    theme::button(),
                ))
                .with_child((
                    ClearLabel,
                    Text::new("Normal view"),
                    ui_font_weight(&assets, 13., 600),
                ));
            });
        });
}

type LensButtons<'w, 's> = Query<
    'w,
    's,
    (
        &'static LensCardAction,
        &'static Interaction,
        &'static mut BackgroundColor,
        &'static mut BorderColor,
        &'static mut BoxShadow,
    ),
>;

fn refresh(
    village: Res<Village>,
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    mut card: Single<&mut Node, With<LensCard>>,
    mut clear_label: Single<&mut Text, With<ClearLabel>>,
    mut buttons: LensButtons,
) {
    let open = visible(&village, &setup, &saves, &sound);
    let display = if open { Display::Flex } else { Display::None };
    if card.display != display {
        card.display = display;
    }
    if !open {
        return;
    }
    let active = village.lenses.active;
    let wanted_clear = if active.is_some() {
        "Clear lens"
    } else {
        "Normal view"
    };
    if clear_label.0 != wanted_clear {
        clear_label.0 = wanted_clear.into();
    }
    for (&action, &interaction, mut fill, mut edge, mut shadow) in &mut buttons {
        let is_active = match action {
            LensCardAction::Close => false,
            LensCardAction::Select(lens) => active == Some(lens),
            LensCardAction::NormalView => active.is_none(),
        };
        theme::paint_button(
            interaction,
            true,
            is_active,
            &mut fill,
            &mut edge,
            &mut shadow,
        );
    }
}

fn input(
    mut village: ResMut<Village>,
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    buttons: Query<(&LensCardAction, &Interaction), Changed<Interaction>>,
) {
    if !visible(&village, &setup, &saves, &sound) {
        return;
    }
    for (&action, &interaction) in &buttons {
        if interaction != Interaction::Pressed {
            continue;
        }
        match action {
            LensCardAction::Close => {
                village.lenses.open = false;
                return;
            }
            LensCardAction::Select(lens) => {
                let next = (village.lenses.active != Some(lens)).then_some(lens);
                village.lenses.choose(next);
                return;
            }
            LensCardAction::NormalView => {
                village.lenses.choose(None);
                return;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lens_card_selects_toggles_clears_and_closes() {
        let mut village = Village {
            camp: Some(CLEARING_CAMP),
            ..default()
        };
        village.lenses.open = true;

        let mut app = App::new();
        app.insert_resource(village)
            .insert_resource(WorldSetup::default().session())
            .init_resource::<SaveMenu>()
            .init_resource::<SoundSettings>()
            .add_systems(Update, input);

        let press = |app: &mut App, action: LensCardAction| {
            let entity = app.world_mut().spawn((action, Interaction::Pressed)).id();
            app.update();
            app.world_mut().entity_mut(entity).despawn();
        };

        press(&mut app, LensCardAction::Select(MapLens::Power));
        assert!(app.world().resource::<Village>().lenses.active == Some(MapLens::Power));
        assert!(!app.world().resource::<Village>().lenses.open);

        app.world_mut().resource_mut::<Village>().lenses.open = true;
        press(&mut app, LensCardAction::Select(MapLens::Power));
        assert!(app.world().resource::<Village>().lenses.active.is_none());

        app.world_mut().resource_mut::<Village>().lenses.open = true;
        press(&mut app, LensCardAction::Select(MapLens::Food));
        assert!(app.world().resource::<Village>().lenses.active == Some(MapLens::Food));

        app.world_mut().resource_mut::<Village>().lenses.open = true;
        press(&mut app, LensCardAction::NormalView);
        assert!(app.world().resource::<Village>().lenses.active.is_none());

        app.world_mut().resource_mut::<Village>().lenses.open = true;
        press(&mut app, LensCardAction::Close);
        assert!(!app.world().resource::<Village>().lenses.open);
    }
}
