use super::{WorkshopCatalog, garden::Prop};
use bevy::prelude::IVec2;
use std::collections::HashMap;

#[derive(Clone, Copy)]
pub(super) struct Connection {
    pub count: usize,
    pub area: i32,
    pub leader: bool,
}

struct Section<'a> {
    prop: &'a Prop,
    min: IVec2,
    max: IVec2,
}

impl Section<'_> {
    fn overlap(&self, other: &Self) -> IVec2 {
        self.max.min(other.max) - self.min.max(other.min)
    }
}

pub(super) fn connections(props: &[Prop], models: &WorkshopCatalog) -> HashMap<String, Connection> {
    let mut joined = HashMap::new();
    for asset in ["garden", "orchard", "solar_farm"] {
        let sections: Vec<_> = props
            .iter()
            .filter(|prop| prop.asset == asset)
            .map(|prop| {
                let min = IVec2::new(prop.column, prop.row);
                let [width, depth] = prop.size(models);
                Section {
                    prop,
                    min,
                    max: min + IVec2::new(width, depth),
                }
            })
            .collect();
        let mut visited = vec![false; sections.len()];
        for (i, section) in sections.iter().enumerate() {
            for (j, other) in sections.iter().enumerate().skip(i + 1) {
                if section.overlap(other).min_element() > 0 {
                    visited[i] = true;
                    visited[j] = true;
                }
            }
        }
        for start in 0..sections.len() {
            if visited[start] {
                continue;
            }
            visited[start] = true;
            let mut group = vec![start];
            let mut cursor = 0;
            while let Some(&index) = group.get(cursor) {
                for (other, candidate) in sections.iter().enumerate() {
                    let overlap = sections[index].overlap(candidate);
                    if !visited[other] && overlap.min_element() == 0 && overlap.max_element() > 0 {
                        visited[other] = true;
                        group.push(other);
                    }
                }
                cursor += 1;
            }
            if group.len() < 2 {
                continue;
            }
            let leader = *group
                .iter()
                .min_by_key(|&&i| {
                    let prop = sections[i].prop;
                    (prop.row, prop.column, &prop.id)
                })
                .expect("connected group contains a section");
            let count = group.len();
            let area = group
                .iter()
                .map(|&i| {
                    let size = sections[i].max - sections[i].min;
                    size.x * size.y
                })
                .sum();
            for index in group {
                joined.insert(
                    sections[index].prop.id.clone(),
                    Connection {
                        count,
                        area,
                        leader: index == leader,
                    },
                );
            }
        }
    }
    joined
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overlaps_stay_independent_and_edge_groups_share_one_leader() {
        let catalog = WorkshopCatalog::default();
        let prop = |id: &str, column, row| Prop {
            id: id.into(),
            asset: "orchard".into(),
            column,
            row,
            rotation: 90,
        };
        let a = prop("a", 0, 0);
        let [width, depth] = a.size(&catalog);
        let b = prop("b", width, 1);
        let corner = prop("corner", 2 * width, depth + 1);
        let group = connections(&[corner, b.clone(), a.clone()], &catalog);
        assert_eq!(group.len(), 2);
        assert_eq!(group["a"].area, width * depth * 2);
        assert_eq!(group["a"].count, 2);
        assert!(group["a"].leader);
        assert!(!group["b"].leader);
        assert!(connections(&[a, b, prop("overlap", 1, 0)], &catalog).is_empty());
    }
}
