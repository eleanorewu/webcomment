(function attachWebCommentStore(global) {
  const STORAGE_KEY = 'webcomment.mvp.state.v1';
  const ACTIVE_SESSION_KEY = 'webcomment.mvp.activeSessionId';
  const access = global.WebCommentSessionAccess;

  function now() {
    return new Date().toISOString();
  }

  function id(prefix) {
    const cryptoApi = global.crypto;
    if (cryptoApi && cryptoApi.randomUUID) {
      return `${prefix}_${cryptoApi.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  function normalizePathname(pathname) {
    if (!pathname || pathname === '/') return '/';
    return pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  }

  function getEnvironment(hostname) {
    if (!hostname) return 'unknown';
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return 'localhost';
    if (hostname.includes('staging') || hostname.includes('dev.') || hostname.includes('preview')) return 'staging';
    return 'production';
  }

  function getPageContext(inputUrl, title) {
    const url = new URL(inputUrl);
    const pathname = normalizePathname(url.pathname);
    return {
      url: url.href,
      title: title || '',
      hostname: url.hostname,
      port: url.port || '',
      pathname,
      search: url.search,
      hash: url.hash,
      pageKey: pathname,
      environment: getEnvironment(url.hostname),
    };
  }

  function createInitialState() {
    const createdAt = now();
    const workspaceId = id('workspace');
    const projectId = id('project');
    const sessionId = id('session');
    return {
      version: 1,
      currentUser: {
        id: 'local_user',
        displayName: '本機使用者',
        initials: '本',
      },
      workspaces: {
        [workspaceId]: {
        id: workspaceId,
          name: '本機工作區',
          createdAt,
        },
      },
      projects: {
        [projectId]: {
          id: projectId,
          workspaceId,
          name: 'MVP 標注專案',
          allowedDomains: ['<all_urls>', 'localhost'],
          createdAt,
        },
      },
      sessions: {
        [sessionId]: {
          id: sessionId,
          projectId,
          name: 'MVP 標注測試',
          status: 'active',
          accessMode: 'local_legacy',
          passwordHash: '',
          inviteSecretHash: '',
          ownerTokenHash: '',
          closedAt: null,
          createdBy: 'local_user',
          createdAt,
          updatedAt: createdAt,
        },
      },
      sessionGuests: {},
      access: {},
      pages: {},
      pins: {},
      threads: {},
      comments: {},
    };
  }

  function ensureStateCollections(state) {
    state.sessionGuests ||= {};
    state.access ||= {};
    Object.values(state.sessions || {}).forEach((session) => {
      session.accessMode ||= 'local_legacy';
      session.passwordHash ||= '';
      session.inviteSecretHash ||= '';
      session.ownerTokenHash ||= '';
      session.closedAt ||= null;
    });
    return state;
  }

  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      try {
        const storageArea = global.chrome?.storage?.local;
        if (!storageArea) throw new Error('Extension context invalidated');
        storageArea.get(keys, (result) => {
          const runtimeError = global.chrome?.runtime?.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message));
            return;
          }
          resolve(result);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function storageSet(payload) {
    return new Promise((resolve, reject) => {
      try {
        const storageArea = global.chrome?.storage?.local;
        if (!storageArea) throw new Error('Extension context invalidated');
        storageArea.set(payload, () => {
          const runtimeError = global.chrome?.runtime?.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message));
            return;
          }
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function readState() {
    const result = await storageGet([STORAGE_KEY]);
    const state = ensureStateCollections(result[STORAGE_KEY] || createInitialState());
    if (!result[STORAGE_KEY]) {
      await storageSet({ [STORAGE_KEY]: state });
    }
    return state;
  }

  function requireAccessHelpers() {
    if (!access) throw new Error('Review Session access helpers are unavailable');
    return access;
  }

  async function writeState(state) {
    await storageSet({ [STORAGE_KEY]: state });
    return state;
  }

  async function getActiveSessionId() {
    const result = await storageGet([ACTIVE_SESSION_KEY]);
    if (result[ACTIVE_SESSION_KEY]) return result[ACTIVE_SESSION_KEY];
    const state = await readState();
    const firstSessionId = Object.keys(state.sessions)[0];
    await storageSet({ [ACTIVE_SESSION_KEY]: firstSessionId });
    return firstSessionId;
  }

  async function setActiveSessionId(sessionId) {
    await storageSet({ [ACTIVE_SESSION_KEY]: sessionId });
  }

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
    const role = await getStoredAccessRole(state, sessionId);
    if (role.canManage) return role;
    const localAccess = state.access?.[sessionId];
    if (localAccess?.token) {
      throw new Error('Owner access required');
    }
    const session = state.sessions[sessionId];
    const ownerToken = localAccess?.storedOwnerTokenForAdminRecovery;
    if (session && ownerToken) {
      const ownerRole = await requireAccessHelpers().getAccessRole(session, state.sessionGuests, ownerToken);
      if (ownerRole.canManage) return ownerRole;
    }
    throw new Error('Owner access required');
  }

  async function requireSessionOwnerWriteAccess(state, sessionId) {
    const role = await requireSessionOwnerAccess(state, sessionId);
    if (!role.canComment) throw new Error('Session is closed');
    return role;
  }

  async function listSessions() {
    const state = await readState();
    return Object.values(state.sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async function createSession(name, pageContext) {
    const state = await readState();
    const projectId = Object.keys(state.projects)[0];
    const sessionId = id('session');
    const createdAt = now();
    state.sessions[sessionId] = {
      id: sessionId,
      projectId,
      name: name || `標注測試 ${new Date().toLocaleDateString()}`,
      status: 'active',
      accessMode: 'local_legacy',
      passwordHash: '',
      inviteSecretHash: '',
      ownerTokenHash: '',
      closedAt: null,
      createdBy: state.currentUser.id,
      createdAt,
      updatedAt: createdAt,
    };
    if (pageContext) {
      ensurePage(state, sessionId, pageContext);
    }
    await writeState(state);
    await setActiveSessionId(sessionId);
    return state.sessions[sessionId];
  }

  async function createPrivateSession({ name, password, pageContext }) {
    const helpers = requireAccessHelpers();
    const state = await readState();
    const projectId = Object.keys(state.projects)[0];
    const sessionId = id('session');
    const createdAt = now();
    const invite = await helpers.createCapability('invite');
    const owner = await helpers.createCapability('owner');
    const ownerId = id('owner');

    state.sessions[sessionId] = {
      id: sessionId,
      projectId,
      name: name || `私人 Review ${new Date().toLocaleDateString()}`,
      status: 'active',
      accessMode: 'guest_password',
      passwordHash: await helpers.hashSecret(password),
      inviteSecretHash: invite.hash,
      ownerTokenHash: owner.hash,
      closedAt: null,
      createdBy: 'owner',
      createdAt,
      updatedAt: createdAt,
    };
    state.access[sessionId] = {
      sessionId,
      role: 'owner',
      token: owner.token,
      ownerId,
      storedOwnerTokenForAdminRecovery: owner.token,
      guestId: null,
      storedAt: createdAt,
    };
    if (pageContext) {
      ensurePage(state, sessionId, pageContext);
    }
    await writeState(state);
    await setActiveSessionId(sessionId);
    return {
      session: state.sessions[sessionId],
      inviteSecret: invite.token,
      ownerToken: owner.token,
      inviteLink: buildInviteLink(sessionId, invite.token, pageContext),
      adminLink: buildAdminLink(sessionId, owner.token, pageContext),
    };
  }

  async function joinPrivateSession({ sessionId, inviteSecret, password, displayName }) {
    const helpers = requireAccessHelpers();
    const state = await readState();
    const session = state.sessions[sessionId];
    if (!session) throw new Error('Session not found');
    if (session.status === 'closed') throw new Error('Session is closed');
    if (!await helpers.verifySecret(inviteSecret, session.inviteSecretHash)) {
      throw new Error('Invite link is no longer valid');
    }
    if (!await helpers.verifySecret(password, session.passwordHash)) {
      throw new Error('Wrong password');
    }

    const createdAt = now();
    const guestToken = await helpers.createCapability('guest');
    const guestId = id('guest');
    const trimmedDisplayName = helpers.validateDisplayName(displayName);
    state.sessionGuests[guestId] = {
      id: guestId,
      sessionId,
      displayName: trimmedDisplayName,
      tokenHash: guestToken.hash,
      status: 'active',
      createdAt,
      lastSeenAt: createdAt,
    };
    state.access[sessionId] = {
      sessionId,
      role: 'guest',
      token: guestToken.token,
      storedOwnerTokenForAdminRecovery: state.access[sessionId]?.storedOwnerTokenForAdminRecovery || null,
      guestId,
      storedAt: createdAt,
    };
    session.updatedAt = createdAt;
    await writeState(state);
    await setActiveSessionId(sessionId);
    return {
      session,
      guest: state.sessionGuests[guestId],
      guestToken: guestToken.token,
    };
  }

  async function changeSessionPassword(sessionId, password) {
    const helpers = requireAccessHelpers();
    const state = await readState();
    const session = state.sessions[sessionId];
    if (!session) throw new Error('Session not found');
    await requireSessionOwnerAccess(state, sessionId);
    const updatedAt = now();
    session.passwordHash = await helpers.hashSecret(password);
    session.updatedAt = updatedAt;
    await writeState(state);
    return session;
  }

  async function resetInviteLink(sessionId, pageContext) {
    const helpers = requireAccessHelpers();
    const state = await readState();
    const session = state.sessions[sessionId];
    if (!session) throw new Error('Session not found');
    await requireSessionOwnerAccess(state, sessionId);
    const invite = await helpers.createCapability('invite');
    const updatedAt = now();
    session.inviteSecretHash = invite.hash;
    session.updatedAt = updatedAt;
    await writeState(state);
    return {
      inviteSecret: invite.token,
      inviteLink: buildInviteLink(sessionId, invite.token, pageContext),
    };
  }

  async function closeSession(sessionId) {
    const state = await readState();
    const session = state.sessions[sessionId];
    if (!session) throw new Error('Session not found');
    await requireSessionOwnerAccess(state, sessionId);
    const updatedAt = now();
    session.status = 'closed';
    session.closedAt = updatedAt;
    session.updatedAt = updatedAt;
    await writeState(state);
    return session;
  }

  async function removeGuest(sessionId, guestId) {
    const state = await readState();
    const session = state.sessions[sessionId];
    if (!session) throw new Error('Session not found');
    await requireSessionOwnerAccess(state, sessionId);
    const guest = state.sessionGuests[guestId];
    if (!guest || guest.sessionId !== sessionId) throw new Error('Guest not found');
    const updatedAt = now();
    guest.status = 'removed';
    guest.removedAt = updatedAt;
    session.updatedAt = updatedAt;
    await writeState(state);
    return guest;
  }

  function pageIdentity(sessionId, pageKey) {
    return `${sessionId}::${pageKey}`;
  }

  function ensurePage(state, sessionId, pageContext) {
    const key = pageIdentity(sessionId, pageContext.pageKey);
    const existing = Object.values(state.pages).find((page) => page.identity === key);
    if (existing) {
      existing.latestUrl = pageContext.url;
      existing.title = pageContext.title || existing.title;
      existing.updatedAt = now();
      return existing;
    }

    const pageId = id('page');
    const createdAt = now();
    state.pages[pageId] = {
      id: pageId,
      identity: key,
      sessionId,
      pageKey: pageContext.pageKey,
      latestUrl: pageContext.url,
      hostname: pageContext.hostname,
      pathname: pageContext.pathname,
      title: pageContext.title || pageContext.pageKey,
      environment: pageContext.environment,
      createdAt,
      updatedAt: createdAt,
    };
    return state.pages[pageId];
  }

  function getPageForSession(state, sessionId, pageKey) {
    const key = pageIdentity(sessionId, pageKey);
    return Object.values(state.pages).find((page) => page.identity === key);
  }

  function createAnchor(target, click, pageContext) {
    const rect = target.getBoundingClientRect();
    const selector = buildSelector(target);
    return {
      url: pageContext.url,
      pageKey: pageContext.pageKey,
      mode: 'element',
      selector,
      xpath: buildXPath(target),
      domPath: buildDomPath(target),
      textContent: getTextContext(target),
      elementRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      documentPosition: {
        x: click.clientX + global.scrollX,
        y: click.clientY + global.scrollY,
      },
      viewportPosition: {
        x: click.clientX,
        y: click.clientY,
      },
      clickOffset: {
        xRatio: rect.width ? (click.clientX - rect.left) / rect.width : 0,
        yRatio: rect.height ? (click.clientY - rect.top) / rect.height : 0,
      },
      viewport: {
        width: global.innerWidth,
        height: global.innerHeight,
        scrollX: global.scrollX,
        scrollY: global.scrollY,
        devicePixelRatio: global.devicePixelRatio || 1,
      },
      manualPosition: false,
    };
  }

  function createPageAnchor(click, pageContext) {
    return {
      url: pageContext.url,
      pageKey: pageContext.pageKey,
      mode: 'page',
      selector: '',
      xpath: '',
      domPath: ['HTML', 'BODY'],
      textContent: '',
      elementRect: null,
      documentPosition: {
        x: click.clientX + global.scrollX,
        y: click.clientY + global.scrollY,
      },
      viewportPosition: {
        x: click.clientX,
        y: click.clientY,
      },
      clickOffset: null,
      viewport: {
        width: global.innerWidth,
        height: global.innerHeight,
        scrollX: global.scrollX,
        scrollY: global.scrollY,
        devicePixelRatio: global.devicePixelRatio || 1,
      },
      manualPosition: true,
    };
  }

  function buildSelector(element) {
    if (!(element instanceof Element)) return '';
    const stableAttrs = ['data-testid', 'data-test', 'data-cy', 'data-qa', 'aria-label'];
    if (element.id) return `#${CSS.escape(element.id)}`;
    for (const attr of stableAttrs) {
      const value = element.getAttribute(attr);
      if (value) return `${element.tagName.toLowerCase()}[${attr}="${CSS.escape(value)}"]`;
    }

    const parts = [];
    let node = element;
    while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.body) {
      let part = node.tagName.toLowerCase();
      const stableClass = Array.from(node.classList || []).find((className) => !/^\d|active|hover|focus|selected|open/.test(className));
      if (stableClass) {
        part += `.${CSS.escape(stableClass)}`;
      } else {
        const siblings = Array.from(node.parentElement ? node.parentElement.children : []);
        const sameTag = siblings.filter((sibling) => sibling.tagName === node.tagName);
        if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = node.parentElement;
      if (parts.length >= 5) break;
    }
    return parts.join(' > ');
  }

  function buildXPath(element) {
    if (!(element instanceof Element)) return '';
    const segments = [];
    let node = element;
    while (node && node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toLowerCase();
      if (node.id) {
        segments.unshift(`*[@id="${node.id}"]`);
        break;
      }
      const siblings = node.parentNode ? Array.from(node.parentNode.children).filter((child) => child.tagName === node.tagName) : [];
      const index = siblings.length > 1 ? `[${siblings.indexOf(node) + 1}]` : '';
      segments.unshift(`${tag}${index}`);
      node = node.parentElement;
    }
    return `/${segments.join('/')}`;
  }

  function buildDomPath(element) {
    const path = [];
    let node = element;
    while (node && node.nodeType === Node.ELEMENT_NODE) {
      path.unshift(node.tagName);
      node = node.parentElement;
    }
    return path;
  }

  function getTextContext(element) {
    const tag = element.tagName ? element.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea') {
      return element.getAttribute('placeholder') || element.getAttribute('aria-label') || '';
    }
    return (element.innerText || element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 240);
  }

  function recoverAnchor(anchor) {
    if (anchor.mode === 'page' && anchor.documentPosition) {
      return {
        status: 'approximate',
        strategy: 'fallback',
        confidence: 0.55,
        viewportPosition: {
          x: anchor.documentPosition.x - global.scrollX,
          y: anchor.documentPosition.y - global.scrollY,
        },
      };
    }

    const strategies = [
      () => anchor.selector && document.querySelector(anchor.selector),
      () => findByXPath(anchor.xpath),
      () => findByText(anchor.textContent),
    ];

    for (let index = 0; index < strategies.length; index += 1) {
      try {
        const element = strategies[index]();
        if (element) {
          const rect = element.getBoundingClientRect();
          const xRatio = anchor.clickOffset ? anchor.clickOffset.xRatio : 0.5;
          const yRatio = anchor.clickOffset ? anchor.clickOffset.yRatio : 0.5;
          return {
            status: index === 0 ? 'attached' : 'recovered',
            strategy: ['selector', 'xpath', 'text'][index],
            confidence: index === 0 ? 0.98 : 0.78,
            viewportPosition: {
              x: rect.left + rect.width * xRatio,
              y: rect.top + rect.height * yRatio,
            },
          };
        }
      } catch (error) {
        // Keep trying lower-confidence recovery methods.
      }
    }

    if (anchor.documentPosition) {
      return {
        status: 'approximate',
        strategy: 'fallback',
        confidence: 0.35,
        viewportPosition: {
          x: anchor.documentPosition.x - global.scrollX,
          y: anchor.documentPosition.y - global.scrollY,
        },
      };
    }

    return {
      status: 'lost',
      strategy: 'fallback',
      confidence: 0,
      viewportPosition: null,
    };
  }

  function findByXPath(xpath) {
    if (!xpath) return null;
    return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  }

  function findByText(text) {
    if (!text || text.length < 3) return null;
    const normalized = text.slice(0, 80).toLowerCase();
    const candidates = Array.from(document.querySelectorAll('button, a, p, span, div, h1, h2, h3, label'));
    return candidates.find((element) => (element.innerText || element.textContent || '').trim().replace(/\s+/g, ' ').toLowerCase().includes(normalized));
  }

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

  async function createThread(sessionId, pageContext, anchor, body) {
    const state = await readState();
    const accessRole = await requireSessionCommentAccess(state, sessionId);
    const author = getCurrentAuthor(state, sessionId, accessRole);
    const page = ensurePage(state, sessionId, pageContext);
    const createdAt = now();
    const pinId = id('pin');
    const threadId = id('thread');
    const commentId = id('comment');

    state.pins[pinId] = {
      id: pinId,
      pageId: page.id,
      sessionId,
      threadId,
      createdBy: author.id,
      anchor,
      anchorRevision: 1,
      movedBy: null,
      movedAt: null,
      status: 'attached',
      createdAt,
      updatedAt: createdAt,
    };

    state.threads[threadId] = {
      id: threadId,
      pinId,
      sessionId,
      status: 'open',
      resolvedBy: null,
      resolvedAt: null,
      createdAt,
      updatedAt: createdAt,
    };

    state.comments[commentId] = {
      id: commentId,
      threadId,
      parentCommentId: null,
      authorId: author.id,
      authorName: author.displayName,
      authorInitials: author.initials,
      body,
      createdAt,
      updatedAt: createdAt,
    };

    state.sessions[sessionId].updatedAt = createdAt;
    await writeState(state);
    return { pin: state.pins[pinId], thread: state.threads[threadId], comment: state.comments[commentId] };
  }

  async function updatePinAnchor(pinId, anchor, expectedRevision) {
    const state = await readState();
    const pin = state.pins[pinId];
    if (!pin) throw new Error('Pin not found');
    const accessRole = await requireSessionOwnerWriteAccess(state, pin.sessionId);
    const author = getCurrentAuthor(state, pin.sessionId, accessRole);

    const currentRevision = pin.anchorRevision || 1;
    if (expectedRevision != null && expectedRevision !== currentRevision) {
      const error = new Error('Anchor revision conflict');
      error.code = 'anchor_revision_conflict';
      error.currentRevision = currentRevision;
      throw error;
    }

    const updatedAt = now();
    pin.anchor = { ...anchor, manualPosition: true };
    pin.anchorRevision = currentRevision + 1;
    pin.movedBy = author.id;
    pin.movedAt = updatedAt;
    pin.updatedAt = updatedAt;
    pin.status = anchor.mode === 'page' ? 'approximate' : 'attached';

    const thread = state.threads[pin.threadId];
    if (thread) {
      thread.updatedAt = updatedAt;
      if (state.sessions[thread.sessionId]) state.sessions[thread.sessionId].updatedAt = updatedAt;
    }

    await writeState(state);
    return pin;
  }

  async function addReply(threadId, body) {
    const state = await readState();
    const thread = state.threads[threadId];
    if (!thread) throw new Error('Thread not found');
    const accessRole = await requireSessionCommentAccess(state, thread.sessionId);
    const author = getCurrentAuthor(state, thread.sessionId, accessRole);
    const createdAt = now();
    const commentId = id('comment');
    state.comments[commentId] = {
      id: commentId,
      threadId,
      parentCommentId: getOriginalCommentId(state, threadId),
      authorId: author.id,
      authorName: author.displayName,
      authorInitials: author.initials,
      body,
      createdAt,
      updatedAt: createdAt,
    };
    thread.updatedAt = createdAt;
    if (state.sessions[thread.sessionId]) state.sessions[thread.sessionId].updatedAt = createdAt;
    await writeState(state);
    return state.comments[commentId];
  }

  async function updateComment(commentId, body) {
    const state = await readState();
    const comment = state.comments[commentId];
    if (!comment) throw new Error('Comment not found');
    const thread = state.threads[comment.threadId];
    if (thread) await requireSessionOwnerWriteAccess(state, thread.sessionId);
    const updatedAt = now();
    comment.body = body;
    comment.updatedAt = updatedAt;
    comment.editedAt = updatedAt;

    if (thread) {
      thread.updatedAt = updatedAt;
      if (state.sessions[thread.sessionId]) state.sessions[thread.sessionId].updatedAt = updatedAt;
    }

    await writeState(state);
    return comment;
  }

  async function deleteComment(commentId) {
    const state = await readState();
    const comment = state.comments[commentId];
    if (!comment) throw new Error('Comment not found');
    const thread = state.threads[comment.threadId];
    if (thread) await requireSessionOwnerWriteAccess(state, thread.sessionId);

    if (!comment.parentCommentId && thread) {
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
    if (thread) {
      thread.updatedAt = now();
      if (state.sessions[thread.sessionId]) state.sessions[thread.sessionId].updatedAt = thread.updatedAt;
    }
    await writeState(state);
    return { deletedCommentId: commentId };
  }

  function getOriginalCommentId(state, threadId) {
    const original = Object.values(state.comments).find((comment) => comment.threadId === threadId && !comment.parentCommentId);
    return original ? original.id : null;
  }

  async function setThreadResolved(threadId, resolved) {
    const state = await readState();
    const thread = state.threads[threadId];
    if (!thread) throw new Error('Thread not found');
    const accessRole = await requireSessionOwnerWriteAccess(state, thread.sessionId);
    const author = getCurrentAuthor(state, thread.sessionId, accessRole);
    const updatedAt = now();
    thread.status = resolved ? 'resolved' : 'open';
    thread.resolvedBy = resolved ? author.id : null;
    thread.resolvedAt = resolved ? updatedAt : null;
    thread.updatedAt = updatedAt;
    if (state.sessions[thread.sessionId]) state.sessions[thread.sessionId].updatedAt = updatedAt;
    await writeState(state);
    return thread;
  }

  function selectSessionPageData(state, sessionId, pageContext, includeResolved) {
    const page = getPageForSession(state, sessionId, pageContext.pageKey);
    if (!page) return { page: null, pins: [], threads: [], comments: [] };
    const pins = Object.values(state.pins).filter((pin) => pin.pageId === page.id && pin.sessionId === sessionId);
    const threads = pins.map((pin) => state.threads[pin.threadId]).filter(Boolean);
    const visibleThreadIds = new Set(threads.filter((thread) => includeResolved || thread.status !== 'resolved').map((thread) => thread.id));
    const visiblePins = pins.filter((pin) => visibleThreadIds.has(pin.threadId));
    const comments = Object.values(state.comments)
      .filter((comment) => visibleThreadIds.has(comment.threadId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return {
      page,
      pins: visiblePins,
      threads: threads.filter((thread) => visibleThreadIds.has(thread.id)),
      comments,
    };
  }

  async function getSessionPageData(sessionId, pageContext, includeResolved) {
    const state = await readState();
    const accessRole = await requireSessionReadAccess(state, sessionId);
    return {
      ...selectSessionPageData(state, sessionId, pageContext, includeResolved),
      accessRole,
    };
  }

  function formatRelativeTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.max(0, Math.floor(diff / 60000));
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  global.WebCommentStore = {
    STORAGE_KEY,
    ACTIVE_SESSION_KEY,
    getPageContext,
    getActiveSessionId,
    setActiveSessionId,
    listSessions,
    createSession,
    createPrivateSession,
    joinPrivateSession,
    changeSessionPassword,
    resetInviteLink,
    closeSession,
    removeGuest,
    buildInviteLink,
    buildAdminLink,
    readState,
    writeState,
    createAnchor,
    createPageAnchor,
    recoverAnchor,
    createThread,
    updatePinAnchor,
    addReply,
    updateComment,
    deleteComment,
    setThreadResolved,
    getSessionPageData,
    selectSessionPageData,
    formatRelativeTime,
  };
})(window);
