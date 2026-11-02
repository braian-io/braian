//! Dynamic and manual selections: kind is stored, a dynamic query keeps its
//! filter, and deleting a selection clears the view sources that referenced it.

use braian_store::testing::TestDb;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
async fn a_dynamic_selection_stores_its_filter_and_a_manual_one_has_none() {
    let db = TestDb::create().await;
    let user = db
        .store()
        .create_user("dynamic@example.com", "x", "editor", "Dynamic")
        .await
        .unwrap();
    let type_id = Uuid::parse_str("018f0000-0000-7000-8000-000000000200").unwrap();

    let id = Uuid::now_v7();
    db.store()
        .save_assortment(
            id,
            user.id,
            type_id,
            "Articles or products",
            "dynamic",
            &json!({ "filter": "(type_key:=item || type_key:=item) && groups:=assortment:root" }),
        )
        .await
        .unwrap();

    let saved = db.store().assortment(id).await.unwrap().unwrap();
    assert_eq!(saved["kind"], "dynamic");
    assert_eq!(
        saved["query"]["filter"],
        "(type_key:=item || type_key:=item) && groups:=assortment:root"
    );

    db.store()
        .update_assortment(
            id,
            "Renamed",
            &json!({ "filter": "type_key:=item && groups:=assortment:child" }),
        )
        .await
        .unwrap();
    let updated = db.store().assortment(id).await.unwrap().unwrap();
    assert_eq!(updated["name"], "Renamed");
    assert_eq!(updated["kind"], "dynamic");
    assert_eq!(
        updated["query"]["filter"],
        "type_key:=item && groups:=assortment:child"
    );
}

#[tokio::test]
async fn deleting_a_selection_clears_the_views_that_used_it() {
    let db = TestDb::create().await;
    let user = db
        .store()
        .create_user("usage@example.com", "x", "editor", "Usage")
        .await
        .unwrap();
    let type_id = Uuid::parse_str("018f0000-0000-7000-8000-000000000200").unwrap();

    let id = Uuid::now_v7();
    db.store()
        .save_assortment(id, user.id, type_id, "Cheese", "manual", &json!({}))
        .await
        .unwrap();

    let workspace_id = Uuid::now_v7();
    db.store()
        .save_workspace(workspace_id, user.id, "Demo", false, None, &json!({}))
        .await
        .unwrap();
    let view_id = Uuid::now_v7();
    db.store()
        .save_view(
            view_id,
            workspace_id,
            "object_table",
            "Cheese",
            "main",
            0,
            &json!({ "object_type": type_id, "type_key": "item", "selection_id": id }),
        )
        .await
        .unwrap();

    let usage = db.store().assortment_usage(id).await.unwrap();
    assert_eq!(usage.views.len(), 1);
    assert_eq!(usage.views[0]["id"], view_id.to_string());

    let cleared = db.store().delete_assortment(id).await.unwrap();
    assert_eq!(cleared.views.len(), 1);
    assert!(db.store().assortment(id).await.unwrap().is_none());

    let view = db.store().view_state(view_id).await.unwrap().unwrap();
    assert!(view.get("selection_id").is_none(), "{view}");
    assert_eq!(view["type_key"], "item");
}
