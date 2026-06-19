# UX Flow

## 1. Core Experience

The primary experience should feel like Figma Comment applied to a real website:

1. User opens a website.
2. User opens the Chrome extension.
3. User selects or creates a review session.
4. User enters comment mode.
5. User clicks the webpage.
6. A pin appears and a thread composer opens.
7. User submits a comment.
8. Teammates see the pin and thread in realtime.
9. Team discusses, replies, and resolves.
10. Session owner shares review link or archives the session.

## 2. First-Time User Flow

```text
Install extension
→ Sign up / sign in
→ Create workspace
→ Create project
→ Open target website
→ Open extension popup
→ Create review session
→ Enter comment mode
→ Click page
→ Submit first comment
→ Copy review link
```

Key UX requirements:

- Keep onboarding short.
- Do not force a dashboard before the user can comment.
- Explain browser permissions at the moment they are needed.
- Make localhost support visible during session creation.

## 3. Returning User Flow

```text
Open website
→ Extension detects matching active sessions
→ Select session
→ Pins render on page
→ Continue review
```

If multiple sessions match the current page:

- Show the most recently active session first.
- Show project and session names.
- Let user switch sessions from toolbar or popup.

## 4. Comment Creation Flow

```text
Click Start Annotation in the extension popup or Annotation in the overlay toolbar
→ Overlay enters placement state
→ Cursor becomes a compact conversation bubble with its tail as the click hotspot
→ User clicks target
→ Pin draft appears
→ Floating composer opens next to the pin
→ User writes comment
→ Submit
→ Pin becomes active
→ Comment appears in the right-side comment list
→ Realtime event broadcasts
```

States:

- Idle
- Comment mode active
- Draft pin
- Saving
- Saved
- Save failed
- Cancelled

Acceptance details:

- Starting annotation from the popup must enter placement state immediately; users must not activate annotation a second time from the overlay toolbar.
- During placement, the bottom toolbar shows `標注模式 · 點擊頁面留言` with a `完成` action.
- `完成` returns to normal browsing while keeping the WebComment overlay active.
- Pressing `Esc` exits comment mode or closes the draft.
- Clicking outside the composer should not lose typed text without confirmation.
- Empty draft pins should not persist.
- The composer should appear near the clicked pin, like Figma Comment, instead of forcing the user into a full-height drawer.
- After submit, the new thread should be selected in the comment list.
- The page should remain usable when comment mode is off.

### Overlay Exit Flow

```text
Comment mode active
→ Click Done or press Escape
→ Normal cursor returns
→ Pins, toolbar, and comment list remain available

WebComment active
→ Open More and click Close WebComment, or click the active Chrome extension icon
→ Overlay root and WebComment page listeners are removed
→ Stored comments and pins remain unchanged
```

Exit rules:

- `完成` exits placement only; it does not close WebComment.
- `關閉 WebComment` is an explicit text action inside the toolbar's More menu.
- When WebComment is active on a tab, clicking the Chrome action icon closes it on that tab. After close, the next icon click opens the popup again.
- Active and inactive action-icon behavior is scoped per tab.

## 5. Comment List Flow

The MVP must provide a persistent right-side comment list so users can find previous annotations.

```text
Open annotated page
→ Right-side comment list appears
→ User searches or filters comments
→ User selects a comment
→ Matching pin becomes active
→ User replies or resolves from the list
```

Comment list requirements:

- Shows all visible threads for the current session and page.
- Shows author, timestamp, comment body, reply count, status, and anchor status.
- Supports search by comment body, author name, and page key.
- Supports toggling unresolved-only vs including resolved comments.
- Clicking a list item selects the matching pin.
- Clicking a pin selects and scrolls to the matching list item.
- Selected item supports editing the original comment.
- Selected item supports deleting the original comment; deleting the original removes the pin, thread, and replies.
- Selected item supports adding, editing, and deleting replies.
- Empty list explains how to create the first annotation.

## 6. Thread Flow

```text
Click pin
→ Comment list opens if hidden
→ Matching thread is selected in the list
→ Read discussion
→ Add reply
→ Submit
→ Realtime updates
→ Resolve or reopen
```

Selected thread detail should show:

- Pin number or short id
- Page title when useful; never expose the raw page key or pathname
- Anchor status
- Original comment
- Replies
- Reply composer
- Edit and delete actions for comments and replies
- Resolve button
- Copy thread link action

In the Figma-like MVP, this content lives inside an expandable selected item in the right-side comment list. A full drawer can remain a V2 option for longer discussion views.

UI visibility rule:

- `pageKey` and raw pathname are internal matching identifiers and must not be rendered in the popup, overlay toolbar, floating composer, comment list, thread detail, pin preview, toast, or empty state.
- Search, session matching, anchor persistence, and review-link encoding may continue using `pageKey` internally.

### Pin Hover Preview

```text
Pointer enters pin or pin receives keyboard focus
→ Wait 150ms
→ Compact preview appears beside the pin
→ User may move from pin into preview without dismissing it
→ Click pin or preview
→ Full thread opens in the comment list
```

Preview rules:

- Show only the first comment author, relative timestamp, and a maximum two-line body preview.
- Show at most one pin preview at a time.
- Auto-flip and clamp the preview so it remains inside the viewport.
- Hover alone must not select the thread, open the comment list, or change scroll position.
- Dismiss 120ms after pointer leaves both pin and preview to avoid flicker.
- `Escape` dismisses the preview. Touch devices skip hover preview and use tap to open the thread.

### Reposition Existing Pin

```text
Pointer down on an existing pin
→ Move at least 1px
→ Dragging state begins and hover preview closes
→ Pin follows pointer
→ Drop on new location
→ Capture target element and new hybrid anchor
→ Optimistically keep new position
→ Persist anchor update and broadcast realtime event
```

Drag rules:

- A click without crossing the threshold continues to open the thread.
- Existing pins remain draggable while comment mode is active; completing, cancelling, or failing a drag does not exit comment mode.
- While dragging, prevent host-page click, selection, and native drag behavior.
- Determine the drop target beneath the overlay, not the pin element itself.
- On save failure, animate or snap back to the previous position and show a retryable error.
- `Escape` during drag cancels and restores the original position.
- Only the comment author, Editor, or Admin may reposition a pin.
- Concurrent remote anchor updates use last confirmed server revision; a conflict refreshes the newest anchor and informs the user.

## 7. Resolve Flow

```text
Open thread
→ Click Resolve
→ Thread status becomes resolved
→ Pin changes visual state
→ Event broadcasts
```

Resolved thread behavior:

- Resolved pins are visually muted.
- User can toggle `Show resolved`.
- Editor or Admin can reopen a resolved thread.
- Replies to resolved threads are disabled by default or trigger reopen confirmation.

## 8. Share Review Link Flow

```text
Open session menu
→ Copy review link
→ Recipient opens link
→ System checks auth and extension
→ Opens target URL with session context
→ Pins render
```

Fallback states:

- Not signed in: show sign-in gate.
- No permission: request access.
- Extension missing: show install CTA.
- Website requires private auth: explain user must have website access.
- Page cannot open automatically: show target URL and session id.

## 9. Realtime Collaboration Flow

Realtime events must update without page refresh:

- User joined
- User left
- Pin created
- Comment created
- Reply created
- Thread resolved
- Thread reopened
- Typing indicator, V2

MVP presence display:

- Small active collaborator avatars in toolbar.
- Optional "User is viewing this page" indicator.

## 10. URL And Localhost Flow

When opening the extension on a page:

1. Extract hostname, pathname, search params, and title.
2. Generate page key.
3. Match active sessions by project and page key.
4. If no session exists, offer create session.
5. For localhost, ask user to choose or confirm project/session.

For localhost review links:

- Link should not assume another user can open the same `localhost` address.
- Link should carry session context and page key.
- UI should explain that the recipient must run the app locally or open the matching staging URL.

## 11. Empty States

### No Session

Message: `No review session for this page yet.`

Primary action: `Create session`

Secondary action: `Join by link`

### No Comments

Message: `Click anywhere to start the discussion.`

Primary action: `Comment`

### No Matching Page

Message: `This session has no comments on the current page.`

Primary action: `Add first comment`

## 12. Error States

| Error | User Message | Recovery |
| --- | --- | --- |
| Connection lost | `Reconnecting... changes may be delayed.` | Auto retry with status indicator. |
| Save failed | `Comment was not saved.` | Retry and keep draft content. |
| Permission denied | `You do not have permission for this session.` | Request access or switch session. |
| Anchor recovery failed | `Comment location unavailable.` | Show in the comment list and allow manual reposition, V2. |
| Extension unavailable on page | `This page cannot be annotated.` | Explain restricted browser pages. |

## 13. Keyboard And Interaction

MVP keyboard support:

- `Esc`: exit comment mode, close draft composer, or clear the selected thread. It does not fully close WebComment.
- `Cmd/Ctrl + Enter`: submit comment or reply.
- `C`: enter comment mode when overlay toolbar is focused.

Interaction rules:

- Pin click opens the comment list and selects the matching thread.
- Comment list should not resize the host page.
- Comment mode should prevent accidental site clicks only while placing a pin.
- Overlay should not permanently mutate the host page DOM outside its own root.

## 14. Mobile And Responsive Review

MVP is Chrome desktop-first.

Still required:

- Pins must remain stable when viewport width changes.
- Store viewport dimensions used at creation.
- Support responsive layout recovery by element anchor first, then relative offset.

V2:

- Mobile browser review.
- Device preview modes.
- Screenshot comparison.
