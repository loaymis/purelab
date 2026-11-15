/**
 * Invoice sharing: PDF generated on the device (no print dialog), native share
 * sheet, WhatsApp and email. The PDF libraries are loaded only when first used.
 *
 * The invoice must be rendered in #print-root (see PrintPortal in InvoiceDocument.jsx).
 */
import { desktop } from './platform.js';
import { preparePage } from './print.js';
import { money, date } from './format.js';
import { t } from '../i18n/index.js';

const MM_PER_PX = 25.4 / 96;

/** Renders #print-root to a PDF Blob. format: 'a4' | 'thermal'. */
export async function buildPdf(format) {
  const root = document.getElementById('print-root');
  if (!root) throw new Error('Nothing to export');
  const [{ toJpeg }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  const widthMm = format === 'thermal' ? 80 : 210;
  const prev = root.getAttribute('style') || '';
  root.setAttribute('style', `display:block;position:fixed;left:-10000px;top:0;width:${widthMm}mm;background:#fff;`);
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const node = root.firstElementChild || root;
    // JPEG keeps a crisp 2× render at a few hundred KB (PNG would be ~10 MB inside a PDF).
    const png = await toJpeg(node, { pixelRatio: 2, quality: 0.9, backgroundColor: '#ffffff', cacheBust: true });
    const heightMm = node.scrollHeight * MM_PER_PX;
    const contentWidthMm = node.scrollWidth * MM_PER_PX;
    const scale = widthMm / contentWidthMm;
    const imgH = heightMm * scale;

    if (format === 'thermal') {
      const pdf = new jsPDF({ unit: 'mm', format: [80, Math.max(80, imgH)] });
      pdf.addImage(png, 'JPEG', 0, 0, 80, imgH);
      return pdf.output('blob');
    }
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageH = 297;
    let offset = 0;
    pdf.addImage(png, 'JPEG', 0, 0, 210, imgH);
    // Long invoices continue on extra pages (image shifted up one page each time).
    while (imgH - offset > pageH + 1) {
      offset += pageH;
      pdf.addPage();
      pdf.addImage(png, 'JPEG', 0, -offset, 210, imgH);
    }
    return pdf.output('blob');
  } finally {
    root.setAttribute('style', prev);
  }
}

export function pdfFileName(invoice) {
  const who = invoice.customer?.name ? ` - ${invoice.customer.name}` : '';
  return `${invoice.number}${who}.pdf`.replace(/[\\/:*?"<>|]+/g, '-');
}

/** Download / save a PDF. Desktop: native "Save as" dialog. */
export async function downloadPdf(invoice, format) {
  const fileName = pdfFileName(invoice);
  if (desktop) {
    const res = await desktop.printToPDF({ pageSize: preparePage(format), fileName });
    if (res?.saved && res.filePath) desktop.openFile(res.filePath);
    return res;
  }
  const blob = await buildPdf(format);
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return { saved: true };
}

export function canShareFiles() {
  if (desktop || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [new File([new Blob(['x'])], 'x.pdf', { type: 'application/pdf' })] });
  } catch {
    return false;
  }
}

/** A short, human summary used for WhatsApp / email / share text. */
export function invoiceSummary(invoice, company) {
  const tt = invoice.totals || {};
  const lines = [
    t('Invoice {number} from {company}', { number: invoice.number, company: company.name }),
    `${t('Date')}: ${date(invoice.date)}`,
    `${t('Total')}: ${money(tt.grandTotal, invoice.currency)}`,
  ];
  if (invoice.status === 'issued' && tt.balance > 0) lines.push(`${t('Balance due')}: ${money(tt.balance, invoice.currency)}`);
  if (invoice.dueDate && tt.balance > 0) lines.push(`${t('Due')}: ${date(invoice.dueDate)}`);
  lines.push('', t('Thank you!'));
  return lines.join('\n');
}

/** Native share sheet with the PDF attached (phones). */
export async function sharePdf(invoice, format, company) {
  const blob = await buildPdf(format);
  const file = new File([blob], pdfFileName(invoice), { type: 'application/pdf' });
  try {
    await navigator.share({ files: [file], title: invoice.number, text: invoiceSummary(invoice, company) });
    return { shared: true };
  } catch (err) {
    if (err?.name === 'AbortError') return { shared: false };
    throw err;
  }
}

/** International-ish phone → digits only for wa.me (keeps a leading country code). */
export function whatsappNumber(phone) {
  let digits = String(phone || '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);
  return digits;
}

export function whatsappUrl(invoice, company) {
  const num = whatsappNumber(invoice.customer?.phone);
  return `https://wa.me/${num}?text=${encodeURIComponent(invoiceSummary(invoice, company))}`;
}

export function mailtoUrl(invoice, company) {
  const subject = t('Invoice {number} from {company}', { number: invoice.number, company: company.name });
  return `mailto:${encodeURIComponent(invoice.customer?.email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(invoiceSummary(invoice, company))}`;
}
