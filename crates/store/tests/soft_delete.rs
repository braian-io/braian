use braian_model::ObjectId;
use braian_store::testing::TestDb;
use braian_store::{Actor, BatchKind, CatalogId, CatalogKind, ObjectOp, PrincipalKind};
use braian_synth::{Tier, definitions, objects, objects_iter};
use uuid::Uuid;

fn actor(principal: braian_store::PrincipalId) -> Actor {
    Actor {
        actor: principal,
        on_behalf_of: None,
        kind: BatchKind::Interactive,
        source: "test".into(),
    }
}

async fn setup() -> (
    TestDb,
    Actor,
    braian_model::DefinitionSet,
    braian_model::Object,
) {
    let db = TestDb::create().await;
    let defs = definitions(Tier::Light, 7);
    let human = db
        .store()
        .create_principal(PrincipalKind::Human, "ada")
        .await
        .unwrap();
    let who = actor(human);
    db.store().put_definitions(&who, &defs).await.unwrap();
    let object = objects(&defs, Tier::Light, 7, 1).pop().unwrap();
    db.store()
        .write_batch(&who, vec![ObjectOp::Create(object.clone())])
        .await
        .unwrap();
    (db, who, defs, object)
}

#[tokio::test]
async fn delete_hides_the_object_and_undelete_restores_it() {
    let (db, who, _defs, object) = setup().await;
    let key = db.store().get_object(object.id).await.unwrap().unwrap().key;
    db.store()
        .write_batch(
            &who,
            vec![ObjectOp::Delete {
                id: object.id,
                base_version: None,
            }],
        )
        .await
        .unwrap();
    assert!(
        db.store()
            .get_by_key(object.type_id, &key)
            .await
            .unwrap()
            .is_none()
    );
    let trash = db.store().list_trash(None).await.unwrap();
    assert!(
        trash
            .iter()
            .any(|row| row.kind == "object" && row.id == object.id.as_uuid())
    );

    db.store().restore_object(&who, object.id).await.unwrap();
    let found = db
        .store()
        .get_by_key(object.type_id, &key)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(found.object.id, object.id);
    assert!(found.deleted_at.is_none());
}

#[tokio::test]
async fn undelete_refuses_a_key_that_was_reused() {
    let (db, who, _defs, object) = setup().await;
    let key = db.store().get_object(object.id).await.unwrap().unwrap().key;
    db.store()
        .write_batch(
            &who,
            vec![ObjectOp::Delete {
                id: object.id,
                base_version: None,
            }],
        )
        .await
        .unwrap();
    let reused = braian_model::Object {
        id: ObjectId::from_uuid(Uuid::now_v7()),
        ..object.clone()
    };
    db.store()
        .write_batch(&who, vec![ObjectOp::Create(reused.clone())])
        .await
        .unwrap();
    let error = db
        .store()
        .restore_object(&who, object.id)
        .await
        .unwrap_err();
    assert!(
        error.to_string().contains("already uses the key"),
        "{error}"
    );
    assert_eq!(
        db.store()
            .get_by_key(object.type_id, &key)
            .await
            .unwrap()
            .unwrap()
            .object
            .id,
        reused.id
    );
    assert!(
        db.store()
            .get_object(object.id)
            .await
            .unwrap()
            .unwrap()
            .deleted_at
            .is_some()
    );
}

#[tokio::test]
async fn cleanup_removes_rows_older_than_thirty_days() {
    let (db, who, defs, fresh) = setup().await;
    let old = objects_iter(&defs, Tier::Light, 7, 1..2).next().unwrap();
    db.store()
        .write_batch(&who, vec![ObjectOp::Create(old.clone())])
        .await
        .unwrap();
    db.store()
        .write_batch(
            &who,
            vec![
                ObjectOp::Delete {
                    id: fresh.id,
                    base_version: None,
                },
                ObjectOp::Delete {
                    id: old.id,
                    base_version: None,
                },
            ],
        )
        .await
        .unwrap();

    let (client, connection) = tokio_postgres::connect(&db.database_url(), tokio_postgres::NoTls)
        .await
        .unwrap();
    tokio::spawn(async move {
        let _ = connection.await;
    });
    client
        .execute(
            "UPDATE objects SET deleted_at = now() - interval '31 days' WHERE id = $1",
            &[&old.id.as_uuid()],
        )
        .await
        .unwrap();

    let counts = db.store().purge_expired_soft_deletes().await.unwrap();
    assert_eq!(counts.objects, 1, "{counts:?}");
    assert!(db.store().get_object(old.id).await.unwrap().is_none());
    assert!(
        db.store()
            .get_object(fresh.id)
            .await
            .unwrap()
            .unwrap()
            .deleted_at
            .is_some()
    );
}

#[tokio::test]
async fn a_soft_deleted_link_side_can_be_reused() {
    let (db, who, defs, from) = setup().await;
    let mut extra = objects_iter(&defs, Tier::Light, 7, 1..4);
    let to = extra.next().unwrap();
    let link = extra.next().unwrap();
    let replacement = extra.next().unwrap();
    db.store()
        .write_batch(
            &who,
            vec![
                ObjectOp::Create(to.clone()),
                ObjectOp::Create(link.clone()),
                ObjectOp::Create(replacement.clone()),
            ],
        )
        .await
        .unwrap();
    let (client, connection) = tokio_postgres::connect(&db.database_url(), tokio_postgres::NoTls)
        .await
        .unwrap();
    tokio::spawn(async move {
        let _ = connection.await;
    });
    let link_type = Uuid::now_v7();
    client
        .execute(
            "INSERT INTO links (object_id, link_type_id, from_id, to_id, from_one, to_one)
             VALUES ($1, $2, $3, $4, true, false)",
            &[
                &link.id.as_uuid(),
                &link_type,
                &from.id.as_uuid(),
                &to.id.as_uuid(),
            ],
        )
        .await
        .unwrap();
    client
        .execute(
            "UPDATE links SET deleted_at = now() WHERE object_id = $1",
            &[&link.id.as_uuid()],
        )
        .await
        .unwrap();
    client
        .execute(
            "UPDATE objects SET deleted_at = now() WHERE id = $1",
            &[&link.id.as_uuid()],
        )
        .await
        .unwrap();
    client
        .execute(
            "INSERT INTO links (object_id, link_type_id, from_id, to_id, from_one, to_one)
             VALUES ($1, $2, $3, $4, true, false)",
            &[
                &replacement.id.as_uuid(),
                &link_type,
                &from.id.as_uuid(),
                &to.id.as_uuid(),
            ],
        )
        .await
        .expect("a soft-deleted one-side does not block a new link");

    let error = db.store().restore_object(&who, link.id).await.unwrap_err();
    assert!(
        error.to_string().contains("already uses that side"),
        "{error}"
    );
}

#[tokio::test]
async fn workspace_share_token_is_reusable_until_undelete() {
    let db = TestDb::create().await;
    let user = db
        .store()
        .create_user("ada@example.com", "hash", "editor", "Ada")
        .await
        .unwrap();
    let first = Uuid::now_v7();
    let second = Uuid::now_v7();
    db.store()
        .save_workspace(
            first,
            user.id,
            "First",
            false,
            Some("share-a"),
            &serde_json::json!({}),
        )
        .await
        .unwrap();
    db.store()
        .save_workspace(
            second,
            user.id,
            "Second",
            false,
            None,
            &serde_json::json!({}),
        )
        .await
        .unwrap();
    let view = Uuid::now_v7();
    db.store()
        .save_view(
            view,
            first,
            "object_table",
            "Table",
            "main",
            0,
            &serde_json::json!({}),
        )
        .await
        .unwrap();
    db.store().delete_workspace(first).await.unwrap();
    assert!(db.store().workspace(first).await.unwrap().is_none());
    let listed = db.store().list_workspaces(user.id).await.unwrap();
    let first_id = first.to_string();
    assert!(
        listed
            .iter()
            .all(|row| row["id"].as_str() != Some(first_id.as_str()))
    );
    let third = Uuid::now_v7();
    db.store()
        .save_workspace(
            third,
            user.id,
            "Third",
            false,
            Some("share-a"),
            &serde_json::json!({}),
        )
        .await
        .expect("deleted share token can be reused");
    let error = db.store().restore_workspace(first).await.unwrap_err();
    assert!(error.to_string().contains("share link"), "{error}");
    db.store().delete_workspace(third).await.unwrap();
    db.store().restore_workspace(first).await.unwrap();
    let restored = db.store().workspace(first).await.unwrap().unwrap();
    let views = restored["views"].as_array().unwrap();
    let view_id = view.to_string();
    assert_eq!(views.len(), 1);
    assert_eq!(views[0]["id"].as_str(), Some(view_id.as_str()));
}

#[tokio::test]
async fn catalog_key_can_be_reused_while_the_old_row_is_in_trash() {
    let db = TestDb::create().await;
    let old = CatalogId::new();
    db.store()
        .create_catalog(old, "temp", "Temporary", CatalogKind::Source, true)
        .await
        .unwrap();
    let (client, connection) = tokio_postgres::connect(&db.database_url(), tokio_postgres::NoTls)
        .await
        .unwrap();
    tokio::spawn(async move {
        let _ = connection.await;
    });
    client
        .execute(
            "UPDATE catalogs SET deleted_at = now() WHERE id = $1",
            &[&old.as_uuid()],
        )
        .await
        .unwrap();
    assert!(db.store().catalog_by_key("temp").await.unwrap().is_none());
    let renewed = CatalogId::new();
    db.store()
        .create_catalog(renewed, "temp", "Again", CatalogKind::Source, true)
        .await
        .unwrap();
    let error = db.store().restore_catalog(old.as_uuid()).await.unwrap_err();
    assert!(error.to_string().contains("key temp"), "{error}");
    assert_eq!(
        db.store().catalog_by_key("temp").await.unwrap().unwrap().id,
        renewed
    );
}
