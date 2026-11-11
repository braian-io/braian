# Getting started

This page takes you from a local installation and the sign-in screen to your first
object.

## Run it locally

You need Docker, Rust 1.93, Node 22, pnpm 10 and [just](https://just.systems/).

```bash
cp .env.example .env
just up
pnpm install
just dev
```

`just up` starts Postgres and Typesense. `just dev` runs migrations, seeds the
synthetic demo catalog, then starts the API, the indexer and the web app.

- Web: <http://127.0.0.1:3000>
- API: <http://127.0.0.1:8090>
- Postgres and Typesense are published on loopback only by default (`127.0.0.1:5433`
  and `127.0.0.1:8108`).

The demo account comes from `BRAIAN_DEMO_EMAIL` and `BRAIAN_DEMO_PASSWORD` in your
local `.env`. Those values are not in the source tree. The seed catalog is synthetic:
suppliers, products and articles, about 1,640 objects unless `BRAIAN_SEED_COUNT` says
otherwise. No customer data is used for development.

Development ports, commands and reset rules are in
[the developer notes](https://github.com/braian-io/braian/blob/main/docs/dev.md).
Production has its own shape: see [Self-hosting](/docs/self-hosting).

## Sign in

Open your Braian address in a browser. When you are not signed in, the app shows a
sign-in card with the fields `Email` and `Password` and the button `Sign in`. The
email field is prefilled with `admin@braian.io`; type your own address if your
account uses another one. If the credentials are wrong, the app reports
`Wrong email or password.`

Braian does not have a self-service sign-up screen, password reset screen, or single
sign-on screen. An account is provisioned for the installation by the person who runs
it. Ask them for the address and password if you do not have them. The demo instance
uses the same sign-in card; this guide does not contain a demo password.

## The first screen

After sign-in the app opens the last workspace that was active for your user. If
there is none yet, it opens the default workspace: the first object-type workspace,
which is Products in the seeded demo. Each workspace is a tab in the top bar. The
tabs have a small number for the first nine positions, because `Ctrl+1` through
`Ctrl+9` open those workspaces.

A workspace fills the screen with panes. A pane contains one or more views, and a
view tab names each view. In the seeded demo, the Products workspace shows:

- An object table for products in the centre.
- A structure tree and selections on the left.
- A detail view, a graph view, a history view, and group attributes on the right.

Your own workspaces may look different. The layout is editable and is saved per
workspace, so the next visit picks up where you left off.

## Open an object

Click a row in an object table to make it the current selection. The `Detail` view
shows the selected object with its attributes. When a detail view is open, clicking a
row updates it immediately; you do not need to open a new tab.

Use the arrow keys to move through the table and `Enter` or `Space` to commit the row
as the selection. `Shift` plus an arrow key extends the selection. Double-click a cell
to edit it in place.

## Find something

Press `Ctrl+K` to open the command palette. Type part of a view name, workspace name,
object key, or object type, or choose one of the commands in the list. The palette
also remembers recent destinations, so repeated jumps are quick.

Press `Ctrl+J` to ask the agent in the current context. The in-app agent needs a
model. Without `OPENAI_API_KEY`, the agent panel says that no model is connected;
proposals, bulk edits and undo still work.

For a list of every shortcut, press `F1` or read
[Command palette and shortcuts](/docs/command-palette-and-shortcuts).

## Move around

- Click a workspace tab to switch workspace.
- Press `Alt` plus an arrow key to move focus between panes.
- Click a view tab inside a pane to switch view.
- Use `Ctrl+K` and then `Open workspace`, `Open view`, or `Open object` to jump
  directly.
- The address bar keeps the active workspace, view, catalog, and object as query
  parameters, so a copied URL opens the same place.

## Where the data lives

Postgres is the source of truth and the change log. Every committed change appends to
`changes`; the indexer reads it by sequence and updates Typesense; search, live
updates and webhooks derive from it. Objects are JSONB rows, not EAV tables, and the
index can be rebuilt with `braian reindex`.

## Where to go next

- Read [Workspaces and panels](/docs/workspaces-and-panels) to shape the layout.
- Read [Object types and relations](/docs/object-types-and-relations) before you add
  types or attributes.
- Read [Data sources](/docs/data-sources) to connect a table to another table or
  switch catalog.
