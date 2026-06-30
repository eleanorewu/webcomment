// tests/store-remote.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const accessSrc = fs.readFileSync('src/shared/session-access.js', 'utf8');
const storeSrc  = fs.readFileSync('src/shared/store.js', 'utf8');
const clientSrc = fs.readFileSync('src/shared/api-client.js', 'utf8');

function buildChromeStorage(initial = {}) {
  const store = { ...initial };
  return {
    local: {
      get(keys, cb) {
        const result = {};
        (Array.isArray(keys) ? keys : [keys]).forEach((k) => { if (k in store) result[k] = store[k]; });
        cb(result);
      },
      set(payload, cb) { Object.assign(store, payload); cb?.(); },
    },
    raw: store,
  };
}

function loadStore(apiOverrides = {}, initial = {}) {
  const storage = buildChromeStorage(initial);
  const apiCalls = [];

  const mockApi = {
    createSession: async (data) => { apiCalls.push({ fn: 'createSession', data }); return { id: 'remote-sess-uuid', ...data, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; },
    joinSession: async (data) => { apiCalls.push({ fn: 'joinSession', data }); return { guestId: 'remote-guest-uuid', guestToken: 'guest_abc123', displayName: data.displayName }; },
    ...apiOverrides,
  };

  const window = {
    crypto: webcrypto,
    btoa(v) { return Buffer.from(v, 'binary').toString('base64'); },
    TextEncoder,
    Uint8Array,
    WebCommentApiClient: mockApi,
    WebCommentRealtimeClient: { subscribe() { return { on() { return this; } }; } },
    chrome: { storage, runtime: { lastError: null } },
  };

  vm.runInNewContext(accessSrc, { window, crypto: webcrypto, TextEncoder, Uint8Array, btoa: window.btoa });
  vm.runInNewContext(storeSrc, { window, CSS: { escape: (v) => v }, Node: { ELEMENT_NODE: 1 }, document: { evaluate: () => ({ singleNodeValue: null }), querySelector: () => null, querySelectorAll: () => [] }, console });

  return { store: window.WebCommentStore, apiCalls, storage };
}

test('createPrivateSession writes to Supabase and stores ownerToken locally', async () => {
  const { store, apiCalls, storage } = loadStore();
  const result = await store.createPrivateSession({ name: 'Remote Test', password: 'pw1', pageContext: null });
  assert.equal(apiCalls.length, 1);
  assert.equal(apiCalls[0].fn, 'createSession');
  assert.equal(result.session.id, 'remote-sess-uuid');
  const state = storage.raw['webcomment.mvp.state.v1'];
  assert.ok(state.sessions['remote-sess-uuid'], 'session should be in local cache');
  assert.ok(state.access['remote-sess-uuid']?.token, 'ownerToken should be stored locally');
});

test('joinPrivateSession calls joinSession RPC and stores guestToken locally', async () => {
  const { store, apiCalls, storage } = loadStore();
  const result = await store.joinPrivateSession({ sessionId: 'remote-sess-uuid', inviteSecret: 'inv', password: 'pw1', displayName: 'Ada' });
  assert.equal(apiCalls[0].fn, 'joinSession');
  assert.equal(result.guestToken, 'guest_abc123');
  const state = storage.raw['webcomment.mvp.state.v1'];
  assert.ok(state.access['remote-sess-uuid']?.token, 'guestToken should be stored locally');
});
