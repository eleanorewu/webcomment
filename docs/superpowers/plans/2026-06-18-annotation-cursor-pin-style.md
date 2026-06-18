# Annotation Cursor Pin Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the annotation placement cursor visually match WebComment's saved annotation pin while preserving precise click placement.

**Architecture:** Keep the existing CSS data-URI cursor and lifecycle unchanged. Strengthen the source-contract test first, then replace only the embedded SVG silhouette with the approved rounded pin bubble, using its lower-left tail as the hotspot.

**Tech Stack:** CSS custom cursor, inline SVG data URI, Node.js built-in test runner.

---

## File Map

- Modify `tests/comment-mode-ui.test.mjs`: define the approved pin-style cursor contract.
- Modify `src/content/content-script.css`: replace the rectangular speech bubble with the rounded annotation-pin silhouette.

### Task 1: Implement the pin-style annotation cursor with TDD

**Files:**
- Modify: `tests/comment-mode-ui.test.mjs`
- Modify: `src/content/content-script.css:8-12`

- [ ] **Step 1: Replace the existing cursor test with a failing pin-style contract**

Replace `conversation cursor contains only a compact speech bubble` with:

```js
test('conversation cursor matches the annotation pin style', () => {
  assert.match(css, /width='20' height='20' viewBox='0 0 20 20'/);
  assert.match(css, /M10 1\.5C15\.1 1\.5 18\.5 4\.9 18\.5 10/);
  assert.match(css, /fill='%23534AE8' stroke='%23fff'/);
  assert.match(css, /cx='7' cy='10'/);
  assert.match(css, /cx='10' cy='10'/);
  assert.match(css, /cx='13' cy='10'/);
  assert.match(css, /\) 2 18, crosshair/);
  assert.doesNotMatch(css, /%3Cfilter|drop-shadow/);
  assert.doesNotMatch(css, /M1\.5 1\.5v15/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/comment-mode-ui.test.mjs
```

Expected: FAIL because the current SVG uses the rectangular `M2 2h16v11...` path, dots at `y=7.5`, and hotspot `2 17`.

- [ ] **Step 3: Replace only the embedded SVG cursor**

Use this CSS rule:

```css
html.webcomment-comment-mode,
html.webcomment-comment-mode body,
html.webcomment-comment-mode body * {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'%3E%3Cpath d='M10 1.5C15.1 1.5 18.5 4.9 18.5 10S15.1 18.5 10 18.5H1.5V10C1.5 4.9 4.9 1.5 10 1.5Z' fill='%23534AE8' stroke='%23fff' stroke-width='1.1' stroke-linejoin='round'/%3E%3Ccircle cx='7' cy='10' r='1' fill='%23fff'/%3E%3Ccircle cx='10' cy='10' r='1' fill='%23fff'/%3E%3Ccircle cx='13' cy='10' r='1' fill='%23fff'/%3E%3C/svg%3E") 2 18, crosshair !important;
}
```

The path produces the approved rounded body and lower-left tail. It intentionally contains no shadow or separate arrow.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test tests/comment-mode-ui.test.mjs
```

Expected: all tests in `comment-mode-ui.test.mjs` PASS.

- [ ] **Step 5: Run the full automated checks**

Run:

```bash
npm test && npm run check && git diff --check
```

Expected: all tests PASS, the extension structure check prints `Extension structure looks good.`, and Git reports no whitespace errors.

- [ ] **Step 6: Commit the cursor change**

```bash
git add tests/comment-mode-ui.test.mjs src/content/content-script.css
git commit -m "fix: align annotation cursor with pin style"
```

### Task 2: Verify cursor appearance and placement in Chrome

**Files:**
- Modify only if manual verification reveals a failure in the scoped cursor behavior.

- [ ] **Step 1: Reload the unpacked extension**

Open `chrome://extensions`, reload the unpacked extension from `/Users/eleanore1996/WebComment/.worktrees/comment-mode-lifecycle`, and activate annotation mode on the existing localhost demo.

- [ ] **Step 2: Compare the cursor with the approved reference**

Expected: the cursor has a rounded pin-shaped purple body, a lower-left tail, a white outline, three centered white dots, no separate arrow, and no visible drop shadow.

- [ ] **Step 3: Verify click precision**

Click three visibly distinct points on the page.

Expected: each draft pin appears where the cursor's lower-left tail points, rather than at the center of the bubble.

- [ ] **Step 4: Verify cursor lifecycle regression cases**

Exit placement with `完成` and `Esc`, then close WebComment from the overlay and Chrome action icon.

Expected: the normal cursor returns in every exit path; re-entering annotation mode restores the pin-style cursor.

- [ ] **Step 5: Re-run final automated verification**

Run:

```bash
npm test && npm run check && git diff --check
```

Expected: all tests PASS, the structure check succeeds, and Git reports no whitespace errors.
