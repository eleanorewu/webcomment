import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const content = fs.readFileSync('src/content/content-script.js', 'utf8');
const css = fs.readFileSync('src/content/content-script.css', 'utf8');
const popup = fs.readFileSync('src/popup/popup.js', 'utf8');

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

test('popup reports overlay activation before closing', () => {
  assert.match(popup, /WEB_COMMENT_OVERLAY_ACTIVATED/);
  assert.match(popup, /tabId:\s*currentTab\.id/);
});

test('delayed UI helpers ignore callbacks after deactivation', () => {
  assert.match(
    content,
    /function scrollSelectedThreadIntoView\(\)[\s\S]*?if \(!state\.overlayActive \|\| !shadow\) return;/,
  );
  assert.match(
    content,
    /function showToast\(message\)[\s\S]*?if \(!state\.overlayActive \|\| !shadow\) return;/,
  );
});

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
