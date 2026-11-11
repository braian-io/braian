# Braian guide

Braian is an open-source, self-hosted system for the work a PIM usually covers. This
guide describes what the product does today. The marketing site is written against
these pages; if a claim is not here, it does not belong there yet. It walks through
the daily flows rather than the internals.

- [Getting started](/docs/getting-started) — run Braian locally, sign in and open the demo workspace.
- [Workspaces and panels](/docs/workspaces-and-panels) — tiled views, layouts and sharing.
- [Object types and relations](/docs/object-types-and-relations) — the model, attributes and link types.
- [Data sources](/docs/data-sources) — make a view follow a type, a linked object or a structure node.
- [Command palette and shortcuts](/docs/command-palette-and-shortcuts) — Ctrl+K, the agent and the keyboard.
- [Deleting and restore](/docs/deleting-and-restore) — four delete entry points, confirm counts and Trash.
- [Graph](/docs/graph) — the object graph and the model graph.
- [Feedback](/docs/feedback) — in-app reports when an operator enables them.
- [Self-hosting](/docs/self-hosting) — one binary, several roles, Postgres and Typesense.

Braian is licensed under Apache-2.0. Nothing in this guide requires a hosted service.

## The demo

The demo at [demo.braian.io](https://demo.braian.io) is the same application with a
seeded catalog. It contains workspaces for Products, Articles, Suppliers, Sources,
and Review, plus a Data model workspace. Nothing in this guide depends on the demo
data; your own catalog can use different types and views.

## One write path

The UI, `Ctrl+K`, the agent, the REST API and MCP clients call the same named
operations with the same permission checks. The agent acts for a person with a
narrower surface: it cannot delete objects or links, save its own proposals, run a
merge or wipe a catalog. Postgres is the source of truth and the change log; search,
live updates and webhooks are consumers of it.

## Where to look next

- Open the app and press `F1` to see the keyboard shortcuts.
- Press `Ctrl+K` to open the command palette from anywhere in the app.
- Use the workspace tabs at the top to switch context, or press `Ctrl+1` through
  `Ctrl+9` for the first nine workspaces.
