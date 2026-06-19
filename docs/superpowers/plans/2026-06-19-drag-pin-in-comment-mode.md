# Drag Existing Pins In Comment Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow an existing annotation pin to be dragged after 1px of pointer movement while comment placement mode remains active.

**Architecture:** Reuse the existing pin pointer state machine and remove only the comment-mode entry guard. Keep overlay event isolation, pointer capture, anchor persistence, rollback, and click suppression unchanged; add a focused source-level regression test because the current no-build extension does not expose the content-script internals as importable units.

**Tech Stack:** Manifest V3, browser JavaScript, Shadow DOM, Chrome extension APIs, Node.js built-in test runner.

---

### Task 1: Add The Comment-Mode Drag Regression Test

**Files:**
- Modify: `tests/comment-mode-ui.test.mjs`
- Test: `tests/comment-mode-ui.test.mjs`

- [ ] **Step 1: Write the failing regression test**

Append this test to `tests/comment-mode-ui.test.mjs`:

```js
test('existing pins can start a 1px drag without leaving comment mode', () => {
  const beginStart = content.indexOf('function beginPinPointer');
  const moveStart = content.indexOf('function handlePinPointerMove');
  const upStart = content.indexOf('async function handlePinPointerUp');
  const cancelStart = content.indexOf('function cancelPinDrag');
  const draftStart = content.indexOf('function renderDraftComposer');

  const beginSource = content.slice(beginStart, moveStart);
  const moveSource = content.slice(moveStart, upStart);
  const dragSource = content.slice(beginStart, draftStart);

  assert.doesNotMatch(beginSource, /state\.commentMode/);
  assert.match(moveSource, /distance < 1/);
  assert.match(moveSource, /closePinPreview\(\)/);
  assert.match(dragSource, /state\.suppressPinClickId = drag\.pinId/);
  assert.doesNotMatch(dragSource, /state\.commentMode\s*=/);
  assert.ok(cancelStart > upStart);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
node --test --test-name-pattern="existing pins can start" tests/comment-mode-ui.test.mjs
```

Expected: FAIL because `beginPinPointer` still contains `state.commentMode` and the movement threshold is still 4px.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/comment-mode-ui.test.mjs
git commit -m "test: cover pin dragging during comment mode"
```

### Task 2: Permit Pin Dragging During Comment Mode

**Files:**
- Modify: `src/content/content-script.js:564-615`
- Test: `tests/comment-mode-ui.test.mjs`

- [ ] **Step 1: Remove the comment-mode drag guard**

Change `beginPinPointer` from:

```js
function beginPinPointer(event, pin, button) {
  if (event.button !== 0 || state.commentMode) return;
```

to:

```js
function beginPinPointer(event, pin, button) {
  if (event.button !== 0) return;
```

- [ ] **Step 2: Change the drag threshold to 1px**

In `handlePinPointerMove`, change:

```js
if (!drag.started && distance < 4) return;
```

to:

```js
if (!drag.started && distance < 1) return;
```

Do not assign `state.commentMode` anywhere in the drag functions. Keep `closePinPreview()`, pointer capture, `suppressPinClickId`, anchor persistence, rollback, and toast handling unchanged.

- [ ] **Step 3: Run the focused test and verify it passes**

Run:

```bash
node --test --test-name-pattern="existing pins can start" tests/comment-mode-ui.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Run the complete automated suite**

Run:

```bash
npm test
npm run check
```

Expected: all tests pass and the extension structure check prints `Extension structure looks good.`

- [ ] **Step 5: Commit the implementation**

```bash
git add src/content/content-script.js
git commit -m "fix: allow pin dragging in comment mode"
```

### Task 3: Align Product And Technical Documentation

**Files:**
- Modify: `docs/01_PRD.md:195`
- Modify: `docs/02_UX_FLOW.md:198`
- Modify: `docs/05_COMPONENT_SPEC.md:166`
- Modify: `docs/08_TECH_SPEC.md:242`

- [ ] **Step 1: Update the product acceptance criterion**

In `docs/01_PRD.md`, replace:

```markdown
- A short pointer movement remains a click; dragging begins only after a 4px movement threshold.
```

with:

```markdown
- Pointer movement below 1px remains a click; dragging begins at 1px of movement, including while comment mode is active.
```

- [ ] **Step 2: Update the UX flow and interaction rule**

In `docs/02_UX_FLOW.md`, replace:

```text
→ Move more than 4px
```

with:

```text
→ Move at least 1px
```

Add this bullet beneath the drag rules:

```markdown
- Existing pins remain draggable while comment mode is active; completing, cancelling, or failing a drag does not exit comment mode.
```

- [ ] **Step 3: Update the component requirement**

In `docs/05_COMPONENT_SPEC.md`, replace:

```markdown
- Pointer movement beyond 4px starts repositioning when permitted.
```

with:

```markdown
- Pointer movement of at least 1px starts repositioning when permitted, including while comment mode is active.
```

- [ ] **Step 4: Update the technical requirement**

In `docs/08_TECH_SPEC.md`, replace:

```markdown
- Require 4px movement before entering `dragging`; otherwise handle the interaction as a click.
```

with:

```markdown
- Require 1px movement before entering `dragging`; otherwise handle the interaction as a click. Existing pins may enter this state while comment mode is active, and the drag flow must not change `commentMode`.
```

- [ ] **Step 5: Verify documentation consistency**

Run:

```bash
rg -n "4px|Move more than 4px|beyond 4px" docs
git diff --check
```

Expected: the search returns no drag-threshold requirement using 4px, and `git diff --check` exits successfully.

- [ ] **Step 6: Commit the documentation alignment**

```bash
git add docs/01_PRD.md docs/02_UX_FLOW.md docs/05_COMPONENT_SPEC.md docs/08_TECH_SPEC.md
git commit -m "docs: allow pin dragging during comment mode"
```

### Task 4: Final Verification

**Files:**
- Verify: `src/content/content-script.js`
- Verify: `tests/comment-mode-ui.test.mjs`
- Verify: `docs/01_PRD.md`
- Verify: `docs/02_UX_FLOW.md`
- Verify: `docs/05_COMPONENT_SPEC.md`
- Verify: `docs/08_TECH_SPEC.md`

- [ ] **Step 1: Run all automated verification**

```bash
npm test
npm run check
git diff --check
git status --short
```

Expected: all tests pass, the extension structure check succeeds, no whitespace errors are reported, and only intentional plan-tracking changes remain.

- [ ] **Step 2: Perform manual Chrome verification**

Load the unpacked extension and verify:

1. Enter comment mode.
2. Hover an existing pin until its preview appears.
3. Drag the pin by at least 1px and release it on a different page element.
4. Confirm the preview closes, the pin moves, no draft appears, and no thread opens.
5. Confirm the annotation cursor remains active.
6. Click an ordinary page element and confirm a new annotation draft can still be created.
7. Cancel a drag with Escape and confirm comment mode remains active.

- [ ] **Step 3: Review the branch diff**

```bash
git diff main...HEAD --stat
git log --oneline main..HEAD
```

Expected: the branch contains the approved pre-existing comment-list commit, the design/spec commit, regression test, minimal drag implementation, and aligned documentation only.
