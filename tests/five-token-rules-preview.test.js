import test from 'node:test';
import assert from 'node:assert/strict';
import { rulesPreviewMarkup } from '../src/rules-preview.js';
import { getGameSet } from '../src/game-sets.js';

for(const set of ['reference','miroir-50']){
  test(`${set}: five-token rules show one inlet per face and keep 3D hub coordinates aligned`,()=>{
    const html = rulesPreviewMarkup({geometryVersion:getGameSet(set,5).geometryVersion});
    assert.equal((html.match(/data-queue-lane="0"/g) ?? []).length,2);
    assert.equal((html.match(/data-tray-lane="0"/g) ?? []).length,2);
    assert.equal((html.match(/data-token="/g) ?? []).length,10);
    assert.equal((html.match(/viewBox="0 0 360 540"/g) ?? []).length,2);
    assert.doesNotMatch(html,/data-series="1"|data-queue-lane="1"|data-tray-lane="1"/);
  });
}

test('default rules illustration retains its existing two series per face',()=>{
  const html = rulesPreviewMarkup();
  assert.equal((html.match(/data-token="/g) ?? []).length,20);
  assert.equal((html.match(/data-queue-lane="1"/g) ?? []).length,2);
});
