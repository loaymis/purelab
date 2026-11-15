import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate } from '../src/i18n/index.js';
import ar from '../src/i18n/ar.js';

test('interpolation and English fallback', () => {
  assert.equal(translate('en', 'Hello {name}', { name: 'Sara' }), 'Hello Sara');
  assert.equal(translate('ar', 'A string nobody translated'), 'A string nobody translated');
  assert.equal(translate('ar', 'Invoice {n} issued', { n: 'PL-1' }), 'تم إصدار الفاتورة PL-1');
  assert.equal(translate('en', 'Keep {missing}'), 'Keep {missing}');
});

test('every Arabic translation keeps the same placeholders', () => {
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
  const bad = Object.entries(ar).filter(([en, tr]) => ph(en) !== ph(tr)).map(([en]) => en);
  assert.deepEqual(bad, []);
});
