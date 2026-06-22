# Simplify Overlay Toolbar Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove ambiguous and redundant overlay-toolbar controls while exposing the comment-list visibility action directly.

**Architecture:** Keep `renderToolbar` as the single owner of toolbar markup and listeners. Replace the More popover with one direct sidebar toggle, remove toolbar-only resolved filtering and menu state, and retain the sidebar resolved filter plus message-driven overlay deactivation.

**Tech Stack:** Chrome Extension Manifest V3, JavaScript, CSS-in-JavaScript, Node.js built-in test runner

---

## File Structure

- Modify `tests/comment-mode-ui.test.mjs`: Replace obsolete lifecycle-control expectations with regression coverage for the simplified toolbar.
- Modify `src/content/content-script.js`: Simplify toolbar markup, listeners, state, and menu-only styles.
- Modify `docs/02_UX_FLOW.md`: Make Chrome action-icon deactivation the only documented overlay exit path.
- Modify `docs/04_DESIGN_SPEC.md`: Document the direct comment-list visibility control.
- Modify `docs/05_COMPONENT_SPEC.md`: Align toolbar contents and behavior with the simplified control set.

### Task 1: Add Toolbar Simplification Regression Coverage

**Files:**
- Modify: `tests/comment-mode-ui.test.mjs:15-22`

- [x] **Step 1: Replace the obsolete toolbar-controls test**

Replace `comment mode has approved done, more, and close controls` with:

```js
test('toolbar exposes the comment list directly without redundant controls', () => {
  const toolbarStart = content.indexOf('function renderToolbar');
  const sidebarStart = content.indexOf('function renderSidebar');
  const toolbarSource = content.slice(toolbarStart, sidebarStart);

  assert.match(toolbarSource, /data-action="finish-comment"/);
  assert.match(toolbarSource, /data-action="toggle-sidebar"/);
  assert.match(toolbarSource, /state\.sidebarOpen \? '隱藏留言列表' : '顯示留言列表'/);
  assert.doesNotMatch(toolbarSource, /data-action="toggle-resolved"/);
  assert.doesNotMatch(toolbarSource, /data-action="toggle-more"/);
  assert.doesNotMatch(toolbarSource, /data-action="deactivate"/);
  assert.doesNotMatch(toolbarSource, /關閉 WebComment/);
});
```

- [x] **Step 2: Add dead menu-state and styling assertions**

Append:

```js
test('toolbar removes obsolete More menu state and styling', () => {
  assert.doesNotMatch(content, /moreMenuOpen/);
  assert.doesNotMatch(content, /\.wc-more-menu/);
});
```

- [x] **Step 3: Run the focused test to verify RED**

Run:

```bash
node --test tests/comment-mode-ui.test.mjs
```

Expected: FAIL because the toolbar still renders resolved, More, and close controls and still contains menu state and styles.

### Task 2: Simplify the Overlay Toolbar

**Files:**
- Modify: `src/content/content-script.js:7-18`
- Modify: `src/content/content-script.js:155-186`
- Modify: `src/content/content-script.js:714-777`
- Modify: `src/content/content-script.js:1718-1796`
- Test: `tests/comment-mode-ui.test.mjs`

- [x] **Step 1: Remove obsolete menu state**

Delete `moreMenuOpen` from the initial state and remove assignments to `state.moreMenuOpen` from activation, deactivation, comment-mode entry, and comment-mode completion.

- [x] **Step 2: Render the sidebar toggle directly**

Keep the mode-specific controls, then render only the direct list control after them:

```js
toolbar.innerHTML = `
  ${primaryControls}
  <button class="wc-icon-tool" data-action="toggle-sidebar" type="button">
    ${state.sidebarOpen ? '隱藏留言列表' : '顯示留言列表'}
  </button>
`;
```

Remove the toolbar `toggle-resolved`, `toggle-more`, and `deactivate` markup and listeners. Keep this direct listener:

```js
toolbar.querySelector('[data-action="toggle-sidebar"]').addEventListener('click', () => {
  state.sidebarOpen = !state.sidebarOpen;
  render();
});
```

- [x] **Step 3: Remove menu-only styles**

Delete the complete `.wc-more-menu`, `.wc-more-menu[hidden]`, `.wc-more-menu button`, `.wc-more-menu button:hover`, and `.wc-more-menu button.is-danger` rule blocks. Keep `.wc-tool` and `.wc-icon-tool` unchanged so the direct list control inherits the existing pill treatment.

- [x] **Step 4: Run the focused test to verify GREEN**

Run:

```bash
node --test tests/comment-mode-ui.test.mjs
```

Expected: PASS with all comment-mode UI tests passing.

### Task 3: Align Product Documentation

**Files:**
- Modify: `docs/02_UX_FLOW.md:102-119`
- Modify: `docs/04_DESIGN_SPEC.md:82-94`
- Modify: `docs/05_COMPONENT_SPEC.md:116-141`

- [x] **Step 1: Update the overlay exit flow**

In `docs/02_UX_FLOW.md`, document that clicking the active Chrome extension icon removes the overlay. Remove the More-menu close path and its exit rule while preserving the distinction between `完成` and full deactivation.

- [x] **Step 2: Update toolbar design guidance**

In `docs/04_DESIGN_SPEC.md`, replace the More-menu close requirement with direct `顯示留言列表` / `隱藏留言列表` guidance. State that resolved visibility remains in the sidebar.

- [x] **Step 3: Update toolbar component responsibilities**

In `docs/05_COMPONENT_SPEC.md`, remove `Show resolved toggle` and `More menu with 關閉 WebComment` from toolbar contents. Add the direct comment-list visibility toggle and state that Chrome action-icon deactivation removes the overlay.

- [x] **Step 4: Check documentation and source for obsolete UI text**

Run:

```bash
rg -n "More menu with|Open More|toolbar's More menu|data-action=\"toggle-more\"|關閉 WebComment" src/content/content-script.js docs/02_UX_FLOW.md docs/04_DESIGN_SPEC.md docs/05_COMPONENT_SPEC.md
```

Expected: no matches.

### Task 4: Verify the Complete Change

**Files:**
- Test: `tests/comment-mode-ui.test.mjs`
- Test: `tests/service-worker.test.mjs`

- [x] **Step 1: Run the full automated test suite**

Run:

```bash
npm test
```

Expected: all tests pass with zero failures.

- [x] **Step 2: Run the extension structure check**

Run:

```bash
npm run check
```

Expected: `Extension structure looks good.`

- [x] **Step 3: Run whitespace validation**

Run:

```bash
git diff --check
```

Expected: no output and exit code 0.

- [x] **Step 4: Review the final diff against the approved design**

Run:

```bash
git diff -- src/content/content-script.js tests/comment-mode-ui.test.mjs docs/02_UX_FLOW.md docs/04_DESIGN_SPEC.md docs/05_COMPONENT_SPEC.md
```

Expected: only toolbar simplification, regression coverage, and matching documentation changes appear.
