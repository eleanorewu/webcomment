# Persistent Thread Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show edit, delete, and resolve or reopen actions permanently in every primary annotation card footer while tightening author and timestamp metadata to a combined 26px line height.

**Architecture:** Keep the existing thread card selection and detail rendering model, but move `renderOriginalControls(item)` from the expandable detail into a sibling footer outside `.wc-thread-main`. Reuse the existing action handlers and storage operations, add the minimum state updates needed for editing a collapsed card, and adjust only the embedded overlay styles and aligned documentation.

**Tech Stack:** Manifest V3, browser JavaScript, Shadow DOM, embedded CSS, Node.js built-in test runner.

---

### Task 1: Add Persistent Footer Regression Coverage

**Files:**
- Modify: `tests/comment-mode-ui.test.mjs`
- Test: `tests/comment-mode-ui.test.mjs`

- [ ] **Step 1: Write the failing regression test**

Append this test to `tests/comment-mode-ui.test.mjs`:

```js
test('thread cards expose persistent actions with compact author metadata', () => {
  const itemStart = content.indexOf('function renderThreadListItem');
  const detailStart = content.indexOf('function renderThreadDetail');
  const controlsStart = content.indexOf('function renderOriginalControls');
  const editableStart = content.indexOf('function renderEditableComment');
  const stylesStart = content.indexOf('function styles');

  const itemSource = content.slice(itemStart, detailStart);
  const detailSource = content.slice(detailStart, controlsStart);
  const controlsSource = content.slice(controlsStart, editableStart);
  const stylesSource = content.slice(stylesStart);

  assert.match(itemSource, /class="wc-thread-author-meta"/);
  assert.match(itemSource, /class="wc-thread-footer"/);
  assert.match(itemSource, /data-action="open-thread"/);
  assert.match(itemSource, /append\(renderOriginalControls\(item\)\)/);
  assert.doesNotMatch(detailSource, /renderOriginalControls/);
  assert.match(
    controlsSource,
    /data-action="edit"[\s\S]*?state\.selectedThreadId = item\.thread\.id;[\s\S]*?state\.editingCommentId = item\.original\.id;/,
  );
  assert.match(stylesSource, /\.wc-thread-author-meta strong[\s\S]*?line-height: 14px/);
  assert.match(stylesSource, /\.wc-thread-author-meta span[\s\S]*?line-height: 12px/);
  assert.match(stylesSource, /\.wc-thread-footer[\s\S]*?flex-wrap: wrap/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test --test-name-pattern="thread cards expose persistent actions" tests/comment-mode-ui.test.mjs
```

Expected: FAIL because the card has no persistent footer or author metadata wrapper and the detail still renders the original controls.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/comment-mode-ui.test.mjs
git commit -m "test: cover persistent thread actions"
```

### Task 2: Render Actions In A Persistent Card Footer

**Files:**
- Modify: `src/content/content-script.js:907-1068`
- Test: `tests/comment-mode-ui.test.mjs`

- [ ] **Step 1: Add the author metadata wrapper and persistent footer**

In `renderThreadListItem`, replace the card template and listeners with this structure:

```js
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
```

Keep the existing selected-detail rendering immediately after these listeners:

```js
const detail = article.querySelector('.wc-thread-detail');
if (isSelected) {
  detail.append(renderThreadDetail(item));
}
```

- [ ] **Step 2: Remove duplicate controls from expanded detail**

In `renderThreadDetail`, delete:

```js
const originalControls = renderOriginalControls(item);
```

and delete:

```js
node.append(originalControls);
```

Update the nearby comment from:

```js
// 一般模式：操作按鈕 → 回覆列表 → 回覆表單
```

to:

```js
// 一般模式：回覆列表 → 回覆表單
```

- [ ] **Step 3: Make edit select a collapsed thread before rendering**

Change the edit handler in `renderOriginalControls` to:

```js
node.querySelector('[data-action="edit"]').addEventListener('click', () => {
  state.selectedThreadId = item.thread.id;
  state.editingCommentId = item.original.id;
  state.draft = null;
  state.commentMode = false;
  render();
});
```

Do not change delete, resolve, reopen, badge, or storage behavior.

- [ ] **Step 4: Add footer and compact metadata styles**

In `styles()`, keep the shared typography rules and add:

```css
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

.wc-thread-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  padding: 0 14px 14px;
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
```

Keep `.wc-original-controls { min-height: 20px; }` and add `margin-left: auto` so actions remain right-aligned after wrapping:

```css
.wc-original-controls {
  min-height: 20px;
  margin-left: auto;
}
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
node --test --test-name-pattern="thread cards expose persistent actions" tests/comment-mode-ui.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Run the complete automated suite**

Run:

```bash
npm test
npm run check
git diff --check
```

Expected: all tests pass, the extension structure check succeeds, and no whitespace errors are reported.

- [ ] **Step 7: Commit the runtime implementation**

```bash
git add src/content/content-script.js
git commit -m "feat: show persistent thread actions"
```

### Task 3: Align Design And Component Documentation

**Files:**
- Modify: `docs/04_DESIGN_SPEC.md:179-205`
- Modify: `docs/05_COMPONENT_SPEC.md:276-289`

- [ ] **Step 1: Update the design specification**

Under `Thread list` in `docs/04_DESIGN_SPEC.md`, add:

```markdown
    - Persistent footer with reply count on the left and edit, delete, and resolve/reopen actions on the right
    - Author name and timestamp use a compact 26px combined two-line height
```

Under `Selected thread detail`, remove the original-message action-row bullet so the section becomes:

```markdown
5. Selected thread detail
    - Replies
    - Reply composer
```

- [ ] **Step 2: Update the component specification**

Under `Thread list item layout` in `docs/05_COMPONENT_SPEC.md`, add:

```markdown
- Persistent footer: reply count on the left; edit, delete, and resolve/reopen actions on the right.
- Author name and timestamp use line heights of 14px and 12px with no row gap, for a 26px combined height.
```

Under `Interactions`, add:

```markdown
- Footer actions remain visible in collapsed and expanded states and do not toggle thread expansion.
- Clicking the reply count selects and expands the thread; clicking edit also opens the original-comment edit form.
```

- [ ] **Step 3: Verify documentation and diff consistency**

Run:

```bash
rg -n "Persistent footer|26px combined|Footer actions remain visible" docs/04_DESIGN_SPEC.md docs/05_COMPONENT_SPEC.md
git diff --check
```

Expected: all new requirements are found and the diff check exits successfully.

- [ ] **Step 4: Commit the documentation alignment**

```bash
git add docs/04_DESIGN_SPEC.md docs/05_COMPONENT_SPEC.md
git commit -m "docs: specify persistent thread footer"
```

### Task 4: Final Verification

**Files:**
- Verify: `src/content/content-script.js`
- Verify: `tests/comment-mode-ui.test.mjs`
- Verify: `docs/04_DESIGN_SPEC.md`
- Verify: `docs/05_COMPONENT_SPEC.md`

- [ ] **Step 1: Run fresh automated verification**

```bash
npm test
npm run check
git diff --check
git status --short --branch
```

Expected: all tests pass, the extension structure check succeeds, the diff check reports no errors, and the working tree is clean.

- [ ] **Step 2: Perform manual Chrome verification**

Reload the unpacked extension and refresh the demo page, then verify:

1. Collapsed cards permanently show the reply summary and all original-message actions.
2. Open and resolved cards show the correct resolve or reopen action.
3. Clicking reply summary expands the thread.
4. Clicking edit on a collapsed card expands directly into the edit form.
5. Clicking delete or resolve does not expand the card as a side effect.
6. Expanded cards do not duplicate the action row.
7. The author and timestamp are visibly tighter and remain aligned with the avatar.
8. At narrow sidebar widths, the footer wraps without overlap or clipping.
9. Keyboard Tab order reaches reply summary, edit, delete, and resolve or reopen controls with visible focus.

- [ ] **Step 3: Review the stacked branch scope**

```bash
git diff codex/drag-pin-in-comment-mode...HEAD --stat
git log --oneline codex/drag-pin-in-comment-mode..HEAD
```

Expected: the stacked branch adds only the persistent-actions design, plan, regression test, runtime implementation, and aligned documentation on top of `codex/drag-pin-in-comment-mode`.
