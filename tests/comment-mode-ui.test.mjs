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
