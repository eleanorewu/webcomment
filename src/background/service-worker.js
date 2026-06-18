chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: '' });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

  return false;
});
