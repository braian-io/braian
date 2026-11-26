# Agent chat

Press **Ctrl+J** to talk to the agent from anywhere in the app. If the command
palette is already open, **Ctrl+J** runs your question with the text in the query
box instead of toggling the pane.

The agent opens in its own **docked pane on the far right**. The layout stays
anchored on the left. The structure tree, when it is open, keeps the width it
had before the pane opened, and the **Products** table stays in the same
horizontal position. Only the area to the right of that tree — **Products**,
any columns between it and **Detail**, and **Detail** — gets narrower, with a
short width transition, so the agent can take a dedicated column. Nothing
overlaps Detail, and its controls stay clickable. On a wide window (1360px and
up), Detail stays at least 360px.

## Pane chrome

The dock tab is always named **Agent**, even when several runs are open at once.
Tell sessions apart from the **short session title** at the top of the chat and
from the tab tooltip (`Agent —` that title). The title is generated once from your
first message (about ten seconds at most). Until it is ready, and if generation
times out or fails, the header keeps a short fallback — the first six words of
your message, with an ellipsis when it is longer — so the label does not jump through
a long truncation first. Hover the header for the full first message; assistive tech
gets that full text through `aria-describedby` on the visible title.

## Chat

The agent pane is a conversation:

- Your messages and the agent's replies appear in a scrollable history.
- The input at the bottom is always available. **Enter** sends; **Shift+Enter**
  starts a new line. Its border and keyboard focus ring match the other search
  fields in the app (`var(--inset)` with a `var(--accent)` ring).
- When the agent is working, the status chip updates and **Send** is disabled.
- When the agent files a **proposal**, the reply includes **Open in the table**
  (the link shows the object's key). That opens the table for the object's own
  type — Products for a product — and leaves Detail
  open on that same object. The same action is on the object in Detail and on
  a proposal row.
- The proposal then shows up as a **draft**: Pending, then **Discard** or
  **Save**. Save from the table or from Detail writes that draft. The table,
  the API and History then show the saved object. **Discard** throws the draft
  away. There is no separate Approve or Reject step. A change you type yourself
  keeps its Discard/Save bar in the pane where you made it.

Follow-up messages stay in the **same run**, so you can continue with context
(for example adjusting another field on the same product).

## Toggle the pane

**Ctrl+J** is a **toggle** while the command palette is closed:

- If **any** agent pane is open in the layout, **Ctrl+J closes it** — whether
  focus is in the follow-up box, on the Agent tab, or on Products, Detail, or
  another view (including narrow viewports such as 1280×800).
- If the pane is closed, **Ctrl+J** reopens the last agent session in the dock
  and focuses the follow-up input. With no prior session, it opens the palette in
  Ask AI mode so you can type a new question.

Unsent text in the follow-up box is **kept for this browser tab** when you close
the pane with **Ctrl+J** and restored when you open it again.

## Escape in the follow-up box

While the follow-up input is focused, **Esc** blurs the field and moves keyboard
focus to the **pane on the left** (for example Products or Detail). Your draft
text stays in the input. **Esc** does not close the agent pane.

Use **Ctrl+J** when you want to hide the whole agent column.

Use **Ctrl+K** any time for commands, navigation, and a new agent question with
a fresh prompt. Opening or closing the agent pane respects **prefers-reduced-motion**:
the reflow is instant when reduced motion is on.