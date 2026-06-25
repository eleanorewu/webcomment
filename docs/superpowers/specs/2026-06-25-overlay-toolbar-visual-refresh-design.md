# Overlay Toolbar Visual Refresh Design

## Goal

Refresh the in-page WebComment overlay toolbar to match the approved compact control design while keeping the interaction model small and predictable.

## Approved Scope

- Change only the overlay toolbar UI and directly related toolbar copy, tests, and documentation.
- Keep the existing sidebar, popup, pins, thread list, composer, storage, and session behavior unchanged.
- Keep Chrome extension icon deactivation available.
- Add a toolbar close control that deactivates the current page overlay through the existing overlay lifecycle.

## Toolbar Structure

The toolbar contains three fixed-width control zones:

1. Annotation mode control
   - Idle state label: `標註`
   - Active state label: `標註中`
   - Uses the provided dashed mouse pointer icon.
   - Clicking `標註` enters annotation mode.
   - Clicking `標註中` exits annotation mode while keeping the WebComment overlay active.
   - The current `標注模式 · 點擊頁面留言` helper text and `完成` label are removed from the toolbar.

2. Comment list visibility control
   - Sidebar open label: `隱藏留言列表`
   - Sidebar closed label: `顯示留言列表`
   - Uses the provided eye closed icon for `隱藏留言列表`.
   - Uses the provided eye open icon for `顯示留言列表`.
   - Clicking the control toggles the existing sidebar visibility state.

3. Overlay close control
   - Renders as a fixed icon button with an `X`.
   - Clicking it fully closes the WebComment overlay on the current page.
   - It uses the existing `deactivateOverlay()` behavior.
   - The existing Chrome extension icon close path remains unchanged and continues to use the same lifecycle.

## Visual Design

- Outer toolbar:
  - Dark rectangular surface.
  - `12px` border radius.
  - Width is content-driven, but each internal zone has a stable fixed width.
  - It remains positioned over the page without mutating host layout.

- Buttons:
  - `8px` border radius.
  - Icon and text are horizontally aligned.
  - Button hover affects only the hovered button.
  - Hover uses a slightly brighter gray surface.
  - Active annotation state has a distinct pressed or highlighted treatment.

- Dividers:
  - Vertical dividers always render between the annotation zone, list visibility zone, and close zone.
  - Dividers visually separate the full-overlay close action from the list toggle.

- Text stability:
  - Fixed internal zone widths prevent layout shift between `標註` / `標註中` and `顯示留言列表` / `隱藏留言列表`.
  - Mobile layout must not overflow the viewport; the toolbar can use a viewport max-width and compact padding.

## Copy Rules

- Toolbar-visible annotation copy uses `標註`, not `標注`.
- This design does not require a product-wide terminology migration.
- Short-lived toasts may keep their current guidance unless they are directly touched by the toolbar implementation.

## Implementation Notes

- Update `renderToolbar` in `src/content/content-script.js`.
- Inline or otherwise embed the three approved SVG icons into the toolbar implementation:
  - `square-dashed-mouse-pointer.svg`
  - `eye open.svg`
  - `eye close.svg`
- Add a new toolbar close action listener that calls the existing overlay deactivation path.
- Preserve the existing sidebar toggle state and behavior.
- Preserve the existing extension-message deactivation behavior used by the Chrome action icon.

## Out Of Scope

- Redesigning the comment list sidebar.
- Changing resolved-thread filtering.
- Changing pin visuals or anchor behavior.
- Changing popup behavior.
- Migrating every instance of `標注` to `標註` across the product and documentation.
- Adding new toolbar features such as presence, connection status, dragging, or session switching.

## Verification

- Update focused toolbar tests to prove:
  - The toolbar renders `標註` and `標註中`.
  - The old `標注模式 · 點擊頁面留言` helper text is no longer rendered.
  - The old `完成` toolbar label is no longer rendered.
  - The sidebar toggle keeps both `顯示留言列表` and `隱藏留言列表`.
  - The toolbar close control exists and calls the overlay deactivation path.
  - The Chrome action icon deactivation path remains available.
- Run the focused comment-mode UI tests.
- Run the full automated test suite.
- Manually verify:
  - Entering annotation mode.
  - Leaving annotation mode via `標註中`.
  - Opening and hiding the comment list.
  - Closing the overlay through toolbar `X`.
  - Closing the overlay through the Chrome extension icon.
  - Toolbar layout stability in both sidebar states and annotation states.
