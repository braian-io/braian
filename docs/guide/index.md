# Braian guide

Braian is an open-source, self-hosted system for the work a PIM usually covers. This
guide describes what the product does today. The marketing site is written against
these pages; if a claim is not here, it does not belong there yet.

- [Getting started](getting-started.md) — run Braian locally and open the demo workspace.
- [Workspaces and panels](workspaces-and-panels.md) — tiled views, layouts and sharing.
- [Object types and relations](object-types-and-relations.md) — the model, attributes and link types.
- [Data sources](data-sources.md) — make a view follow a type, a linked object or a structure node.
- [Command palette and shortcuts](command-palette-and-shortcuts.md) — Ctrl+K, the agent and the keyboard.
- [Deleting and restore](deleting-and-restore.md) — four delete entry points, confirm counts and Trash.
- [Graph](graph.md) — the object graph and the model graph.
- [Feedback](feedback.md) — in-app reports when an operator enables them.
- [Self-hosting](self-hosting.md) — one binary, several roles, Postgres and Typesense.

Braian is licensed under Apache-2.0. Nothing in this guide requires a hosted service.

## One write path

The UI, `Ctrl+K`, the agent, the REST API and MCP clients call the same named
operations with the same permission checks. The agent acts for a person with a
narrower surface: it cannot delete objects or links, save its own proposals, run a
merge or wipe a catalog. Postgres is the source of truth and the change log; search,
live updates and webhooks are consumers of it.
