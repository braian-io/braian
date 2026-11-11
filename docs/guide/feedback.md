# Feedback

In-app feedback lets a signed-in admin send a bug report or an idea from the screen
where it happened. It is off by default and needs an operator to configure it.

## Enabling it

Set `BRAIAN_FEEDBACK_WEBHOOK_URL` on the API process. Only an admin can send
feedback, and the command appears only when the API reports feedback as available.
An invalid webhook header stops the API at startup; the error never includes the
header value.

Optional settings:

- `BRAIAN_FEEDBACK_WEBHOOK_HEADER` — a full header line, or a header name combined
  with `BRAIAN_FEEDBACK_WEBHOOK_SECRET`.
- `BRAIAN_FEEDBACK_DIR` — where screenshots and client logs are written (default
  `./data/feedback`).

## Sending a report

Press `Ctrl+Shift+B`, or use the palette or the user menu. The dialog attaches the
context automatically:

- route and link
- build id
- workspace, view and selected object
- current filter and sort
- user handle and role

A screenshot and the recent client log are opt-in checkboxes. Write a message and
send. Screenshots and logs are files on the server; the webhook receives their paths,
not their contents. Sending is rate-limited per user.

## Related

- [Command palette and shortcuts](command-palette-and-shortcuts.md)
- [Self-hosting](self-hosting.md)
