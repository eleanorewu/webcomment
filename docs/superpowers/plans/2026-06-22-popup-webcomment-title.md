# Popup WebComment Title Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the popup's two-line header with one white `WebComment` heading while preserving the existing status pill and behavior.

**Architecture:** Make a surgical markup and CSS change in the existing popup. Add a source-level UI regression test that reads the real popup HTML and CSS, matching the project's current lightweight Node test approach.

**Tech Stack:** Chrome Extension Manifest V3, HTML, CSS, Node.js built-in test runner

---

## File Structure

- Create `tests/popup-ui.test.mjs`: Regression coverage for popup header markup and heading color.
- Modify `src/popup/popup.html`: Remove the eyebrow and change the existing heading text.
- Modify `src/popup/popup.css`: Remove the obsolete eyebrow selector and explicitly apply the primary text color to the heading.

### Task 1: Add Popup Header Regression Coverage

**Files:**
- Create: `tests/popup-ui.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/popup-ui.test.mjs`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const popupHtml = fs.readFileSync(path.join(projectRoot, 'src/popup/popup.html'), 'utf8');
const popupCss = fs.readFileSync(path.join(projectRoot, 'src/popup/popup.css'), 'utf8');

test('popup header shows one white WebComment title', () => {
  const headerStart = popupHtml.indexOf('<header class="popup-header">');
  const headerEnd = popupHtml.indexOf('</header>', headerStart);
  const headerSource = popupHtml.slice(headerStart, headerEnd);

  assert.match(headerSource, /<h1>WebComment<\/h1>/);
  assert.doesNotMatch(headerSource, /標注工作階段/);
  assert.doesNotMatch(headerSource, /class="eyebrow"/);
  assert.match(headerSource, /id="connectionStatus"[\s\S]*?>本機測試版<\/span>/);
  assert.match(popupCss, /h1\s*\{[\s\S]*?color: var\(--text\);/);
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
node --test tests/popup-ui.test.mjs
```

Expected: FAIL because the header still contains `標注工作階段`, includes `.eyebrow`, and lacks an explicit `h1` color declaration.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/popup-ui.test.mjs
git commit -m "test: cover popup WebComment title"
```

### Task 2: Simplify the Popup Header

**Files:**
- Modify: `src/popup/popup.html:11-17`
- Modify: `src/popup/popup.css:45-58`
- Test: `tests/popup-ui.test.mjs`

- [ ] **Step 1: Replace the two-line title markup**

Change the popup header to:

```html
<header class="popup-header">
  <div>
    <h1>WebComment</h1>
  </div>
  <span id="connectionStatus" class="status-pill">本機測試版</span>
</header>
```

- [ ] **Step 2: Remove the obsolete eyebrow selector and set the heading color**

Change the muted text selector and heading rule to:

```css
.page-meta,
.message {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 16px;
}

h1 {
  margin: 2px 0 0;
  color: var(--text);
  font-size: 18px;
  line-height: 26px;
}
```

- [ ] **Step 3: Run the focused test to verify GREEN**

Run:

```bash
node --test tests/popup-ui.test.mjs
```

Expected: 1 test passes.

- [ ] **Step 4: Run complete verification**

Run:

```bash
npm test
npm run check
git diff --check
```

Expected: All tests pass, extension structure is valid, and Git reports no whitespace errors.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/popup/popup.html src/popup/popup.css
git commit -m "feat: simplify popup title"
```

