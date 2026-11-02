fn main() {
    let schema = braian_config::schema();
    println!(
        "{}",
        serde_json::to_string_pretty(&schema).expect("schema serializes")
    );
}
