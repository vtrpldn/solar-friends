use super::*;
use bevy::ui::FocusPolicy;

use std::marker::PhantomData;

pub(in crate::village) trait Screen: Send + Sync + 'static {
    type Action: Clone + PartialEq + Send + Sync + 'static;
    const PANEL: UtilityPanel;

    fn content(
        village: &Village,
        catalog: &Catalog,
        setup: &WorldSetup,
        land: &Land,
    ) -> Option<Widget<Self::Action>>;

    fn activate(
        action: &Self::Action,
        village: &mut Village,
        catalog: &Catalog,
        setup: &WorldSetup,
        camera: Option<&mut VillageCamera>,
    );
}

#[derive(Component)]
pub(in crate::village) struct WidgetButton<A: Send + Sync + 'static> {
    action: A,
    enabled: bool,
    field: bool,
}

#[derive(Component)]
pub(in crate::village) struct WidgetRoot<S: Screen>(PhantomData<S>);

pub(in crate::village) enum Widget<A> {
    Column(Vec<Self>),
    Row(Vec<Self>),
    Inline(Vec<Self>),
    Card(Vec<Self>),
    Text(String, Tone),
    Meter(f32),
    Art(art::Item),
    Button(A, String, bool, bool),
    Field(A, String, bool),
}

#[derive(Clone, Copy, PartialEq)]
pub(in crate::village) enum Tone {
    Title,
    Caption,
    Body,
    Note,
}

impl<A: Clone + Send + Sync + 'static> Widget<A> {
    pub(super) fn illustrated(id: &str, content: Vec<Self>) -> Self {
        match art::Item::for_material(id) {
            Some(image) => Self::Inline(vec![Self::Art(image), Self::Column(content)]),
            None => Self::Column(content),
        }
    }

    pub(super) fn title(text: impl Into<String>) -> Self {
        Self::Text(text.into(), Tone::Title)
    }

    pub(super) fn caption(text: impl Into<String>) -> Self {
        Self::Text(text.into(), Tone::Caption)
    }

    pub(super) fn body(text: impl Into<String>) -> Self {
        Self::Text(text.into(), Tone::Body)
    }

    pub(super) fn note(text: impl Into<String>) -> Self {
        Self::Text(text.into(), Tone::Note)
    }
}

#[derive(PartialEq)]
enum Shape {
    Column,
    Row,
    Inline,
    Card,
    Text(Tone),
    Meter,
    Art(art::Item),
    Button,
    Field,
}

#[derive(Component, Default)]
pub(in crate::village) struct Rendered {
    shape: Vec<(Shape, usize)>,
    texts: Vec<Entity>,
    buttons: Vec<Entity>,
    meters: Vec<Entity>,
}

impl<A: Clone + Send + Sync + 'static> Widget<A> {
    fn describe(&self, shape: &mut Vec<(Shape, usize)>) {
        let (kind, children) = match self {
            Self::Column(children) => (Shape::Column, children.as_slice()),
            Self::Row(children) => (Shape::Row, children.as_slice()),
            Self::Inline(children) => (Shape::Inline, children.as_slice()),
            Self::Card(children) => (Shape::Card, children.as_slice()),
            Self::Text(_, tone) => (Shape::Text(*tone), &[][..]),
            Self::Button(..) => (Shape::Button, &[][..]),
            Self::Field(..) => (Shape::Field, &[][..]),
            Self::Meter(_) => (Shape::Meter, &[][..]),
            Self::Art(image) => (Shape::Art(*image), &[][..]),
        };
        shape.push((kind, children.len()));
        for child in children {
            child.describe(shape);
        }
    }

    fn spawn(
        &self,
        parent: &mut ChildSpawnerCommands,
        assets: &AssetServer,
        rendered: &mut Rendered,
        in_row: bool,
    ) {
        match self {
            Self::Text(value, tone) => {
                let (size, weight, color) = match tone {
                    // Sized for reading at a desk under the 0.82 UI scale; notes stay
                    // quieter by colour, not by shrinking out of legibility.
                    Tone::Title => (19., 750, theme::INK),
                    Tone::Caption => (11.5, 750, theme::CAPTION),
                    Tone::Body => (15.5, 450, theme::INK),
                    Tone::Note => (14., 450, theme::MUTED),
                };
                rendered.texts.push(
                    parent
                        .spawn((
                            Text::new(value),
                            ui_font_styled(assets, size, weight, color),
                            bevy::text::LineHeight::RelativeToFont(1.4),
                        ))
                        .id(),
                );
            }
            Self::Art(image) => {
                parent.spawn((
                    image.image(assets),
                    Node {
                        width: px(46),
                        height: px(35),
                        flex_shrink: 0.,
                        ..default()
                    },
                    FocusPolicy::Pass,
                ));
            }
            Self::Meter(fraction) => {
                let track = theme::panel_node(Node {
                    height: px(9),
                    overflow: Overflow::clip(),
                    ..default()
                });
                let mut root = parent.spawn((
                    Node {
                        border: UiRect::ZERO,
                        ..track
                    },
                    BackgroundColor(theme::TRACK),
                ));
                root.with_children(|parent| {
                    rendered.meters.push(
                        parent
                            .spawn((
                                Node {
                                    width: percent(fraction.clamp(0., 1.) * 100.),
                                    border_radius: BorderRadius::MAX,
                                    ..default()
                                },
                                BackgroundColor(theme::LEAF),
                            ))
                            .id(),
                    );
                });
            }
            Self::Button(action, value, enabled, _) => {
                rendered.spawn_button(parent, assets, action, value, *enabled, false);
            }
            Self::Field(action, value, _) => {
                rendered.spawn_button(parent, assets, action, value, true, true);
            }
            Self::Column(children)
            | Self::Row(children)
            | Self::Inline(children)
            | Self::Card(children) => {
                let inline = matches!(self, Self::Inline(_));
                let row = matches!(self, Self::Row(_)) || inline;
                let card = matches!(self, Self::Card(_));
                let node = Node {
                    flex_direction: if row {
                        FlexDirection::Row
                    } else {
                        FlexDirection::Column
                    },
                    align_items: if inline {
                        AlignItems::Center
                    } else if row {
                        AlignItems::Start
                    } else {
                        AlignItems::Stretch
                    },
                    flex_wrap: if row && !inline {
                        FlexWrap::Wrap
                    } else {
                        FlexWrap::NoWrap
                    },
                    flex_grow: f32::from(
                        card && in_row || matches!(self, Self::Column(_)) && in_row,
                    ),
                    flex_shrink: f32::from(in_row),
                    flex_basis: if card && in_row { px(170) } else { Val::Auto },
                    min_width: if card { px(165) } else { px(0) },
                    max_width: percent(100),
                    column_gap: px(8),
                    row_gap: px(8),
                    padding: if card {
                        UiRect::all(px(14))
                    } else {
                        UiRect::ZERO
                    },
                    ..default()
                };
                // Cards are quiet insets on the dialog's paper, not floating panels.
                let mut container = if card {
                    parent.spawn((
                        Node {
                            border: UiRect::all(px(1)),
                            border_radius: BorderRadius::all(px(14)),
                            ..node
                        },
                        BackgroundColor(theme::CARD),
                        BorderColor::all(theme::SUBTLE_BORDER),
                    ))
                } else {
                    parent.spawn(node)
                };
                container.with_children(|parent| {
                    for child in children {
                        child.spawn(parent, assets, rendered, row);
                    }
                });
            }
        }
    }

    fn values<'a>(
        &'a self,
        text: &mut Vec<&'a str>,
        buttons: &mut Vec<(&'a A, bool, bool)>,
        meters: &mut Vec<f32>,
    ) {
        match self {
            Self::Text(value, _) => text.push(value),
            Self::Meter(fraction) => meters.push(*fraction),
            Self::Art(_) => {}
            Self::Field(action, value, active) => {
                text.push(value);
                buttons.push((action, true, *active));
            }
            Self::Button(action, value, enabled, active) => {
                text.push(value);
                buttons.push((action, *enabled, *active));
            }
            Self::Column(children)
            | Self::Row(children)
            | Self::Inline(children)
            | Self::Card(children) => {
                for child in children {
                    child.values(text, buttons, meters);
                }
            }
        }
    }
}

impl Rendered {
    fn spawn_button<A: Clone + Send + Sync + 'static>(
        &mut self,
        parent: &mut ChildSpawnerCommands,
        assets: &AssetServer,
        action: &A,
        value: &str,
        enabled: bool,
        field: bool,
    ) {
        let mut button = parent.spawn((
            WidgetButton {
                action: action.clone(),
                enabled,
                field,
            },
            Button,
            FocusPolicy::Pass,
            theme::button_node(Node {
                padding: UiRect::axes(px(12), px(6)),
                flex_shrink: 0.,
                // Buttons keep their own width, like V2's; fields span their card.
                align_self: if field {
                    AlignSelf::Stretch
                } else {
                    AlignSelf::FlexStart
                },
                ..default()
            }),
            theme::button(),
        ));
        if field {
            button.insert((BackgroundColor(theme::CARD), BoxShadow::default()));
        }
        self.buttons.push(button.id());
        button.with_children(|parent| {
            self.texts.push(
                parent
                    .spawn((
                        FocusPolicy::Pass,
                        Text::new(value),
                        ui_font_weight(assets, 13., if field { 400 } else { 600 }),
                    ))
                    .id(),
            );
        });
    }
}

pub(super) fn spawn<S: Screen>(parent: &mut ChildSpawnerCommands) {
    parent.spawn((
        WidgetRoot::<S>(PhantomData),
        Rendered::default(),
        Node {
            flex_direction: FlexDirection::Column,
            flex_shrink: 0.,
            display: Display::None,
            ..default()
        },
    ));
}

type Buttons<'w, 's, A> = Query<
    'w,
    's,
    (
        &'static mut WidgetButton<A>,
        &'static Interaction,
        &'static mut BackgroundColor,
        &'static mut BorderColor,
        &'static mut BoxShadow,
    ),
>;

pub(in crate::village) fn refresh<S: Screen>(
    mut commands: Commands,
    (village, setup, saves, sound): (
        Res<Village>,
        Res<WorldSetup>,
        Res<SaveMenu>,
        Res<SoundSettings>,
    ),
    (catalog, assets, land): (Res<Catalog>, Res<AssetServer>, Res<Land>),
    mut root: Single<(Entity, &mut Node, &mut Rendered), With<WidgetRoot<S>>>,
    mut fills: Query<&mut Node, Without<WidgetRoot<S>>>,
    mut texts: Query<&mut Text>,
    mut buttons: Buttons<S::Action>,
) {
    let (entity, node, rendered) = &mut *root;
    let panel = visible_panel(&village, &setup, &saves, &sound);
    let model = (panel == Some(S::PANEL))
        .then(|| S::content(&village, &catalog, &setup, &land))
        .flatten();
    let Some(model) = model else {
        if node.display != Display::None {
            node.display = Display::None;
        }
        return;
    };
    if node.display != Display::Flex {
        node.display = Display::Flex;
    }
    let mut shape = Vec::new();
    model.describe(&mut shape);
    if rendered.shape != shape {
        rendered.shape = shape;
        rendered.texts.clear();
        rendered.buttons.clear();
        rendered.meters.clear();
        commands
            .entity(*entity)
            .despawn_children()
            .with_children(|parent| {
                model.spawn(parent, &assets, rendered, false);
            });
        return;
    }
    // Update live figures without replacing the buttons under the pointer.
    let (mut values, mut states, mut meters) = (Vec::new(), Vec::new(), Vec::new());
    model.values(&mut values, &mut states, &mut meters);
    for (id, fraction) in rendered.meters.iter().zip(meters) {
        let width = percent(fraction.clamp(0., 1.) * 100.);
        if let Ok(mut fill) = fills.get_mut(*id)
            && fill.width != width
        {
            fill.width = width;
        }
    }
    for (id, value) in rendered.texts.iter().zip(values) {
        if let Ok(mut text) = texts.get_mut(*id)
            && text.0 != value
        {
            text.0 = value.into();
        }
    }
    for (id, (action, enabled, active)) in rendered.buttons.iter().zip(states) {
        if let Ok((mut button, interaction, mut fill, mut edge, mut shadow)) = buttons.get_mut(*id)
        {
            if button.action != *action || button.enabled != enabled {
                button.action = action.clone();
                button.enabled = enabled;
            }
            if button.field {
                let color = if active {
                    theme::ACTIVE_EDGE
                } else {
                    theme::EDGE
                };
                if *edge != BorderColor::all(color) {
                    *edge = BorderColor::all(color);
                }
            } else {
                theme::paint_button(
                    *interaction,
                    enabled,
                    active,
                    &mut fill,
                    &mut edge,
                    &mut shadow,
                );
            }
        }
    }
}

pub(in crate::village) fn input<S: Screen>(
    mut village: ResMut<Village>,
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    catalog: Res<Catalog>,
    hud: Single<&Node, With<VillageHud>>,
    root: Single<&Node, With<WidgetRoot<S>>>,
    buttons: Query<(&WidgetButton<S::Action>, &Interaction), Changed<Interaction>>,
    mut cameras: Query<&mut VillageCamera>,
) {
    if hud.display == Display::None
        || root.display == Display::None
        || visible_panel(&village, &setup, &saves, &sound) != Some(S::PANEL)
    {
        return;
    }
    for (button, interaction) in &buttons {
        if *interaction == Interaction::Pressed && button.enabled {
            let mut camera = cameras.single_mut().ok();
            S::activate(
                &button.action,
                &mut village,
                &catalog,
                &setup,
                camera.as_deref_mut(),
            );
            return;
        }
    }
}

pub(super) fn stepper<A: Clone + Send + Sync + 'static>(
    label: impl Into<String>,
    previous: A,
    value: impl Into<String>,
    next: A,
    enabled: bool,
) -> Widget<A> {
    Widget::Column(vec![
        Widget::caption(label),
        Widget::Inline(vec![
            Widget::Button(previous, "‹".into(), enabled, false),
            Widget::body(value),
            Widget::Button(next, "›".into(), enabled, false),
        ]),
    ])
}

pub(super) fn cycle(index: usize, len: usize, forward: bool) -> usize {
    (index + if forward { 1 } else { len - 1 }) % len
}
