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

test('toolbar removes obsolete More menu state and styling', () => {
  assert.doesNotMatch(content, /moreMenuOpen/);
  assert.doesNotMatch(content, /\.wc-more-menu/);
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

test('content script guards storage listeners after extension reload', () => {
  const bindStart = content.indexOf('function bindPageEvents');
  const clearStart = content.indexOf('function clearPageListeners');
  const activateStart = content.indexOf('async function activateOverlay');
  const bindSource = content.slice(bindStart, clearStart);
  const clearSource = content.slice(clearStart, activateStart);

  assert.match(bindSource, /if \(!chrome\.storage\?\.onChanged\) throw new Error\('Extension context invalidated'\)/);
  assert.match(clearSource, /chrome\.storage\?\.onChanged\?\.removeListener\(handleStorageChange\)/);
});

test('shadow UI keeps text input events away from the host page', () => {
  const mountStart = content.indexOf('function mount');
  const unhandledStart = content.indexOf('function handleUnhandledRejection');
  const mountSource = content.slice(mountStart, unhandledStart);

  assert.match(
    mountSource,
    /\['keydown', 'keyup', 'keypress', 'beforeinput', 'input', 'compositionstart', 'compositionupdate', 'compositionend'\]/,
  );
  assert.match(mountSource, /shadow\.addEventListener\(type, stopHostInputPropagation\)/);
  assert.match(content, /function stopHostInputPropagation\(event\)\s*{\s*event\.stopPropagation\(\);\s*}/);
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
  assert.match(stylesSource, /\.wc-thread-footer[\s\S]*?flex-wrap: wrap[\s\S]*?padding: 0 14px;[\s\S]*?margin-bottom: 14px/);
  assert.match(stylesSource, /\.wc-thread-actions button\.is-resolved[\s\S]*?color: #b2d4fc/);
  assert.match(stylesSource, /\.wc-thread-actions button\.is-resolved:hover[\s\S]*?opacity: 0\.82/);
});

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
