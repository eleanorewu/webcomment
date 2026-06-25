# Comment Author Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align comment delete/edit to own-comment-only for all roles, give guests resolve and drag-pin access, and assign private-session owners a stable `ownerId` instead of the generic `'local_user'` placeholder.

**Architecture:** All permission logic lives in `src/shared/store.js`. `getStoredAccessRole` is extended to return an `actorId` field. `getSessionPageData` includes `accessRole` in its response so the content script reads identity once per refresh without an extra storage call. The content script conditionally renders delete/edit buttons based on `comment.authorId === state.accessRole.actorId`.

**Tech Stack:** Chrome Extension Manifest V3, plain JavaScript, Chrome local storage, Web Crypto API, Node.js built-in test runner

## Global Constraints

- No Supabase, realtime, or backend changes in this plan.
- Run tests with: `node --test tests/<file>.mjs`
- Run all tests with: `npm test`
- `local_legacy` session behaviour must not change (single user, all owns all).
- Error messages must match the exact strings asserted in existing tests unless the test itself is being updated.

---

## File Structure

- Modify: `src/shared/store.js` — owner identity, actorId in access role, relaxed guards, author checks, accessRole in getSessionPageData
- Modify: `src/content/content-script.js` — accessRole state, refreshData, conditional delete/edit buttons in 3 render locations
- Modify: `tests/session-access.test.mjs` — new and updated tests for all store changes
- Modify: `tests/comment-mode-ui.test.mjs` — source-pattern tests for content script changes

---

### Task 1: Owner Identity and `actorId` in Access Role

**Files:**
- Modify: `src/shared/store.js`
- Modify: `tests/session-access.test.mjs`

**Interfaces:**
- Produces: `getStoredAccessRole` returns `{ role, guestId, actorId, canManage, canComment, canRead }` — `actorId` is `owner_xxx` for private-session owners, guest ID for guests, `state.currentUser.id` for local-legacy, `null` for none
- Produces: `createPrivateSession` stores `ownerId` in `state.access[sessionId].ownerId`
- Produces: `getCurrentAuthor` returns `{ id: ownerId, displayName, initials }` for private-session owners
- Consumed by: Task 2, Task 3, Task 4

- [ ] **Step 1: Write failing tests**

Append to `tests/session-access.test.mjs`:

```js
test('owner in private session gets a stable ownerId distinct from local_user', async () => {
  const chrome = createChromeStorage();
  const store = loadStoreWithAccess(chrome);
  const pageContext = store.getPageContext('https://example.com/', 'Home');
  const created = await store.createPrivateSession({ name: 'Test', password: 'pass', pageContext });

  const state = await store.readState();
  const ownerId = state.access[created.session.id].ownerId;

  assert.ok(ownerId, 'ownerId should be set in access entry');
  assert.match(ownerId, /^owner_/);
  assert.notEqual(ownerId, 'local_user');

  const result = await store.createThread(
    created.session.id,
    pageContext,
    { mode: 'page', pageKey: pageContext.pageKey, documentPosition: { x: 10, y: 20 }, viewportPosition: { x: 10, y: 20 } },
    'Owner comment',
  );
  assert.equal(result.comment.authorId, ownerId);
  assert.equal(result.pin.createdBy, ownerId);
});

test('getStoredAccessRole returns correct actorId for owner, guest, and none', async () => {
  const chrome = createChromeStorage();
  const store = loadStoreWithAccess(chrome);
  const pageContext = store.getPageContext('https://example.com/', 'Home');
  const created = await store.createPrivateSession({ name: 'Test', password: 'pass', pageContext });

  // Owner
  const ownerData = await store.getSessionPageData(created.session.id, pageContext, false);
  const storedState = await store.readState();
  const ownerId = storedState.access[created.session.id].ownerId;
  assert.equal(ownerData.accessRole.role, 'owner');
  assert.equal(ownerData.accessRole.actorId, ownerId);
  assert.match(ownerData.accessRole.actorId, /^owner_/);

  // Guest
  const joined = await store.joinPrivateSession({
    sessionId: created.session.id,
    inviteSecret: created.inviteSecret,
    password: 'pass',
    displayName: 'Ada',
  });
  const guestData = await store.getSessionPageData(created.session.id, pageContext, false);
  assert.equal(guestData.accessRole.role, 'guest');
  assert.equal(guestData.accessRole.actorId, joined.guest.id);
});
```

- [ ] **Step 2: Run tests to verify RED**

```bash
node --test tests/session-access.test.mjs
```

Expected: The two new tests fail — `ownerId` is not set, `getSessionPageData` has no `accessRole` field.

- [ ] **Step 3: Add `ownerId` to `createPrivateSession` in `src/shared/store.js`**

In `createPrivateSession`, after `const owner = await helpers.createCapability('owner');`, add:

```js
const ownerId = id('owner');
```

In the `state.access[sessionId]` assignment, add `ownerId`:

```js
state.access[sessionId] = {
  sessionId,
  role: 'owner',
  token: owner.token,
  ownerId,
  storedOwnerTokenForAdminRecovery: owner.token,
  guestId: null,
  storedAt: createdAt,
};
```

- [ ] **Step 4: Update `getStoredAccessRole` to return `actorId`**

Replace the entire `getStoredAccessRole` function:

```js
async function getStoredAccessRole(state, sessionId) {
  const session = state.sessions[sessionId];
  const localAccess = state.access?.[sessionId];
  if (!session) {
    return {
      role: 'none',
      guestId: null,
      actorId: null,
      canManage: false,
      canComment: false,
      canRead: false,
    };
  }
  if (session.accessMode === 'local_legacy') {
    return {
      role: 'owner',
      guestId: null,
      actorId: state.currentUser.id,
      canManage: true,
      canComment: session?.status !== 'closed',
      canRead: true,
    };
  }
  const role = await requireAccessHelpers().getAccessRole(session, state.sessionGuests, localAccess?.token);
  let actorId = null;
  if (role.role === 'owner') {
    actorId = localAccess?.ownerId || state.currentUser.id;
  } else if (role.role === 'guest') {
    actorId = role.guestId;
  }
  return { ...role, actorId };
}
```

- [ ] **Step 5: Update `getCurrentAuthor` to use `ownerId` for private-session owners**

Replace the entire `getCurrentAuthor` function:

```js
function getCurrentAuthor(state, sessionId, accessRole) {
  if (accessRole.role === 'guest' && accessRole.guestId) {
    const guest = state.sessionGuests[accessRole.guestId];
    if (guest) {
      return {
        id: guest.id,
        displayName: guest.displayName,
        initials: guest.displayName.slice(0, 1),
      };
    }
  }
  const localAccess = state.access?.[sessionId];
  if (accessRole.role === 'owner' && localAccess?.ownerId) {
    return {
      id: localAccess.ownerId,
      displayName: state.currentUser.displayName,
      initials: state.currentUser.initials,
    };
  }
  return state.currentUser;
}
```

- [ ] **Step 6: Update `getSessionPageData` to include `accessRole`**

Replace the entire `getSessionPageData` function:

```js
async function getSessionPageData(sessionId, pageContext, includeResolved) {
  const state = await readState();
  const accessRole = await requireSessionReadAccess(state, sessionId);
  return {
    ...selectSessionPageData(state, sessionId, pageContext, includeResolved),
    accessRole,
  };
}
```

- [ ] **Step 7: Run tests to verify GREEN**

```bash
node --test tests/session-access.test.mjs
```

Expected: All existing tests plus the 2 new tests pass (40 total).

- [ ] **Step 8: Commit**

```bash
git add src/shared/store.js tests/session-access.test.mjs
git commit -m "feat: add ownerId to private sessions and actorId to access role"
```

---

### Task 2: Allow Guests to Resolve Threads and Move Pins

**Files:**
- Modify: `src/shared/store.js`
- Modify: `tests/session-access.test.mjs`

**Interfaces:**
- Consumes: `requireSessionCommentAccess` (already exported internally, returns role with `actorId` after Task 1)
- Produces: `setThreadResolved` and `updatePinAnchor` succeed for guests with active session access

- [ ] **Step 1: Update the existing guest moderation test**

Find the test `'guests can comment and reply but cannot perform owner moderation actions'` in `tests/session-access.test.mjs`. It currently ends with four `assert.rejects` for `updatePinAnchor`, `updateComment`, `deleteComment`, and `setThreadResolved`. 

Replace those four assertions with the following (keep the session-management rejects above them unchanged):

```js
  // guests can resolve and move pins
  await assert.doesNotReject(
    store.setThreadResolved(result.thread.id, true),
    'guest should be able to resolve threads',
  );
  await assert.doesNotReject(
    store.updatePinAnchor(result.pin.id, result.pin.anchor, result.pin.anchorRevision),
    'guest should be able to move pins',
  );
  // guests can edit and delete their own comments
  await assert.doesNotReject(
    store.updateComment(result.comment.id, 'Guest edit'),
    'guest should be able to edit own comment',
  );
  await assert.doesNotReject(
    store.deleteComment(result.comment.id),
    'guest should be able to delete own comment',
  );
```

- [ ] **Step 2: Run test to verify RED**

```bash
node --test tests/session-access.test.mjs
```

Expected: The updated test fails because `setThreadResolved`, `updatePinAnchor`, `updateComment`, and `deleteComment` still throw `'Owner access required'`.

- [ ] **Step 3: Update `setThreadResolved` guard in `src/shared/store.js`**

In `setThreadResolved`, replace:

```js
const accessRole = await requireSessionOwnerWriteAccess(state, thread.sessionId);
```

with:

```js
const accessRole = await requireSessionCommentAccess(state, thread.sessionId);
```

- [ ] **Step 4: Update `updatePinAnchor` guard in `src/shared/store.js`**

In `updatePinAnchor`, replace:

```js
const accessRole = await requireSessionOwnerWriteAccess(state, pin.sessionId);
```

with:

```js
const accessRole = await requireSessionCommentAccess(state, pin.sessionId);
```

- [ ] **Step 5: Run tests to verify GREEN**

```bash
node --test tests/session-access.test.mjs
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/shared/store.js tests/session-access.test.mjs
git commit -m "feat: allow guests to resolve threads and move pins"
```

---

### Task 3: Per-Author Delete and Edit Guards

**Files:**
- Modify: `src/shared/store.js`
- Modify: `tests/session-access.test.mjs`

**Interfaces:**
- Consumes: `accessRole.actorId` from `requireSessionCommentAccess` (available after Task 1)
- Produces: `deleteComment` and `updateComment` throw `'Cannot delete another user\'s comment'` / `'Cannot edit another user\'s comment'` when `comment.authorId !== actorId`

- [ ] **Step 1: Write failing tests**

Append to `tests/session-access.test.mjs`:

```js
test('users can delete and edit their own comments but not others', async () => {
  const chrome = createChromeStorage();
  const store = loadStoreWithAccess(chrome);
  const pageContext = store.getPageContext('https://example.com/', 'Home');
  const created = await store.createPrivateSession({ name: 'Test', password: 'pass', pageContext });
  const anchor = { mode: 'page', pageKey: pageContext.pageKey, documentPosition: { x: 10, y: 20 }, viewportPosition: { x: 10, y: 20 } };

  // Owner creates a comment (still active access = owner)
  const ownerThread = await store.createThread(created.session.id, pageContext, anchor, 'Owner comment');

  // Guest joins and creates a comment
  const joined = await store.joinPrivateSession({
    sessionId: created.session.id,
    inviteSecret: created.inviteSecret,
    password: 'pass',
    displayName: 'Ada',
  });
  const guestThread = await store.createThread(created.session.id, pageContext, anchor, 'Guest comment');

  // Guest tries to edit/delete the owner's comment — should fail
  await assert.rejects(
    store.updateComment(ownerThread.comment.id, 'Guest edit of owner comment'),
    /Cannot edit another user's comment/,
  );
  await assert.rejects(
    store.deleteComment(ownerThread.comment.id),
    /Cannot delete another user's comment/,
  );

  // Guest edits and deletes their own comment — should succeed
  await assert.doesNotReject(
    store.updateComment(guestThread.comment.id, 'Guest edited'),
    'guest should edit own comment',
  );

  // Switch back to owner access to test owner restrictions
  const state = await store.readState();
  state.access[created.session.id] = {
    sessionId: created.session.id,
    role: 'owner',
    token: created.ownerToken,
    ownerId: state.access[created.session.id].ownerId,
    storedOwnerTokenForAdminRecovery: created.ownerToken,
    guestId: null,
    storedAt: state.access[created.session.id].storedAt,
  };
  await store.writeState(state);

  // Owner tries to delete the guest's comment — should fail
  await assert.rejects(
    store.deleteComment(guestThread.comment.id),
    /Cannot delete another user's comment/,
  );

  // Owner deletes their own comment — should succeed (cascades thread+pin)
  await assert.doesNotReject(
    store.deleteComment(ownerThread.comment.id),
    'owner should delete own comment',
  );
});
```

- [ ] **Step 2: Run test to verify RED**

```bash
node --test tests/session-access.test.mjs
```

Expected: The new test fails — `deleteComment` and `updateComment` still throw `'Owner access required'` instead of the new per-author error.

- [ ] **Step 3: Replace `deleteComment` in `src/shared/store.js`**

Replace the entire `deleteComment` function:

```js
async function deleteComment(commentId) {
  const state = await readState();
  const comment = state.comments[commentId];
  if (!comment) throw new Error('Comment not found');
  const thread = state.threads[comment.threadId];
  if (!thread) throw new Error('Thread not found');
  const accessRole = await requireSessionCommentAccess(state, thread.sessionId);
  if (comment.authorId !== accessRole.actorId) throw new Error('Cannot delete another user\'s comment');

  if (!comment.parentCommentId) {
    Object.values(state.comments)
      .filter((candidate) => candidate.threadId === thread.id)
      .forEach((candidate) => {
        delete state.comments[candidate.id];
      });
    if (thread.pinId) delete state.pins[thread.pinId];
    delete state.threads[thread.id];
    if (state.sessions[thread.sessionId]) state.sessions[thread.sessionId].updatedAt = now();
    await writeState(state);
    return { deletedThreadId: thread.id };
  }

  delete state.comments[commentId];
  thread.updatedAt = now();
  if (state.sessions[thread.sessionId]) state.sessions[thread.sessionId].updatedAt = thread.updatedAt;
  await writeState(state);
  return { deletedCommentId: commentId };
}
```

- [ ] **Step 4: Replace `updateComment` in `src/shared/store.js`**

Replace the entire `updateComment` function:

```js
async function updateComment(commentId, body) {
  const state = await readState();
  const comment = state.comments[commentId];
  if (!comment) throw new Error('Comment not found');
  const thread = state.threads[comment.threadId];
  if (!thread) throw new Error('Thread not found');
  const accessRole = await requireSessionCommentAccess(state, thread.sessionId);
  if (comment.authorId !== accessRole.actorId) throw new Error('Cannot edit another user\'s comment');
  const updatedAt = now();
  comment.body = body;
  comment.updatedAt = updatedAt;
  comment.editedAt = updatedAt;
  thread.updatedAt = updatedAt;
  if (state.sessions[thread.sessionId]) state.sessions[thread.sessionId].updatedAt = updatedAt;
  await writeState(state);
  return comment;
}
```

- [ ] **Step 5: Run tests to verify GREEN**

```bash
node --test tests/session-access.test.mjs
```

Expected: All tests pass.

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: All 42 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/shared/store.js tests/session-access.test.mjs
git commit -m "feat: restrict delete and edit to comment authors"
```

---

### Task 4: Content Script — `accessRole` State and Conditional Buttons

**Files:**
- Modify: `src/content/content-script.js`
- Modify: `tests/comment-mode-ui.test.mjs`

**Interfaces:**
- Consumes: `store.getSessionPageData` now returns `{ page, pins, threads, comments, accessRole }` (from Task 1)
- Produces: `state.accessRole` in the content script, `isOwnComment(comment)` helper, conditional delete/edit buttons in 3 render locations

- [ ] **Step 1: Write failing source-pattern tests**

Append to `tests/comment-mode-ui.test.mjs`:

```js
test('content script stores accessRole and gates delete and edit on own comments', () => {
  assert.match(content, /accessRole:\s*\{[\s\S]*?role:\s*'none'/);
  assert.match(content, /state\.accessRole\s*=\s*data\.accessRole/);
  assert.match(content, /function isOwnComment\(comment\)/);
  assert.match(content, /comment\.authorId\s*===\s*state\.accessRole\.actorId/);
});

test('delete and edit buttons are gated by isOwnComment in all three render locations', () => {
  const popoverStart = content.indexOf('function buildPopoverComment');
  const controlsStart = content.indexOf('function renderOriginalControls');
  const editableStart = content.indexOf('function renderEditableComment');
  const stylesStart = content.indexOf('function styles');

  const popoverSource = content.slice(popoverStart, controlsStart);
  const controlsSource = content.slice(controlsStart, editableStart);
  const editableSource = content.slice(editableStart, stylesStart);

  // All three locations reference isOwnComment
  assert.match(popoverSource, /isOwnComment\(comment\)/);
  assert.match(controlsSource, /isOwnComment\(item\.original\)/);
  assert.match(editableSource, /isOwnComment\(comment\)/);

  // Resolve button is NOT gated by isOwnComment in renderOriginalControls
  const resolveSection = controlsSource.slice(controlsSource.indexOf('data-action="resolve"'));
  assert.doesNotMatch(resolveSection.slice(0, resolveSection.indexOf('addEventListener')), /isOwnComment/);
});
```

- [ ] **Step 2: Run tests to verify RED**

```bash
node --test tests/comment-mode-ui.test.mjs
```

Expected: The 2 new tests fail — `accessRole` is not in state, `isOwnComment` does not exist.

- [ ] **Step 3: Add `accessRole` to the content script `state` object**

In `src/content/content-script.js`, find the `state` object declaration (around line 10). Add `accessRole` after `sessionData`:

```js
sessionData: { pins: [], threads: [], comments: [] },
accessRole: { role: 'none', actorId: null, canManage: false, canComment: false, canRead: false },
```

- [ ] **Step 4: Update `refreshData` to assign `state.accessRole`**

In `refreshData`, replace:

```js
state.sessionData = await store.getSessionPageData(state.sessionId, state.pageContext, state.includeResolved);
```

with:

```js
const data = await store.getSessionPageData(state.sessionId, state.pageContext, state.includeResolved);
state.sessionData = data;
state.accessRole = data.accessRole || { role: 'none', actorId: null, canManage: false, canComment: false, canRead: false };
```

- [ ] **Step 5: Add `isOwnComment` helper**

Add this function immediately before `buildPopoverComment`:

```js
function isOwnComment(comment) {
  return Boolean(state.accessRole.actorId) && comment.authorId === state.accessRole.actorId;
}
```

- [ ] **Step 6: Update `buildPopoverComment` — Location 1**

`buildPopoverComment` is around line 492. Find the `article.innerHTML` block that contains `data-action="edit"` and `data-action="delete"`. Replace the `article.innerHTML` assignment and the two event bindings below it.

Current `article.innerHTML` (the non-editing branch):

```js
article.innerHTML = `
  <div class="wc-avatar">${escapeHtml(comment.authorInitials || '本')}</div>
  <div class="wc-popover-comment-body">
    <div class="wc-popover-comment-meta">
      <strong>${escapeHtml(comment.authorName || '使用者')}</strong>
      <span>${store.formatRelativeTime(comment.createdAt)}${comment.editedAt ? ' · 已編輯' : ''}</span>
      <div class="wc-popover-comment-actions">
        <button data-action="edit" type="button">編輯</button>
        <button data-action="delete" type="button">刪除</button>
      </div>
    </div>
    <p>${escapeHtml(comment.body)}</p>
  </div>
`;

article.querySelector('[data-action="edit"]').addEventListener('click', () => {
  state.editingCommentId = comment.id;
  renderPinPreview();
});

article.querySelector('[data-action="delete"]').addEventListener('click', async () => {
```

Replace with:

```js
article.innerHTML = `
  <div class="wc-avatar">${escapeHtml(comment.authorInitials || '本')}</div>
  <div class="wc-popover-comment-body">
    <div class="wc-popover-comment-meta">
      <strong>${escapeHtml(comment.authorName || '使用者')}</strong>
      <span>${store.formatRelativeTime(comment.createdAt)}${comment.editedAt ? ' · 已編輯' : ''}</span>
      ${isOwnComment(comment) ? `
        <div class="wc-popover-comment-actions">
          <button data-action="edit" type="button">編輯</button>
          <button data-action="delete" type="button">刪除</button>
        </div>
      ` : ''}
    </div>
    <p>${escapeHtml(comment.body)}</p>
  </div>
`;

const popoverEditBtn = article.querySelector('[data-action="edit"]');
if (popoverEditBtn) {
  popoverEditBtn.addEventListener('click', () => {
    state.editingCommentId = comment.id;
    renderPinPreview();
  });
}

const popoverDeleteBtn = article.querySelector('[data-action="delete"]');
if (popoverDeleteBtn) {
  popoverDeleteBtn.addEventListener('click', async () => {
```

Make sure to also close the `if (popoverDeleteBtn)` block where the original `delete` listener ended. The original listener ends with `});` — keep that unchanged and add one more `}` after it to close the `if`.

- [ ] **Step 7: Update `renderOriginalControls` — Location 2**

`renderOriginalControls` is around line 1019. Replace the `node.innerHTML` assignment and the three event bindings below it.

Current:

```js
node.innerHTML = `
  <div class="wc-thread-actions">
    <button data-action="edit" type="button">編輯</button>
    <button data-action="delete" type="button">刪除</button>
    <button data-action="resolve" type="button" class="${isResolved ? 'is-resolved' : ''}" title="${isResolved ? '標記未解決' : '標記已解決'}">
      ${isResolved ? RETURN_SVG + '標記未解決' : CHECK_SVG + '標記已解決'}
    </button>
  </div>
`;
node.querySelector('[data-action="edit"]').addEventListener('click', () => {
  state.selectedThreadId = item.thread.id;
  state.editingCommentId = item.original.id;
  state.draft = null;
  state.commentMode = false;
  render();
});
node.querySelector('[data-action="delete"]').addEventListener('click', async () => {
  if (!window.confirm('刪除這則標注會一併移除 pin、留言串與所有回覆。確定刪除？')) return;
  await store.deleteComment(item.original.id);
  state.editingCommentId = null;
  state.selectedThreadId = null;
  await refreshData();
  render();
  updateBadge();
});
node.querySelector('[data-action="resolve"]').addEventListener('click', async () => {
```

Replace with:

```js
node.innerHTML = `
  <div class="wc-thread-actions">
    ${isOwnComment(item.original) ? '<button data-action="edit" type="button">編輯</button>' : ''}
    ${isOwnComment(item.original) ? '<button data-action="delete" type="button">刪除</button>' : ''}
    <button data-action="resolve" type="button" class="${isResolved ? 'is-resolved' : ''}" title="${isResolved ? '標記未解決' : '標記已解決'}">
      ${isResolved ? RETURN_SVG + '標記未解決' : CHECK_SVG + '標記已解決'}
    </button>
  </div>
`;
const controlsEditBtn = node.querySelector('[data-action="edit"]');
if (controlsEditBtn) {
  controlsEditBtn.addEventListener('click', () => {
    state.selectedThreadId = item.thread.id;
    state.editingCommentId = item.original.id;
    state.draft = null;
    state.commentMode = false;
    render();
  });
}
const controlsDeleteBtn = node.querySelector('[data-action="delete"]');
if (controlsDeleteBtn) {
  controlsDeleteBtn.addEventListener('click', async () => {
    if (!window.confirm('刪除這則標注會一併移除 pin、留言串與所有回覆。確定刪除？')) return;
    await store.deleteComment(item.original.id);
    state.editingCommentId = null;
    state.selectedThreadId = null;
    await refreshData();
    render();
    updateBadge();
  });
}
node.querySelector('[data-action="resolve"]').addEventListener('click', async () => {
```

- [ ] **Step 8: Update `renderEditableComment` — Location 3**

`renderEditableComment` is around line 1063. Find the `node.innerHTML` in the non-editing branch (the branch without `isEditing`). It contains a `wc-comment-actions` div with edit and delete buttons.

Current `node.innerHTML` (non-editing branch):

```js
node.innerHTML = `
  <div class="wc-avatar">${escapeHtml(comment.authorInitials || '本')}</div>
  <div>
    <div class="wc-comment-meta">
      <strong>${escapeHtml(comment.authorName || '使用者')}</strong>
      <span>${store.formatRelativeTime(comment.createdAt)}${comment.editedAt ? ' · 已編輯' : ''}</span>
    </div>
    <p>${escapeHtml(comment.body)}</p>
    <div class="wc-comment-actions">
      <button data-action="edit" type="button">編輯</button>
      <button data-action="delete" type="button">${isOriginal ? '刪除標注' : '刪除'}</button>
    </div>
  </div>
`;

node.querySelector('[data-action="edit"]').addEventListener('click', () => {
  state.editingCommentId = comment.id;
  render();
});

node.querySelector('[data-action="delete"]').addEventListener('click', async () => {
```

Replace with:

```js
node.innerHTML = `
  <div class="wc-avatar">${escapeHtml(comment.authorInitials || '本')}</div>
  <div>
    <div class="wc-comment-meta">
      <strong>${escapeHtml(comment.authorName || '使用者')}</strong>
      <span>${store.formatRelativeTime(comment.createdAt)}${comment.editedAt ? ' · 已編輯' : ''}</span>
    </div>
    <p>${escapeHtml(comment.body)}</p>
    ${isOwnComment(comment) ? `
      <div class="wc-comment-actions">
        <button data-action="edit" type="button">編輯</button>
        <button data-action="delete" type="button">${isOriginal ? '刪除標注' : '刪除'}</button>
      </div>
    ` : ''}
  </div>
`;

const editableEditBtn = node.querySelector('[data-action="edit"]');
if (editableEditBtn) {
  editableEditBtn.addEventListener('click', () => {
    state.editingCommentId = comment.id;
    render();
  });
}

const editableDeleteBtn = node.querySelector('[data-action="delete"]');
if (editableDeleteBtn) {
  editableDeleteBtn.addEventListener('click', async () => {
```

Again keep the existing body of the delete listener unchanged and close the `if` block after the final `});`.

- [ ] **Step 9: Run all tests to verify GREEN**

```bash
npm test
```

Expected: All 42 tests pass including the 4 new comment-mode-ui tests.

- [ ] **Step 10: Commit**

```bash
git add src/content/content-script.js tests/comment-mode-ui.test.mjs
git commit -m "feat: gate delete and edit buttons on comment authorship"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| Owner gets `ownerId` in `state.access` | Task 1 Step 3 |
| `getCurrentAuthor` uses `ownerId` for private-session owners | Task 1 Step 5 |
| `getStoredAccessRole` returns `actorId` | Task 1 Step 4 |
| `getSessionPageData` returns `accessRole` | Task 1 Step 6 |
| Guests can resolve threads | Task 2 Steps 3 |
| Guests can move pins | Task 2 Step 4 |
| Delete restricted to comment author | Task 3 Step 3 |
| Edit restricted to comment author | Task 3 Step 4 |
| `local_legacy` unchanged | Task 1 Step 4 (branch preserved) |
| Content script `state.accessRole` | Task 4 Step 3 |
| `refreshData` sets `state.accessRole` | Task 4 Step 4 |
| `isOwnComment` helper | Task 4 Step 5 |
| Popover delete/edit gated | Task 4 Step 6 |
| Sidebar controls delete/edit gated | Task 4 Step 7 |
| Sidebar editable comment delete/edit gated | Task 4 Step 8 |
| Resolve button NOT gated | Task 4 Step 7 (always rendered) |

**Placeholder scan:** No TBD, no TODO, no vague "handle edge cases" steps. All code blocks are complete.

**Type consistency:**
- `actorId` is introduced in Task 1 and consumed in Tasks 3 and 4.
- `isOwnComment(comment)` is defined in Task 4 Step 5 and used in Steps 6, 7, 8.
- `data.accessRole` field is produced in Task 1 Step 6 and consumed in Task 4 Step 4.
- `requireSessionCommentAccess` is an existing function; its return type now includes `actorId` after Task 1 Step 4.
