# Popup WebComment Title Design

## Goal

Simplify the extension popup header so the product name is the only title.

## Approved UI

- Remove the small `WebComment` eyebrow from the popup header.
- Replace the `標注工作階段` heading text with `WebComment`.
- Keep the existing `h1` size, line height, weight, and position.
- Use the primary white text color (`var(--text)`, currently `#F4F4F5`) for the heading.
- Keep the `本機測試版` status pill unchanged.

## Scope

Only the popup header markup and its directly related styling are changed. Session controls, popup behavior, the status pill, and the in-page sidebar remain unchanged.

## Implementation

- Remove the `.eyebrow` paragraph from `src/popup/popup.html`.
- Render `<h1>WebComment</h1>` in the existing header container.
- Set the heading color explicitly to `var(--text)` and remove the obsolete `.eyebrow` selector from the shared muted-text rule.

## Verification

- Add a popup UI regression test that requires the single `WebComment` heading, rejects `標注工作階段`, and rejects the eyebrow element.
- Verify the heading style uses `var(--text)`.
- Run the full automated test suite and extension structure check.

