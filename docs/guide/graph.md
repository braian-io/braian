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

The toolbar has **Fit**, **Re-layout**, and **Open full size** / **Close full size**.
Use full size when the pane is too small to read the scene.

## Interacting

- The canvas uses a force layout. **Fit** reframes the current scene without moving
  nodes and without clearing pins. **Re-layout** clears pins, reseeds every node and
  restarts the layout, then fits the result.
- Drag a node to pin it where you drop it. The selected node's inspector card keeps a
  **Pin** / **Unpin** control that stays on the card and toggles: **Pin** fixes the node
  at its current position, **Unpin** releases it. Unpin does not re-run the layout.
- Right-click, `Ctrl/Cmd+Enter`, `Shift+F10` or the context-menu key opens a node
  menu. Object nodes offer one **Link <relation>…** item per relation and direction.
  A value node offers **Open value**, which opens the owning object. In the model
  graph a type node opens that type in Object types.
- The menu opens beside the node's right edge, measured from the circle plus its
  caption, so it does not cover the node or its label. When the pane has room it stays
  within 16 px of the node, with the legend chips still visible. In a very crowded
  graph it may cover another label before it leaves that 16 px hug, but it never covers
  its own node.
- Opening a node menu with the mouse also moves keyboard focus to that node, so the
  next `Shift+F10` opens the same node's menu rather than the last node reached with
  Tab. `Escape` closes the menu and leaves a visible focus ring.
- Right-click on empty canvas never shows the browser menu. It opens the graph menu
  with **Fit** and **Re-layout**, the same actions as the toolbar.
- Zoom, pan and node drag belong to the user. The camera fits on first load, after
  **Re-layout**, and when the pane is resized or toggled to full size while the camera
  is still untouched. After you have zoomed, panned, or dragged a node, resizing the
  pane and toggling full size repaint at the current transform and leave the camera
  where you put it.

Labels are drawn when the graph is settled. A small graph labels every edge; a larger
one labels the selected, hovered or focused node's edges. Labels avoid the node discs
and each other rather than stacking.

## Model graph

The data model has a read-only **Model graph**. It draws one node per entity type with
its object count and one edge per link type and end pair, labelled with the link name
and cardinality (for example `Articles 1–n`). Expanding a type shows the structures it
may use. The model graph does not edit anything.

## Related

- [Object types and relations](/docs/object-types-and-relations)
- [Workspaces and panels](/docs/workspaces-and-panels)
