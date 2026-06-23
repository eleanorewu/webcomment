# Guest Review Session Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add account-free, password-protected private Review Sessions where comments are visible only to guests or owners with valid session-scoped access.

**Architecture:** Implement the access model first in the current local MVP store so the extension can exercise the full product flow before the backend exists. Keep all comment reads and writes behind a session access check, store owner and guest capabilities locally, and update docs so the future Supabase/API version preserves the same visibility and privacy rules.

**Tech Stack:** Chrome Extension Manifest V3, plain JavaScript, Chrome local storage, Web Crypto API, Node.js built-in test runner

---

## Scope Guard

This plan implements the account-free Review Session MVP in the existing local prototype. It does not add Supabase, realtime WebSocket infrastructure, formal accounts, email, OAuth, billing, or recovery for a lost owner token.

The local prototype can prove the access model, UI flow, and privacy boundaries. Production deployment still needs server-side token hashing, HTTPS APIs, database row-level access checks, and realtime authorization before real collaborator data is stored remotely.

## File Structure

- Create `src/shared/session-access.js`: Pure helper module for capability token generation, password hashing, invite secret hashing, guest display-name validation, and access checks.
- Modify `src/shared/store.js`: Extend local state with `access`, `sessionGuests`, and session invite metadata; add create/join/manage functions; enforce access before comment reads and writes.
- Modify `src/popup/popup.html`: Add password and display-name fields for creating and joining guest sessions, plus owner management buttons.
- Modify `src/popup/popup.js`: Wire create session with password, invite-link copy, guest join, owner controls, and access-aware activation.
- Modify `src/popup/popup.css`: Style the new access form and management controls without adding a heavy admin console.
- Modify `src/background/service-worker.js`: Store pending review/admin links from extension messages and return them to the popup.
- Create `tests/session-access.test.mjs`: Unit coverage for hashing, token checks, guest creation, invite reset, password rotation, closure, and guest removal rules.
- Modify `tests/popup-ui.test.mjs`: Source-level coverage for account-free guest copy and required popup controls.
- Modify `tests/service-worker.test.mjs`: Coverage for pending review/admin link messages.
- Modify `docs/07_API_SPEC.md`: Align future API endpoints with invite link, password, display name, owner token, and guest token semantics.
- Modify `docs/06_DATABASE_ERD.md`: Add guest-session tables/columns from the accepted spec.
- Modify `docs/08_TECH_SPEC.md`: Document explicit activation and minimum metadata behavior for guest Review Sessions.

### Task 1: Add Pure Session Access Helpers

**Files:**
- Create: `src/shared/session-access.js`
- Create: `tests/session-access.test.mjs`

- [ ] **Step 1: Write the failing helper tests**

Create `tests/session-access.test.mjs`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

function loadAccess() {
  const window = { crypto: webcrypto };
  vm.runInNewContext(
    fs.readFileSync('src/shared/session-access.js', 'utf8'),
    {
      window,
      crypto: webcrypto,
      TextEncoder,
      Uint8Array,
      btoa(value) {
        return Buffer.from(value, 'binary').toString('base64');
      },
    },
  );
  return window.WebCommentSessionAccess;
}

test('hashSecret returns stable hashes without exposing the raw secret', async () => {
  const access = loadAccess();

  const first = await access.hashSecret('review-password');
  const second = await access.hashSecret('review-password');

  assert.equal(first, second);
  assert.notEqual(first, 'review-password');
  assert.match(first, /^[a-f0-9]{64}$/);
});

test('createCapability creates opaque tokens and matching hashes', async () => {
  const access = loadAccess();

  const capability = await access.createCapability('owner');

  assert.match(capability.token, /^owner_/);
  assert.equal(await access.verifySecret(capability.token, capability.hash), true);
  assert.equal(await access.verifySecret(`${capability.token}_wrong`, capability.hash), false);
});

test('validateDisplayName trims names and rejects empty names', () => {
  const access = loadAccess();

  assert.equal(access.validateDisplayName('  Ada Lovelace  '), 'Ada Lovelace');
  assert.throws(() => access.validateDisplayName('   '), /Display name is required/);
});

test('getAccessRole resolves owner, active guest, removed guest, and missing access', async () => {
  const access = loadAccess();
  const owner = await access.createCapability('owner');
  const guest = await access.createCapability('guest');

  const session = {
    id: 'session_1',
    status: 'active',
    ownerTokenHash: owner.hash,
  };
  const guests = {
    guest_1: {
      id: 'guest_1',
      sessionId: 'session_1',
      tokenHash: guest.hash,
      status: 'active',
    },
    guest_2: {
      id: 'guest_2',
      sessionId: 'session_1',
      tokenHash: guest.hash,
      status: 'removed',
    },
  };

  assert.deepEqual(await access.getAccessRole(session, guests, owner.token), {
    role: 'owner',
    guestId: null,
    canManage: true,
    canComment: true,
    canRead: true,
  });
  assert.deepEqual(await access.getAccessRole(session, guests, guest.token), {
    role: 'guest',
    guestId: 'guest_1',
    canManage: false,
    canComment: true,
    canRead: true,
  });
  assert.deepEqual(await access.getAccessRole(session, guests, 'guest_missing'), {
    role: 'none',
    guestId: null,
    canManage: false,
    canComment: false,
    canRead: false,
  });
});
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
node --test tests/session-access.test.mjs
```

Expected: FAIL with an error that `src/shared/session-access.js` does not exist.

- [ ] **Step 3: Implement the helper module**

Create `src/shared/session-access.js`:

```js
(function attachWebCommentSessionAccess(global) {
  function bytesToBase64Url(bytes) {
    const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
    return global.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function getCrypto() {
    const cryptoApi = global.crypto;
    if (!cryptoApi?.subtle || !cryptoApi.getRandomValues) {
      throw new Error('Secure crypto is required for Review Session access');
    }
    return cryptoApi;
  }

  async function hashSecret(secret) {
    const value = String(secret || '');
    const encoded = new TextEncoder().encode(value);
    const digest = await getCrypto().subtle.digest('SHA-256', encoded);
    return bytesToHex(new Uint8Array(digest));
  }

  async function verifySecret(secret, expectedHash) {
    if (!secret || !expectedHash) return false;
    return (await hashSecret(secret)) === expectedHash;
  }

  async function createCapability(prefix) {
    const bytes = new Uint8Array(32);
    getCrypto().getRandomValues(bytes);
    const token = `${prefix}_${bytesToBase64Url(bytes)}`;
    return {
      token,
      hash: await hashSecret(token),
    };
  }

  function validateDisplayName(displayName) {
    const value = String(displayName || '').trim().replace(/\s+/g, ' ');
    if (!value) throw new Error('Display name is required');
    return value.slice(0, 80);
  }

  async function getAccessRole(session, guests, token) {
    if (!session || !token) {
      return { role: 'none', guestId: null, canManage: false, canComment: false, canRead: false };
    }

    if (await verifySecret(token, session.ownerTokenHash)) {
      return {
        role: 'owner',
        guestId: null,
        canManage: true,
        canComment: session.status === 'active',
        canRead: true,
      };
    }

    const guest = Object.values(guests || {}).find((candidate) => (
      candidate.sessionId === session.id
      && candidate.status === 'active'
      && candidate.tokenHash
    ));
    if (guest && await verifySecret(token, guest.tokenHash)) {
      return {
        role: 'guest',
        guestId: guest.id,
        canManage: false,
        canComment: session.status === 'active',
        canRead: true,
      };
    }

    return { role: 'none', guestId: null, canManage: false, canComment: false, canRead: false };
  }

  global.WebCommentSessionAccess = {
    hashSecret,
    verifySecret,
    createCapability,
    validateDisplayName,
    getAccessRole,
  };
})(window);
```

- [ ] **Step 4: Run the focused test to verify GREEN**

Run:

```bash
node --test tests/session-access.test.mjs
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit the helper module**

```bash
git add src/shared/session-access.js tests/session-access.test.mjs
git commit -m "feat: add guest session access helpers"
```

### Task 2: Enforce Session Access in the Local Store

**Files:**
- Modify: `src/shared/store.js`
- Modify: `tests/session-access.test.mjs`

- [ ] **Step 1: Add failing store-level access tests**

Append to `tests/session-access.test.mjs`:

```js
function createChromeStorage() {
  const values = {};
  return {
    runtime: { lastError: null },
    storage: {
      local: {
        get(keys, callback) {
          const result = {};
          keys.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(values, key)) result[key] = values[key];
          });
          callback(result);
        },
        set(payload, callback) {
          Object.assign(values, structuredClone(payload));
          callback();
        },
      },
    },
    __values: values,
  };
}

function loadStoreWithAccess(chrome) {
  const window = {
    chrome,
    crypto: webcrypto,
    scrollX: 0,
    scrollY: 0,
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 1,
  };
  vm.runInNewContext(
    fs.readFileSync('src/shared/session-access.js', 'utf8'),
    {
      window,
      crypto: webcrypto,
      TextEncoder,
      Uint8Array,
      btoa(value) {
        return Buffer.from(value, 'binary').toString('base64');
      },
    },
  );
  vm.runInNewContext(
    fs.readFileSync('src/shared/store.js', 'utf8'),
    {
      window,
      chrome,
      URL,
      Date,
      Math,
      Element: class Element {},
      Node: { ELEMENT_NODE: 1 },
      CSS: { escape: (value) => String(value) },
    },
  );
  return window.WebCommentStore;
}

test('created sessions store owner access locally and do not keep plaintext passwords', async () => {
  const chrome = createChromeStorage();
  const store = loadStoreWithAccess(chrome);
  const pageContext = store.getPageContext('https://example.com/pricing', 'Pricing');

  const created = await store.createPrivateSession({
    name: 'Pricing review',
    password: 'secret-pass',
    pageContext,
  });
  const state = await store.readState();

  assert.equal(state.sessions[created.session.id].name, 'Pricing review');
  assert.equal(state.sessions[created.session.id].password, undefined);
  assert.equal(state.sessions[created.session.id].passwordHash.length, 64);
  assert.equal(state.access[created.session.id].role, 'owner');
  assert.equal(state.access[created.session.id].token, created.ownerToken);
  assert.match(created.inviteLink, /^https:\/\/webcomment\.local\/review\//);
  assert.match(created.adminLink, /^https:\/\/webcomment\.local\/admin\//);
});

test('guests join with invite secret, password, and display name', async () => {
  const chrome = createChromeStorage();
  const store = loadStoreWithAccess(chrome);
  const pageContext = store.getPageContext('https://example.com/pricing', 'Pricing');
  const created = await store.createPrivateSession({
    name: 'Pricing review',
    password: 'secret-pass',
    pageContext,
  });

  await assert.rejects(
    store.joinPrivateSession({
      sessionId: created.session.id,
      inviteSecret: created.inviteSecret,
      password: 'wrong-pass',
      displayName: 'Grace',
    }),
    /Wrong password/,
  );

  const joined = await store.joinPrivateSession({
    sessionId: created.session.id,
    inviteSecret: created.inviteSecret,
    password: 'secret-pass',
    displayName: ' Grace Hopper ',
  });
  const state = await store.readState();

  assert.equal(joined.guest.displayName, 'Grace Hopper');
  assert.equal(state.access[created.session.id].role, 'guest');
  assert.equal(state.access[created.session.id].token, joined.guestToken);
});

test('comment data is not returned without valid session access', async () => {
  const chrome = createChromeStorage();
  const store = loadStoreWithAccess(chrome);
  const pageContext = store.getPageContext('https://example.com/pricing', 'Pricing');
  const created = await store.createPrivateSession({
    name: 'Pricing review',
    password: 'secret-pass',
    pageContext,
  });

  await store.createThread(
    created.session.id,
    pageContext,
    {
      mode: 'page',
      pageKey: pageContext.pageKey,
      documentPosition: { x: 10, y: 20 },
      viewportPosition: { x: 10, y: 20 },
    },
    'Private comment',
  );

  const state = await store.readState();
  delete state.access[created.session.id];
  await store.writeState(state);

  await assert.rejects(
    store.getSessionPageData(created.session.id, pageContext, false),
    /Session access required/,
  );
});

test('owner can rotate password, reset invite, remove guests, and close sessions', async () => {
  const chrome = createChromeStorage();
  const store = loadStoreWithAccess(chrome);
  const pageContext = store.getPageContext('https://example.com/pricing', 'Pricing');
  const created = await store.createPrivateSession({
    name: 'Pricing review',
    password: 'secret-pass',
    pageContext,
  });
  const joined = await store.joinPrivateSession({
    sessionId: created.session.id,
    inviteSecret: created.inviteSecret,
    password: 'secret-pass',
    displayName: 'Grace',
  });

  await store.changeSessionPassword(created.session.id, 'new-secret');
  await assert.rejects(
    store.joinPrivateSession({
      sessionId: created.session.id,
      inviteSecret: created.inviteSecret,
      password: 'secret-pass',
      displayName: 'Katherine',
    }),
    /Wrong password/,
  );

  const rotated = await store.resetInviteLink(created.session.id);
  await assert.rejects(
    store.joinPrivateSession({
      sessionId: created.session.id,
      inviteSecret: created.inviteSecret,
      password: 'new-secret',
      displayName: 'Katherine',
    }),
    /Invite link is no longer valid/,
  );
  assert.match(rotated.inviteLink, /^https:\/\/webcomment\.local\/review\//);

  await store.removeGuest(created.session.id, joined.guest.id);
  await store.closeSession(created.session.id);
  const state = await store.readState();

  assert.equal(state.sessionGuests[joined.guest.id].status, 'removed');
  assert.equal(state.sessions[created.session.id].status, 'closed');
});
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
node --test tests/session-access.test.mjs
```

Expected: The helper tests pass and the new store tests fail because `createPrivateSession`, `joinPrivateSession`, and owner management functions are not exported yet.

- [ ] **Step 3: Load the helper from `store.js`**

At the top of `attachWebCommentStore`, add:

```js
  const access = global.WebCommentSessionAccess;
```

Then add this guard near the storage helpers:

```js
  function requireAccessHelpers() {
    if (!access) throw new Error('Review Session access helpers are unavailable');
    return access;
  }
```

- [ ] **Step 4: Extend the initial state**

Inside `createInitialState()`, add the new collections to the returned object:

```js
      sessionGuests: {},
      access: {},
```

Add these fields to the seeded default session:

```js
          accessMode: 'local_legacy',
          passwordHash: '',
          inviteSecretHash: '',
          ownerTokenHash: '',
          closedAt: null,
```

- [ ] **Step 5: Add link and access utilities**

Add these functions after `setActiveSessionId`:

```js
  function buildInviteLink(sessionId, inviteSecret, pageContext) {
    const target = pageContext?.url || '';
    const pageKey = pageContext?.pageKey || '';
    return `https://webcomment.local/review/${encodeURIComponent(sessionId)}?invite=${encodeURIComponent(inviteSecret)}&pageKey=${encodeURIComponent(pageKey)}&target=${encodeURIComponent(target)}`;
  }

  function buildAdminLink(sessionId, ownerToken, pageContext) {
    const target = pageContext?.url || '';
    return `https://webcomment.local/admin/${encodeURIComponent(sessionId)}?owner=${encodeURIComponent(ownerToken)}&target=${encodeURIComponent(target)}`;
  }

  async function getStoredAccessRole(state, sessionId) {
    const session = state.sessions[sessionId];
    const localAccess = state.access?.[sessionId];
    if (!session || session.accessMode === 'local_legacy') {
      return {
        role: 'owner',
        guestId: null,
        canManage: true,
        canComment: session?.status !== 'closed',
        canRead: true,
      };
    }
    return requireAccessHelpers().getAccessRole(session, state.sessionGuests, localAccess?.token);
  }

  async function requireSessionReadAccess(state, sessionId) {
    const role = await getStoredAccessRole(state, sessionId);
    if (!role.canRead) throw new Error('Session access required');
    return role;
  }

  async function requireSessionCommentAccess(state, sessionId) {
    const role = await requireSessionReadAccess(state, sessionId);
    if (!role.canComment) throw new Error('Session is closed');
    return role;
  }

  async function requireSessionOwnerAccess(state, sessionId) {
    const role = await requireSessionReadAccess(state, sessionId);
    if (!role.canManage) throw new Error('Owner access required');
    return role;
  }
```

- [ ] **Step 6: Add private session creation and join functions**

Add these functions after the existing `createSession` function:

```js
  async function createPrivateSession({ name, password, pageContext }) {
    const helpers = requireAccessHelpers();
    const state = await readState();
    const projectId = Object.keys(state.projects)[0];
    const sessionId = id('session');
    const createdAt = now();
    const ownerCapability = await helpers.createCapability('owner');
    const inviteCapability = await helpers.createCapability('invite');

    state.sessions[sessionId] = {
      id: sessionId,
      projectId,
      name: name || `私人 Review ${new Date().toLocaleDateString()}`,
      status: 'active',
      accessMode: 'guest_password',
      passwordHash: await helpers.hashSecret(password),
      inviteSecretHash: inviteCapability.hash,
      ownerTokenHash: ownerCapability.hash,
      createdBy: 'owner',
      createdAt,
      updatedAt: createdAt,
      closedAt: null,
    };
    state.access[sessionId] = {
      role: 'owner',
      token: ownerCapability.token,
      storedAt: createdAt,
    };
    if (pageContext) ensurePage(state, sessionId, pageContext);

    await writeState(state);
    await setActiveSessionId(sessionId);
    return {
      session: state.sessions[sessionId],
      ownerToken: ownerCapability.token,
      inviteSecret: inviteCapability.token,
      inviteLink: buildInviteLink(sessionId, inviteCapability.token, pageContext),
      adminLink: buildAdminLink(sessionId, ownerCapability.token, pageContext),
    };
  }

  async function joinPrivateSession({ sessionId, inviteSecret, password, displayName }) {
    const helpers = requireAccessHelpers();
    const state = await readState();
    const session = state.sessions[sessionId];
    if (!session || session.accessMode !== 'guest_password') throw new Error('Review Session not found');
    if (session.status === 'closed') throw new Error('Review Session is closed');
    if (!await helpers.verifySecret(inviteSecret, session.inviteSecretHash)) {
      throw new Error('Invite link is no longer valid');
    }
    if (!await helpers.verifySecret(password, session.passwordHash)) {
      throw new Error('Wrong password');
    }

    const capability = await helpers.createCapability('guest');
    const guestId = id('guest');
    const createdAt = now();
    const guest = {
      id: guestId,
      sessionId,
      displayName: helpers.validateDisplayName(displayName),
      tokenHash: capability.hash,
      status: 'active',
      createdAt,
      lastSeenAt: createdAt,
    };
    state.sessionGuests[guestId] = guest;
    state.access[sessionId] = {
      role: 'guest',
      guestId,
      token: capability.token,
      storedAt: createdAt,
    };
    session.updatedAt = createdAt;

    await writeState(state);
    await setActiveSessionId(sessionId);
    return {
      session,
      guest,
      guestToken: capability.token,
    };
  }
```

- [ ] **Step 7: Add owner management functions**

Add these functions after `joinPrivateSession`:

```js
  async function changeSessionPassword(sessionId, password) {
    const helpers = requireAccessHelpers();
    const state = await readState();
    await requireSessionOwnerAccess(state, sessionId);
    const updatedAt = now();
    state.sessions[sessionId].passwordHash = await helpers.hashSecret(password);
    state.sessions[sessionId].updatedAt = updatedAt;
    await writeState(state);
    return state.sessions[sessionId];
  }

  async function resetInviteLink(sessionId, pageContext) {
    const helpers = requireAccessHelpers();
    const state = await readState();
    await requireSessionOwnerAccess(state, sessionId);
    const capability = await helpers.createCapability('invite');
    const updatedAt = now();
    state.sessions[sessionId].inviteSecretHash = capability.hash;
    state.sessions[sessionId].updatedAt = updatedAt;
    await writeState(state);
    return {
      inviteSecret: capability.token,
      inviteLink: buildInviteLink(sessionId, capability.token, pageContext),
    };
  }

  async function closeSession(sessionId) {
    const state = await readState();
    await requireSessionOwnerAccess(state, sessionId);
    const updatedAt = now();
    state.sessions[sessionId].status = 'closed';
    state.sessions[sessionId].closedAt = updatedAt;
    state.sessions[sessionId].updatedAt = updatedAt;
    await writeState(state);
    return state.sessions[sessionId];
  }

  async function removeGuest(sessionId, guestId) {
    const state = await readState();
    await requireSessionOwnerAccess(state, sessionId);
    const guest = state.sessionGuests[guestId];
    if (!guest || guest.sessionId !== sessionId) throw new Error('Guest not found');
    guest.status = 'removed';
    guest.removedAt = now();
    state.sessions[sessionId].updatedAt = guest.removedAt;
    await writeState(state);
    return guest;
  }
```

- [ ] **Step 8: Enforce access on reads and writes**

At the start of `createThread`, `updatePinAnchor`, `addReply`, `updateComment`, `deleteComment`, and `setThreadResolved`, after `const state = await readState();`, add the matching check:

```js
    await requireSessionCommentAccess(state, sessionId);
```

For functions that receive `threadId`, `commentId`, or `pinId` instead of `sessionId`, resolve the session first and then check it:

```js
    const thread = state.threads[threadId];
    if (!thread) throw new Error('Thread not found');
    await requireSessionCommentAccess(state, thread.sessionId);
```

For `updatePinAnchor`, use:

```js
    const pin = state.pins[pinId];
    if (!pin) throw new Error('Pin not found');
    await requireSessionCommentAccess(state, pin.sessionId);
```

At the start of `getSessionPageData`, add:

```js
    await requireSessionReadAccess(state, sessionId);
```

- [ ] **Step 9: Use the active guest or owner as comment author**

Add this function before `createThread`:

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
    return state.currentUser;
  }
```

In `createThread`, store the result of `requireSessionCommentAccess`:

```js
    const accessRole = await requireSessionCommentAccess(state, sessionId);
    const author = getCurrentAuthor(state, sessionId, accessRole);
```

Then replace `state.currentUser.id`, `state.currentUser.displayName`, and `state.currentUser.initials` in created pin/comment data with `author.id`, `author.displayName`, and `author.initials`.

Apply the same author replacement inside `addReply`.

- [ ] **Step 10: Export the new store functions**

Add these properties to `global.WebCommentStore`:

```js
    createPrivateSession,
    joinPrivateSession,
    changeSessionPassword,
    resetInviteLink,
    closeSession,
    removeGuest,
    buildInviteLink,
    buildAdminLink,
```

- [ ] **Step 11: Run the focused test to verify GREEN**

Run:

```bash
node --test tests/session-access.test.mjs
```

Expected: 8 tests pass.

- [ ] **Step 12: Commit the local access enforcement**

```bash
git add src/shared/store.js tests/session-access.test.mjs
git commit -m "feat: enforce guest review session access"
```

### Task 3: Add Popup Create, Join, and Owner Controls

**Files:**
- Modify: `src/popup/popup.html`
- Modify: `src/popup/popup.js`
- Modify: `src/popup/popup.css`
- Modify: `tests/popup-ui.test.mjs`

- [ ] **Step 1: Add failing popup source tests**

Append to `tests/popup-ui.test.mjs`:

```js
test('popup exposes account-free guest review session controls', () => {
  assert.match(popupHtml, /id="sessionPasswordInput"/);
  assert.match(popupHtml, /type="password"/);
  assert.match(popupHtml, /id="guestDisplayNameInput"/);
  assert.match(popupHtml, /id="joinSessionButton"/);
  assert.match(popupHtml, /邀請連結/);
  assert.match(popupHtml, /顯示名稱/);
  assert.match(popupJs, /createPrivateSession/);
  assert.match(popupJs, /joinPrivateSession/);
});

test('popup exposes owner management without formal account copy', () => {
  assert.match(popupHtml, /id="resetInviteButton"/);
  assert.match(popupHtml, /id="changePasswordButton"/);
  assert.match(popupHtml, /id="closeSessionButton"/);
  assert.match(popupJs, /resetInviteLink/);
  assert.match(popupJs, /changeSessionPassword/);
  assert.match(popupJs, /closeSession/);
  assert.doesNotMatch(popupHtml, /註冊/);
  assert.doesNotMatch(popupHtml, /Email/);
});
```

- [ ] **Step 2: Run the popup test to verify RED**

Run:

```bash
node --test tests/popup-ui.test.mjs
```

Expected: Existing popup tests pass and the two new tests fail because the account-free controls are not present.

- [ ] **Step 3: Load the access helper in popup HTML**

Add the helper script before `store.js`:

```html
<script src="../shared/session-access.js"></script>
<script src="../shared/store.js"></script>
<script src="./popup.js"></script>
```

- [ ] **Step 4: Add create and join controls**

Replace the existing create row:

```html
<div class="create-row">
  <input id="sessionNameInput" type="text" placeholder="新的工作階段名稱" />
  <button id="createSessionButton" type="button">建立</button>
</div>
```

with:

```html
<section class="access-panel" aria-label="私人 Review Session">
  <label class="field">
    <span>Session 名稱</span>
    <input id="sessionNameInput" type="text" placeholder="例如：首頁 QA Review" />
  </label>
  <label class="field">
    <span>Session 密碼</span>
    <input id="sessionPasswordInput" type="password" placeholder="協作者加入時需要輸入" />
  </label>
  <button id="createSessionButton" class="secondary-button" type="button">建立私人 Session</button>
</section>

<section class="access-panel" aria-label="加入 Review Session">
  <p class="access-help">收到邀請連結的人，可輸入密碼與顯示名稱加入，不需要註冊帳戶。</p>
  <label class="field">
    <span>邀請連結</span>
    <input id="inviteLinkInput" type="text" placeholder="貼上邀請連結" />
  </label>
  <label class="field">
    <span>顯示名稱</span>
    <input id="guestDisplayNameInput" type="text" placeholder="例如：Ada" />
  </label>
  <label class="field">
    <span>Session 密碼</span>
    <input id="joinPasswordInput" type="password" placeholder="輸入建立者提供的密碼" />
  </label>
  <button id="joinSessionButton" class="secondary-button" type="button">加入 Session</button>
</section>
```

- [ ] **Step 5: Add owner controls**

Add this block before `<p id="message"...>`:

```html
<section id="ownerPanel" class="owner-panel" hidden>
  <p class="access-help">建立者管理鑰匙保存在此瀏覽器。請妥善保存一次性管理連結。</p>
  <div class="action-row">
    <button id="changePasswordButton" type="button">更新密碼</button>
    <button id="resetInviteButton" type="button">重產邀請連結</button>
  </div>
  <button id="closeSessionButton" class="danger-button" type="button">關閉 Session</button>
</section>
```

- [ ] **Step 6: Bind new popup elements**

Add these entries to `els` in `src/popup/popup.js`:

```js
    sessionPasswordInput: document.getElementById('sessionPasswordInput'),
    inviteLinkInput: document.getElementById('inviteLinkInput'),
    guestDisplayNameInput: document.getElementById('guestDisplayNameInput'),
    joinPasswordInput: document.getElementById('joinPasswordInput'),
    joinSessionButton: document.getElementById('joinSessionButton'),
    ownerPanel: document.getElementById('ownerPanel'),
    changePasswordButton: document.getElementById('changePasswordButton'),
    resetInviteButton: document.getElementById('resetInviteButton'),
    closeSessionButton: document.getElementById('closeSessionButton'),
```

- [ ] **Step 7: Create private sessions from the popup**

Replace the existing `createSession()` function with:

```js
  async function createSession() {
    const name = els.sessionNameInput.value.trim();
    const password = els.sessionPasswordInput.value.trim();
    if (!password) {
      setMessage('請先設定 Session 密碼。');
      return;
    }

    const created = await store.createPrivateSession({ name, password, pageContext });
    els.sessionNameInput.value = '';
    els.sessionPasswordInput.value = '';
    await renderSessions(created.session.id);
    await renderOwnerPanel();
    await ensureContentScript();
    await sendToTab({ type: 'WEB_COMMENT_SESSION_CHANGED', sessionId: created.session.id });
    setMessage('已建立私人 Session。請複製分享連結給協作者，並另外提供密碼。');
  }
```

- [ ] **Step 8: Parse invite links and join as guest**

Add these functions after `copyReviewLink()`:

```js
  function parseInviteLink(value) {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    const sessionId = parts.at(-1);
    return {
      sessionId,
      inviteSecret: url.searchParams.get('invite') || '',
      target: url.searchParams.get('target') || '',
    };
  }

  async function joinSession() {
    try {
      const invite = parseInviteLink(els.inviteLinkInput.value.trim());
      const joined = await store.joinPrivateSession({
        sessionId: invite.sessionId,
        inviteSecret: invite.inviteSecret,
        password: els.joinPasswordInput.value.trim(),
        displayName: els.guestDisplayNameInput.value,
      });
      els.joinPasswordInput.value = '';
      await renderSessions(joined.session.id);
      await renderOwnerPanel();
      await ensureContentScript();
      await sendToTab({ type: 'WEB_COMMENT_SESSION_CHANGED', sessionId: joined.session.id });
      setMessage('已加入 Session。');
    } catch (error) {
      setMessage(error.message || '無法加入 Session。');
    }
  }
```

Add this event binding in `bindEvents()`:

```js
    els.joinSessionButton.addEventListener('click', joinSession);
```

- [ ] **Step 9: Copy the current session invite link**

Replace `copyReviewLink()` with:

```js
  async function copyReviewLink() {
    const state = await store.readState();
    const sessionId = els.sessionSelect.value || (await store.getActiveSessionId());
    const session = state.sessions[sessionId];
    let link = `https://webcomment.local/review/${encodeURIComponent(sessionId)}?pageKey=${encodeURIComponent(pageContext.pageKey)}&target=${encodeURIComponent(pageContext.url)}`;
    const localAccess = state.access?.[sessionId];

    if (session?.accessMode === 'guest_password' && localAccess?.role === 'owner') {
      const rotated = await store.resetInviteLink(sessionId, pageContext);
      link = rotated.inviteLink;
    }

    try {
      await navigator.clipboard.writeText(link);
      setMessage('已複製邀請連結。請另外提供 Session 密碼。');
    } catch (error) {
      setMessage(link);
    }
  }
```

- [ ] **Step 10: Render owner controls and wire actions**

Add this function after `renderStats()`:

```js
  async function renderOwnerPanel() {
    const state = await store.readState();
    const sessionId = els.sessionSelect.value || (await store.getActiveSessionId());
    const localAccess = state.access?.[sessionId];
    els.ownerPanel.hidden = localAccess?.role !== 'owner';
  }
```

Call `await renderOwnerPanel();` after `renderSessions()` in `boot()`, after session selection changes, after creating a session, and after joining a session.

Add these bindings in `bindEvents()`:

```js
    els.changePasswordButton.addEventListener('click', async () => {
      const password = els.sessionPasswordInput.value.trim();
      if (!password) {
        setMessage('請在 Session 密碼欄位輸入新密碼。');
        return;
      }
      await store.changeSessionPassword(els.sessionSelect.value, password);
      els.sessionPasswordInput.value = '';
      setMessage('已更新密碼。新加入者需要使用新密碼。');
    });

    els.resetInviteButton.addEventListener('click', async () => {
      const rotated = await store.resetInviteLink(els.sessionSelect.value, pageContext);
      try {
        await navigator.clipboard.writeText(rotated.inviteLink);
        setMessage('已重產並複製新的邀請連結。舊邀請連結無法再用於加入。');
      } catch (error) {
        setMessage(rotated.inviteLink);
      }
    });

    els.closeSessionButton.addEventListener('click', async () => {
      await store.closeSession(els.sessionSelect.value);
      await renderSessions(els.sessionSelect.value);
      await renderStats();
      setMessage('已關閉 Session。現有成員可讀取，不能再新增留言。');
    });
```

- [ ] **Step 11: Add compact access styles**

Append to `src/popup/popup.css`:

```css
.access-panel,
.owner-panel {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
}

.access-help {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 18px;
}

.secondary-button,
.danger-button {
  width: 100%;
  min-height: 34px;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  background: rgba(255, 255, 255, 0.08);
}

.danger-button {
  color: #ffd6d6;
  border-color: rgba(255, 112, 112, 0.42);
}
```

- [ ] **Step 12: Run focused popup tests**

Run:

```bash
node --test tests/popup-ui.test.mjs
```

Expected: All popup UI tests pass.

- [ ] **Step 13: Commit popup access UI**

```bash
git add src/popup/popup.html src/popup/popup.js src/popup/popup.css tests/popup-ui.test.mjs
git commit -m "feat: add guest review session popup flow"
```

### Task 4: Handle Pending Review Links in the Service Worker

**Files:**
- Modify: `src/background/service-worker.js`
- Modify: `tests/service-worker.test.mjs`

- [ ] **Step 1: Add failing service-worker tests**

Append to `tests/service-worker.test.mjs`:

```js
test('service worker stores and returns pending review links', async () => {
  const { listeners } = loadWorker();

  const stored = await dispatchMessage(listeners.message, {
    type: 'WEB_COMMENT_STORE_PENDING_REVIEW_LINK',
    url: 'https://webcomment.local/review/session_1?invite=invite_1',
  });
  const loaded = await dispatchMessage(listeners.message, {
    type: 'WEB_COMMENT_GET_PENDING_REVIEW_LINK',
  });
  const empty = await dispatchMessage(listeners.message, {
    type: 'WEB_COMMENT_GET_PENDING_REVIEW_LINK',
  });

  assert.deepEqual(stored, { ok: true });
  assert.deepEqual(loaded, {
    ok: true,
    url: 'https://webcomment.local/review/session_1?invite=invite_1',
  });
  assert.deepEqual(empty, { ok: true, url: '' });
});
```

- [ ] **Step 2: Run the service-worker test to verify RED**

Run:

```bash
node --test tests/service-worker.test.mjs
```

Expected: Existing tests pass and the new pending-link test fails because the worker does not handle these messages.

- [ ] **Step 3: Add pending-link state and messages**

Add this near the top of `src/background/service-worker.js`:

```js
let pendingReviewLink = '';
```

Add these message branches before the final `return false;`:

```js
  if (message.type === 'WEB_COMMENT_STORE_PENDING_REVIEW_LINK') {
    pendingReviewLink = message.url || '';
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'WEB_COMMENT_GET_PENDING_REVIEW_LINK') {
    const url = pendingReviewLink;
    pendingReviewLink = '';
    sendResponse({ ok: true, url });
    return true;
  }
```

- [ ] **Step 4: Run the service-worker test to verify GREEN**

Run:

```bash
node --test tests/service-worker.test.mjs
```

Expected: All service-worker tests pass.

- [ ] **Step 5: Commit pending-link handling**

```bash
git add src/background/service-worker.js tests/service-worker.test.mjs
git commit -m "feat: remember pending review links"
```

### Task 5: Align Documentation With Guest Sessions and Privacy Review

**Files:**
- Modify: `docs/07_API_SPEC.md`
- Modify: `docs/06_DATABASE_ERD.md`
- Modify: `docs/08_TECH_SPEC.md`
- Modify: `docs/02_UX_FLOW.md`

- [ ] **Step 1: Update API authentication wording**

In `docs/07_API_SPEC.md`, replace:

```markdown
All endpoints require authentication for MVP unless explicitly marked public.
```

with:

```markdown
MVP supports two access modes:

- Account-backed bearer tokens for future workspace/member flows.
- Review Session capability tokens for account-free guest sessions.

Comment reads, writes, and realtime subscriptions must never authorize by URL alone. They require a valid session id plus either an owner token or a guest token.
```

- [ ] **Step 2: Add guest session endpoints**

Add this section after `POST /sessions`:

````markdown
### POST /guest-sessions

Create an account-free Review Session.

Request:

```json
{
  "name": "Homepage QA",
  "password": "session password",
  "initialPage": {
    "url": "https://example.com/",
    "title": "Homepage",
    "hostname": "example.com",
    "pathname": "/",
    "pageKey": "/"
  }
}
```

Response:

```json
{
  "id": "session_id",
  "name": "Homepage QA",
  "status": "active",
  "inviteLink": "https://app.webcomment.app/review/session_id?invite=invite_token",
  "adminLink": "https://app.webcomment.app/admin/session_id?owner=owner_token",
  "ownerToken": "owner_token"
}
```

Server rules:

- Store only `password_hash`, `invite_secret_hash`, and `owner_token_hash`.
- Do not store plaintext passwords or tokens.
- Creating the session is explicit user activation, not background browsing collection.

### POST /guest-sessions/:sessionId/join

Join an account-free Review Session.

Request:

```json
{
  "inviteToken": "invite_token",
  "password": "session password",
  "displayName": "Ada"
}
```

Response:

```json
{
  "sessionId": "session_id",
  "guestId": "guest_id",
  "guestToken": "guest_token",
  "displayName": "Ada"
}
```

Server rules:

- Wrong password returns `permission_denied`.
- Removed guests cannot use old guest tokens.
- Closed sessions reject new guest joins.
````

- [ ] **Step 3: Add owner management endpoints**

Add this section after `POST /guest-sessions/:sessionId/join`:

````markdown
### PATCH /guest-sessions/:sessionId/password

Requires owner token.

Request:

```json
{
  "password": "new session password"
}
```

Response:

```json
{
  "id": "session_id",
  "status": "active",
  "updatedAt": "2026-06-23T12:00:00Z"
}
```

Changing the password affects future joins. Existing active guest tokens remain valid unless the owner removes the guest.

### POST /guest-sessions/:sessionId/invite/reset

Requires owner token.

Response:

```json
{
  "inviteLink": "https://app.webcomment.app/review/session_id?invite=new_invite_token"
}
```

Resetting the invite link invalidates previous invite links for future joins. Existing active guest tokens remain valid unless removed.

### POST /guest-sessions/:sessionId/close

Requires owner token.

Response:

```json
{
  "id": "session_id",
  "status": "closed",
  "closedAt": "2026-06-23T12:00:00Z"
}
```

Closed sessions reject new comments and replies. Existing valid owner and guest tokens can still read existing comments.

### DELETE /guest-sessions/:sessionId/guests/:guestId

Requires owner token.

Response:

```json
{
  "guestId": "guest_id",
  "status": "removed"
}
```

Removing a guest invalidates that guest token.
````

- [ ] **Step 4: Update database ERD**

In `docs/06_DATABASE_ERD.md`, add `review_sessions ||--o{ session_guests : grants` to the Mermaid ERD.

Then add this section after `review_sessions`:

```markdown
Guest-session MVP columns:

| Column | Type | Notes |
| --- | --- | --- |
| `password_hash` | text nullable | Required for account-free guest sessions. Never store plaintext passwords. |
| `invite_secret_hash` | text nullable | Hash of the current invite secret. Resetting invite access replaces this hash. |
| `owner_token_hash` | text nullable | Hash of the owner/admin capability token. |
| `closed_at` | timestamptz nullable | Set when the session is closed. |
```

Add this table after `session_members`:

```markdown
### session_guests

Account-free, session-scoped guest identities.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | Guest identity id. |
| `session_id` | uuid fk review_sessions.id | Parent review session. |
| `display_name` | text | User-provided display name. |
| `token_hash` | text | Hash of guest capability token. |
| `status` | text | active, removed. |
| `created_at` | timestamptz | Created time. |
| `last_seen_at` | timestamptz nullable | Most recent activity time. |
| `removed_at` | timestamptz nullable | Set when owner removes guest access. |
```

- [ ] **Step 5: Update technical privacy guidance**

In `docs/08_TECH_SPEC.md`, add this subsection under `## 4. Manifest V3 Permissions`:

```markdown
Guest Review Session activation rule:

WebComment is not a browsing tracker. It only activates for an explicit review session and stores the minimum page metadata required to place, recover, and synchronize user-created comments.

Activation can come from:

- Opening the popup and creating or selecting a session.
- Opening an invite or admin link.
- Joining a known session with invite link, password, and display name.

The extension must not silently upload visited URLs, full page HTML, cookies, local storage, passwords, sensitive form values, or unrelated browsing history.
```

- [ ] **Step 6: Update UX flow**

In `docs/02_UX_FLOW.md`, add this section after `## 2. First-Time User Flow`:

````markdown
## 2.1 Account-Free Guest Review Flow

```text
Owner opens target webpage
→ Opens WebComment popup
→ Enters Session name and password
→ Creates private Review Session
→ Copies invite link
→ Sends invite link and password to collaborators
→ Guest opens invite link
→ Guest enters display name and Session password
→ Guest can view, comment, and reply inside that Session only
```

Rules:

- Guests do not create member accounts.
- Guest identity is scoped to one Review Session and one browser profile.
- Comment visibility is determined by Review Session access, never by URL alone.
- A person on the same URL without this Session access sees none of the Session comments.
````

- [ ] **Step 7: Run documentation checks**

Run:

```bash
rg -n "URL alone|browsing tracker|password_hash|session_guests|guestToken" docs/07_API_SPEC.md docs/06_DATABASE_ERD.md docs/08_TECH_SPEC.md docs/02_UX_FLOW.md
```

Expected: Output includes the new guest session API, database fields, explicit privacy principle, and visibility rule.

- [ ] **Step 8: Commit documentation updates**

```bash
git add docs/07_API_SPEC.md docs/06_DATABASE_ERD.md docs/08_TECH_SPEC.md docs/02_UX_FLOW.md
git commit -m "docs: align guest review session architecture"
```

### Task 6: Full Verification and Chrome Review Readiness Check

**Files:**
- Verify: all changed source, tests, and docs

- [ ] **Step 1: Run complete automated tests**

Run:

```bash
npm test
```

Expected: All Node tests pass.

- [ ] **Step 2: Run extension structure check**

Run:

```bash
npm run check
```

Expected: Extension check passes with no missing manifest, script, HTML, or CSS asset errors.

- [ ] **Step 3: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: No output and exit code 0.

- [ ] **Step 4: Verify explicit activation and minimum data collection in source**

Run:

```bash
rg -n "cookies|localStorage|innerHTML|outerHTML|browsing history|tabs\\.onUpdated|webNavigation" src manifest.json
```

Expected: No source path shows cookie collection, localStorage collection, full-page HTML capture, background browsing tracking, or broad navigation listeners. Existing `shadow.innerHTML` UI rendering is acceptable because it renders WebComment-owned UI into the Shadow DOM, not host page capture.

- [ ] **Step 5: Verify guest access behavior manually**

Manual browser check:

```text
1. Load demo/test-page.html in Chrome with the unpacked extension.
2. Create a private Session with password "review-pass".
3. Add one comment.
4. Copy the invite link and save the password separately.
5. Clear only the local access entry for that session in chrome.storage.local or use a second browser profile.
6. Open the same target page without joining the Session.
7. Confirm no private comments render.
8. Join with invite link, display name, and password.
9. Confirm the comment appears.
10. Create a second Session on the same URL and confirm comments remain isolated by selected Session.
11. As owner, change the password and verify a new join requires the new password.
12. As owner, reset invite link and verify the old invite link cannot join again.
13. As owner, close the Session and verify existing comments remain readable but new writes are rejected.
```

Expected: A/B-style users in the same Session see each other's comments; C-style users on the same URL without Session access see no comments.

- [ ] **Step 6: Commit verification notes only if docs changed during verification**

If manual verification uncovers wording or checklist fixes in docs, commit those doc fixes:

```bash
git add docs/02_UX_FLOW.md docs/08_TECH_SPEC.md
git commit -m "docs: clarify guest session verification"
```

If no files changed during verification, do not create an empty commit.

## Self-Review

Spec coverage:

- Account-free creation: Task 2 and Task 3.
- Invite link, password, and display name join: Task 2 and Task 3.
- Session-scoped guest identity: Task 1 and Task 2.
- Owner/admin link or local token: Task 2 and Task 3.
- Owner password rotation, closure, guest removal, and invite reset: Task 2 and Task 3.
- Comment visibility by Review Session access: Task 2 and Task 6.
- Same URL with multiple isolated sessions: Task 2 and Task 6.
- Explicit activation and Chrome review risk controls: Task 5 and Task 6.
- Minimum metadata principle: Task 5 and Task 6.

Backend production gap:

- The current repo has no Supabase or API implementation. This plan intentionally proves the model in local storage and updates backend-facing docs. A later backend plan should implement server-side token hashing, database policies, realtime authorization, and HTTPS endpoints before real remote collaboration launch.
