# Braian user guide

Braian is a self-hosted product information system. You define your own object
types and attributes, keep the data in Postgres, and find it again through
views, search, and the command palette. The same web app runs on a seeded demo
instance and on your own installation.

This guide describes the product as it works today. It walks through the daily
flows rather than the internals:

- [Getting started](/docs/getting-started) covers signing in, the first screen,
  and how to move around.
- [Workspaces & panels](/docs/workspaces-and-panels) explains workspaces, panes,
  view tabs, splits, and how the layout is saved.
- [Object types & relations](/docs/object-types-and-relations) shows how to build
  the data model and how link types connect objects.
- [Data sources](/docs/data-sources) explains all-of-type tables, peer sources,
  catalogs, imports, and saved selections.
- [Command palette & shortcuts](/docs/command-palette-and-shortcuts) lists the
  palette commands and the keyboard shortcuts.

## The demo

The demo at <https://demo.braian.io> is the same application with a seeded
catalog. It contains workspaces for Products, Articles, Suppliers, Sources, and
Review, plus a Data model workspace. Nothing in this guide depends on the demo
data; your own catalog can use different types and views.

A guide for the graph view will follow once that work is approved.

## Where to look next

- Open the app and press `F1` to see the keyboard shortcuts.
- Press `Ctrl+K` to open the command palette from anywhere in the app.
- Use the workspace tabs at the top to switch context, or press `Ctrl+1` through
  `Ctrl+9` for the first nine workspaces.
