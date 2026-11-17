# Agent chat

Press **Ctrl+J** to talk to the agent from anywhere in the app. If the palette
is already open, **Ctrl+J** runs your question with the text in the query box.

The agent opens in its own **docked pane on the far right**. The layout stays
anchored on the left: the structure tree (when it is open) keeps its width, and
the **Products** table stays in the same horizontal position. **Products** and
**Detail** get a little narrower so the agent can take a dedicated column beside
them. Nothing overlaps Detail.

## Chat

The agent pane is a conversation:

- Your messages and the agent's replies appear in a scrollable history.
- The input at the bottom is always available. **Enter** sends; **Shift+Enter**
  starts a new line.
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
  session) and the wider layout returns with a short width transition.
- If it is open but another pane is focused, **Ctrl+J** focuses the agent input
  again.

Use **Ctrl+K** any time for commands, navigation, and a new agent question with
a fresh prompt. Opening or closing the agent pane respects **prefers-reduced-motion**:
the reflow is instant when reduced motion is on.