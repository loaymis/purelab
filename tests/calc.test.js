import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTotals, round2 } from '../src/lib/calc.js';
import { parseGS1, candidateCodes } from '../src/lib/barcode.js';

test('simple totals with VAT', () => {
  const t = computeTotals([{ qty: 2, price: 10, discountPct: 0, taxRate: 10 }], {}, []);
  assert.equal(t.subtotal, 20);
  assert.equal(t.tax, 2);
  assert.equal(t.grandTotal, 22);
  assert.equal(t.balance, 22);
});

test('line discount, invoice discount allocated across mixed VAT rates', () => {
  const items = [
    { qty: 1, price: 100, discountPct: 10, taxRate: 0 }, // net 90
    { qty: 2, price: 30, discountPct: 0, taxRate: 20 }, // net 60
  ];
  const t = computeTotals(items, { discountType: 'amount', discountValue: 15 }, []);
  assert.equal(t.lineDiscounts, 10);
  assert.equal(t.invoiceDiscount, 15);
  // 60 - (60/150)*15 = 54 taxable at 20% -> 10.8
  assert.equal(t.tax, 10.8);
  assert.equal(t.grandTotal, round2(135 + 10.8));
  assert.deepEqual(t.taxBreakdown.map((b) => b.rate), [0, 20]);
});

test('percent discount and split payments with change', () => {
  const t = computeTotals([{ qty: 4, price: 25, taxRate: 0 }], { discountType: 'percent', discountValue: 10 },
    [{ amount: 50 }, { amount: 50 }]);
  assert.equal(t.grandTotal, 90);
  assert.equal(t.paid, 90);
  assert.equal(t.changeDue, 10);
  assert.equal(t.balance, 0);
});

test('amount discount never exceeds net', () => {
  const t = computeTotals([{ qty: 1, price: 5 }], { discountType: 'amount', discountValue: 50 }, []);
  assert.equal(t.grandTotal, 0);
});

test('GS1 DataMatrix parsing (pharma pack)', () => {
  const gs = String.fromCharCode(29);
  const r = parseGS1(`0106291100100017172706301024HS7${gs}21SN12345`);
  assert.equal(r.gtin, '06291100100017');
  assert.equal(r.expiry, '2027-06-30');
  assert.equal(r.batch, '24HS7');
  assert.equal(r.serial, 'SN12345');
  assert.ok(candidateCodes(`0106291100100017172706301024HS7`).includes('6291100100017'));
});
