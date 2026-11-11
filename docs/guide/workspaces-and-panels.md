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

Drag a tab to another pane to move the view. Drag a divider to resize a split. The
layout is tiled; panels are not floating windows and cannot be detached from the
browser tab.

Keyboard layout commands:

| Chord | Action |
| --- | --- |
| `Alt` + arrow | Focus the neighbouring pane |
| `Ctrl+Alt` + arrow | Move the focused view |
| `Ctrl+Alt+Shift` + arrow | Resize the focused split |
| `Ctrl+Alt+Z` | Maximize the focused pane |
| `Ctrl+Alt+W` | Close the focused view |

## Switching workspaces

The top bar lists the workspaces in a stable order: the data model first, then type
workspaces, then other workspaces, with Review last. `Ctrl+1` to `Ctrl+9` open the
first nine in that order; there is no fixed limit of nine workspaces and no empty
slot. A click on a tab does the same.

Create a workspace from a template in `Ctrl+K` (model, review, a type workspace, or a
saved template). A workspace can be locked to stop layout edits, shared by link, and
deleted from its tab menu or `Ctrl+K`. The last workspace cannot be deleted.

## What is saved, and for whom

- The layout document (splits, tabs, focus) is stored per user and per workspace. A
  newer local copy wins over an older server copy.
- An unlocked workspace also saves its canonical layout for everyone. A locked or
  shared workspace keeps layout edits personal.
- Table filters, sorting, grouping and column widths are saved on the view row and
  therefore shared in the workspace. Column order and hidden columns are personal
  preferences.
- An object selection is not part of the saved view state.

Filters, sorting and grouping run on the server across the whole catalog, not only
the rows that are loaded in the browser. When a colleague saves, open views update
from the change stream; there is no manual refresh.

## Related

- [Data sources](data-sources.md)
- [Command palette and shortcuts](command-palette-and-shortcuts.md)
