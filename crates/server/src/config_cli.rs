//! `braian config export`, `plan` and `apply` against a running API.

use std::collections::BTreeSet;
use std::io::Write;
use std::path::{Path, PathBuf};

use anyhow::Context;
use braian_config::{ConfigDocument, ConfigPlan, PlanAction, PlanAffected, PlanKind, PlanStep};
use clap::{Args, Subcommand, ValueEnum};
use serde::Deserialize;

pub const DEFAULT_URL: &str = "http://127.0.0.1:8090";
pub const EXIT_NO_CHANGES: i32 = 0;
pub const EXIT_CHANGES: i32 = 2;
pub const EXIT_BLOCKED: i32 = 3;

const KIND_ORDER: [PlanKind; 11] = [
    PlanKind::Language,
    PlanKind::Attribute,
    PlanKind::Type,
    PlanKind::Structure,
    PlanKind::Group,
    PlanKind::Class,
    PlanKind::ValueList,
    PlanKind::UnitFamily,
    PlanKind::Catalog,
    PlanKind::MergeProfile,
    PlanKind::Ownership,
];

#[derive(Subcommand)]
pub enum ConfigCommand {
    /// Export config documents from the server.
    Export(ExportArgs),
    /// Plan config documents against the server.
    ///
    /// Exit codes: 0 no changes, 2 changes, 3 blocked destructive steps.
    Plan(PlanArgs),
    /// Apply config documents as one proposal.
    ///
    /// Exit codes: 0 accepted or no changes, 3 blocked destructive steps.
    Apply(ApplyArgs),
}

#[derive(Args)]
pub struct ConnectionArgs {
    /// Server base URL.
    #[arg(long, env = "BRAIAN_URL", default_value = DEFAULT_URL)]
    pub url: String,
    /// API token sent as a Bearer token.
    #[arg(long, env = "BRAIAN_TOKEN")]
    pub token: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, ValueEnum)]
pub enum ExportFormat {
    Yaml,
    Json,
    Zip,
}

impl ExportFormat {
    fn as_str(self) -> &'static str {
        match self {
            Self::Yaml => "yaml",
            Self::Json => "json",
            Self::Zip => "zip",
        }
    }
}

#[derive(Args)]
pub struct ExportArgs {
    /// Document format to write.
    #[arg(long, value_enum, default_value_t = ExportFormat::Yaml)]
    pub format: ExportFormat,
    /// Write to a file instead of stdout. Required for zip.
    #[arg(long)]
    pub out: Option<PathBuf>,
    #[command(flatten)]
    pub connection: ConnectionArgs,
}

#[derive(Args)]
pub struct PlanArgs {
    /// Config files or directories. Directories are read recursively.
    #[arg(required = true)]
    pub paths: Vec<PathBuf>,
    /// Print the raw JSON plan.
    #[arg(long)]
    pub json: bool,
    #[command(flatten)]
    pub connection: ConnectionArgs,
}

#[derive(Args)]
pub struct ApplyArgs {
    /// Config files or directories. Directories are read recursively.
    #[arg(required = true)]
    pub paths: Vec<PathBuf>,
    /// Send allowDestructive in the request body.
    #[arg(long)]
    pub allow_destructive: bool,
    #[command(flatten)]
    pub connection: ConnectionArgs,
}

pub struct ConfigClient {
    base_url: String,
    token: Option<String>,
    http: reqwest::Client,
}

#[derive(Debug)]
pub enum ApplyOutcome {
    Accepted(ApplyAccepted),
    Blocked(ConfigPlan),
    NoChanges,
}

#[derive(Debug, Deserialize)]
pub struct ApplyAccepted {
    #[serde(rename = "proposal_id")]
    pub proposal_id: String,
    #[serde(default)]
    pub groups: serde_json::Value,
}

impl ConfigClient {
    pub fn new(base_url: impl Into<String>, token: Option<String>) -> Self {
        Self {
            base_url: base_url.into(),
            token,
            http: reqwest::Client::new(),
        }
    }

    fn endpoint(&self, path: &str) -> String {
        format!("{}{}", self.base_url.trim_end_matches('/'), path)
    }

    pub async fn export(&self, format: ExportFormat) -> anyhow::Result<Vec<u8>> {
        let mut request = self.http.get(self.endpoint("/v1/config/export"));
        if let Some(token) = &self.token {
            request = request.bearer_auth(token);
        }
        if format != ExportFormat::Yaml {
            request = request.query(&[("format", format.as_str())]);
        }
        let response = request.send().await?;
        if !response.status().is_success() {
            return Err(response_error("config export", response).await);
        }
        Ok(response.bytes().await?.to_vec())
    }

    pub async fn plan(&self, documents: &[ConfigDocument]) -> anyhow::Result<ConfigPlan> {
        let body = serde_json::to_value(documents)?;
        let response = self.post("/v1/config/plan", &body).await?;
        if !response.status().is_success() {
            return Err(response_error("config plan", response).await);
        }
        Ok(response.json().await?)
    }

    pub async fn apply(
        &self,
        documents: &[ConfigDocument],
        allow_destructive: bool,
    ) -> anyhow::Result<ApplyOutcome> {
        let body = apply_body(documents, allow_destructive)?;
        let response = self.post("/v1/config/apply", &body).await?;
        match response.status() {
            reqwest::StatusCode::ACCEPTED => Ok(ApplyOutcome::Accepted(response.json().await?)),
            reqwest::StatusCode::UNPROCESSABLE_ENTITY => {
                let status = response.status();
                let body = response.text().await?;
                let value: serde_json::Value = serde_json::from_str(&body)?;
                if value.get("steps").is_some() {
                    Ok(ApplyOutcome::Blocked(serde_json::from_value(value)?))
                } else {
                    Err(anyhow::anyhow!(
                        "config apply failed with {status}: {}",
                        body.trim()
                    ))
                }
            }
            reqwest::StatusCode::CONFLICT => Ok(ApplyOutcome::NoChanges),
            _ => Err(response_error("config apply", response).await),
        }
    }

    async fn post(
        &self,
        path: &str,
        body: &serde_json::Value,
    ) -> anyhow::Result<reqwest::Response> {
        let mut request = self.http.post(self.endpoint(path)).json(body);
        if let Some(token) = &self.token {
            request = request.bearer_auth(token);
        }
        Ok(request.send().await?)
    }
}

async fn response_error(action: &str, response: reqwest::Response) -> anyhow::Error {
    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return anyhow::anyhow!("unauthorized: set --token or BRAIAN_TOKEN to a valid API token");
    }
    let body = response.text().await.unwrap_or_default();
    anyhow::anyhow!("{action} failed with {status}: {}", body.trim())
}

pub fn apply_body(
    documents: &[ConfigDocument],
    allow_destructive: bool,
) -> anyhow::Result<serde_json::Value> {
    if allow_destructive {
        Ok(serde_json::json!({
            "documents": documents,
            "allowDestructive": true
        }))
    } else {
        Ok(serde_json::to_value(documents)?)
    }
}

pub fn collect_files(paths: &[PathBuf]) -> anyhow::Result<Vec<PathBuf>> {
    let mut files = BTreeSet::new();
    for path in paths {
        collect_path(path, &mut files)?;
    }
    Ok(files.into_iter().collect())
}

fn collect_path(path: &Path, files: &mut BTreeSet<PathBuf>) -> anyhow::Result<()> {
    let metadata =
        std::fs::metadata(path).with_context(|| format!("cannot read {}", path.display()))?;
    if metadata.is_dir() {
        let mut entries = std::fs::read_dir(path)
            .with_context(|| format!("cannot read {}", path.display()))?
            .map(|entry| entry.map(|entry| entry.path()))
            .collect::<Result<Vec<_>, _>>()?;
        entries.sort();
        for entry in entries {
            collect_path(&entry, files)?;
        }
    } else if is_config_file(path) {
        files.insert(path.to_path_buf());
    }
    Ok(())
}

fn is_config_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .is_some_and(|extension| matches!(extension.as_str(), "yaml" | "yml" | "json"))
}

pub fn load_documents(paths: &[PathBuf]) -> anyhow::Result<Vec<ConfigDocument>> {
    let files = collect_files(paths)?;
    if files.is_empty() {
        anyhow::bail!("no config files found in the given paths");
    }
    let mut documents = Vec::new();
    for path in files {
        documents.extend(parse_file(&path)?);
    }
    Ok(documents)
}

fn parse_file(path: &Path) -> anyhow::Result<Vec<ConfigDocument>> {
    let bytes = std::fs::read(path).with_context(|| format!("read {}", path.display()))?;
    let documents = match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("json") => {
            let value: serde_json::Value = serde_json::from_slice(&bytes)
                .with_context(|| format!("parse JSON {}", path.display()))?;
            if value.is_array() {
                serde_json::from_value(value)
            } else {
                serde_json::from_value(value).map(|document| vec![document])
            }
            .with_context(|| format!("parse config {}", path.display()))?
        }
        Some("yaml" | "yml") => serde_norway::Deserializer::from_slice(&bytes)
            .map(ConfigDocument::deserialize)
            .collect::<Result<Vec<_>, _>>()
            .with_context(|| format!("parse YAML {}", path.display()))?,
        _ => anyhow::bail!("unsupported config file {}", path.display()),
    };
    Ok(documents)
}

pub async fn run(command: ConfigCommand) -> anyhow::Result<i32> {
    match command {
        ConfigCommand::Export(args) => {
            export(args).await?;
            Ok(EXIT_NO_CHANGES)
        }
        ConfigCommand::Plan(args) => plan(args).await,
        ConfigCommand::Apply(args) => apply(args).await,
    }
}

async fn export(args: ExportArgs) -> anyhow::Result<()> {
    if args.format == ExportFormat::Zip && args.out.is_none() {
        anyhow::bail!("--out is required when --format zip");
    }
    let client = ConfigClient::new(&args.connection.url, args.connection.token.clone());
    let bytes = client.export(args.format).await?;
    match args.out {
        Some(path) => {
            if let Some(parent) = path.parent()
                && !parent.as_os_str().is_empty()
            {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&path, bytes).with_context(|| format!("write {}", path.display()))?;
        }
        None => {
            let mut stdout = std::io::stdout().lock();
            stdout.write_all(&bytes)?;
        }
    }
    Ok(())
}

async fn plan(args: PlanArgs) -> anyhow::Result<i32> {
    let documents = load_documents(&args.paths)?;
    let client = ConfigClient::new(&args.connection.url, args.connection.token.clone());
    let plan = client.plan(&documents).await?;
    if args.json {
        println!("{}", serde_json::to_string_pretty(&plan)?);
    } else {
        print!("{}", format_plan(&plan));
    }
    Ok(plan_exit_code(&plan))
}

async fn apply(args: ApplyArgs) -> anyhow::Result<i32> {
    let documents = load_documents(&args.paths)?;
    let client = ConfigClient::new(&args.connection.url, args.connection.token.clone());
    match client.apply(&documents, args.allow_destructive).await? {
        ApplyOutcome::Accepted(accepted) => {
            println!("proposal: {}", accepted.proposal_id);
            print!("{}", format_apply_groups(&accepted.groups));
            Ok(EXIT_NO_CHANGES)
        }
        ApplyOutcome::Blocked(plan) => {
            print!("{}", format_plan(&plan));
            eprintln!("apply blocked: destructive steps require --allow-destructive");
            Ok(EXIT_BLOCKED)
        }
        ApplyOutcome::NoChanges => {
            println!("No changes.");
            Ok(EXIT_NO_CHANGES)
        }
    }
}

pub fn plan_exit_code(plan: &ConfigPlan) -> i32 {
    if plan.steps.iter().any(|step| step.blocked) {
        EXIT_BLOCKED
    } else if plan.steps.is_empty() {
        EXIT_NO_CHANGES
    } else {
        EXIT_CHANGES
    }
}

pub fn format_plan(plan: &ConfigPlan) -> String {
    if plan.steps.is_empty() {
        return "No changes.\n".to_owned();
    }
    let mut output = String::new();
    for kind in KIND_ORDER {
        let steps: Vec<&PlanStep> = plan.steps.iter().filter(|step| step.kind == kind).collect();
        if steps.is_empty() {
            continue;
        }
        output.push_str(kind_label(kind));
        output.push('\n');
        for step in steps {
            output.push_str(&format_step(step));
        }
    }
    let blocked: Vec<&PlanStep> = plan.steps.iter().filter(|step| step.blocked).collect();
    if !blocked.is_empty() {
        let total = blocked
            .iter()
            .fold(PlanAffected::default(), |mut total, step| {
                total.objects += step.affected.objects;
                total.values += step.affected.values;
                total.links += step.affected.links;
                total.selections += step.affected.selections;
                total
            });
        let counts = affected_summary(total);
        if counts.is_empty() {
            output.push_str("BLOCKED: destructive steps present\n");
        } else {
            output.push_str(&format!("BLOCKED: deletes {counts}\n"));
        }
    }
    output
}

fn format_step(step: &PlanStep) -> String {
    let mut line = match step.action {
        PlanAction::Rename => format!(
            "  > {} -> {}",
            step.renamed_from.as_deref().unwrap_or("?"),
            step.key
        ),
        _ => format!("  {} {}", action_marker(step.action), step.key),
    };
    if step.action == PlanAction::Update && !step.fields.is_empty() {
        line.push_str(&format!(" (fields: {})", step.fields.join(", ")));
    }
    if step.blocked {
        let counts = affected_summary(step.affected);
        if counts.is_empty() {
            line.push_str(" [BLOCKED]");
        } else {
            line.push_str(&format!(" [BLOCKED: {counts}]"));
        }
    }
    line.push('\n');
    line
}

fn action_marker(action: PlanAction) -> char {
    match action {
        PlanAction::Create => '+',
        PlanAction::Update => '~',
        PlanAction::Rename => '>',
        PlanAction::Delete => '-',
    }
}

fn kind_label(kind: PlanKind) -> &'static str {
    match kind {
        PlanKind::Language => "Language",
        PlanKind::Attribute => "Attribute",
        PlanKind::Type => "Type",
        PlanKind::Structure => "Structure",
        PlanKind::Group => "Group",
        PlanKind::Class => "Class",
        PlanKind::ValueList => "ValueList",
        PlanKind::UnitFamily => "UnitFamily",
        PlanKind::Catalog => "Catalog",
        PlanKind::MergeProfile => "MergeProfile",
        PlanKind::Ownership => "Ownership",
    }
}

fn affected_summary(affected: PlanAffected) -> String {
    [
        count(affected.objects, "object", "objects"),
        count(affected.values, "value", "values"),
        count(affected.links, "link", "links"),
        count(affected.selections, "selection", "selections"),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(", ")
}

fn count(value: i64, singular: &str, plural: &str) -> Option<String> {
    match value {
        0 => None,
        1 => Some(format!("1 {singular}")),
        value => Some(format!("{value} {plural}")),
    }
}

pub fn format_apply_groups(groups: &serde_json::Value) -> String {
    let Some(groups) = groups.as_object() else {
        return String::new();
    };
    let mut output = String::new();
    for (name, group) in groups {
        let steps = group["steps"].as_u64().unwrap_or(0);
        if steps == 0 {
            continue;
        }
        let keys = group["keys"]
            .as_array()
            .map(|keys| {
                keys.iter()
                    .filter_map(serde_json::Value::as_str)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let unit = if steps == 1 { "step" } else { "steps" };
        output.push_str(&format!("{name}: {steps} {unit}"));
        if !keys.is_empty() {
            output.push_str(&format!(" ({})", keys.join(", ")));
        }
        output.push('\n');
    }
    output
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn step(
        action: PlanAction,
        kind: PlanKind,
        key: &str,
        destructive: bool,
        blocked: bool,
        affected: PlanAffected,
    ) -> PlanStep {
        PlanStep {
            action,
            kind,
            key: key.to_owned(),
            renamed_from: (action == PlanAction::Rename).then(|| "old".to_owned()),
            fields: Vec::new(),
            destructive,
            blocked,
            affected,
            purge: None,
        }
    }

    #[test]
    fn file_collection_is_recursive_and_deterministic() {
        let root = std::env::temp_dir().join(format!("braian-config-cli-{}", uuid::Uuid::now_v7()));
        std::fs::create_dir_all(root.join("sub")).unwrap();
        std::fs::write(root.join("b.yml"), "kind: Model\n").unwrap();
        std::fs::write(root.join("a.json"), "[]").unwrap();
        std::fs::write(root.join("sub/c.yaml"), "kind: Model\n").unwrap();
        std::fs::write(root.join("notes.txt"), "ignore").unwrap();

        let files = collect_files(std::slice::from_ref(&root)).unwrap();
        let relative: Vec<String> = files
            .iter()
            .map(|path| {
                path.strip_prefix(&root)
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        assert_eq!(relative, ["a.json", "b.yml", "sub/c.yaml"]);

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn plan_summary_marks_every_action_and_blocked_counts() {
        let plan = ConfigPlan {
            steps: vec![
                step(
                    PlanAction::Create,
                    PlanKind::Attribute,
                    "barcode",
                    false,
                    false,
                    PlanAffected::default(),
                ),
                step(
                    PlanAction::Update,
                    PlanKind::Type,
                    "item",
                    false,
                    false,
                    PlanAffected::default(),
                ),
                step(
                    PlanAction::Rename,
                    PlanKind::Structure,
                    "new",
                    false,
                    false,
                    PlanAffected::default(),
                ),
                step(
                    PlanAction::Delete,
                    PlanKind::Attribute,
                    "weight",
                    true,
                    true,
                    PlanAffected {
                        objects: 12,
                        values: 0,
                        links: 3,
                        selections: 0,
                        ..PlanAffected::default()
                    },
                ),
            ],
        };

        let summary = format_plan(&plan);
        assert!(summary.contains("+ barcode"), "{summary}");
        assert!(summary.contains("~ item"), "{summary}");
        assert!(summary.contains("> old -> new"), "{summary}");
        assert!(summary.contains("- weight"), "{summary}");
        assert!(
            summary.contains("BLOCKED: deletes 12 objects, 3 links"),
            "{summary}"
        );
    }

    #[test]
    fn plan_summary_includes_the_new_config_kinds() {
        let plan = ConfigPlan {
            steps: vec![
                step(
                    PlanAction::Create,
                    PlanKind::Catalog,
                    "sap",
                    false,
                    false,
                    PlanAffected::default(),
                ),
                step(
                    PlanAction::Update,
                    PlanKind::MergeProfile,
                    "sap-brand",
                    false,
                    false,
                    PlanAffected::default(),
                ),
                step(
                    PlanAction::Delete,
                    PlanKind::Ownership,
                    "ownership",
                    true,
                    true,
                    PlanAffected::default(),
                ),
            ],
        };

        let summary = format_plan(&plan);
        assert!(summary.contains("Catalog\n  + sap"), "{summary}");
        assert!(summary.contains("MergeProfile\n  ~ sap-brand"), "{summary}");
        assert!(
            summary.contains("Ownership\n  - ownership [BLOCKED]"),
            "{summary}"
        );
    }

    #[test]
    fn exit_codes_follow_changes_and_blocked_steps() {
        assert_eq!(plan_exit_code(&ConfigPlan::default()), EXIT_NO_CHANGES);
        let changes = ConfigPlan {
            steps: vec![step(
                PlanAction::Create,
                PlanKind::Attribute,
                "barcode",
                false,
                false,
                PlanAffected::default(),
            )],
        };
        assert_eq!(plan_exit_code(&changes), EXIT_CHANGES);
        let blocked = ConfigPlan {
            steps: vec![step(
                PlanAction::Delete,
                PlanKind::Attribute,
                "weight",
                true,
                true,
                PlanAffected::default(),
            )],
        };
        assert_eq!(plan_exit_code(&blocked), EXIT_BLOCKED);
    }

    #[test]
    fn allow_destructive_is_only_in_the_body_when_set() {
        let document: ConfigDocument = serde_json::from_value(json!({
            "apiVersion": "braian.io/v1",
            "kind": "Model"
        }))
        .unwrap();

        let plain = apply_body(std::slice::from_ref(&document), false).unwrap();
        assert!(plain.is_array());
        assert!(plain.get("allowDestructive").is_none());

        let allowed = apply_body(&[document], true).unwrap();
        assert_eq!(allowed["allowDestructive"], true);
        assert!(allowed["documents"].is_array());
    }
}
