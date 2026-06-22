# Remove Popup Resolved Toggle and Thumbnail Design

## Goal

Simplify the extension popup by removing the resolved-pin Checkbox and the decorative thumbnail beside the current website title.

## Approved UI

- Remove the complete `顯示已解決標注` Checkbox row from the popup.
- Remove the decorative icon displayed to the left of the current website title.
- Keep the website title, environment/hostname metadata, session controls, comment counts, and all remaining popup actions unchanged.
- Continue using the sidebar's existing `查看已解決` / `返回未解決` control as the user-facing way to change resolved-content visibility.

## Implementation Scope

### Popup markup

- Remove the `.toggle-row` block and `#showResolvedToggle` input from `src/popup/popup.html`.
- Remove the `.page-icon` element from the current-page card.
- Keep the existing `.page-title-row` wrapper so the page title and metadata retain their current structure.

### Popup behavior

- Remove the `showResolvedToggle` DOM lookup from `src/popup/popup.js`.
- Remove its `change` event listener and the popup-originated `WEB_COMMENT_SHOW_RESOLVED` message.
- Do not change sidebar filtering or resolved-pin behavior.

### Popup styling

- Remove the unused `.toggle-row`, `.toggle-row label`, and `.toggle-row input` rules.
- Remove the unused `.page-icon` rule.

### Documentation

- Remove `Toggle resolved pins` from the Extension Popup action list in `docs/05_COMPONENT_SPEC.md` because the sidebar owns that interaction.

## Out of Scope

- Redesigning the current-page card.
- Changing comment statistics or resolved state storage.
- Changing the sidebar's resolved-content control.
- Removing the content script's resolved-visibility message support, which is outside the popup UI cleanup.

## Verification

- Add popup regression coverage proving the Checkbox, its JavaScript binding, its listener, and related CSS no longer exist.
- Verify the page icon markup and CSS no longer exist while the website title and metadata remain.
- Run the full automated test suite, extension structure check, and whitespace validation.

