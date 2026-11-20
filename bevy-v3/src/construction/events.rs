use super::*;

const PAGE_SIZE: usize = 8;

#[derive(Default, Deserialize, Serialize)]
pub(super) struct VillageEvents(VecDeque<Event>);

#[derive(Deserialize, Serialize)]
struct Event {
    clock: f64,
    text: String,
    count: u32,
}

impl Event {
    fn timestamp(&self) -> String {
        let minute = (540.0 + self.clock * 0.45).floor() as u64;
        format!(
            "Day {} · {:02}:{:02}",
            minute / 1440 + 1,
            minute / 60 % 24,
            minute % 60,
        )
    }
}

impl VillageEvents {
    pub(super) fn record(&mut self, clock: f64, text: String) {
        if let Some(previous) = self.0.front_mut()
            && previous.text == text
        {
            previous.count = previous.count.saturating_add(1);
            previous.clock = clock;
        } else {
            self.0.push_front(Event {
                clock,
                text,
                count: 1,
            });
            self.0.truncate(48);
        }
    }

    pub(super) fn valid(&self) -> bool {
        self.0.len() <= 48
            && self.0.iter().all(|event| {
                event.clock.is_finite()
                    && event.clock >= 0.0
                    && event.count > 0
                    && (1..=512).contains(&event.text.chars().count())
            })
    }
}

impl Construction {
    pub(crate) fn latest_event(&self) -> Option<&str> {
        self.events.0.front().map(|event| event.text.as_str())
    }

    pub fn record_event(&mut self, clock: f64, text: String) {
        self.events.record(clock, text);
    }

    pub(crate) fn event_pages(&self) -> usize {
        self.events.0.len().div_ceil(PAGE_SIZE).max(1)
    }

    pub(crate) fn event_page_rows(&self, page: usize) -> impl Iterator<Item = (String, &str)> {
        let page = page.min(self.event_pages() - 1);
        self.events
            .0
            .iter()
            .skip(page * PAGE_SIZE)
            .take(PAGE_SIZE)
            .map(|event| {
                let mut caption = event.timestamp();
                if event.count > 1 {
                    use std::fmt::Write;
                    let _ = write!(caption, " · ×{}", event.count);
                }
                (caption, event.text.as_str())
            })
    }

    pub fn event_log(&self, page: usize, controls: &str) -> (usize, String) {
        let pages = self.event_pages();
        let page = page.min(pages - 1);
        let mut text = format!(
            "Village events · {}/{} · Page Up/Down · {controls}",
            page + 1,
            pages
        );
        self.append_recent_events(&mut text, page * PAGE_SIZE, PAGE_SIZE);
        (pages, text)
    }

    pub(crate) fn append_recent_events(&self, text: &mut String, start: usize, limit: usize) {
        use std::fmt::Write;
        if self.events.0.is_empty() {
            text.push_str("\nNo village events recorded.");
        }
        for event in self.events.0.iter().skip(start).take(limit) {
            let _ = write!(text, "\n{} · {}", event.timestamp(), event.text);
            if event.count > 1 {
                let _ = write!(text, " ×{}", event.count);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn consecutive_events_stack_and_the_log_retains_only_recent_entries() {
        let mut construction = Construction::default();
        for number in 0..50 {
            construction.record_event(f64::from(number), format!("Arrival {number}"));
        }
        construction.record_event(60.0, "Arrival 49".into());
        let save = serde_json::to_string(&construction).unwrap();
        let restored: Construction = serde_json::from_str(&save).unwrap();
        let (pages, newest) = restored.event_log(0, "F8 Close");
        assert_eq!(pages, 6);
        assert!(newest.contains("Arrival 49 ×2"));
        assert!(!restored.event_log(5, "F8 Close").1.contains("Arrival 0"));
        let (caption, newest) = restored.event_page_rows(0).next().unwrap();
        assert_eq!(newest, "Arrival 49");
        assert!(caption.ends_with("×2"));
        assert!(
            restored
                .event_page_rows(5)
                .all(|(_, text)| text != "Arrival 0")
        );
        assert!(restored.events.valid());
    }
}
