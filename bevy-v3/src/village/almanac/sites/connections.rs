use super::*;
use crate::village::almanac::widgets::{Widget, cycle, stepper};

#[derive(Clone, PartialEq)]
pub(in crate::village) enum Action {
    Source(Option<usize>),
    Destination(usize),
    Channel(usize),
    Install,
    Carry,
    MoveLink(bool),
    SwitchLink,
    RemoveLink,
    NextInstallation,
    CancelInstallation,
    NextWasteTank,
}

type Entry = Widget<Action>;

pub(in crate::village) struct Water;

impl widgets::Screen for Water {
    type Action = Action;
    const PANEL: UtilityPanel = UtilityPanel::Water;

    fn content(village: &Village, catalog: &Catalog, _: &WorldSetup, _: &Land) -> Option<Entry> {
        let construction = &village.construction;
        let utilities = &construction.utilities;
        let water = &village.water_panel;
        let mut sanitation = vec![
            Entry::title("Sanitation"),
            Entry::body(utilities.sanitation_status(construction.residents_needing_sanitation())),
        ];
        if utilities.waste_tanks_needing_attention().next().is_some() {
            sanitation.push(button(
                Action::NextWasteTank,
                "Next waste tank needing attention",
                true,
            ));
        }
        if let Some((_, _, tank, warning)) = utilities
            .waste_tanks_needing_attention()
            .find(|&(id, channel, _, _)| (id, channel) == (water.target, water.channel))
        {
            sanitation.push(Entry::note(format!(
                "{} · {tank} tank {warning}",
                construction.connection_site_name(catalog, water.target)
            )));
        }
        sanitation.extend(utilities.water_details().lines().map(Entry::note));

        Some(Entry::Column(vec![
            connection_card(village, catalog, false),
            Entry::Card(sanitation),
        ]))
    }

    fn activate(
        action: &Action,
        village: &mut Village,
        _: &Catalog,
        setup: &WorldSetup,
        camera: Option<&mut VillageCamera>,
    ) {
        match *action {
            Action::Source(id) => {
                village.water_panel.source = id;
                village.water_panel.message.clear();
            }
            Action::Destination(id) => village.water_panel.select_facility(id, false),
            Action::Channel(channel) => {
                village.water_panel.channel = channel;
                village.water_panel.message.clear();
            }
            Action::Install => village.queue_selected_water_connection(),
            Action::Carry => village
                .water_panel
                .apply(WaterCommand::Carry, &mut village.construction),
            Action::NextWasteTank => {
                if let Some(camera) = camera {
                    village.focus_next_waste_tank(setup, camera);
                }
            }
            _ => activate_link(action, village, setup, camera),
        }
    }
}

fn button(action: Action, label: &str, enabled: bool) -> Entry {
    Entry::Button(action, label.into(), enabled, false)
}

fn endpoint_picker(
    label: &str,
    village: &Village,
    catalog: &Catalog,
    choices: &[Option<usize>],
    selected: Option<usize>,
    action: impl Fn(Option<usize>) -> Action,
) -> Entry {
    let Some(&first) = choices.first() else {
        return Entry::Column(vec![
            Entry::caption(label),
            Entry::note("No completed sites"),
        ]);
    };
    let current = choices.iter().position(|&id| id == selected);
    let value = match current.map(|index| choices[index]) {
        Some(Some(id)) => village.construction.connection_site_name(catalog, id),
        Some(None) => "Choose a source".into(),
        None => "Unavailable".into(),
    };
    let adjacent = |forward| match current {
        Some(index) => choices[cycle(index, choices.len(), forward)],
        None if forward => first,
        None => choices[choices.len() - 1],
    };
    stepper(
        label,
        action(adjacent(false)),
        value,
        action(adjacent(true)),
        choices.len() > 1 || current.is_none(),
    )
}

fn connection_card(village: &Village, catalog: &Catalog, power: bool) -> Entry {
    let construction = &village.construction;
    let utilities = &construction.utilities;
    let water = &village.water_panel;
    let ids: Vec<_> = if power {
        utilities.power_ids().map(Some).collect()
    } else {
        utilities.water_ids().map(Some).collect()
    };
    let mut sources = ids.clone();
    if !power {
        sources.insert(0, None);
    }
    let (source, target) = if power {
        (Some(village.power_source), village.power_target)
    } else {
        (water.source, water.target)
    };
    let mut pickers = vec![
        endpoint_picker("SOURCE", village, catalog, &sources, source, Action::Source),
        endpoint_picker("DESTINATION", village, catalog, &ids, Some(target), |id| {
            Action::Destination(id.expect("destination choice is a site"))
        }),
    ];
    if !power {
        pickers.push(stepper(
            "CHANNEL",
            Action::Channel(cycle(water.channel, WATER_CHANNELS.len(), false)),
            WATER_CHANNELS[water.channel],
            Action::Channel(cycle(water.channel, WATER_CHANNELS.len(), true)),
            true,
        ));
    }
    let mut entries = vec![
        Entry::title("Connections"),
        Entry::caption(if power {
            "NEW POWER LINE"
        } else {
            "NEW WATER CONNECTION"
        }),
        Entry::Row(pickers),
    ];
    let endpoints = village.selected_installation();
    let queued = village.can_cancel_selected_installation();
    let quote = if queued {
        Err(construction
            .connection_installation_status(
                endpoints.expect("queued connection has endpoints"),
                village.clock,
            )
            .unwrap_or_else(|| "Installation queued".into()))
    } else if ids.is_empty() {
        Err("Complete a building to connect it.".into())
    } else if let Some(endpoints) = endpoints {
        construction.connection_quote(catalog, &village.stock, endpoints)
    } else {
        Err("Choose a source to install a connection.".into())
    };
    let carry = (!power).then(|| match source {
        None => Err("Choose a source to carry water."),
        Some(source) => construction.check_water_job(
            target,
            WaterAction::Carry {
                source: Some(source),
                channel: water.channel,
            },
        ),
    });
    let mut buttons = vec![button(
        Action::Install,
        if power {
            "Install power connection"
        } else {
            "Install water connection"
        },
        quote.is_ok(),
    )];
    if let Some(carry) = carry {
        buttons.push(button(Action::Carry, "Carry from source", carry.is_ok()));
    }
    if queued {
        buttons.push(button(
            Action::CancelInstallation,
            "Cancel installation",
            true,
        ));
    }
    let queue_count = construction.queued_utility_connections(power).count();
    if queue_count > 0 {
        buttons.push(button(
            Action::NextInstallation,
            "Next queued installation",
            true,
        ));
    }
    entries.push(Entry::Row(buttons));
    entries.push(Entry::note(match quote {
        Ok(detail) | Err(detail) => detail,
    }));
    if let Some(Err(reason)) = carry
        && (!ids.is_empty() || source.is_some())
    {
        entries.push(Entry::note(format!("Carry water · {reason}")));
    }
    let notice = if power {
        &village.power_notice
    } else {
        &water.message
    };
    if !notice.is_empty() {
        entries.push(Entry::body(notice));
    }
    if queue_count > 0 {
        entries.push(Entry::note(format!(
            "{queue_count} queued · Dashed lines show work under construction"
        )));
    }

    let (connection, selected) = if power {
        (
            utilities
                .power_link(village.power_link)
                .map(|(from, to, enabled)| (from, to, "Power", enabled)),
            village.power_link,
        )
    } else {
        (utilities.water_link(village.water_link), village.water_link)
    };
    if let Some((from, to, kind, enabled)) = connection {
        let count = village.utility_link_count();
        entries.push(stepper(
            "EXISTING CONNECTIONS",
            Action::MoveLink(false),
            format!("{} of {count}", selected.saturating_add(1).min(count)),
            Action::MoveLink(true),
            count > 1,
        ));
        entries.push(Entry::body(format!(
            "{} to {} · {kind} · {}",
            construction.connection_site_name(catalog, from),
            construction.connection_site_name(catalog, to),
            if enabled { "On" } else { "Off" },
        )));
        let mut buttons = vec![Entry::Button(
            Action::SwitchLink,
            if enabled {
                "Switch connection off"
            } else {
                "Switch connection on"
            }
            .into(),
            true,
            enabled,
        )];
        if village.can_remove_selected_utility_link() {
            buttons.push(button(
                Action::RemoveLink,
                "Remove installed connection",
                true,
            ));
        }
        entries.push(Entry::Row(buttons));
    } else {
        entries.push(Entry::note("No existing connections."));
    }
    Entry::Card(entries)
}

fn activate_link(
    action: &Action,
    village: &mut Village,
    setup: &WorldSetup,
    camera: Option<&mut VillageCamera>,
) {
    match *action {
        Action::MoveLink(next) => village.move_utility_link(next),
        Action::SwitchLink => village.toggle_selected_utility_link(),
        Action::RemoveLink => village.remove_selected_utility_link(),
        Action::CancelInstallation => village.cancel_selected_installation(),
        Action::NextInstallation => {
            if let Some(camera) = camera {
                village.focus_next_utility_installation(setup, camera);
            }
        }
        _ => {}
    }
}
