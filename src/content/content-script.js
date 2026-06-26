(function initWebCommentContent() {
  if (window.__WEB_COMMENT_CONTENT_LOADED__) return;
  window.__WEB_COMMENT_CONTENT_LOADED__ = true;

  const store = window.WebCommentStore;
  const rootId = 'webcomment-root';
  let root = null;
  let shadow = null;

  const state = {
    sessionId: null,
    pageContext: store.getPageContext(location.href, document.title),
    overlayActive: false,
    includeResolved: false,
    commentMode: false,
    sidebarOpen: true,
    sidebarCollapsed: false,
    draft: null,
    selectedThreadId: null,
    editingCommentId: null,
    searchQuery: '',
    sessionData: { pins: [], threads: [], comments: [] },
    accessRole: { role: 'none', actorId: null, canManage: false, canComment: false, canRead: false },
    recovery: {},
    previewPinId: null,
    drag: null,
    suppressPinClickId: null,
    contextInvalidated: false,
  };

  const SUBMIT_ICON = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 10V2M2 6l4-4 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const TOOLBAR_ANNOTATION_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12.034 12.681C11.9979 12.5906 11.9892 12.4915 12.0088 12.3962C12.0285 12.3008 12.0756 12.2133 12.1445 12.1445C12.2133 12.0756 12.3008 12.0285 12.3962 12.0088C12.4915 11.9892 12.5906 11.998 12.681 12.034L21.681 15.534C21.7775 15.5717 21.8599 15.6384 21.9168 15.725C21.9737 15.8116 22.0023 15.9137 21.9987 16.0172C21.9951 16.1207 21.9594 16.2206 21.8966 16.3029C21.8337 16.3853 21.7469 16.4461 21.648 16.477L18.204 17.545C18.0486 17.593 17.9073 17.6783 17.7923 17.7933C17.6773 17.9083 17.592 18.0496 17.544 18.205L16.477 21.648C16.4461 21.7469 16.3853 21.8338 16.3029 21.8966C16.2206 21.9594 16.1207 21.9951 16.0172 21.9987C15.9137 22.0023 15.8116 21.9737 15.725 21.9168C15.6384 21.8599 15.5717 21.7775 15.534 21.681L12.034 12.681Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 3C4.46957 3 3.96086 3.21071 3.58579 3.58579C3.21071 3.96086 3 4.46957 3 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 3C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 21C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 3H10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 21H11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 3H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 9V10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 9V11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 14V15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const TOOLBAR_EYE_OPEN_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.06199 11.652C1.97865 11.8765 1.97865 12.1235 2.06199 12.348C2.87369 14.3161 4.2515 15.999 6.02076 17.1831C7.79001 18.3672 9.87103 18.9994 12 18.9994C14.1289 18.9994 16.21 18.3672 17.9792 17.1831C19.7485 15.999 21.1263 14.3161 21.938 12.348C22.0213 12.1235 22.0213 11.8765 21.938 11.652C21.1263 9.68385 19.7485 8.00103 17.9792 6.81689C16.21 5.63275 14.1289 5.00061 12 5.00061C9.87103 5.00061 7.79001 5.63275 6.02076 6.81689C4.2515 8.00103 2.87369 9.68385 2.06199 11.652Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const TOOLBAR_EYE_CLOSED_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 18L14.278 14.75" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 8C2.74835 10.0508 4.10913 11.8219 5.8979 13.0733C7.68667 14.3247 9.81695 14.9959 12 14.9959C14.1831 14.9959 16.3133 14.3247 18.1021 13.0733C19.8909 11.8219 21.2516 10.0508 22 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 15L18.274 12.95" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 15L5.726 12.95" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 18L9.722 14.75" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  let previewOpenTimer = null;
  let previewCloseTimer = null;
  let routeChangeTimer = null;
  let storageListenerBound = false;
  const pageCleanups = [];
  const historyRestorers = [];

  boot().catch(handleAsyncError);

  function ensureRoot() {
    let node = document.getElementById(rootId);
    if (!node) {
      node = document.createElement('div');
      node.id = rootId;
      document.documentElement.appendChild(node);
    }
    return node;
  }

  async function boot() {
    state.sessionId = await store.getActiveSessionId();
    bindMessageBridge();
  }

  function mount() {
    root = ensureRoot();
    shadow = root.shadowRoot || root.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${styles()}</style>
      <div class="wc-app">
        <div class="wc-pin-layer" data-pin-layer></div>
        <div class="wc-draft-layer" data-draft-layer></div>
        <div class="wc-preview-layer" data-preview-layer></div>
        <div class="wc-toolbar" data-toolbar></div>
        <aside class="wc-sidebar" data-sidebar></aside>
        <div class="wc-toast" data-toast hidden></div>
        <div class="wc-context-error" data-context-error hidden>
          <strong>WebComment 已更新</strong>
          <span>請重新整理此頁面後繼續使用標注功能。</span>
          <button type="button">重新整理頁面</button>
        </div>
      </div>
    `;
    ['keydown', 'keyup', 'keypress', 'beforeinput', 'input', 'compositionstart', 'compositionupdate', 'compositionend']
      .forEach((type) => shadow.addEventListener(type, stopHostInputPropagation));
    shadow.querySelector('[data-context-error] button').addEventListener('click', () => location.reload());
  }

  function stopHostInputPropagation(event) {
    event.stopPropagation();
  }

  function handleUnhandledRejection(event) {
    if (!isExtensionContextError(event.reason)) return;
    event.preventDefault();
    handleAsyncError(event.reason);
  }

  function handleAsyncError(error) {
    if (!isExtensionContextError(error)) {
      console.error('[WebComment]', error);
      return;
    }

    if (state.contextInvalidated) return;
    state.contextInvalidated = true;
    clearTimeout(previewOpenTimer);
    clearTimeout(previewCloseTimer);
    state.drag = null;

    if (!shadow) return;
    ['[data-pin-layer]', '[data-draft-layer]', '[data-preview-layer]', '[data-toolbar]', '[data-sidebar]'].forEach((selector) => {
      const node = shadow.querySelector(selector);
      if (node) node.hidden = true;
    });
    const notice = shadow.querySelector('[data-context-error]');
    if (notice) notice.hidden = false;
  }

  function isExtensionContextError(error) {
    const message = error && error.message ? error.message : String(error || '');
    return /extension context invalidated|context invalidated/i.test(message);
  }

  function bindMessageBridge() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      handleMessage(message).then(sendResponse).catch((error) => {
        handleAsyncError(error);
        sendResponse({ ok: false });
      });
      return true;
    });
  }

  function listen(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    pageCleanups.push(() => target.removeEventListener(type, listener, options));
  }

  function handleStorageChange(changes, areaName) {
    if (!state.overlayActive || areaName !== 'local' || !changes[store.STORAGE_KEY] || state.drag) return;
    refreshData().then(() => {
      render();
      updateBadge();
    }).catch(handleAsyncError);
  }

  function bindPageEvents() {
    if (pageCleanups.length || storageListenerBound) return;
    if (typeof chrome === 'undefined') throw new Error('Extension context invalidated');
    if (!chrome.storage?.onChanged) throw new Error('Extension context invalidated');
    listen(window, 'unhandledrejection', handleUnhandledRejection);
    listen(document, 'click', handleDocumentClick, true);
    listen(document, 'keydown', handleKeydown, true);
    listen(window, 'scroll', scheduleRender, { passive: true });
    listen(window, 'resize', scheduleRender);
    listen(window, 'hashchange', handleRouteChange);
    listen(window, 'popstate', handleRouteChange);
    chrome.storage.onChanged.addListener(handleStorageChange);
    storageListenerBound = true;
    patchHistory();
  }

  function clearPageListeners() {
    while (pageCleanups.length) pageCleanups.pop()();
    if (storageListenerBound) {
      if (typeof chrome !== 'undefined') {
        chrome.storage?.onChanged?.removeListener(handleStorageChange);
      }
      storageListenerBound = false;
    }
  }

  async function activateOverlay(sessionId) {
    if (!state.overlayActive) {
      mount();
      bindPageEvents();
      state.overlayActive = true;
    }
    state.sessionId = sessionId || state.sessionId || (await store.getActiveSessionId());
    state.commentMode = true;
    state.draft = null;
    await refreshData();
    render();
  }

  function deactivateOverlay() {
    if (!state.overlayActive) return { ok: true };
    clearTimeout(previewOpenTimer);
    clearTimeout(previewCloseTimer);
    clearTimeout(routeChangeTimer);
    clearTimeout(showToast.timer);
    clearPageListeners();
    restoreHistory();
    document.documentElement.classList.remove('webcomment-comment-mode');
    root.remove();
    root = null;
    shadow = null;
    state.overlayActive = false;
    state.commentMode = false;
    state.draft = null;
    state.drag = null;
    state.previewPinId = null;
    try {
      chrome.runtime.sendMessage({ type: 'WEB_COMMENT_OVERLAY_DEACTIVATED' });
    } catch (error) {
      handleAsyncError(error);
    }
    return { ok: true };
  }

  async function handleMessage(message) {
    if (message.type === 'WEB_COMMENT_PING') {
      return { ok: true, active: state.overlayActive };
    }

    if (message.type === 'WEB_COMMENT_ENABLE_COMMENT_MODE') {
      await activateOverlay(message.sessionId);
      showToast('請點擊頁面上要標注的位置。');
      return { ok: true, active: true };
    }

    if (message.type === 'WEB_COMMENT_DEACTIVATE') {
      return deactivateOverlay();
    }

    if (message.type === 'WEB_COMMENT_SESSION_CHANGED') {
      state.sessionId = message.sessionId;
      state.selectedThreadId = null;
      state.editingCommentId = null;
      state.draft = null;
      state.sidebarOpen = true;
      if (!state.overlayActive) return { ok: true };
      await refreshData();
      render();
      updateBadge();
      return { ok: true };
    }

    if (message.type === 'WEB_COMMENT_SHOW_RESOLVED') {
      state.includeResolved = Boolean(message.value);
      if (!state.overlayActive) return { ok: true };
      await refreshData();
      render();
      updateBadge();
      return { ok: true };
    }

    if (message.type === 'WEB_COMMENT_REFRESH') {
      if (!state.overlayActive) return { ok: true };
      await refreshData();
      render();
      updateBadge();
      return { ok: true };
    }

    return { ok: false };
  }

  async function refreshData() {
    state.pageContext = store.getPageContext(location.href, document.title);
    if (!state.sessionId) state.sessionId = await store.getActiveSessionId();
    const data = await store.getSessionPageData(state.sessionId, state.pageContext, state.includeResolved);
    state.sessionData = data;
    state.accessRole = data.accessRole || { role: 'none', actorId: null, canManage: false, canComment: false, canRead: false };
    state.recovery = {};
    state.sessionData.pins.forEach((pin) => {
      state.recovery[pin.id] = store.recoverAnchor(pin.anchor);
    });
    if (state.previewPinId && !state.sessionData.pins.some((pin) => pin.id === state.previewPinId)) {
      state.previewPinId = null;
    }
  }

  function updateBadge() {
    const openCount = state.sessionData.threads.filter((thread) => thread.status !== 'resolved').length;
    try {
      chrome.runtime.sendMessage({ type: 'WEB_COMMENT_SET_BADGE', text: openCount ? String(openCount) : '' });
    } catch (error) {
      handleAsyncError(error);
    }
  }

  function render() {
    if (!state.overlayActive || !shadow) return;
    syncCommentCursor();
    renderPins();
    renderPinPreview();
    renderDraftComposer();
    renderToolbar();
    renderSidebar();
  }

  function scheduleRender() {
    if (!state.overlayActive || (state.drag && state.drag.started)) return;
    window.requestAnimationFrame(() => {
      if (!state.overlayActive) return;
      state.sessionData.pins.forEach((pin) => {
        state.recovery[pin.id] = store.recoverAnchor(pin.anchor);
      });
      render();
    });
  }

  function syncCommentCursor() {
    document.documentElement.classList.toggle(
      'webcomment-comment-mode',
      state.overlayActive && state.commentMode,
    );
  }

  function renderPins() {
    const layer = shadow.querySelector('[data-pin-layer]');
    layer.innerHTML = '';

    state.sessionData.pins.forEach((pin, index) => {
      const thread = state.sessionData.threads.find((candidate) => candidate.id === pin.threadId);
      const recovery = state.recovery[pin.id];
      if (!thread || !recovery || !recovery.viewportPosition) return;

      const button = document.createElement('button');
      const selectedClass = state.selectedThreadId === thread.id ? ' is-selected' : '';
      button.className = `wc-pin wc-pin-${thread.status === 'resolved' ? 'resolved' : recovery.status}${selectedClass}`;
      button.type = 'button';
      button.style.left = `${recovery.viewportPosition.x}px`;
      button.style.top = `${recovery.viewportPosition.y}px`;
      const pinNum = getPinNumber(thread.id) || index + 1;
      button.innerHTML = `<span>${thread.status === 'resolved' ? '✓' : pinNum}</span>`;
      button.setAttribute('aria-label', recovery.status === 'lost' ? '找不到標注位置' : `標注 ${pinNum}，可拖曳調整位置`);
      button.draggable = false;
      button.dataset.pinId = pin.id;
      button.setAttribute('aria-describedby', `wc-pin-preview-${pin.id}`);
      button.addEventListener('pointerenter', () => schedulePinPreview(pin.id));
      button.addEventListener('pointerleave', () => schedulePreviewClose());
      button.addEventListener('focus', () => schedulePinPreview(pin.id));
      button.addEventListener('blur', () => schedulePreviewClose());
      button.addEventListener('pointerdown', (event) => beginPinPointer(event, pin, button));
      button.addEventListener('pointermove', handlePinPointerMove);
      button.addEventListener('pointerup', handlePinPointerUp);
      button.addEventListener('pointercancel', cancelPinDrag);
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        if (state.suppressPinClickId === pin.id) return;
        closePinPreview();
        state.selectedThreadId = thread.id;
        state.editingCommentId = null;
        state.sidebarOpen = true;
        state.sidebarCollapsed = false;
        state.draft = null;
        state.commentMode = false;
        render();
        scrollSelectedThreadIntoView();
      });
      layer.append(button);
    });

    if (state.draft) {
      const draft = document.createElement('button');
      draft.className = 'wc-pin wc-pin-draft is-selected';
      draft.type = 'button';
      draft.style.left = `${state.draft.anchor.viewportPosition.x}px`;
      draft.style.top = `${state.draft.anchor.viewportPosition.y}px`;
      draft.innerHTML = '<span>+</span>';
      layer.append(draft);
    }
  }

  function schedulePinPreview(pinId) {
    if (state.drag) return;
    clearTimeout(previewCloseTimer);
    clearTimeout(previewOpenTimer);
    if (state.previewPinId === pinId) return;
    previewOpenTimer = setTimeout(() => {
      if (state.drag) return;
      state.previewPinId = pinId;
      renderPinPreview();
    }, 150);
  }

  function schedulePreviewClose(delay = 120) {
    clearTimeout(previewOpenTimer);
    clearTimeout(previewCloseTimer);
    previewCloseTimer = setTimeout(() => {
      state.previewPinId = null;
      renderPinPreview();
    }, delay);
  }

  function closePinPreview() {
    clearTimeout(previewOpenTimer);
    clearTimeout(previewCloseTimer);
    state.previewPinId = null;
    renderPinPreview();
  }

  function renderPinPreview() {
    const layer = shadow.querySelector('[data-preview-layer]');
    layer.innerHTML = '';
    if (!state.previewPinId || state.drag) return;

    const pin = state.sessionData.pins.find((p) => p.id === state.previewPinId);
    const thread = pin && state.sessionData.threads.find((t) => t.id === pin.threadId);
    const recovery = pin && state.recovery[pin.id];
    if (!pin || !thread || !recovery || !recovery.viewportPosition) return;

    const popover = buildPinPopover(thread, recovery);
    layer.append(popover);

    window.requestAnimationFrame(() => {
      if (!popover.isConnected) return;
      const rect = popover.getBoundingClientRect();
      const preferredLeft = recovery.viewportPosition.x + 20;
      const flippedLeft = recovery.viewportPosition.x - rect.width - 20;
      const left = preferredLeft + rect.width <= window.innerWidth - 12 ? preferredLeft : flippedLeft;
      popover.style.left = `${clamp(left, 12, window.innerWidth - rect.width - 12)}px`;
      popover.style.top = `${clamp(recovery.viewportPosition.y - 18, 12, window.innerHeight - rect.height - 12)}px`;
    });
  }

  function buildPinPopover(thread, recovery) {
    const allComments = state.sessionData.comments.filter((c) => c.threadId === thread.id);
    const original = allComments.find((c) => !c.parentCommentId) || allComments[0];
    const replies = allComments.filter((c) => c.parentCommentId);
    const pinNum = getPinNumber(thread.id);

    const popover = document.createElement('div');
    popover.className = 'wc-pin-popover';
    popover.style.left = `${recovery.viewportPosition.x + 20}px`;
    popover.style.top = `${recovery.viewportPosition.y - 18}px`;

    const isResolved = thread.status === 'resolved';
    const header = document.createElement('div');
    header.className = 'wc-popover-header';
    header.innerHTML = `
      <span class="wc-popover-title">Comment${pinNum ? ` #${pinNum}` : ''}</span>
      <div class="wc-popover-header-actions">
        <button data-action="resolve" title="${isResolved ? '重新開啟' : '標記已解決'}" class="${isResolved ? 'is-resolved' : ''}">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5l3 3 6-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button data-action="close" title="關閉">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1 1l9 9M10 1L1 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        </button>
      </div>
    `;

    const commentsEl = document.createElement('div');
    commentsEl.className = 'wc-popover-comments';
    if (original) commentsEl.append(buildPopoverComment(original, true));
    replies.forEach((reply) => commentsEl.append(buildPopoverComment(reply, false)));

    const replyForm = document.createElement('form');
    replyForm.className = 'wc-popover-reply';
    replyForm.innerHTML = `
      <div class="wc-avatar">本</div>
      <div class="wc-popover-input-wrap">
        <textarea name="body" rows="1" placeholder="Reply"></textarea>
        <button type="submit" class="wc-submit-btn" disabled title="送出">${SUBMIT_ICON}</button>
      </div>
    `;

    const replyTextarea = replyForm.querySelector('textarea');
    bindSubmitEnabled(replyTextarea, replyForm.querySelector('button[type="submit"]'));
    bindAdaptiveCommentTextarea(replyTextarea);

    popover.append(header, commentsEl, replyForm);

    popover.addEventListener('pointerenter', () => clearTimeout(previewCloseTimer));
    popover.addEventListener('pointerleave', () => {
      if (!popover.matches(':focus-within')) schedulePreviewClose();
    });
    popover.addEventListener('focusin', () => clearTimeout(previewCloseTimer));
    popover.addEventListener('focusout', () => {
      if (!popover.matches(':focus-within')) schedulePreviewClose(500);
    });

    header.querySelector('[data-action="resolve"]').addEventListener('click', async () => {
      const wasResolved = thread.status === 'resolved';
      await store.setThreadResolved(thread.id, !wasResolved);
      await refreshData();
      if (!state.includeResolved && !wasResolved) {
        state.previewPinId = null;
      }
      render();
      updateBadge();
    });

    header.querySelector('[data-action="close"]').addEventListener('click', () => closePinPreview());

    replyForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const textarea = replyForm.querySelector('textarea');
      const body = textarea.value.trim();
      if (!body) return;
      const submitBtn = replyForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      await store.addReply(thread.id, body);
      textarea.value = '';
      await refreshData();
      renderPinPreview();
      focusReplyTextarea('.wc-popover-reply');
      showToast('回覆已送出。');
    });

    return popover;
  }

  function isOwnComment(comment) {
    return Boolean(state.accessRole.actorId) && comment.authorId === state.accessRole.actorId;
  }

  function buildPopoverComment(comment, isOriginal) {
    const article = document.createElement('article');
    article.className = `wc-popover-comment${isOriginal ? ' is-original' : ''}`;

    if (state.editingCommentId === comment.id) {
      article.innerHTML = `
        <div class="wc-avatar">${escapeHtml(comment.authorInitials || '本')}</div>
        <form class="wc-popover-edit-form">
          <textarea name="body" rows="3">${escapeHtml(comment.body)}</textarea>
          <div class="wc-popover-edit-actions">
            <button data-action="cancel" type="button">取消</button>
            <button type="submit" class="wc-submit-btn" disabled aria-label="儲存">${SUBMIT_ICON}</button>
          </div>
        </form>
      `;

      const form = article.querySelector('form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = new FormData(form).get('body').toString().trim();
        if (!body) return;
        await store.updateComment(comment.id, body);
        state.editingCommentId = null;
        await refreshData();
        renderPinPreview();
      });

      article.querySelector('[data-action="cancel"]').addEventListener('click', () => {
        state.editingCommentId = null;
        renderPinPreview();
      });

      setTimeout(() => {
        const ta = article.querySelector('textarea');
        if (ta) {
          ta.focus();
          bindSubmitEnabled(ta, article.querySelector('button[type="submit"]'));
          bindAdaptiveCommentTextarea(ta);
        }
      }, 0);

      return article;
    }

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
        const msg = isOriginal
          ? '刪除這則標注會一併移除 pin、留言串與所有回覆。確定刪除？'
          : '確定刪除這則回覆？';
        if (!window.confirm(msg)) return;
        await store.deleteComment(comment.id);
        state.editingCommentId = null;
        if (isOriginal) state.previewPinId = null;
        await refreshData();
        render();
        updateBadge();
      });
    }

    return article;
  }

  function beginPinPointer(event, pin, button) {
    if (event.button !== 0) return;
    state.drag = {
      pinId: pin.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      started: false,
      button,
      anchorRevision: pin.anchorRevision || 1,
    };
    button.setPointerCapture(event.pointerId);
  }

  function handlePinPointerMove(event) {
    const drag = state.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.started && distance < 1) return;

    if (!drag.started) {
      drag.started = true;
      closePinPreview();
      drag.button.classList.add('is-dragging');
    }

    event.preventDefault();
    event.stopPropagation();
    drag.currentX = clamp(event.clientX, 8, window.innerWidth - 8);
    drag.currentY = clamp(event.clientY, 8, window.innerHeight - 8);
    drag.button.style.left = `${drag.currentX}px`;
    drag.button.style.top = `${drag.currentY}px`;
  }

  async function handlePinPointerUp(event) {
    const drag = state.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.button.hasPointerCapture(event.pointerId)) drag.button.releasePointerCapture(event.pointerId);
    if (!drag.started) {
      state.drag = null;
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    state.suppressPinClickId = drag.pinId;
    state.drag = null;
    drag.button.classList.remove('is-dragging');
    drag.button.classList.add('is-saving');

    const previousDisplay = root.style.display;
    root.style.display = 'none';
    const target = document.elementFromPoint(drag.currentX, drag.currentY);
    root.style.display = previousDisplay;

    const point = { clientX: drag.currentX, clientY: drag.currentY };
    const isPageTarget = !target || target === document.documentElement || target === document.body;
    const anchor = isPageTarget
      ? store.createPageAnchor(point, state.pageContext)
      : store.createAnchor(target, point, state.pageContext);
    anchor.manualPosition = true;

    try {
      await store.updatePinAnchor(drag.pinId, anchor, drag.anchorRevision);
      await refreshData();
      render();
      showToast('標注位置已更新。');
    } catch (error) {
      await refreshData();
      render();
      showToast(error && error.code === 'anchor_revision_conflict' ? '位置已被更新，已載入最新位置。' : '無法儲存位置，已恢復原本位置。');
    } finally {
      setTimeout(() => {
        if (state.suppressPinClickId === drag.pinId) state.suppressPinClickId = null;
      }, 0);
    }
  }

  function cancelPinDrag(event) {
    const drag = state.drag;
    if (!drag || (event && event.pointerId != null && drag.pointerId !== event.pointerId)) return;
    if (drag.button && drag.button.hasPointerCapture(drag.pointerId)) drag.button.releasePointerCapture(drag.pointerId);
    state.suppressPinClickId = drag.started ? drag.pinId : null;
    state.drag = null;
    renderPins();
    renderPinPreview();
    if (event && event.preventDefault) event.preventDefault();
    if (state.suppressPinClickId) {
      setTimeout(() => {
        state.suppressPinClickId = null;
      }, 0);
    }
  }

  function renderDraftComposer() {
    const layer = shadow.querySelector('[data-draft-layer]');
    layer.innerHTML = '';
    if (!state.draft) return;

    const composer = document.createElement('form');
    const x = clamp(state.draft.anchor.viewportPosition.x + 18, 12, window.innerWidth - 356);
    const y = clamp(state.draft.anchor.viewportPosition.y - 10, 12, window.innerHeight - 190);
    composer.className = 'wc-floating-composer';
    composer.style.left = `${x}px`;
    composer.style.top = `${y}px`;
    composer.innerHTML = `
      <div class="wc-composer-header">
        <div class="wc-avatar">本</div>
        <strong>新增標注</strong>
        <button data-action="cancel" type="button" title="取消">×</button>
      </div>
      <textarea name="body" rows="3" autofocus placeholder="請輸入你的意見..."></textarea>
      <div class="wc-composer-footer">
        <button type="submit" class="wc-submit-btn" disabled aria-label="送出">${SUBMIT_ICON}</button>
      </div>
    `;

    composer.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      state.draft = null;
      render();
    });

    composer.addEventListener('submit', async (event) => {
      event.preventDefault();
      const textarea = composer.querySelector('textarea');
      const body = textarea.value.trim();
      if (!body) return;
      const button = composer.querySelector('button[type="submit"]');
      button.disabled = true;
      await store.createThread(state.sessionId, state.pageContext, state.draft.anchor, body);
      state.editingCommentId = null;
      state.draft = null;
      state.commentMode = true;
      state.selectedThreadId = null;
      await refreshData();
      render();
      showToast('標注已送出，可繼續點擊頁面新增標注。');
    });

    const draftTextarea = composer.querySelector('textarea');
    bindSubmitEnabled(draftTextarea, composer.querySelector('button[type="submit"]'));
    bindAdaptiveCommentTextarea(draftTextarea);

    layer.append(composer);
    setTimeout(() => {
      const textarea = composer.querySelector('textarea');
      if (textarea) textarea.focus();
    }, 0);
  }

  function renderToolbar() {
    const toolbar = shadow.querySelector('[data-toolbar]');
    const commentLabel = state.commentMode ? '標註中' : '標註';
    const listLabel = state.sidebarOpen ? '隱藏留言列表' : '顯示留言列表';
    const listIcon = state.sidebarOpen ? TOOLBAR_EYE_CLOSED_ICON : TOOLBAR_EYE_OPEN_ICON;

    toolbar.innerHTML = `
      <button class="wc-toolbar-zone wc-toolbar-button is-annotation ${state.commentMode ? 'is-active' : ''}" data-action="toggle-comment" type="button" aria-pressed="${state.commentMode ? 'true' : 'false'}">
        ${TOOLBAR_ANNOTATION_ICON}
        <span>${commentLabel}</span>
      </button>
      <span class="wc-toolbar-divider" aria-hidden="true"></span>
      <button class="wc-toolbar-zone wc-toolbar-button is-list" data-action="toggle-sidebar" type="button" aria-pressed="${state.sidebarOpen ? 'true' : 'false'}">
        ${listIcon}
        <span>${listLabel}</span>
      </button>
      <span class="wc-toolbar-divider" aria-hidden="true"></span>
      <button class="wc-toolbar-zone wc-toolbar-close" data-action="deactivate" type="button" aria-label="關閉 WebComment">
        <span aria-hidden="true">×</span>
      </button>
    `;

    toolbar.querySelector('[data-action="toggle-comment"]').addEventListener('click', () => {
      state.commentMode = !state.commentMode;
      state.draft = null;
      render();
      if (state.commentMode) showToast('請點擊頁面上要標註的位置。');
    });

    toolbar.querySelector('[data-action="toggle-sidebar"]').addEventListener('click', () => {
      state.sidebarOpen = !state.sidebarOpen;
      render();
    });

    toolbar.querySelector('[data-action="deactivate"]').addEventListener('click', () => {
      deactivateOverlay();
    });
  }

  function renderSidebar() {
    const sidebar = shadow.querySelector('[data-sidebar]');
    sidebar.hidden = !state.sidebarOpen;
    if (!state.sidebarOpen) return;

    const collapsed = state.sidebarCollapsed;
    sidebar.classList.toggle('is-collapsed', collapsed);

    const COLLAPSE_SVG = collapsed
      ? `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 5l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 9l4-4 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    sidebar.innerHTML = `
      <header class="wc-sidebar-header">
        <h2>WebComments</h2>
        <button data-action="toggle-collapse" class="wc-ghost-button" type="button" title="${collapsed ? '展開列表' : '收合列表'}">${COLLAPSE_SVG}</button>
      </header>
      ${!collapsed ? `
      <div class="wc-sidebar-tools">
        <div class="wc-search-wrap">
          <svg class="wc-search-icon" width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="5.5" cy="5.5" r="4" stroke="currentColor" stroke-width="1.4"/><path d="M9 9l2.5 2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          <input data-search type="search" placeholder="搜尋留言" value="${escapeAttribute(state.searchQuery)}" autocomplete="off" />
          ${state.searchQuery ? '<button data-action="clear-search" type="button" title="清除搜尋"><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button>' : ''}
        </div>
      </div>
      <div class="wc-sidebar-summary">
        <div class="wc-sidebar-summary-counts" data-summary></div>
        <button data-action="toggle-resolved" type="button">
          ${state.includeResolved ? '返回未解決' : '查看已解決'}
        </button>
      </div>
      <div class="wc-thread-list" data-thread-list></div>
      ` : ''}
    `;

    sidebar.querySelector('[data-action="toggle-collapse"]').addEventListener('click', () => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      render();
    });

    if (!collapsed) {
      sidebar.querySelector('[data-action="toggle-resolved"]').addEventListener('click', async () => {
        state.includeResolved = !state.includeResolved;
        await refreshData();
        render();
        updateBadge();
      });

      const searchInput = sidebar.querySelector('[data-search]');
      searchInput.addEventListener('input', (event) => {
        state.searchQuery = event.target.value;
        renderThreadList();
        const clearBtn = sidebar.querySelector('[data-action="clear-search"]');
        if (state.searchQuery && !clearBtn) {
          const wrap = sidebar.querySelector('.wc-search-wrap');
          const btn = document.createElement('button');
          btn.dataset.action = 'clear-search';
          btn.type = 'button';
          btn.title = '清除搜尋';
          btn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
          btn.addEventListener('click', () => {
            state.searchQuery = '';
            searchInput.value = '';
            searchInput.focus();
            btn.remove();
            renderThreadList();
          });
          wrap.append(btn);
        } else if (!state.searchQuery && clearBtn) {
          clearBtn.remove();
        }
      });

      const existingClearBtn = sidebar.querySelector('[data-action="clear-search"]');
      if (existingClearBtn) {
        existingClearBtn.addEventListener('click', () => {
          state.searchQuery = '';
          searchInput.value = '';
          searchInput.focus();
          existingClearBtn.remove();
          renderThreadList();
        });
      }

      renderThreadList();

      if (state.searchQuery) {
        searchInput.focus();
        searchInput.setSelectionRange(state.searchQuery.length, state.searchQuery.length);
      }
    }
  }

  function renderThreadList() {
    if (!shadow) return;
    const sidebar = shadow.querySelector('[data-sidebar]');
    if (!sidebar) return;

    const list = sidebar.querySelector('[data-thread-list]');
    const summaryEl = sidebar.querySelector('[data-summary]');
    if (!list) return;

    const openCount = state.sessionData.threads.filter((t) => t.status !== 'resolved').length;
    const visibleItems = getThreadSummaries();
    const query = state.searchQuery.trim();

    if (summaryEl) {
      summaryEl.innerHTML = query
        ? `<span>${visibleItems.length} 筆結果</span><span>${openCount} 未解決</span>`
        : `<span>${visibleItems.length} 則標注</span><span>${openCount} 未解決</span>`;
    }

    list.innerHTML = '';

    if (!visibleItems.length) {
      list.innerHTML = `
        <div class="wc-empty-state">
          <strong>${query ? `沒有符合「${escapeHtml(query)}」的標注` : '目前沒有標注'}</strong>
          <span>${query ? '請嘗試其他關鍵字。' : '點擊「標注」後在網頁任一位置留下意見。'}</span>
        </div>
      `;
      return;
    }

    visibleItems.forEach((item) => {
      list.append(renderThreadListItem(item));
    });
  }

  function renderThreadListItem(item) {
    const article = document.createElement('article');
    const isSelected = state.selectedThreadId === item.thread.id;
    article.className = `wc-thread-item ${isSelected ? 'is-selected' : ''}`;
    const isEditingThis = state.editingCommentId === item.original.id;
    article.dataset.threadId = item.thread.id;
    article.innerHTML = `
      <button class="wc-thread-main" type="button">
        <div class="wc-thread-topline">
          <span class="wc-thread-number">${item.thread.status === 'resolved' ? '✓' : `#${getPinNumber(item.thread.id) || ''}`}</span>
          <div class="wc-avatar">${escapeHtml(item.original.authorInitials || '本')}</div>
          <div class="wc-thread-author-meta">
            <strong>${highlightText(item.original.authorName || '使用者', state.searchQuery.trim())}</strong>
            <span>${store.formatRelativeTime(item.original.createdAt)}</span>
          </div>
          <span class="wc-thread-status ${item.thread.status === 'resolved' ? 'is-resolved' : ''}">${item.thread.status === 'resolved' ? '已解決' : '未解決'}</span>
        </div>
        ${!isEditingThis ? `<p>${highlightText(item.original.body, state.searchQuery.trim())}</p>` : ''}
      </button>
      <div class="wc-thread-footer">
        <button data-action="open-thread" class="wc-thread-reply-summary" type="button">
          ${item.replies.length ? `${item.replies.length} 則回覆` : '尚無回覆'}
        </button>
      </div>
      <div class="wc-thread-detail" ${isSelected ? '' : 'hidden'}></div>
    `;

    const selectThread = () => {
      state.selectedThreadId = item.thread.id;
      state.editingCommentId = null;
      state.draft = null;
      state.commentMode = false;
      render();
    };

    article.querySelector('.wc-thread-main').addEventListener('click', selectThread);
    article.querySelector('[data-action="open-thread"]').addEventListener('click', selectThread);
    article.querySelector('.wc-thread-footer').append(renderOriginalControls(item));

    const detail = article.querySelector('.wc-thread-detail');
    if (isSelected) {
      detail.append(renderThreadDetail(item));
    }

    return article;
  }

  function renderThreadDetail(item) {
    const node = document.createElement('div');
    node.className = 'wc-thread-detail-inner';

    // 編輯原始留言時：只顯示 edit form，不顯示 reply form
    if (state.editingCommentId === item.original.id) {
      const form = document.createElement('form');
      form.className = 'wc-edit-form';
      form.innerHTML = `
        <textarea name="body" rows="4">${escapeHtml(item.original.body)}</textarea>
        <div class="wc-reply-actions">
          <button data-action="cancel-edit" type="button">取消</button>
          <button type="submit" class="wc-submit-btn" disabled aria-label="儲存">${SUBMIT_ICON}</button>
        </div>
      `;
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const body = new FormData(form).get('body').toString().trim();
        if (!body) return;
        await store.updateComment(item.original.id, body);
        state.editingCommentId = null;
        await refreshData();
        render();
      });
      form.querySelector('[data-action="cancel-edit"]').addEventListener('click', () => {
        state.editingCommentId = null;
        render();
      });
      setTimeout(() => {
        const ta = form.querySelector('textarea');
        if (ta) {
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
          bindSubmitEnabled(ta, form.querySelector('button[type="submit"]'));
          bindAdaptiveCommentTextarea(ta);
        }
      }, 0);
      node.append(form);
      return node;
    }

    // 一般模式：回覆列表 → 回覆表單

    let repliesSection = null;
    if (item.replies.length) {
      repliesSection = document.createElement('section');
      repliesSection.className = 'wc-replies-section';
      repliesSection.innerHTML = `<p class="wc-section-label">回覆 ${item.replies.length}</p>`;
      const replies = document.createElement('div');
      replies.className = 'wc-replies';
      item.replies.forEach((reply) => replies.append(renderEditableComment(reply, false, item.thread)));
      repliesSection.append(replies);
    }

    const form = document.createElement('form');
    form.className = 'wc-reply-form';
    form.innerHTML = `
      <div class="wc-avatar">本</div>
      <div class="wc-popover-input-wrap">
        <textarea name="body" rows="1" placeholder="回覆這則標注..."></textarea>
        <button type="submit" class="wc-submit-btn" disabled title="送出">${SUBMIT_ICON}</button>
      </div>
    `;

    const replyTextarea = form.querySelector('textarea');
    bindSubmitEnabled(replyTextarea, form.querySelector('button[type="submit"]'));
    bindAdaptiveCommentTextarea(replyTextarea);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const body = new FormData(form).get('body').toString().trim();
      if (!body) return;
      await store.addReply(item.thread.id, body);
      replyTextarea.value = '';
      replyTextarea.dispatchEvent(new Event('input'));
      await refreshData();
      state.editingCommentId = null;
      render();
      focusReplyTextarea('.wc-reply-form');
    });

    if (repliesSection) node.append(repliesSection);
    node.append(form);
    return node;
  }

  function renderOriginalControls(item) {
    const node = document.createElement('div');
    node.className = 'wc-original-controls';
    const isResolved = item.thread.status === 'resolved';
    const CHECK_SVG = `<svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.5 7.5l3 3 6-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const RETURN_SVG = `<svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M5 3L2 6l3 3M2 6h7a3 3 0 010 6H6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
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
      await store.setThreadResolved(item.thread.id, !isResolved);
      await refreshData();
      if (!state.includeResolved && !isResolved) {
        state.selectedThreadId = null;
      }
      state.editingCommentId = null;
      render();
      updateBadge();
    });
    return node;
  }

  function renderEditableComment(comment, isOriginal, thread) {
    const node = document.createElement('article');
    const isEditing = state.editingCommentId === comment.id;
    node.className = `wc-comment wc-comment-editable ${isOriginal ? 'is-original' : ''}`;

    if (isEditing) {
      node.innerHTML = `
        <div class="wc-avatar">${escapeHtml(comment.authorInitials || '本')}</div>
        <form class="wc-edit-form">
          <textarea name="body" rows="3">${escapeHtml(comment.body)}</textarea>
          <div class="wc-reply-actions">
            <button data-action="cancel-edit" type="button">取消</button>
            <button type="submit" class="wc-submit-btn" disabled aria-label="儲存">${SUBMIT_ICON}</button>
          </div>
        </form>
      `;

      const form = node.querySelector('form');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const body = new FormData(form).get('body').toString().trim();
        if (!body) return;
        await store.updateComment(comment.id, body);
        state.editingCommentId = null;
        await refreshData();
        render();
      });

      node.querySelector('[data-action="cancel-edit"]').addEventListener('click', () => {
        state.editingCommentId = null;
        render();
      });

      setTimeout(() => {
        const textarea = node.querySelector('textarea');
        if (textarea) {
          textarea.focus();
          bindSubmitEnabled(textarea, node.querySelector('button[type="submit"]'));
          bindAdaptiveCommentTextarea(textarea);
        }
      }, 0);
      return node;
    }

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
        const message = isOriginal ? '刪除這則標注會一併移除 pin、留言串與所有回覆。確定刪除？' : '確定刪除這則回覆？';
        if (!window.confirm(message)) return;
        await store.deleteComment(comment.id);
        state.editingCommentId = null;
        state.selectedThreadId = isOriginal ? null : thread.id;
        await refreshData();
        render();
        updateBadge();
      });
    }

    return node;
  }

  function getPinNumber(threadId) {
    const sorted = [...state.sessionData.threads]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const idx = sorted.findIndex((t) => t.id === threadId);
    return idx >= 0 ? idx + 1 : null;
  }

  function getThreadSummaries() {
    const query = state.searchQuery.trim().toLowerCase();
    return state.sessionData.threads
      .map((thread) => {
        const pin = state.sessionData.pins.find((candidate) => candidate.threadId === thread.id);
        const comments = state.sessionData.comments.filter((comment) => comment.threadId === thread.id);
        const original = comments.find((comment) => !comment.parentCommentId) || comments[0];
        const replies = comments.filter((comment) => comment.parentCommentId);
        return {
          thread,
          pin,
          original,
          replies,
          recovery: pin ? state.recovery[pin.id] : null,
        };
      })
      .filter((item) => item.pin && item.original)
      .filter((item) => {
        if (!query) return true;
        const allComments = [item.original, ...item.replies];
        const bodies = allComments.map((c) => c.body).join(' ');
        const authors = allComments.map((c) => c.authorName || '').join(' ');
        const haystack = `${bodies} ${authors}`.toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => b.thread.updatedAt.localeCompare(a.thread.updatedAt));
  }

  function handleDocumentClick(event) {
    if (!state.commentMode) return;
    if (event.composedPath().includes(root)) return;
    if (event.target.closest && event.target.closest(`#${rootId}`)) return;

    event.preventDefault();
    event.stopPropagation();

    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target || target === document.documentElement || target === document.body) return;

    const anchor = store.createAnchor(target, event, state.pageContext);
    state.draft = {
      anchor,
      contextLabel: target.getAttribute('aria-label') || target.innerText || target.textContent || target.tagName,
    };
    state.selectedThreadId = null;
    render();
  }

  function handleKeydown(event) {
    if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
      const active = shadow && shadow.activeElement;
      if (active && active.tagName === 'TEXTAREA') {
        const now = Date.now();
        const last = active._wcLastEnter || 0;
        if (now - last < 500) {
          event.preventDefault();
          active._wcLastEnter = 0;
          const form = active.closest('form');
          if (form) form.requestSubmit();
          return;
        }
        active._wcLastEnter = now;
      }
    }

    if (event.key === 'Escape') {
      if (state.drag) {
        cancelPinDrag(event);
        return;
      }
      if (state.previewPinId) {
        closePinPreview();
        return;
      }
      if (state.draft) {
        state.draft = null;
        render();
        return;
      }
      if (state.editingCommentId) {
        state.editingCommentId = null;
        render();
        return;
      }
      if (state.selectedThreadId) {
        state.selectedThreadId = null;
        render();
        return;
      }
      if (state.commentMode) {
        state.commentMode = false;
        render();
      }
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      const active = shadow.activeElement;
      const form = active && active.closest ? active.closest('form') : null;
      if (form) form.requestSubmit();
    }
  }

  function handleRouteChange() {
    if (!state.overlayActive) return;
    if (state.drag) cancelPinDrag();
    closePinPreview();
    clearTimeout(routeChangeTimer);
    routeChangeTimer = setTimeout(async () => {
      if (!state.overlayActive) return;
      state.selectedThreadId = null;
      state.draft = null;
      await refreshData();
      render();
      updateBadge();
    }, 80);
  }

  function patchHistory() {
    ['pushState', 'replaceState'].forEach((method) => {
      const original = history[method];
      if (original.__webCommentPatched) return;
      const patched = function patchedHistory() {
        const result = original.apply(this, arguments);
        window.dispatchEvent(new Event('webcomment-route-change'));
        return result;
      };
      patched.__webCommentPatched = true;
      history[method] = patched;
      historyRestorers.push(() => {
        if (history[method] === patched) history[method] = original;
      });
    });
    listen(window, 'webcomment-route-change', handleRouteChange);
  }

  function restoreHistory() {
    while (historyRestorers.length) historyRestorers.pop()();
  }

  function scrollSelectedThreadIntoView() {
    setTimeout(() => {
      if (!state.overlayActive || !shadow) return;
      const selected = shadow.querySelector('.wc-thread-item.is-selected');
      if (selected) selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 0);
  }

  function showToast(message) {
    if (!state.overlayActive || !shadow) return;
    const toast = shadow.querySelector('[data-toast]');
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.hidden = true;
    }, 2200);
  }


  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function highlightText(text, query) {
    if (!query || !text) return escapeHtml(text || '');
    const lower = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const parts = [];
    let last = 0;
    let idx = lower.indexOf(lowerQuery, last);
    while (idx !== -1) {
      parts.push(escapeHtml(text.slice(last, idx)));
      parts.push(`<mark class="wc-highlight">${escapeHtml(text.slice(idx, idx + query.length))}</mark>`);
      last = idx + query.length;
      idx = lower.indexOf(lowerQuery, last);
    }
    parts.push(escapeHtml(text.slice(last)));
    return parts.join('');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
  }

  function bindSubmitEnabled(textarea, button) {
    const sync = () => { button.disabled = !textarea.value.trim(); };
    textarea.addEventListener('input', sync);
    sync();
  }

  function focusReplyTextarea(formSelector) {
    setTimeout(() => {
      const textarea = shadow?.querySelector(`${formSelector} textarea[name="body"]`);
      if (textarea) textarea.focus();
    }, 0);
  }

  function bindAdaptiveCommentTextarea(textarea) {
    const surface = textarea.closest('.wc-popover-input-wrap') || textarea;
    const sync = () => {
      const isMultiline = textarea.value.includes('\n');
      surface.classList.toggle('is-multiline', isMultiline);
      textarea.classList.toggle('is-multiline', isMultiline);
    };

    textarea.classList.add('wc-comment-textarea');
    textarea.addEventListener('input', sync);
    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.shiftKey) {
        surface.classList.add('is-multiline');
        textarea.classList.add('is-multiline');
      }
    });
    sync();
  }

  function styles() {
    return `
      :host {
        all: initial;
        --brand: #534ae8;
        --brand-strong: #4338ca;
        --panel: #232323;
        --panel-soft: #2d2d2d;
        --panel-softer: #383838;
        --panel-text: #f4f4f5;
        --panel-muted: #a1a1aa;
        --panel-border: #3f3f46;
        --surface: #ffffff;
        --text: #111827;
        --muted: #6b7280;
        --border: #e5e7eb;
        --success: #22c55e;
        --warning: #d97706;
        --danger: #dc2626;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * { box-sizing: border-box; }
      button, input, textarea { font: inherit; }

      .wc-app {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 2147483646;
        color: var(--text);
      }

      .wc-pin-layer,
      .wc-draft-layer,
      .wc-preview-layer {
        position: fixed;
        inset: 0;
        pointer-events: none;
      }

      .wc-pin {
        position: fixed;
        display: grid;
        box-sizing: border-box;
        width: 24px;
        height: 24px;
        place-items: center;
        transform: translate(-50%, -50%);
        border: 2px solid #ffffff;
        border-radius: 50% 50% 50% 4px;
        margin: 0;
        padding: 0;
        color: #ffffff;
        background: var(--brand);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.24);
        appearance: none;
        cursor: grab;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1;
        pointer-events: auto;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
      }

      .wc-pin span {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: auto;
        height: auto;
        margin: 0;
        padding: 0;
        font-size: 10px;
        font-weight: 800;
        line-height: 1;
        text-align: center;
      }

      .wc-pin:hover,
      .wc-pin.is-selected {
        transform: translate(-50%, -50%) scale(1.18);
        box-shadow: 0 0 0 5px rgba(83, 74, 232, 0.22), 0 7px 18px rgba(0, 0, 0, 0.28);
      }

      .wc-pin.is-dragging {
        transform: translate(-50%, -50%) scale(1.12);
        box-shadow: 0 10px 26px rgba(0, 0, 0, 0.36);
        cursor: grabbing;
        transition: none;
      }

      .wc-pin.is-saving::after {
        position: absolute;
        inset: -6px;
        border: 2px solid rgba(83, 74, 232, 0.28);
        border-top-color: var(--brand);
        border-radius: 50%;
        content: '';
        animation: wc-spin 0.7s linear infinite;
      }

      .wc-pin-resolved {
        background: #64748b;
      }

      .wc-pin-recovered,
      .wc-pin-approximate {
        background: var(--warning);
      }

      .wc-pin-lost {
        background: var(--danger);
      }

      .wc-pin-draft {
        background: var(--brand);
        border-style: dashed;
      }

      .wc-pin-popover {
        position: fixed;
        display: grid;
        width: min(320px, calc(100vw - 24px));
        border: 1px solid var(--panel-border);
        border-radius: 10px;
        overflow: hidden;
        color: var(--panel-text);
        background: var(--panel);
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
        pointer-events: auto;
      }

      .wc-popover-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 9px 10px 9px 14px;
        border-bottom: 1px solid var(--panel-border);
      }

      .wc-popover-title {
        font-size: 11px;
        font-weight: 700;
        color: var(--panel-muted);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .wc-popover-header-actions {
        display: flex;
        gap: 2px;
      }

      .wc-popover-header-actions button {
        display: grid;
        width: 26px;
        height: 26px;
        place-items: center;
        border: 0;
        border-radius: 6px;
        color: var(--panel-muted);
        background: transparent;
        cursor: pointer;
      }

      .wc-popover-header-actions button:hover {
        color: var(--panel-text);
        background: var(--panel-soft);
      }

      .wc-popover-header-actions button.is-resolved {
        color: #86efac;
      }

      .wc-popover-comments {
        max-height: 300px;
        overflow-y: auto;
        padding: 12px 14px;
        display: grid;
        gap: 16px;
      }

      .wc-popover-comment {
        display: grid;
        grid-template-columns: 26px 1fr;
        gap: 8px;
      }

      .wc-popover-comment-body {
        min-width: 0;
      }

      .wc-popover-comment-meta {
        display: flex;
        align-items: center;
        gap: 5px;
        margin-bottom: 3px;
      }

      .wc-popover-comment-meta strong {
        font-size: 12px;
        color: var(--panel-text);
      }

      .wc-popover-comment-meta > span {
        flex: 1;
        font-size: 11px;
        color: var(--panel-muted);
      }

      .wc-popover-comment-actions {
        display: flex;
        gap: 2px;
        opacity: 0;
      }

      .wc-popover-comment:hover .wc-popover-comment-actions {
        opacity: 1;
      }

      .wc-popover-comment-actions button {
        border: 0;
        border-radius: 4px;
        padding: 2px 6px;
        color: var(--panel-muted);
        background: transparent;
        cursor: pointer;
        font-size: 10px;
      }

      .wc-popover-comment-actions button:hover {
        color: var(--panel-text);
        background: var(--panel-softer);
      }

      .wc-popover-comment p {
        margin: 0;
        font-size: 12px;
        line-height: 18px;
        color: var(--panel-text);
        white-space: pre-wrap;
      }

      .wc-popover-reply {
        display: grid;
        grid-template-columns: 26px 1fr;
        gap: 8px;
        align-items: center;
        padding: 10px 14px;
      }

      .wc-popover-reply:has(.is-multiline) {
        align-items: flex-end;
      }

      .wc-popover-input-wrap {
        display: flex;
        align-items: center;
        gap: 6px;
        border: 1px solid var(--panel-border);
        border-radius: 8px;
        padding: 0 6px 0 12px;
        background: var(--panel-soft);
        transition: padding 120ms ease;
      }

      .wc-popover-input-wrap.is-multiline {
        align-items: flex-end;
        padding: 7px 7px 7px 10px;
      }

      .wc-popover-input-wrap:focus-within {
        border-color: var(--brand);
      }

      .wc-popover-input-wrap textarea {
        flex: 1;
        border: 0;
        background: transparent;
        color: var(--panel-text);
        font-size: 12px;
        outline: none;
        padding: 7px 0;
        resize: none;
        min-height: 30px;
        max-height: 96px;
        overflow-y: auto;
        line-height: 1.4;
      }

      .wc-comment-textarea.is-multiline {
        min-height: 72px;
      }

      .wc-popover-input-wrap textarea::placeholder {
        color: var(--panel-muted);
      }

      button.wc-submit-btn {
        display: grid;
        flex: none;
        width: 24px;
        height: 24px;
        place-items: center;
        border: none;
        border-radius: 50%;
        padding: 0;
        color: #ffffff;
        background: var(--brand);
        cursor: pointer;
      }

      button.wc-submit-btn:disabled {
        opacity: 0.4;
        cursor: default;
      }

      .wc-popover-edit-form {
        display: grid;
        gap: 7px;
      }

      .wc-popover-edit-form textarea {
        width: 100%;
        border: 1px solid var(--panel-border);
        border-radius: 7px;
        padding: 8px;
        color: var(--panel-text);
        background: var(--panel-soft);
        outline: none;
        resize: vertical;
        font-size: 12px;
        line-height: 1.5;
      }

      .wc-popover-edit-form textarea:focus {
        border-color: var(--brand);
        box-shadow: 0 0 0 3px rgba(83, 74, 232, 0.18);
      }

      .wc-popover-edit-actions {
        display: flex;
        justify-content: flex-end;
        gap: 6px;
      }

      .wc-popover-edit-actions button {
        border: 1px solid var(--panel-border);
        border-radius: 6px;
        padding: 5px 10px;
        color: var(--panel-text);
        background: var(--panel-soft);
        cursor: pointer;
        font-size: 11px;
      }

      .wc-popover-edit-actions button.wc-submit-btn {
        border: none;
        padding: 0;
      }

      @keyframes wc-spin {
        to { transform: rotate(360deg); }
      }

      .wc-toolbar {
        position: fixed;
        left: 50%;
        bottom: 22px;
        display: flex;
        align-items: center;
        gap: 0;
        max-width: calc(100vw - 32px);
        transform: translateX(-50%);
        border: 1px solid rgba(63, 63, 70, 0.9);
        border-radius: 12px;
        padding: 6px;
        background: rgba(35, 35, 35, 0.96);
        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.25);
        pointer-events: auto;
        backdrop-filter: blur(10px);
      }

      .wc-toolbar-zone {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-width: 0;
        height: 36px;
        border: 0;
        border-radius: 8px;
        color: var(--panel-text);
        background: transparent;
        cursor: pointer;
        font-size: 14px;
        line-height: 20px;
        white-space: nowrap;
      }

      .wc-toolbar-zone svg {
        flex: 0 0 auto;
      }

      .wc-toolbar-zone.is-annotation {
        width: 112px;
      }

      .wc-toolbar-zone.is-list {
        width: 168px;
      }

      .wc-toolbar-zone:hover,
      .wc-toolbar-zone.is-active {
        background: var(--panel-soft);
      }

      .wc-toolbar-zone:focus-visible {
        outline: 2px solid rgba(109, 99, 240, 0.9);
        outline-offset: 2px;
      }

      .wc-toolbar-close {
        width: 48px;
        font-size: 26px;
        line-height: 1;
      }

      .wc-toolbar-divider {
        display: block;
        width: 1px;
        height: 28px;
        margin: 0 6px;
        background: var(--panel-border);
      }

      @media (max-width: 380px) {
        .wc-toolbar {
          left: 8px;
          right: 8px;
          max-width: none;
          transform: none;
        }

        .wc-toolbar-zone.is-annotation {
          flex: 0 0 96px;
          width: 96px;
        }

        .wc-toolbar-zone.is-list {
          flex: 1 1 auto;
          width: auto;
        }

        .wc-toolbar-close {
          flex: 0 0 40px;
          width: 40px;
        }

        .wc-toolbar-divider {
          margin: 0 4px;
        }
      }

      .wc-sidebar {
        position: fixed;
        top: 0;
        right: 0;
        display: grid;
        grid-template-rows: auto auto auto 1fr;
        width: min(360px, calc(100vw - 24px));
        height: 100vh;
        border-left: 1px solid var(--panel-border);
        color: var(--panel-text);
        background: var(--panel);
        box-shadow: -18px 0 42px rgba(0, 0, 0, 0.24);
        pointer-events: auto;
      }

      .wc-sidebar[hidden] {
        display: none;
      }

      .wc-sidebar.is-collapsed {
        height: auto;
        box-shadow: -4px 0 12px rgba(0, 0, 0, 0.16);
      }

      .wc-sidebar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 14px 10px;
      }

      .wc-sidebar h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        line-height: 28px;
      }

      .wc-ghost-button {
        display: grid;
        width: 28px;
        height: 28px;
        place-items: center;
        border: 0;
        border-radius: 6px;
        color: var(--panel-muted);
        background: transparent;
        cursor: pointer;
        font-size: 18px;
      }

      .wc-ghost-button:hover {
        color: var(--panel-text);
        background: var(--panel-soft);
      }

      .wc-sidebar-tools {
        display: grid;
        grid-template-columns: 1fr;
        gap: 0;
        padding: 0 14px 10px;
      }

      .wc-search-wrap {
        position: relative;
        display: flex;
        align-items: center;
        border: 1px solid var(--panel-border);
        border-radius: 7px;
        background: var(--panel-soft);
        transition: border-color 0.15s;
      }

      .wc-search-wrap:focus-within {
        border-color: var(--brand);
        box-shadow: 0 0 0 3px rgba(83, 74, 232, 0.16);
      }

      .wc-search-icon {
        flex: none;
        margin-left: 10px;
        color: var(--panel-muted);
        pointer-events: none;
      }

      .wc-search-wrap input[data-search] {
        flex: 1;
        min-width: 0;
        border: 0;
        background: transparent;
        color: var(--panel-text);
        outline: none;
        padding: 8px 8px 8px 6px;
        font-size: 13px;
      }

      .wc-search-wrap input[data-search]::placeholder {
        color: var(--panel-muted);
      }

      .wc-search-wrap input[data-search]::-webkit-search-cancel-button {
        display: none;
      }

      .wc-search-wrap [data-action="clear-search"] {
        display: grid;
        flex: none;
        width: 24px;
        height: 24px;
        place-items: center;
        margin-right: 4px;
        border: 0;
        border-radius: 50%;
        color: var(--panel-muted);
        background: var(--panel-softer);
        cursor: pointer;
      }

      .wc-search-wrap [data-action="clear-search"]:hover {
        color: var(--panel-text);
      }

      .wc-sidebar-summary {
        display: flex;
        align-items: center;
        gap: 16px;
        border-bottom: 1px solid var(--panel-border);
        padding: 8px 14px;
        color: var(--panel-muted);
        font-size: 12px;
      }

      .wc-sidebar-summary-counts {
        display: flex;
        align-items: center;
        gap: 16px;
        min-width: 0;
      }

      .wc-sidebar-summary button[data-action="toggle-resolved"] {
        margin-left: auto;
        border: 0;
        padding: 0;
        color: #b2d4fc;
        background: transparent;
        cursor: pointer;
        font: inherit;
        text-decoration: underline;
        text-underline-offset: 2px;
        white-space: nowrap;
      }

      .wc-sidebar-summary button[data-action="toggle-resolved"]:hover {
        opacity: 0.82;
      }

      .wc-thread-list {
        overflow: auto;
        min-height: 0;
      }

      .wc-thread-item {
        border-bottom: 1px solid var(--panel-border);
      }

      .wc-thread-item.is-selected {
        background: rgba(255, 255, 255, 0.045);
      }

      .wc-thread-main {
        display: grid;
        gap: 8px;
        width: 100%;
        border: 0;
        padding: 14px;
        color: inherit;
        background: transparent;
        text-align: left;
        cursor: pointer;
      }

      .wc-thread-main:hover {
        background: rgba(255, 255, 255, 0.035);
      }

      .wc-thread-topline {
        display: grid;
        grid-template-columns: 16px 28px 1fr auto;
        gap: 8px;
        align-items: center;
      }

      .wc-thread-author-meta {
        display: grid;
        min-width: 0;
        gap: 0;
      }

      .wc-thread-author-meta strong {
        line-height: 14px;
      }

      .wc-thread-author-meta span {
        line-height: 12px;
      }

      .wc-thread-number {
        color: var(--panel-muted);
        font-size: 11px;
        font-weight: 600;
        flex: none;
      }

      .wc-avatar {
        display: grid;
        width: 28px;
        height: 28px;
        place-items: center;
        border-radius: 50%;
        color: #ffffff;
        background: var(--brand);
        font-size: 11px;
        font-weight: 800;
      }

      .wc-thread-topline strong,
      .wc-comment-meta strong {
        display: block;
        color: var(--panel-text);
        font-size: 12px;
        line-height: 16px;
      }

      .wc-thread-topline span,
      .wc-comment-meta span,
      .wc-thread-main small {
        color: var(--panel-muted);
        font-size: 11px;
        line-height: 15px;
      }

      .wc-thread-status {
        border-radius: 999px;
        padding: 3px 7px;
        color: #bfdbfe;
        background: rgba(59, 130, 246, 0.18);
        font-size: 11px;
        white-space: nowrap;
      }

      .wc-thread-status.is-resolved {
        color: #bbf7d0;
        background: rgba(34, 197, 94, 0.18);
      }

      .wc-thread-main p {
        margin: 0;
        color: var(--panel-text);
        font-size: 13px;
        line-height: 19px;
        white-space: pre-wrap;
      }

      mark.wc-highlight {
        background: #534ae8;
        color: #ffffff;
        border-radius: 3px;
        padding: 0 3px;
        font-weight: 600;
      }

      .wc-thread-footer {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px 12px;
        padding: 0 14px;
        margin-bottom: 14px;
      }

      .wc-thread-reply-summary {
        border: 0;
        padding: 0;
        color: var(--panel-muted);
        background: transparent;
        cursor: pointer;
        font-size: 11px;
        line-height: 15px;
      }

      .wc-thread-reply-summary:hover {
        color: var(--panel-text);
      }

      .wc-thread-detail {
        padding: 0 14px 14px 50px;
      }

      .wc-thread-detail-inner {
        display: grid;
        gap: 12px;
      }

      .wc-original-controls {
        min-height: 20px;
        margin-left: auto;
      }

      .wc-thread-actions {
        display: flex;
        gap: 12px;
      }

      .wc-thread-actions button {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        border: 0;
        padding: 0;
        color: var(--panel-muted);
        background: transparent;
        cursor: pointer;
        font-size: 11px;
      }

      .wc-thread-actions button:hover {
        color: var(--panel-text);
      }

      .wc-thread-actions button.is-resolved {
        color: #b2d4fc;
      }

      .wc-thread-actions button.is-resolved:hover {
        opacity: 0.82;
      }

      .wc-replies-section {
        display: grid;
        gap: 9px;
        border-top: 1px solid var(--panel-border);
        padding-top: 12px;
      }

      .wc-section-label {
        margin: 0;
        color: var(--panel-muted);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .wc-replies {
        display: grid;
        gap: 10px;
      }

      .wc-comment {
        display: grid;
        grid-template-columns: 28px 1fr;
        gap: 8px;
      }

      .wc-comment.is-original {
        border-bottom: 1px solid var(--panel-border);
        padding-bottom: 10px;
      }

      .wc-comment p {
        margin: 3px 0 0;
        color: var(--panel-text);
        font-size: 12px;
        line-height: 18px;
        white-space: pre-wrap;
      }

      .wc-comment-actions {
        display: flex;
        gap: 8px;
        margin-top: 6px;
      }

      .wc-comment-actions button {
        border: 0;
        padding: 0;
        color: var(--panel-muted);
        background: transparent;
        cursor: pointer;
        font-size: 11px;
      }

      .wc-comment-actions button:hover {
        color: var(--panel-text);
      }

      .wc-reply-form {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .wc-reply-form:has(.is-multiline) {
        align-items: flex-end;
      }


      .wc-edit-form {
        display: grid;
        gap: 8px;
      }

      .wc-edit-form textarea,
      .wc-floating-composer textarea {
        width: 100%;
        resize: vertical;
        border: 1px solid var(--panel-border);
        border-radius: 8px;
        padding: 9px;
        color: var(--panel-text);
        background: var(--panel-soft);
        outline: none;
      }

      .wc-edit-form textarea:focus,
      .wc-floating-composer textarea:focus {
        border-color: var(--brand);
        box-shadow: 0 0 0 3px rgba(83, 74, 232, 0.18);
      }

      .wc-reply-actions,
      .wc-composer-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .wc-composer-footer {
        justify-content: flex-end;
      }

      .wc-reply-actions button,
      .wc-edit-form button,
      .wc-composer-footer button {
        border: 1px solid var(--panel-border);
        border-radius: 7px;
        padding: 7px 10px;
        color: var(--panel-text);
        background: var(--panel-soft);
        cursor: pointer;
      }

      .wc-reply-actions button.wc-submit-btn,
      .wc-edit-form button.wc-submit-btn,
      .wc-composer-footer button.wc-submit-btn {
        border: none;
        padding: 0;
      }

      .wc-floating-composer {
        position: fixed;
        display: grid;
        gap: 10px;
        width: 336px;
        border: 1px solid var(--panel-border);
        border-radius: 10px;
        padding: 12px;
        color: var(--panel-text);
        background: var(--panel);
        box-shadow: 0 18px 46px rgba(0, 0, 0, 0.36);
        pointer-events: auto;
      }

      .wc-floating-composer textarea {
        min-height: 82px;
        color: var(--panel-text);
        background: var(--panel-soft);
        border-color: var(--panel-border);
      }

      .wc-composer-header {
        display: grid;
        grid-template-columns: 28px 1fr auto;
        gap: 8px;
        align-items: center;
      }

      .wc-composer-header strong {
        color: var(--panel-text);
        font-size: 13px;
      }

      .wc-composer-header button {
        display: grid;
        width: 28px;
        height: 28px;
        place-items: center;
        border: 0;
        border-radius: 6px;
        color: var(--panel-muted);
        background: transparent;
        cursor: pointer;
        font-size: 18px;
      }

      .wc-composer-header button:hover {
        color: var(--panel-text);
        background: var(--panel-softer);
      }

      .wc-composer-footer button {
        border-color: var(--brand);
        color: #ffffff;
        background: var(--brand);
      }

      .wc-empty-state {
        display: grid;
        gap: 6px;
        padding: 18px 14px;
        color: var(--panel-muted);
        font-size: 12px;
        line-height: 18px;
      }

      .wc-empty-state strong {
        color: var(--panel-text);
        font-size: 13px;
      }

      .wc-toast {
        position: fixed;
        left: 50%;
        top: 18px;
        transform: translateX(-50%);
        border-radius: 999px;
        padding: 10px 14px;
        color: #ffffff;
        background: rgba(15, 23, 42, 0.92);
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.2);
        pointer-events: none;
        font-size: 13px;
      }

      .wc-context-error {
        position: fixed;
        left: 50%;
        top: 24px;
        display: grid;
        gap: 6px;
        width: min(360px, calc(100vw - 32px));
        transform: translateX(-50%);
        border: 1px solid var(--panel-border);
        border-radius: 10px;
        padding: 14px;
        color: var(--panel-text);
        background: var(--panel);
        box-shadow: 0 16px 38px rgba(0, 0, 0, 0.32);
        pointer-events: auto;
      }

      .wc-context-error[hidden] {
        display: none;
      }

      .wc-context-error strong {
        font-size: 13px;
      }

      .wc-context-error span {
        color: var(--panel-muted);
        font-size: 12px;
        line-height: 18px;
      }

      .wc-context-error button {
        justify-self: end;
        border: 0;
        border-radius: 7px;
        padding: 8px 11px;
        color: #ffffff;
        background: var(--brand);
        cursor: pointer;
        font-weight: 700;
      }

      @media (max-width: 720px) {
        .wc-sidebar {
          left: 12px;
          right: 12px;
          top: auto;
          bottom: 12px;
          width: auto;
          height: min(70vh, 560px);
          border: 1px solid var(--panel-border);
          border-radius: 8px;
        }

        .wc-toolbar {
          bottom: 10px;
        }

        .wc-floating-composer {
          left: 12px !important;
          right: 12px;
          width: auto;
        }
      }
    `;
  }
})();
