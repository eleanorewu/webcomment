import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const requiredFiles = [
  'manifest.json',
  'src/shared/store.js',
  'src/background/service-worker.js',
  'src/popup/popup.html',
  'src/popup/popup.css',
  'src/popup/popup.js',
  'src/content/content-script.css',
  'src/content/content-script.js',
  'demo/test-page.html',
];

let failed = false;

for (const file of requiredFiles) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) {
    console.error(`Missing required file: ${file}`);
    failed = true;
  }
}

const manifestPath = path.join(root, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (manifest.manifest_version !== 3) {
  console.error('manifest.json must use manifest_version 3');
  failed = true;
}

if (!manifest.action?.default_popup) {
  console.error('manifest.json must define action.default_popup');
  failed = true;
}

if (!manifest.content_scripts?.[0]?.js?.includes('src/content/content-script.js')) {
  console.error('manifest.json must load the content script');
  failed = true;
}

for (const file of [
  'src/shared/store.js',
  'src/background/service-worker.js',
  'src/popup/popup.js',
  'src/content/content-script.js',
]) {
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  try {
    new vm.Script(code, { filename: file });
  } catch (error) {
    console.error(`Syntax error in ${file}`);
    console.error(error.message);
    failed = true;
  }
}

const popupSource = fs.readFileSync(path.join(root, 'src/popup/popup.js'), 'utf8');
const contentSource = fs.readFileSync(path.join(root, 'src/content/content-script.js'), 'utf8');
const pageKeyUiChecks = [
  {
    file: 'src/popup/popup.js',
    source: popupSource,
    pattern: /els\.(?:pageTitle|pageMeta)\.textContent\s*=.*pageContext\.pageKey/,
  },
  {
    file: 'src/content/content-script.js',
    source: contentSource,
    pattern: /wc-toolbar-meta[^\n`]*pageContext\.pageKey/,
  },
  {
    file: 'src/content/content-script.js',
    source: contentSource,
    pattern: /wc-composer-footer[^`]*pageContext\.pageKey/,
  },
];

for (const check of pageKeyUiChecks) {
  if (check.pattern.test(check.source)) {
    console.error(`Raw pageKey must remain hidden from user-facing UI: ${check.file}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log('Extension structure looks good.');
