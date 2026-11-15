import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lotsFor, currentExpiry, correctionFor } from '../src/lib/stock.js';

const m = (qty, expiryDate, extra = {}) => ({ qty, expiryDate, ...extra });

test('restock adds a second lot; earliest expiry is shown', () => {
  const ledger = [m(10, '2027-03-31'), m(20, '2028-01-31')];
  assert.deepEqual(lotsFor(ledger), [{ qty: 10, expiryDate: '2027-03-31' }, { qty: 20, expiryDate: '2028-01-31' }]);
  assert.equal(currentExpiry(ledger), '2027-03-31');
});

test('sales take the earliest-expiring stock first', () => {
  const ledger = [m(20, '2028-01-31'), m(10, '2027-03-31'), m(-12)];
  assert.deepEqual(lotsFor(ledger), [{ qty: 18, expiryDate: '2028-01-31' }]);
  assert.equal(currentExpiry(ledger), '2028-01-31');
});

test('old movements without an expiry use the product expiry; deleted ones are ignored', () => {
  const ledger = [m(5), m(5, '2026-12-31'), m(-100, null, { deleted: 1 })];
  assert.equal(currentExpiry(ledger, '2027-06-30'), '2026-12-31');
  assert.equal(lotsFor(ledger, '2027-06-30').reduce((s, l) => s + l.qty, 0), 10);
});

test('sold out / negative stock leaves no lots', () => {
  assert.deepEqual(lotsFor([m(3, '2027-01-01'), m(-5)]), []);
  assert.equal(currentExpiry([m(3, '2027-01-01'), m(-5)], '2027-01-01'), '2027-01-01');
});

test('stock edit correction', () => {
  assert.equal(correctionFor(30, 25), -5);
  assert.equal(correctionFor(0, '12'), 12);
  assert.equal(correctionFor(7, 7), 0);
  assert.equal(correctionFor(7, ''), -7);
});
