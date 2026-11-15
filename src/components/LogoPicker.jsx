/** Logo upload with preview (stored as a small data URL in settings.company.logo). */
import React, { useRef } from 'react';
import { Icon, useToast } from './ui.jsx';
import { useT } from '../i18n/index.js';
import { resizeImage } from '../lib/image.js';

export default function LogoPicker({ value, onChange }) {
  const t = useT();
  const toast = useToast();
  const ref = useRef(null);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { onChange(await resizeImage(file)); } catch (err) { toast(t(err.message), 'error'); }
  };
  return (
    <div className="flex items-center gap-4">
      <button type="button" onClick={() => ref.current?.click()}
        className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-line bg-subtle text-faint transition hover:border-brand-500 hover:text-accent">
        {value ? <img src={value} alt="" className="h-full w-full bg-white object-contain p-1" /> : <Icon name="image" className="h-7 w-7" />}
      </button>
      <div className="space-y-1.5">
        <button type="button" className="btn-secondary btn-sm" onClick={() => ref.current?.click()}><Icon name="upload" className="h-4 w-4" />{value ? t('Change logo') : t('Upload logo')}</button>
        {value && <button type="button" className="btn-ghost btn-sm text-rose-600" onClick={() => onChange('')}>{t('Remove')}</button>}
        <p className="text-xs text-faint">{t('Shown on invoices and receipts. PNG or JPG.')}</p>
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={pick} />
    </div>
  );
}
