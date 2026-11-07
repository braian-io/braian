//! One review shape for a person's unsaved changes, an agent draft, and an import.
//!
//! Nothing here writes. The proposal, import, and model-draft tables stay the
//! storage. Callers project those rows into [`ReviewDraft`] and ask
//! [`authorize_review`] before Save or Discard. An agent cannot take either
//! action, including when it calls through a person's token.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

/// Where a draft was filed. The stored `source` string is kept separately.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DraftOrigin {
    /// A person, including a config apply filed as a model proposal.
    Person,
    /// An agent run, or a proposal stored with source `agent`.
    Agent,
    /// A data import. Rows live on the import session.
    Import,
    /// A rollback proposal.
    Rollback,
}

/// Open, or already saved or discarded.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DraftStatus {
    Open,
    Saved,
    Discarded,
}

/// Which table the draft is a projection of.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewKind {
    /// Header in `proposals`. Object and model rows are `proposal_rows`.
    /// Import rows stay in `import_rows`.
    Proposal,
    /// One person's unsaved model steps in `model_drafts`.
    ModelDraft,
}

/// Identity of one draft row. Import and model steps have no proposal-row id.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ReviewRowId {
    Proposal { id: Uuid },
    Import { session_id: Uuid, row_no: i32 },
    ModelStep { user_id: Uuid, index: i32 },
}

/// What the row would change. The patch is the stored write payload.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ReviewTarget {
    Object {
        id: Option<Uuid>,
        key: Option<String>,
        type_key: Option<String>,
    },
    Model,
    Import {
        session_id: Uuid,
        row_no: i32,
        object_id: Option<Uuid>,
        object_key: Option<String>,
    },
}

/// Save / discard vocabulary for a row. `stored_status` keeps the table's word.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RowDecision {
    Pending,
    Saved,
    Discarded,
    /// Failed, unchanged, stale, or any status that is not a save or a discard.
    Blocked,
}

/// One line of a draft. `patch` and `base_version` are the stored diff inputs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReviewRow {
    pub id: ReviewRowId,
    pub position: i32,
    pub target: ReviewTarget,
    pub base_version: Option<i64>,
    pub patch: Value,
    /// Import preview cells. Absent for proposal and model-draft rows.
    pub cells: Option<Value>,
    pub stored_status: String,
    pub decision: RowDecision,
    pub conflict: bool,
}

/// A draft a person can save or discard, from any source.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReviewDraft {
    pub id: Uuid,
    pub kind: ReviewKind,
    pub title: String,
    pub origin: DraftOrigin,
    /// Stored provenance: `user`, `agent`, `import`, or `rollback`.
    pub source: String,
    pub actor: Uuid,
    pub on_behalf_of: Option<Uuid>,
    pub agent_run_id: Option<Uuid>,
    pub session_id: Option<Uuid>,
    pub status: DraftStatus,
    pub conflict: bool,
    pub stale: bool,
    pub stale_reason: Option<String>,
    /// Model revision the draft was filed against, when that was recorded.
    pub base_revision: Option<u64>,
    pub rows: Vec<ReviewRow>,
}

/// Who is asking to save or discard.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ReviewActor {
    pub kind: ReviewPrincipal,
    /// The in-app agent is calling with a person's token.
    pub via_agent: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReviewPrincipal {
    Human,
    Agent,
    Integration,
}

/// The only review decisions. There is no separate approve or reject.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReviewAction {
    Save,
    Discard,
}

/// Facts the authorization check needs. Row versions stay on [`ReviewRow`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReviewGate {
    pub status: DraftStatus,
    pub stale: bool,
    pub stale_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReviewRefusal {
    /// An agent, an integration, or a person acting through the in-app agent.
    AgentMayNotDecide,
    Stale {
        reason: String,
    },
    NotOpen,
}

const STALE_FALLBACK: &str = "the object changed after this proposal was filed";

/// Save and Discard are a person's acts. A stale open draft can be discarded.
///
/// Stale is reported before [`ReviewRefusal::NotOpen`], matching the accept
/// path: a stale proposal that is no longer open still says it is stale.
pub fn authorize_review(
    actor: ReviewActor,
    action: ReviewAction,
    gate: Option<&ReviewGate>,
) -> Result<(), ReviewRefusal> {
    if actor.via_agent || actor.kind != ReviewPrincipal::Human {
        return Err(ReviewRefusal::AgentMayNotDecide);
    }
    let Some(gate) = gate else {
        return Ok(());
    };
    if action == ReviewAction::Save && gate.stale {
        return Err(ReviewRefusal::Stale {
            reason: gate
                .stale_reason
                .clone()
                .filter(|reason| !reason.is_empty())
                .unwrap_or_else(|| STALE_FALLBACK.to_owned()),
        });
    }
    if gate.status != DraftStatus::Open {
        return Err(ReviewRefusal::NotOpen);
    }
    Ok(())
}

/// The object's version is no longer the version this row was filed against.
///
/// The write path reports a lower base as a conflict and a higher base as a
/// base that is ahead. Both block the write. This does not replace that check.
pub fn base_version_differs(base: i64, current: i64) -> bool {
    base != current
}

pub fn draft_origin(
    source: &str,
    session_id: Option<Uuid>,
    agent_run_id: Option<Uuid>,
) -> DraftOrigin {
    if session_id.is_some() || source == "import" {
        DraftOrigin::Import
    } else if source == "rollback" {
        DraftOrigin::Rollback
    } else if source == "agent" || agent_run_id.is_some() {
        DraftOrigin::Agent
    } else {
        DraftOrigin::Person
    }
}

pub fn draft_status(stored: &str) -> Result<DraftStatus, String> {
    match stored {
        "open" => Ok(DraftStatus::Open),
        "accepted" => Ok(DraftStatus::Saved),
        "discarded" => Ok(DraftStatus::Discarded),
        other => Err(format!("unknown proposal status {other}")),
    }
}

pub fn row_decision(stored_status: &str) -> RowDecision {
    match stored_status {
        "pending" | "new" | "changed" => RowDecision::Pending,
        "accepted" => RowDecision::Saved,
        "rejected" | "excluded" => RowDecision::Discarded,
        _ => RowDecision::Blocked,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn human() -> ReviewActor {
        ReviewActor {
            kind: ReviewPrincipal::Human,
            via_agent: false,
        }
    }

    fn open_gate() -> ReviewGate {
        ReviewGate {
            status: DraftStatus::Open,
            stale: false,
            stale_reason: None,
        }
    }

    #[test]
    fn a_person_may_save_or_discard_an_open_draft() {
        let gate = open_gate();
        assert!(authorize_review(human(), ReviewAction::Save, Some(&gate)).is_ok());
        assert!(authorize_review(human(), ReviewAction::Discard, Some(&gate)).is_ok());
        assert!(authorize_review(human(), ReviewAction::Save, None).is_ok());
    }

    #[test]
    fn an_agent_cannot_save_discard_or_act_through_a_person() {
        for kind in [ReviewPrincipal::Agent, ReviewPrincipal::Integration] {
            let actor = ReviewActor {
                kind,
                via_agent: false,
            };
            for action in [ReviewAction::Save, ReviewAction::Discard] {
                let error = authorize_review(actor, action, Some(&open_gate())).unwrap_err();
                assert_eq!(error, ReviewRefusal::AgentMayNotDecide);
            }
        }
        let via = ReviewActor {
            kind: ReviewPrincipal::Human,
            via_agent: true,
        };
        assert_eq!(
            authorize_review(via, ReviewAction::Save, None).unwrap_err(),
            ReviewRefusal::AgentMayNotDecide
        );
        assert_eq!(
            authorize_review(via, ReviewAction::Discard, Some(&open_gate())).unwrap_err(),
            ReviewRefusal::AgentMayNotDecide
        );
    }

    #[test]
    fn a_stale_draft_can_be_discarded_and_cannot_be_saved() {
        let gate = ReviewGate {
            status: DraftStatus::Open,
            stale: true,
            stale_reason: Some("Ada edited Name".into()),
        };
        match authorize_review(human(), ReviewAction::Save, Some(&gate)).unwrap_err() {
            ReviewRefusal::Stale { reason } => assert_eq!(reason, "Ada edited Name"),
            other => panic!("expected stale, got {other:?}"),
        }
        assert!(authorize_review(human(), ReviewAction::Discard, Some(&gate)).is_ok());

        let closed = ReviewGate {
            status: DraftStatus::Discarded,
            stale: true,
            stale_reason: None,
        };
        match authorize_review(human(), ReviewAction::Save, Some(&closed)).unwrap_err() {
            ReviewRefusal::Stale { reason } => assert_eq!(reason, STALE_FALLBACK),
            other => panic!("stale is reported before a closed draft, got {other:?}"),
        }
    }

    #[test]
    fn a_closed_draft_is_not_open_for_either_decision() {
        let gate = ReviewGate {
            status: DraftStatus::Saved,
            stale: false,
            stale_reason: None,
        };
        assert_eq!(
            authorize_review(human(), ReviewAction::Save, Some(&gate)).unwrap_err(),
            ReviewRefusal::NotOpen
        );
        assert_eq!(
            authorize_review(human(), ReviewAction::Discard, Some(&gate)).unwrap_err(),
            ReviewRefusal::NotOpen
        );
    }

    #[test]
    fn origin_follows_the_stored_source_and_links() {
        let session = Uuid::now_v7();
        let run = Uuid::now_v7();
        assert_eq!(
            draft_origin("import", Some(session), None),
            DraftOrigin::Import
        );
        assert_eq!(
            draft_origin("user", Some(session), None),
            DraftOrigin::Import
        );
        assert_eq!(draft_origin("agent", None, Some(run)), DraftOrigin::Agent);
        assert_eq!(draft_origin("user", None, Some(run)), DraftOrigin::Agent);
        assert_eq!(draft_origin("rollback", None, None), DraftOrigin::Rollback);
        assert_eq!(draft_origin("user", None, None), DraftOrigin::Person);
    }

    #[test]
    fn row_decisions_share_one_vocabulary() {
        assert_eq!(row_decision("pending"), RowDecision::Pending);
        assert_eq!(row_decision("new"), RowDecision::Pending);
        assert_eq!(row_decision("changed"), RowDecision::Pending);
        assert_eq!(row_decision("accepted"), RowDecision::Saved);
        assert_eq!(row_decision("rejected"), RowDecision::Discarded);
        assert_eq!(row_decision("excluded"), RowDecision::Discarded);
        assert_eq!(row_decision("failed"), RowDecision::Blocked);
        assert_eq!(row_decision("stale"), RowDecision::Blocked);
        assert_eq!(row_decision("unchanged"), RowDecision::Blocked);
    }

    #[test]
    fn a_moved_base_version_differs_in_either_direction() {
        assert!(!base_version_differs(3, 3));
        assert!(base_version_differs(3, 4));
        assert!(base_version_differs(5, 4));
    }
}
