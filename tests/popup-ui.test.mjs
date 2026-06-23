import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const popupHtml = fs.readFileSync(path.join(projectRoot, 'src/popup/popup.html'), 'utf8');
const popupCss = fs.readFileSync(path.join(projectRoot, 'src/popup/popup.css'), 'utf8');
const popupJs = fs.readFileSync(path.join(projectRoot, 'src/popup/popup.js'), 'utf8');
const manifestJson = fs.readFileSync(path.join(projectRoot, 'manifest.json'), 'utf8');
const manifest = JSON.parse(manifestJson);

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

test('popup delegates resolved visibility to the sidebar', () => {
  assert.doesNotMatch(popupHtml, /id="showResolvedToggle"/);
  assert.doesNotMatch(popupHtml, /顯示已解決標注/);
  assert.doesNotMatch(popupJs, /showResolvedToggle/);
  assert.doesNotMatch(popupJs, /WEB_COMMENT_SHOW_RESOLVED/);
  assert.doesNotMatch(popupCss, /\.toggle-row/);
});

test('popup page card presents website details without a decorative icon', () => {
  assert.doesNotMatch(popupHtml, /class="page-icon"/);
  assert.doesNotMatch(popupCss, /\.page-icon/);
  assert.match(popupHtml, /id="pageTitle"/);
  assert.match(popupHtml, /id="pageMeta"/);
});

test('popup exposes account-free guest review session controls', () => {
  assert.match(popupHtml, /id="sessionPasswordInput"/);
  assert.match(popupHtml, /type="password"/);
  assert.match(popupHtml, /id="guestDisplayNameInput"/);
  assert.match(popupHtml, /id="joinSessionButton"/);
  assert.match(popupHtml, /邀請連結/);
  assert.match(popupHtml, /顯示名稱/);
  assert.match(popupJs, /createPrivateSession/);
  assert.match(popupJs, /joinPrivateSession/);
});

test('popup exposes owner management without formal account copy', () => {
  assert.match(popupHtml, /id="resetInviteButton"/);
  assert.match(popupHtml, /id="changePasswordButton"/);
  assert.match(popupHtml, /id="closeSessionButton"/);
  assert.match(popupJs, /resetInviteLink/);
  assert.match(popupJs, /changeSessionPassword/);
  assert.match(popupJs, /closeSession/);
  assert.doesNotMatch(popupHtml, /註冊/);
  assert.doesNotMatch(popupHtml, /Email/);
});

test('popup loads session access helper before store everywhere private APIs may run', () => {
  assert(
    popupHtml.indexOf('<script src="../shared/session-access.js"></script>')
      < popupHtml.indexOf('<script src="../shared/store.js"></script>'),
    'popup HTML should load session-access.js before store.js',
  );

  assert.match(
    popupJs,
    /files:\s*\[\s*'src\/shared\/session-access\.js',\s*'src\/shared\/store\.js',\s*'src\/content\/content-script\.js'\s*\]/,
  );

  const scripts = manifest.content_scripts?.[0]?.js || [];
  assert(
    scripts.indexOf('src/shared/session-access.js') !== -1
      && scripts.indexOf('src/shared/session-access.js') < scripts.indexOf('src/shared/store.js'),
    'manifest content script should load session-access.js before store.js',
  );
});
