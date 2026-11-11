# Command palette and shortcuts

`Ctrl+K` opens the command palette. It is the keyboard route to workspaces, views,
objects, the data source picker, model commands, layout commands, the agent and
feedback. Type to filter; recent choices are ranked by frecency.

- `Enter` runs the highlighted row.
- `Ctrl+Enter` (or `Ctrl+K` on a result) opens its actions.
- `Backspace` on an empty query goes up one level; `Escape` closes the palette.
- Rows whose command has a chord show it. Not every command has one.

## Agent in the palette

`Ctrl+J` opens the agent palette. Inside the palette, `Ctrl+J` asks the agent with the
current query. The agent runs in the context you are looking at: the focused view,
the selected rows and the current filter. It proposes changes; a person reviews and
saves them. See [Deleting and restore](deleting-and-restore.md) for what the agent
may not do.

## Shortcuts

| Chord | Action |
| --- | --- |
| `Ctrl+K` | Open the command palette |
| `Ctrl+J` | Open the agent palette |
| `Ctrl+S` | Save review drafts |
| `Ctrl+Shift+B` | Send feedback (when the operator enables it) |
| `F1` | Show keyboard shortcuts |
| `Ctrl+1`…`Ctrl+9` | Open the first nine workspaces |
| `Alt` + arrow | Focus the neighbouring pane |
| `Ctrl+Alt` + arrow | Move the focused view |
| `Ctrl+Alt+Shift` + arrow | Resize the focused split |
| `Ctrl+Alt+Z` | Maximize the focused pane |
| `Ctrl+Alt+W` | Close the focused view |
| `Ctrl+Shift+←` / `→` | Move the active table column |

In a table, arrows move the active row and `Enter` opens it; `Delete` opens the delete
dialog for the selected rows unless a cell editor or text input has focus. In a
structure tree, arrows move and `Enter` selects.

The authoritative list is generated from the app's shortcut registry in
[../shortcuts.md](../shortcuts.md). `F1` shows the same list inside the app.

## Related

- [Workspaces and panels](workspaces-and-panels.md)
- [Data sources](data-sources.md)
