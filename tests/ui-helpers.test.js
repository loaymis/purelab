import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickCashAmounts } from '../src/lib/cash.js';

test('quick cash: exact first, then ascending round amounts', () => {
  assert.deepEqual(quickCashAmounts(63.3), [63.3, 64, 65, 70]);
  assert.deepEqual(quickCashAmounts(20), [20, 50, 100, 200]);
  assert.deepEqual(quickCashAmounts(0), []);
  const r = quickCashAmounts(1234.5);
  assert.equal(r[0], 1234.5);
  assert.ok(r.every((v, i) => i === 0 || v > r[i - 1]));
});
