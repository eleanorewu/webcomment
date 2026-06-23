(function attachWebCommentSessionAccess(global) {
  function bytesToBase64Url(bytes) {
    const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
    const encodeBase64 = global.btoa || globalThis.btoa;
    return encodeBase64(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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
      return {
        role: 'none',
        guestId: null,
        canManage: false,
        canComment: false,
        canRead: false,
      };
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

    for (const guest of Object.values(guests || {})) {
      if (
        guest.sessionId === session.id
        && guest.status === 'active'
        && guest.tokenHash
        && await verifySecret(token, guest.tokenHash)
      ) {
        return {
          role: 'guest',
          guestId: guest.id,
          canManage: false,
          canComment: session.status === 'active',
          canRead: true,
        };
      }
    }

    return {
      role: 'none',
      guestId: null,
      canManage: false,
      canComment: false,
      canRead: false,
    };
  }

  global.WebCommentSessionAccess = {
    hashSecret,
    verifySecret,
    createCapability,
    validateDisplayName,
    getAccessRole,
  };
})(window);
