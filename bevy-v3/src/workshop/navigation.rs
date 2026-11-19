use crate::{audio::SoundSettings, save_library::SaveMenu, setup::WorldSetup, ui_font::ui_font};
use bevy::prelude::*;

pub struct ArtToolsPlugin;

impl Plugin for ArtToolsPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, spawn_tools)
            .add_systems(Update, (show_tools, open_tool).chain());
    }
}

#[derive(Component)]
struct ArtTools;

#[derive(Component)]
struct LaunchStatus;

#[derive(Component, Clone, Copy, PartialEq, Eq)]
enum ArtTool {
    Workshop,
    Garden,
    Biomes,
    Residents,
}

impl ArtTool {
    const ALL: [Self; 4] = [Self::Workshop, Self::Garden, Self::Biomes, Self::Residents];

    fn label(self) -> &'static str {
        match self {
            Self::Workshop => "3D inspector",
            Self::Garden => "Asset Garden",
            Self::Biomes => "Biome landscapes",
            Self::Residents => "Resident animations",
        }
    }

    fn arguments(self) -> &'static [&'static str] {
        match self {
            Self::Workshop => &["--workshop"],
            Self::Garden => &["--asset-garden"],
            Self::Biomes => &["--biome-landscapes"],
            Self::Residents => &["--residents"],
        }
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
        match std::env::current_exe().and_then(|exe| {
            std::process::Command::new(exe)
                .args(tool.arguments())
                .spawn()
        }) {
            Ok(child) => {
                processes.push((*tool, child));
                status.0.clear();
            }
            Err(error) => status.0 = format!("Could not open {}: {error}", tool.label()),
        }
    }
}
