//! Review drafts are a projection of the proposal, import, and model-draft tables.
//!
//! A new store connection is a restart: the pool from the first process is gone
//! and the rows are read back from Postgres.

use std::collections::BTreeMap;

use braian_model::{
    DraftOrigin, DraftStatus, ObjectPatch, ReviewAction, ReviewActor, ReviewKind, ReviewPrincipal,
    ReviewRefusal, ReviewRowId, ReviewTarget, RowDecision, authorize_review, base_version_differs,
};
use braian_store::testing::TestDb;
use braian_store::{
    Actor, BatchKind, Error, ImportRowIn, NewAgentRun, ObjectOp, PrincipalId, PrincipalKind,
    ProposalRow, ProposalWrite, StaleEdit, Store,
};
use braian_synth::{EditKind, Tier, definitions, edits, objects};
use chrono::Utc;
use serde_json::{Value, json};
use uuid::Uuid;

fn actor(principal: PrincipalId) -> Actor {
    Actor {
        actor: principal,
        on_behalf_of: None,
        kind: BatchKind::Interactive,
        source: "test".into(),
    }
}

fn person() -> ReviewActor {
    ReviewActor {
        kind: ReviewPrincipal::Human,
        via_agent: false,
    }
}

async fn reopen(db: &TestDb) -> Store {
    Store::connect(&db.database_url()).await.expect("reconnect")
}

#[tokio::test]
async fn a_single_agent_draft_keeps_its_version_and_blocks_a_stale_save() {
    let db = TestDb::create().await;
    let defs = definitions(Tier::Light, 11);
    let human = db
        .store()
        .create_principal(PrincipalKind::Human, "ada")
        .await
        .unwrap();
    let agent = db
        .store()
        .create_principal(PrincipalKind::Agent, "scout")
        .await
        .unwrap();
    let who = actor(human);
    db.store().put_definitions(&who, &defs).await.unwrap();
    let object = objects(&defs, Tier::Light, 11, 1).pop().unwrap();
    db.store()
        .write_batch(&who, vec![ObjectOp::Create(object.clone())])
        .await
        .unwrap();
    let created = db.store().get_object(object.id).await.unwrap().unwrap();
    let edit = edits(&defs, Tier::Light, 11, EditKind::OneLanguage, 0..1)
        .next()
        .unwrap();
    let patch = serde_json::to_value(ObjectPatch {
        values: edit.patch.clone(),
        groups: BTreeMap::new(),
    })
    .unwrap();
    let proposal_id = Uuid::now_v7();
    let row_id = Uuid::now_v7();
    let run_id = Uuid::now_v7();
    db.store()
        .insert_agent_run(&NewAgentRun {
            id: run_id,
            user_id: None,
            principal_id: agent.as_uuid(),
            workspace_id: None,
            title: "rename".into(),
            context: json!({}),
        })
        .await
        .unwrap();
    db.store()
        .create_proposal(
            proposal_id,
            "Rename one product",
            "agent",
            agent,
            Some(human),
            false,
            &[ProposalRow {
                id: row_id,
                object_id: Some(object.id.as_uuid()),
                object_key: Some(created.key.clone()),
                type_key: Some("item".into()),
                base_version: Some(1),
                patch: patch.clone(),
                status: "pending".into(),
                conflict: false,
                position: 0,
            }],
        )
        .await
        .unwrap();
    db.store()
        .attach_proposal_to_run(proposal_id, run_id)
        .await
        .unwrap();

    db.store()
        .write_batch(
            &who,
            vec![ObjectOp::Update {
                id: object.id,
                patch: ObjectPatch {
                    values: edit.patch,
                    groups: BTreeMap::new(),
                },
                base_version: 1,
                read_version: 1,
            }],
        )
        .await
        .unwrap();

    let store = reopen(&db).await;
    let draft = store
        .review_draft(proposal_id)
        .await
        .unwrap()
        .expect("draft");
    assert_eq!(draft.kind, ReviewKind::Proposal);
    assert_eq!(draft.origin, DraftOrigin::Agent);
    assert_eq!(draft.source, "agent");
    assert_eq!(draft.actor, agent.as_uuid());
    assert_eq!(draft.on_behalf_of, Some(human.as_uuid()));
    assert_eq!(draft.agent_run_id, Some(run_id));
    assert_eq!(draft.status, DraftStatus::Open);
    assert_eq!(draft.rows.len(), 1);
    let row = &draft.rows[0];
    assert_eq!(row.id, ReviewRowId::Proposal { id: row_id });
    assert_eq!(row.base_version, Some(1));
    assert_eq!(row.patch, patch);
    assert_eq!(row.decision, RowDecision::Pending);
    assert!(matches!(row.target, ReviewTarget::Object { .. }));
    let stored = store.get_object(object.id).await.unwrap().unwrap();
    assert_eq!(stored.version, 2);
    assert!(base_version_differs(
        row.base_version.unwrap(),
        stored.version as i64
    ));

    let lock = store.claim_proposal(proposal_id).await.unwrap();
    let error = store
        .commit_proposal_row(
            &who,
            proposal_id,
            row_id,
            "accepted",
            ProposalWrite::Objects {
                ops: vec![ObjectOp::Update {
                    id: object.id,
                    patch: ObjectPatch::default(),
                    base_version: 1,
                    read_version: 2,
                }],
                expect_version: Some((object.id, 1)),
            },
            lock.token(),
        )
        .await
        .unwrap_err();
    assert!(
        matches!(
            error,
            Error::Conflict {
                current_version: 2,
                ..
            }
        ),
        "{error}"
    );
    lock.release().await.unwrap();

    store
        .mark_agent_proposals_stale(
            object.id.as_uuid(),
            None,
            &StaleEdit {
                who: "Ada".into(),
                at: Utc::now(),
                fields: vec![("Name".into(), "After".into())],
            },
        )
        .await
        .unwrap();
    let stale = store
        .review_draft(proposal_id)
        .await
        .unwrap()
        .expect("stale draft");
    assert!(stale.stale);
    assert!(stale.conflict);
    assert_eq!(stale.rows[0].decision, RowDecision::Pending);
    assert_eq!(stale.rows[0].base_version, Some(1));
    let gate = braian_model::ReviewGate {
        status: stale.status,
        stale: stale.stale,
        stale_reason: stale.stale_reason.clone(),
    };
    match authorize_review(person(), ReviewAction::Save, Some(&gate)).unwrap_err() {
        ReviewRefusal::Stale { reason } => {
            assert!(reason.contains("Ada"), "{reason}");
            assert!(reason.contains("Name"), "{reason}");
        }
        other => panic!("expected stale, got {other:?}"),
    }
    assert!(authorize_review(person(), ReviewAction::Discard, Some(&gate)).is_ok());
    let agent_actor = ReviewActor {
        kind: ReviewPrincipal::Agent,
        via_agent: false,
    };
    assert_eq!(
        authorize_review(agent_actor, ReviewAction::Save, Some(&gate)).unwrap_err(),
        ReviewRefusal::AgentMayNotDecide
    );
    assert_eq!(
        authorize_review(agent_actor, ReviewAction::Discard, Some(&gate)).unwrap_err(),
        ReviewRefusal::AgentMayNotDecide
    );
    let via_person = ReviewActor {
        kind: ReviewPrincipal::Human,
        via_agent: true,
    };
    assert_eq!(
        authorize_review(via_person, ReviewAction::Discard, Some(&gate)).unwrap_err(),
        ReviewRefusal::AgentMayNotDecide
    );
}

#[tokio::test]
async fn bulk_rows_and_a_model_proposal_survive_a_restart() {
    let db = TestDb::create().await;
    let human = db
        .store()
        .create_principal(PrincipalKind::Human, "ada")
        .await
        .unwrap();
    let bulk_id = Uuid::now_v7();
    let mut rows = Vec::new();
    for position in 0..3 {
        rows.push(ProposalRow {
            id: Uuid::now_v7(),
            object_id: Some(Uuid::now_v7()),
            object_key: Some(format!("SKU-{position}")),
            type_key: Some("item".into()),
            base_version: Some(position as i64 + 1),
            patch: json!({ "values": { "name": format!("Name {position}") } }),
            status: "pending".into(),
            conflict: position == 2,
            position,
        });
    }
    db.store()
        .create_proposal(bulk_id, "Bulk rename", "agent", human, None, true, &rows)
        .await
        .unwrap();

    let config_id = Uuid::now_v7();
    let step = json!({ "op": "set_languages", "languages": ["en"] });
    db.store()
        .create_proposal(
            config_id,
            "Config apply",
            "user",
            human,
            None,
            false,
            &[ProposalRow {
                id: Uuid::now_v7(),
                object_id: None,
                object_key: None,
                type_key: Some("model".into()),
                base_version: Some(4),
                patch: step.clone(),
                status: "pending".into(),
                conflict: false,
                position: 0,
            }],
        )
        .await
        .unwrap();

    let store = reopen(&db).await;
    let bulk = store.review_draft(bulk_id).await.unwrap().expect("bulk");
    assert_eq!(bulk.origin, DraftOrigin::Agent);
    assert!(bulk.conflict);
    assert_eq!(bulk.rows.len(), 3);
    for (index, row) in bulk.rows.iter().enumerate() {
        assert_eq!(row.position, index as i32);
        assert_eq!(row.base_version, Some(index as i64 + 1));
        assert_eq!(row.decision, RowDecision::Pending);
        assert_eq!(row.conflict, index == 2);
        let ReviewTarget::Object { key, .. } = &row.target else {
            panic!("object row");
        };
        assert_eq!(key.as_deref(), Some(format!("SKU-{index}").as_str()));
    }

    let config = store
        .review_draft(config_id)
        .await
        .unwrap()
        .expect("config");
    assert_eq!(config.origin, DraftOrigin::Person);
    assert_eq!(config.source, "user");
    assert_eq!(config.title, "Config apply");
    assert_eq!(config.rows.len(), 1);
    assert_eq!(config.rows[0].target, ReviewTarget::Model);
    assert_eq!(config.rows[0].base_version, Some(4));
    assert_eq!(config.rows[0].patch, step);
    assert_eq!(config.rows[0].decision, RowDecision::Pending);
}

#[tokio::test]
async fn import_rows_use_the_same_draft_and_survive_a_restart() {
    let db = TestDb::create().await;
    let owner = db
        .store()
        .create_principal(PrincipalKind::Human, "ada")
        .await
        .unwrap();
    let session_id = Uuid::now_v7();
    db.store()
        .insert_import_session(session_id, owner.as_uuid(), None, "products.csv", "csv", 2)
        .await
        .unwrap();
    let object_id = Uuid::now_v7();
    let patch = json!({ "values": { "name": "Imported" } });
    let copied = db
        .store()
        .copy_import_rows(
            session_id,
            0,
            &[
                ImportRowIn {
                    session_id,
                    row_no: 1,
                    status: "changed".into(),
                    object_id: Some(object_id),
                    object_key: Some("SKU-1".into()),
                    base_version: Some(6),
                    cells: json!({ "name": { "before": "Old", "after": "Imported" } }),
                    patch: Some(patch.clone()),
                    errors: json!([]),
                },
                ImportRowIn {
                    session_id,
                    row_no: 2,
                    status: "excluded".into(),
                    object_id: None,
                    object_key: Some("SKU-2".into()),
                    base_version: None,
                    cells: json!({}),
                    patch: None,
                    errors: json!([]),
                },
                ImportRowIn {
                    session_id,
                    row_no: 3,
                    status: "stale".into(),
                    object_id: Some(Uuid::now_v7()),
                    object_key: Some("SKU-3".into()),
                    base_version: Some(1),
                    cells: json!({}),
                    patch: Some(json!({ "values": {} })),
                    errors: json!([]),
                },
            ],
        )
        .await
        .unwrap();
    assert!(copied);
    let proposal_id = db
        .store()
        .upsert_import_proposal(session_id, "products.csv", &json!({ "changed": 1 }))
        .await
        .unwrap()
        .expect("import proposal");

    let store = reopen(&db).await;
    let draft = store
        .review_draft(proposal_id)
        .await
        .unwrap()
        .expect("import draft");
    assert_eq!(draft.origin, DraftOrigin::Import);
    assert_eq!(draft.source, "import");
    assert_eq!(draft.session_id, Some(session_id));
    assert_eq!(draft.actor, owner.as_uuid());
    assert_eq!(draft.base_revision, Some(2));
    assert_eq!(draft.rows.len(), 3);
    assert_eq!(
        draft.rows[0].id,
        ReviewRowId::Import {
            session_id,
            row_no: 1
        }
    );
    assert_eq!(draft.rows[0].decision, RowDecision::Pending);
    assert_eq!(draft.rows[0].base_version, Some(6));
    assert_eq!(draft.rows[0].patch, patch);
    assert_eq!(
        draft.rows[0].cells,
        Some(json!({ "name": { "before": "Old", "after": "Imported" } }))
    );
    let ReviewTarget::Import {
        object_id: found, ..
    } = &draft.rows[0].target
    else {
        panic!("import target");
    };
    assert_eq!(*found, Some(object_id));
    assert_eq!(draft.rows[1].decision, RowDecision::Discarded);
    assert_eq!(draft.rows[1].patch, Value::Null);
    assert_eq!(draft.rows[2].decision, RowDecision::Blocked);
    assert!(draft.rows[2].conflict);
    assert_eq!(draft.rows[2].base_version, Some(1));
}

#[tokio::test]
async fn a_persons_model_draft_conflicts_when_the_revision_moves() {
    let db = TestDb::create().await;
    let defs = definitions(Tier::Light, 3);
    let writer = db
        .store()
        .create_principal(PrincipalKind::Human, "writer")
        .await
        .unwrap();
    db.store()
        .put_definitions(&actor(writer), &defs)
        .await
        .unwrap();
    let user = db
        .store()
        .create_user("ada@example.com", "hash", "editor", "Ada")
        .await
        .unwrap();
    let step = json!({ "op": "add_attribute", "attribute": "weight" });
    let base = i64::try_from(defs.model_revision).unwrap();
    db.store()
        .put_model_draft(user.id, base, &json!([step]))
        .await
        .unwrap();

    let aligned = db
        .store()
        .review_model_draft(user.id)
        .await
        .unwrap()
        .expect("draft");
    assert_eq!(aligned.kind, ReviewKind::ModelDraft);
    assert_eq!(aligned.origin, DraftOrigin::Person);
    assert_eq!(aligned.actor, user.principal_id.as_uuid());
    assert!(!aligned.conflict);
    assert!(!aligned.stale);
    assert_eq!(aligned.base_revision, Some(defs.model_revision));
    assert_eq!(aligned.rows.len(), 1);
    assert_eq!(
        aligned.rows[0].id,
        ReviewRowId::ModelStep {
            user_id: user.id,
            index: 0
        }
    );
    assert_eq!(aligned.rows[0].patch, step);
    assert_eq!(aligned.rows[0].target, ReviewTarget::Model);
    assert_eq!(aligned.rows[0].decision, RowDecision::Pending);

    db.store()
        .put_model_draft(user.id, base + 3, &json!([step]))
        .await
        .unwrap();
    let store = reopen(&db).await;
    let moved = store
        .review_model_draft(user.id)
        .await
        .unwrap()
        .expect("moved");
    assert!(moved.conflict);
    assert_eq!(moved.base_revision, Some(defs.model_revision + 3));
    assert_eq!(moved.rows[0].patch, step);
    assert_eq!(moved.rows[0].base_version, Some(base + 3));
}
