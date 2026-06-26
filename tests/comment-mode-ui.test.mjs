import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const content = fs.readFileSync('src/content/content-script.js', 'utf8');
const css = fs.readFileSync('src/content/content-script.css', 'utf8');
const popup = fs.readFileSync('src/popup/popup.js', 'utf8');

function sourceBetween(startPattern, endPattern) {
  const start = content.indexOf(startPattern);
  const end = content.indexOf(endPattern);
  assert.notEqual(start, -1, `${startPattern} should exist`);
  assert.notEqual(end, -1, `${endPattern} should exist`);
  assert.ok(end > start, `${endPattern} should appear after ${startPattern}`);
  return content.slice(start, end);
}

function sourceFrom(startPattern) {
  const start = content.indexOf(startPattern);
  assert.notEqual(start, -1, `${startPattern} should exist`);
  return content.slice(start);
}

test('content script exposes explicit overlay lifecycle', () => {
  assert.match(content, /overlayActive:\s*false/);
  assert.match(content, /WEB_COMMENT_DEACTIVATE/);
  assert.match(content, /function deactivateOverlay/);
  assert.match(content, /root\.remove\(\)/);
});

test('toolbar close and extension icon share the overlay deactivation lifecycle', () => {
  const messageSource = sourceBetween('async function handleMessage', 'async function refreshData');
  const toolbarSource = sourceBetween('function renderToolbar', 'function renderSidebar');

  assert.match(messageSource, /WEB_COMMENT_DEACTIVATE/);
  assert.match(messageSource, /return deactivateOverlay\(\);/);
  assert.match(toolbarSource, /data-action="deactivate"/);
  assert.match(toolbarSource, /deactivateOverlay\(\)/);
});

test('toolbar renders the refreshed three-zone control set', () => {
  const toolbarSource = sourceBetween('function renderToolbar', 'function renderSidebar');

  assert.match(toolbarSource, /TOOLBAR_ANNOTATION_ICON/);
  assert.match(toolbarSource, /TOOLBAR_EYE_OPEN_ICON/);
  assert.match(toolbarSource, /TOOLBAR_EYE_CLOSED_ICON/);
  assert.match(toolbarSource, /data-action="toggle-comment"/);
  assert.match(toolbarSource, /state\.commentMode/);
  assert.match(toolbarSource, /標註中/);
  assert.match(toolbarSource, /標註/);
  assert.match(toolbarSource, /state\.sidebarOpen \? '隱藏留言列表' : '顯示留言列表'/);
  assert.match(toolbarSource, /data-action="deactivate"/);
  assert.match(toolbarSource, /deactivateOverlay\(\)/);
  assert.doesNotMatch(toolbarSource, /標注模式 · 點擊頁面留言/);
  assert.doesNotMatch(toolbarSource, />完成</);
  assert.doesNotMatch(toolbarSource, /data-action="finish-comment"/);
  assert.doesNotMatch(toolbarSource, /data-action="toggle-resolved"/);
  assert.doesNotMatch(toolbarSource, /data-action="toggle-more"/);
  assert.match(toolbarSource, /aria-label="關閉 WebComment"/);
});

test('toolbar visual refresh uses fixed zones, dividers, and button-only hover', () => {
  const stylesSource = sourceFrom('function styles');

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

test('content script stores accessRole and gates delete and edit on own comments', () => {
  assert.match(content, /accessRole:\s*\{[\s\S]*?role:\s*'none'/);
  assert.match(content, /state\.accessRole\s*=\s*data\.accessRole/);
  assert.match(content, /function isOwnComment\(comment\)/);
  assert.match(content, /comment\.authorId\s*===\s*state\.accessRole\.actorId/);
});

test('delete and edit buttons are gated by isOwnComment in all three render locations', () => {
  const popoverStart = content.indexOf('function buildPopoverComment');
  const controlsStart = content.indexOf('function renderOriginalControls');
  const editableStart = content.indexOf('function renderEditableComment');
  const stylesStart = content.indexOf('function styles');

  const popoverSource = content.slice(popoverStart, controlsStart);
  const controlsSource = content.slice(controlsStart, editableStart);
  const editableSource = content.slice(editableStart, stylesStart);

  // All three locations reference isOwnComment
  assert.match(popoverSource, /isOwnComment\(comment\)/);
  assert.match(controlsSource, /isOwnComment\(item\.original\)/);
  assert.match(editableSource, /isOwnComment\(comment\)/);

  // Resolve button is NOT gated by isOwnComment in renderOriginalControls
  const resolveSection = controlsSource.slice(controlsSource.indexOf('data-action="resolve"'));
  assert.doesNotMatch(resolveSection.slice(0, resolveSection.indexOf('addEventListener')), /isOwnComment/);
});

test('reply submit handlers refocus the reply textarea after re-render', () => {
  const popoverSource = sourceBetween('function renderPinPreview', 'function isOwnComment');
  const detailSource = sourceBetween('function renderThreadDetail', 'function renderOriginalControls');

  assert.match(
    popoverSource,
    /await refreshData\(\);[\s\S]*?renderPinPreview\(\);[\s\S]*?focusReplyTextarea\('\.wc-popover-reply'\);/,
  );
  assert.match(
    detailSource,
    /await refreshData\(\);[\s\S]*?state\.editingCommentId = null;[\s\S]*?render\(\);[\s\S]*?focusReplyTextarea\('\.wc-reply-form'\);/,
  );
});

test('comment textareas bind adaptive multiline behavior across composer surfaces', () => {
  assert.match(content, /function bindAdaptiveCommentTextarea\(textarea/);
  assert.match(content, /function focusReplyTextarea\(formSelector\)/);

  const popoverSource = sourceBetween('function renderPinPreview', 'function isOwnComment');
  const popoverEditSource = sourceBetween('function buildPopoverComment', 'function renderDraftComposer');
  const draftSource = sourceBetween('function renderDraftComposer', 'function renderToolbar');
  const detailSource = sourceBetween('function renderThreadDetail', 'function renderOriginalControls');
  const editableSource = sourceBetween('function renderEditableComment', 'function styles');

  assert.match(popoverSource, /bindAdaptiveCommentTextarea\(replyTextarea\)/);
  assert.match(popoverEditSource, /bindAdaptiveCommentTextarea\(ta\)/);
  assert.match(draftSource, /bindAdaptiveCommentTextarea\(draftTextarea\)/);
  assert.match(detailSource, /bindAdaptiveCommentTextarea\(ta\)/);
  assert.match(detailSource, /bindAdaptiveCommentTextarea\(replyTextarea\)/);
  assert.match(editableSource, /bindAdaptiveCommentTextarea\(textarea\)/);
});

test('adaptive comment textarea keeps compact default and switches on multiline intent', () => {
  const helperSource = sourceBetween('function bindAdaptiveCommentTextarea', 'function styles');
  const stylesSource = sourceFrom('function styles');

  assert.match(helperSource, /textarea\.value\.includes\('\\n'\)/);
  assert.match(helperSource, /event\.key === 'Enter' && event\.shiftKey/);
  assert.match(helperSource, /classList\.toggle\('is-multiline'/);
  assert.match(stylesSource, /\.wc-popover-input-wrap[\s\S]*?border-radius: 999px;/);
  assert.match(stylesSource, /\.wc-popover-input-wrap\.is-multiline[\s\S]*?border-radius: 8px;/);
  assert.match(stylesSource, /\.wc-popover-input-wrap\.is-multiline[\s\S]*?align-items: flex-end;/);
  assert.match(stylesSource, /\.wc-comment-textarea\.is-multiline[\s\S]*?min-height: 72px;/);
});
