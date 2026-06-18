import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadWorker() {
  const calls = { popup: [], title: [], sent: [] };
  const listeners = { message: null, clicked: null };
  const chrome = {
    action: {
      onClicked: { addListener(listener) { listeners.clicked = listener; } },
      setBadgeBackgroundColor() {},
      setBadgeText() {},
      setPopup(details) {
        calls.popup.push(structuredClone(details));
        return Promise.resolve();
      },
      setTitle(details) {
        calls.title.push(structuredClone(details));
        return Promise.resolve();
      },
    },
    runtime: {
      lastError: null,
      onInstalled: { addListener() {} },
      onMessage: { addListener(listener) { listeners.message = listener; } },
    },
    tabs: {
      sendMessage(tabId, message, callback) {
        calls.sent.push({ tabId, message: structuredClone(message) });
        callback?.({ ok: true });
      },
    },
  };

  vm.runInNewContext(
    fs.readFileSync('src/background/service-worker.js', 'utf8'),
    { chrome, console },
  );

  return { calls, listeners };
}

function dispatchMessage(listener, message, sender = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const keepAlive = listener(message, sender, (response) => {
      settled = true;
      resolve(response);
    });
    if (keepAlive !== true && !settled) {
      reject(new Error('Message handler did not keep the response channel open'));
      return;
    }
    setTimeout(() => {
      if (!settled) reject(new Error('Message handler did not respond'));
    }, 50);
  });
}

test('activation removes the popup for only the active tab', async () => {
  const { calls, listeners } = loadWorker();

  const response = await dispatchMessage(listeners.message, {
    type: 'WEB_COMMENT_OVERLAY_ACTIVATED',
    tabId: 7,
  });

  assert.equal(response.ok, true);
  assert.deepEqual(calls.popup.at(-1), { tabId: 7, popup: '' });
});

test('clicking an active action deactivates the tab and restores popup', async () => {
  const { calls, listeners } = loadWorker();

  assert.equal(typeof listeners.clicked, 'function');
  await listeners.clicked({ id: 7 });

  assert.deepEqual(calls.sent, [
    { tabId: 7, message: { type: 'WEB_COMMENT_DEACTIVATE' } },
  ]);
  assert.deepEqual(calls.popup.at(-1), {
    tabId: 7,
    popup: 'src/popup/popup.html',
  });
});
