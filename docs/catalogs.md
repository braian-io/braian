# Catalogs and merge

One master catalog and any number of source catalogs share Postgres. They do
not share a definition chain, an object key or a search collection.

The master catalog uses the reserved id
`018f1000-0000-7000-8000-000000000001` and the key `master`. Existing `/v1`
routes read and write that catalog. A source catalog is
`/v1/catalogs/{key}/...`. The same path with no further slash is the catalog
record, not a rewrite. An object route that names an id uses the catalog stored
on that object.

Search keeps the current alias for the master. A source catalog is indexed at
`{alias}_{key}`, so a test alias such as `braian_e2e` becomes `braian_e2e_sap`.

## What a profile does

A merge profile reads one source catalog and writes the master attributes it
lists. It does not file a proposal. Match is equality on one or more source
attributes against one master attribute. An ambiguous match is an error and
writes nothing. A mapped value that fails transformation is skipped and
reported on the row.

`on_no_match` is `create` or `skip`. `on_delete` is `propagate` or `ignore`.
A planned create is written only when `owns_existence_for` contains the source
object's type key. Other profiles skip an unmatched object. A planned delete
is written when the object already matches. Structure placement is copied when
the profile names `structure` and `groups`, and the source object sits in that
structure.

An empty owned value clears the master value. The owner is the first profile
in the rule that has a link, including a link whose source value is empty.

Ownership is a list of profiles per attribute. Saving a new revision does not
re-run a merge. `POST /v1/merge/profiles/{key}/run` does. A person can break
and remake a link with `POST /v1/merge/links` and `POST /v1/merge/links/remove`.

`changes.origin` is filled from the `braian.origin` setting when a merge write
inserts a change. The JSON names the profile, its revision, the source catalog
and the source object. `GET /v1/objects/{id}?include=owners,origin` returns
the computed owner per attribute and the latest origin.

## Roles

`braian all` runs the merger beside the indexer. `braian merger` is the same
loop on its own. Continuous profiles run when the change log moves past the
`merger` cursor. A profile with a non-empty `schedule` is due about once a
minute (`next_run_at`). The UI offers manual, continuous, and a one-minute
schedule (`* * * * *`). Manual profiles also run from the HTTP endpoint.

A dry run (`{"dry_run": true}`, the default on `POST .../run`) returns the
rows and stores them. `{"dry_run": false}` writes.

A person who patches an attribute owned by a linked profile gets
`owned_by_source` (422). The detail names the attribute and the profile. A
write whose actor source is `merge` is allowed. No link means Braian owns the
field. The object form shows the owner and disables the field.
`merge.run` and `catalog.cleanup` reject an agent with `human_required`.

The header `x-import-snapshot: true` marks an import session as a snapshot.
On save, keys of that type that are missing from the file are soft-deleted in
the same catalog. The default is a delta.

`POST /v1/catalogs/{key}/infer` writes a model draft of attributes that are
not already in the catalog. `POST /v1/catalogs/{key}/cleanup` soft-deletes
every object in a source catalog and does not propagate into the master.

## Demo

Seed creates `sap` (SAP ERP), `supplier-nordic` and `supplier-alpine`, copies
the master definitions into each, and loads `crates/server/demo/sap.json`,
`supplier-nordic.json` and `supplier-alpine.json`. The `sap-brand` profile
maps `brand`, creates when nothing matches, and owns existence for `product`.
The first seed applies that profile. The Sources workspace opens Catalogs,
Merge profiles, the SAP table, Merge runs and Ownership.

An in-memory plan of 100 000 objects is recorded in
`docs/measurements/2026-10-31-merge-plan.md`. A Postgres measurement of that
volume has not been run.
