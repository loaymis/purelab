import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { ToastProvider } from './components/ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import InvoiceEditor from './pages/InvoiceEditor.jsx';
import Invoices from './pages/Invoices.jsx';
import InvoiceView from './pages/InvoiceView.jsx';
import Products from './pages/Products.jsx';
import Customers from './pages/Customers.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import Settings from './pages/Settings.jsx';
import Pair from './pages/Pair.jsx';

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/pair" element={<Pair />} />
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
    </ToastProvider>
  );
}
