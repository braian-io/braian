# Data sources

A view does not have to show every object of its type. **Select source** binds it to
another open view or tree, and the rows follow that source live.

Open the command from the view's `…` menu or from `Ctrl+K` › **Data source**. The
list is filtered by the target view's bound type, not by whichever source the view
currently uses.

## The three source families

1. **All objects of the type.** The default. Header shows `All …`.
2. **A row in another object table.** If a link type connects the target view's type
   to the type of another open table, that peer is listed. Choose the row and the
   view shows the objects linked to it, for example articles from the selected
   product or products from the selected article. Header shows `Linked to: …`. If several link types connect the two
   types, one row per link type is offered.
3. **A node in a structure tree.** An open structure tree whose selected group can
   yield the target type is listed. The table shows the objects placed in that group.
   The filter is the exact placed group, not the whole subtree.

Sources that cannot produce the target type are not listed. A Products view never
offers an Article-only source, and a source with no derivation path never appears.

## Empty states and cycles

A live source can be empty. The view then says so — `Select a row in …`, `No linked
… for …`, or the tree's own prompt — and offers **Show all** to go back to the full
type. It never falls back to every row silently.

A choice that would close a follow chain is still listed but disabled, with the
reason `Would create a cycle (… follows …)`.

## Persistence

The selected source is saved on the view, so it survives a reload. A row-based peer
is restored with the same rows. A structure-tree source restores the same tree and
group, but the selected node itself is not part of the readable URL, so after a
reload the view can show its `Select a row…` state until you select the node again.

## Related

- [Workspaces and panels](workspaces-and-panels.md)
- [Object types and relations](object-types-and-relations.md)
