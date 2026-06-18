# Design Spec

## 1. Design Direction

The product should feel lightweight, precise, and collaborative. The UI must stay quiet because it appears on top of other websites.

Design references:

- Figma Comment for pins, threaded discussion, and resolve behavior.
- Pastel for website review mental model.
- Marker.io for trust around website context and capture metadata.

## 2. Experience Principles

1. The host website remains the visual focus.
2. Commenting feels immediate.
3. Pins are visible but not distracting.
4. Thread UI is dense enough for work, not marketing-like.
5. Error and anchor states are explicit.

## 3. Visual System

### Color Tokens

| Token | Value | Usage |
| --- | --- | --- |
| `color.brand` | `#2563EB` | Primary action and active pins |
| `color.brand.hover` | `#1D4ED8` | Primary hover |
| `color.surface` | `#FFFFFF` | Popup and floating composer |
| `color.surface.subtle` | `#F8FAFC` | Secondary panels |
| `color.text` | `#0F172A` | Primary text |
| `color.text.muted` | `#64748B` | Metadata and secondary labels |
| `color.border` | `#E2E8F0` | Dividers and controls |
| `color.success` | `#16A34A` | Resolved state |
| `color.warning` | `#D97706` | Approximate anchor |
| `color.danger` | `#DC2626` | Failed save or lost anchor |
| `color.overlay` | `rgba(15, 23, 42, 0.08)` | Comment placement hint |

### Typography

Use system font stack:

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

Scale:

| Token | Size | Line Height | Usage |
| --- | --- | --- | --- |
| `text.xs` | 12px | 16px | Metadata, timestamps |
| `text.sm` | 14px | 20px | Main UI copy |
| `text.md` | 16px | 24px | Composer text |
| `text.lg` | 18px | 28px | Panel title |

## 4. Layout

### Extension Popup

Recommended size:

- Width: 360px
- Min height: 480px
- Max height: 600px

Layout:

```text
Header
Current Page
Session Selector
Primary Action
Session Tools
Footer Account
```

Page context may show a human-readable page title, environment, and hostname. Do not display the raw pathname or `pageKey`; these are implementation details, not user-facing labels.

### Overlay Toolbar

Position:

- Bottom center or top right.
- Must avoid covering clicked target as much as possible.
- Should be draggable in V2.
- Must not display the current pathname or raw `pageKey`.
- In comment mode, show an instructional label and a primary `完成` action; do not show a second ambiguous activation control.
- Outside comment mode, show `標注` as the entry action.
- Put `關閉 WebComment` in a More menu rather than using an ambiguous bare close icon.

### Comment List Panel

Desktop MVP:

- Replace the earlier full thread drawer with a Figma-like right-side comment list.
- Width: 320px to 380px.
- Right side fixed overlay.
- Height: full viewport.
- Does not resize host page.
- Dark panel style is acceptable because it visually separates review UI from the webpage, similar to Figma's comments panel.
- Selected list item expands to show replies, composer, and resolve action.
- A full drawer may return in V2 for long-form detail or cross-page review.

### Pin Layer

Pins are rendered inside a fixed overlay root:

```css
position: fixed;
inset: 0;
pointer-events: none;
z-index: 2147483646;
```

Interactive children use:

```css
pointer-events: auto;
```

## 5. Pin Visual States

| State | Visual |
| --- | --- |
| Open | Small brand blue-violet comment pin with number or dot |
| Active | Brand blue-violet pin with ring and elevated shadow |
| Hover | Slight scale and compact first-comment preview |
| Dragging | Elevated pin at 1.12x scale with `grabbing` cursor; preview hidden |
| Saving position | Pin stays at the drop point with a subtle progress ring |
| Position save failed | Pin returns to its previous position and an error toast appears |
| Resolved | Muted pin with check state |
| Lost | Red outlined pin with warning icon |
| Draft | Brand blue-violet dashed ring |
| Recovered | Amber subtle ring |

Pin requirements:

- Minimum touch/click target: 28px.
- Visible against light and dark websites.
- Use a small outline or shadow to separate from page content.
- Must not shift when thread count changes.
- Use `grab` on hover and `grabbing` while repositioning.
- Keep the visual center under the pointer during drag.

### Pin Hover Preview

- Width: 240–300px; max width must fit the viewport.
- Contents: 24px avatar, author, relative timestamp, and first comment body clamped to two lines.
- Surface: dark panel for the current overlay theme, 8px radius, 12px padding, soft elevation.
- Place 8px from the pin and flip horizontally or vertically near viewport edges.
- The preview may accept pointer interaction so users can move into it and click to open the full thread.
- It must not include reply inputs, resolve controls, or destructive actions.
- Keyboard focus must expose the same preview content.

## 6. Comment Mode

When active:

- Cursor changes to a compact annotation-pin bubble without a separate arrow. It matches the saved annotation style with a rounded circular body, lower-left tail, brand-purple fill, white outline, and three centered white dots. The tail is the click hotspot; fall back to `crosshair` if the custom cursor cannot load.
- Keep the cursor silhouette flat without a drop shadow so it remains sharp at cursor scale.
- Toolbar shows active state.
- Hovered element may receive a subtle outline.
- Click creates a draft pin.
- A compact floating composer opens next to the draft pin.
- The right-side comment list stays visible so the user can find previous annotations while adding a new one.
- Starting from the extension popup enters this state immediately; no second toolbar click is required.
- Clicking `完成` or pressing `Esc` restores the normal cursor while keeping the overlay available.
- Overlay controls and editable fields retain their normal semantic cursors.

Avoid:

- Large opaque overlays that prevent inspecting the page.
- Permanent DOM changes to the host site.
- Text instructions covering the target area.

## 7. Comment List Content

MVP uses a right-side comment list instead of a standalone drawer. The list is the primary way to find previous annotations.

Required comment list sections:

1. Header
    - Product or session label
    - Title
    - Close/hide action
2. Search and filter
    - Search input
    - Unresolved/resolved toggle
3. Summary
    - Visible comment count
    - Open count
4. Thread list
    - Author avatar and name
    - Timestamp
    - Body preview
    - Reply count
    - Status
    - Anchor status
5. Selected thread detail
    - Replies
    - Reply composer
    - Resolve/reopen action

Legacy full drawer sections, V2:

1. Header
    - Pin id
    - Status
    - Resolve/reopen action
    - Close action
2. Page context
    - Page title
    - Path
    - Anchor status
3. Conversation
    - Original comment
    - Replies
4. Composer
    - Textarea
    - Submit button

## 8. Accessibility

MVP requirements:

- All buttons have accessible names.
- Comment list panel and floating composer use keyboard-focusable controls.
- `Esc` closes draft composer, clears selection, or exits comment mode.
- Pin buttons are keyboard-focusable.
- Color is not the only indicator for resolved or error state.
- Comment composer supports keyboard submission.

## 9. Responsive Behavior

Desktop-first MVP:

- Popup remains fixed-size.
- Comment list can become a bottom sheet below 720px if needed.
- Pins must recalculate on resize.
- Anchor recovery runs after route and viewport changes.

## 10. Loading And Feedback

Use clear lightweight feedback:

- Saving spinner inside submit button.
- Toast for save failed.
- Connection status in toolbar.
- Skeleton rows for thread loading.
- Inline warning for lost anchor.
- Selected pin/list item should update immediately after creating or selecting a comment.

## 11. Design Anti-Patterns

Avoid:

- Marketing-style hero sections in the app surface.
- Large decorative gradients.
- UI cards inside UI cards.
- Pins that look like website content.
- A thread drawer that hides the comment list and makes old annotations hard to find.
- Silent anchor failure.
