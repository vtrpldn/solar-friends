use std::collections::VecDeque;

use crate::weather::HOUR;

type Resources = [f64; 4];

#[derive(Default)]
pub(super) struct ResourceTrends {
    session: u64,
    history: VecDeque<(f64, Resources)>,
}

impl ResourceTrends {
    pub(super) fn sample(
        &mut self,
        session: u64,
        clock: f64,
        values: Resources,
    ) -> Option<Resources> {
        if self.session != session || self.history.back().is_some_and(|(last, _)| *last > clock) {
            self.session = session;
            self.history.clear();
        }
        if self
            .history
            .back()
            .is_none_or(|(last, _)| clock - last >= HOUR / 60.0)
        {
            self.history.push_back((clock, values));
        }
        let cutoff = clock - HOUR;
        while self.history.get(1).is_some_and(|(time, _)| *time <= cutoff) {
            self.history.pop_front();
        }
        let &(first_time, first) = self.history.front()?;
        let start = first_time.max(cutoff);
        let elapsed = clock - start;
        if elapsed < HOUR / 12.0 {
            return None;
        }
        let (second_time, second) = self.history.get(1).copied().unwrap_or((clock, values));
        let fraction = if first_time < start {
            (start - first_time) / (second_time - first_time)
        } else {
            0.0
        };
        Some(std::array::from_fn(|index| {
            let baseline = first[index] + (second[index] - first[index]) * fraction;
            (values[index] - baseline) * HOUR / elapsed
        }))
    }
}

pub(super) fn hourly_rate(value: Option<f64>, unit: &str) -> String {
    let Some(value) = value else {
        return "—/h".into();
    };
    let rounded = (value * 10.0).round() / 10.0;
    let sign = if rounded > 0.0 {
        "+"
    } else if rounded < 0.0 {
        "−"
    } else {
        ""
    };
    format!("{sign}{unit}{:.1}/h", rounded.abs())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rates_use_the_observed_window_and_reset_when_loading() {
        let mut trends = ResourceTrends::default();
        assert_eq!(trends.sample(1, 0.0, [0.0; 4]), None);
        assert_eq!(trends.sample(1, HOUR * 0.05, [1.0; 4]), None);
        let midway = trends.sample(1, HOUR * 0.5, [10.0; 4]).unwrap();
        assert_eq!(midway, [20.0; 4]);
        let recent = trends.sample(1, HOUR * 1.25, [18.0; 4]).unwrap();
        for rate in recent {
            assert!((rate - 13.0).abs() < 1e-8);
        }
        assert_eq!(trends.sample(2, HOUR * 1.25, [18.0; 4]), None);
        assert_eq!(trends.sample(2, 0.0, [8.0; 4]), None);
    }
}
