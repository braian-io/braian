-- Hand-picked objects on a manual selection. A dynamic selection has no rows here.
-- Deleting the selection or the object removes the membership.

CREATE TABLE assortment_members (
    assortment_id uuid NOT NULL REFERENCES assortments (id) ON DELETE CASCADE,
    object_id uuid NOT NULL REFERENCES objects (id) ON DELETE CASCADE,
    added_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (assortment_id, object_id)
);

CREATE INDEX assortment_members_object ON assortment_members (object_id);
