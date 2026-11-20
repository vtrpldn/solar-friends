//! Small wording helpers for text the player reads.

/// "1 town pickup" or "3 town pickups", instead of "town pickup(s)".
pub fn counted(count: impl Into<u64>, one: &str, many: &str) -> String {
    let count = count.into();
    format!("{count} {}", if count == 1 { one } else { many })
}

#[cfg(test)]
mod tests {
    use super::counted;

    #[test]
    fn counts_pick_the_right_word() {
        assert_eq!(counted(1u32, "road tile", "road tiles"), "1 road tile");
        assert_eq!(counted(3u32, "road tile", "road tiles"), "3 road tiles");
        assert_eq!(counted(0u32, "load", "loads"), "0 loads");
    }
}
