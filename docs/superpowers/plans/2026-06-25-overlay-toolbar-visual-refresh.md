# Overlay Toolbar Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the overlay toolbar into a compact three-zone control with stable widths, approved icons, a toolbar close button, and `標註` terminology.

**Architecture:** Keep `renderToolbar` in `src/content/content-script.js` as the single owner of toolbar markup and listeners. Add toolbar-local SVG constants, replace the current meta-plus-button layout with three fixed control zones, route the new `X` button through the existing `deactivateOverlay()` lifecycle, and update only toolbar-related tests and docs.

**Tech Stack:** Chrome Extension Manifest V3, plain JavaScript, Shadow DOM, CSS-in-JavaScript, Node.js built-in test runner

---

## File Structure

- Modify `tests/comment-mode-ui.test.mjs`: Update toolbar regression tests before implementation so they fail against the current `標注模式 · 點擊頁面留言` / `完成` toolbar.
- Modify `src/content/content-script.js`: Add toolbar SVG constants, replace `renderToolbar` markup/listeners, and update toolbar CSS.
- Modify `docs/02_UX_FLOW.md`: Align annotation placement and overlay exit flow with `標註` / `標註中` and toolbar `X` close.
- Modify `docs/04_DESIGN_SPEC.md`: Document the new visual treatment, fixed zones, icons, dividers, and close control.
- Modify `docs/05_COMPONENT_SPEC.md`: Align Overlay Toolbar contents and behavior with the three-zone toolbar.

### Task 1: Add Toolbar Visual Refresh Regression Coverage

**Files:**
- Modify: `tests/comment-mode-ui.test.mjs`
- Test: `tests/comment-mode-ui.test.mjs`

- [ ] **Step 1: Replace the existing toolbar control test**

Replace the current `toolbar exposes the comment list directly without redundant controls` test with:

```js
test('toolbar renders the refreshed three-zone control set', () => {
  const toolbarStart = content.indexOf('function renderToolbar');
  const sidebarStart = content.indexOf('function renderSidebar');
  const toolbarSource = content.slice(toolbarStart, sidebarStart);

  assert.match(toolbarSource, /TOOLBAR_ANNOTATION_ICON/);
  assert.match(toolbarSource, /TOOLBAR_EYE_OPEN_ICON/);
  assert.match(toolbarSource, /TOOLBAR_EYE_CLOSED_ICON/);
  assert.match(toolbarSource, /data-action="toggle-comment"/);
  assert.match(toolbarSource, /state\.commentMode \? '標註中' : '標註'/);
  assert.match(toolbarSource, /state\.sidebarOpen \? '隱藏留言列表' : '顯示留言列表'/);
  assert.match(toolbarSource, /data-action="deactivate"/);
  assert.match(toolbarSource, /deactivateOverlay\(\)/);
  assert.doesNotMatch(toolbarSource, /標注模式 · 點擊頁面留言/);
  assert.doesNotMatch(toolbarSource, />完成</);
  assert.doesNotMatch(toolbarSource, /data-action="finish-comment"/);
  assert.doesNotMatch(toolbarSource, /data-action="toggle-resolved"/);
  assert.doesNotMatch(toolbarSource, /data-action="toggle-more"/);
  assert.doesNotMatch(toolbarSource, /關閉 WebComment/);
});
```

- [ ] **Step 2: Replace the obsolete More-menu styling test**

Replace the current `toolbar removes obsolete More menu state and styling` test with:

```js
test('toolbar visual refresh uses fixed zones, dividers, and button-only hover', () => {
  const stylesStart = content.indexOf('function styles');
  const stylesSource = content.slice(stylesStart);

  assert.doesNotMatch(content, /moreMenuOpen/);
  assert.doesNotMatch(content, /\.wc-more-menu/);
  assert.match(stylesSource, /\.wc-toolbar[\s\S]*?border-radius: 12px;/);
  assert.match(stylesSource, /\.wc-toolbar[\s\S]*?gap: 0;/);
  assert.match(stylesSource, /\.wc-toolbar-zone[\s\S]*?display: inline-flex;/);
  assert.match(stylesSource, /\.wc-toolbar-zone\.is-annotation[\s\S]*?width: 112px;/);
  assert.match(stylesSource, /\.wc-toolbar-zone\.is-list[\s\S]*?width: 168px;/);
  assert.match(stylesSource, /\.wc-toolbar-close[\s\S]*?width: 48px;/);
  assert.match(stylesSource, /\.wc-toolbar-divider[\s\S]*?width: 1px;/);
  assert.match(stylesSource, /\.wc-toolbar-zone:hover[\s\S]*?background: var\(--panel-soft\);/);
  assert.match(stylesSource, /\.wc-toolbar-zone\.is-active[\s\S]*?background: var\(--panel-soft\);/);
});
```

- [ ] **Step 3: Add lifecycle preservation coverage**

Keep the existing `content script exposes explicit overlay lifecycle` test, and add this test after it:

```js
test('toolbar close and extension icon share the overlay deactivation lifecycle', () => {
  const messageStart = content.indexOf('async function handleMessage');
  const refreshStart = content.indexOf('async function refreshData');
  const messageSource = content.slice(messageStart, refreshStart);
  const toolbarStart = content.indexOf('function renderToolbar');
  const sidebarStart = content.indexOf('function renderSidebar');
  const toolbarSource = content.slice(toolbarStart, sidebarStart);

  assert.match(messageSource, /WEB_COMMENT_DEACTIVATE/);
  assert.match(messageSource, /return deactivateOverlay\(\);/);
  assert.match(toolbarSource, /data-action="deactivate"/);
  assert.match(toolbarSource, /deactivateOverlay\(\)/);
});
```

- [ ] **Step 4: Run the focused test to verify RED**

Run:

```bash
node --test tests/comment-mode-ui.test.mjs
```

Expected: FAIL. The failure should mention missing `TOOLBAR_ANNOTATION_ICON`, `標註`, `data-action="deactivate"`, and/or `border-radius: 12px` because the implementation still uses the old toolbar layout.

- [ ] **Step 5: Commit the failing toolbar tests**

Run:

```bash
git add tests/comment-mode-ui.test.mjs
git commit -m "test: cover overlay toolbar visual refresh"
```

Expected: commit succeeds with only `tests/comment-mode-ui.test.mjs` staged.

### Task 2: Implement the Refreshed Overlay Toolbar

**Files:**
- Modify: `src/content/content-script.js`
- Test: `tests/comment-mode-ui.test.mjs`

- [ ] **Step 1: Add toolbar SVG constants**

In `src/content/content-script.js`, immediately after `const SUBMIT_ICON = ...`, add:

```js
  const TOOLBAR_ANNOTATION_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12.034 12.681C11.9979 12.5906 11.9892 12.4915 12.0088 12.3962C12.0285 12.3008 12.0756 12.2133 12.1445 12.1445C12.2133 12.0756 12.3008 12.0285 12.3962 12.0088C12.4915 11.9892 12.5906 11.998 12.681 12.034L21.681 15.534C21.7775 15.5717 21.8599 15.6384 21.9168 15.725C21.9737 15.8116 22.0023 15.9137 21.9987 16.0172C21.9951 16.1207 21.9594 16.2206 21.8966 16.3029C21.8337 16.3853 21.7469 16.4461 21.648 16.477L18.204 17.545C18.0486 17.593 17.9073 17.6783 17.7923 17.7933C17.6773 17.9083 17.592 18.0496 17.544 18.205L16.477 21.648C16.4461 21.7469 16.3853 21.8338 16.3029 21.8966C16.2206 21.9594 16.1207 21.9951 16.0172 21.9987C15.9137 22.0023 15.8116 21.9737 15.725 21.9168C15.6384 21.8599 15.5717 21.7775 15.534 21.681L12.034 12.681Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 3C4.46957 3 3.96086 3.21071 3.58579 3.58579C3.21071 3.96086 3 4.46957 3 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 3C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 21C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 3H10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 21H11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 3H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 9V10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 9V11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 14V15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const TOOLBAR_EYE_OPEN_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.06199 11.652C1.97865 11.8765 1.97865 12.1235 2.06199 12.348C2.87369 14.3161 4.2515 15.999 6.02076 17.1831C7.79001 18.3672 9.87103 18.9994 12 18.9994C14.1289 18.9994 16.21 18.3672 17.9792 17.1831C19.7485 15.999 21.1263 14.3161 21.938 12.348C22.0213 12.1235 22.0213 11.8765 21.938 11.652C21.1263 9.68385 19.7485 8.00103 17.9792 6.81689C16.21 5.63275 14.1289 5.00061 12 5.00061C9.87103 5.00061 7.79001 5.63275 6.02076 6.81689C4.2515 8.00103 2.87369 9.68385 2.06199 11.652Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const TOOLBAR_EYE_CLOSED_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 18L14.278 14.75" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 8C2.74835 10.0508 4.10913 11.8219 5.8979 13.0733C7.68667 14.3247 9.81695 14.9959 12 14.9959C14.1831 14.9959 16.3133 14.3247 18.1021 13.0733C19.8909 11.8219 21.2516 10.0508 22 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 15L18.274 12.95" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 15L5.726 12.95" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 18L9.722 14.75" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
```

- [ ] **Step 2: Replace `renderToolbar`**

Replace the full `function renderToolbar() { ... }` block with:

```js
  function renderToolbar() {
    const toolbar = shadow.querySelector('[data-toolbar]');
    const commentLabel = state.commentMode ? '標註中' : '標註';
    const listLabel = state.sidebarOpen ? '隱藏留言列表' : '顯示留言列表';
    const listIcon = state.sidebarOpen ? TOOLBAR_EYE_CLOSED_ICON : TOOLBAR_EYE_OPEN_ICON;

    toolbar.innerHTML = `
      <button class="wc-toolbar-zone wc-toolbar-button is-annotation ${state.commentMode ? 'is-active' : ''}" data-action="toggle-comment" type="button" aria-pressed="${state.commentMode ? 'true' : 'false'}">
        ${TOOLBAR_ANNOTATION_ICON}
        <span>${commentLabel}</span>
      </button>
      <span class="wc-toolbar-divider" aria-hidden="true"></span>
      <button class="wc-toolbar-zone wc-toolbar-button is-list" data-action="toggle-sidebar" type="button" aria-pressed="${state.sidebarOpen ? 'true' : 'false'}">
        ${listIcon}
        <span>${listLabel}</span>
      </button>
      <span class="wc-toolbar-divider" aria-hidden="true"></span>
      <button class="wc-toolbar-zone wc-toolbar-close" data-action="deactivate" type="button" aria-label="關閉 WebComment">
        <span aria-hidden="true">×</span>
      </button>
    `;

    toolbar.querySelector('[data-action="toggle-comment"]').addEventListener('click', () => {
      state.commentMode = !state.commentMode;
      state.draft = null;
      render();
      if (state.commentMode) showToast('請點擊頁面上要標註的位置。');
    });

    toolbar.querySelector('[data-action="toggle-sidebar"]').addEventListener('click', () => {
      state.sidebarOpen = !state.sidebarOpen;
      render();
    });

    toolbar.querySelector('[data-action="deactivate"]').addEventListener('click', () => {
      deactivateOverlay();
    });
  }
```

- [ ] **Step 3: Replace toolbar CSS**

Inside `function styles()`, replace the existing `.wc-toolbar`, `.wc-tool`, `.wc-icon-tool`, `.wc-tool.is-active`, and `.wc-toolbar-meta` rule blocks with:

```css
      .wc-toolbar {
        position: fixed;
        left: 50%;
        bottom: 22px;
        display: flex;
        align-items: center;
        gap: 0;
        max-width: calc(100vw - 32px);
        transform: translateX(-50%);
        border: 1px solid rgba(63, 63, 70, 0.9);
        border-radius: 12px;
        padding: 6px;
        background: rgba(35, 35, 35, 0.96);
        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.25);
        pointer-events: auto;
        backdrop-filter: blur(10px);
      }

      .wc-toolbar-zone {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-width: 0;
        height: 36px;
        border: 0;
        border-radius: 8px;
        color: var(--panel-text);
        background: transparent;
        cursor: pointer;
        font-size: 14px;
        line-height: 20px;
        white-space: nowrap;
      }

      .wc-toolbar-zone svg {
        flex: 0 0 auto;
      }

      .wc-toolbar-zone.is-annotation {
        width: 112px;
      }

      .wc-toolbar-zone.is-list {
        width: 168px;
      }

      .wc-toolbar-zone:hover,
      .wc-toolbar-zone.is-active {
        background: var(--panel-soft);
      }

      .wc-toolbar-zone:focus-visible {
        outline: 2px solid rgba(109, 99, 240, 0.9);
        outline-offset: 2px;
      }

      .wc-toolbar-close {
        width: 48px;
        font-size: 26px;
        line-height: 1;
      }

      .wc-toolbar-divider {
        display: block;
        width: 1px;
        height: 28px;
        margin: 0 6px;
        background: var(--panel-border);
      }
```

- [ ] **Step 4: Run the focused test to verify GREEN**

Run:

```bash
node --test tests/comment-mode-ui.test.mjs
```

Expected: PASS. All comment-mode UI tests pass.

- [ ] **Step 5: Commit the toolbar implementation**

Run:

```bash
git add src/content/content-script.js tests/comment-mode-ui.test.mjs
git commit -m "feat: refresh overlay toolbar controls"
```

Expected: commit succeeds with `src/content/content-script.js` and the already-updated toolbar tests staged.

### Task 3: Align Product Documentation

**Files:**
- Modify: `docs/02_UX_FLOW.md`
- Modify: `docs/04_DESIGN_SPEC.md`
- Modify: `docs/05_COMPONENT_SPEC.md`

- [ ] **Step 1: Update annotation placement and exit flow in UX flow**

In `docs/02_UX_FLOW.md`, replace this block:

```md
- Starting annotation from the popup must enter placement state immediately; users must not activate annotation a second time from the overlay toolbar.
- During placement, the bottom toolbar shows `標注模式 · 點擊頁面留言` with a `完成` action.
- `完成` returns to normal browsing while keeping the WebComment overlay active.
```

with:

```md
- Starting annotation from the popup must enter placement state immediately.
- During placement, the bottom toolbar shows `標註中`.
- Clicking `標註中` returns to normal browsing while keeping the WebComment overlay active.
```

Then replace this exit-flow text:

```md
Comment mode active
→ Click Done or press Escape
→ Normal cursor returns
→ Pins, toolbar, and comment list remain available

WebComment active
→ Click the active Chrome extension icon
→ Overlay root and WebComment page listeners are removed
→ Stored comments and pins remain unchanged
```

with:

```md
Comment mode active
→ Click `標註中` or press Escape
→ Normal cursor returns
→ Pins, toolbar, and comment list remain available

WebComment active
→ Click the toolbar `X` or the active Chrome extension icon
→ Overlay root and WebComment page listeners are removed
→ Stored comments and pins remain unchanged
```

Then replace these exit rules:

```md
- `完成` exits placement only; it does not close WebComment.
- When WebComment is active on a tab, clicking the Chrome action icon closes it on that tab. After close, the next icon click opens the popup again.
- Active and inactive action-icon behavior is scoped per tab.
```

with:

```md
- `標註中` exits placement only; it does not close WebComment.
- The toolbar `X` closes WebComment on the current tab.
- When WebComment is active on a tab, clicking the Chrome action icon also closes it on that tab. After close, the next icon click opens the popup again.
- Active and inactive action-icon behavior is scoped per tab.
```

- [ ] **Step 2: Update toolbar design guidance**

In `docs/04_DESIGN_SPEC.md`, replace the `### Overlay Toolbar` bullet list with:

```md
Position:

- Bottom center or top right.
- Must avoid covering clicked target as much as possible.
- Should be draggable in V2.
- Must not display the current pathname or raw `pageKey`.
- Use a compact dark rectangular toolbar with `12px` outer radius.
- Use three fixed-width zones separated by always-visible vertical dividers.
- Use `8px` rounded rectangular buttons.
- Outside comment mode, show `標註` as the entry action with the dashed pointer icon.
- In comment mode, show `標註中`; clicking it exits placement while keeping the overlay active.
- Show `顯示留言列表` / `隱藏留言列表` directly in the toolbar with the approved eye icons.
- Keep resolved visibility in the comment list instead of duplicating it in the toolbar.
- Show a toolbar `X` that closes WebComment on the current tab.
- Keep the active Chrome extension icon as another way to close WebComment on the current tab.
```

- [ ] **Step 3: Update toolbar component contents and behavior**

In `docs/05_COMPONENT_SPEC.md`, replace the `## 6. Overlay Toolbar` `Contains` list with:

```md
Contains:

- Fixed-width `標註` / `標註中` annotation control
- Direct `顯示留言列表` / `隱藏留言列表` toggle
- Toolbar `X` close control
- Always-visible dividers between toolbar zones
- Approved pointer and eye icons
```

Then replace the `Behavior` list with:

```md
Behavior:

- Popup activation enters comment mode directly.
- Clicking `標註` enters comment mode.
- Clicking `標註中` and pressing `Escape` leave comment mode without removing the overlay.
- Clicking the toolbar `X` removes the complete overlay from the current tab while preserving stored data.
- Clicking the active Chrome extension icon also removes the complete overlay from the current tab while preserving stored data.
- Resolved visibility remains available through the comment list's `查看已解決` / `返回未解決` control.
```

- [ ] **Step 4: Check source and docs for obsolete toolbar text**

Run:

```bash
rg -n "標注模式 · 點擊頁面留言|>完成<|data-action=\"finish-comment\"|wc-toolbar-meta|wc-tool|wc-icon-tool" src/content/content-script.js tests/comment-mode-ui.test.mjs docs/02_UX_FLOW.md docs/04_DESIGN_SPEC.md docs/05_COMPONENT_SPEC.md
```

Expected: no matches.

- [ ] **Step 5: Commit documentation alignment**

Run:

```bash
git add docs/02_UX_FLOW.md docs/04_DESIGN_SPEC.md docs/05_COMPONENT_SPEC.md
git commit -m "docs: align overlay toolbar refresh"
```

Expected: commit succeeds with only the three documentation files staged.

### Task 4: Verify the Complete Change

**Files:**
- Test: `tests/comment-mode-ui.test.mjs`
- Test: `tests/*.test.mjs`
- Test: `scripts/check-extension.mjs`

- [ ] **Step 1: Run focused toolbar tests**

Run:

```bash
node --test tests/comment-mode-ui.test.mjs
```

Expected: PASS. All tests in `tests/comment-mode-ui.test.mjs` pass.

- [ ] **Step 2: Run the full automated test suite**

Run:

```bash
npm test
```

Expected: PASS. All Node test files pass with zero failures.

- [ ] **Step 3: Run the extension structure check**

Run:

```bash
npm run check
```

Expected: PASS with `Extension structure looks good.`

- [ ] **Step 4: Run whitespace validation**

Run:

```bash
git diff --check
```

Expected: no output and exit code 0.

- [ ] **Step 5: Review the final diff against the approved design**

Run:

```bash
git diff -- src/content/content-script.js tests/comment-mode-ui.test.mjs docs/02_UX_FLOW.md docs/04_DESIGN_SPEC.md docs/05_COMPONENT_SPEC.md
```

Expected: the diff contains only toolbar visual refresh code, toolbar regression tests, and matching documentation updates. It does not modify popup, sidebar thread behavior, pins, storage, session access, or extension manifest behavior.

- [ ] **Step 6: Commit any verification-only fixes**

If verification forced small fixes, commit only those files:

```bash
git add src/content/content-script.js tests/comment-mode-ui.test.mjs docs/02_UX_FLOW.md docs/04_DESIGN_SPEC.md docs/05_COMPONENT_SPEC.md
git commit -m "fix: stabilize refreshed overlay toolbar"
```

Expected: create this commit only if Step 1 through Step 5 required additional changes after the Task 2 or Task 3 commits.
