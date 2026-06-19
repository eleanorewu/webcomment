# Sidebar Resolved Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match the approved compact sidebar by moving the existing resolved toggle into the summary row as a `#B2D4FC` text link while preserving all current behavior.

**Architecture:** Keep the existing `includeResolved` state and event handler, but give summary counts their own nested update target so `renderThreadList()` cannot overwrite the relocated toggle. Limit runtime changes to sidebar markup and embedded CSS; do not touch data loading, pins, popup messaging, or persistent annotation-card actions.

**Tech Stack:** Manifest V3, browser JavaScript, Shadow DOM, embedded CSS, Node.js built-in test runner.

---

### Task 1: Add Compact Sidebar Regression Coverage

**Files:**
- Modify: `tests/comment-mode-ui.test.mjs`
- Test: `tests/comment-mode-ui.test.mjs`

- [ ] **Step 1: Write the failing regression test**

Append this test to `tests/comment-mode-ui.test.mjs`:

```js
test('sidebar presents the resolved toggle as a compact summary link', () => {
  const sidebarStart = content.indexOf('function renderSidebar');
  const listStart = content.indexOf('function renderThreadList');
  const stylesStart = content.indexOf('function styles');

  const sidebarSource = content.slice(sidebarStart, listStart);
  const stylesSource = content.slice(stylesStart);

  assert.match(sidebarSource, /<h2>WebComments<\/h2>/);
  assert.doesNotMatch(sidebarSource, /wc-eyebrow/);
  assert.match(sidebarSource, /class="wc-sidebar-summary-counts" data-summary/);
  assert.match(sidebarSource, /data-action="toggle-resolved"/);
  assert.match(sidebarSource, /state\.includeResolved \? '返回未解決' : '查看已解決'/);
  assert.match(stylesSource, /\.wc-sidebar-tools[\s\S]*?grid-template-columns: 1fr;/);
  assert.match(stylesSource, /\.wc-sidebar-summary button\[data-action="toggle-resolved"\][\s\S]*?color: #b2d4fc;/);
  assert.match(stylesSource, /\.wc-sidebar-summary button\[data-action="toggle-resolved"\][\s\S]*?text-decoration: underline;/);
  assert.match(content, /class="wc-thread-footer"/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test --test-name-pattern="sidebar presents the resolved toggle" tests/comment-mode-ui.test.mjs
```

Expected: FAIL because the header is still two lines, the toggle remains in the search tools row, and the compact link styles do not exist.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/comment-mode-ui.test.mjs
git commit -m "test: cover compact resolved link"
```

### Task 2: Move And Restyle The Existing Resolved Toggle

**Files:**
- Modify: `src/content/content-script.js:781-859`
- Modify: `src/content/content-script.js:1830-1960`
- Test: `tests/comment-mode-ui.test.mjs`

- [ ] **Step 1: Simplify the header and search tools markup**

In `renderSidebar`, replace the current header contents with:

```html
<header class="wc-sidebar-header">
  <h2>WebComments</h2>
  <button data-action="toggle-collapse" class="wc-ghost-button" type="button" title="${collapsed ? '展開列表' : '收合列表'}">${COLLAPSE_SVG}</button>
</header>
```

Keep only `.wc-search-wrap` inside `.wc-sidebar-tools`; remove the existing `toggle-resolved` button from that tools container.

- [ ] **Step 2: Add a stable counts target and relocate the same toggle**

Replace the empty summary element with:

```html
<div class="wc-sidebar-summary">
  <div class="wc-sidebar-summary-counts" data-summary></div>
  <button data-action="toggle-resolved" type="button">
    ${state.includeResolved ? '返回未解決' : '查看已解決'}
  </button>
</div>
```

Keep the existing event listener unchanged:

```js
sidebar.querySelector('[data-action="toggle-resolved"]').addEventListener('click', async () => {
  state.includeResolved = !state.includeResolved;
  await refreshData();
  render();
  updateBadge();
});
```

`renderThreadList()` continues to query `[data-summary]`, but now it updates only `.wc-sidebar-summary-counts` and cannot remove the toggle button.

- [ ] **Step 3: Apply the approved compact styles**

Remove the unused `.wc-eyebrow` rule. Update the heading and tools rules to:

```css
.wc-sidebar h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
}

.wc-sidebar-tools {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
  padding: 0 14px 10px;
}
```

Delete the old `.wc-sidebar-tools button[data-action="toggle-resolved"]` normal and hover rules. Replace the summary styles with:

```css
.wc-sidebar-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  border-bottom: 1px solid var(--panel-border);
  padding: 8px 14px;
  color: var(--panel-muted);
  font-size: 12px;
}

.wc-sidebar-summary-counts {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.wc-sidebar-summary button[data-action="toggle-resolved"] {
  margin-left: auto;
  border: 0;
  padding: 0;
  color: #b2d4fc;
  background: transparent;
  cursor: pointer;
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  white-space: nowrap;
}

.wc-sidebar-summary button[data-action="toggle-resolved"]:hover {
  opacity: 0.82;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test --test-name-pattern="sidebar presents the resolved toggle" tests/comment-mode-ui.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run the complete automated suite**

Run:

```bash
npm test
npm run check
git diff --check
```

Expected: all tests pass, the extension structure check succeeds, and no whitespace errors are reported.

- [ ] **Step 6: Commit the runtime implementation**

```bash
git add src/content/content-script.js
git commit -m "feat: compact sidebar resolved control"
```

### Task 3: Align Sidebar Documentation

**Files:**
- Modify: `docs/04_DESIGN_SPEC.md:179-205`
- Modify: `docs/05_COMPONENT_SPEC.md:235-289`

- [ ] **Step 1: Update the design specification**

Update the comment-list sections in `docs/04_DESIGN_SPEC.md` to state:

```markdown
1. Header
    - Single `WebComments` title
    - Collapse/expand toggle button
2. Search
    - Full-width search input
3. Summary and resolved visibility
    - Visible comment or search-result count
    - Open count
    - `查看已解決` / `返回未解決` text control on the right, underlined and colored `#B2D4FC`
```

Keep the thread-list and selected-thread-detail requirements unchanged.

- [ ] **Step 2: Update the component specification**

Under `Actions` and `Interactions` in `docs/05_COMPONENT_SPEC.md`, specify:

```markdown
- Toggle resolved visibility from the summary-row text control.
```

```markdown
- The full-width search field is visually separate from the summary row.
- The summary-row resolved control preserves the existing two-state visibility behavior and labels itself `查看已解決` or `返回未解決`.
```

- [ ] **Step 3: Verify documentation and diff consistency**

Run:

```bash
rg -n "WebComments|Full-width search|#B2D4FC|summary-row" docs/04_DESIGN_SPEC.md docs/05_COMPONENT_SPEC.md
git diff --check
```

Expected: the approved sidebar requirements are present and the diff check exits successfully.

- [ ] **Step 4: Commit the documentation alignment**

```bash
git add docs/04_DESIGN_SPEC.md docs/05_COMPONENT_SPEC.md
git commit -m "docs: specify compact sidebar resolved control"
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

Expected: all tests pass, the extension structure check succeeds, no whitespace errors are reported, and the working tree is clean.

- [ ] **Step 2: Perform manual Chrome verification**

Reload the unpacked extension and refresh the demo page, then verify:

1. The sidebar header displays only `WebComments` and the collapse control.
2. The search field occupies the full sidebar width.
3. The left side of the summary shows annotation or search-result count and unresolved count.
4. The right-side link displays `查看已解決` in `#B2D4FC` with an underline.
5. Clicking it shows resolved annotations and changes the label to `返回未解決` without changing existing pin behavior.
6. Clicking `返回未解決` restores unresolved-only visibility.
7. Searching, collapsing the sidebar, and permanent card actions still work.

- [ ] **Step 3: Review the branch scope**

```bash
git diff main...HEAD --stat
git log --oneline main..HEAD
```

Expected: the branch contains only the approved sidebar design, implementation plan, regression test, runtime presentation changes, and aligned documentation.
