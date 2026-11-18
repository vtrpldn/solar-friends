use serde::{Deserialize, Serialize};

use super::{Health, Need};
use crate::catalog::Profile;

#[derive(Default, Deserialize, Serialize)]
pub struct Mind {
    pub memories: Vec<Memory>,
    pub quiet_until: f64,
    pub fulfilled: bool,
}

#[derive(Deserialize, Serialize)]
pub struct Memory {
    pub kind: MemoryKind,
    pub text: String,
    pub time: f64,
    pub partner: Option<usize>,
}

#[derive(Deserialize, PartialEq, Serialize)]
pub enum MemoryKind {
    Conversation,
    Personal,
    Milestone,
}

#[derive(Clone, Deserialize, Serialize)]
pub enum Conversation {
    Support { resident: usize, reason: String },
    Interest { topic: String },
    CatchUp,
}

impl Mind {
    pub fn remember(&mut self, kind: MemoryKind, text: String, time: f64, partner: Option<usize>) {
        self.memories.insert(
            0,
            Memory {
                kind,
                text,
                time,
                partner,
            },
        );
        self.memories.truncate(6);
    }

    pub fn valid(&self) -> bool {
        self.quiet_until.is_finite()
            && self.quiet_until >= 0.0
            && self.memories.len() <= 6
            && self.memories.iter().all(|memory| {
                memory.time.is_finite()
                    && memory.time >= 0.0
                    && (1..=300).contains(&memory.text.chars().count())
                    && memory.partner.is_none_or(|id| id < 5)
            })
    }
}

impl Conversation {
    pub fn topic(&self) -> &str {
        match self {
            Self::Support { .. } => "how things are going",
            Self::Interest { topic } => topic,
            Self::CatchUp => "life in the village",
        }
    }

    pub fn valid(&self) -> bool {
        match self {
            Self::Support { resident, reason } => {
                *resident < 5 && (1..=160).contains(&reason.chars().count())
            }
            Self::Interest { topic } => (1..=100).contains(&topic.chars().count()),
            Self::CatchUp => true,
        }
    }

    pub fn interest(key: &str) -> Self {
        Self::Interest {
            topic: match key {
                "growing" => "growing food",
                "food" => "food and cooking",
                "nature" => "the land around them",
                "making" => "making and repairing things",
                "books" => "books",
                "home" => "making a home",
                "stories" => "stories from before the village",
                "community" => "life together",
                _ => "something they have learned",
            }
            .into(),
        }
    }

    pub fn finish(
        &self,
        health: &mut Health,
        profile: &Profile,
        resident: usize,
        other: (usize, &str),
        clock: f64,
    ) {
        let (id, name) = other;
        let (gain, text) = match self {
            Self::Support {
                resident: worried,
                reason,
            } if *worried == resident => (8, format!("{name} listened when I said, “{reason}”")),
            Self::Support { .. } => (
                4,
                format!("I listened to {name} talk about how things are going."),
            ),
            Self::Interest { .. } => (
                7,
                format!("I enjoyed talking with {name} about {}.", self.topic()),
            ),
            Self::CatchUp => (
                4,
                format!("I enjoyed talking with {name} about {}.", self.topic()),
            ),
        };
        health.levels[Need::Social as usize] = 95.0;
        health.levels[Need::Fun as usize] = (health.levels[Need::Fun as usize] + 15.0).min(100.0);
        health.friendships[id] = (health.friendships[id] + gain).min(100);
        health.mind.quiet_until = clock + 100.0 - profile.temperament.accepts_at;
        health
            .mind
            .remember(MemoryKind::Conversation, text, clock, Some(id));
    }
}
