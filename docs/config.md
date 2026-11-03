# Config as code

The model can be exported as documents that live in git. A document has a wire
version in `apiVersion` and a shape in `kind`. Every reference uses a stable key,
never a database id. The same documents work through the HTTP API, the `braian`
CLI, and a file drop in the web app.

```text
export -> commit -> plan -> apply (one proposal) -> accept in Review
```

An apply never writes the definitions directly. It creates a proposal, and the
stored model changes only when the proposal is accepted.

## Documents

The only supported version is `apiVersion: braian.io/v1`. The known kinds are
`Model`, `ValueList`, `UnitFamily`, `Catalog`, `MergeProfile`, `WorkspaceTemplate`, and `Ownership`.
A missing or unknown header is rejected. The committed JSON Schema is
`schemas/config/braian.io-v1.schema.json`; the API serves the same schema from
`GET /v1/config/schema`.

### Model

A `Model` document carries `languages`, `attributes`, `types`, and `structures`.
Types are `entity` or `link`. A link type names its ends by type key and adds
labels and cardinalities. A structure contains groups and classes. Attributes
may be `text`, `number`, `range`, `value_list`, `boolean`, `date`, `object_ref`,
or `file_ref`.

```yaml
apiVersion: braian.io/v1
kind: Model
languages:
  - en
  - sv
attributes:
  - key: sku
    labels:
      en: SKU
    languageDependent: false
    multiple: false
    required: true
    kind:
      type: text
      maxLength: 64
    index:
      searchable: true
      filterable: true
      sortable: true
  - key: name
    labels:
      en: Name
    languageDependent: true
    multiple: false
    kind:
      type: text
    index:
      searchable: true
      filterable: false
      sortable: true
types:
  - key: item
    singular:
      en: Item
    plural:
      en: Items
    keyAttribute: sku
    attributes:
      - sku
      - name
    kind: entity
  - key: supplier
    keyAttribute: sku
    attributes:
      - sku
    kind: entity
  - key: item_supplier
    keyAttribute: sku
    attributes: []
    kind: link
    link:
      fromTypes:
        - item
      toTypes:
        - supplier
      fromLabel:
        key: item
        labels:
          en: Item
      toLabel:
        key: supplier
        labels:
          en: Supplier
      fromCardinality: many
      toCardinality: many
structures:
  - key: catalog
    labels:
      en: Catalog
    groups:
      - key: root
        labels:
          en: Root
        attributes:
          - name
```

### ValueList

One shared value list per document. `options` use stable codes and optional
labels per language.

```yaml
apiVersion: braian.io/v1
kind: ValueList
key: colors
labels:
  en: Colors
options:
  - code: red
    labels:
      en: Red
  - code: blue
    labels:
      en: Blue
```

### UnitFamily

One family of units per document. `factor` is a decimal string that multiplies
into `baseUnit`.

```yaml
apiVersion: braian.io/v1
kind: UnitFamily
key: mass
dimension: mass
baseUnit: kg
units:
  - code: kg
    factor: "1"
  - code: g
    factor: "0.001"
```

### Catalog

A catalog is `master` or `source`. `editable` is a boolean.

```yaml
apiVersion: braian.io/v1
kind: Catalog
key: sap
name: SAP ERP
catalogKind: source
editable: true
```

### MergeProfile

A profile reads one source catalog, named by key in `sourceCatalog`. `spec` is
stored unchanged. `runMode` is `manual` or `continuous`.

```yaml
apiVersion: braian.io/v1
kind: MergeProfile
key: sap-brand
name: SAP brand
sourceCatalog: sap
spec:
  match_attributes:
    - number
  master_key: number
  attributes:
    - source: brand
      target: brand
  on_no_match: create
  on_delete: ignore
  owns_existence_for:
    - product
runMode: manual
```

### WorkspaceTemplate

A workspace template is named by `key`. `definition` is one JSON object with
the stored layout. Applying a template never changes an existing workspace; a
client creates a workspace from the template.

```yaml
apiVersion: braian.io/v1
kind: WorkspaceTemplate
key: supplier-review
name: Supplier review
definition:
  views:
    - type: object_table
      title: Suppliers
      typeKey: supplier
```

### Ownership

There is one ownership rule set. The document has no key. Each rule names an
attribute and the profiles that own it; `language` is optional.

```yaml
apiVersion: braian.io/v1
kind: Ownership
rules:
  - attribute: brand
    profiles:
      - sap-brand
```

## Export layout

`GET /v1/config/export` returns YAML by default. Plain YAML is a multi-document
stream separated by `---`. `format=json`, or `Accept: application/json`, returns
one JSON array. `format=zip` returns an archive with one file per document:

```text
model/model.yaml
value-lists/<key>.yaml
units/<key>.yaml
catalogs/<key>.yaml
merge-profiles/<key>.yaml
workspace-templates/<key>.yaml
ownership/ownership.yaml
```

In zip paths, characters other than ASCII letters, digits, `-`, and `_` become
`_`. Empty keys, `.`, and `..` become `document`.

## Export, plan, and apply

### API

All routes need a Bearer token.

| Route | Purpose |
| --- | --- |
| `GET /v1/config/export` | Export. Query `format=yaml`, `json`, or `zip`. YAML by default. |
| `GET /v1/config/schema` | The JSON Schema for every document kind. |
| `POST /v1/config/plan` | Compare documents with the stored model and return every step. Writes nothing. |
| `POST /v1/config/apply` | Build one proposal from the documents. |

`plan` and `apply` accept YAML multi-documents, a JSON object, or a JSON array.
For `apply`, JSON may be wrapped as `{ "documents": [...], "allowDestructive": true }`.
YAML has no wrapper, so `allowDestructive` can only be sent as JSON.

`POST /v1/config/plan` returns `200` with `steps`. It marks destructive steps as
`blocked`; `allowDestructive` does not unblock them in a plan.

`POST /v1/config/apply` returns `202` with `proposal_id`, `needs_approval: true`,
and `groups`. The groups count steps by `Model`, `ValueList`, `UnitFamily`,
`Catalog`, `MergeProfile`, `WorkspaceTemplate`, and `Ownership`. A destructive
plan without `allowDestructive` returns `422` with the blocked plan. Documents that match the
stored model return `409` with code `no_changes`. Malformed documents return
`400`; documents that do not compile return `422` with `invalid_config`.

### CLI

The `braian` binary talks to a running API.

```bash
braian config export --format yaml --out config.yaml
braian config export --format zip --out config.zip
braian config plan config/ --json
braian config apply config/ --allow-destructive
```

`export` writes to stdout without `--out`. `--format zip` requires `--out`.
`plan` and `apply` take files or directories and read `*.yaml`, `*.yml`, and
`*.json` recursively in a deterministic order. Connection flags are `--url` and
`--token`, with the environment variables `BRAIAN_URL` (default
`http://127.0.0.1:8090`) and `BRAIAN_TOKEN`.

`plan` prints `+` create, `~` update, `>` rename, and `-` delete, and `--json`
prints the raw plan. Its exit codes are `0` for no changes, `2` for changes, and
`3` for blocked destructive steps. `apply` sends `allowDestructive` only with
`--allow-destructive`; a blocked response ends with `3`. An accepted apply or no
changes exits with `0`.

### UI drop

Drag YAML or JSON files anywhere onto the web app. A drop is treated as config
when every dropped file has a `.yaml`, `.yml`, or `.json` extension and contains
a document with `apiVersion: braian.io/v1`. Other files go to the normal import
flow.

The dialog reads every document, calls `POST /v1/config/plan`, and groups the
steps. When the plan has destructive steps it shows them as blocked and offers
**Allow destructive changes**. **Create proposal** calls `POST /v1/config/apply`;
**Open in Review** opens the proposal in the Review workspace.

## Partial and full mode

A document without `mode`, or with `mode: partial`, only creates and updates the
entities it contains. Everything else stays.

`mode: full` makes the document the whole truth for its section. Entities that
are stored but missing from the document become delete steps. Full applies per
section: a full `Model` controls languages, attributes, types, structures,
groups, and classes; a full `ValueList` controls value lists; a full `UnitFamily`
controls unit families; a full `Catalog` controls catalogs; a full
`MergeProfile` controls merge profiles; a full `WorkspaceTemplate` controls
workspace templates; a full `Ownership` controls the rule set.

Rename instead of delete and create by setting `renamedFrom` to the old key. The
document then uses the new `key`, and the plan gets a `rename` step. `renamedFrom`
exists on value lists, unit families, catalogs, merge profiles, workspace
templates, and nested
attributes, types, structures, groups, and classes. A `Model` document itself has
no `renamedFrom`.

## Destructive steps

A step is destructive when it deletes or invalidates stored data. Examples are a
`full` document that drops an entity, an attribute kind change, removing value
list options or units, and deleting a catalog, merge profile, workspace
template, or ownership rule.
The plan step carries `destructive: true` and an `affected` count.

`plan` always flags destructive steps as `blocked`. `apply` refuses the whole
request with `422` unless the JSON body has `allowDestructive: true`, or the CLI
is given `--allow-destructive`. The web dialog exposes the same choice as
**Allow destructive changes**. Allowing is not a commit: it still creates one
proposal, and nothing is written until that proposal is accepted.

## Deleting a catalog

A catalog delete is a destructive step. The proposal can be created, but
accepting it fails with `422` and code `catalog_in_use` while the catalog has
live dependents:

- live objects
- workspaces
- model drafts
- open proposals, except the proposal being accepted
- import sessions that have not finished

The `detail` names the counts. The plan reports the same live counts in
`affected.objects`, `affected.importSessions`, `affected.proposals`,
`affected.workspaces`, and `affected.modelDrafts`.

Finished history does not block the delete. It is removed in the same
transaction and reported in the plan as `affected.closedProposals` and
`affected.finishedImportSessions`. This covers `changes`, `import_rows`,
finished import sessions (`saved`, `cancelled`, `failed`), non-open proposals
other than the one being accepted, and batches. The delete also removes the
catalog's definition revisions and attribute parts.

Deleting a merge profile that ownership rules still reference returns `422`
with code `ownership_references_profile`. The same applies to a source catalog
whose profiles are referenced. To delete it, include an `Ownership` document in
the same apply that removes those references, so the proposal also contains a
`SetOwnershipRules` change. The master catalog cannot be deleted.

## Proposals and Review

`POST /v1/config/apply` creates one proposal for the whole apply. The response
returns its id and the step groups. The definitions are unchanged until a person
accepts the proposal with `POST /v1/proposals/{id}/accept`. Discarding it with
`POST /v1/proposals/{id}/discard` leaves the stored model unchanged.

In the web app, **Open in Review** selects that proposal and opens the Review
workspace. Review lists the proposal rows and the consequence, and offers
**Save all** and **Discard all**. Accepting an apply proposal writes the model
steps.

## Known limitation: languages

The `Model` document carries `languages`, and the plan reports `language` create
and delete steps. Applying does not build a model change for them: `changes_for`
in `crates/config/src/plan.rs` has no language step. A language-only document
therefore ends as `no_changes` (`409`), and language steps in a larger apply are
not written. Use `PUT /v1/languages` to replace the language list instead.
