# Graph

A graph is a normal view. Select an object and open the Graph tab, or use the graph
that a type workspace template already contains.

## Object graph

The graph draws the selected object together with:

- the groups and structures it is placed in
- its attribute values (object references are NOT drawn as value nodes)
- one node per directly linked peer object

An edge is labelled with the link's side label or the link type. A circle grows with
the node's degree, up to a cap.

The API returns one hop of direct links per request. Expand a node — `Enter`, a
double-click, or the node menu — to fetch and draw that node's neighbours. Group and
class nodes expand to their members (up to 40 objects) and to the full structure.
The whole scene is capped at 400 nodes, with a visible hint when the cap is reached.

## Interacting

- The canvas uses a force layout. **Fit** reframes without moving nodes; **Re-layout**
  clears pins, reseeds and restarts the layout.
- Drag a node to pin it. **Unpin** releases that node without re-laying out the graph.
- Right-click, `Ctrl/Cmd+Enter`, `Shift+F10` or the context-menu key opens a node
  menu. Object nodes offer one **Link <relation>…** item per relation and direction.
- `Escape` clears or dismisses the menu; arrows move the selection.
- Zoom, pan and drag set the camera. After that, resizing the pane repaints at the
  current transform instead of refitting.

Labels are drawn when the graph is settled. A small graph labels every edge; a larger
one labels the selected, hovered or focused node's edges. Labels avoid the node discs
and each other rather than stacking.

## Model graph

The data model has a read-only **Model graph**. It draws one node per entity type with
its object count and one edge per link type and end pair, labelled with the link name
and cardinality (for example `Articles 1–n`). Expanding a type shows the structures it
may use. The model graph does not edit anything.

## Related

- [Object types and relations](object-types-and-relations.md)
- [Workspaces and panels](workspaces-and-panels.md)
