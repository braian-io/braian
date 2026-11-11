# Delete and restore objects

Delete moves an object to Trash. It is a soft delete: nothing is purged, and the
object can be restored later.

## Four ways to start a delete

1. Select one or more rows, then press **Delete** (the key does nothing while an
   editor, text field, or the table quick-filter has focus).
2. Right-click a row or cell and choose **Delete…**.
3. Open an object's Detail header and choose **Delete**.
4. Press **Ctrl+K** and run **Delete** for the selected object or rows.

All four open the same confirm dialog. Cancel is focused, and Escape or a click
outside cancels without writing anything.

## The count line

The dialog names how many objects and links the delete removes, for example
`Removes 1 object and 2 links`. Link objects that are cascade-deleted are
counted as links, never as extra objects. A link shared by two selected objects
is counted once. Singular and plural follow the count.

After confirming, the rows leave the table and search. One request per selected
id is sent to `DELETE /v1/objects/{id}`.

## Restore from Trash

Open **Trash** from the user menu and press **Restore** next to the item.
Restore brings back the object and the links that were deleted in the same
event. A link that was deleted earlier in a different event stays deleted, even
though its object comes back. A deleted object opens as deleted in Detail and
Graph until it is restored.

Agents and imports cannot delete objects; their delete requests return 403.
