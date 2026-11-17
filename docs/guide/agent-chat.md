# Agent chat

Press **Ctrl+J** to talk to the agent from anywhere in the app. If the palette
is already open, **Ctrl+J** runs your question with the text in the query box.

The agent opens in its own **docked pane on the far right**. Opening it
**reflows** the workspace: the center panes (for example Products and Detail)
**share** the width with the new docked column instead of keeping their previous
size.

## Pane chrome

The dock tab is always named **Agent**, even when several runs are open at once.
Tell sessions apart from the **short session title** at the top of the chat and
from the tab tooltip (`Agent —` that title). The title is generated once from your
first message. Until it is ready, the header shows a truncated preview of that
message. Hover the header or use assistive tech to read the **full first message**.

## Chat

The agent pane is a conversation:

- Your messages and the agent's replies appear in a scrollable history.
- The input at the bottom is always available. **Enter** sends; **Shift+Enter**
  starts a new line. Its border and keyboard focus ring match the other search
  fields in the app (`var(--inset)` with a `var(--accent)` ring).
- When the agent is working, the status chip updates and **Send** is disabled.
- When the agent files a draft, the reply includes a **link** that jumps to the
  affected row or object. Review and **Save** (or **Discard**) there — the same
  flow as edits you make yourself. There are no Approve/Reject buttons in the
  chat.

Follow-up messages stay in the **same run**, so you can continue with context
(for example adjusting another field on the same product).

## Toggle the pane

Press **Ctrl+J** again while the palette is closed:

- If the agent pane is focused, it **closes** (history is kept for this browser
  session).
- If it is open but another pane is focused, **Ctrl+J** focuses the agent input
  again.

Use **Ctrl+K** any time for commands, navigation, and a new agent question with
a fresh prompt.