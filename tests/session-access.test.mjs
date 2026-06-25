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

async function plainRole(rolePromise) {
  return JSON.parse(JSON.stringify(await rolePromise));
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
  assert.match(capability.token, /^owner_[A-Za-z0-9_-]{43}$/);
  assert.doesNotMatch(capability.token, /=/);
  assert.equal(await access.verifySecret(capability.token, capability.hash), true);
  assert.equal(await access.verifySecret(`${capability.token}_wrong`, capability.hash), false);
});

test('validateDisplayName trims names and rejects empty names', () => {
  const access = loadAccess();

  assert.equal(access.validateDisplayName('  Ada Lovelace  '), 'Ada Lovelace');
  assert.equal(access.validateDisplayName('Ada   Lovelace'), 'Ada Lovelace');
  assert.equal(access.validateDisplayName('A'.repeat(90)), 'A'.repeat(80));
  assert.throws(() => access.validateDisplayName('   '), /Display name is required/);
});

test('getAccessRole resolves owner, active guest, removed guest, and missing access', async () => {
  const access = loadAccess();
  const owner = await access.createCapability('owner');
  const guest = await access.createCapability('guest');
  const removedGuest = await access.createCapability('guest');

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
      tokenHash: removedGuest.hash,
      status: 'removed',
    },
  };

  assert.deepEqual(await plainRole(access.getAccessRole(session, guests, owner.token)), {
    role: 'owner',
    guestId: null,
    canManage: true,
    canComment: true,
    canRead: true,
  });
  assert.deepEqual(await plainRole(access.getAccessRole(session, guests, guest.token)), {
    role: 'guest',
    guestId: 'guest_1',
    canManage: false,
    canComment: true,
    canRead: true,
  });
  assert.deepEqual(await plainRole(access.getAccessRole(session, guests, removedGuest.token)), {
    role: 'none',
    guestId: null,
    canManage: false,
    canComment: false,
    canRead: false,
  });
  assert.deepEqual(await plainRole(access.getAccessRole(session, guests, 'guest_missing')), {
    role: 'none',
    guestId: null,
    canManage: false,
    canComment: false,
    canRead: false,
  });
});

test('getAccessRole checks later active guests in the same session', async () => {
  const access = loadAccess();
  const owner = await access.createCapability('owner');
  const firstGuest = await access.createCapability('guest');
  const laterGuest = await access.createCapability('guest');

  const session = {
    id: 'session_1',
    status: 'active',
    ownerTokenHash: owner.hash,
  };
  const guests = {
    guest_1: {
      id: 'guest_1',
      sessionId: 'session_1',
      tokenHash: firstGuest.hash,
      status: 'active',
    },
    guest_2: {
      id: 'guest_2',
      sessionId: 'session_1',
      tokenHash: laterGuest.hash,
      status: 'active',
    },
  };

  assert.deepEqual(await plainRole(access.getAccessRole(session, guests, laterGuest.token)), {
    role: 'guest',
    guestId: 'guest_2',
    canManage: false,
    canComment: true,
    canRead: true,
  });
});

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

test('missing sessions cannot be read or written as legacy access', async () => {
  const chrome = createChromeStorage();
  const store = loadStoreWithAccess(chrome);
  const pageContext = store.getPageContext('https://example.com/pricing', 'Pricing');
  const anchor = {
    mode: 'page',
    pageKey: pageContext.pageKey,
    documentPosition: { x: 10, y: 20 },
    viewportPosition: { x: 10, y: 20 },
  };

  await assert.rejects(
    store.getSessionPageData('missing_session', pageContext, false),
    /Session access required/,
  );
  await assert.rejects(
    store.createThread('missing_session', pageContext, anchor, 'Orphan comment'),
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
  let state = await store.readState();
  assert.equal(
    state.access[created.session.id].storedOwnerTokenForAdminRecovery,
    created.ownerToken,
  );
  state.access[created.session.id] = {
    ...state.access[created.session.id],
    role: 'owner',
    token: created.ownerToken,
    guestId: null,
  };
  await store.writeState(state);

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
  state = await store.readState();

  assert.equal(state.sessionGuests[joined.guest.id].status, 'removed');
  assert.equal(state.sessions[created.session.id].status, 'closed');
});

test('closed sessions remain readable to valid access but reject writes', async () => {
  const chrome = createChromeStorage();
  const store = loadStoreWithAccess(chrome);
  const pageContext = store.getPageContext('https://example.com/pricing', 'Pricing');
  const created = await store.createPrivateSession({
    name: 'Pricing review',
    password: 'secret-pass',
    pageContext,
  });
  const result = await store.createThread(
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

  await store.closeSession(created.session.id);

  const readable = await store.getSessionPageData(created.session.id, pageContext, false);
  assert.equal(readable.comments[0].body, 'Private comment');

  await assert.rejects(
    store.createThread(created.session.id, pageContext, result.pin.anchor, 'Closed write'),
    /Session is closed/,
  );
  await assert.rejects(store.addReply(result.thread.id, 'Closed reply'), /Session is closed/);
  await assert.rejects(store.updateComment(result.comment.id, 'Closed edit'), /Session is closed/);
  await assert.rejects(store.deleteComment(result.comment.id), /Session is closed/);
  await assert.rejects(store.setThreadResolved(result.thread.id, true), /Session is closed/);
  await assert.rejects(
    store.updatePinAnchor(result.pin.id, result.pin.anchor, result.pin.anchorRevision),
    /Session is closed/,
  );
});

test('removed guest tokens lose read and write access', async () => {
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
  const result = await store.createThread(
    created.session.id,
    pageContext,
    {
      mode: 'page',
      pageKey: pageContext.pageKey,
      documentPosition: { x: 10, y: 20 },
      viewportPosition: { x: 10, y: 20 },
    },
    'Guest comment',
  );

  let state = await store.readState();
  state.access[created.session.id] = {
    role: 'owner',
    token: created.ownerToken,
    storedOwnerTokenForAdminRecovery: created.ownerToken,
  };
  await store.writeState(state);
  await store.removeGuest(created.session.id, joined.guest.id);

  state = await store.readState();
  state.access[created.session.id] = {
    role: 'guest',
    guestId: joined.guest.id,
    token: joined.guestToken,
  };
  await store.writeState(state);

  await assert.rejects(
    store.getSessionPageData(created.session.id, pageContext, false),
    /Session access required/,
  );
  await assert.rejects(store.addReply(result.thread.id, 'Removed guest reply'), /Session access required/);
});

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

test('guests can comment and reply but cannot perform owner moderation actions', async () => {
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
    displayName: 'Grace Hopper',
  });
  const result = await store.createThread(
    created.session.id,
    pageContext,
    {
      mode: 'page',
      pageKey: pageContext.pageKey,
      documentPosition: { x: 10, y: 20 },
      viewportPosition: { x: 10, y: 20 },
    },
    'Guest comment',
  );
  const reply = await store.addReply(result.thread.id, 'Guest reply');
  const state = await store.readState();

  assert.equal(result.pin.createdBy, joined.guest.id);
  assert.equal(result.comment.authorId, joined.guest.id);
  assert.equal(result.comment.authorName, 'Grace Hopper');
  assert.equal(result.comment.authorInitials, 'G');
  assert.equal(reply.authorId, joined.guest.id);
  assert.equal(state.access[created.session.id].role, 'guest');
  assert.equal(state.access[created.session.id].storedOwnerTokenForAdminRecovery, created.ownerToken);
  await assert.rejects(store.changeSessionPassword(created.session.id, 'guest-password'), /Owner access required/);
  await assert.rejects(store.resetInviteLink(created.session.id, pageContext), /Owner access required/);
  await assert.rejects(store.removeGuest(created.session.id, joined.guest.id), /Owner access required/);
  await assert.rejects(store.closeSession(created.session.id), /Owner access required/);
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
});

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
