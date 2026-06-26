# Comment Composer Adaptive Multiline Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all comment textareas start compact, adapt to multiline text-field styling when multiline content is entered or Shift + Enter is pressed, and refocus reply inputs after successful reply submit.

**Architecture:** Keep this as a content-script-only change. Add small DOM helpers in `src/content/content-script.js`, bind them at the existing textarea setup points, and update embedded styles so `.is-multiline` controls the visual transition. Use existing source-pattern tests in `tests/comment-mode-ui.test.mjs` to verify behavior without introducing a DOM harness.

**Tech Stack:** Chrome Extension Manifest V3, plain JavaScript content script, Shadow DOM, Node.js built-in test runner

---

## File Structure

- Modify: `tests/comment-mode-ui.test.mjs` — add source-pattern tests for reply refocus, adaptive binding coverage, Shift + Enter handling, and `.is-multiline` styling.
- Modify: `src/content/content-script.js` — add `focusReplyTextarea` and `bindAdaptiveCommentTextarea`; call adaptive binding from all comment textarea setup points; call reply refocus after popover/sidebar reply submit; adjust embedded CSS.

No store, permission, popup, background, or data model files should change.

---

### Task 1: RED Tests for Reply Refocus and Adaptive Composer Coverage

**Files:**
- Modify: `tests/comment-mode-ui.test.mjs`

- [ ] **Step 1: Add failing source-pattern tests**

Append these tests after the existing own-comment tests in `tests/comment-mode-ui.test.mjs`:

```js
test('reply submit handlers refocus the reply textarea after re-render', () => {
  const popoverSource = sourceBetween('function renderPinPreview', 'function isOwnComment');
  const detailSource = sourceBetween('function renderThreadDetail', 'function renderOriginalControls');

  assert.match(
    popoverSource,
    /await refreshData\(\);[\s\S]*?renderPinPreview\(\);[\s\S]*?focusReplyTextarea\('\.wc-popover-reply'\);/,
  );
  assert.match(
    detailSource,
    /await refreshData\(\);[\s\S]*?state\.editingCommentId = null;[\s\S]*?render\(\);[\s\S]*?focusReplyTextarea\('\.wc-reply-form'\);/,
  );
});

test('comment textareas bind adaptive multiline behavior across composer surfaces', () => {
  assert.match(content, /function bindAdaptiveCommentTextarea\(textarea/);
  assert.match(content, /function focusReplyTextarea\(formSelector\)/);

  const popoverSource = sourceBetween('function renderPinPreview', 'function isOwnComment');
  const draftSource = sourceBetween('function renderDraftComposer', 'function renderToolbar');
  const detailSource = sourceBetween('function renderThreadDetail', 'function renderOriginalControls');
  const editableSource = sourceBetween('function renderEditableComment', 'function styles');

  assert.match(popoverSource, /bindAdaptiveCommentTextarea\(replyTextarea\)/);
  assert.match(popoverSource, /bindAdaptiveCommentTextarea\(ta\)/);
  assert.match(draftSource, /bindAdaptiveCommentTextarea\(draftTextarea\)/);
  assert.match(detailSource, /bindAdaptiveCommentTextarea\(ta\)/);
  assert.match(detailSource, /bindAdaptiveCommentTextarea\(replyTextarea\)/);
  assert.match(editableSource, /bindAdaptiveCommentTextarea\(textarea\)/);
});

test('adaptive comment textarea keeps compact default and switches on multiline intent', () => {
  const helperSource = sourceBetween('function bindAdaptiveCommentTextarea', 'function styles');
  const stylesSource = sourceFrom('function styles');

  assert.match(helperSource, /textarea\.value\.includes\('\\n'\)/);
  assert.match(helperSource, /event\.key === 'Enter' && event\.shiftKey/);
  assert.match(helperSource, /classList\.toggle\('is-multiline'/);
  assert.match(stylesSource, /\.wc-popover-input-wrap[\s\S]*?border-radius: 999px;/);
  assert.match(stylesSource, /\.wc-popover-input-wrap\.is-multiline[\s\S]*?border-radius: 8px;/);
  assert.match(stylesSource, /\.wc-popover-input-wrap\.is-multiline[\s\S]*?align-items: flex-end;/);
  assert.match(stylesSource, /\.wc-comment-textarea\.is-multiline[\s\S]*?min-height: 72px;/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/comment-mode-ui.test.mjs
```

Expected: FAIL. The failure should mention missing `focusReplyTextarea`, missing `bindAdaptiveCommentTextarea`, or missing `.is-multiline` style patterns.

- [ ] **Step 3: Commit the RED tests**

Only commit if the failure is the expected missing-feature failure.

```bash
git add tests/comment-mode-ui.test.mjs
git commit -m "test: cover adaptive comment composer behavior"
```

---

### Task 2: Add Comment Textarea Helpers and Bind All Surfaces

**Files:**
- Modify: `src/content/content-script.js`

- [ ] **Step 1: Add helper functions after `bindSubmitEnabled`**

In `src/content/content-script.js`, replace the helper area around `bindSubmitEnabled` with:

```js
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
  const surface = textarea.closest('.wc-comment-input-surface') || textarea.closest('.wc-popover-input-wrap') || textarea;
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
```

- [ ] **Step 2: Bind popover reply textarea**

In `renderPinPreview`, replace:

```js
bindSubmitEnabled(replyForm.querySelector('textarea'), replyForm.querySelector('button[type="submit"]'));
```

with:

```js
const replyTextarea = replyForm.querySelector('textarea');
bindSubmitEnabled(replyTextarea, replyForm.querySelector('button[type="submit"]'));
bindAdaptiveCommentTextarea(replyTextarea);
```

- [ ] **Step 3: Bind popover edit textarea**

In `buildPopoverComment`, inside the editing branch `setTimeout`, replace:

```js
const ta = article.querySelector('textarea');
if (ta) {
  ta.focus();
  bindSubmitEnabled(ta, article.querySelector('button[type="submit"]'));
}
```

with:

```js
const ta = article.querySelector('textarea');
if (ta) {
  ta.focus();
  bindSubmitEnabled(ta, article.querySelector('button[type="submit"]'));
  bindAdaptiveCommentTextarea(ta);
}
```

- [ ] **Step 4: Bind floating new-comment textarea**

In `renderDraftComposer`, replace:

```js
bindSubmitEnabled(composer.querySelector('textarea'), composer.querySelector('button[type="submit"]'));
```

with:

```js
const draftTextarea = composer.querySelector('textarea');
bindSubmitEnabled(draftTextarea, composer.querySelector('button[type="submit"]'));
bindAdaptiveCommentTextarea(draftTextarea);
```

- [ ] **Step 5: Bind sidebar original edit textarea**

In `renderThreadDetail`, inside the original-comment editing branch `setTimeout`, replace:

```js
const ta = form.querySelector('textarea');
if (ta) {
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  bindSubmitEnabled(ta, form.querySelector('button[type="submit"]'));
}
```

with:

```js
const ta = form.querySelector('textarea');
if (ta) {
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  bindSubmitEnabled(ta, form.querySelector('button[type="submit"]'));
  bindAdaptiveCommentTextarea(ta);
}
```

- [ ] **Step 6: Bind sidebar reply textarea**

In `renderThreadDetail`, replace:

```js
bindSubmitEnabled(form.querySelector('textarea'), form.querySelector('button[type="submit"]'));
```

with:

```js
const replyTextarea = form.querySelector('textarea');
bindSubmitEnabled(replyTextarea, form.querySelector('button[type="submit"]'));
bindAdaptiveCommentTextarea(replyTextarea);
```

- [ ] **Step 7: Bind sidebar editable comment/reply textarea**

In `renderEditableComment`, inside the editing branch `setTimeout`, replace:

```js
const textarea = node.querySelector('textarea');
if (textarea) {
  textarea.focus();
  bindSubmitEnabled(textarea, node.querySelector('button[type="submit"]'));
}
```

with:

```js
const textarea = node.querySelector('textarea');
if (textarea) {
  textarea.focus();
  bindSubmitEnabled(textarea, node.querySelector('button[type="submit"]'));
  bindAdaptiveCommentTextarea(textarea);
}
```

- [ ] **Step 8: Run focused test and verify partial GREEN expectations**

Run:

```bash
node --test tests/comment-mode-ui.test.mjs
```

Expected: Still FAIL until Task 3 and Task 4 are implemented. The adaptive helper/binding assertions from Task 1 should now pass.

---

### Task 3: Refocus Reply Textareas After Successful Reply Submit

**Files:**
- Modify: `src/content/content-script.js`

- [ ] **Step 1: Refocus popover reply textarea**

In `renderPinPreview`, update the reply submit handler from:

```js
await store.addReply(thread.id, body);
await refreshData();
renderPinPreview();
showToast('回覆已送出。');
```

to:

```js
await store.addReply(thread.id, body);
textarea.value = '';
await refreshData();
renderPinPreview();
focusReplyTextarea('.wc-popover-reply');
showToast('回覆已送出。');
```

- [ ] **Step 2: Refocus sidebar reply textarea**

In `renderThreadDetail`, update the sidebar reply submit handler from:

```js
await store.addReply(item.thread.id, body);
form.reset();
await refreshData();
state.editingCommentId = null;
render();
```

to:

```js
await store.addReply(item.thread.id, body);
form.reset();
await refreshData();
state.editingCommentId = null;
render();
focusReplyTextarea('.wc-reply-form');
```

- [ ] **Step 3: Run focused test and verify remaining expected failures**

Run:

```bash
node --test tests/comment-mode-ui.test.mjs
```

Expected: Still FAIL until Task 4 styling is implemented. The reply refocus assertions should now pass.

---

### Task 4: Add Adaptive Multiline Styling

**Files:**
- Modify: `src/content/content-script.js`

- [ ] **Step 1: Update reply wrapper alignment and multiline radius**

In the embedded `styles()` output, replace the `.wc-popover-input-wrap` block with:

```css
.wc-popover-input-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--panel-border);
  border-radius: 999px;
  padding: 0 6px 0 12px;
  background: var(--panel-soft);
  transition: border-radius 120ms ease, padding 120ms ease;
}

.wc-popover-input-wrap.is-multiline {
  align-items: flex-end;
  border-radius: 8px;
  padding: 7px 7px 7px 10px;
}
```

Keep the existing `.wc-popover-input-wrap:focus-within` block after it.

- [ ] **Step 2: Update shared comment textarea styling**

Replace the `.wc-popover-input-wrap textarea` block with:

```css
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
```

- [ ] **Step 3: Update edit and floating composer radius to match 8px state**

In the `.wc-edit-form textarea, .wc-floating-composer textarea` block, change:

```css
border-radius: 7px;
```

to:

```css
border-radius: 8px;
```

- [ ] **Step 4: Run focused test and verify GREEN**

Run:

```bash
node --test tests/comment-mode-ui.test.mjs
```

Expected: PASS. All comment mode UI source-pattern tests pass.

- [ ] **Step 5: Commit implementation**

```bash
git add src/content/content-script.js tests/comment-mode-ui.test.mjs
git commit -m "feat: adapt comment composers for multiline input"
```

---

### Task 5: Full Verification

**Files:**
- No file changes expected.

- [ ] **Step 1: Run full tests**

Run:

```bash
npm test
```

Expected: PASS with all tests passing.

- [ ] **Step 2: Run extension structure check**

Run:

```bash
npm run check
```

Expected: PASS with `Extension structure looks good.`

- [ ] **Step 3: Inspect final diff**

Run:

```bash
git status --short
git diff -- src/content/content-script.js tests/comment-mode-ui.test.mjs
```

Expected: Working tree is clean if Task 4 committed successfully. If there are uncommitted changes, review them before reporting completion.

---

## Self-Review Notes

- Spec coverage: Task 3 covers reply refocus; Task 2 covers all comment textarea surfaces; Task 4 covers compact default and `.is-multiline` text-field styling; Task 1 verifies Shift + Enter and helper behavior; Task 5 verifies no broad regression.
- Scope check: This plan touches only content-script UI and source-pattern tests. It does not change store, permissions, owner/guest logic, popup, background, or persisted data.
- TDD order: Task 1 writes failing tests before production changes. Tasks 2-4 make minimal content-script changes to satisfy those tests.
