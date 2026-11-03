//! The YAML examples in the config-as-code guide must parse and match the
//! committed schema.

fn yaml_blocks(markdown: &str) -> Vec<String> {
    let mut blocks = Vec::new();
    let mut current: Option<String> = None;
    for line in markdown.lines() {
        if let Some(block) = current.as_mut() {
            if line.trim() == "```" {
                blocks.push(std::mem::take(block));
                current = None;
            } else {
                if !block.is_empty() {
                    block.push('\n');
                }
                block.push_str(line);
            }
        } else if line.trim() == "```yaml" {
            current = Some(String::new());
        }
    }
    assert!(current.is_none(), "unclosed yaml fence in docs/config.md");
    blocks
}

#[test]
fn every_yaml_example_matches_the_config_schema() {
    let markdown = include_str!("../../../docs/config.md");
    let schema: serde_json::Value = serde_json::from_str(include_str!(
        "../../../schemas/config/braian.io-v1.schema.json"
    ))
    .expect("schema parses");
    let validator = jsonschema::validator_for(&schema).expect("valid schema");

    let blocks = yaml_blocks(markdown);
    assert!(!blocks.is_empty(), "docs/config.md has no yaml examples");
    for (index, block) in blocks.iter().enumerate() {
        let document: serde_json::Value = serde_norway::from_str(block)
            .unwrap_or_else(|error| panic!("yaml block {index} does not parse: {error}"));
        assert!(
            validator.is_valid(&document),
            "yaml block {index} does not match the schema: {document}"
        );
    }
}
