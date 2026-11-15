/**
 * Responsive shell: sidebar on desktop/tablet (lg+), top bar + bottom tab bar on phones.
 * Shows a "connect to cloud" banner when this device isn't syncing to the cloud.
 */
import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon } from './ui.jsx';
import SyncIndicator from './SyncIndicator.jsx';
import AccountMenu from './AccountMenu.jsx';
import { useSettings, updateSettings } from '../lib/settings.js';
import { useT } from '../i18n/index.js';
import { useCloudAccount } from '../hooks/useCloudAccount.js';

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/pos', label: 'New Sale', icon: 'pos' },
  { to: '/invoices', label: 'Invoices', icon: 'invoice' },
  { to: '/products', label: 'Products', icon: 'box' },
  { to: '/customers', label: 'Customers', icon: 'users' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];
// Phones: 5 tabs with "New Sale" in the middle; Settings lives in the account menu.
const MOBILE_NAV = [NAV[0], NAV[2], NAV[1], NAV[3], NAV[4]];

function CloudBanner() {
  const t = useT();
  const s = useSettings();
  const account = useCloudAccount();
  const syncing = account.state === 'owner' || account.state === 'staff';
  if (account.state === 'disabled' || account.state === 'loading' || syncing || s.cloudBannerDismissed) return null;
  const pending = account.state === 'pending';
  return (
    <div className="mb-5 flex items-center gap-3 rounded-2xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm animate-fade-in">
      <Icon name={pending ? 'users' : 'cloud'} className="h-5 w-5 shrink-0 text-accent" />
      <p className="flex-1 text-ink">
        {pending ? t('Waiting for the owner to approve your account. Sales are saved on this device meanwhile.')
          : t('Working on this device only. Sign in to back up and share your data across devices.')}
      </p>
      {!pending && (
        <button type="button" className="btn-primary btn-sm" onClick={() => updateSettings({ offlineMode: false })}>
          {t('Sign in')}
        </button>
      )}
      <button type="button" className="rounded-full p-1.5 text-muted hover:bg-subtle" aria-label={t('Dismiss')}
        onClick={() => updateSettings({ cloudBannerDismissed: true })}>
        <Icon name="x" className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function Layout() {
  const t = useT();
  const settings = useSettings();
  const { pathname } = useLocation();
  const logo = settings.company.logo || './icon-192.png';
  const current = NAV.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)));

  return (
    <div className="flex h-full">
      {/* Sidebar (lg+) */}
      <aside className="hidden w-64 shrink-0 flex-col bg-brand-950 text-brand-50 lg:flex">
        <div className="flex items-center gap-3 px-5 py-6">
          <img src={logo} alt="" className="h-10 w-10 rounded-xl bg-white object-contain" />
          <div className="min-w-0">
            <div className="truncate text-lg font-extrabold tracking-tight">{settings.company.name}</div>
            <div className="text-[11px] uppercase tracking-widest text-brand-300">{t('Point of Sale')}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive ? 'bg-white/10 text-white shadow-inner' : 'text-brand-200 hover:bg-white/5 hover:text-white'}`}>
              {({ isActive }) => (
                <>
                  <span className={`rounded-lg p-1 ${isActive ? 'bg-brand-500 text-white' : ''}`}><Icon name={n.icon} className="h-[18px] w-[18px]" /></span>
                  {t(n.label)}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-3 border-t border-white/10 p-3">
          <div className="px-2"><SyncIndicator onDark /></div>
          <AccountMenu placement="up" showName />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-lg lg:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src={logo} alt="" className="h-8 w-8 rounded-lg bg-white object-contain" />
            <span className="truncate font-bold tracking-tight text-ink">{current ? t(current.label) : settings.company.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <SyncIndicator compact />
            <AccountMenu />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto pb-28 lg:pb-10">
          <div key={pathname.split('/')[1]} className="mx-auto max-w-7xl px-4 py-5 animate-fade-in sm:px-6 lg:px-8 lg:py-8">
            <CloudBanner />
            <Outlet />
          </div>
        </main>

        {/* Bottom tab bar (phones/tablets) */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden">
          {MOBILE_NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold ${
                isActive ? 'text-accent' : 'text-faint'}`}>
              {n.to === '/pos'
                ? <span className="-mt-6 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-3.5 text-white shadow-pop ring-4 ring-canvas"><Icon name="scan" /></span>
                : <Icon name={n.icon} />}
              <span className="truncate">{t(n.label)}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
