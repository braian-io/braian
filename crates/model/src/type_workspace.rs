//! Canonical object-type workspace share tokens (matches the web client).

const TYPE_SHARE_PREFIX: &str = "braian-type-";

/// Stable share token for the auto-created workspace of an object type key.
pub fn type_share_token(key: &str) -> String {
    let slug: String = key
        .trim()
        .to_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect();
    let slug = slug.trim_matches('-');
    if slug.is_empty() {
        format!("{TYPE_SHARE_PREFIX}type")
    } else {
        format!("{TYPE_SHARE_PREFIX}{slug}")
    }
}

#[cfg(test)]
mod tests {
    use super::type_share_token;

    #[test]
    fn slug_matches_the_web_client() {
        assert_eq!(type_share_token("product"), "braian-type-product");
        assert_eq!(type_share_token("kind_123"), "braian-type-kind-123");
        assert_eq!(type_share_token("  Recipe  "), "braian-type-recipe");
    }
}
