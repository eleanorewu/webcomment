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
    moreMenuOpen: false,
    sidebarOpen: true,
    draft: null,
    selectedThreadId: null,
    editingCommentId: null,
    searchQuery: '',
    sessionData: { pins: [], threads: [], comments: [] },
    recovery: {},
    previewPinId: null,
    drag: null,
    suppressPinClickId: null,
    contextInvalidated: false,
  };

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
    shadow.querySelector('[data-context-error] button').addEventListener('click', () => location.reload());
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
      chrome.storage.onChanged.removeListener(handleStorageChange);
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
    state.moreMenuOpen = false;
    state.sidebarOpen = true;
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
    state.moreMenuOpen = false;
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
    state.sessionData = await store.getSessionPageData(state.sessionId, state.pageContext, state.includeResolved);
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
      button.innerHTML = `<span>${thread.status === 'resolved' ? '✓' : index + 1}</span>`;
      button.setAttribute('aria-label', recovery.status === 'lost' ? '找不到標注位置' : `標注 ${index + 1}，可拖曳調整位置`);
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

    const pin = state.sessionData.pins.find((candidate) => candidate.id === state.previewPinId);
    const thread = pin && state.sessionData.threads.find((candidate) => candidate.id === pin.threadId);
    const original = thread && state.sessionData.comments.find((comment) => comment.threadId === thread.id && !comment.parentCommentId);
    const recovery = pin && state.recovery[pin.id];
    if (!pin || !thread || !original || !recovery || !recovery.viewportPosition) return;

    const preview = document.createElement('button');
    preview.id = `wc-pin-preview-${pin.id}`;
    preview.className = 'wc-pin-preview';
    preview.type = 'button';
    preview.innerHTML = `
      <span class="wc-preview-avatar">${escapeHtml(original.authorInitials || '本')}</span>
      <span class="wc-preview-content">
        <span class="wc-preview-meta">
          <strong>${escapeHtml(original.authorName || '使用者')}</strong>
          <span>${store.formatRelativeTime(original.createdAt)}</span>
        </span>
        <span class="wc-preview-body">${escapeHtml(original.body)}</span>
      </span>
    `;
    preview.style.left = `${recovery.viewportPosition.x + 20}px`;
    preview.style.top = `${recovery.viewportPosition.y - 18}px`;
    preview.addEventListener('pointerenter', () => {
      clearTimeout(previewCloseTimer);
    });
    preview.addEventListener('pointerleave', () => schedulePreviewClose());
    preview.addEventListener('click', (event) => {
      event.stopPropagation();
      closePinPreview();
      state.selectedThreadId = thread.id;
      state.editingCommentId = null;
      state.sidebarOpen = true;
      state.draft = null;
      state.commentMode = false;
      render();
      scrollSelectedThreadIntoView();
    });
    layer.append(preview);

    window.requestAnimationFrame(() => {
      if (!preview.isConnected) return;
      const rect = preview.getBoundingClientRect();
      const preferredLeft = recovery.viewportPosition.x + 20;
      const flippedLeft = recovery.viewportPosition.x - rect.width - 20;
      const left = preferredLeft + rect.width <= window.innerWidth - 12 ? preferredLeft : flippedLeft;
      preview.style.left = `${clamp(left, 12, window.innerWidth - rect.width - 12)}px`;
      preview.style.top = `${clamp(recovery.viewportPosition.y - 18, 12, window.innerHeight - rect.height - 12)}px`;
    });
  }

  function beginPinPointer(event, pin, button) {
    if (event.button !== 0 || state.commentMode) return;
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
    if (!drag.started && distance < 4) return;

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
        <button type="submit">送出</button>
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
      button.textContent = '送出中...';
      const result = await store.createThread(state.sessionId, state.pageContext, state.draft.anchor, body);
      state.selectedThreadId = result.thread.id;
      state.editingCommentId = null;
      state.sidebarOpen = true;
      state.draft = null;
      state.commentMode = false;
      await refreshData();
      render();
      showToast('標注已送出。');
      scrollSelectedThreadIntoView();
    });

    layer.append(composer);
    setTimeout(() => {
      const textarea = composer.querySelector('textarea');
      if (textarea) textarea.focus();
    }, 0);
  }

  function renderToolbar() {
    const toolbar = shadow.querySelector('[data-toolbar]');
    const openCount = state.sessionData.threads.filter((thread) => thread.status !== 'resolved').length;
    const resolvedCount = state.sessionData.threads.filter((thread) => thread.status === 'resolved').length;
    const primaryControls = state.commentMode
      ? `
        <span class="wc-toolbar-meta">標注模式 · 點擊頁面留言</span>
        <button class="wc-tool is-active" data-action="finish-comment" type="button">完成</button>
      `
      : `
        <button class="wc-tool" data-action="toggle-comment" type="button">標注</button>
        <span class="wc-toolbar-meta">${openCount} 未解決</span>
        <button class="wc-icon-tool" data-action="toggle-resolved" type="button" title="顯示或隱藏已解決標注">
          ${state.includeResolved ? '隱藏已解決' : `已解決 ${resolvedCount}`}
        </button>
      `;

    toolbar.innerHTML = `
      ${primaryControls}
      <button class="wc-icon-tool" data-action="toggle-more" type="button" aria-label="更多" aria-expanded="${state.moreMenuOpen}">•••</button>
      <div class="wc-more-menu" data-more-menu ${state.moreMenuOpen ? '' : 'hidden'}>
        <button data-action="toggle-sidebar" type="button">${state.sidebarOpen ? '隱藏留言列表' : '顯示留言列表'}</button>
        <button class="is-danger" data-action="deactivate" type="button">關閉 WebComment</button>
      </div>
    `;

    const toggleComment = toolbar.querySelector('[data-action="toggle-comment"]');
    if (toggleComment) toggleComment.addEventListener('click', () => {
      state.commentMode = true;
      state.moreMenuOpen = false;
      state.draft = null;
      render();
      showToast('請點擊頁面上要標注的位置。');
    });

    const finishComment = toolbar.querySelector('[data-action="finish-comment"]');
    if (finishComment) finishComment.addEventListener('click', () => {
      state.commentMode = false;
      state.moreMenuOpen = false;
      state.draft = null;
      render();
    });

    const toggleResolved = toolbar.querySelector('[data-action="toggle-resolved"]');
    if (toggleResolved) toggleResolved.addEventListener('click', async () => {
      state.includeResolved = !state.includeResolved;
      await refreshData();
      render();
      updateBadge();
    });

    toolbar.querySelector('[data-action="toggle-more"]').addEventListener('click', () => {
      state.moreMenuOpen = !state.moreMenuOpen;
      renderToolbar();
    });

    toolbar.querySelector('[data-action="toggle-sidebar"]').addEventListener('click', () => {
      state.sidebarOpen = !state.sidebarOpen;
      state.moreMenuOpen = false;
      render();
    });

    toolbar.querySelector('[data-action="deactivate"]').addEventListener('click', deactivateOverlay);
  }

  function renderSidebar() {
    const sidebar = shadow.querySelector('[data-sidebar]');
    sidebar.hidden = !state.sidebarOpen;
    if (!state.sidebarOpen) return;

    const openCount = state.sessionData.threads.filter((thread) => thread.status !== 'resolved').length;
    const visibleItems = getThreadSummaries();

    sidebar.innerHTML = `
      <header class="wc-sidebar-header">
        <div>
          <p class="wc-eyebrow">WebComment</p>
          <h2>標注留言</h2>
        </div>
        <button data-action="close-sidebar" class="wc-ghost-button" type="button" title="隱藏列表">×</button>
      </header>
      <div class="wc-sidebar-tools">
        <input data-search type="search" placeholder="搜尋留言" value="${escapeAttribute(state.searchQuery)}" />
        <button data-action="toggle-resolved" type="button">${state.includeResolved ? '只看未解決' : '顯示已解決'}</button>
      </div>
      <div class="wc-sidebar-summary">
        <span>${visibleItems.length} 則標注</span>
        <span>${openCount} 未解決</span>
      </div>
      <div class="wc-thread-list" data-thread-list></div>
    `;

    sidebar.querySelector('[data-action="close-sidebar"]').addEventListener('click', () => {
      state.sidebarOpen = false;
      render();
    });

    sidebar.querySelector('[data-action="toggle-resolved"]').addEventListener('click', async () => {
      state.includeResolved = !state.includeResolved;
      await refreshData();
      render();
      updateBadge();
    });

    sidebar.querySelector('[data-search]').addEventListener('input', (event) => {
      state.searchQuery = event.target.value;
      renderSidebar();
    });

    const list = sidebar.querySelector('[data-thread-list]');
    if (!visibleItems.length) {
      list.innerHTML = `
        <div class="wc-empty-state">
          <strong>目前沒有符合的標注</strong>
          <span>點擊「標注」後在網頁任一位置留下意見。</span>
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
    article.dataset.threadId = item.thread.id;
    article.innerHTML = `
      <button class="wc-thread-main" type="button">
        <div class="wc-thread-topline">
          <div class="wc-avatar">${escapeHtml(item.original.authorInitials || '本')}</div>
          <div>
            <strong>${escapeHtml(item.original.authorName || '使用者')}</strong>
            <span>${store.formatRelativeTime(item.original.createdAt)}</span>
          </div>
          <span class="wc-thread-status ${item.thread.status === 'resolved' ? 'is-resolved' : ''}">${item.thread.status === 'resolved' ? '已解決' : '未解決'}</span>
        </div>
        <p>${escapeHtml(item.original.body)}</p>
        <small>${item.replies.length ? `${item.replies.length} 則回覆` : '尚無回覆'} · ${translateAnchorStatus(item.recovery ? item.recovery.status : 'unknown')}</small>
      </button>
      <div class="wc-thread-detail" ${isSelected ? '' : 'hidden'}></div>
    `;

    article.querySelector('.wc-thread-main').addEventListener('click', () => {
      state.selectedThreadId = item.thread.id;
      state.editingCommentId = null;
      state.draft = null;
      state.commentMode = false;
      render();
    });

    const detail = article.querySelector('.wc-thread-detail');
    if (isSelected) {
      detail.append(renderThreadDetail(item));
    }

    return article;
  }

  function renderThreadDetail(item) {
    const node = document.createElement('div');
    node.className = 'wc-thread-detail-inner';

    const originalControls = renderOriginalControls(item);

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
      <textarea name="body" rows="2" placeholder="回覆這則標注..."></textarea>
      <div class="wc-reply-actions">
        <button data-action="resolve" type="button">${item.thread.status === 'resolved' ? '重新開啟' : '標記已解決'}</button>
        <button type="submit">回覆</button>
      </div>
    `;

    form.querySelector('[data-action="resolve"]').addEventListener('click', async () => {
      await store.setThreadResolved(item.thread.id, item.thread.status !== 'resolved');
      await refreshData();
      if (!state.includeResolved && item.thread.status !== 'resolved') {
        state.selectedThreadId = null;
      }
      state.editingCommentId = null;
      render();
      updateBadge();
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const body = new FormData(form).get('body').toString().trim();
      if (!body) return;
      await store.addReply(item.thread.id, body);
      form.reset();
      await refreshData();
      state.editingCommentId = null;
      render();
    });

    node.append(originalControls);
    if (repliesSection) node.append(repliesSection);
    node.append(form);
    return node;
  }

  function renderOriginalControls(item) {
    const node = document.createElement('div');
    node.className = 'wc-original-controls';

    if (state.editingCommentId === item.original.id) {
      node.innerHTML = `
        <form class="wc-edit-form wc-original-edit-form">
          <label for="wc-original-edit-${escapeAttribute(item.original.id)}">編輯標注</label>
          <textarea id="wc-original-edit-${escapeAttribute(item.original.id)}" name="body" rows="3">${escapeHtml(item.original.body)}</textarea>
          <div class="wc-reply-actions">
            <button data-action="cancel-edit" type="button">取消</button>
            <button type="submit">儲存</button>
          </div>
        </form>
      `;

      const form = node.querySelector('form');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const body = new FormData(form).get('body').toString().trim();
        if (!body) return;
        await store.updateComment(item.original.id, body);
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
        if (textarea) textarea.focus();
      }, 0);
      return node;
    }

    node.innerHTML = `
      <div class="wc-thread-actions">
        <button data-action="edit" type="button">編輯標注</button>
        <button data-action="delete" type="button">刪除</button>
      </div>
    `;

    node.querySelector('[data-action="edit"]').addEventListener('click', () => {
      state.editingCommentId = item.original.id;
      render();
    });

    node.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (!window.confirm('刪除這則標注會一併移除 pin、留言串與所有回覆。確定刪除？')) return;
      await store.deleteComment(item.original.id);
      state.editingCommentId = null;
      state.selectedThreadId = null;
      await refreshData();
      render();
      updateBadge();
    });

    return node;
  }

  function renderComment(comment) {
    const node = document.createElement('article');
    node.className = 'wc-comment';
    node.innerHTML = `
      <div class="wc-avatar">${escapeHtml(comment.authorInitials || '本')}</div>
      <div>
        <div class="wc-comment-meta">
          <strong>${escapeHtml(comment.authorName || '使用者')}</strong>
          <span>${store.formatRelativeTime(comment.createdAt)}</span>
        </div>
        <p>${escapeHtml(comment.body)}</p>
      </div>
    `;
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
            <button type="submit">儲存</button>
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
        if (textarea) textarea.focus();
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
        <div class="wc-comment-actions">
          <button data-action="edit" type="button">編輯</button>
          <button data-action="delete" type="button">${isOriginal ? '刪除標注' : '刪除'}</button>
        </div>
      </div>
    `;

    node.querySelector('[data-action="edit"]').addEventListener('click', () => {
      state.editingCommentId = comment.id;
      render();
    });

    node.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      const message = isOriginal ? '刪除這則標注會一併移除 pin、留言串與所有回覆。確定刪除？' : '確定刪除這則回覆？';
      if (!window.confirm(message)) return;
      await store.deleteComment(comment.id);
      state.editingCommentId = null;
      state.selectedThreadId = isOriginal ? null : thread.id;
      await refreshData();
      render();
      updateBadge();
    });

    return node;
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
        const haystack = [item.original.body, item.original.authorName, state.pageContext.pageKey].join(' ').toLowerCase();
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
    state.sidebarOpen = true;
    render();
  }

  function handleKeydown(event) {
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

  function translateEnvironment(environment) {
    if (environment === 'localhost') return '本機';
    if (environment === 'staging') return '測試站';
    if (environment === 'production') return '正式站';
    return '未知環境';
  }

  function translateAnchorStatus(status) {
    if (status === 'attached') return '位置已固定';
    if (status === 'recovered') return '位置已復原';
    if (status === 'approximate') return '近似位置';
    if (status === 'lost') return '找不到位置';
    return '未知狀態';
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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

      .wc-pin-preview {
        position: fixed;
        display: grid;
        grid-template-columns: 24px minmax(0, 1fr);
        gap: 9px;
        width: min(280px, calc(100vw - 24px));
        border: 1px solid var(--panel-border);
        border-radius: 8px;
        padding: 11px 12px;
        color: var(--panel-text);
        background: var(--panel);
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.32);
        pointer-events: auto;
        text-align: left;
        cursor: pointer;
      }

      .wc-preview-avatar {
        display: grid;
        width: 24px;
        height: 24px;
        place-items: center;
        border-radius: 50%;
        color: #ffffff;
        background: var(--brand);
        font-size: 10px;
        font-weight: 800;
      }

      .wc-preview-content,
      .wc-preview-meta {
        min-width: 0;
      }

      .wc-preview-content {
        display: grid;
        gap: 3px;
      }

      .wc-preview-meta {
        display: flex;
        align-items: baseline;
        gap: 6px;
      }

      .wc-preview-meta strong {
        overflow: hidden;
        color: var(--panel-text);
        font-size: 11px;
        line-height: 15px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .wc-preview-meta > span {
        flex: none;
        color: var(--panel-muted);
        font-size: 10px;
      }

      .wc-preview-body {
        display: -webkit-box;
        overflow: hidden;
        color: var(--panel-text);
        font-size: 11px;
        line-height: 16px;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
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
        gap: 8px;
        max-width: calc(100vw - 32px);
        transform: translateX(-50%);
        border: 1px solid rgba(63, 63, 70, 0.9);
        border-radius: 999px;
        padding: 8px;
        background: rgba(35, 35, 35, 0.94);
        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.25);
        pointer-events: auto;
        backdrop-filter: blur(10px);
      }

      .wc-tool,
      .wc-icon-tool {
        border: 1px solid var(--panel-border);
        border-radius: 999px;
        padding: 8px 12px;
        color: var(--panel-text);
        background: var(--panel-soft);
        cursor: pointer;
        white-space: nowrap;
      }

      .wc-tool.is-active {
        border-color: var(--brand);
        color: #ffffff;
        background: var(--brand);
      }

      .wc-toolbar-meta {
        overflow: hidden;
        max-width: 240px;
        color: var(--panel-muted);
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .wc-more-menu {
        position: absolute;
        right: 8px;
        bottom: calc(100% + 8px);
        display: grid;
        min-width: 190px;
        overflow: hidden;
        border: 1px solid var(--panel-border);
        border-radius: 10px;
        padding: 6px;
        background: var(--panel);
        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.28);
      }

      .wc-more-menu[hidden] {
        display: none;
      }

      .wc-more-menu button {
        border: 0;
        border-radius: 7px;
        padding: 9px 10px;
        color: var(--panel-text);
        background: transparent;
        text-align: left;
        cursor: pointer;
      }

      .wc-more-menu button:hover {
        background: var(--panel-soft);
      }

      .wc-more-menu button.is-danger {
        color: #fca5a5;
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

      .wc-sidebar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 14px 10px;
      }

      .wc-eyebrow {
        margin: 0 0 2px;
        color: var(--panel-muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0;
      }

      .wc-sidebar h2 {
        margin: 0;
        font-size: 15px;
        line-height: 22px;
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
        grid-template-columns: 1fr auto;
        gap: 8px;
        padding: 0 14px 10px;
      }

      .wc-sidebar-tools input,
      .wc-sidebar-tools button {
        border: 1px solid var(--panel-border);
        border-radius: 7px;
        color: var(--panel-text);
        background: var(--panel-soft);
        outline: none;
      }

      .wc-sidebar-tools input {
        min-width: 0;
        padding: 8px 10px;
      }

      .wc-sidebar-tools button {
        padding: 8px 10px;
        cursor: pointer;
        white-space: nowrap;
      }

      .wc-sidebar-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-top: 1px solid var(--panel-border);
        border-bottom: 1px solid var(--panel-border);
        padding: 8px 14px;
        color: var(--panel-muted);
        font-size: 12px;
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
        grid-template-columns: 28px 1fr auto;
        gap: 8px;
        align-items: center;
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

      .wc-thread-detail {
        padding: 0 14px 14px 50px;
      }

      .wc-thread-detail-inner {
        display: grid;
        gap: 12px;
      }

      .wc-original-controls {
        min-height: 20px;
      }

      .wc-thread-actions {
        display: flex;
        gap: 12px;
      }

      .wc-thread-actions button {
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
        display: grid;
        gap: 8px;
      }

      .wc-edit-form {
        display: grid;
        gap: 8px;
      }

      .wc-original-edit-form label {
        color: var(--panel-muted);
        font-size: 11px;
        font-weight: 700;
      }

      .wc-reply-form textarea,
      .wc-edit-form textarea,
      .wc-floating-composer textarea {
        width: 100%;
        resize: vertical;
        border: 1px solid var(--panel-border);
        border-radius: 7px;
        padding: 9px;
        color: var(--panel-text);
        background: var(--panel-soft);
        outline: none;
      }

      .wc-reply-form textarea:focus,
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

      .wc-reply-actions button[type="submit"],
      .wc-edit-form button[type="submit"],
      .wc-composer-footer button[type="submit"] {
        border-color: var(--brand);
        color: #ffffff;
        background: var(--brand);
        font-weight: 700;
      }

      .wc-floating-composer {
        position: fixed;
        display: grid;
        gap: 10px;
        width: 336px;
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 12px;
        color: var(--text);
        background: var(--surface);
        box-shadow: 0 18px 46px rgba(15, 23, 42, 0.22);
        pointer-events: auto;
      }

      .wc-floating-composer textarea {
        min-height: 82px;
        color: var(--text);
        background: #ffffff;
        border-color: var(--border);
      }

      .wc-composer-header {
        display: grid;
        grid-template-columns: 28px 1fr auto;
        gap: 8px;
        align-items: center;
      }

      .wc-composer-header strong {
        color: var(--text);
        font-size: 13px;
      }

      .wc-composer-header button {
        display: grid;
        width: 28px;
        height: 28px;
        place-items: center;
        border: 0;
        border-radius: 6px;
        color: var(--muted);
        background: transparent;
        cursor: pointer;
        font-size: 18px;
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
