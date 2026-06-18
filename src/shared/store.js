(function attachWebCommentStore(global) {
  const STORAGE_KEY = 'webcomment.mvp.state.v1';
  const ACTIVE_SESSION_KEY = 'webcomment.mvp.activeSessionId';

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
          createdBy: 'local_user',
          createdAt,
          updatedAt: createdAt,
        },
      },
      pages: {},
      pins: {},
      threads: {},
      comments: {},
    };
  }

  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get(keys, (result) => {
          const runtimeError = chrome.runtime && chrome.runtime.lastError;
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
        chrome.storage.local.set(payload, () => {
          const runtimeError = chrome.runtime && chrome.runtime.lastError;
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
    const state = result[STORAGE_KEY] || createInitialState();
    if (!result[STORAGE_KEY]) {
      await storageSet({ [STORAGE_KEY]: state });
    }
    return state;
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

  async function createThread(sessionId, pageContext, anchor, body) {
    const state = await readState();
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
      createdBy: state.currentUser.id,
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
      authorId: state.currentUser.id,
      authorName: state.currentUser.displayName,
      authorInitials: state.currentUser.initials,
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
    pin.movedBy = state.currentUser.id;
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
    const createdAt = now();
    const commentId = id('comment');
    state.comments[commentId] = {
      id: commentId,
      threadId,
      parentCommentId: getOriginalCommentId(state, threadId),
      authorId: state.currentUser.id,
      authorName: state.currentUser.displayName,
      authorInitials: state.currentUser.initials,
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
    const updatedAt = now();
    comment.body = body;
    comment.updatedAt = updatedAt;
    comment.editedAt = updatedAt;

    const thread = state.threads[comment.threadId];
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
    const updatedAt = now();
    thread.status = resolved ? 'resolved' : 'open';
    thread.resolvedBy = resolved ? state.currentUser.id : null;
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
    return selectSessionPageData(state, sessionId, pageContext, includeResolved);
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
