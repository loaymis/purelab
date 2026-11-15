import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { ToastProvider, DialogProvider } from './components/ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import InvoiceEditor from './pages/InvoiceEditor.jsx';
import Invoices from './pages/Invoices.jsx';
import InvoiceView from './pages/InvoiceView.jsx';
import Products from './pages/Products.jsx';
import Customers from './pages/Customers.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import Settings from './pages/Settings.jsx';
import Pair from './pages/Pair.jsx';
import Welcome from './pages/Welcome.jsx';
import Setup from './pages/Setup.jsx';
import { useAppearance } from './hooks/useAppearance.js';
import { useCloudAccount } from './hooks/useCloudAccount.js';
import { useSettings, updateSettings } from './lib/settings.js';
import { isDesktop } from './lib/platform.js';

function Splash() {
  return (
    <div className="flex h-full items-center justify-center">
      <img src="./icon-192.png" alt="" className="h-16 w-16 animate-pulse rounded-2xl" />
    </div>
  );
}

/**
 * Online version: people sign in (or explicitly continue offline) before using the app.
 * Desktop app: always opens straight into the POS (offline-first); cloud is optional.
 */
function AuthGate({ children }) {
  const account = useCloudAccount();
  const s = useSettings();
  const member = account.state === 'owner' || account.state === 'staff';

  // Staff never see the owner's setup wizard.
  useEffect(() => {
    if (account.state === 'staff' && !s.onboarded) updateSettings({ onboarded: true });
  }, [account.state, s.onboarded]);

  if (isDesktop || account.state === 'disabled') return children;
  if (account.state === 'loading') return <Splash />;
  // Signed in earlier but the cloud is unreachable right now: keep selling locally.
  if (account.state === 'error' && account.user) return children;
  if (!member && !s.offlineMode) return <Welcome />;
  if (account.state === 'owner' && !s.onboarded) return <Setup />;
  return children;
}

export default function App() {
  useAppearance();
  return (
    <ToastProvider>
      <DialogProvider>
        <Routes>
          <Route path="/pair" element={<Pair />} />
          <Route path="*" element={(
            <AuthGate>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="pos" element={<InvoiceEditor key="new" />} />
                  <Route path="invoices" element={<Invoices />} />
                  <Route path="invoices/:id" element={<InvoiceView />} />
                  <Route path="invoices/:id/edit" element={<InvoiceEditor key="edit" />} />
                  <Route path="products" element={<Products />} />
                  <Route path="customers" element={<Customers />} />
                  <Route path="customers/:id" element={<CustomerDetail />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </AuthGate>
          )} />
        </Routes>
      </DialogProvider>
    </ToastProvider>
  );
}
