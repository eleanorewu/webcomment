(function initPopup() {
  const store = window.WebCommentStore;
  const els = {
    pageTitle: document.getElementById('pageTitle'),
    pageMeta: document.getElementById('pageMeta'),
    sessionSelect: document.getElementById('sessionSelect'),
    sessionNameInput: document.getElementById('sessionNameInput'),
    createSessionButton: document.getElementById('createSessionButton'),
    commentModeButton: document.getElementById('commentModeButton'),
    showResolvedToggle: document.getElementById('showResolvedToggle'),
    openCount: document.getElementById('openCount'),
    resolvedCount: document.getElementById('resolvedCount'),
    copyReviewLinkButton: document.getElementById('copyReviewLinkButton'),
    refreshButton: document.getElementById('refreshButton'),
    message: document.getElementById('message'),
  };

  let currentTab = null;
  let pageContext = null;

  boot();

  async function boot() {
    currentTab = await getCurrentTab();
    if (!isAnnotatableTab(currentTab)) {
      setMessage('這個頁面無法標注。請改用一般網站、localhost 或 demo 頁。');
      return;
    }

    pageContext = store.getPageContext(currentTab.url, currentTab.title);
    renderPage();
    await renderSessions();
    await renderStats();
    bindEvents();
  }

  function bindEvents() {
    els.sessionSelect.addEventListener('change', async () => {
      await store.setActiveSessionId(els.sessionSelect.value);
      await ensureContentScript();
      await sendToTab({ type: 'WEB_COMMENT_SESSION_CHANGED', sessionId: els.sessionSelect.value });
      await renderStats();
      setMessage('已切換工作階段。');
    });

    els.createSessionButton.addEventListener('click', createSession);
    els.sessionNameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') createSession();
    });

    els.commentModeButton.addEventListener('click', async () => {
      const sessionId = els.sessionSelect.value || (await store.getActiveSessionId());
      await store.setActiveSessionId(sessionId);
      const ready = await ensureContentScript();
      if (!ready.ok) {
        setMessage(ready.message || '無法在這個頁面啟用標注。');
        return;
      }
      const response = await sendToTab({ type: 'WEB_COMMENT_ENABLE_COMMENT_MODE', sessionId });
      if (response && response.ok) {
        await sendRuntimeMessage({
          type: 'WEB_COMMENT_OVERLAY_ACTIVATED',
          tabId: currentTab.id,
        });
        setMessage('請到網頁上點擊要標注的位置。');
        window.close();
        return;
      }
      setMessage('標注工具尚未啟動，請重新整理頁面後再試一次。');
    });

    els.showResolvedToggle.addEventListener('change', async () => {
      await ensureContentScript();
      await sendToTab({ type: 'WEB_COMMENT_SHOW_RESOLVED', value: els.showResolvedToggle.checked });
      await renderStats();
    });

    els.copyReviewLinkButton.addEventListener('click', copyReviewLink);
    els.refreshButton.addEventListener('click', async () => {
      await renderSessions();
      await renderStats();
      await sendToTab({ type: 'WEB_COMMENT_REFRESH' });
      setMessage('已重新整理。');
    });
  }

  async function createSession() {
    const name = els.sessionNameInput.value.trim();
    const session = await store.createSession(name, pageContext);
    els.sessionNameInput.value = '';
    await renderSessions(session.id);
    await ensureContentScript();
    await sendToTab({ type: 'WEB_COMMENT_SESSION_CHANGED', sessionId: session.id });
    setMessage('已建立工作階段。');
  }

  function renderPage() {
    els.pageTitle.textContent = pageContext.title || '目前頁面';
    els.pageMeta.textContent = `${translateEnvironment(pageContext.environment)} · ${pageContext.hostname}${pageContext.port ? `:${pageContext.port}` : ''}`;
  }

  async function renderSessions(preferredSessionId) {
    const sessions = await store.listSessions();
    const activeSessionId = preferredSessionId || (await store.getActiveSessionId());
    els.sessionSelect.innerHTML = '';

    sessions.forEach((session) => {
      const option = document.createElement('option');
      option.value = session.id;
      option.textContent = session.name;
      option.selected = session.id === activeSessionId;
      els.sessionSelect.append(option);
    });
  }

  async function renderStats() {
    const state = await store.readState();
    const sessionId = els.sessionSelect.value || (await store.getActiveSessionId());
    const page = Object.values(state.pages).find((candidate) => candidate.sessionId === sessionId && candidate.pageKey === pageContext.pageKey);
    const pins = page ? Object.values(state.pins).filter((pin) => pin.pageId === page.id) : [];
    const threads = pins.map((pin) => state.threads[pin.threadId]).filter(Boolean);
    els.openCount.textContent = String(threads.filter((thread) => thread.status !== 'resolved').length);
    els.resolvedCount.textContent = String(threads.filter((thread) => thread.status === 'resolved').length);
  }

  async function copyReviewLink() {
    const sessionId = els.sessionSelect.value || (await store.getActiveSessionId());
    const link = `https://webcomment.local/review/${encodeURIComponent(sessionId)}?pageKey=${encodeURIComponent(pageContext.pageKey)}&target=${encodeURIComponent(pageContext.url)}`;
    try {
      await navigator.clipboard.writeText(link);
      setMessage('已複製分享連結。');
    } catch (error) {
      setMessage(link);
    }
  }

  function setMessage(message) {
    els.message.textContent = message;
  }

  function getCurrentTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]));
    });
  }

  async function ensureContentScript() {
    const ping = await sendToTab({ type: 'WEB_COMMENT_PING' });
    if (ping && ping.ok) return { ok: true };

    try {
      await chrome.scripting.insertCSS({
        target: { tabId: currentTab.id },
        files: ['src/content/content-script.css'],
      });
      await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        files: ['src/shared/store.js', 'src/content/content-script.js'],
      });
    } catch (error) {
      return {
        ok: false,
        message: '無法注入標注工具。請確認這不是 Chrome 內建頁，並重新整理頁面。',
      };
    }

    const secondPing = await sendToTab({ type: 'WEB_COMMENT_PING' });
    return secondPing && secondPing.ok ? { ok: true } : { ok: false, message: '標注工具啟動失敗，請重新整理頁面。' };
  }

  function sendToTab(message) {
    return new Promise((resolve) => {
      if (!currentTab || !currentTab.id) {
        resolve({ ok: false });
        return;
      }
      chrome.tabs.sendMessage(currentTab.id, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: true });
      });
    });
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: true });
      });
    });
  }

  function isAnnotatableTab(tab) {
    if (!tab || !tab.url) return false;
    return /^(https?:|file:)/.test(tab.url);
  }

  function translateEnvironment(environment) {
    if (environment === 'localhost') return '本機';
    if (environment === 'staging') return '測試站';
    if (environment === 'production') return '正式站';
    return '未知環境';
  }
})();
