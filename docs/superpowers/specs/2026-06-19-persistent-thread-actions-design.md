# Persistent Thread Actions Design

## Goal

Make each primary annotation card's edit, delete, and resolve or reopen actions immediately discoverable without requiring the user to expand the reply area first.

## Current Problem

The action controls are rendered inside `wc-thread-detail`, so they appear only after the thread is selected. Users currently have to click `尚無回覆` or `N 則回覆` before they can discover unrelated actions such as edit, delete, and resolve.

## Card Layout

Each primary annotation card uses three visual regions:

1. Header and body
   - Pin number, avatar, author, timestamp, status, and original comment body.
   - Clicking this region selects and expands the thread.
2. Persistent footer
   - Left: `尚無回覆` or `N 則回覆`.
   - Right: edit, delete, and resolve or reopen actions.
   - The footer is visible whether the thread is collapsed or expanded.
3. Expandable detail
   - Reply list and reply composer.
   - Original-message actions are not repeated here.

The footer must remain valid interactive HTML. Action buttons must not be nested inside the existing `.wc-thread-main` button.

## Interactions

- Clicking the header/body selects and expands the thread as it does today.
- Clicking the footer's reply summary selects and expands the thread.
- Clicking edit selects the thread, enters original-comment editing, and renders the edit form immediately.
- Clicking delete shows the existing destructive confirmation and, after confirmation, deletes the pin, thread, original comment, and replies.
- Clicking resolve or reopen updates the thread without expanding it solely as a side effect.
- Action button clicks must not trigger the card's select/expand handler.
- Expanded threads show replies and the reply composer but do not duplicate the original-message action row.
- Existing resolved-filter behavior remains unchanged: resolving an item while resolved items are hidden removes it from the visible list.

## Author Metadata Spacing

Wrap the author name and relative timestamp in a dedicated metadata element. Use a compact two-row layout with no row gap, a 15px author-name line height, and a 14px timestamp line height. This reduces the combined line height from 31px to 29px.

The author name remains visually primary, and the timestamp remains muted. The change must not reduce legibility or alter avatar alignment.

## Responsive Behavior

- The footer uses a flexible row: reply summary on the left and actions on the right.
- On narrow sidebar widths, the footer may wrap rather than overlap the comment body or clip actions.
- All controls retain visible keyboard focus and usable accessible names.

## Implementation Scope

Update `src/content/content-script.js` only for runtime behavior and embedded overlay styles:

- Render the persistent footer from `renderThreadListItem`.
- Reuse `renderOriginalControls` in the footer.
- Remove the duplicate controls from `renderThreadDetail`.
- Ensure edit selects the target thread before rendering the edit form.
- Add a dedicated author metadata class and compact spacing rules.

Update the relevant design and component documentation to describe the persistent footer and compact author metadata.

Do not change storage, comment permissions, data models, popup behavior, reply CRUD behavior, or backend plans.

## Error Handling

- Keep the existing delete confirmation and storage error behavior.
- Keep the existing resolve/reopen refresh and badge update behavior.
- Do not clear drafts or selection beyond the behavior already required by the selected action.

## Verification

Automated regression checks must cover:

- Every rendered thread card includes a persistent footer.
- The footer contains the reply summary and original-message actions.
- `renderThreadDetail` no longer appends duplicate original controls.
- Edit selects the thread before setting `editingCommentId`.
- The author metadata wrapper and compact spacing rules exist.

Manual Chrome verification must cover collapsed and expanded cards, zero and multiple replies, open and resolved threads, narrow sidebar layout, and keyboard focus order.
