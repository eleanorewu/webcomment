# Comment Author Permissions Design

## Goal

Align the access control model so that both Owner and Guest can resolve threads and move pins, while delete and edit are restricted to the author of each individual comment. Give the Owner a meaningful actor identity in private sessions instead of the generic `'local_user'` placeholder.

## Scope

- Store layer: relax resolve and drag-pin restrictions, add per-author delete and edit guards, introduce `ownerId` for private sessions.
- Content script layer: surface `accessRole` from `getSessionPageData`, conditionally render delete and edit buttons.
- Tests: update existing permission tests and add new author-scoped cases.

## Out of Scope

- Changing session management permissions (close, password change, guest removal, invite reset remain owner-only).
- Backend, Supabase, or realtime sync.
- Guest display name editing.
- Any new UI for "you do not have permission" messaging beyond simply not rendering the button.

## Permission Model

| Action | Owner | Guest | None |
|---|---|---|---|
| Read comments | ✓ | ✓ | ✗ |
| Add comment / reply | ✓ (active session) | ✓ (active session) | ✗ |
| Resolve / unresolve thread | ✓ | ✓ | ✗ |
| Move pin (drag) | ✓ | ✓ | ✗ |
| Edit own comment | ✓ | ✓ | ✗ |
| Delete own comment | ✓ | ✓ | ✗ |
| Edit other's comment | ✗ | ✗ | ✗ |
| Delete other's comment | ✗ | ✗ | ✗ |
| Session management | ✓ | ✗ | ✗ |

A user with role `none` cannot see any comments, so they have no operation targets. The restriction is implicit.

## Actor Identity

### local_legacy sessions

No change. `state.currentUser.id` remains `'local_user'`. All comments in these sessions already carry `authorId: 'local_user'`, which equals the actor ID for the single local user. Legacy behaviour is preserved.

### guest_password sessions (private Review Sessions)

**Owner:** When `createPrivateSession` runs, generate a stable `ownerId` using `id('owner')` and store it in `state.access[sessionId].ownerId`. This ID is the owner's actor identity for the lifetime of the session in this browser.

**Guest:** The existing `guestId` already serves as the actor identity and is already stored in `state.access[sessionId].guestId`.

`getCurrentAuthor` is updated to return the `ownerId` as `id` when the session is `guest_password` and the role is `owner`, instead of falling back to `state.currentUser`.

## Data Flow

### `accessRole` in `getSessionPageData`

`getSessionPageData` already reads state and resolves the access role internally (via `requireSessionReadAccess`). The resolved role object is included in the return value:

```js
{
  page,
  pins,
  threads,
  comments,
  accessRole: {
    role: 'owner' | 'guest' | 'none',
    actorId: string | null,
    canManage: boolean,
    canComment: boolean,
    canRead: boolean,
  }
}
```

`actorId` is derived from `getStoredAccessRole` as follows:
- `role === 'guest'`: `actorId = accessRole.guestId`
- `role === 'owner'` and `session.accessMode === 'guest_password'`: `actorId = state.access[sessionId].ownerId`
- `role === 'owner'` and `session.accessMode === 'local_legacy'`: `actorId = state.currentUser.id`
- `role === 'none'`: `actorId = null`

### Content Script `state`

Add `accessRole` to the content script state object:

```js
accessRole: { role: 'none', actorId: null, canManage: false, canComment: false, canRead: false }
```

`refreshData` assigns `state.accessRole` from the `accessRole` field in the `getSessionPageData` response.

## Store Changes

### `setThreadResolved`

Change the access guard from `requireSessionOwnerWriteAccess` to `requireSessionCommentAccess`. Any authenticated user with comment permission can resolve or unresolve a thread.

### `updatePinAnchor`

Change the access guard from `requireSessionOwnerWriteAccess` to `requireSessionCommentAccess`. Any authenticated user with comment permission can drag a pin to a new position. The `movedBy` field is updated to the current actor's ID.

### `deleteComment`

Replace the `requireSessionOwnerWriteAccess` guard with an author check:

1. Resolve `actorId` for the current session.
2. If `comment.authorId !== actorId`, throw `'Cannot delete another user's comment'`.

The existing thread-and-pin cascade delete (deleting the root comment also removes the thread and pin) continues to apply, but only when the actor is the original comment's author.

### `updateComment`

Replace the `requireSessionOwnerWriteAccess` guard with an author check:

1. Resolve `actorId` for the current session.
2. If `comment.authorId !== actorId`, throw `'Cannot edit another user's comment'`.

### `getCurrentAuthor`

Updated logic:

```
if role is 'guest' and guestId exists:
  return guest identity from state.sessionGuests
if session.accessMode is 'guest_password' and role is 'owner':
  return { id: access[sessionId].ownerId, displayName: state.currentUser.displayName, initials: state.currentUser.initials }
return state.currentUser  (local_legacy fallback)
```

### Helper: `resolveActorId(state, sessionId, accessRole)`

A private store helper (not exported) that returns the `actorId` string from the access role and session access entry. Used by `deleteComment`, `updateComment`, and `getSessionPageData`.

## Content Script UI Changes

### Identifying own comments

A comment is "own" when `comment.authorId === state.accessRole.actorId`.

### Affected render locations

There are three places in `content-script.js` that render comment action buttons:

1. **Popover** (inline thread view, opened by clicking a pin)
2. **Sidebar thread list** (compact thread rows)
3. **Sidebar expanded comment view** (full comment body with actions)

In all three locations:
- **Delete button**: render only when the comment is own (`comment.authorId === state.accessRole.actorId`).
- **Edit button**: render only when the comment is own.
- **Resolve button**: no change, render whenever `canComment` is true.
- **Drag interaction on pins**: no change, available whenever `canComment` is true. The existing `beginPinPointer` / drag flow continues unchanged; the store-level guard is now `requireSessionCommentAccess` which permits guests.

## Error Handling

Store functions that reject an unauthorised edit or delete throw a descriptive error. The content script should not encounter these errors in normal use because the buttons are not rendered for non-own comments. If an error does reach the UI, the existing `handleAsyncError` path in the content script handles it.

## Testing

### `tests/session-access.test.mjs`

**Update existing test:** `'guests can comment and reply but cannot perform owner moderation actions'`
- Remove assertions that guests cannot resolve and cannot drag pins.
- Add assertions that guests CAN resolve and CAN call `updatePinAnchor`.
- Keep assertions that guests cannot call session management functions (close, changePassword, removeGuest, resetInviteLink).

**New test:** `'users can delete and edit their own comments but not others'`
- Create a private session as owner, add a comment.
- Join as guest, add a comment.
- Verify owner can delete the owner comment (actorId matches).
- Verify owner cannot delete the guest comment (different authorId).
- Verify guest can delete the guest comment.
- Verify guest cannot delete the owner comment.
- Same pattern for `updateComment`.

**New test:** `'getSessionPageData returns accessRole with correct actorId'`
- Create a private session, verify `accessRole.actorId` matches `access[sessionId].ownerId`.
- Join as guest, verify `accessRole.actorId` matches `guest.id`.

**New test:** `'owner in private session gets a stable ownerId distinct from local_user'`
- Create a private session, verify `state.access[sessionId].ownerId` exists and does not equal `'local_user'`.
- Verify owner's created comment has `authorId` equal to `ownerId`.

## Acceptance Criteria

- Guest can resolve and unresolve any thread in the session.
- Guest can drag any pin to a new position.
- Guest sees delete and edit buttons only on their own comments.
- Owner sees delete and edit buttons only on their own comments.
- Attempting to delete or edit another user's comment at the store level throws an error.
- Owner's comments in a private session carry an `authorId` of the form `owner_xxx`, not `'local_user'`.
- `local_legacy` session behaviour is unchanged.
- All existing tests continue to pass after updating the guest-moderation test.
