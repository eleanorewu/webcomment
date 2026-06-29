// tests/api-client.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadClient(fetchImpl) {
  const window = { fetch: fetchImpl };
  // Use runInThisContext so that array/object literals created inside the IIFE
  // share the host realm, allowing assert.deepStrictEqual to pass across the boundary.
  const prev = globalThis.window;
  globalThis.window = window;
  try {
    vm.runInThisContext(fs.readFileSync('src/shared/api-client.js', 'utf8'));
  } finally {
    globalThis.window = prev;
  }
  return window.WebCommentApiClient;
}

function mockFetch(status, body) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

test('createSession posts to /review_sessions and returns first row', async () => {
  const expected = { id: 'uuid-1', name: 'Test', status: 'active' };
  const client = loadClient(mockFetch(201, [expected]));
  const result = await client.createSession({
    name: 'Test',
    passwordHash: 'ph',
    inviteSecretHash: 'ish',
    ownerTokenHash: 'oth',
  });
  assert.deepEqual(result, expected);
});

test('joinSession calls /rpc/join_session and returns json', async () => {
  const expected = { guestId: 'g1', guestToken: 'guest_abc', displayName: 'Ada' };
  const client = loadClient(mockFetch(200, expected));
  const result = await client.joinSession({
    sessionId: 'sess-1',
    inviteSecret: 'inv',
    password: 'pass',
    displayName: 'Ada',
  });
  assert.deepEqual(result, expected);
});

test('supabaseFetch throws on non-ok response', async () => {
  const client = loadClient(mockFetch(403, { message: 'permission_denied', code: 'permission_denied' }));
  await assert.rejects(
    () => client.listSessions('bad-token'),
    (err) => {
      assert.equal(err.message, 'permission_denied');
      assert.equal(err.code, 'permission_denied');
      assert.equal(err.status, 403);
      return true;
    },
  );
});

test('fetchSessionPageData returns empty result when page not found', async () => {
  const client = loadClient(mockFetch(200, []));
  const result = await client.fetchSessionPageData('sess-1', '/home', 'token');
  assert.deepEqual(result, { page: null, pins: [], threads: [], comments: [] });
});

test('updatePinAnchor throws anchor_revision_conflict when patch returns empty array', async () => {
  const client = loadClient(mockFetch(200, []));
  await assert.rejects(
    () => client.updatePinAnchor('pin-1', {}, 1, 'actor-1', 'token'),
    (err) => {
      assert.equal(err.code, 'anchor_revision_conflict');
      return true;
    },
  );
});
