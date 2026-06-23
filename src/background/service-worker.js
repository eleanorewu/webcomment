const POPUP_PATH = 'src/popup/popup.html';
let pendingReviewLink = '';

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: '' });
});

async function setOverlayActionState(tabId, active) {
  if (!tabId) return;
  await chrome.action.setPopup({ tabId, popup: active ? '' : POPUP_PATH });
  await chrome.action.setTitle({
    tabId,
    title: active ? 'WebComment 已啟用，點擊關閉' : 'WebComment 標注工具',
  });
}

async function deactivateTab(tabId) {
  if (!tabId) return;
  await new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'WEB_COMMENT_DEACTIVATE' }, () => resolve());
  });
  await setOverlayActionState(tabId, false);
}

chrome.action.onClicked.addListener((tab) => deactivateTab(tab && tab.id));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'WEB_COMMENT_OVERLAY_ACTIVATED') {
    const tabId = message.tabId || (sender.tab && sender.tab.id);
    setOverlayActionState(tabId, true)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === 'WEB_COMMENT_OVERLAY_DEACTIVATED') {
    const tabId = message.tabId || (sender.tab && sender.tab.id);
    setOverlayActionState(tabId, false)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === 'WEB_COMMENT_SET_BADGE') {
    chrome.action.setBadgeText({ tabId: sender.tab && sender.tab.id, text: message.text || '' });
    chrome.action.setBadgeBackgroundColor({ color: '#534AE8' });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'WEB_COMMENT_COPY_REVIEW_LINK') {
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'WEB_COMMENT_STORE_PENDING_REVIEW_LINK') {
    pendingReviewLink = message.url || '';
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'WEB_COMMENT_GET_PENDING_REVIEW_LINK') {
    const url = pendingReviewLink;
    pendingReviewLink = '';
    sendResponse({ ok: true, url });
    return true;
  }

  return false;
});
