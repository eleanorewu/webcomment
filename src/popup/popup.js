(function initPopup() {
  const store = window.WebCommentStore;
  const els = {
    pageTitle: document.getElementById('pageTitle'),
    pageMeta: document.getElementById('pageMeta'),
    sessionSelect: document.getElementById('sessionSelect'),
    sessionNameInput: document.getElementById('sessionNameInput'),
    sessionPasswordInput: document.getElementById('sessionPasswordInput'),
    createSessionButton: document.getElementById('createSessionButton'),
    inviteLinkInput: document.getElementById('inviteLinkInput'),
    guestDisplayNameInput: document.getElementById('guestDisplayNameInput'),
    joinPasswordInput: document.getElementById('joinPasswordInput'),
    joinSessionButton: document.getElementById('joinSessionButton'),
    commentModeButton: document.getElementById('commentModeButton'),
    openCount: document.getElementById('openCount'),
    resolvedCount: document.getElementById('resolvedCount'),
    copyReviewLinkButton: document.getElementById('copyReviewLinkButton'),
    refreshButton: document.getElementById('refreshButton'),
    ownerPanel: document.getElementById('ownerPanel'),
    guestList: document.getElementById('guestList'),
    changePasswordButton: document.getElementById('changePasswordButton'),
    resetInviteButton: document.getElementById('resetInviteButton'),
    closeSessionButton: document.getElementById('closeSessionButton'),
    message: document.getElementById('message'),
  };

  let currentTab = null;
  let pageContext = null;
  const latestInviteLinks = {};

  boot();

  async function boot() {
    currentTab = await getCurrentTab();
    if (!isAnnotatableTab(currentTab)) {
      setMessage('這個頁面無法標注。請改用一般網站、localhost 或 demo 頁。');
      return;
    }

    pageContext = store.getPageContext(currentTab.url, currentTab.title);
    renderPage();
    await loadPendingReviewLink();
    await renderSessions();
    await renderOwnerPanel();
    await renderStats();
    bindEvents();
  }

  function bindEvents() {
    els.sessionSelect.addEventListener('change', async () => {
      await store.setActiveSessionId(els.sessionSelect.value);
      await ensureContentScript();
      await sendToTab({ type: 'WEB_COMMENT_SESSION_CHANGED', sessionId: els.sessionSelect.value });
      await renderOwnerPanel();
      await renderStats();
      setMessage('已切換工作階段。');
    });

    els.createSessionButton.addEventListener('click', createSession);
    els.sessionNameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') createSession();
    });
    els.sessionPasswordInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') createSession();
    });
    els.joinSessionButton.addEventListener('click', joinSession);
    els.joinPasswordInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') joinSession();
    });
    els.guestList.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-remove-guest-id]');
      if (!button) return;
      await removeGuest(button.dataset.removeGuestId);
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

    els.copyReviewLinkButton.addEventListener('click', copyReviewLink);
    els.changePasswordButton.addEventListener('click', changePassword);
    els.resetInviteButton.addEventListener('click', resetInvite);
    els.closeSessionButton.addEventListener('click', closeSession);
    els.refreshButton.addEventListener('click', async () => {
      await renderSessions();
      await renderOwnerPanel();
      await renderStats();
      await sendToTab({ type: 'WEB_COMMENT_REFRESH' });
      setMessage('已重新整理。');
    });
  }

  async function createSession() {
    const name = els.sessionNameInput.value.trim();
    const password = els.sessionPasswordInput.value.trim();
    if (!password) {
      setMessage('請先設定 Session 密碼。');
      return;
    }

    try {
      const result = await store.createPrivateSession({ name, password, pageContext });
      latestInviteLinks[result.session.id] = result.inviteLink;
      els.sessionNameInput.value = '';
      els.sessionPasswordInput.value = '';
      await renderSessions(result.session.id);
      await renderOwnerPanel();
      await renderStats();
      await ensureContentScript();
      await sendToTab({ type: 'WEB_COMMENT_SESSION_CHANGED', sessionId: result.session.id });
      setMessage('已建立私人 Session。請複製邀請連結，並用其他管道提供密碼。');
    } catch (error) {
      setMessage(error.message || '無法建立私人 Session。');
    }
  }

  function parseInviteLink(value) {
    try {
      const url = new URL(value.trim());
      const sessionId = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
      const inviteSecret = url.searchParams.get('invite') || '';
      return { sessionId, inviteSecret };
    } catch (error) {
      return { sessionId: '', inviteSecret: '' };
    }
  }

  async function joinSession() {
    const { sessionId, inviteSecret } = parseInviteLink(els.inviteLinkInput.value);
    const password = els.joinPasswordInput.value.trim();
    const displayName = els.guestDisplayNameInput.value.trim();
    if (!sessionId || !inviteSecret) {
      setMessage('請貼上有效的邀請連結。');
      return;
    }
    if (!password) {
      setMessage('請輸入 Session 密碼。');
      return;
    }
    if (!displayName) {
      setMessage('請輸入顯示名稱。');
      return;
    }

    try {
      const result = await store.joinPrivateSession({ sessionId, inviteSecret, password, displayName });
      els.joinPasswordInput.value = '';
      await renderSessions(result.session.id);
      await renderOwnerPanel();
      await renderStats();
      await ensureContentScript();
      await sendToTab({ type: 'WEB_COMMENT_SESSION_CHANGED', sessionId: result.session.id });
      setMessage('已加入 Session。');
    } catch (error) {
      setMessage(error.message || '無法加入 Session，請確認連結與密碼。');
    }
  }

  function renderPage() {
    els.pageTitle.textContent = pageContext.title || '目前頁面';
    els.pageMeta.textContent = `${translateEnvironment(pageContext.environment)} · ${pageContext.hostname}${pageContext.port ? `:${pageContext.port}` : ''}`;
  }

  async function renderSessions(preferredSessionId) {
    const state = await store.readState();
    const sessions = getVisibleSessions(state);
    const storedActiveSessionId = preferredSessionId || (await store.getActiveSessionId());
    const activeSessionId = sessions.some((session) => session.id === storedActiveSessionId)
      ? storedActiveSessionId
      : sessions[0]?.id || '';
    els.sessionSelect.innerHTML = '';

    sessions.forEach((session) => {
      const option = document.createElement('option');
      option.value = session.id;
      option.textContent = session.name;
      option.selected = session.id === activeSessionId;
      els.sessionSelect.append(option);
    });

    if (activeSessionId) {
      await store.setActiveSessionId(activeSessionId);
    }
  }

  function getVisibleSessions(state) {
    return Object.values(state.sessions)
      .filter((session) => {
        if (session.accessMode !== 'guest_password') return true;
        const localAccess = state.access?.[session.id];
        return Boolean(localAccess?.token || localAccess?.storedOwnerTokenForAdminRecovery);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async function renderOwnerPanel() {
    const state = await store.readState();
    const sessionId = els.sessionSelect.value || (await store.getActiveSessionId());
    const session = state.sessions[sessionId];
    const localAccess = state.access?.[sessionId];
    const canManagePrivateSession = session?.accessMode === 'guest_password'
      && (localAccess?.role === 'owner' || Boolean(localAccess?.storedOwnerTokenForAdminRecovery));
    els.ownerPanel.hidden = !canManagePrivateSession;
    renderGuestList(state, sessionId, canManagePrivateSession);
  }

  function renderGuestList(state, sessionId, canManagePrivateSession) {
    if (!canManagePrivateSession) {
      els.guestList.replaceChildren();
      return;
    }
    const guests = Object.values(state.sessionGuests || {})
      .filter((guest) => guest.sessionId === sessionId && guest.status === 'active')
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    els.guestList.replaceChildren();
    if (!guests.length) {
      const empty = document.createElement('p');
      empty.className = 'access-help';
      empty.textContent = '目前還沒有訪客加入。';
      els.guestList.append(empty);
      return;
    }

    guests.forEach((guest) => {
      const row = document.createElement('div');
      row.className = 'guest-row';
      const name = document.createElement('span');
      name.textContent = guest.displayName;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.removeGuestId = guest.id;
      button.textContent = '移除';
      row.append(name, button);
      els.guestList.append(row);
    });
  }

  async function renderStats() {
    const sessionId = els.sessionSelect.value || (await store.getActiveSessionId());
    try {
      const pageData = await store.getSessionPageData(sessionId, pageContext, true);
      const threads = pageData.threads || [];
      els.openCount.textContent = String(threads.filter((thread) => thread.status !== 'resolved').length);
      els.resolvedCount.textContent = String(threads.filter((thread) => thread.status === 'resolved').length);
    } catch (error) {
      els.openCount.textContent = '0';
      els.resolvedCount.textContent = '0';
    }
  }

  async function copyReviewLink() {
    const sessionId = els.sessionSelect.value || (await store.getActiveSessionId());
    let link = '';
    try {
      const state = await store.readState();
      const session = state.sessions[sessionId];
      const localAccess = state.access?.[sessionId];
      const canManagePrivateSession = session?.accessMode === 'guest_password'
        && (localAccess?.role === 'owner' || Boolean(localAccess?.storedOwnerTokenForAdminRecovery));
      if (canManagePrivateSession && !latestInviteLinks[sessionId]) {
        setMessage('為了安全，邀請連結只顯示一次。請按「重產邀請連結」取得新的連結。');
        return;
      }
      link = canManagePrivateSession
        ? latestInviteLinks[sessionId]
        : `https://webcomment.local/review/${encodeURIComponent(sessionId)}?pageKey=${encodeURIComponent(pageContext.pageKey)}&target=${encodeURIComponent(pageContext.url)}`;
      await navigator.clipboard.writeText(link);
      setMessage(canManagePrivateSession ? '已複製邀請連結。請用其他管道提供密碼。' : '已複製分享連結。');
    } catch (error) {
      setMessage(link || error.message || '無法複製分享連結。');
    }
  }

  async function changePassword() {
    const sessionId = els.sessionSelect.value || (await store.getActiveSessionId());
    const password = els.sessionPasswordInput.value.trim();
    if (!password) {
      setMessage('請在 Session 密碼欄位輸入新密碼。');
      return;
    }
    try {
      await store.changeSessionPassword(sessionId, password);
      els.sessionPasswordInput.value = '';
      setMessage('已更新密碼。請用其他管道通知協作者。');
    } catch (error) {
      setMessage(error.message || '無法更新密碼。');
    }
  }

  async function removeGuest(guestId) {
    const sessionId = els.sessionSelect.value || (await store.getActiveSessionId());
    try {
      await store.removeGuest(sessionId, guestId);
      await renderOwnerPanel();
      setMessage('已移除訪客，該訪客需要重新取得權限才能存取。');
    } catch (error) {
      setMessage(error.message || '無法移除訪客。');
    }
  }

  async function resetInvite() {
    const sessionId = els.sessionSelect.value || (await store.getActiveSessionId());
    try {
      const result = await store.resetInviteLink(sessionId, pageContext);
      latestInviteLinks[sessionId] = result.inviteLink;
      await navigator.clipboard.writeText(result.inviteLink);
      setMessage('已重產並複製邀請連結。請用其他管道提供密碼。');
    } catch (error) {
      setMessage(error.message || '無法重產邀請連結。');
    }
  }

  async function closeSession() {
    const sessionId = els.sessionSelect.value || (await store.getActiveSessionId());
    try {
      await store.closeSession(sessionId);
      await renderSessions(sessionId);
      await renderOwnerPanel();
      await renderStats();
      await sendToTab({ type: 'WEB_COMMENT_SESSION_CHANGED', sessionId });
      setMessage('已關閉 Session。既有內容仍可讀取，但不能新增留言。');
    } catch (error) {
      setMessage(error.message || '無法關閉 Session。');
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

  async function loadPendingReviewLink() {
    const response = await sendRuntimeMessage({ type: 'WEB_COMMENT_GET_PENDING_REVIEW_LINK' });
    if (response?.url) {
      els.inviteLinkInput.value = response.url;
      setMessage('已帶入邀請連結，請輸入顯示名稱與 Session 密碼。');
    }
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
        files: ['src/shared/session-access.js', 'src/shared/store.js', 'src/content/content-script.js'],
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
