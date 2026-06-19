# Component Spec

## 1. Component Inventory

MVP components:

- Extension Popup
- Session Selector
- Current Page Summary
- Comment Mode Button
- Overlay Root
- Overlay Toolbar
- Pin
- Draft Pin
- Floating Composer
- Comment List Panel
- Comment Item
- Reply Composer
- Resolve Button
- Share Link Button
- Presence Avatars
- Toast
- Connection Status

## 2. Extension Popup

Purpose:

- Let users choose context and start review actions.

Props:

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `currentUser` | `User` | Yes | Signed-in user. |
| `currentPage` | `PageContext` | Yes | Current browser tab context. |
| `workspaces` | `Workspace[]` | Yes | Available workspaces. |
| `activeSession` | `ReviewSession?` | No | Selected session. |
| `matchingSessions` | `ReviewSession[]` | Yes | Sessions matching page key. |

States:

- Signed out
- Loading
- No workspace
- No session
- Active session
- Error

Actions:

- Create session
- Select session
- Start comment mode
- Copy review link
- Toggle resolved pins
- Open dashboard
- Close WebComment on the current tab when already active

## 3. Session Selector

Purpose:

- Select or create a review session for the current page.

Behavior:

- Shows session name, project name, open count, and last activity.
- Prioritizes sessions matching current page key.
- Allows create-new flow when no match exists.

Empty state:

- `No sessions match this page.`

## 4. Current Page Summary

Purpose:

- Make page/session matching transparent.

Displays:

- Page title
- Hostname
- Environment label: production, staging, localhost, unknown

Localhost note:

- Show the localhost environment label and hostname/port only. Continue using page key internally for matching, but do not expose it as visible UI text.

Visibility constraint:

- Raw `pageKey` and pathname must remain hidden across all user-facing components, including popup, toolbar, composer, comment list, thread detail, pin preview, toast, and empty states.
- If the document title is unavailable, use a neutral label such as `目前頁面`; do not fall back to `pageKey`.

## 5. Overlay Root

Purpose:

- Mount extension UI on the host page.

Technical requirements:

- Use Shadow DOM when practical to avoid style collisions.
- Highest safe z-index.
- Fixed position.
- No layout mutation to host document.
- Cleans up its root, listeners, timers, and history hooks when WebComment is closed on the current tab.
- Activation and deactivation are idempotent.

## 6. Overlay Toolbar

Purpose:

- Provide in-page controls without returning to popup.

Contains:

- Comment mode toggle
- Session name
- Open thread count
- Show resolved toggle
- Presence avatars
- Connection status
- `完成` while comment mode is active
- More menu with `關閉 WebComment`

States:

- Idle
- Comment mode
- Syncing
- Offline

Behavior:

- Popup activation enters comment mode directly.
- `完成` and `Escape` leave comment mode without removing the overlay.
- `關閉 WebComment` removes the complete overlay from the current tab while preserving stored data.

## 7. Pin

Purpose:

- Show the location of a thread on the website.

Props:

| Prop | Type | Description |
| --- | --- | --- |
| `pinId` | `string` | Pin id. |
| `threadId` | `string` | Related thread id. |
| `status` | `open | resolved | lost | recovered | draft` | Visual state. |
| `position` | `{ x: number; y: number }` | Viewport position. |
| `index` | `number?` | Optional visible number. |
| `firstComment` | `CommentPreview` | Author, time, and preview body. |
| `canReposition` | `boolean` | Whether drag-to-reposition is enabled. |
| `anchorRevision` | `number` | Confirmed anchor revision for conflict handling. |

Interactions:

- Click opens thread.
- Hover shows short preview.
- Keyboard focus opens preview and Enter opens thread.
- Pointer movement of at least 1px starts repositioning when permitted, including while comment mode is active.
- `Escape` cancels an active drag.

States:

- Idle
- Preview open
- Active
- Dragging
- Saving position
- Position save failed

## 7.1 Pin Preview

Purpose:

- Reveal the first comment quickly without opening or selecting the full thread.

Props:

| Prop | Type | Description |
| --- | --- | --- |
| `authorName` | `string` | First comment author. |
| `authorInitials` | `string` | Avatar fallback. |
| `createdAt` | `string` | Relative timestamp source. |
| `body` | `string` | First comment body, clamped to two lines. |
| `position` | `top | right | bottom | left` | Auto-selected placement. |

Interactions:

- Opens after a 150ms hover or focus delay.
- Remains open while pointer is over the pin or preview.
- Clicking opens the full thread.
- `Escape` or a 120ms leave delay dismisses it.

## 8. Draft Pin

Purpose:

- Temporary pin before the first comment is submitted.

Rules:

- Not persisted until comment submit.
- Cancel removes it.
- Save failure keeps draft visible and composer content intact.

## 9. Floating Composer

Purpose:

- Let the user write the first comment immediately next to the clicked pin, matching the Figma Comment interaction model.

Behavior:

- Appears beside the draft pin.
- Auto-focuses the textarea.
- Can be cancelled without creating a persisted pin.
- Submitting creates pin, thread, and first comment.
- After submit, the new thread is selected in the comment list.

States:

- Draft
- Saving
- Save failed

## 10. Comment List Panel

Purpose:

- Provide a persistent place to find previous annotations on the current page.

Props:

| Prop | Type | Required |
| --- | --- | --- |
| `threads` | `Thread[]` | Yes |
| `pins` | `Pin[]` | Yes |
| `comments` | `Comment[]` | Yes |
| `selectedThreadId` | `string?` | No |
| `includeResolved` | `boolean` | Yes |
| `searchQuery` | `string` | Yes |
| `collapsed` | `boolean` | Yes |

Actions:

- Collapse/expand panel (toggle button in header; collapses to header-only, expands to full panel)
- Search comments
- Toggle resolved visibility
- Select thread
- Edit original comment
- Delete original comment
- Reply
- Edit reply
- Delete reply
- Resolve
- Reopen

States:

- Loading
- Empty
- Filtered empty
- List
- Selected thread
- Saving reply
- Error
- Collapsed (header only visible; content hidden)

Thread list item layout:

- Pin index displayed as `#N` in muted grey text with no background; resolved threads show `✓` instead of the number.
- Author avatar and name
- Relative timestamp
- Body preview
- Reply count
- Persistent footer: reply count on the left; edit, delete, and resolve/reopen actions on the right.
- Author name and timestamp use line heights of 14px and 12px with no row gap, for a 26px combined height.

Interactions:

- Clicking the collapse/expand button in the header toggles the panel between full and collapsed (header-only) states.
- Clicking a thread selects it and highlights the matching pin.
- Clicking a pin opens the panel (auto-expands if collapsed), selects the matching thread, and scrolls it into view.
- Footer actions remain visible in collapsed and expanded states and do not toggle thread expansion.
- Clicking the reply count selects and expands the thread; clicking edit also opens the original-comment edit form.
- Selected thread expands inline to show replies and reply composer.

## 11. Comment Item

Displays:

- Author avatar
- Author name
- Timestamp
- Body
- Edited indicator
- Edit action
- Delete action

MVP content type:

- Plain text with links auto-detected.

Rules:

- Editing updates the existing comment body and shows an edited indicator.
- Deleting a reply removes only that reply.
- Deleting the original comment removes the entire annotation: pin, thread, original comment, and replies.

V2:

- Mentions
- Attachments
- Screenshots
- Rich text

## 12. Reply Composer

Requirements:

- Multiline textarea.
- Submit button with an up-arrow SVG icon; disabled when textarea is empty and while a submission is in progress.
- `Cmd/Ctrl + Enter` submit.
- Disabled when user lacks permission.
- Keeps content on network failure.

Validation:

- Required body.
- Max length: 5,000 characters for MVP.

## 13. Resolve Button

Purpose:

- Change thread state.

Placement:

- Appears in the original message's action row alongside the edit and delete controls, not in the reply form area.

Labels and icons:

- Open thread: checkmark icon + `標記已解決`; muted grey, hover white.
- Resolved thread: return-arrow icon + `標記未解決`; blue `#40B5F3`, hover `#7DCEF8`.

Permission:

- Editor and Admin in MVP.

## 14. Share Link Button

Purpose:

- Copy a session or thread review link.

Behavior:

- Click copies link to clipboard.
- Shows copied confirmation.
- If clipboard permission fails, displays manual copy field.

Link types:

- Session link
- Thread deep link, V2 or late MVP

## 15. Presence Avatars

Purpose:

- Show active collaborators in the same session.

MVP:

- Display up to 3 avatars.
- Overflow count.
- Tooltip with names.

## 16. Toast

Types:

- Success
- Info
- Warning
- Error

Common messages:

- `Comment saved`
- `Link copied`
- `Connection lost`
- `Anchor could not be found`

## 17. Connection Status

States:

- Connected
- Connecting
- Reconnecting
- Offline

UI:

- Small dot and label in toolbar.
- Avoid noisy modals unless user action fails.
