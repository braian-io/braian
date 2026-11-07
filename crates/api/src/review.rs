//! Map the shared review decision onto the existing HTTP errors.
//!
//! The stored words stay `accept` and `discard` until the views use one
//! Review / Save / Discard control. The check itself is [`authorize_review`].

use axum::http::StatusCode;
use braian_model::{
    DraftStatus, ReviewAction, ReviewActor, ReviewGate, ReviewPrincipal, ReviewRefusal,
    authorize_review,
};
use braian_store::PrincipalKind;
use serde_json::Value;

use crate::auth::Identity;
use crate::problem::Problem;

pub(crate) fn review_actor(identity: &Identity, via_agent: bool) -> ReviewActor {
    let kind = match identity.kind {
        PrincipalKind::Human => ReviewPrincipal::Human,
        PrincipalKind::Agent => ReviewPrincipal::Agent,
        PrincipalKind::Integration => ReviewPrincipal::Integration,
    };
    ReviewActor { kind, via_agent }
}

pub(crate) fn gate_from_proposal(proposal: &Value) -> ReviewGate {
    let status = match proposal.get("status").and_then(Value::as_str) {
        Some("accepted") => DraftStatus::Saved,
        Some("discarded") => DraftStatus::Discarded,
        _ => DraftStatus::Open,
    };
    ReviewGate {
        status,
        stale: proposal.get("stale").and_then(Value::as_bool) == Some(true),
        stale_reason: proposal
            .get("stale_reason")
            .and_then(Value::as_str)
            .map(str::to_owned),
    }
}

/// The refusal a person already sees. Codes stay stable for this cut.
pub(crate) fn refuse_review(action: ReviewAction, refusal: ReviewRefusal) -> Problem {
    match refusal {
        ReviewRefusal::AgentMayNotDecide => match action {
            ReviewAction::Save => Problem::new(
                StatusCode::FORBIDDEN,
                "agent_cannot_accept",
                "an agent or import proposes; a person accepts",
            ),
            ReviewAction::Discard => Problem::new(
                StatusCode::FORBIDDEN,
                "agent_cannot_discard",
                "an agent or import proposes; a person discards",
            ),
        },
        ReviewRefusal::Stale { reason } => Problem::new(StatusCode::CONFLICT, "stale", reason),
        ReviewRefusal::NotOpen => Problem::new(
            StatusCode::CONFLICT,
            "conflict",
            "this proposal is no longer pending",
        ),
    }
}

/// Save against a loaded proposal.
///
/// A proposal that is no longer open stays on the caller's existing path,
/// which reports that nothing is pending. Stale still wins, including then.
pub(crate) fn reject_stale_save(identity: &Identity, proposal: &Value) -> Result<(), Problem> {
    match authorize_review(
        review_actor(identity, false),
        ReviewAction::Save,
        Some(&gate_from_proposal(proposal)),
    ) {
        Err(refusal @ ReviewRefusal::Stale { .. })
        | Err(refusal @ ReviewRefusal::AgentMayNotDecide) => {
            Err(refuse_review(ReviewAction::Save, refusal))
        }
        Err(ReviewRefusal::NotOpen) | Ok(()) => Ok(()),
    }
}

pub(crate) fn require_review(
    identity: &Identity,
    via_agent: bool,
    action: ReviewAction,
    gate: Option<&ReviewGate>,
) -> Result<(), Problem> {
    authorize_review(review_actor(identity, via_agent), action, gate)
        .map_err(|refusal| refuse_review(action, refusal))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_and_discard_keep_the_existing_agent_errors() {
        let save = refuse_review(ReviewAction::Save, ReviewRefusal::AgentMayNotDecide);
        assert_eq!(save.status, StatusCode::FORBIDDEN.as_u16());
        assert_eq!(save.code, "agent_cannot_accept");
        let discard = refuse_review(ReviewAction::Discard, ReviewRefusal::AgentMayNotDecide);
        assert_eq!(discard.code, "agent_cannot_discard");
        let stale = refuse_review(
            ReviewAction::Save,
            ReviewRefusal::Stale {
                reason: "the object changed after this proposal was filed".into(),
            },
        );
        assert_eq!(stale.status, StatusCode::CONFLICT.as_u16());
        assert_eq!(stale.code, "stale");
        let closed = refuse_review(ReviewAction::Save, ReviewRefusal::NotOpen);
        assert_eq!(closed.code, "conflict");
        assert_eq!(closed.detail, "this proposal is no longer pending");
    }
}
