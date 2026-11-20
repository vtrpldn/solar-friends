use crate::{audio::SoundSettings, save_library::SaveMenu, setup::WorldSetup, ui_font::ui_font};
use bevy::prelude::*;

pub struct ArtToolsPlugin;

#[derive(Resource, Default)]
struct ArtToolsOpen(bool);

#[derive(Component)]
struct ArtToolsToggle;

#[derive(Component)]
struct ArtToolsDrawer;

impl Plugin for ArtToolsPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ArtToolsOpen>()
            .add_systems(Startup, spawn_tools)
            .add_systems(Update, (toggle_tools, show_tools, open_tool).chain());
    }
}

pub(super) struct ArtNavigationPlugin(pub ArtTool);

impl Plugin for ArtNavigationPlugin {
    fn build(&self, app: &mut App) {
        let current = self.0;
        app.add_systems(
            Startup,
            move |commands: Commands, assets: Res<AssetServer>| {
                spawn_navigation(commands, assets, current);
            },
        )
        .add_systems(Update, open_tool);
    }
}

fn spawn_navigation(mut commands: Commands, assets: Res<AssetServer>, current: ArtTool) {
    commands
        .spawn((
            ArtTools,
            Node {
                position_type: PositionType::Absolute,
                left: px(12),
                top: px(8),
                right: px(12),
                column_gap: px(6),
                flex_wrap: FlexWrap::Wrap,
                align_items: AlignItems::Center,
                ..default()
            },
            GlobalZIndex(1),
        ))
        .with_children(|bar| {
            for tool in [ArtTool::Game].into_iter().chain(ArtTool::ALL) {
                let mut item = bar.spawn((
                    crate::theme::button_node(Node {
                        padding: UiRect::axes(px(10), px(5)),
                        ..default()
                    }),
                    BackgroundColor(if tool == current {
                        crate::theme::ACTIVE
                    } else {
                        crate::theme::BUTTON
                    }),
                    BorderColor::all(crate::theme::EDGE),
                ));
                if tool != current {
                    item.insert((Button, tool));
                }
                item.with_child((Text::new(tool.label()), ui_font(&assets, 15.)));
            }
            bar.spawn((LaunchStatus, Text::default(), ui_font(&assets, 14.)));
        });
}

#[derive(Component)]
pub(super) struct ArtTools;

#[derive(Component)]
struct LaunchStatus;

#[derive(Component, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ArtTool {
    Game,
    Collection,
    Workshop,
    Garden,
    Biomes,
    Residents,
    BalanceLab,
}

impl ArtTool {
    const ALL: [Self; 5] = [
        Self::Collection,
        Self::Workshop,
        Self::Garden,
        Self::Biomes,
        Self::Residents,
    ];

    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Game => "Game menu",
            Self::Collection => "Collection",
            Self::Workshop => "3D inspector",
            Self::Garden => "Scene editor",
            Self::Biomes => "Biome landscapes",
            Self::Residents => "Resident animations",
            Self::BalanceLab => "Balance Lab",
        }
    }

    fn arguments(self) -> &'static [&'static str] {
        match self {
            Self::Game => &[],
            Self::Collection => &["--collection"],
            Self::Workshop => &["--workshop"],
            Self::Garden => &["--asset-garden"],
            Self::Biomes => &["--biome-landscapes"],
            Self::Residents => &["--residents"],
            Self::BalanceLab => &["--lab-ui"],
        }
    }

    pub(crate) fn launch(self) -> std::io::Result<std::process::Child> {
        std::env::current_exe().and_then(|exe| {
            std::process::Command::new(exe)
                .args(self.arguments())
                .spawn()
        })
    }

    #[cfg(target_arch = "wasm32")]
    pub(crate) fn open_in_browser(self) -> Result<(), String> {
        let window =
            web_sys::window().ok_or_else(|| "browser window is unavailable".to_string())?;
        let location = window.location();
        let path = location
            .pathname()
            .map_err(|_| "could not read page location".to_string())?;
        let query = match self {
            Self::Game => "",
            Self::Collection => "?collection",
            Self::Workshop => "?workshop",
            Self::Garden => "?asset-garden",
            Self::Biomes => "?biome-landscapes",
            Self::Residents => "?residents",
            Self::BalanceLab => "?lab-ui",
        };
        location
            .set_href(&format!("{path}{query}"))
            .map_err(|_| "could not open page".to_string())
    }
}

fn spawn_tools(mut commands: Commands, assets: Res<AssetServer>) {
    commands
        .spawn((
            ArtTools,
            Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                right: px(46),
                bottom: px(46),
                flex_direction: FlexDirection::Column,
                align_items: AlignItems::FlexEnd,
                row_gap: px(10),
                ..default()
            },
        ))
        .with_children(|root| {
            root.spawn((
                ArtToolsDrawer,
                crate::theme::panel_node(Node {
                    display: Display::None,
                    width: px(260),
                    flex_direction: FlexDirection::Column,
                    row_gap: px(6),
                    padding: UiRect::all(px(16)),
                    ..default()
                }),
                crate::theme::panel(),
            ))
            .with_children(|panel| {
                panel.spawn((
                    Text::new("ART TOOLS"),
                    crate::ui_font::ui_font_styled(&assets, 10.5, 750, crate::theme::CAPTION),
                ));
                for tool in ArtTool::ALL.into_iter().chain([ArtTool::BalanceLab]) {
                    panel
                        .spawn((
                            tool,
                            Button,
                            crate::theme::button_node(Node {
                                padding: UiRect::axes(px(12), px(6)),
                                ..default()
                            }),
                            crate::theme::button(),
                        ))
                        .with_child((
                            Text::new(tool.label()),
                            crate::ui_font::ui_font_weight(&assets, 14., 600),
                        ));
                }
                panel.spawn((LaunchStatus, Text::default(), ui_font(&assets, 13.)));
            });

            root.spawn((
                ArtToolsToggle,
                Button,
                crate::theme::button_node(Node {
                    padding: UiRect::axes(px(14), px(7)),
                    ..default()
                }),
                crate::theme::button(),
            ))
            .with_child((
                Text::new("Art tools"),
                crate::ui_font::ui_font_weight(&assets, 14., 600),
            ));
        });
}

fn toggle_tools(
    mut open: ResMut<ArtToolsOpen>,
    setup: Res<WorldSetup>,
    saves: Res<SaveMenu>,
    sound: Res<SoundSettings>,
    mut toggle: Single<
        (
            Ref<'static, Interaction>,
            &mut BackgroundColor,
            &mut BorderColor,
            &mut BoxShadow,
        ),
        With<ArtToolsToggle>,
    >,
) {
    let available = setup.open
        && !setup.choosing_land()
        && !sound.open
        && !saves.open
        && !cfg!(target_arch = "wasm32");
    if !available {
        open.0 = false;
        return;
    }
    let (interaction, background, border, shadow) = &mut *toggle;
    if interaction.is_changed() && **interaction == Interaction::Pressed {
        open.0 = !open.0;
    }
    crate::theme::paint_button(**interaction, true, open.0, background, border, shadow);
}

fn show_tools(
    setup: Res<WorldSetup>,
    saves: Res<SaveMenu>,
    sound: Res<SoundSettings>,
    open: Res<ArtToolsOpen>,
    mut panel: Single<&mut Node, (With<ArtTools>, Without<ArtToolsDrawer>)>,
    mut drawer: Single<&mut Node, (With<ArtToolsDrawer>, Without<ArtTools>)>,
) {
    // The tools launch separate programs, which the web build cannot do.
    let visible = setup.open
        && !setup.choosing_land()
        && !sound.open
        && !saves.open
        && !cfg!(target_arch = "wasm32");
    panel.display = if visible {
        Display::Flex
    } else {
        Display::None
    };
    drawer.display = if visible && open.0 {
        Display::Flex
    } else {
        Display::None
    };
}

fn open_tool(
    panel: Single<&Node, With<ArtTools>>,
    mut status: Single<&mut Text, With<LaunchStatus>>,
    mut buttons: Query<(&Interaction, &ArtTool, &mut BackgroundColor), Changed<Interaction>>,
    mut processes: Local<Vec<(ArtTool, std::process::Child)>>,
) {
    processes.retain_mut(|(_, child)| !matches!(child.try_wait(), Ok(Some(_))));
    if panel.display == Display::None {
        return;
    }
    for (interaction, tool, mut background) in &mut buttons {
        background.0 = crate::theme::button_fill(*interaction, true);
        if *interaction != Interaction::Pressed {
            continue;
        }
        if processes.iter().any(|(running, _)| running == tool) {
            status.0 = format!("{} is already open.", tool.label());
            continue;
        }
        match tool.launch() {
            Ok(child) => {
                processes.push((*tool, child));
                status.0.clear();
            }
            Err(error) => status.0 = format!("Could not open {}: {error}", tool.label()),
        }
    }
}
