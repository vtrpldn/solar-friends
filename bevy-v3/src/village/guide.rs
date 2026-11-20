use super::*;

use bevy::prelude::*;

const TOPICS: [(&str, &str); 7] = [
    (
        "Getting started",
        "Choose a campsite after the residents arrive.\n\
         Keep tents clear of the river, road and unloaded supplies.\n\
         Use B to open Build. Select a project and click the map to plan it.\n\
         Check F11 for progress and F10 for available supplies.\n\
         Space pauses or resumes time. Outside menus, 1–4 set the speed.\n\
         F5 saves the village. F6 opens the saved village library.\n\
         Shift+F5 exports a local bug report with the current village state.",
    ),
    (
        "Keyboard & camera",
        "WASD / Arrow keys · Pan     Shift · Pan faster\n\
         Q / E or right drag · Rotate     Scroll or + / − · Zoom\n\
         Home · Camp     End · River bend     Shift+End · Whole plot     Shift+Home · Reset view\n\
         Space · Pause     1–4 · Speed     Esc · Cancel placement or close a panel\n\
         B · Build     / · Search     R · Rotate the current placement (Shift+R reverses)\n\
         F4 · Terrain tools     F11 · Projects     Shift+G · Grid\n\
         With no project selected, T opens terrain tools and J opens Projects.\n\
         In road planning, Shift-click extends and Z undoes the last stroke.",
    ),
    (
        "Village management",
        "N · Residents     P · Power     U / V · Water\n\
         M / H · Finances, trade and pantry (Tab switches pages)\n\
         F7 · Maintenance     F8 · Events     I / F10 · Stores in Story\n\
         F · Weather forecast     L · Advance time\n\
         Finances and maintenance are available in economy mode.",
    ),
    (
        "Construction and deliveries",
        "In economy mode, a plan reserves materials from stores.\n\
         With auto-buy enabled, missing supplies can be ordered for town pickup.\n\
         Residents collect the orders, haul loads to the site and then build.\n\
         Open F11 to see which stage is pending. Focus a site and press Z to prioritize it.\n\
         X cancels an unstarted plan or queues salvage. A boarded delivery must arrive first.",
    ),
    (
        "Stores and production",
        "F10 shows stock on hand and where goods have been committed.\n\
         Reserved supplies can already belong to a plan, order or batch.\n\
         Select a finished facility and press C to see its available recipes.\n\
         Residents collect ingredients, perform the work and return output to stores.\n\
         If the facility is waiting for power, check its supply with P.",
    ),
    (
        "Growing food",
        "Choose Cultivated field in Build and set its size before placing it.\n\
         [ ] changes width. Shift+[ ] changes depth. R rotates the field.\n\
         Select a field or garden and press K to manage cultivation.\n\
         Plan beds, sow crops and check moisture as they grow.\n\
         Press T on a selected bed to switch irrigation. V shows the village water supply.",
    ),
    (
        "Housing and village finances",
        "Use N and 1–5 to choose a resident. Click an available finished home.\n\
         T assigns the selected home, and Y clears the assignment.\n\
         In economy mode, H shows the village balance and upcoming commitments.\n\
         Tab opens Trade, then Pantry. Check the quote before placing an order.\n\
         Check F7 for upcoming upkeep and F8 for recent village events.",
    ),
];

#[derive(serde::Deserialize)]
struct Chapter {
    title: String,
    description: String,
    tip: String,
    boundary: String,
    facts: Option<Facts>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
enum Facts {
    Crops,
    Compost,
    Grid,
    Food,
}

impl Facts {
    fn text(&self, catalog: &Catalog) -> Vec<String> {
        use crate::{economy_reference, farming::Crop, food};
        match self {
            Self::Crops => Crop::ALL
                .map(|crop| format!("{} · {} favorable growth days", crop.label(), crop.days()))
                .into(),
            Self::Food => Crop::ALL
                .iter()
                .filter_map(|crop| {
                    food::shelf(crop.material()).map(|days| {
                        format!("{} · {days} days before ordinary spoilage", crop.label())
                    })
                })
                .collect(),
            Self::Grid => vec![format!(
                "Grid backup · Up to {} kW · R${:.2}/kWh",
                economy_reference::GRID_CAPACITY,
                economy_reference::GRID_TARIFF_CENTS / 100.0,
            )],
            Self::Compost => {
                let recipe = &catalog.production["compost"];
                vec![format!(
                    "Composting · {} kg residues → {} kg mature compost",
                    recipe.input["scraps"], recipe.output["compost"],
                )]
            }
        }
    }
}

fn chapters() -> &'static [Chapter] {
    static CHAPTERS: std::sync::OnceLock<Vec<Chapter>> = std::sync::OnceLock::new();
    CHAPTERS.get_or_init(|| {
        serde_json::from_str(include_str!("../../data/guide.json")).expect("embedded village guide")
    })
}

#[derive(Clone, Copy)]
enum Screen {
    Quick(usize),
    Index(usize),
    Chapter(usize),
    Diagram(usize),
    Search,
}

#[derive(Default)]
pub(super) struct Guide {
    screen: Option<Screen>,
    query: String,
}

/// Chapters whose title or text contains every word of `query`, title matches first.
fn search_results(query: &str) -> Vec<usize> {
    let words: Vec<String> = query.split_whitespace().map(str::to_lowercase).collect();
    if words.is_empty() {
        return Vec::new();
    }
    let mut results: Vec<(bool, usize)> = chapters()
        .iter()
        .enumerate()
        .filter_map(|(index, chapter)| {
            let title = chapter.title.to_lowercase();
            let body = format!(
                "{title} {} {} {}",
                chapter.description, chapter.tip, chapter.boundary
            )
            .to_lowercase();
            words
                .iter()
                .all(|word| body.contains(word.as_str()))
                .then(|| {
                    (
                        !words.iter().all(|word| title.contains(word.as_str())),
                        index,
                    )
                })
        })
        .collect();
    results.sort();
    results
        .into_iter()
        .map(|(_, index)| index)
        .take(CHAPTER_KEYS.len())
        .collect()
}

const CHAPTER_KEYS: [KeyCode; 9] = [
    KeyCode::Digit1,
    KeyCode::Digit2,
    KeyCode::Digit3,
    KeyCode::Digit4,
    KeyCode::Digit5,
    KeyCode::Digit6,
    KeyCode::Digit7,
    KeyCode::Digit8,
    KeyCode::Digit9,
];

fn index_pages() -> usize {
    chapters().len().div_ceil(CHAPTER_KEYS.len())
}

fn turn_page(page: usize, pages: usize, forward: bool) -> usize {
    (page + if forward { 1 } else { pages - 1 }) % pages
}

#[derive(Component, Clone, Copy)]
enum GuideAction {
    Previous,
    Next,
    SwitchView,
    Index,
    Chapter(usize),
    Diagram,
    Search,
}

impl GuideAction {
    fn apply(self, screen: Screen, query: &str) -> Screen {
        match (self, screen) {
            (Self::Search, _) => Screen::Search,
            (Self::Index, Screen::Search) => Screen::Index(0),
            (Self::Chapter(row), Screen::Search) => search_results(query)
                .get(row)
                .map_or(screen, |&chapter| Screen::Chapter(chapter)),
            (Self::SwitchView, Screen::Quick(_)) => Screen::Index(0),
            (Self::SwitchView, _) => Screen::Quick(0),
            (Self::Index, Screen::Chapter(chapter) | Screen::Diagram(chapter)) => {
                Screen::Index(chapter / CHAPTER_KEYS.len())
            }
            (Self::Diagram, Screen::Chapter(chapter)) => Screen::Diagram(chapter),
            (Self::Diagram, Screen::Diagram(chapter)) => Screen::Chapter(chapter),
            (Self::Chapter(row), Screen::Index(page)) => {
                let chapter = page * CHAPTER_KEYS.len() + row;
                if chapter < chapters().len() {
                    Screen::Chapter(chapter)
                } else {
                    screen
                }
            }
            (Self::Previous | Self::Next, _) => {
                let forward = matches!(self, Self::Next);
                match screen {
                    Screen::Quick(page) => Screen::Quick(turn_page(page, TOPICS.len(), forward)),
                    Screen::Index(page) => Screen::Index(turn_page(page, index_pages(), forward)),
                    Screen::Chapter(page) => {
                        Screen::Chapter(turn_page(page, chapters().len(), forward))
                    }
                    Screen::Diagram(page) => {
                        Screen::Diagram(turn_page(page, chapters().len(), forward))
                    }
                    Screen::Search => screen,
                }
            }
            _ => screen,
        }
    }

    fn label(self, screen: Screen, query: &str) -> Option<&'static str> {
        match (self, screen) {
            (Self::Search, Screen::Search) | (Self::Previous | Self::Next, Screen::Search) => None,
            (Self::Search, _) => Some("Find a topic"),
            (Self::Index, Screen::Search) => Some("Chapter index"),
            (Self::Chapter(row), Screen::Search) => search_results(query)
                .get(row)
                .map(|&chapter| chapters()[chapter].title.as_str()),
            (Self::Previous, _) => Some("Previous"),
            (Self::Next, _) => Some("Next"),
            (Self::SwitchView, Screen::Quick(_)) => Some("Reference"),
            (Self::SwitchView, _) => Some("Quick guide"),
            (Self::Index, Screen::Chapter(_) | Screen::Diagram(_)) => Some("Chapter index"),
            (Self::Diagram, Screen::Chapter(_)) => Some("Show diagram"),
            (Self::Diagram, Screen::Diagram(_)) => Some("Chapter text"),
            (Self::Chapter(row), Screen::Index(page)) => chapters()
                .get(page * CHAPTER_KEYS.len() + row)
                .map(|chapter| chapter.title.as_str()),
            _ => None,
        }
    }
}

#[derive(Component)]
struct GuideNavigation;

#[derive(Component)]
struct GuideDiagram;

pub(super) fn install(app: &mut App) {
    guide_diagrams::install(app);
    app.add_systems(Startup, (spawn_navigation, spawn_diagram))
        .add_systems(
            Update,
            select_navigation
                .after(read_camp_pointer)
                .before(village_input),
        )
        .add_systems(Update, (show_navigation, show_diagram).after(village_input));
}

fn spawn_diagram(mut commands: Commands) {
    commands.spawn((
        GuideDiagram,
        ImageNode::default(),
        Node {
            display: Display::None,
            position_type: PositionType::Absolute,
            left: px(20),
            top: px(108),
            ..default()
        },
        BackgroundColor(Color::srgb_u8(251, 249, 239)),
    ));
}

fn show_diagram(
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    village: Res<Village>,
    window: Single<&Window, With<PrimaryWindow>>,
    (assets, images): (Res<AssetServer>, Res<Assets<Image>>),
    mut diagram: Single<(&mut ImageNode, &mut Node), With<GuideDiagram>>,
) {
    let (image, node) = &mut *diagram;
    let Some(Screen::Diagram(index)) = active_screen(&village, &setup, &saves, &sound) else {
        node.display = Display::None;
        return;
    };
    let Some(handle) = guide_diagrams::load(&assets, &chapters()[index].title) else {
        node.display = Display::None;
        return;
    };
    if image.image != handle {
        image.image = handle;
    }
    let Some(texture) = images.get(&image.image) else {
        node.display = Display::None;
        return;
    };
    let size = texture.size().as_vec2();
    let available = Vec2::new(window.width() - 276.0, window.height() - 188.0);
    let scale = (available / size).min_element().clamp(0.0, 1.0);
    node.width = px(size.x * scale);
    node.height = px(size.y * scale);
    node.display = Display::Flex;
}

fn spawn_navigation(mut commands: Commands, assets: Res<AssetServer>) {
    commands
        .spawn((
            GuideNavigation,
            Interaction::None,
            bevy::ui::FocusPolicy::Block,
            Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                right: px(20),
                top: px(20),
                width: px(236),
                padding: UiRect::all(px(8)),
                row_gap: px(4),
                flex_direction: FlexDirection::Column,
                ..default()
            },
            BackgroundColor(Color::srgb_u8(31, 45, 35)),
        ))
        .with_children(|panel| {
            for action in [
                GuideAction::Search,
                GuideAction::SwitchView,
                GuideAction::Index,
                GuideAction::Diagram,
                GuideAction::Previous,
                GuideAction::Next,
            ]
            .into_iter()
            .chain((0..CHAPTER_KEYS.len()).map(GuideAction::Chapter))
            {
                panel
                    .spawn((
                        action,
                        Button,
                        Node {
                            padding: UiRect::axes(px(10), px(5)),
                            ..default()
                        },
                        BackgroundColor(Color::srgb_u8(58, 78, 61)),
                    ))
                    .with_child((Text::default(), ui_font(&assets, 16.0)));
            }
        });
}

fn active_screen(
    village: &Village,
    setup: &WorldSetup,
    saves: &SaveMenu,
    sound: &SoundSettings,
) -> Option<Screen> {
    if setup.open || saves.open || sound.open {
        return None;
    }
    village.guide.screen
}

fn select_navigation(
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    mut village: ResMut<Village>,
    buttons: Query<(&GuideAction, &Interaction), Changed<Interaction>>,
) {
    if let Some(screen) = active_screen(&village, &setup, &saves, &sound)
        && let Some((action, _)) = buttons.iter().find(|(action, interaction)| {
            **interaction == Interaction::Pressed
                && action.label(screen, &village.guide.query).is_some()
        })
    {
        let next = action.apply(screen, &village.guide.query);
        village.guide.enter(next);
    }
}

fn show_navigation(
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    village: Res<Village>,
    mut panel: Single<&mut Node, (With<GuideNavigation>, Without<GuideAction>)>,
    mut buttons: Query<(
        &GuideAction,
        &Children,
        &Interaction,
        &mut Node,
        &mut BackgroundColor,
    )>,
    mut labels: Query<&mut Text>,
) {
    let Some(screen) = active_screen(&village, &setup, &saves, &sound) else {
        panel.display = Display::None;
        return;
    };
    panel.display = Display::Flex;
    for (action, children, interaction, mut node, mut background) in &mut buttons {
        let Some(label) = action.label(screen, &village.guide.query) else {
            node.display = Display::None;
            continue;
        };
        node.display = Display::Flex;
        background.0 = if *interaction == Interaction::None {
            Color::srgb_u8(58, 78, 61)
        } else {
            Color::srgb_u8(78, 105, 82)
        };
        if let Ok(mut text) = labels.get_mut(children[0])
            && text.0 != label
        {
            text.0 = label.into();
        }
    }
}

impl Guide {
    pub(super) fn open(&self) -> bool {
        self.screen.is_some()
    }

    pub(super) fn open_camera_controls(&mut self) {
        self.screen = Some(Screen::Quick(1));
    }

    pub(super) fn toggle(&mut self) {
        self.screen = if self.open() {
            None
        } else {
            Some(Screen::Quick(0))
        };
    }

    fn enter(&mut self, screen: Screen) {
        if matches!(screen, Screen::Search) && !matches!(self.screen, Some(Screen::Search)) {
            self.query.clear();
        }
        self.screen = Some(screen);
    }

    /// Consume the whole frame when opening, reading or closing the guide.
    pub(super) fn controls(
        &mut self,
        keys: &ButtonInput<KeyCode>,
        text: &mut MessageReader<bevy::input::keyboard::KeyboardInput>,
    ) -> bool {
        if keys.just_pressed(KeyCode::F1) {
            self.toggle();
            text.clear();
            return true;
        }
        let Some(screen) = self.screen else {
            return false;
        };
        if keys.just_pressed(KeyCode::Escape) {
            self.screen = None;
            text.clear();
            return true;
        }
        if matches!(screen, Screen::Search) {
            self.search_controls(keys, text);
            return true;
        }
        text.clear();
        let action = if keys.just_pressed(KeyCode::Slash) {
            Some(GuideAction::Search)
        } else if keys.just_pressed(KeyCode::Tab) {
            Some(GuideAction::SwitchView)
        } else if keys.just_pressed(KeyCode::Backspace) {
            Some(GuideAction::Index)
        } else if keys.just_pressed(KeyCode::KeyD) {
            Some(GuideAction::Diagram)
        } else if keys.just_pressed(KeyCode::PageDown) {
            Some(GuideAction::Next)
        } else if keys.just_pressed(KeyCode::PageUp) {
            Some(GuideAction::Previous)
        } else {
            CHAPTER_KEYS
                .iter()
                .position(|key| keys.just_pressed(*key))
                .map(GuideAction::Chapter)
        };
        if let Some(action) = action {
            self.enter(action.apply(screen, &self.query));
        }
        true
    }

    fn search_controls(
        &mut self,
        keys: &ButtonInput<KeyCode>,
        text: &mut MessageReader<bevy::input::keyboard::KeyboardInput>,
    ) {
        let row = if keys.any_just_pressed([KeyCode::Enter, KeyCode::NumpadEnter]) {
            Some(0)
        } else {
            CHAPTER_KEYS.iter().position(|key| keys.just_pressed(*key))
        };
        if let Some(row) = row {
            text.clear();
            self.enter(GuideAction::Chapter(row).apply(Screen::Search, &self.query));
            return;
        }
        if keys.just_pressed(KeyCode::Tab)
            || keys.just_pressed(KeyCode::Backspace) && self.query.is_empty()
        {
            text.clear();
            self.screen = Some(Screen::Index(0));
            return;
        }
        crate::construction::read_search_text(&mut self.query, text);
        self.query.retain(|character| !character.is_ascii_digit());
    }

    pub(super) fn text(&self, catalog: &Catalog) -> Option<String> {
        use std::fmt::Write;
        Some(match self.screen? {
            Screen::Quick(page) => {
                let (title, body) = TOPICS[page];
                format!(
                    "Village guide · {title} · {}/{}\nPage Up/Down · Tab Reference · F1 Close\n\n{body}",
                    page + 1,
                    TOPICS.len()
                )
            }
            Screen::Index(page) => {
                let mut label = format!(
                    "Village reference · {}/{}\n1–9 Open chapter · / Find · Page Up/Down · Tab Quick guide · F1 Close\n",
                    page + 1,
                    index_pages()
                );
                for (row, chapter) in chapters()
                    .iter()
                    .skip(page * CHAPTER_KEYS.len())
                    .take(CHAPTER_KEYS.len())
                    .enumerate()
                {
                    let _ = write!(label, "\n{} {}", row + 1, chapter.title);
                }
                label
            }
            Screen::Chapter(index) => {
                let chapter = &chapters()[index];
                let mut label = format!(
                    "{} · {}/{}\nPage Up/Down · D Diagram · Backspace Index · F1 Close",
                    chapter.title,
                    index + 1,
                    chapters().len()
                );
                for paragraph in [&chapter.description, &chapter.tip, &chapter.boundary] {
                    if !paragraph.is_empty() {
                        label.push('\n');
                        let mut width = 0;
                        for word in paragraph.split_whitespace() {
                            let length = word.chars().count();
                            if width == 0 || width + 1 + length > 78 {
                                label.push('\n');
                                width = length;
                            } else {
                                label.push(' ');
                                width += length + 1;
                            }
                            label.push_str(word);
                        }
                    }
                }
                if let Some(facts) = &chapter.facts {
                    let _ = write!(label, "\n\n{}", facts.text(catalog).join("\n"));
                }
                label
            }
            Screen::Search => {
                let results = search_results(&self.query);
                let mut label = format!(
                    "Find a topic · {}_\nType to search · 1–9 or Enter Open · Tab Index · Esc Close\n",
                    self.query
                );
                if self.query.trim().is_empty() {
                    label.push_str("\nType a word such as water, compost or grid.");
                } else if results.is_empty() {
                    label.push_str("\nNo chapter mentions that yet.");
                }
                for (row, chapter) in results.iter().enumerate() {
                    let _ = write!(label, "\n{} {}", row + 1, chapters()[*chapter].title);
                }
                label
            }
            Screen::Diagram(index) => format!(
                "{} · {}/{}\nPage Up/Down · D Chapter text · Backspace Index · F1 Close",
                chapters()[index].title,
                index + 1,
                chapters().len()
            ),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bevy::input::{
        ButtonState,
        keyboard::{Key, KeyboardInput},
    };

    /// Runs one frame of guide controls with `typed` delivered as keyboard text.
    fn guide_controls(guide: &mut Guide, keys: &ButtonInput<KeyCode>, typed: &[&str]) -> bool {
        let mut world = World::new();
        world.init_resource::<Messages<KeyboardInput>>();
        for text in typed {
            world.write_message(KeyboardInput {
                key_code: KeyCode::KeyA,
                logical_key: Key::Character((*text).into()),
                state: ButtonState::Pressed,
                text: Some((*text).into()),
                repeat: false,
                window: Entity::PLACEHOLDER,
            });
        }
        let mut state =
            bevy::ecs::system::SystemState::<MessageReader<KeyboardInput>>::new(&mut world);
        let mut reader = state.get_mut(&mut world);
        guide.controls(keys, &mut reader)
    }

    #[test]
    fn slash_finds_a_chapter_by_what_it_explains() {
        let mut guide = Guide::default();
        let mut keys = ButtonInput::default();
        keys.press(KeyCode::F1);
        guide_controls(&mut guide, &keys, &[]);
        keys.reset_all();
        keys.press(KeyCode::Slash);
        guide_controls(&mut guide, &keys, &["/"]);
        keys.reset_all();
        assert!(matches!(guide.screen, Some(Screen::Search)));
        assert_eq!(guide.query, "");
        guide_controls(&mut guide, &keys, &["s", "a", "n", "i", "t"]);
        let results = search_results(&guide.query);
        assert!(!results.is_empty());
        assert!(chapters()[results[0]].title.starts_with("Sanitation"));
        keys.press(KeyCode::Enter);
        guide_controls(&mut guide, &keys, &[]);
        assert!(matches!(guide.screen, Some(Screen::Chapter(chapter)) if chapter == results[0]));
        keys.reset_all();
        keys.press(KeyCode::Escape);
        guide_controls(&mut guide, &keys, &[]);
        assert!(!guide.open());
    }

    #[test]
    fn native_reference_can_open_the_last_chapter_and_return_to_its_index() {
        let mut guide = Guide::default();
        let mut keys = ButtonInput::default();
        for key in [KeyCode::F1, KeyCode::Tab, KeyCode::PageUp, KeyCode::Digit9] {
            keys.press(key);
            assert!(guide_controls(&mut guide, &keys, &[]));
            keys.reset_all();
        }
        assert!(
            guide
                .text(&Catalog::default())
                .unwrap()
                .starts_with("Inspecting village conditions")
        );
        keys.press(KeyCode::Backspace);
        assert!(guide_controls(&mut guide, &keys, &[]));
        assert!(
            guide
                .text(&Catalog::default())
                .unwrap()
                .starts_with("Village reference · 3/3")
        );
    }
}
