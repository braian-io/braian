# Getting started

This page takes you from the sign-in screen to your first object.

## Sign in

Open your Braian address in a browser. When you are not signed in, the app shows
a sign-in card with the fields `Email` and `Password` and the button `Sign in`.
The email field is prefilled with `admin@braian.io`; type your own address if
your account uses another one. If the credentials are wrong, the app reports
`Wrong email or password.`

Braian does not have a self-service sign-up screen, password reset screen, or
single sign-on screen. An account is provisioned for the installation by the
person who runs it. Ask them for the address and password if you do not have
them.

The demo instance uses the same sign-in card. Its account is also provisioned by
the deployment; this guide does not contain a demo password.

## The first screen

After sign-in the app opens the last workspace that was active for your user. If
there is none yet, it opens the default workspace: the first object-type
workspace, which is Products in the seeded demo. Each workspace is a tab in the
top bar.
The tabs have a small number for the first nine positions, because `Ctrl+1`
through `Ctrl+9` open those workspaces.

A workspace fills the screen with panes. A pane contains one or more views, and
a view tab names each view. In the seeded demo, the Products workspace shows:

- An object table for products in the centre.
- A structure tree and selections on the left.
- A detail view, a graph view, a history view, and group attributes on the right.

Your own workspaces may look different. The layout is editable and is saved per
workspace, so the next visit picks up where you left off.

## Open an object

Click a row in an object table to make it the current selection. The `Detail`
view shows the selected object with its attributes. When a detail view is open,
clicking a row updates it immediately; you do not need to open a new tab.

Use the arrow keys to move through the table and `Enter` or `Space` to commit the
row as the selection. `Shift` plus an arrow key extends the selection. Double-click
a cell to edit it in place.

## Find something

Press `Ctrl+K` to open the command palette. Type part of a view name, workspace
name, object key, or object type, or choose one of the commands in the list. The
palette also remembers recent destinations, so repeated jumps are quick.

For a list of every shortcut, press `F1` or read
[Command palette & shortcuts](/docs/command-palette-and-shortcuts).

## Move around

- Click a workspace tab to switch workspace.
- Press `Alt` plus an arrow key to move focus between panes.
- Click a view tab inside a pane to switch view.
- Use `Ctrl+K` and then `Open workspace`, `Open view`, or `Open object` to jump
  directly.
- The address bar keeps the active workspace, view, catalog, and object as query
  parameters, so a copied URL opens the same place.

## Where to go next

- Read [Workspaces & panels](/docs/workspaces-and-panels) to shape the layout.
- Read [Object types & relations](/docs/object-types-and-relations) before you
  add types or attributes.
- Read [Data sources](/docs/data-sources) to connect a table to another table or
  switch catalog.
