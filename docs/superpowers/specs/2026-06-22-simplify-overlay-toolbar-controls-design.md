# Simplify Overlay Toolbar Controls Design

## Goal

Make the in-page WebComment toolbar more direct by removing ambiguous or redundant controls and exposing the comment-list visibility action without a menu.

## Approved UI

- Remove the toolbar's two-state resolved-visibility control, including the `已解決 X` and `隱藏已解決` labels.
- Keep the sidebar's existing `查看已解決` / `返回未解決` control as the only user-facing way to change resolved-content visibility.
- Remove the `更多` button and its popover menu.
- Remove the `關閉 WebComment` menu action. Clicking the active Chrome extension icon remains the way to deactivate WebComment on the current tab.
- Render the existing `隱藏留言列表` / `顯示留言列表` action directly in the toolbar.
- Keep the list-visibility action available in both normal mode and comment placement mode.
- Preserve the toolbar's existing dark pill styling, button treatment, and compact layout.

## Interaction Behavior

- Clicking `隱藏留言列表` closes the sidebar and immediately changes the label to `顯示留言列表`.
- Clicking `顯示留言列表` opens the sidebar and immediately changes the label to `隱藏留言列表`.
- Entering or leaving comment placement mode does not change sidebar visibility.
- Removing the toolbar resolved control does not change resolved-thread storage, filtering, pin visibility, counts, or the sidebar resolved control.
- Removing the menu action does not change overlay lifecycle behavior or Chrome action-icon deactivation.

## Implementation Scope

### Content script

- Update `renderToolbar` in `src/content/content-script.js` so the direct sidebar toggle follows the mode-specific primary controls.
- Remove toolbar markup and event bindings for `toggle-resolved`, `toggle-more`, and `deactivate`.
- Keep `deactivateOverlay` and extension message handling because the Chrome action icon still uses them.
- Remove menu-only state and styles when no remaining behavior depends on them.

### Documentation

- Update `docs/02_UX_FLOW.md`, `docs/04_DESIGN_SPEC.md`, and `docs/05_COMPONENT_SPEC.md` so the documented toolbar and exit flow match the approved behavior.
- Preserve documentation for the sidebar resolved filter and Chrome action-icon deactivation.

## Out Of Scope

- Removing or redesigning the sidebar resolved filter.
- Changing resolved-thread persistence or filtering semantics.
- Changing how the Chrome extension icon activates or deactivates WebComment.
- Redesigning the toolbar, sidebar, popup, pins, or comment-placement flow.

## Verification

- Add regression coverage proving the toolbar no longer renders the resolved control, More menu, or close action.
- Add regression coverage proving the direct sidebar toggle is rendered and retains both visibility labels.
- Verify the sidebar resolved control remains available.
- Run the focused toolbar tests and the full automated test suite.
- Manually verify normal mode and comment placement mode with the sidebar open and closed.
