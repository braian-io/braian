# Workspaces and panels

A workspace is one saved layout for one job: enrichment, review, the data model or a
single object type. Braian creates a type workspace automatically for every entity
type that does not have one yet, and the seed ships with a workspace per type.

## Panels are views

A panel is a view in a tiled split/tabs tree. A view keeps its own kind and state.
The common kinds are:

- object table
- object detail
- structure tree
- graph
- history
- data model and model tables (types, attributes, groups, value lists, units, link types)
- proposals, agents, batch log, job history
- imports, catalogs, merge profiles and runs, ownership rules
- embed

The words on screen have specific meanings:

- A **workspace** is the top-level tab with the whole tiled layout.
- A **pane** is one visible region of that layout.
- A **view** is the content in a pane, such as an object table, a detail view, a
  graph, a history, a structure tree, or a model table.
- A **view tab** is a tab inside a pane. One pane can hold several views as tabs.

Click inside a pane, away from a button, link, or field, to focus it. Click a view tab
to make that view the active one in the pane. The focused view is the one the layout
shortcuts and the `View menu` act on.

Drag a tab to another pane to move the view. Drag a divider to resize a split. The
layout is tiled; panels are not floating windows and cannot be detached from the
browser tab.

## Open a view

Press `Ctrl+K` and choose `Open view` to list the views in the workspace by title.
Choosing one focuses and activates that view where it already sits in the layout. It
does not move the view into the focused pane, and it does not close or replace the
structure tree or the graph. Use it to bring an open view back into focus; it never
creates a copy. The list leaves out old agent-run tabs, so it only offers real views.

## Open a structure tree from the palette

Press `Ctrl+K`, choose `Open structure ›`, and pick a structure by label or key.
`Enter` opens its tree in the focused pane (or beside Detail when Detail is focused,
so Detail stays visible). `Ctrl+Enter` opens it in a new pane to the right. Braian
reuses an existing `structure_tree` view when the view state carries the same
structure key or id; it never matches only on title.

## Add a view

There are two places to add a view to the focused pane:

- Press `Ctrl+K`, choose `Add view`, and pick a row.
- Open the `View menu` on the pane or right-click a view tab and choose `Add view`.

The list contains every existing view by title plus one row per object type. An
existing view row is brought into the focused pane.

A type row always creates a new object table for that type in a new pane immediately
to the right of the existing table of the same type. When no table of that type is
open, the new table goes in a new pane to the right of the focused pane. It never
reopens a closed copy, never adds a second tab in the same pane, and never folds the
copy into an existing neighbour pane. Closed views stay closed, and you do not need
`Move right` to get the second table beside the first.

## Arrange the layout

Use the `View menu` (the button with three dots on a pane, or a right-click on a view
tab) for layout commands:

| Command | Effect |
| --- | --- |
| `Split left`, `Split right`, `Split above`, `Split below` | Pull the view out to that side |
| `Move left`, `Move right`, `Move up`, `Move down` | Move the focused view |
| `Maximize` | Let the focused view fill the workspace |
| `Close view` | Close the focused view |
| `Add view` | Choose a view for this pane |
| `Select source` | Choose what an object table lists; see [Data sources](/docs/data-sources) |

You can also drag a view tab onto another pane or tab strip. Drop zones read `Dock
left`, `Dock right`, `Dock top`, `Dock bottom`, and `Add as tab`. Dragging a divider
between panes resizes them.

Keyboard layout commands:

| Chord | Action |
| --- | --- |
| `Alt` + arrow | Focus the neighbouring pane |
| `Ctrl+Alt` + arrow | Move the focused view |
| `Ctrl+Alt+Shift` + arrow | Resize the focused split |
| `Ctrl+Alt+Z` | Maximize the focused pane |
| `Ctrl+Alt+W` | Close the focused view |

Double-clicking a view tab also maximizes it, and double-clicking again restores the
layout. Closing the last view leaves an empty pane with the message `Nothing to
show`; add a view from the palette to fill it again.

## Detail and the table share space

Arrow keys in an object table select the row and open Detail from the list data right
away. Fast arrowing still updates the highlight and a list preview on every step; only
the network load for the full object (body, owners, proposals) is debounced to the row
you land on. The landed row and up to three neighbors on each side are prefetched so
normal up/down movement stays instant without one request per key repeat. Fields and
links that are not in the list preview show skeletons until the full object arrives;
Save stays off until then. If the full object cannot be loaded, Detail shows a clear
error with **Retry** instead of endless skeletons; arrowing to another row clears the
error and tries again.

When an object table and a Detail view sit side by side, the table keeps a usable
minimum width. The split never shrinks it down to a single column, so the Name column
stays readable while you work in Detail. The Detail pane takes the rest of the space
and gives it back when you drag the divider.

Long Detail titles wrap. Every title and single-line field value also carries the
full text as a tooltip, so a narrow pane never hides the rest of a name or value. In a
very narrow Detail pane the labels move above their fields instead of squeezing the
value to one letter, and a language tag stays beside the value rather than replacing
it.

Measured number fields start at the compact width and grow with the field when the
pane has room, so a longer number stays readable. The same shared layout and theme
tokens apply in light and dark theme.

When the open object is deleted, Detail shows a calm empty state (`This object was
deleted.`) with no fields and no Save/Discard bar, rather than a graph or validation
error.

## Select fields

`Select fields` chooses which columns an object table shows, and in which order.
Open it from `Ctrl+K`, the table toolbar, or the column header menu. The choice is
a personal preference; `Reset to default` clears it and restores the type's default
columns.

The picker lists:

- The type's own attributes, plus system columns such as Type and Version.
- Attributes from every group in the structures the type is allowed to use,
  including nested groups. On the seed food tree that includes Fat content from
  Dairy & eggs, Caffeine from Coffee & tea, and Cocoa content from Chocolate.
- Attributes from older class lists on those structures, when a revision still
  stores them. The editor writes group attributes instead, but the picker still
  offers the class-list fields so existing models keep them.

A group or class attribute can be added as a column even when not every row has a
value. In the picker, each field keeps its type label, and group-sourced fields
also show the full group path (for example `Food › Beverages › Coffee & tea`) as
muted secondary text. Typing any segment of that path, such as `beverages` or
`snacks`, finds the field. Linked fields are listed one hop away and stay
read-only.

The same catalog appears on every object type that is allowed to use the
structure. On **Articles**, `Select fields` therefore lists food-tree group
attributes such as Fat content and Caffeine even though a row may not carry a
value for them yet. The picker only chooses which columns may appear; values are
never inherited from the group tree.

A measured number field can be added as the combined column, as separate value and
unit columns, or as all three. The separate columns are labelled `Name (value)` and
`Name (unit)`; the value column shows only the number and the unit column only the
unit code. The separate value and unit columns are display-only. A display unit
chosen on the combined column only changes how the number is shown there, and leaves
the value and unit columns alone. Converted numbers are rounded for display (at most
two decimal places, trailing zeros omitted) in the table and in the Detail panel.
The stored value and unit are unchanged when you edit or save.

Unit labels keep conventional casing in column titles and cells, for example `kJ`,
`kcal`, `g`, and `mg`. A column titled `Energy (kJ)` shows values converted to
kilojoules when that display unit is selected.

In the field list, `Enter` with an empty filter still drills into fields that have
further steps (language, unit, links). It does not toggle simple columns, so the
first row (such as Number) is not turned off by accident. To add or remove a simple
field, type in the filter and press `Enter`, or click its checkbox.

## Switching workspaces

The top bar lists the workspaces in a stable order: the data model first, then type
workspaces, then other workspaces, with Review last. `Ctrl+1` to `Ctrl+9` open the
first nine in that order; there is no fixed limit of nine workspaces and no empty
slot. A click on a tab does the same.

## Create a workspace

New workspaces come from templates. Press `Ctrl+K` and choose `New from template`, or click
the **+** button after the last workspace tab in the top bar (tooltip: **New workspace**):

- `Data model` creates a workspace for structures, object types, link types, value
  lists, units, and attribute definitions.
- `Review` creates a workspace for proposals, batches, jobs, and import mappings.
- An object type (for example `Products`) creates a new workspace every time its
  standard workspace already exists. The first copy is named `Products 2`, the next
  `Products 3`, and so on. The original `Products` workspace keeps its name, share
  token and layout. If the type has no workspace yet, the command still creates the
  standard one, named after the type.
- `Data model` and `Review` open their existing canonical workspace when they already
  have one; they never create a second copy.
- A saved workspace template creates a new workspace from that template.

There is no blank workspace and no rename command in the current app. A workspace tab's
menu can lock or unlock the workspace or delete it. Deleting moves the workspace and
its views to Trash; the object data stays. The last workspace, and a locked workspace,
cannot be deleted.

## What is saved, and for whom

- The layout document (splits, tabs, focus) is stored per user and per workspace. A
  newer local copy wins over an older server copy.
- An unlocked workspace also saves its canonical layout for everyone. A locked or
  shared workspace keeps layout edits personal.
- Sorting, grouping and column widths are saved on the view row and therefore
  shared in the workspace. After a page reload, the table keeps the same sort
  and the column header shows the matching arrow. Column order and hidden columns
  are personal preferences.
  `Reset to default` in the column menu or `Ctrl+K` clears that personal override and
  restores the view's default columns.
- The free-text search in the table toolbar (the quick filter) is not saved as a view
  preference. Closing and opening the view again, or reloading the page, starts with
  an empty search box and the full table. While the view stays open, the search stays
  in this browser tab only: another session or user does not see it, and the server
  never keeps a toolbar search on the shared view row. While you type, remote UI
  commands cannot replace the search text. Clear it with the search box, or press
  `Clear search` in the empty state when the query matches nothing. The empty state
  names the query. Press `/` to focus the quick filter.
- An object selection is not part of the saved view state. The address still
  names the open object. After a reload, Detail and History show that object
  again without picking the row in the table.

The layout is saved automatically per workspace and per user. Local changes are
painted immediately, and the workspace document is saved shortly after you stop
moving things. Press `Ctrl+K` and choose `Reset layout` to restore the saved workspace
layout.

Filters, sorting and grouping run on the server across the whole catalog, not only the
rows that are loaded in the browser. When a colleague saves, open views update from
the change stream; there is no manual refresh.

## Review and save

An object table and a Detail view share the unsaved cells, so an edit made in one
view is visible in the other. The Save/Discard bar appears only in the pane where
the edit was made. The other pane may mark the row, and it does not show a second
Save. A proposal is a draft too (Pending, then Discard or Save). Its bar is in
Detail while Detail is open on that object, and in the table otherwise.

A Save that fails on the server or in transport is shown as an error. It is not a
field-validation error, so the draft stays valid and Save is still available: fix the
cause and press Save again. The previous error clears when a new save starts, when a
save succeeds, or when you switch to another object. Real field-validation errors
still block Save until the value is corrected.

While a save request is in flight, Save reads `Saving…` and both Save and Discard are
disabled in that pane. A second click cannot run another save, so it never reports
`Saved` when nothing was saved. When the request finishes, the bar returns to Save
and Discard, or disappears if the draft is gone.

## Review proposals

When a proposal is open and has pending rows, `Save all` is the primary action. It
paints as the filled accent button with full opacity; it never looks grey or disabled.
`Discard all` is the secondary danger action. It keeps its danger treatment so you can
recognise it, but it does not dominate `Save all`.

When a proposal is already accepted or discarded, both bulk actions are inactive.
They stay keyboard-focusable and expose the explanation via `aria-describedby` and the
button `title`, not only as a hover tooltip on the wrapper.

Discarding a server proposal asks for confirmation first. The dialog shows the
proposal name and the consequence: the proposal's consequence lines when it has them,
otherwise the name and a sentence saying that pending rows will be thrown away and the
proposal will be closed without saving. `Cancel` or dismissing the dialog leaves the
proposal open and does not discard anything. `Confirm` then runs the same discard path
as before. `Discard all` never discards silently.

## Contrast in both themes

Action labels and muted labels stay readable in both themes:

- Primary action buttons (Save, and Save all when it is primary) and danger buttons
  (Discard, Delete, and Review's Discard all) paint white text on a filled button. In
  the dark theme the fill keeps white text at or above 4.5:1 at rest and on hover. The
  fill uses a darker purple and a darker red than the accent and danger text tokens, so
  focus rings and status colours keep their own values.
- A selected choice chip shows the ordinary text colour on the dim accent wash. Its
  text stays at or above 4.5:1 in both themes. An unselected chip keeps the muted text
  colour and no accent wash.
- In the light theme, muted field labels and table column headers use a muted colour
  that stays at or above 4.5:1 on both the surface and the panel backgrounds.

The rules apply to the visible labels, not only to token values: hovering Save,
Discard, Delete, or Discard all must not lower the contrast below 4.5:1. The Detail
delete icon uses the lighter danger text token at rest and, in the light theme, the
filled danger hover colour on its tinted hover background so the composited contrast
stays at or above 4.5:1.

## Related

- [Data sources](/docs/data-sources)
- [Command palette and shortcuts](/docs/command-palette-and-shortcuts)
