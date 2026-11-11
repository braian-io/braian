# Deleting and restore

Deleting an object is a person's action. It is available from four places, opens one
confirmation dialog and writes to the API immediately after confirmation — it is not
part of the draft/Save flow that object edits use.

## Four entry points

1. **Row or cell context menu** — `Delete…` on the selected row(s).
2. **Detail pane** — the delete action in the object header when Detail has an object
   open.
3. **Command palette** — `Ctrl+K`, type `Delete`, and choose the object command.
4. **Delete key** — on one or more selected rows in an object table.

All four open the same dialog. The Delete key does nothing while a cell editor, input,
textarea or contenteditable element has focus, and it does not take the key from the
structure tree or from import mapping.

## The confirmation

The dialog asks the server for a dry run (`DELETE /v1/objects/{id}?dry_run=1`) and
shows the counts before anything is removed: how many objects and how many links will
disappear, with the server's sentence when it has one. For a multi-selection the
dialog merges the counts and counts a link shared by two selected objects once.

**Cancel** has focus by default. `Escape` or an overlay click cancels and writes
nothing. The primary action is a danger **Delete**.

## What happens on confirm

A human confirm writes one `DELETE /v1/objects/{id}` per selected id, using the normal
delete operation. A single object is soft-deleted into Trash; it disappears from
tables and search after the indexer catches up. There is no extra Save step.

A multi-selection runs the deletes sequentially after the one confirmation. If one
fails, the run stops, the dialog shows the error, and objects already deleted stay in
Trash. That is visible rather than rolled back.

Agents and imports cannot delete. `DELETE /v1/objects/{id}` returns `403
agent_cannot_delete`, and the agent tool list omits delete operations. The same
restriction covers removing links, accepting or discarding a proposal, running a
merge and wiping a catalog. A person makes every one of those changes.

## Trash and restore

Deleted objects appear in **Trash**. **Restore** (the button keeps that label) brings
the object back and, in the same transaction, restores the link rows and link objects
that were cascade-deleted with it in the same deletion event. The restore matches the
shared batch id and the `{link_removed:true}` changes from that event.

Links deleted before the object, or in a different batch, stay deleted. A key or
cardinality conflict rolls the whole restore back instead of leaving a half-restored
object.

## Related

- [Object types and relations](object-types-and-relations.md)
- [Command palette and shortcuts](command-palette-and-shortcuts.md)
