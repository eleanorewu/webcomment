# Comment Composer Adaptive Multiline Focus Design

## Goal

Make comment entry feel continuous and ergonomic across all comment inputs. After a user submits a reply, focus returns to the reply textarea so they can immediately type the next reply. Comment inputs should start with the current compact input-like appearance, then adapt into a multiline text-field appearance when the user is writing multiline content.

## Scope

- Content script comment textareas: new comment composer, popover reply, sidebar reply, popover edit, sidebar edit.
- Adaptive visual styling shared by comment textareas.
- Tests that verify the content script keeps reply focus after submit and uses multiline text-field styling.

## Out of Scope

- Store, permission, owner/guest, and author logic.
- New keyboard shortcuts or changes to the existing double-Enter submit behavior.

## Current Behavior

Reply locations already use `<textarea>`, but they are rendered with `rows="1"` inside a pill-shaped wrapper. This makes the input feel like a single-line field even when the user needs multiline text.

Other comment textareas, such as new-comment and edit forms, already look more like text fields, but their behavior is not unified with reply inputs.

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

### Adaptive Input-To-Text-Field Behavior

All comment textareas should:

- Start in a compact input-like state when empty or single-line.
- Switch to a multiline text-field state when the value contains a newline.
- Switch to the multiline state immediately when the user presses Shift + Enter, before or as the newline is inserted.
- Preserve line breaks in submitted body text through the existing textarea value and store flow.
- Use an 8px-radius text-field surface in multiline state.
- Allow multiline input while keeping the UI bounded with a maximum height and internal scroll.
- Keep the submit button aligned at the bottom edge in multiline state so it remains easy to reach as the textarea grows.
- Return to the compact input-like state if the user removes multiline content and the textarea becomes single-line again.

### Keyboard Behavior

Existing keyboard behavior remains unchanged:

- Regular Enter can create a newline unless it is the second Enter within the existing double-Enter window.
- Shift + Enter creates multiline intent and moves the textarea into text-field state.
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

Add an adaptive textarea helper:

```js
function bindAdaptiveCommentTextarea(textarea, options = {}) {
  const target = options.surface || textarea.closest('.wc-comment-input-surface') || textarea;
  const sync = () => {
    const multiline = textarea.value.includes('\n');
    target.classList.toggle('is-multiline', multiline);
    textarea.classList.toggle('is-multiline', multiline);
  };
  textarea.addEventListener('input', sync);
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.shiftKey) {
      target.classList.add('is-multiline');
      textarea.classList.add('is-multiline');
    }
  });
  sync();
}
```

Call it after the relevant re-render:

- Popover reply submit: after `renderPinPreview()`, call `focusReplyTextarea('.wc-popover-reply')`.
- Sidebar reply submit: after `render()`, call `focusReplyTextarea('.wc-reply-form')`.

Keep reply textarea templates compact at rest. Do not force all reply fields to start as `rows="2"`; the multiline visual state should be class-driven by content or Shift + Enter intent.

Apply `bindAdaptiveCommentTextarea` anywhere `bindSubmitEnabled` is used for comment textareas:

- Popover reply form.
- Sidebar reply form.
- Floating new-comment composer.
- Popover edit form.
- Sidebar original-comment edit form.
- Sidebar editable comment/reply form.

Update `.wc-popover-input-wrap` and related textarea styles so the default state keeps the input-like feel, while `.is-multiline` uses the 8px text-field treatment.

## Testing

Update `tests/comment-mode-ui.test.mjs` with source-pattern tests:

- Reply submit handlers focus the reply textarea after re-render for both popover and sidebar forms.
- All comment textarea setup paths call the adaptive textarea helper.
- Adaptive styling keeps the compact input-like default and applies an 8px text-field state through `.is-multiline`.
- Shift + Enter is explicitly handled as multiline intent without removing the existing double-Enter submit behavior.

Existing full verification remains:

```bash
npm test
npm run check
```

## Acceptance Criteria

- After submitting a popover reply, the popover reply textarea is focused again.
- After submitting a sidebar expanded-thread reply, the sidebar reply textarea is focused again.
- Comment inputs start with the compact input-like appearance.
- Comment inputs switch to a multiline text-field appearance when the user enters multiline content or presses Shift + Enter.
- The adaptive behavior applies to new comment, reply, and edit textareas.
- Existing double-Enter and Cmd/Ctrl+Enter submit behavior is preserved.
- Existing permission, own-comment, and resolve behavior is unchanged.
