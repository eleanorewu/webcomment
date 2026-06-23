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
  assert.equal(access.validateDisplayName('Ada   Lovelace'), 'Ada Lovelace');
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
  assert.deepEqual(await access.getAccessRole(session, guests, removedGuest.token), {
    role: 'none',
    guestId: null,
    canManage: false,
    canComment: false,
    canRead: false,
  });
  assert.deepEqual(await access.getAccessRole(session, guests, 'guest_missing'), {
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

  assert.deepEqual(await access.getAccessRole(session, guests, laterGuest.token), {
    role: 'guest',
    guestId: 'guest_2',
    canManage: false,
    canComment: true,
    canRead: true,
  });
});
