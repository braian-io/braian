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
value. In the picker, those fields show the group name as a source hint, and
typing the group name finds them. Linked fields are listed one hop away and stay
read-only.

A measured number field can be added as the combined column, as separate value and
unit columns, or as all three. The separate columns are labelled `Name (value)` and
`Name (unit)`; the value column shows only the number and the unit column only the
unit code. The separate value and unit columns are display-only. A display unit
chosen on the combined column only changes how the number is shown there, and leaves
the value and unit columns alone.

## Switching workspaces

The top bar lists the workspaces in a stable order: the data model first, then type
workspaces, then other workspaces, with Review last. `Ctrl+1` to `Ctrl+9` open the
first nine in that order; there is no fixed limit of nine workspaces and no empty
slot. A click on a tab does the same.

## Create a workspace

New workspaces come from templates. Press `Ctrl+K` and choose `New from template`:

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
- Table filters, sorting, grouping and column widths are saved on the view row and
  therefore shared in the workspace. Column order and hidden columns are personal
  preferences. `Reset to default` in the column menu or `Ctrl+K` clears that personal
  override and restores the view's default columns.
- An object selection is not part of the saved view state.

The layout is saved automatically per workspace and per user. Local changes are
painted immediately, and the workspace document is saved shortly after you stop
moving things. Press `Ctrl+K` and choose `Reset layout` to restore the saved workspace
layout.

Filters, sorting and grouping run on the server across the whole catalog, not only the
rows that are loaded in the browser. When a colleague saves, open views update from
the change stream; there is no manual refresh.

## Review and save

An object table and a Detail view share the same Save/Discard draft bar. Both act on
the same unsaved cells, so an edit made in one view is visible in the other.

A Save that fails on the server or in transport is shown as an error. It is not a
field-validation error, so the draft stays valid and Save is still available: fix the
cause and press Save again. The previous error clears when a new save starts, when a
save succeeds, or when you switch to another object. Real field-validation errors
still block Save until the value is corrected.

While a save request is in flight, Save reads `Saving…` and both Save and Discard are
disabled. A second click cannot run another save, so it never reports `Saved` when
nothing was saved. When the request finishes, the bar returns to Save and Discard, or
disappears if the draft is gone.

## Related

- [Data sources](/docs/data-sources)
- [Command palette and shortcuts](/docs/command-palette-and-shortcuts)
