# Comment Mode Lifecycle Design

Date: 2026-06-18
Status: Approved direction, pending written-spec review

## Problem

The prototype exposes two controls that both look like comment-mode entry points: `開始標注` in the popup and `標注` in the page toolbar. Users therefore believe they must activate commenting twice. The overlay also mounts visibly but has no clear command that removes WebComment from the current tab.

## Goals

- One popup activation immediately enters comment placement mode.
- Placement has an unmistakable cursor without losing pointer precision.
- Exiting placement and closing WebComment are separate, clearly named actions.
- When WebComment is active, clicking the Chrome action icon again closes it.
- State and controls are scoped per tab.

## Non-goals

- Disabling or uninstalling the extension globally.
- Persisting active overlay state across reloads.
- Redesigning sessions, comments, pins, or storage.
- Adding keyboard-shortcut configuration.

## Interaction Model

### Inactive tab

1. Clicking the Chrome action icon opens the existing popup.
2. The user selects a session and clicks `開始標注`.
3. The popup closes and the page immediately enters placement mode.

### Comment placement mode

- The cursor becomes a compact annotation-pin bubble without a separate arrow. It uses the same rounded body, lower-left tail, brand purple, white outline, and three white dots as the saved annotation style. The bubble tail is the click hotspot.
- The bottom toolbar reads `標注模式 · 點擊頁面留言` and provides `完成`.
- One page click creates a draft pin and opens the floating composer. No second activation is required.
- `完成` or `Esc` restores the normal cursor without removing pins or the overlay.
- Cancelling an empty draft returns to placement mode. Submitting exits placement and selects the new thread.

### Active overlay, not placing a comment

- The toolbar exposes `標注` to re-enter placement mode.
- A `更多` menu contains `顯示／隱藏留言列表` and `關閉 WebComment`.
- Closing removes the overlay root and WebComment-owned page listeners. Stored data remains unchanged.

### Chrome action icon

- Inactive tab: use the normal popup.
- Active tab: assign an empty popup for that tab and mark the icon active. The next icon click reaches `chrome.action.onClicked` and closes WebComment.
- After close: restore the popup and inactive icon state for that tab.
- Reload or navigation starts an inactive lifecycle.

## State Model

```text
inactive -> placement (popup Start Annotation)
placement -> drafting (page click)
placement -> active (Done or Escape)
placement -> inactive (Close WebComment or active icon click)
drafting -> placement (cancel empty draft)
drafting -> active (submit comment)
drafting -> inactive (Close WebComment)
active -> placement (toolbar Annotation)
active -> inactive (Close WebComment or active icon click)
```

`overlayActive` and `commentMode` are separate values. Hiding the comment list changes neither.

## Component Responsibilities

### Popup

- Starts overlay activation and comment placement with one message.
- Does not require a second toolbar action.

### Content script

- Owns overlay lifecycle, placement state, custom cursor, drafts, and cleanup.
- Handles activation and deactivation idempotently.
- On deactivate, removes document/window listeners, timers, history hooks, and the overlay root before acknowledging success.

### Background service worker

- Coordinates action popup, title, and badge state per tab.
- Uses `chrome.action.setPopup({ tabId, popup: '' })` only while active.
- Handles `chrome.action.onClicked` for active tabs and sends deactivation.
- Restores the popup even when the content script is unavailable.

### Overlay toolbar

- Placement mode: instructional label, `完成`, and `更多`.
- Normal active mode: `標注`, counts, filters, list control, and `更多`.
- `更多` contains the explicit `關閉 WebComment`; a bare close icon is not used for full deactivation.

## Cursor Design

- Use a custom SVG cursor containing only a compact annotation-pin bubble; do not render a separate arrow.
- Match the saved annotation visual language: a rounded circular body, a lower-left tail, brand-purple fill, white outline, and three centered white dots.
- Do not add a drop shadow. At cursor size, a flat silhouette stays sharper on Retina and standard-density displays.
- Set the lower-left tail as the click hotspot so the comment lands where the tail points.
- Fall back to `crosshair` if the custom cursor cannot load.
- Apply it only to eligible host-page targets during placement.
- Overlay controls, editable fields, and the composer retain semantic cursors.
- Do not add hover outlines in this change.

## Failure Handling

- Activation failure keeps the popup open and shows the existing retry message.
- If icon deactivation cannot reach the content script, restore popup/icon state and clear stale activation state.
- This iteration closes a local draft without persistence, matching current prototype behavior.
- Repeated activation or deactivation must not duplicate listeners or throw.

## Accessibility

- `完成`, `更多`, and `關閉 WebComment` have accessible text or names.
- `Esc` follows existing priority for drag, preview, draft, edit, and selection before exiting placement.
- Cursor shape is not the only signal; toolbar copy and icon state are redundant indicators.

## Verification

- Popup `開始標注` immediately enables placement and the custom cursor.
- The first eligible page click opens a composer without another toolbar click.
- `完成` and `Esc` restore the normal cursor while keeping the overlay.
- `關閉 WebComment` removes toolbar, list, pins, cursor, and listeners while preserving stored data.
- Clicking the active Chrome icon closes WebComment and restores the popup for the next click.
- One tab's state does not change another tab.
- Reload, localhost, and a normal website return to a usable inactive state.
