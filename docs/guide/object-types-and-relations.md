# Object types and relations

The data model is a definition set: languages, unit families, value lists, a shared
attribute pool, object types and structures. Nothing is locked to a product or
article: an object type is whatever you define.

## Open the model

The `Data model` workspace in the top bar contains the model views:

- `Structures`, `Object types`, `Link types`, `Value lists`, and `Units` in the first
  pane.
- `Type attributes` and `Attribute definitions` in the next pane.
- `List values` and `Model graph` in the last pane.

Object-type workspaces also include a `Group attributes` view for the selected object,
and a structure tree when the type uses structures.

## Structures and groups

A structure is a named tree. Each node in the tree is a group, and groups can be
nested. An object can sit in a group, and its effective fields include the attributes
of its type plus the attributes of every group it sits in, including parent groups.

In the `Structures` view, create a tree with `New structure`. Each structure and group
has a `More actions` menu with `Add child`, `Rename`, `Rename key`, `Move`, and
`Delete…`. The tree also supports keyboard editing:

- `F2` renames the selected node.
- `Insert` adds a child.
- `Delete` or `Backspace` deletes the selected node.

An object type can restrict which structures it may use. Open the type's detail and
use the `Allowed trees` checkboxes; the hint reads `Structures this object type may
use for grouping.`

A structure (a group tree) and its groups decide where an attribute applies. Rules
live on the attribute definition, not on a type. Applicability can come from an
ancestor group; the same attribute is then shown once with all its sources. Values are
never inherited, copied or overwritten. Older class lists are still read for
compatibility and appear as sections in Detail, but the editor writes group
attributes.

## Object types

An object type is either an entity type or a link type. This section covers entity
types; link types are described under relations.

Create an entity type from the `Object types` table with `New type`, or press `Ctrl+K`
and choose `New type`. The dialog asks for `Singular`, `Plural`, and `Key`, and saves
with `Save`. The table lists `Singular`, `Plural`, and `Key`. Selecting a row selects
that type's attributes in `Type attributes`.

An object type has an id, a key, labels, a singular and plural name, a key attribute,
a list of attributes and allowed structures. The key is the stable identifier used in
configuration and in the API. Choose a short key and keep it stable after objects
exist.

## Attributes

Attributes are defined once in the shared pool. An attribute carries its rules:

- value type and length
- whether it is language dependent
- a value list, shared or inline
- a unit family
- numeric or text constraints

`Type attributes` lists the fields of the selected type. Add one with
`New attribute`, either from the button in the view or from `Ctrl+K`. The dialog asks
for `Name` and `Type`.

The attribute types offered in the UI are:

- `Text`
- `Number`
- `Boolean`
- `Date`
- `Value list`
- `Range`
- `File`

The table lets you edit the name, key, type, unit, required flag, show-by-default
flag, languages, and searchable flag. The row menu adds `Multiple`, `Filterable`,
`Sortable`, `Remove from this type`, and `Delete attribute everywhere…`.

`Attribute definitions` is the shared attribute library across the model. It lists
`Name`, `Key`, `Type`, `Unit`, `Value lists`, `Flags`, and `Used in`, and its actions
include `Add to type…`, `Add to group…`, `Rename…`, `Rename key…`, and `Delete…`.

`Value lists` and `Units` hold reusable choices and units. Their creation dialogs are
`New value list`, `New value`, `New unit family`, and `New unit`, with fields such as
`Name`, `Key`, `Unit family`, `Unit`, and `Factor`. The `List values` view shows the
values of the selected value list.

Most type, attribute, link, value-list, and unit edits are collected in a draft. The
model bar shows `N unsaved changes` with `Save` and `Discard draft`. Press `Ctrl+S` to
open the save review for the draft.

Language tags are stored as given: `sv` and `sv-SE` are different values. Value lists
have stable option codes with labels per language. A unit belongs to a unit family
with a base unit and a factor; the stored number keeps the entered unit, and the index
normalizes to the base unit for filters and sorting.

## Relations

A link type is itself an object type, with `kind: link`. It describes a directed
relation:

- allowed types on each end
- a label for each direction (what the source shows and what the target shows)
- a cardinality for each direction: `one` or `many`

Cardinality is enforced in the database. A link instance is stored as a link object
plus the row that points from one object to another. The link object can have its own
attribute values. Link objects are keyless and are not listed as normal rows.

Create one from the `Link types` table with `New link type`, or from `Ctrl+K` and `New
link type`. The dialog asks for `Name`, `From type`, and `To type`; new link types
start as many-to-many. Cardinality and link attributes are part of the model document
that Braian loads, but the current dialog does not expose them; it creates a
many-to-many link type without extra link attributes. Link-type administration lives
in the model workspace's Link types table.

## Add and remove links

Links between objects are edited on the object's `Detail` view:

- Each link type has a section with a count and an `Add link…` button.
- The `Add link…` dialog asks you to choose a link type when several apply, fills any
  link attributes the type defines, and confirms with `Confirm`.
- If the other side allows only one link and one already exists, Braian explains the
  replacement and offers `Replace link`.
- Select a link row and press `Ctrl+Enter` for the link menu, which contains `Edit link
  attributes` and `Remove link`.
- In an object table you can also drag a row onto another table to create a link.

Create a link from the detail pane's link section, by dragging a row onto it, or from
a node in the graph. Remove a link from the link section; if it has values the app
asks first and offers undo.

## Versioned definitions

Definitions are append-only revisions. Model edits are staged as draft steps, shown
as a diff and saved as a new revision. A draft based on an older revision must be
rebased; it is never silently merged. A model delete is a proposal with a consequence
report, so destructive changes can be reviewed before they are saved.

The API and MCP expose the same model operations to a person and to the agent. A
person saves; the agent can propose model changes but cannot delete definitions.

## Tips

- Model first, then data: create types, attributes, and link types before you import
  or enter many objects.
- Use groups for shared fields that should apply across types.
- Use a value list for fixed choices and a unit family for measures.
- Open [Data sources](/docs/data-sources) next to learn how a table follows another
  table through a link type.

## Related

- [Data sources](/docs/data-sources)
- [Graph](/docs/graph)
- [Deleting and restore](/docs/deleting-and-restore)
