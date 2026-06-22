# Remove Popup Resolved Toggle and Thumbnail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the popup's resolved-pin Checkbox and decorative website icon while keeping resolved visibility available through the sidebar.

**Architecture:** Extend the existing source-level popup UI test so it covers markup, JavaScript bindings, and CSS cleanup. Then remove only the popup-owned control and decorative icon, leaving the content script protocol and sidebar behavior unchanged.

**Tech Stack:** Chrome Extension Manifest V3, HTML, CSS, JavaScript, Node.js built-in test runner

---

## File Structure

- Modify `tests/popup-ui.test.mjs`: Add regression coverage for both removed popup elements and associated dead code.
- Modify `src/popup/popup.html`: Remove the Checkbox row and page icon markup.
- Modify `src/popup/popup.js`: Remove the Checkbox DOM binding and change listener.
- Modify `src/popup/popup.css`: Remove obsolete icon and Checkbox styles.
- Modify `docs/05_COMPONENT_SPEC.md`: Remove resolved-pin toggling from popup responsibilities.

### Task 1: Add Popup Cleanup Regression Tests

**Files:**
- Modify: `tests/popup-ui.test.mjs`

- [ ] **Step 1: Load popup JavaScript in the test fixture**

Add this source fixture after `popupCss`:

```js
const popupJs = fs.readFileSync(path.join(projectRoot, 'src/popup/popup.js'), 'utf8');
```

- [ ] **Step 2: Add the failing resolved-toggle removal test**

Append:

```js
test('popup delegates resolved visibility to the sidebar', () => {
  assert.doesNotMatch(popupHtml, /id="showResolvedToggle"/);
  assert.doesNotMatch(popupHtml, /顯示已解決標注/);
  assert.doesNotMatch(popupJs, /showResolvedToggle/);
  assert.doesNotMatch(popupJs, /WEB_COMMENT_SHOW_RESOLVED/);
  assert.doesNotMatch(popupCss, /\.toggle-row/);
});
```

- [ ] **Step 3: Add the failing website-icon removal test**

Append:

```js
test('popup page card presents website details without a decorative icon', () => {
  assert.doesNotMatch(popupHtml, /class="page-icon"/);
  assert.doesNotMatch(popupCss, /\.page-icon/);
  assert.match(popupHtml, /id="pageTitle"/);
  assert.match(popupHtml, /id="pageMeta"/);
});
```

- [ ] **Step 4: Run the focused test to verify RED**

Run:

```bash
node --test tests/popup-ui.test.mjs
```

Expected: The existing title test passes; the two new tests fail because the Checkbox, icon, JavaScript binding, and CSS still exist.

- [ ] **Step 5: Commit the failing tests**

```bash
git add tests/popup-ui.test.mjs
git commit -m "test: cover popup control cleanup"
```

### Task 2: Remove Popup Control and Decorative Icon

**Files:**
- Modify: `src/popup/popup.html:18-47`
- Modify: `src/popup/popup.js:3-76`
- Modify: `src/popup/popup.css:77-180`
- Modify: `docs/05_COMPONENT_SPEC.md:49-59`
- Test: `tests/popup-ui.test.mjs`

- [ ] **Step 1: Remove the icon and Checkbox markup**

Keep the current-page card in this form:

```html
<section class="page-card">
  <div class="page-title-row">
    <div>
      <p id="pageTitle" class="page-title">讀取頁面中...</p>
      <p id="pageMeta" class="page-meta"></p>
    </div>
  </div>
</section>
```

Delete this entire block:

```html
<div class="toggle-row">
  <label>
    <input id="showResolvedToggle" type="checkbox" />
    顯示已解決標注
  </label>
</div>
```

- [ ] **Step 2: Remove the Checkbox JavaScript binding**

Delete this property from `els`:

```js
showResolvedToggle: document.getElementById('showResolvedToggle'),
```

Delete this listener from `bindEvents()`:

```js
els.showResolvedToggle.addEventListener('change', async () => {
  await ensureContentScript();
  await sendToTab({ type: 'WEB_COMMENT_SHOW_RESOLVED', value: els.showResolvedToggle.checked });
  await renderStats();
});
```

- [ ] **Step 3: Remove obsolete CSS rules**

Delete the complete `.page-icon` rule:

```css
.page-icon {
  display: grid;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 8px;
  color: #ffffff;
  background: var(--brand);
}
```

Delete all three Checkbox style rules:

```css
.toggle-row {
  color: var(--muted);
  font-size: 13px;
}

.toggle-row label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toggle-row input {
  width: auto;
  accent-color: var(--brand);
}
```

- [ ] **Step 4: Update popup component responsibilities**

In `docs/05_COMPONENT_SPEC.md`, remove this action from the Extension Popup list:

```markdown
- Toggle resolved pins
```

Do not change the sidebar's resolved visibility documentation.

- [ ] **Step 5: Run the focused test to verify GREEN**

Run:

```bash
node --test tests/popup-ui.test.mjs
```

Expected: 3 tests pass.

- [ ] **Step 6: Run complete verification**

Run:

```bash
npm test
npm run check
git diff --check
```

Expected: All tests pass, the extension structure is valid, and Git reports no whitespace errors.

- [ ] **Step 7: Commit the implementation and documentation**

```bash
git add src/popup/popup.html src/popup/popup.js src/popup/popup.css docs/05_COMPONENT_SPEC.md
git commit -m "feat: simplify popup page controls"
```

