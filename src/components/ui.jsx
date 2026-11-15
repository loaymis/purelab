/**
 * PureLab UI kit: icons, sheets/dialogs, confirm & prompt, combobox, tabs,
 * segmented control, skeletons, avatars, badges, toasts.
 * Everything uses semantic colour roles (dark mode) and logical properties (RTL).
 */
import React, {
  createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n/index.js';

/* ----------------------------------------------------------------- icons */
const PATHS = {
  dashboard: 'M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z',
  pos: 'M4 4h16v10H4zM8 18h8M12 14v4M7 8h4M7 11h2',
  invoice: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6M10 9h2',
  box: 'M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm13 9v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  user: 'M20 21v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  scan: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13 8v8M17 8v8',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  x: 'M18 6 6 18M6 6l12 12',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
  printer: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  cloud: 'M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 1 0 6 17.7M6 19h11.5',
  cloudOff: 'M2 2l20 20M5.8 5.8A6 6 0 0 0 6 17.7M9.5 4.4A6 6 0 0 1 16.1 10.2 4.5 4.5 0 0 1 21 14.5M17 19H6',
  refresh: 'M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5',
  check: 'M20 6 9 17l-5-5',
  checkCircle: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 16v-4M12 8h.01',
  wallet: 'M20 12V8H6a2 2 0 0 1 0-4h12v4M4 6v12a2 2 0 0 0 2 2h14v-4M18 12a2 2 0 0 0 0 4h4v-4Z',
  cash: 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 12h.01M18 12h.01',
  card: 'M2 5h20v14H2zM2 10h20M6 15h4',
  bank: 'M3 21h18M4 10h16M12 3 3 8h18ZM6 10v8M10 10v8M14 10v8M18 10v8',
  crypto: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM9 8h4.5a2 2 0 0 1 0 4H9zm0 4h5a2 2 0 0 1 0 4H9zM10 6v2M10 16v2M13 6v2M13 16v2',
  phone: 'M7 2h10v20H7zM11 18h2',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2ZM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  image: 'M3 3h18v18H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM21 15l-5-5L5 21',
  flash: 'M13 2 3 14h9l-1 8 10-12h-9Z',
  chevronLeft: 'm15 18-6-6 6-6',
  chevronRight: 'm9 18 6-6-6-6',
  chevronDown: 'm6 9 6 6 6-6',
  arrowRight: 'M5 12h14M13 5l7 7-7 7',
  more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  ban: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM4.9 4.9l14.2 14.2',
  wifi: 'M5 12.6a10 10 0 0 1 14 0M8.5 16.1a5 5 0 0 1 7 0M2 8.8a15 15 0 0 1 20 0M12 20h.01',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  whatsapp: 'M3 21l1.7-5A9 9 0 1 1 8 19.3ZM9 8.5c0 3.5 3 6.5 6.5 6.5l1.5-1.5-2-1-1 1a5 5 0 0 1-3-3l1-1-1-2Z',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  monitor: 'M2 4h20v13H2zM8 21h8M12 17v4',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  cart: 'M9 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM20 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6',
  sparkles: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9ZM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9Z',
  install: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  store: 'M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6',
  trend: 'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6',
};

export function Icon({ name, className = 'h-5 w-5', strokeWidth = 1.8, flip = false }) {
  const dirIcon = flip || ['chevronLeft', 'chevronRight', 'arrowRight'].includes(name);
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={`${className} ${dirIcon ? 'flip-rtl' : ''}`} aria-hidden="true">
      <path d={PATHS[name] || ''} />
    </svg>
  );
}

/* ------------------------------------------------------- sheet / modal */
/**
 * Bottom sheet on phones, centred dialog on larger screens.
 * Props: open, title, onClose, children, footer, size ('sm'|'md'|'lg'|'xl').
 */
export function Sheet({ open, title, onClose, children, footer, size = 'md', bodyClassName = '' }) {
  const ref = useRef(null);
  const t = useT();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = ref.current?.querySelector('[data-autofocus], input:not([type=hidden]), select, textarea');
    if (first && window.matchMedia('(min-width: 640px)').matches) first.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' };
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-[2px] animate-fade-in sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className={`flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-pop animate-sheet-up sm:rounded-2xl sm:animate-fade-in ${widths[size]}`}>
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line sm:hidden" />
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3 sm:pt-4">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button type="button" className="btn-icon -me-2 min-h-[40px] min-w-[40px] rounded-full text-muted hover:bg-subtle" onClick={onClose} aria-label={t('Close')}>
            <Icon name="x" />
          </button>
        </div>
        <div className={`flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-1 ${bodyClassName}`}>{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
/** Backwards-compatible name used across the app. */
export const Modal = Sheet;

/* --------------------------------------------------- confirm & prompt */
const DialogCtx = createContext(null);

export function DialogProvider({ children }) {
  const t = useT();
  const [dlg, setDlg] = useState(null);
  const [value, setValue] = useState('');

  const open = useCallback((opts) => new Promise((resolve) => {
    setValue(opts.defaultValue || '');
    setDlg({ ...opts, resolve });
  }), []);

  const api = useMemo(() => ({
    confirm: (opts) => open({ kind: 'confirm', ...(typeof opts === 'string' ? { message: opts } : opts) }),
    prompt: (opts) => open({ kind: 'prompt', ...(typeof opts === 'string' ? { message: opts } : opts) }),
  }), [open]);

  const close = (result) => {
    dlg?.resolve(result);
    setDlg(null);
  };

  return (
    <DialogCtx.Provider value={api}>
      {children}
      {dlg && (
        <Sheet open size="sm" title={dlg.title || (dlg.kind === 'prompt' ? t('Enter details') : t('Are you sure?'))}
          onClose={() => close(dlg.kind === 'prompt' ? null : false)}
          footer={(
            <>
              <button type="button" className="btn-secondary" onClick={() => close(dlg.kind === 'prompt' ? null : false)}>
                {dlg.cancelLabel || t('Cancel')}
              </button>
              <button type="button" data-autofocus className={dlg.danger ? 'btn-danger' : 'btn-primary'}
                onClick={() => close(dlg.kind === 'prompt' ? value : true)}>
                {dlg.confirmLabel || t('Confirm')}
              </button>
            </>
          )}>
          <form onSubmit={(e) => { e.preventDefault(); close(dlg.kind === 'prompt' ? value : true); }}>
            {dlg.message && <p className="text-sm leading-relaxed text-muted">{dlg.message}</p>}
            {dlg.kind === 'prompt' && (
              <input className="input mt-3" autoFocus value={value} placeholder={dlg.placeholder || ''}
                onChange={(e) => setValue(e.target.value)} />
            )}
          </form>
        </Sheet>
      )}
    </DialogCtx.Provider>
  );
}

/** const confirm = useConfirm(); if (await confirm({ message, danger: true })) … */
export const useConfirm = () => useContext(DialogCtx).confirm;
/** const prompt = usePrompt(); const text = await prompt({ message }); // null when cancelled */
export const usePrompt = () => useContext(DialogCtx).prompt;

/* ---------------------------------------------------------- combobox */
/**
 * Searchable select. options: [{ value, label, hint }]
 */
export function Combobox({ value, onChange, options, placeholder, emptyLabel, allowClear = true, ariaLabel }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = n ? options.filter((o) => `${o.label} ${o.hint || ''}`.toLowerCase().includes(n)) : options;
    return list.slice(0, 50);
  }, [options, q]);

  useEffect(() => {
    const close = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (o) => {
    onChange(o ? o.value : null);
    setOpen(false);
    setQ('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Enter' && open) { e.preventDefault(); if (filtered[active]) pick(filtered[active]); }
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <input className="input pe-9 ps-9" role="combobox" aria-expanded={open} aria-controls={listId} aria-label={ariaLabel}
          value={open ? q : selected?.label || ''} placeholder={selected ? selected.label : placeholder}
          onFocus={() => { setOpen(true); setActive(0); }} onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
          onKeyDown={onKeyDown} />
        {allowClear && selected && !open && (
          <button type="button" className="absolute end-1 top-1/2 -translate-y-1/2 rounded-full p-2 text-faint hover:text-ink" onClick={() => pick(null)} aria-label={t('Clear')}>
            <Icon name="x" className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && (
        <ul id={listId} role="listbox" className="absolute z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-pop animate-fade-in">
          {emptyLabel && (
            <li>
              <button type="button" onClick={() => pick(null)} className="flex w-full px-3 py-2.5 text-start text-sm text-muted hover:bg-subtle">{emptyLabel}</button>
            </li>
          )}
          {filtered.length === 0 && <li className="px-3 py-3 text-sm text-faint">{t('No matches')}</li>}
          {filtered.map((o, i) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button type="button" onMouseEnter={() => setActive(i)} onClick={() => pick(o)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-start ${i === active ? 'bg-subtle' : ''}`}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{o.label}</span>
                  {o.hint && <span className="block truncate text-xs text-muted">{o.hint}</span>}
                </span>
                {o.value === value && <Icon name="check" className="h-4 w-4 shrink-0 text-accent" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ----------------------------------------------- tabs & segmented */
export function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div role="tablist" className={`-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0 ${className}`}>
      {tabs.map((tab) => (
        <button key={tab.id} type="button" role="tab" aria-selected={value === tab.id} onClick={() => onChange(tab.id)}
          className={`relative flex min-h-[44px] shrink-0 items-center gap-2 px-3 text-sm font-semibold transition ${
            value === tab.id ? 'text-accent' : 'text-muted hover:text-ink'}`}>
          {tab.icon && <Icon name={tab.icon} className="h-4 w-4" />}
          {tab.label}
          {value === tab.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
        </button>
      ))}
    </div>
  );
}

export function Segmented({ options, value, onChange, size = 'md', ariaLabel }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-xl border border-line bg-subtle p-1">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`flex items-center gap-1.5 rounded-lg font-semibold transition ${size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'} ${
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
          {o.icon && <Icon name={o.icon} className="h-4 w-4" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------- fields & layout */
export function Field({ label, children, hint, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 animate-fade-in">
      <div className="flex min-w-0 items-center gap-2">
        {back && (
          <button type="button" className="btn-icon -ms-2 rounded-full text-muted" onClick={back.onClick} aria-label={back.label}>
            <Icon name="chevronLeft" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon = 'box', title, text, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center animate-fade-in">
      <div className="relative mb-4">
        <div className="absolute inset-0 scale-150 rounded-full bg-brand-500/10 blur-xl" />
        <div className="relative rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-3.5 text-white shadow-lg">
          <Icon name={icon} className="h-7 w-7" />
        </div>
      </div>
      <p className="font-semibold text-ink">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = 'h-4 w-full' }) {
  return <div className={`skeleton ${className}`} />;
}

export function ListSkeleton({ rows = 5 }) {
  return (
    <ul className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-2/5" /><Skeleton className="h-3 w-1/4" /></div>
          <Skeleton className="h-4 w-16" />
        </li>
      ))}
    </ul>
  );
}

const AVATAR_TONES = ['bg-brand-100 text-brand-800', 'bg-sky-100 text-sky-800', 'bg-amber-100 text-amber-800',
  'bg-violet-100 text-violet-800', 'bg-rose-100 text-rose-800', 'bg-emerald-100 text-emerald-800'];

export function Avatar({ name = '', size = 'h-10 w-10 text-sm' }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const tone = AVATAR_TONES[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${tone} ${size}`}>{initials}</span>;
}

/** Floating action button for phones (sits above the bottom nav). */
export function Fab({ onClick, icon = 'plus', label }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className="fixed bottom-24 end-4 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-700 text-white shadow-pop transition active:scale-95 dark:bg-brand-600 lg:hidden">
      <Icon name={icon} className="h-6 w-6" />
    </button>
  );
}

const STATUS_STYLES = {
  paid: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  partial: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  unpaid: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  overdue: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  draft: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
  void: 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900',
};
const STATUS_LABELS = { paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid', overdue: 'Overdue', draft: 'Draft', void: 'Void' };

export function StatusBadge({ status }) {
  const t = useT();
  return <span className={`badge ${STATUS_STYLES[status] || STATUS_STYLES.draft}`}>{t(STATUS_LABELS[status] || status)}</span>;
}

/* ---------------------------------------------------------------- toasts */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list.slice(-2), { id, message, type }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), type === 'error' ? 6000 : 3000);
  }, []);
  const tones = { error: 'bg-rose-600', warn: 'bg-amber-600', success: 'bg-slate-900 dark:bg-slate-700' };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] flex flex-col items-center gap-2 px-3 lg:bottom-6 lg:top-auto" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={`pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-pop animate-fade-in ${tones[x.type] || tones.success}`}>
            <Icon name={x.type === 'error' || x.type === 'warn' ? 'alert' : 'checkCircle'} className="h-4 w-4 shrink-0" />
            {x.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
