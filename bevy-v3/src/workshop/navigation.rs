use crate::{audio::SoundSettings, save_library::SaveMenu, setup::WorldSetup, ui_font::ui_font};
use bevy::prelude::*;

pub struct ArtToolsPlugin;

impl Plugin for ArtToolsPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, spawn_tools)
            .add_systems(Update, (show_tools, open_tool).chain());
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
                    Node {
                        padding: UiRect::axes(px(10), px(5)),
                        ..default()
                    },
                    BackgroundColor(if tool == current {
                        Color::srgb_u8(103, 123, 85)
                    } else {
                        Color::srgb_u8(62, 83, 65)
                    }),
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
pub(super) enum ArtTool {
    Game,
    Collection,
    Workshop,
    Garden,
    Biomes,
    Residents,
}

impl ArtTool {
    const ALL: [Self; 5] = [
        Self::Collection,
        Self::Workshop,
        Self::Garden,
        Self::Biomes,
        Self::Residents,
    ];

    pub(super) fn label(self) -> &'static str {
        match self {
            Self::Game => "Game menu",
            Self::Collection => "Collection",
            Self::Workshop => "3D inspector",
            Self::Garden => "Scene editor",
            Self::Biomes => "Biome landscapes",
            Self::Residents => "Resident animations",
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
        }
    }

    pub(super) fn launch(self) -> std::io::Result<std::process::Child> {
        std::env::current_exe().and_then(|exe| {
            std::process::Command::new(exe)
                .args(self.arguments())
                .spawn()
        })
    }
}

fn spawn_tools(mut commands: Commands, assets: Res<AssetServer>) {
    commands
        .spawn((
            ArtTools,
            Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                right: px(32),
                bottom: px(32),
                width: px(304),
                flex_direction: FlexDirection::Column,
                row_gap: px(6),
                padding: UiRect::all(px(16)),
                ..default()
            },
            BackgroundColor(Color::srgb_u8(31, 45, 35)),
        ))
        .with_children(|panel| {
            panel.spawn((Text::new("Art previews"), ui_font(&assets, 20.)));
            for tool in ArtTool::ALL {
                panel
                    .spawn((
                        tool,
                        Button,
                        Node {
                            padding: UiRect::axes(px(14), px(7)),
                            ..default()
                        },
                        BackgroundColor(Color::srgb_u8(62, 83, 65)),
                    ))
                    .with_child((Text::new(tool.label()), ui_font(&assets, 17.)));
            }
            panel.spawn((LaunchStatus, Text::default(), ui_font(&assets, 14.)));
        });
}

fn show_tools(
    setup: Res<WorldSetup>,
    saves: Res<SaveMenu>,
    sound: Res<SoundSettings>,
    mut panel: Single<&mut Node, With<ArtTools>>,
) {
    panel.display = if setup.open && !sound.open && !saves.open {
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
        background.0 = match interaction {
            Interaction::None => Color::srgb_u8(62, 83, 65),
            Interaction::Hovered => Color::srgb_u8(82, 106, 82),
            Interaction::Pressed => Color::srgb_u8(103, 123, 85),
        };
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
