# Getting started

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

## First look

The seed opens on a data model and one workspace per object type. A workspace is a
set of tiled panels: a structure tree, an object table, a detail pane, history and a
graph, depending on the template.

1. Pick a type workspace from the top bar.
2. Select a row in the table. The detail pane follows the selection.
3. Press `Ctrl+K` and type a workspace, view or object name.
4. Press `Ctrl+J` to ask the agent in the current context.

The in-app agent needs a model. Without `OPENAI_API_KEY`, the agent panel says that
no model is connected; proposals, bulk edits and undo still work. See
[Workspaces and panels](workspaces-and-panels.md) and
[Command palette and shortcuts](command-palette-and-shortcuts.md).

## Where the data lives

Postgres is the source of truth and the change log. Every committed change appends
to `changes`; the indexer reads it by sequence and updates Typesense; search, live
updates and webhooks derive from it. Objects are JSONB rows, not EAV tables, and
the index can be rebuilt with `braian reindex`.

Development ports, commands and reset rules are in [../dev.md](../dev.md). Production
has its own shape: see [Self-hosting](self-hosting.md).
