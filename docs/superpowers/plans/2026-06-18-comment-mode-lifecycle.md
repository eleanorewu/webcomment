# Comment Mode Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one popup action enter annotation placement immediately, add the approved arrow-plus-conversation cursor, and provide reliable per-tab exit controls through both the overlay and Chrome action icon.

**Architecture:** Keep the existing no-build Manifest V3 structure. The content script will separate its always-available message bridge from an explicitly mounted overlay lifecycle; the background service worker will own per-tab action popup/title state; the popup will activate both layers in one transaction. Built-in `node:test` tests will exercise service-worker behavior and guard the UI contracts without adding dependencies.

**Tech Stack:** Manifest V3, plain JavaScript, Chrome Action/Tabs APIs, Shadow DOM, Node.js built-in test runner.

---

## File Map

- Modify `package.json`: add the test command.
- Create `tests/service-worker.test.mjs`: execute the service worker in a VM with a Chrome API stub and verify per-tab action behavior.
- Create `tests/comment-mode-ui.test.mjs`: assert the source/CSS/manifest contracts for activation, cursor, toolbar, and cleanup.
- Modify `src/background/service-worker.js`: own action activation/deactivation and active-icon clicks.
- Modify `src/popup/popup.js`: report successful activation to the service worker before closing the popup.
- Modify `src/content/content-script.js`: mount/unmount the overlay, manage page listeners, render approved controls, and report closure.
- Modify `src/content/content-script.css`: apply the custom cursor only during placement mode.
- Modify `scripts/check-extension.mjs`: include the new lifecycle/UI invariants in the existing structural check.

### Task 1: Add the zero-dependency test harness

**Files:**
- Modify: `package.json`
- Create: `tests/service-worker.test.mjs`

- [ ] **Step 1: Add the test command**

Change the scripts block to:

```json
"scripts": {
  "check": "node scripts/check-extension.mjs",
  "test": "node --test tests/*.test.mjs"
}
```

- [ ] **Step 2: Write the failing background lifecycle tests**

Create a VM harness in `tests/service-worker.test.mjs` that records listeners and Chrome API calls:

```js
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
      setPopup(details) { calls.popup.push(details); return Promise.resolve(); },
      setTitle(details) { calls.title.push(details); return Promise.resolve(); },
    },
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener(listener) { listeners.message = listener; } },
    },
    tabs: {
      sendMessage(tabId, message, callback) {
        calls.sent.push({ tabId, message });
        callback?.({ ok: true });
      },
    },
  };
  vm.runInNewContext(fs.readFileSync('src/background/service-worker.js', 'utf8'), { chrome });
  return { calls, listeners };
}

function dispatchMessage(listener, message, sender = {}) {
  return new Promise((resolve) => listener(message, sender, resolve));
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
  await listeners.clicked({ id: 7 });
  assert.deepEqual(calls.sent, [{ tabId: 7, message: { type: 'WEB_COMMENT_DEACTIVATE' } }]);
  assert.deepEqual(calls.popup.at(-1), { tabId: 7, popup: 'src/popup/popup.html' });
});
```

- [ ] **Step 3: Run the tests and verify they fail**

Run: `npm test`

Expected: FAIL because `chrome.action.onClicked` is not registered and activation does not call `setPopup`.

- [ ] **Step 4: Commit the test harness**

```bash
git add package.json tests/service-worker.test.mjs
git commit -m "test: cover per-tab extension lifecycle"
```

### Task 2: Implement per-tab Chrome action behavior

**Files:**
- Modify: `src/background/service-worker.js`

- [ ] **Step 1: Add action-state helpers**

Add constants and helpers:

```js
const POPUP_PATH = 'src/popup/popup.html';

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
```

- [ ] **Step 2: Handle lifecycle messages**

Extend `runtime.onMessage` before the existing badge handler:

```js
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
```

- [ ] **Step 3: Register the active-icon click**

Add:

```js
chrome.action.onClicked.addListener((tab) => deactivateTab(tab && tab.id));
```

The handler is reachable only when that tab's popup has been set to `''`.

- [ ] **Step 4: Run tests and verify they pass**

Run: `npm test`

Expected: both service-worker tests PASS.

- [ ] **Step 5: Run the structural check**

Run: `npm run check`

Expected: `Extension structure looks good.`

- [ ] **Step 6: Commit**

```bash
git add src/background/service-worker.js
git commit -m "feat: toggle active overlay from extension icon"
```

### Task 3: Make content-script activation explicit and reversible

**Files:**
- Create: `tests/comment-mode-ui.test.mjs`
- Modify: `src/content/content-script.js`
- Modify: `scripts/check-extension.mjs`

- [ ] **Step 1: Write failing source-contract tests**

Create `tests/comment-mode-ui.test.mjs`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const content = fs.readFileSync('src/content/content-script.js', 'utf8');
const css = fs.readFileSync('src/content/content-script.css', 'utf8');

test('content script exposes explicit overlay lifecycle', () => {
  assert.match(content, /overlayActive:\s*false/);
  assert.match(content, /WEB_COMMENT_DEACTIVATE/);
  assert.match(content, /function deactivateOverlay/);
  assert.match(content, /root\.remove\(\)/);
});

test('comment mode has approved done, more, and close controls', () => {
  assert.match(content, /data-action="finish-comment"/);
  assert.match(content, /data-action="toggle-more"/);
  assert.match(content, /data-action="deactivate"/);
  assert.match(content, /關閉 WebComment/);
});

test('placement toggles the approved cursor class', () => {
  assert.match(content, /webcomment-comment-mode/);
  assert.match(css, /data:image\/svg\+xml/);
  assert.match(css, /crosshair/);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test`

Expected: FAIL because explicit overlay state, teardown, new controls, and cursor CSS do not exist.

- [ ] **Step 3: Separate the message bridge from page listeners**

In `state`, add `overlayActive: false` and `moreMenuOpen: false`. Do not mount or render in initial boot. Register only `chrome.runtime.onMessage` during boot so an inactive tab can still receive activation.

Create a page-listener registry:

```js
const pageCleanups = [];

function listen(target, type, listener, options) {
  target.addEventListener(type, listener, options);
  pageCleanups.push(() => target.removeEventListener(type, listener, options));
}

function clearPageListeners() {
  while (pageCleanups.length) pageCleanups.pop()();
}
```

Use `listen(...)` for document click/keydown and window scroll/resize/hash/popstate. Add and remove the storage listener explicitly within activation/deactivation.

- [ ] **Step 4: Add mount, activation, and teardown functions**

Convert `root` and `shadow` to mutable bindings and implement:

```js
async function activateOverlay(sessionId) {
  if (!state.overlayActive) {
    root = ensureRoot();
    shadow = root.attachShadow({ mode: 'open' });
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
  syncCommentCursor();
  render();
}

function deactivateOverlay() {
  if (!state.overlayActive) return { ok: true };
  clearTimeout(previewOpenTimer);
  clearTimeout(previewCloseTimer);
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
  chrome.runtime.sendMessage({ type: 'WEB_COMMENT_OVERLAY_DEACTIVATED' });
  return { ok: true };
}
```

Ensure `patchHistory()` stores the original methods and `restoreHistory()` restores only the wrappers installed by WebComment.

- [ ] **Step 5: Route lifecycle messages**

Replace the current enable branch with:

```js
if (message.type === 'WEB_COMMENT_ENABLE_COMMENT_MODE') {
  await activateOverlay(message.sessionId);
  showToast('請點擊頁面上要標注的位置。');
  return { ok: true, active: true };
}

if (message.type === 'WEB_COMMENT_DEACTIVATE') {
  return deactivateOverlay();
}
```

Make `WEB_COMMENT_PING` return `{ ok: true, active: state.overlayActive }`.

- [ ] **Step 6: Render the approved toolbar states**

When `state.commentMode` is true, render:

```html
<span class="wc-toolbar-meta">標注模式 · 點擊頁面留言</span>
<button class="wc-tool is-active" data-action="finish-comment" type="button">完成</button>
<button class="wc-icon-tool" data-action="toggle-more" type="button" aria-label="更多">•••</button>
```

Outside placement mode, keep the existing counts and filters, rename the entry control to `標注`, and include the same More button. The More menu contains:

```html
<div class="wc-more-menu" data-more-menu>
  <button data-action="toggle-sidebar" type="button">顯示／隱藏留言列表</button>
  <button class="is-danger" data-action="deactivate" type="button">關閉 WebComment</button>
</div>
```

Wire `finish-comment` to clear `commentMode` and `draft`, then call `syncCommentCursor()` and `render()`. Wire `deactivate` to `deactivateOverlay()`.

- [ ] **Step 7: Keep cursor state synchronized**

Add:

```js
function syncCommentCursor() {
  document.documentElement.classList.toggle(
    'webcomment-comment-mode',
    state.overlayActive && state.commentMode,
  );
}
```

Call it after activation, toolbar mode changes, comment submit, pin/thread selection, `Escape`, and deactivation.

- [ ] **Step 8: Extend structural checks**

In `scripts/check-extension.mjs`, add checks that fail when:

```js
if (!/WEB_COMMENT_DEACTIVATE/.test(contentSource)) fail('Missing overlay deactivation message handling');
if (!/data-action="finish-comment"/.test(contentSource)) fail('Missing explicit Done control');
if (!/webcomment-comment-mode/.test(contentSource)) fail('Missing comment cursor state');
```

Use the script's existing `failed = true` pattern rather than introducing a new helper.

- [ ] **Step 9: Run tests and checks**

Run: `npm test && npm run check`

Expected: all tests PASS and `Extension structure looks good.`

- [ ] **Step 10: Commit**

```bash
git add tests/comment-mode-ui.test.mjs src/content/content-script.js scripts/check-extension.mjs
git commit -m "feat: add reversible comment overlay lifecycle"
```

### Task 4: Add the approved custom conversation cursor

**Files:**
- Modify: `src/content/content-script.css`

- [ ] **Step 1: Add the placement cursor**

Add a percent-encoded SVG cursor whose hotspot is the arrow tip:

```css
html.webcomment-comment-mode,
html.webcomment-comment-mode body,
html.webcomment-comment-mode body * {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cpath d='M2 2L2 23L8 17L12 27L16 25L12 16L21 16Z' fill='%23fff' stroke='%23111827' stroke-width='1.5'/%3E%3Cpath d='M15 3h13v11H18l-3 3V3Z' fill='%23534AE8' stroke='%23fff' stroke-width='1.5'/%3E%3Ccircle cx='19' cy='8.5' r='1' fill='%23fff'/%3E%3Ccircle cx='22' cy='8.5' r='1' fill='%23fff'/%3E%3Ccircle cx='25' cy='8.5' r='1' fill='%23fff'/%3E%3C/svg%3E") 2 2, crosshair !important;
}

html.webcomment-comment-mode #webcomment-root {
  cursor: auto !important;
}
```

- [ ] **Step 2: Run the focused tests**

Run: `node --test tests/comment-mode-ui.test.mjs`

Expected: all cursor and UI contract tests PASS.

- [ ] **Step 3: Run the full checks**

Run: `npm test && npm run check`

Expected: all tests PASS and `Extension structure looks good.`

- [ ] **Step 4: Commit**

```bash
git add src/content/content-script.css
git commit -m "feat: show conversation cursor in annotation mode"
```

### Task 5: Connect popup activation to Chrome action state

**Files:**
- Modify: `src/popup/popup.js`
- Modify: `tests/comment-mode-ui.test.mjs`

- [ ] **Step 1: Add a failing popup contract test**

Append:

```js
const popup = fs.readFileSync('src/popup/popup.js', 'utf8');

test('popup reports overlay activation before closing', () => {
  assert.match(popup, /WEB_COMMENT_OVERLAY_ACTIVATED/);
  assert.match(popup, /tabId:\s*currentTab\.id/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/comment-mode-ui.test.mjs`

Expected: FAIL because the popup does not yet notify the background worker.

- [ ] **Step 3: Notify the background after content activation succeeds**

Inside the successful `WEB_COMMENT_ENABLE_COMMENT_MODE` response branch, before `window.close()`, add:

```js
await sendRuntimeMessage({
  type: 'WEB_COMMENT_OVERLAY_ACTIVATED',
  tabId: currentTab.id,
});
```

Add a callback-safe helper:

```js
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
```

If action-state notification fails, keep the overlay active and close the popup; the in-page More menu remains a reliable exit path.

- [ ] **Step 4: Run tests and checks**

Run: `npm test && npm run check`

Expected: all tests PASS and `Extension structure looks good.`

- [ ] **Step 5: Commit**

```bash
git add src/popup/popup.js tests/comment-mode-ui.test.mjs
git commit -m "feat: synchronize popup and overlay activation"
```

### Task 6: Verify the complete interaction in Chrome

**Files:**
- Modify only if verification reveals a failure in the scoped behavior.

- [ ] **Step 1: Reload the unpacked extension**

Open `chrome://extensions`, reload WebComment, then open `http://localhost:4173/demo/test-page.html` using the existing demo-server instructions.

- [ ] **Step 2: Verify single-step entry**

Click the Chrome action icon, then `開始標注` once.

Expected: popup closes, the conversation cursor appears immediately, the toolbar says `標注模式 · 點擊頁面留言`, and no second toolbar click is needed.

- [ ] **Step 3: Verify placement exit**

Click `完成`, re-enter with `標注`, and press `Esc`.

Expected: each action restores the normal cursor while toolbar, pins, and comment list remain.

- [ ] **Step 4: Verify full close from the overlay**

Open `更多` and click `關閉 WebComment`.

Expected: toolbar, list, pins, cursor, and overlay root disappear; stored annotations return after a later activation.

- [ ] **Step 5: Verify Chrome icon close and per-tab isolation**

Activate WebComment again, then click the active Chrome icon. Repeat with a second normal-site or localhost tab.

Expected: the first click closes only the active tab's overlay; the other tab is unchanged; the next click on the closed tab opens the popup.

- [ ] **Step 6: Verify regression cases**

Check a normal HTTPS website, localhost, page reload, first comment creation, draft cancel, comment submit, list hide/show, resolved filter, and existing pin selection.

Expected: no duplicate listeners, no stuck custom cursor, and existing comment features continue to work.

- [ ] **Step 7: Run final automated verification**

Run: `npm test && npm run check && git diff --check`

Expected: all tests PASS, structure check succeeds, and no whitespace errors.

- [ ] **Step 8: Final implementation commit if verification required adjustments**

```bash
git add src tests scripts package.json manifest.json
git commit -m "fix: finalize comment mode lifecycle"
```
