# Command palette and shortcuts

`Ctrl+K` opens the command palette. It is the keyboard route to workspaces, views,
objects, the data source picker, model commands, layout commands, the agent and
feedback. Type to filter; recent choices are ranked by frecency.

The placeholder reads `Search, open views, or ask AI`. The palette groups rows under
headings such as `Recent`, `Navigation`, `Create`, `Data model`, `Links`, and
`Objects`. With an empty query it shows up to four recent destinations.

Common root commands include:

- `Open view`, `Open workspace`, and `Open object`, plus one `Open {type}` row per
  object type.
- `Add view`, `New from template`, and `Switch catalog`.
- `Data source`, `Select fields`, `Filter by`, `Export columns`, `Hide column`, and
  `Reset to default`.
- `Selections`, `Link to`, `New type`, `New link type`, `New value list`, `New unit
  family`, and `New tree`.
- `Reset layout`, `Delete workspace…`, and the model draft commands.
- Theme, feedback, sign-out, and the `Ask AI` row at the bottom.

`Reset to default` appears when the focused object table has a personal column
override. It clears the current user's column order and visibility for that view and
restores the view's default columns. The same command is in the column header menu,
opened with `Shift+F10` or the context-menu key.

## Keys inside the palette

| Key | Action |
| --- | --- |
| `↓` / `↑` | Move the highlight |
| `PageDown` / `PageUp` | Move a page at a time |
| `Home` / `End` | Jump to the first or last row |
| `Enter` | Run the highlighted row |
| `Tab` | Enter a sub-list when the row takes an argument |
| `Backspace` | Go up one level when the query is empty |
| `Escape` | Close the palette |
| `Ctrl+Enter` or `Ctrl+.` | Open the action panel for the highlighted entity |
| `→` | Open the action panel for an entity row |
| `Ctrl+J` | Ask AI with the current query |

`Enter` runs the highlighted row. `Ctrl+Enter` (or `Ctrl+K` on a result) opens its
actions. `Backspace` on an empty query goes up one level; `Escape` closes the palette
and does not go up a level. Rows whose command has a chord show it. Not every command
has one. The footer shows `Enter Run`, `Tab Open`, `⌫ Back`, `Ctrl+J Ask AI`, and
`Esc Close` as a reminder. When no row matches, the palette shows `No results for
"{query}"`.

## Action panels

An entity row in the palette has more than one action. For an object, the action panel
offers `Open`, `Open to the right`, and `Copy id`. For a view or workspace, it offers
`Place left`, `Place right`, `Place top`, `Place bottom`, and `New tab`.

## Agent in the palette

`Ctrl+J` opens the agent palette. Inside the palette, `Ctrl+J` asks the agent with the
current query. The input shows an `AI` badge and the placeholder `Ask AI`. Previous
turns are shown as clickable chips; send with `Enter` and close with `Escape`.

The agent runs in the context you are looking at: the focused view, the selected rows
and the current filter. It proposes changes; a person reviews and saves them. See
[Deleting and restore](/docs/deleting-and-restore/) for what the agent may not do.

AI replies require a model to be configured on the server. If it is not, the answer is
`AI isn't set up for this workspace`, and the agent tab explains that an administrator
sets `OPENAI_API_KEY` before the agent can reply.

## Help and feedback

Press `F1` to open the `Keyboard shortcuts` dialog. It lists `Ctrl+K` and every
shortcut in the app except `Escape` and `Ctrl+K` itself. Close it with `Close` or
`Escape`.

`Ctrl+Shift+B` sends feedback, but only when feedback is enabled for the deployment.
It does not appear in the UI otherwise, although the help dialog always lists the
shortcut. See [Feedback](/docs/feedback/).

## Shortcuts

| Chord | Action |
| --- | --- |
| `Ctrl+K` | Open the command palette |
| `Ctrl+J` | Open the agent palette |
| `Ctrl+S` | Save review drafts |
| `Ctrl+Shift+B` | Send feedback (when the operator enables it) |
| `F1` | Show keyboard shortcuts |
| `Escape` | Close help and menus |
| `Ctrl+1`…`Ctrl+9` | Open the first nine workspaces |
| `Alt` + arrow | Focus the neighbouring pane |
| `Ctrl+Alt` + arrow | Move the focused view |
| `Ctrl+Alt+Shift` + arrow | Resize the focused split |
| `Ctrl+Alt+Z` | Maximize the focused pane |
| `Ctrl+Alt+W` | Close the focused view |
| `Ctrl+Shift+←` / `→` | Move the active table column |

`Cmd` works in place of `Ctrl` for the app, workspace, move, resize, zoom, and close
shortcuts. Focus-pane shortcuts use `Alt` with the arrows only. Table column moves stay
on `Ctrl` on macOS so they do not interfere with word selection.

Shortcuts are ignored while a text field, text area, select box, or editable element
has focus. Layout shortcuts are ignored while the palette is open.

The authoritative list is generated from the app's shortcut registry in
[the shortcut reference](https://github.com/braian-io/braian/blob/main/docs/shortcuts.md).
`F1` shows the same list inside the app.

## Keys inside views

Some keys belong to a view rather than to the app:

- **Object table.** Arrow keys move focus, `Enter` or `Space` commits the row as the
  selection, and `Shift` plus an arrow key extends the selection. `←` and `→` move the
  active column. `Shift+F10` or the context-menu key opens the row menu. Double-click a
  cell to edit it, and press `/` to focus the quick filter.
- **Detail.** `↑` and `↓` move between fields, `Home` and `End` jump to the first or
  last field, `Ctrl+S` saves the object draft, and `Escape` discards it.
- **Structure tree.** `F2` renames, `Insert` adds a child, and `Delete` or `Backspace`
  deletes the selected node.
- **Model and definition tables.** `Enter` or `F2` edits a cell, `Escape` cancels, `Tab`
  moves to the next cell, and `Shift+F10` or the context-menu key opens the row menu.
- **Field picker.** Arrow keys move, `Enter` toggles or opens, `→` drills in, `←` or
  `Backspace` goes back, and `Escape` closes the picker. Closing the Select fields
  palette returns focus to the control that opened it, including when it is dismissed
  by clicking the backdrop. The list includes the type's attributes and the
  attributes from allowed structures (nested groups and older class lists). Group
  and class fields show their group name, and typing that name finds them. A
  measured number field can be added as the combined column or as separate value
  and unit columns.
- **Import.** `Ctrl+Z` and `Ctrl+Shift+Z` undo and redo a mapping, `Delete` or
  `Backspace` removes a column mapping, and `Escape` closes the import or its
  confirmation.

In a table, `Delete` opens the delete dialog for the selected rows unless a cell editor
or text input has focus. `Escape` closes the palette and the help dialog, cancels an
import confirmation, discards an object draft in Detail, and closes open context menus.
In the table grid, `Escape` does nothing.

## Related

- [Workspaces and panels](/docs/workspaces-and-panels/)
- [Data sources](/docs/data-sources/)
