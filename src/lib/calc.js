/**
 * Invoice math. Pure functions (no DOM / DB) so they are unit-testable.
 *
 * Order of operations per line:
 *   gross        = qty × unitPrice
 *   lineDiscount = gross × discountPct%
 *   net          = gross − lineDiscount
 * Invoice-level discount (fixed amount or %) is allocated across lines
 * proportionally to their net value, then tax is computed per line on
 * (net − allocated discount) at that line's tax rate. This keeps tax correct
 * when pharmaceutical and cosmetic lines carry different VAT rates.
 */

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function computeLine(item) {
  const qty = Math.max(0, num(item.qty));
  const price = Math.max(0, num(item.price));
  const pct = Math.min(100, Math.max(0, num(item.discountPct)));
  const gross = qty * price;
  const lineDiscount = gross * (pct / 100);
  return { qty, price, pct, gross, lineDiscount, net: gross - lineDiscount, taxRate: Math.max(0, num(item.taxRate)) };
}

/**
 * @param {Array<{qty,price,discountPct,taxRate}>} items
 * @param {{discountType?: 'amount'|'percent', discountValue?: number}} discount
 * @param {Array<{amount:number}>} payments
 */
export function computeTotals(items = [], discount = {}, payments = []) {
  const lines = items.map(computeLine);
  const netSum = lines.reduce((s, l) => s + l.net, 0);

  const dValue = Math.max(0, num(discount.discountValue));
  let invoiceDiscount = discount.discountType === 'percent'
    ? netSum * (Math.min(100, dValue) / 100)
    : Math.min(dValue, netSum);
  invoiceDiscount = round2(invoiceDiscount);

  const breakdown = new Map();
  let taxable = 0;
  let tax = 0;
  const lineTotals = lines.map((l) => {
    const share = netSum > 0 ? (l.net / netSum) * invoiceDiscount : 0;
    const lineTaxable = l.net - share;
    const lineTax = lineTaxable * (l.taxRate / 100);
    taxable += lineTaxable;
    tax += lineTax;
    const b = breakdown.get(l.taxRate) || { rate: l.taxRate, taxable: 0, tax: 0 };
    b.taxable += lineTaxable;
    b.tax += lineTax;
    breakdown.set(l.taxRate, b);
    return round2(l.net);
  });

  const subtotal = round2(lines.reduce((s, l) => s + l.gross, 0));
  const lineDiscounts = round2(lines.reduce((s, l) => s + l.lineDiscount, 0));
  taxable = round2(taxable);
  tax = round2(tax);
  const grandTotal = round2(taxable + tax);
  const tendered = round2(payments.reduce((s, p) => s + Math.max(0, num(p.amount)), 0));
  const paid = Math.min(tendered, grandTotal);
  const balance = round2(grandTotal - paid);
  const changeDue = round2(Math.max(0, tendered - grandTotal));

  return {
    lineTotals,
    subtotal,
    lineDiscounts,
    invoiceDiscount,
    taxable,
    tax,
    grandTotal,
    tendered,
    paid: round2(paid),
    balance,
    changeDue,
    itemCount: lines.reduce((s, l) => s + l.qty, 0),
    taxBreakdown: [...breakdown.values()]
      .filter((b) => b.taxable !== 0 || b.tax !== 0)
      .map((b) => ({ rate: b.rate, taxable: round2(b.taxable), tax: round2(b.tax) }))
      .sort((a, b) => a.rate - b.rate),
  };
}

/** Payment status label derived from totals and lifecycle status. */
export function paymentStatus(invoice) {
  if (invoice.status === 'void') return 'void';
  if (invoice.status === 'draft') return 'draft';
  const t = invoice.totals || {};
  if ((t.balance ?? 0) <= 0) return 'paid';
  if ((t.paid ?? 0) > 0) return 'partial';
  if (invoice.dueDate && invoice.dueDate < new Date().toISOString().slice(0, 10)) return 'overdue';
  return 'unpaid';
}
