(function attachWebCommentApiClient(global) {
  const SUPABASE_URL = 'https://eatwfibzkgeervnoweyt.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhdHdmaWJ6a2dlZXJ2bm93ZXl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MjMxMjAsImV4cCI6MjA5ODM5OTEyMH0.NQqfBET5gpUTJSOH8UVBdoaQsz6gtoFIOoMdBmYHRng';

  async function supabaseFetch(path, options, token) {
    const res = await global.fetch(`${SUPABASE_URL}/rest/v1${path}`, {
      ...(options || {}),
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(token ? { 'x-wc-token': token } : {}),
        ...((options || {}).headers || {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.message || `HTTP ${res.status}`);
      err.code = body.code;
      err.status = res.status;
      throw err;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  function first(rows) {
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async function createSession({ name, passwordHash, inviteSecretHash, ownerTokenHash }) {
    return first(await supabaseFetch('/review_sessions', {
      method: 'POST',
      body: JSON.stringify({
        name,
        status: 'active',
        password_hash: passwordHash,
        invite_secret_hash: inviteSecretHash,
        owner_token_hash: ownerTokenHash,
      }),
    }));
  }

  async function joinSession({ sessionId, inviteSecret, password, displayName }) {
    return supabaseFetch('/rpc/join_session', {
      method: 'POST',
      body: JSON.stringify({
        p_session_id: sessionId,
        p_invite_secret: inviteSecret,
        p_password: password,
        p_display_name: displayName,
      }),
    });
  }

  async function listSessions(token) {
    return supabaseFetch('/review_sessions?order=updated_at.desc&select=*', {}, token) || [];
  }

  async function fetchSessionPageData(sessionId, pageKey, token) {
    const pages = await supabaseFetch(
      `/pages?session_id=eq.${sessionId}&page_key=eq.${encodeURIComponent(pageKey)}&select=*`,
      {},
      token,
    );
    if (!pages || pages.length === 0) return { page: null, pins: [], threads: [], comments: [] };
    const page = pages[0];

    const pins = await supabaseFetch(`/pins?page_id=eq.${page.id}&select=*`, {}, token) || [];
    if (pins.length === 0) return { page, pins: [], threads: [], comments: [] };

    const pinIds = pins.map((p) => p.id).join(',');
    const threads = await supabaseFetch(`/threads?pin_id=in.(${pinIds})&select=*`, {}, token) || [];
    const threadIds = threads.map((t) => t.id).join(',');
    if (!threadIds) return { page, pins, threads, comments: [] };

    const comments = await supabaseFetch(
      `/comments?thread_id=in.(${threadIds})&order=created_at.asc&select=*`,
      {},
      token,
    ) || [];

    return { page, pins, threads, comments };
  }

  async function upsertPage({ sessionId, pageKey, latestUrl, hostname, pathname, title, environment }, token) {
    return first(await supabaseFetch('/pages?on_conflict=session_id,page_key', {
      method: 'POST',
      headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
      body: JSON.stringify({
        session_id: sessionId,
        page_key: pageKey,
        latest_url: latestUrl,
        hostname,
        pathname,
        title: title || pageKey,
        environment: environment || 'production',
        updated_at: new Date().toISOString(),
      }),
    }, token));
  }

  async function insertPin({ pageId, sessionId, createdBy, anchor }, token) {
    return first(await supabaseFetch('/pins', {
      method: 'POST',
      body: JSON.stringify({
        page_id: pageId,
        session_id: sessionId,
        created_by: createdBy,
        anchor,
        anchor_revision: 1,
        status: anchor.mode === 'page' ? 'approximate' : 'attached',
      }),
    }, token));
  }

  async function insertThread({ pinId, sessionId }, token) {
    return first(await supabaseFetch('/threads', {
      method: 'POST',
      body: JSON.stringify({ pin_id: pinId, session_id: sessionId, status: 'open' }),
    }, token));
  }

  async function linkPinToThread(pinId, threadId, token) {
    await supabaseFetch(`/pins?id=eq.${pinId}`, {
      method: 'PATCH',
      body: JSON.stringify({ thread_id: threadId }),
    }, token);
  }

  async function insertComment({ threadId, sessionId, parentCommentId, authorId, authorName, authorInitials, body }, token) {
    return first(await supabaseFetch('/comments', {
      method: 'POST',
      body: JSON.stringify({
        thread_id: threadId,
        session_id: sessionId,
        parent_comment_id: parentCommentId || null,
        author_id: authorId,
        author_name: authorName,
        author_initials: authorInitials,
        body,
      }),
    }, token));
  }

  async function updateComment(commentId, body, token) {
    const now = new Date().toISOString();
    return first(await supabaseFetch(`/comments?id=eq.${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ body, updated_at: now, edited_at: now }),
    }, token));
  }

  async function deleteComment(commentId, token) {
    await supabaseFetch(`/comments?id=eq.${commentId}`, {
      method: 'DELETE',
      headers: { Prefer: '' },
    }, token);
  }

  async function deleteThread(threadId, token) {
    await supabaseFetch(`/threads?id=eq.${threadId}`, {
      method: 'DELETE',
      headers: { Prefer: '' },
    }, token);
  }

  async function setThreadResolved(threadId, resolved, resolvedBy, token) {
    const now = new Date().toISOString();
    return first(await supabaseFetch(`/threads?id=eq.${threadId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: resolved ? 'resolved' : 'open',
        resolved_by: resolved ? resolvedBy : null,
        resolved_at: resolved ? now : null,
        updated_at: now,
      }),
    }, token));
  }

  async function updatePinAnchor(pinId, anchor, anchorRevision, movedBy, token) {
    const now = new Date().toISOString();
    const rows = await supabaseFetch(`/pins?id=eq.${pinId}&anchor_revision=eq.${anchorRevision}`, {
      method: 'PATCH',
      body: JSON.stringify({
        anchor: { ...anchor, manualPosition: true },
        anchor_revision: anchorRevision + 1,
        moved_by: movedBy,
        moved_at: now,
        updated_at: now,
        status: anchor.mode === 'page' ? 'approximate' : 'attached',
      }),
    }, token);
    if (!rows || rows.length === 0) {
      const err = new Error('Anchor revision conflict');
      err.code = 'anchor_revision_conflict';
      throw err;
    }
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async function closeSession(sessionId, token) {
    const now = new Date().toISOString();
    await supabaseFetch(`/review_sessions?id=eq.${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'closed', closed_at: now, updated_at: now }),
    }, token);
  }

  async function removeGuest(guestId, token) {
    const now = new Date().toISOString();
    await supabaseFetch(`/session_guests?id=eq.${guestId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'removed', removed_at: now }),
    }, token);
  }

  async function changePassword(sessionId, passwordHash, token) {
    await supabaseFetch(`/review_sessions?id=eq.${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ password_hash: passwordHash, updated_at: new Date().toISOString() }),
    }, token);
  }

  async function resetInviteLink(sessionId, inviteSecretHash, token) {
    await supabaseFetch(`/review_sessions?id=eq.${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ invite_secret_hash: inviteSecretHash, updated_at: new Date().toISOString() }),
    }, token);
  }

  global.WebCommentApiClient = {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    createSession,
    joinSession,
    listSessions,
    fetchSessionPageData,
    upsertPage,
    insertPin,
    insertThread,
    linkPinToThread,
    insertComment,
    updateComment,
    deleteComment,
    deleteThread,
    setThreadResolved,
    updatePinAnchor,
    closeSession,
    removeGuest,
    changePassword,
    resetInviteLink,
  };
})(window);
