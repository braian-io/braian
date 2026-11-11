# Object types and relations

The data model is a definition set: languages, unit families, value lists, a shared
attribute pool, object types and structures. Nothing is locked to a product or
article: an object type is whatever you define.

## Types and attributes

An object type has an id, a key, labels, a singular and plural name, a key attribute,
a list of attributes and allowed structures. It is either an entity type or a link
type.

Attributes are defined once in the shared pool. An attribute carries its rules:

- value type and length
- whether it is language dependent
- a value list, shared or inline
- a unit family
- numeric or text constraints

A structure (a group tree) and its groups decide where an attribute applies. Rules
live on the attribute definition, not on a type. Applicability can come from an
ancestor group; the same attribute is then shown once with all its sources. Values
are never inherited, copied or overwritten. Older class lists are still read for
compatibility and appear as sections in Detail, but the editor writes group
attributes.

Language tags are stored as given: `sv` and `sv-SE` are different values. Value
lists have stable option codes with labels per language. A unit belongs to a unit
family with a base unit and a factor; the stored number keeps the entered unit, and
the index normalizes to the base unit for filters and sorting.

## Relations

A link type is itself an object type, with `kind: link`. It describes a directed
relation:

- allowed types on each end
- a label for each direction (what the source shows and what the target shows)
- a cardinality for each direction: `one` or `many`

Cardinality is enforced in the database. A link instance is stored as a link object
plus the row that points from one object to another. The link object can have its
own attribute values. Link objects are keyless and are not listed as normal rows.

Create a link from the detail pane's link section, by dragging a row onto it, or
from a node in the graph. Remove a link from the link section; if it has values the
app asks first and offers undo. Link-type administration lives in the model
workspace's Link types table.

## Versioned definitions

Definitions are append-only revisions. Model edits are staged as draft steps, shown
as a diff and saved as a new revision. A draft based on an older revision must be
rebased; it is never silently merged. A model delete is a proposal with a
consequence report, so destructive changes can be reviewed before they are saved.

The API and MCP expose the same model operations to a person and to the agent. A
person saves; the agent can propose model changes but cannot delete definitions.

## Related

- [Data sources](data-sources.md)
- [Graph](graph.md)
- [Deleting and restore](deleting-and-restore.md)
