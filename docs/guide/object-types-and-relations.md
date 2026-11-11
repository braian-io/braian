# Object types & relations

Braian does not ship fixed types such as product or article. You define the
model yourself: structures group your objects, object types describe them,
attributes hold their fields, and link types describe relations between them.

## Open the model

The `Data model` workspace in the top bar contains the model views:

- `Structures`, `Object types`, `Link types`, `Value lists`, and `Units` in the
  first pane.
- `Type attributes` and `Attribute definitions` in the next pane.
- `List values` and `Model graph` in the last pane.

Object-type workspaces also include a `Group attributes` view for the selected
object, and a structure tree when the type uses structures.

## Structures and groups

A structure is a named tree. Each node in the tree is a group, and groups can be
nested. An object can sit in a group, and its effective fields include the
attributes of its type plus the attributes of every group it sits in, including
parent groups.

In the `Structures` view, create a tree with `New structure`. Each structure and
group has a `More actions` menu with `Add child`, `Rename`, `Rename key`, `Move`,
and `Delete…`. The tree also supports keyboard editing:

- `F2` renames the selected node.
- `Insert` adds a child.
- `Delete` or `Backspace` deletes the selected node.

An object type can restrict which structures it may use. Open the type's detail
and use the `Allowed trees` checkboxes; the hint reads `Structures this object
type may use for grouping.`

## Object types

An object type is either an entity type or a link type. This section covers
entity types; link types are described under relations.

Create an entity type from the `Object types` table with `New type`, or press
`Ctrl+K` and choose `New type`. The dialog asks for `Singular`, `Plural`, and
`Key`, and saves with `Save`. The table lists `Singular`, `Plural`, and `Key`.
Selecting a row selects that type's attributes in `Type attributes`.

The key is the stable identifier used in configuration and in the API. Choose a
short key and keep it stable after objects exist.

## Attributes

`Type attributes` lists the fields of the selected type. Add one with
`New attribute`, either from the button in the view or from `Ctrl+K`. The dialog
asks for `Name` and `Type`.

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

`Attribute definitions` is the shared attribute library across the model. It
lists `Name`, `Key`, `Type`, `Unit`, `Value lists`, `Flags`, and `Used in`, and
its actions include `Add to type…`, `Add to group…`, `Rename…`, `Rename key…`,
and `Delete…`.

`Value lists` and `Units` hold reusable choices and units. Their creation dialogs
are `New value list`, `New value`, `New unit family`, and `New unit`, with fields
such as `Name`, `Key`, `Unit family`, `Unit`, and `Factor`. The `List values`
view shows the values of the selected value list.

Most type, attribute, link, value-list, and unit edits are collected in a draft.
The model bar shows `N unsaved changes` with `Save` and `Discard draft`. Press
`Ctrl+S` to open the save review for the draft.

## Relations with link types

A relation is a link type. A link type connects a `From type` to a `To type` and
can carry its own attributes. Create one from the `Link types` table with
`New link type`, or from `Ctrl+K` and `New link type`. The dialog asks for
`Name`, `From type`, and `To type`; new link types start as many-to-many.

The `Link types` table lists `Singular`, `Plural`, and `Key`. Cardinality and
link attributes are part of the model document that Braian loads, but the
current dialog does not expose them; it creates a many-to-many link type without
extra link attributes.

## Add and remove links

Links between objects are edited on the object's `Detail` view:

- Each link type has a section with a count and an `Add link…` button.
- The `Add link…` dialog asks you to choose a link type when several apply,
  fills any link attributes the type defines, and confirms with `Confirm`.
- If the other side allows only one link and one already exists, Braian explains
  the replacement and offers `Replace link`.
- Select a link row and press `Ctrl+Enter` for the link menu, which contains
  `Edit link attributes` and `Remove link`.
- In an object table you can also drag a row onto another table to create a
  link.

The `Graph` view in an object-type workspace shows the selected object and its
neighbours. Its toolbar has `Fit`, `Re-layout`, and `Open full size` or
`Close full size`; very large graphs show the first 400 nodes. Selecting a node
shows `Properties`, `Pin` or `Unpin`, `Add link…`, and `Attribute provenance`.
The `Model graph` view in the Data model workspace shows the types and their
relations instead of individual objects.

A dedicated guide for the graph view will follow once that work is approved.

## Tips

- Model first, then data: create types, attributes, and link types before you
  import or enter many objects.
- Use groups for shared fields that should apply across types.
- Use a value list for fixed choices and a unit family for measures.
- Open [Data sources](/docs/data-sources) next to learn how a table follows
  another table through a link type.
