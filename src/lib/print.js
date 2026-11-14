/**
 * Printing helpers shared by browser and Electron.
 *
 * The invoice is rendered into #print-root (see PrintPortal). Before printing
 * we inject an @page rule: A4 with margins, or an 80 mm wide thermal roll whose
 * height is measured from the actual receipt so the PDF has no blank tail.
 */
import { desktop } from './platform.js';

const STYLE_ID = 'purelab-page-style';
const PX_PER_MM = 96 / 25.4;

function setPageRule(css) {
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

function measureThermalHeightMm() {
  const root = document.getElementById('print-root');
  if (!root) return 200;
  const prev = root.getAttribute('style') || '';
  root.setAttribute('style', 'display:block;position:absolute;left:-10000px;top:0;width:80mm;');
  const h = root.scrollHeight;
  root.setAttribute('style', prev);
  return Math.ceil(h / PX_PER_MM) + 6;
}

/** @param {'a4'|'thermal'} format */
export function preparePage(format) {
  if (format === 'thermal') {
    const heightMm = Math.max(80, measureThermalHeightMm());
    setPageRule(`@page { size: 80mm ${heightMm}mm; margin: 0; }`);
    return { width: 80 / 25.4, height: heightMm / 25.4 }; // inches for Electron
  }
  setPageRule('@page { size: A4; margin: 0; }');
  return 'A4';
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

/** Opens the system print dialog (thermal printers appear here too). */
export async function printDocument(format) {
  await nextFrame();
  preparePage(format);
  if (desktop) return desktop.print({});
  window.print();
  return { success: true };
}

/** Saves a PDF. Electron: native save dialog. Browser: print dialog → "Save as PDF". */
export async function exportPDF(format, fileName) {
  await nextFrame();
  const pageSize = preparePage(format);
  if (desktop) return desktop.printToPDF({ pageSize, fileName });
  const prevTitle = document.title;
  document.title = fileName.replace(/\.pdf$/i, '');
  window.print();
  document.title = prevTitle;
  return { saved: true, viaDialog: true };
}
