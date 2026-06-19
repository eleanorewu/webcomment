# Sidebar Resolved Link Design

## Goal

Match the approved compact sidebar reference while preserving the existing resolved-visibility behavior and the persistent actions on every annotation card.

## Visual Changes

### Header

- Replace the two-line `WebComment` and `標注留言` heading with one `WebComments` heading.
- Keep the collapse and expand button in its current top-right position.
- Use the existing dark panel colors and spacing system.

### Search

- Keep the existing search field and search behavior.
- Remove the resolved toggle from the search row so the search field occupies the full available width.

### Summary And Resolved Toggle

- Keep the existing summary counts on the left: annotation or search-result count and unresolved count.
- Move the existing `data-action="toggle-resolved"` control into the right side of the summary row.
- Render it as an underlined text control rather than a bordered button.
- Use `#B2D4FC` for both states.
- When resolved annotations are hidden, label it `查看已解決`.
- When resolved annotations are included, label it `返回未解決`.
- Keep the summary row's bottom divider and remove its top divider.

## Behavior

The change is presentational. Keep the existing `includeResolved` boolean, event listener, `refreshData()`, `render()`, `updateBadge()`, pin visibility, popup message handling, and storage behavior unchanged.

The toggle continues to switch between:

- unresolved annotations only;
- unresolved and resolved annotations together.

Search continues to filter the currently loaded annotations. Summary text keeps its existing search-result behavior.

## Preserved UI

- Keep the permanent edit, delete, and resolve or reopen action footer on every primary annotation card.
- Keep the 26px combined author and timestamp line height.
- Keep card rendering, reply expansion, editing, deletion, resolution, pin dragging, and anchor behavior unchanged.

## Implementation Scope

Update `src/content/content-script.js` only for the sidebar template and embedded sidebar styles:

- simplify the header markup;
- move the existing toggle button into the summary row;
- make the search tools row single-column;
- restyle the existing toggle as the approved text link;
- adjust summary spacing and divider styling.

Update the relevant design and component documentation. Do not change the data model, store, popup, service worker, or manifest.

## Verification

Automated regression checks must verify:

- the header contains `WebComments` and no legacy eyebrow;
- the search tools use one full-width column;
- the summary row contains the existing `toggle-resolved` control;
- the labels are `查看已解決` and `返回未解決`;
- the control uses `#B2D4FC`, underline styling, and no bordered-button treatment;
- persistent thread actions remain present.

Manual Chrome verification must cover both resolved-toggle states, search input behavior, collapsed sidebar state, and the permanent annotation-card actions.
