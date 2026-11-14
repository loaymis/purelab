/**
 * Responsive shell: sidebar on desktop/tablet (lg+), bottom tab bar on phones.
 */
import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon } from './ui.jsx';
import SyncIndicator from './SyncIndicator.jsx';
import { useSettings } from '../lib/settings.js';
import { isDesktop } from '../lib/platform.js';

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/pos', label: 'New Sale', icon: 'pos' },
  { to: '/invoices', label: 'Invoices', icon: 'invoice' },
  { to: '/products', label: 'Products', icon: 'box' },
  { to: '/customers', label: 'Customers', icon: 'users' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export default function Layout() {
  const settings = useSettings();
  const { pathname } = useLocation();
  const isPos = pathname.startsWith('/pos') || pathname.endsWith('/edit');

  return (
    <div className="flex h-full">
      {/* Sidebar (lg+) */}
      <aside className="hidden w-64 shrink-0 flex-col bg-brand-950 text-brand-50 lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <img src="./icon-192.png" alt="" className="h-10 w-10 rounded-xl" />
          <div className="min-w-0">
            <div className="truncate text-lg font-extrabold tracking-tight">{settings.company.name}</div>
            <div className="text-[11px] uppercase tracking-widest text-brand-300">Point of Sale</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                isActive ? 'bg-brand-700 text-white' : 'text-brand-100 hover:bg-brand-900'}`}>
              <Icon name={n.icon} /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 px-5 py-4 text-xs text-brand-300">
          <SyncIndicator />
          <div>Device {settings.deviceCode}{isDesktop ? ' · Desktop hub' : ''}</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur lg:hidden">
          <div className="flex items-center gap-2">
            <img src="./icon-192.png" alt="" className="h-8 w-8 rounded-lg" />
            <span className="font-extrabold tracking-tight text-brand-800">{settings.company.name}</span>
          </div>
          <SyncIndicator />
        </header>

        <main className={`flex-1 overflow-y-auto ${isPos ? 'pb-24 lg:pb-0' : 'pb-24 lg:pb-8'}`}>
          <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </div>
        </main>

        {/* Bottom tab bar (phones/tablets) */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                isActive ? 'text-brand-700' : 'text-slate-500'}`}>
              {n.to === '/pos'
                ? <span className="-mt-5 rounded-full bg-brand-700 p-3 text-white shadow-lg"><Icon name={n.icon} /></span>
                : <Icon name={n.icon} />}
              <span className="truncate">{n.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
