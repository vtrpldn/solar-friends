use super::*;

#[derive(Clone, Copy)]
enum Action {
    Find,
    Switch,
    Water(WaterCommand),
}

#[derive(Component)]
pub(in crate::village) struct SiteButton {
    id: usize,
    panel: UtilityPanel,
    action: Action,
}

impl SiteButton {
    fn state(
        &self,
        construction: &Construction,
    ) -> Option<(&'static str, Result<(), &'static str>, bool)> {
        let utilities = &construction.utilities;
        let state = match self.action {
            Action::Find => ("Find in village", Ok(()), false),
            Action::Switch => {
                let enabled = utilities.building_switch(self.id.checked_sub(1)?)?;
                (
                    if enabled { "Switch off" } else { "Switch on" },
                    Ok(()),
                    enabled,
                )
            }
            Action::Water(command) => {
                let site = utilities.water_site(self.id)?;
                let (label, action) = match command {
                    WaterCommand::River if site.capacity[1] > 0. => (
                        "Carry river water",
                        WaterAction::Carry {
                            source: None,
                            channel: 1,
                        },
                    ),
                    WaterCommand::Purify if site.supports_water_policy(true) => {
                        ("Purify by hand", WaterAction::Purify)
                    }
                    WaterCommand::Sanitation if site.supports_water_policy(false) => {
                        ("Service waste tanks", WaterAction::Sanitation)
                    }
                    WaterCommand::Policy(true) if site.supports_water_policy(true) => {
                        return Some(("Maintain drinking reserve", Ok(()), site.maintain_fresh));
                    }
                    WaterCommand::Policy(false) if site.supports_water_policy(false) => {
                        return Some(("Maintain sanitation", Ok(()), site.maintain_sanitation));
                    }
                    _ => return None,
                };
                (label, construction.check_water_job(self.id, action), false)
            }
        };
        Some(state)
    }
}

pub(super) fn water_blockers(construction: &Construction, id: usize) -> String {
    let mut notes = Vec::new();
    for command in [
        WaterCommand::River,
        WaterCommand::Purify,
        WaterCommand::Sanitation,
    ] {
        let button = SiteButton {
            id,
            panel: UtilityPanel::Water,
            action: Action::Water(command),
        };
        if let Some((label, Err(reason), _)) = button.state(construction) {
            if reason == "A water job is already queued here." {
                return "Wait for the current water job to finish.".into();
            }
            notes.push(format!("{label} · {reason}"));
        }
    }
    notes.join("\n")
}

pub(super) fn spawn(
    card: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    construction: &Construction,
    panel: UtilityPanel,
    id: usize,
) {
    let commands = [
        Action::Find,
        Action::Switch,
        Action::Water(WaterCommand::River),
        Action::Water(WaterCommand::Purify),
        Action::Water(WaterCommand::Sanitation),
        Action::Water(WaterCommand::Policy(true)),
        Action::Water(WaterCommand::Policy(false)),
    ];
    card.spawn((
        FocusPolicy::Pass,
        Node {
            flex_wrap: FlexWrap::Wrap,
            column_gap: px(7),
            row_gap: px(7),
            margin: UiRect::top(px(5)),
            ..default()
        },
    ))
    .with_children(|row| {
        for action in commands {
            if panel != UtilityPanel::Water && matches!(action, Action::Water(_)) {
                continue;
            }
            let button = SiteButton { id, panel, action };
            let (label, _, _) =
                button
                    .state(construction)
                    .unwrap_or(("", Err("Unavailable"), false));
            row.spawn((
                button,
                Button,
                FocusPolicy::Pass,
                theme::button_node(Node {
                    padding: UiRect::axes(px(9), px(5)),
                    ..default()
                }),
                theme::button(),
            ))
            .with_child((
                FocusPolicy::Pass,
                Text::new(label),
                ui_font_weight(assets, 13., 600),
            ));
        }
    });
}

type SiteButtons<'w, 's> = Query<
    'w,
    's,
    (
        &'static SiteButton,
        &'static Interaction,
        &'static Children,
        &'static mut Node,
        &'static mut BackgroundColor,
        &'static mut BorderColor,
        &'static mut BoxShadow,
    ),
>;

pub(in crate::village) fn paint(
    village: Res<Village>,
    mut buttons: SiteButtons,
    mut labels: Query<&mut Text>,
) {
    for (button, interaction, children, mut node, mut fill, mut edge, mut shadow) in &mut buttons {
        let state = button.state(&village.construction);
        let display = if state.is_some() {
            Display::Flex
        } else {
            Display::None
        };
        if node.display != display {
            node.display = display;
        }
        if let Some((label, enabled, active)) = state {
            theme::paint_button(
                *interaction,
                enabled.is_ok(),
                active,
                &mut fill,
                &mut edge,
                &mut shadow,
            );
            if let Ok(mut text) = labels.get_mut(children[0])
                && text.0 != label
            {
                text.0 = label.into();
            }
        }
    }
}

pub(in crate::village) fn input(
    mut village: ResMut<Village>,
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    mut cameras: Query<&mut VillageCamera>,
    hud: Single<&Node, With<VillageHud>>,
    buttons: Query<(&SiteButton, &Interaction), Changed<Interaction>>,
) {
    let panel = current_panel(&village, &setup, &saves, &sound);
    if hud.display == Display::None || panel.is_none() {
        return;
    }
    for (button, interaction) in &buttons {
        if *interaction != Interaction::Pressed
            || Some(button.panel) != panel
            || !button
                .state(&village.construction)
                .is_some_and(|(_, enabled, _)| enabled.is_ok())
        {
            continue;
        }
        let town = &mut *village;
        match button.action {
            Action::Find => {
                let Ok(mut camera) = cameras.single_mut() else {
                    continue;
                };
                town.utility_panel = None;
                town.construction.cancel_placement();
                town.construction.menu = false;
                town.construction.farming.close();
                if let Some(index) = button.id.checked_sub(1) {
                    town.construction.select_built_project(index);
                    town.focus_selected_project(&setup, &mut camera);
                } else if let Some(camp) = town.camp {
                    town.construction.clear_selected_project();
                    let point = world_position(camp.x as f32, camp.y as f32);
                    let terrain = town.terrain(&setup);
                    camera.target =
                        Vec3::new(point.x, terrain.height_at(point.x, point.y), point.y);
                }
                return;
            }
            Action::Switch => {
                if let Some(index) = button.id.checked_sub(1) {
                    town.construction.utilities.toggle(index);
                }
            }
            Action::Water(command) => {
                town.water_panel.select_facility(button.id, false);
                town.water_panel.apply(command, &mut town.construction);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn camp_card_queues_work_for_its_own_site_and_focuses_camp() {
        let camp = CAMP_SITES[2].1;
        let mut village = Village {
            camp: Some(camp),
            utility_panel: Some(UtilityPanel::Water),
            ..default()
        };
        village.construction.utilities.ensure_camp();
        village.water_panel.select_facility(99, false);

        let mut app = App::new();
        app.insert_resource(village)
            .insert_resource(WorldSetup::default().session())
            .init_resource::<SaveMenu>()
            .init_resource::<SoundSettings>()
            .add_systems(Update, input);
        let world = app.world_mut();
        world.spawn((VillageHud, Node::default()));
        let camera = world
            .spawn(VillageCamera {
                target: Vec3::ZERO,
                heading: 0.,
                polar: crate::default_camera_polar(),
            })
            .id();
        let carry = world
            .spawn((
                SiteButton {
                    id: 0,
                    panel: UtilityPanel::Water,
                    action: Action::Water(WaterCommand::River),
                },
                Interaction::Pressed,
            ))
            .id();

        app.update();

        let village = app.world().resource::<Village>();
        assert_eq!(village.water_panel.target, 0);
        assert!(
            village
                .construction
                .water_card_job_status(0, village.clock)
                .is_some()
        );

        app.world_mut().entity_mut(carry).despawn();
        app.world_mut().spawn((
            SiteButton {
                id: 0,
                panel: UtilityPanel::Water,
                action: Action::Find,
            },
            Interaction::Pressed,
        ));

        app.update();

        let village = app.world().resource::<Village>();
        assert!(village.utility_panel.is_none());
        let target = app.world().get::<VillageCamera>(camera).unwrap().target;
        assert_eq!(target.xz(), world_position(camp.x as f32, camp.y as f32));
    }
}
