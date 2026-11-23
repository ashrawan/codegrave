// Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shardOf, fold, tokens, prefixOf } from '../site/keys.js';

test('an id always lands in the same detail file', () => {
  assert.equal(shardOf('cobol', 2), shardOf('cobol', 2));
  assert.match(shardOf('codegrave/some-entry', 2), /^[0-9a-f]{2}$/);
  assert.match(shardOf('marie-curie', 3), /^[0-9a-f]{3}$/);
  assert.equal(shardOf('marie-curie', 3).slice(0, 2), shardOf('marie-curie', 2));
});

test('search ignores case and accents', () => {
  assert.equal(fold('Hồ Chí Minh'), 'ho chi minh');
  assert.deepEqual(tokens('Beyoncé: Live at São Paulo (2014)'), ['beyonce', 'live', 'at', 'sao', 'paulo', '2014']);
  assert.equal(prefixOf('curie'), 'cu');
  assert.equal(prefixOf('r'), 'r_');
});

test('a view address is owner/view, and classical/view for a classical view', async () => {
  const { addressOf, idOfAddress } = await import('../site/keys.js');
  assert.equal(addressOf('wiki/nepal'), 'wiki/nepal');
  assert.equal(addressOf('languages'), 'classical/languages');
  assert.equal(idOfAddress('classical/languages'), 'languages');
  assert.equal(idOfAddress('wiki/nepal'), 'wiki/nepal');
});
