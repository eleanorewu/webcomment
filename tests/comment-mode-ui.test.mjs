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

test('popup reports overlay activation before closing', () => {
  assert.match(popup, /WEB_COMMENT_OVERLAY_ACTIVATED/);
  assert.match(popup, /tabId:\s*currentTab\.id/);
});
