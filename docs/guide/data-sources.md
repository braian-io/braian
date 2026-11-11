# Data sources

A view does not have to show every object of its type. **Select source** binds it to
another open view or tree, and the rows follow that source live. Braian also uses the
word "source" for catalogs, and imports and saved selections are related ways to
bring or filter data.

## Table sources

Every object table lists one object type. Its rows come from one of two places:

- **All of the type.** This is the default. Header shows `All …`, and the table shows
  every object of its type in the effective catalog.
- **A peer source.** The table follows the current selection in another open object
  table, or the current node in an open structure tree. The source is read live; the
  rows are not copied.

Open the command from the view's `…` menu or from `Ctrl+K` › **Data source**. The list
is filtered by the target view's bound type, not by whichever source the view
currently uses.

The rows in the picker use these labels:

- `All {type}` for the whole type.
- `{type} from {source}` for a peer table or tree.
- `{type} from {source} via {linkType}` when more than one link type connects the two
  types.

The active row carries a `Current` chip.

## The three source families

1. **All objects of the type.** The default.
2. **A row in another object table.** If a link type connects the target view's type
   to the type of another open table, that peer is listed. Choose the row and the view
   shows the objects linked to it, for example articles from the selected product or
   products from the selected article. Header shows `Linked to: …`. If several link
   types connect the two types, one row per link type is offered.
3. **A node in a structure tree.** An open structure tree whose selected group can
   yield the target type is listed. The table shows the objects placed in that group.
   The filter is the exact placed group, not the whole subtree.

Sources that cannot produce the target type are not listed. A Products view never
offers an Article-only source, and a source with no derivation path never appears.

A table that follows a peer shows the source view and the current selection in its
header, for example `All Products · Products › 1001`, and the table body can show
`Linked to: {source}`.

Only object tables have a table source. Detail, graph, history, structure, and model
views do not.

## Empty states and cycles

A live source can be empty. The view then says so — `Select a row in …`, `No linked
… for …`, or the tree's own prompt — and offers **Show all** to go back to the full
type. It never falls back to every row silently. The palette uses the same empty copy
`Source no longer exists` when a saved source has gone.

A choice that would close a follow chain is still listed but disabled, with the reason
`Would create a cycle (… follows …)`.

## Persistence

The selected source is saved on the view, so it survives a reload. A row-based peer is
restored with the same rows. A structure-tree source restores the same tree and group,
but the selected node itself is not part of the readable URL, so after a reload the
view can show its `Select a row…` state until you select the node again.

## Catalogs

A catalog is a complete model and data set with its own keys and search index. There
is one master catalog, and the deployment may add source catalogs.

The catalog selector in the top bar shows the current workspace catalog. Its
accessible name is `Switch catalog`, and the menu lists the available catalogs with a
checkmark on the active one. It is disabled when the workspace is locked.

You can also press `Ctrl+K` and choose `Switch catalog`. That command sets the catalog
for the focused view only; the top-bar selector sets it for the whole workspace. A
view uses its own override when it has one, otherwise the workspace catalog, otherwise
the master catalog.

The `Catalogs` view in the `Sources` workspace lists catalogs with their name, key,
and kind. A source catalog has `Infer model` and `Clean up` actions, and the view has
a `New source catalog` form with `Catalog key`, `Catalog name`, `Editable`, and
`Save`.

## Source catalogs and merges

The `Sources` workspace also contains `Merge profiles`, `Merge runs`, and `Ownership`.
A merge profile ties a source catalog to the master catalog. Its form includes
`Profile key`, `Profile name`, `Source catalog`, `Mode` (`Manual` or `Continuous`),
`Schedule`, `Match attribute`, `Master key`, `Attribute map`, `When nothing matches`
(`Skip` or `Create`), and `When the source deletes` (`Ignore` or `Propagate`). The
actions are `Save profile`, `Dry run`, and `Run merge`.

`Merge runs` shows the result of merge runs, and `Ownership` shows which catalog owns
which objects. These views are for catalogs that are fed from another system; a
single-catalog workspace may never need them.

## Imports

To bring rows in from a file, press `Ctrl+K` and choose `Import file…`, or drag an
Excel or CSV file onto the app. The drop area reads `Drop to import` while you drag,
and the empty import screen offers `Choose file`.

An import has three steps, shown as `1 Map`, `2 Check`, and `3 Save`:

- **Map.** Choose the `Type` and how rows are matched with `Matched by`. The checkbox
  `Empty cells remove the stored value (otherwise they are left unchanged)` controls
  empty cells. Each file column is mapped to a field or to `Don't import`. `Save
  mapping as…` stores the mapping for files with the same columns, and `Next` moves on.
- **Check.** Review the draft with the filters `All`, `New`, `Changed`, `Errors`,
  `Unchanged`, and `Excluded`. You can leave out invalid cells instead of skipping the
  row, include a row that was left out, download failing rows with `Download failing
  rows (.xlsx)`, go `Back to mapping`, or approve with `Approve N rows`.
- **Save.** Braian reports the result as `Imported {created} · Updated {updated} ·
  Skipped {skipped}`.

Imports use saved mappings, available in the `Import mappings` view with the columns
`Name`, `Object type`, `Columns`, and `Delete`. A running import can be reopened from
its `?import=` URL.

Braian accepts `.xlsx`, `.xls`, `.csv`, `.tsv`, and `.txt` files. The error text for a
rejected file still names only `.xlsx`, `.xls`, and `.csv`.

## Saved selections

A selection is a saved filter, not a live table source. Selections appear as chips in
the table filter bar next to `All`, `Type`, and `Status`. Selecting a chip applies its
filter; clicking the active chip clears it.

Create one from the `Selections` view with `New selection`, or from `Ctrl+K` and `New
selection`. The dialog has `Selection`, `Type`, `Kind` (`Dynamic` or `Manual`), and
`Filter query`. The filter query uses the same syntax as a view filter, for example
`type_key:=product && groups:=food:cheese`. The button is `Save selection`.

A dynamic selection follows its filter. A manual selection is filled by hand.
Selections are listed with an `Edit selection` and `Delete selection` action for each
row.

## Which one do I need?

| I want to | Use |
| --- | --- |
| Show every object of a type | The default `All {type}` table source |
| Show the objects linked to the selected row | A peer table source |
| Work against a different model or data set | Switch catalog |
| Bring in a spreadsheet | Import a file |
| Save a filter for reuse | A selection |

## Related

- [Workspaces and panels](/docs/workspaces-and-panels)
- [Object types and relations](/docs/object-types-and-relations)
