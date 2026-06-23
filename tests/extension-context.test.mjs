import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadStore(chrome) {
  const window = { chrome };
  vm.runInNewContext(
    fs.readFileSync('src/shared/store.js', 'utf8'),
    { chrome, window, URL, Date, Math },
  );
  return window.WebCommentStore;
}

test('store reports an invalidated extension context when storage disappears', async () => {
  const store = loadStore({ runtime: {} });

  await assert.rejects(store.getActiveSessionId(), /Extension context invalidated/);
  await assert.rejects(store.writeState({}), /Extension context invalidated/);
});
