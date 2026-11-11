# Deleting and restore

Deleting an object is a person's action. It is available from four places, opens one
confirmation dialog and writes to the API immediately after confirmation — it is not
part of the draft/Save flow that object edits use.

> **Current demo note.** On build `5f2402e` the count line can over-count cascade
> links — a product with two links showed “Removes 3 objects and 2 links” — and
> **Restore** can leave Detail and Graph showing “The graph could not be loaded”.
> Row 216b fixes the counts and Restore. Until that fix is deployed, read the counts
> and the restore behaviour below as the intended behaviour.

## Four entry points

1. **Row or cell context menu** — `Delete…` on the selected row(s).
2. **Detail pane** — the delete action in the object header when Detail has an object
   open.
3. **Command palette** — `Ctrl+K`, type `Delete`, and choose the object command.
4. **Delete key** — on one or more selected rows in an object table.

All four open the same dialog. The Delete key does nothing while a cell editor, input,
textarea, contenteditable element, or the table quick-filter has focus, and it does
not take the key from the structure tree or from import mapping.

## The confirmation

The dialog asks the server for a dry run (`DELETE /v1/objects/{id}?dry_run=1`) and
shows one count sentence before anything is removed. That sentence names how many
selected objects and how many links will disappear, with correct singular and plural,
for example `Removes 1 object and 1 link` or `Removes 2 objects and 1 link`.

Link objects that are cascade-deleted are counted as links, never as extra objects.
The count row is shown once. For a multi-selection the dialog merges the counts and
counts a live link shared by two selected objects once.

**Cancel** has focus by default. `Escape` or an overlay click cancels and writes
nothing. The primary action is a danger **Delete**.

## What happens on confirm

A human confirm writes one `DELETE /v1/objects/{id}` per selected id, using the normal
delete operation. A single object is soft-deleted into Trash; it disappears from
tables and search after the indexer catches up. There is no extra Save step.

If Detail or Graph is still looking at that object, it shows an honest deleted state
(`This object is deleted. Restore it from Trash to see it here again.`) rather than a
graph or validation error such as `The graph could not be loaded. Validation stopped
the save.`

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

Links deleted before the object, or in a different batch, stay deleted. After Restore
the object opens again in Detail and Graph, including after a reload (F5). A key or
cardinality conflict rolls the whole restore back instead of leaving a half-restored
object.

## Related

- [Object types and relations](/docs/object-types-and-relations)
- [Command palette and shortcuts](/docs/command-palette-and-shortcuts)
