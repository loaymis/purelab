/** Live (auto-refreshing) queries for React components. */
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db.js';
import { stockMap, customerBalances } from './repo.js';

const byName = (a, b) => (a.name || '').localeCompare(b.name || '');

export const useProducts = () =>
  useLiveQuery(async () => (await db.products.filter((p) => !p.deleted).toArray()).sort(byName), [], undefined);

export const useProduct = (id) => useLiveQuery(() => (id ? db.products.get(id) : undefined), [id]);

export const useStock = () => useLiveQuery(() => stockMap(), [], new Map());

export const useCustomers = () =>
  useLiveQuery(async () => (await db.customers.filter((c) => !c.deleted).toArray()).sort(byName), [], undefined);

export const useCustomer = (id) => useLiveQuery(() => (id ? db.customers.get(id) : undefined), [id]);

export const useBalances = () => useLiveQuery(() => customerBalances(), [], new Map());

export const useInvoices = () =>
  useLiveQuery(
    async () => (await db.invoices.filter((i) => !i.deleted).toArray())
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created_at || 0) - (a.created_at || 0)),
    [],
    undefined,
  );

export const useInvoice = (id) => useLiveQuery(() => (id ? db.invoices.get(id) : undefined), [id]);

export const useMovements = (productId) =>
  useLiveQuery(
    async () => (productId
      ? (await db.stock_movements.where('productId').equals(productId).filter((m) => !m.deleted).toArray())
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
      : []),
    [productId],
    [],
  );
