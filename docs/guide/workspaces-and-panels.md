# Workspaces & panels

A workspace is a named tab in the top bar. Inside it, the screen is divided into
panes, and each pane holds one or more view tabs. This page explains how to
switch workspace, arrange panes, and add views.

## Switch workspace

- Click a workspace tab.
- Press `Ctrl+1` through `Ctrl+9` (or `Cmd+1` through `Cmd+9` on macOS) for the
  first nine workspaces.
- Press `Ctrl+K`, choose `Open workspace`, and pick a workspace from the list.

Workspaces are ordered with `Data model` before the type workspaces, then other
workspaces such as `Sources`, and `Review` last. Only the first nine get a number
and a shortcut.

## Panes, views, and tabs

The words on screen have specific meanings:

- A **workspace** is the top-level tab with the whole tiled layout.
- A **pane** is one visible region of that layout.
- A **view** is the content in a pane, such as an object table, a detail view, a
  graph, a history, a structure tree, or a model table.
- A **view tab** is a tab inside a pane. One pane can hold several views as tabs.

Click inside a pane, away from a button, link, or field, to focus it. Click a
view tab to make that view the active one in the pane. The focused view is the one the layout shortcuts and the
`View menu` act on.

## Add a view

There are two places to add a view to the focused pane:

- Press `Ctrl+K`, choose `Add view`, and pick a row.
- Open the `View menu` on the pane or right-click a view tab and choose
  `Add view`.

The list contains every existing view by title plus one row per object type. An
existing view is brought into the focused pane. A type row opens that type's
object table; if the table is already open, a second copy is placed to the right.

## Arrange the layout

Use the `View menu` (the button with three dots on a pane, or a right-click on a
view tab) for layout commands:

| Command | Effect |
| --- | --- |
| `Split left`, `Split right`, `Split above`, `Split below` | Pull the view out to that side |
| `Move left`, `Move right`, `Move up`, `Move down` | Move the focused view |
| `Maximize` | Let the focused view fill the workspace |
| `Close view` | Close the focused view |
| `Add view` | Choose a view for this pane |
| `Select source` | Choose what an object table lists; see [Data sources](/docs/data-sources) |

You can also drag a view tab onto another pane or tab strip. Drop zones read
`Dock left`, `Dock right`, `Dock top`, `Dock bottom`, and `Add as tab`. Dragging a
divider between panes resizes them.

The same actions are available as keyboard shortcuts:

| Shortcut | Action |
| --- | --- |
| `Alt` + arrow | Focus the neighbouring pane |
| `Ctrl+Alt` + arrow | Move the focused view |
| `Ctrl+Alt+Shift` + arrow | Resize the focused split |
| `Ctrl+Alt+Z` | Maximize or restore the focused pane |
| `Ctrl+Alt+W` | Close the focused view |

Double-clicking a view tab also maximizes it, and double-clicking again restores
the layout. Closing the last view leaves an empty pane with the message
`Nothing to show`; add a view from the palette to fill it again.

## Create a workspace

New workspaces come from templates. Press `Ctrl+K` and choose
`New from template`:

- `Data model` creates a workspace for structures, object types, link types,
  value lists, units, and attribute definitions.
- `Review` creates a workspace for proposals, batches, jobs, and import mappings.
- An object type creates that type's standard workspace, or opens the existing
  one if it is already there.
- A saved workspace template creates a new workspace from that template.

There is no blank workspace and no rename command in the current app. A
workspace tab's menu can lock or unlock the workspace or delete it. Deleting
moves the workspace and its views to Trash; the object data stays. The last
workspace, and a locked workspace, cannot be deleted.

## What is saved

The layout is saved automatically per workspace and per user. Local changes are
painted immediately, and the workspace document is saved shortly after you stop
moving things. Table filters, sorting, grouping, column widths, and column
preferences are saved with the view.

A locked workspace stays as everyone sees it: your layout edits are kept as your
personal copy and do not overwrite the shared layout. Press `Ctrl+K` and choose
`Reset layout` to restore the saved workspace layout.
