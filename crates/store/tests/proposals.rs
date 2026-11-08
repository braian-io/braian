//! Proposal claims are leases on the row. The long work must not keep a pool connection.

use std::time::Duration;

use braian_store::admin::parse_config;
use braian_store::testing::{self, TestDb};
use braian_store::{
    Actor, BatchKind, Error, PoolConfig, PrincipalId, PrincipalKind, ProposalRow, ProposalWrite,
    STORAGE_FORM, Store,
};
use serde_json::json;
use tokio::sync::{mpsc, watch};
use uuid::Uuid;

fn actor(principal: PrincipalId) -> Actor {
    Actor {
        actor: principal,
        on_behalf_of: None,
        kind: BatchKind::Interactive,
        source: "test".into(),
    }
}

async fn open_proposal(store: &Store, who: PrincipalId) -> (Uuid, Uuid) {
    let id = Uuid::now_v7();
    let row_id = Uuid::now_v7();
    store
        .create_proposal(
            id,
            "Claim",
            "user",
            who,
            None,
            false,
            &[ProposalRow {
                id: row_id,
                object_id: None,
                object_key: Some("SKU-CLAIM".into()),
                type_key: Some("item".into()),
                base_version: None,
                patch: json!({ "values": { "sku": "SKU-CLAIM" } }),
                status: "pending".into(),
                conflict: false,
                position: 0,
            }],
        )
        .await
        .unwrap();
    (id, row_id)
}

#[tokio::test]
async fn one_of_two_concurrent_claims_runs_the_proposal() {
    let db = TestDb::create().await;
    let who = db
        .store()
        .create_principal(PrincipalKind::Human, "ada")
        .await
        .unwrap();
    let (id, _) = open_proposal(db.store(), who).await;
    let left = db.store().clone();
    let right = db.store().clone();
    let (first, second) = tokio::join!(left.claim_proposal(id), right.claim_proposal(id));
    let results = [first, second];
    let wins = results.iter().filter(|result| result.is_ok()).count();
    let busy = results
        .iter()
        .filter(|result| matches!(result, Err(Error::ProposalBusy(_))))
        .count();
    assert_eq!(wins, 1, "{results:?}");
    assert_eq!(busy, 1, "{results:?}");
    let held = results.into_iter().find_map(Result::ok).unwrap();
    let third = db.store().claim_proposal(id).await.unwrap_err();
    assert!(
        matches!(third, Error::ProposalBusy(_)),
        "a third worker ran the proposal: {third}"
    );
    held.release().await.unwrap();
    let after = db.store().claim_proposal(id).await.unwrap();
    after.release().await.unwrap();
}

#[tokio::test]
async fn proposal_jobs_do_not_hold_pool_connections() {
    let db = TestDb::create().await;
    let config = parse_config(&db.database_url()).unwrap();
    let pools = PoolConfig {
        interactive: 2,
        ..PoolConfig::default()
    };
    let store = Store::connect_with(config, STORAGE_FORM, pools)
        .await
        .unwrap();
    assert_eq!(store.pool_max(), 2);
    let who = store
        .create_principal(PrincipalKind::Human, "ada")
        .await
        .unwrap();
    let mut ids = Vec::new();
    for _ in 0..4 {
        ids.push(open_proposal(&store, who).await.0);
    }
    let (started_tx, mut started_rx) = mpsc::channel(4);
    let (release_tx, release_rx) = watch::channel(false);
    for id in ids.clone() {
        let store = store.clone();
        let started_tx = started_tx.clone();
        let mut release_rx = release_rx.clone();
        tokio::spawn(async move {
            let lock = store.claim_proposal(id).await.expect("claim");
            started_tx.send(()).await.expect("started");
            release_rx.changed().await.expect("release");
            lock.release().await.expect("release claim");
        });
    }
    drop(started_tx);
    for index in 0..4 {
        tokio::time::timeout(Duration::from_secs(5), started_rx.recv())
            .await
            .unwrap_or_else(|_| {
                panic!("job {index} did not reach its work; a claim is holding a pool connection")
            })
            .expect("job ended before it started");
    }
    assert_eq!(
        store.pool_available(),
        store.pool_size(),
        "a running claim kept a pooled connection"
    );
    let (queued_tx, queued_rx) = tokio::sync::oneshot::channel();
    let reader = store.clone();
    let read_id = ids[0];
    let mut read = tokio::spawn(async move {
        let _ = queued_tx.send(());
        reader.proposal(read_id).await
    });
    queued_rx.await.unwrap();
    let proposal = tokio::time::timeout(Duration::from_secs(5), &mut read)
        .await
        .expect("a read waited on proposal jobs")
        .unwrap()
        .unwrap()
        .expect("proposal");
    assert_eq!(proposal["status"], "open");
    assert_eq!(proposal["rows"][0]["status"], "pending");
    let checkout = tokio::time::timeout(Duration::from_secs(5), store.hold_connection())
        .await
        .expect("a checkout waited on proposal jobs")
        .unwrap();
    drop(checkout);
    release_tx.send(true).unwrap();
}

#[tokio::test]
async fn an_abandoned_claim_can_be_taken_after_the_lease_expires() {
    let db = TestDb::create().await;
    let who = db
        .store()
        .create_principal(PrincipalKind::Human, "ada")
        .await
        .unwrap();
    let (id, row_id) = open_proposal(db.store(), who).await;
    let lock = db.store().claim_proposal(id).await.unwrap();
    let busy = db.store().claim_proposal(id).await.unwrap_err();
    assert!(matches!(busy, Error::ProposalBusy(_)), "{busy}");
    lock.abandon();
    let still = db.store().claim_proposal(id).await.unwrap_err();
    assert!(
        matches!(still, Error::ProposalBusy(_)),
        "dropping the worker without release must leave the lease: {still}"
    );
    testing::expire_proposal_claim(db.store(), id)
        .await
        .unwrap();
    let again = db.store().claim_proposal(id).await.unwrap();
    let wrote = db
        .store()
        .commit_proposal_row(
            &actor(who),
            id,
            row_id,
            "accepted",
            ProposalWrite::None,
            again.token(),
        )
        .await
        .unwrap();
    assert!(wrote.is_some(), "the new worker could not finish the row");
    db.store()
        .set_proposal_status(id, "accepted", again.token(), false)
        .await
        .unwrap();
    let stored = db.store().proposal(id).await.unwrap().unwrap();
    assert_eq!(stored["status"], "accepted");
    assert_eq!(stored["rows"][0]["status"], "accepted");
}

#[tokio::test]
async fn startup_clears_an_expired_lease_and_leaves_a_live_one() {
    let db = TestDb::create().await;
    let who = db
        .store()
        .create_principal(PrincipalKind::Human, "ada")
        .await
        .unwrap();
    let (id, _) = open_proposal(db.store(), who).await;
    let lock = db.store().claim_proposal(id).await.unwrap();
    lock.abandon();
    testing::expire_proposal_claim(db.store(), id)
        .await
        .unwrap();

    let restarted = Store::connect_with(
        parse_config(&db.database_url()).unwrap(),
        STORAGE_FORM,
        PoolConfig::default(),
    )
    .await
    .unwrap();
    let again = restarted.claim_proposal(id).await.unwrap();
    let second = Store::connect_with(
        parse_config(&db.database_url()).unwrap(),
        STORAGE_FORM,
        PoolConfig::default(),
    )
    .await
    .unwrap();
    let busy = second.claim_proposal(id).await.unwrap_err();
    assert!(
        matches!(busy, Error::ProposalBusy(_)),
        "the second startup cleared a live lease: {busy}"
    );
    again.release().await.unwrap();
    let stored = second.proposal(id).await.unwrap().unwrap();
    assert_eq!(stored["status"], "open");
    assert_eq!(stored["rows"][0]["status"], "pending");
}

#[tokio::test]
async fn a_running_claim_rejects_discard_and_a_foreign_status_write() {
    let db = TestDb::create().await;
    let who = db
        .store()
        .create_principal(PrincipalKind::Human, "ada")
        .await
        .unwrap();
    let (id, _) = open_proposal(db.store(), who).await;
    let lock = db.store().claim_proposal(id).await.unwrap();
    let lost = db
        .store()
        .set_proposal_status(id, "discarded", Uuid::now_v7(), true)
        .await
        .unwrap_err();
    assert!(matches!(lost, Error::ProposalClaimLost(_)), "{lost}");
    let stored = db.store().proposal(id).await.unwrap().unwrap();
    assert_eq!(stored["status"], "open", "{stored}");
    assert_eq!(stored["rows"][0]["status"], "pending", "{stored}");
    lock.release().await.unwrap();
}

#[tokio::test]
async fn closing_while_a_row_is_pending_and_bad_transitions_are_refused() {
    let db = TestDb::create().await;
    let who = db
        .store()
        .create_principal(PrincipalKind::Human, "ada")
        .await
        .unwrap();
    let missing = db
        .store()
        .set_proposal_status(Uuid::now_v7(), "accepted", Uuid::now_v7(), false)
        .await
        .unwrap_err();
    assert!(matches!(missing, Error::ProposalNotFound(_)), "{missing}");

    let (id, _) = open_proposal(db.store(), who).await;
    let lock = db.store().claim_proposal(id).await.unwrap();
    let bogus = db
        .store()
        .set_proposal_status(id, "running", lock.token(), false)
        .await
        .unwrap_err();
    assert!(matches!(bogus, Error::ProposalTransition { .. }), "{bogus}");
    let pending = db
        .store()
        .set_proposal_status(id, "accepted", lock.token(), false)
        .await
        .unwrap_err();
    assert!(
        matches!(pending, Error::ProposalTransition { .. }),
        "{pending}"
    );
    let stored = db.store().proposal(id).await.unwrap().unwrap();
    assert_eq!(stored["status"], "open", "{stored}");
    assert_eq!(stored["rows"][0]["status"], "pending", "{stored}");

    // Only a discard may reject what it leaves behind.
    db.store()
        .set_proposal_status(id, "discarded", lock.token(), true)
        .await
        .unwrap();
    let stored = db.store().proposal(id).await.unwrap().unwrap();
    assert_eq!(stored["status"], "discarded", "{stored}");
    assert_eq!(stored["rows"][0]["status"], "rejected", "{stored}");
}

#[tokio::test]
async fn finalize_proposal_waits_for_the_full_membership() {
    let db = TestDb::create().await;
    let who = db
        .store()
        .create_principal(PrincipalKind::Human, "ada")
        .await
        .unwrap();
    let id = Uuid::now_v7();
    let first = Uuid::now_v7();
    let second = Uuid::now_v7();
    let rows = [first, second]
        .into_iter()
        .enumerate()
        .map(|(position, row_id)| ProposalRow {
            id: row_id,
            object_id: None,
            object_key: Some(format!("SKU-{position}")),
            type_key: Some("item".into()),
            base_version: None,
            patch: json!({ "values": { "sku": format!("SKU-{position}") } }),
            status: "pending".into(),
            conflict: false,
            position: i32::try_from(position).unwrap_or(0),
        })
        .collect::<Vec<_>>();
    db.store()
        .create_proposal(id, "Full membership", "user", who, None, false, &rows)
        .await
        .unwrap();
    let lock = db.store().claim_proposal(id).await.unwrap();
    db.store()
        .commit_proposal_row(
            &actor(who),
            id,
            first,
            "accepted",
            ProposalWrite::None,
            lock.token(),
        )
        .await
        .unwrap();
    let open = db
        .store()
        .finalize_proposal(id, lock.token())
        .await
        .unwrap();
    assert_eq!(open, None, "an unselected pending row closed the proposal");
    let stored = db.store().proposal(id).await.unwrap().unwrap();
    assert_eq!(stored["status"], "open", "{stored}");
    assert_eq!(stored["rows"][0]["status"], "accepted", "{stored}");
    assert_eq!(stored["rows"][1]["status"], "pending", "{stored}");

    db.store()
        .commit_proposal_row(
            &actor(who),
            id,
            second,
            "accepted",
            ProposalWrite::None,
            lock.token(),
        )
        .await
        .unwrap();
    let closed = db
        .store()
        .finalize_proposal(id, lock.token())
        .await
        .unwrap();
    assert_eq!(closed.as_deref(), Some("accepted"));
    lock.release().await.unwrap();
    let stored = db.store().proposal(id).await.unwrap().unwrap();
    assert_eq!(stored["status"], "accepted", "{stored}");
    assert_eq!(stored["rows"][1]["status"], "accepted", "{stored}");
}

#[tokio::test]
async fn finalize_proposal_derives_discarded_and_rejects_a_foreign_claim() {
    let db = TestDb::create().await;
    let who = db
        .store()
        .create_principal(PrincipalKind::Human, "ada")
        .await
        .unwrap();
    let (id, row_id) = open_proposal(db.store(), who).await;
    let lock = db.store().claim_proposal(id).await.unwrap();
    let foreign = db
        .store()
        .finalize_proposal(id, Uuid::now_v7())
        .await
        .unwrap_err();
    assert!(matches!(foreign, Error::ProposalClaimLost(_)), "{foreign}");
    db.store()
        .commit_proposal_row(
            &actor(who),
            id,
            row_id,
            "rejected",
            ProposalWrite::None,
            lock.token(),
        )
        .await
        .unwrap();
    let closed = db
        .store()
        .finalize_proposal(id, lock.token())
        .await
        .unwrap();
    assert_eq!(closed.as_deref(), Some("discarded"));
    lock.release().await.unwrap();
    let stored = db.store().proposal(id).await.unwrap().unwrap();
    assert_eq!(stored["status"], "discarded", "{stored}");
    assert_eq!(stored["rows"][0]["status"], "rejected", "{stored}");
}

#[tokio::test]
async fn discard_recovers_a_closed_proposal_with_pending_rows_idempotently() {
    let db = TestDb::create().await;
    let who = db
        .store()
        .create_principal(PrincipalKind::Human, "ada")
        .await
        .unwrap();
    let id = Uuid::now_v7();
    let accepted = Uuid::now_v7();
    let stranded = Uuid::now_v7();
    let rows = [(accepted, "first"), (stranded, "second")]
        .into_iter()
        .enumerate()
        .map(|(position, (row_id, key))| ProposalRow {
            id: row_id,
            object_id: None,
            object_key: Some(key.into()),
            type_key: Some("item".into()),
            base_version: None,
            patch: json!({ "values": { "sku": key } }),
            status: "pending".into(),
            conflict: false,
            position: i32::try_from(position).unwrap_or(0),
        })
        .collect::<Vec<_>>();
    db.store()
        .create_proposal(id, "Historical", "user", who, None, false, &rows)
        .await
        .unwrap();
    let lock = db.store().claim_proposal(id).await.unwrap();
    db.store()
        .commit_proposal_row(
            &actor(who),
            id,
            accepted,
            "accepted",
            ProposalWrite::None,
            lock.token(),
        )
        .await
        .unwrap();
    lock.release().await.unwrap();
    // A historical bug closed the proposal while the second row was pending.
    testing::force_proposal_status(db.store(), id, "accepted")
        .await
        .unwrap();

    let lock = db.store().claim_proposal(id).await.unwrap();
    let report = db
        .store()
        .discard_proposal(id, lock.token(), who)
        .await
        .unwrap();
    lock.release().await.unwrap();
    assert_eq!(
        report,
        braian_store::DiscardReport {
            previous_status: "accepted".into(),
            status: "accepted".into(),
            rejected_rows: 1,
            recovered: true,
        }
    );
    let stored = db.store().proposal(id).await.unwrap().unwrap();
    assert_eq!(
        stored["status"], "accepted",
        "accepted rows must not reopen"
    );
    assert_eq!(stored["rows"][0]["status"], "accepted", "{stored}");
    assert_eq!(stored["rows"][1]["status"], "rejected", "{stored}");
    assert_eq!(
        testing::proposal_recovery_count(db.store(), id)
            .await
            .unwrap(),
        1
    );

    let lock = db.store().claim_proposal(id).await.unwrap();
    let again = db
        .store()
        .discard_proposal(id, lock.token(), who)
        .await
        .unwrap();
    lock.release().await.unwrap();
    assert_eq!(again.rejected_rows, 0);
    assert!(!again.recovered);
    assert_eq!(
        testing::proposal_recovery_count(db.store(), id)
            .await
            .unwrap(),
        1
    );
}
