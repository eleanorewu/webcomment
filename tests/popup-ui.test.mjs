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
