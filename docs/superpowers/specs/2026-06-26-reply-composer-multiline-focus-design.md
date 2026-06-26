# Reply Composer Multiline Focus Design

## Goal

Make repeated reply entry feel continuous. After a user submits a reply, focus returns to the reply textarea so they can immediately type the next reply. The reply textarea should also look and behave like a multiline text field, not a single-line pill input.

## Scope

- Content script reply forms in the pin popover and sidebar expanded thread detail.
- Visual styling for reply textareas shared by those reply forms.
- Tests that verify the content script keeps reply focus after submit and uses multiline text-field styling.

## Out of Scope

- Store, permission, owner/guest, and author logic.
- Floating new-comment composer behavior.
- Edit comment forms.
- New keyboard shortcuts or changes to the existing double-Enter submit behavior.

## Current Behavior

Both reply locations already use `<textarea>`, but they are rendered with `rows="1"` inside a pill-shaped wrapper. This makes the input feel like a single-line field even though it accepts multiline text.

After submit, the content script refreshes data and re-renders the popover or sidebar detail. The old textarea node is destroyed, so browser focus is lost and the user must click the reply field again.

## Desired Behavior

### Reply Submit Focus

After a successful reply submit:

1. Add the reply through the existing store call.
2. Clear the submitted textarea value.
3. Refresh session data.
4. Re-render the active UI.
5. Focus the newly-rendered reply textarea for the same surface.

For the popover, focus returns to the popover reply textarea after `renderPinPreview()`.

For the sidebar expanded thread detail, focus returns to the sidebar reply textarea after `render()`.

If the UI is no longer present, no error should be thrown.

### Multiline Text Field

Reply textareas should:

- Use at least `rows="2"` so multiline entry is visible before typing.
- Preserve line breaks in submitted body text through the existing textarea value and store flow.
- Use an 8px-radius text-field wrapper instead of the current fully rounded pill.
- Allow multiline input while keeping the UI bounded with a maximum height and internal scroll.
- Keep the submit button aligned at the bottom edge of the text field so it remains easy to reach as the textarea grows.

### Keyboard Behavior

Existing keyboard behavior remains unchanged:

- Regular Enter can create a newline unless it is the second Enter within the existing double-Enter window.
- Double Enter submits the nearest form.
- Cmd/Ctrl + Enter submits the nearest form.

## Implementation Shape

Add a small helper in `content-script.js`:

```js
function focusReplyTextarea(formSelector) {
  setTimeout(() => {
    const textarea = shadow?.querySelector(`${formSelector} textarea[name="body"]`);
    if (textarea) textarea.focus();
  }, 0);
}
```

Call it after the relevant re-render:

- Popover reply submit: after `renderPinPreview()`, call `focusReplyTextarea('.wc-popover-reply')`.
- Sidebar reply submit: after `render()`, call `focusReplyTextarea('.wc-reply-form')`.

Update both reply textarea templates from `rows="1"` to `rows="2"`.

Update `.wc-popover-input-wrap` and reply-form alignment styles so popover and sidebar reply fields share the same text-field treatment.

## Testing

Update `tests/comment-mode-ui.test.mjs` with source-pattern tests:

- Reply submit handlers focus the reply textarea after re-render for both popover and sidebar forms.
- Reply textarea templates use `rows="2"` in both reply locations.
- Reply field styling uses an 8px border radius and bottom-aligned submit button treatment instead of a pill-only single-line layout.

Existing full verification remains:

```bash
npm test
npm run check
```

## Acceptance Criteria

- After submitting a popover reply, the popover reply textarea is focused again.
- After submitting a sidebar expanded-thread reply, the sidebar reply textarea is focused again.
- Reply textareas visibly support multiline input without feeling like a one-line pill input.
- Existing double-Enter and Cmd/Ctrl+Enter submit behavior is preserved.
- Existing permission, own-comment, and resolve behavior is unchanged.
