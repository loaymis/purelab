/**
 * Sync adapter for Supabase (cloud). See supabase/schema.sql.
 *
 * - push: RPC `purelab_push` performs the LWW merge server-side, so a stale
 *         device can never overwrite newer cloud data.
 * - pull: incremental by `server_seq` (assigned by the database on every
 *         accepted write), independent of device clocks.
 */
import { createClient } from '@supabase/supabase-js';

const PAGE = 500;
let cached = { key: '', client: null };

export function getSupabase(url, anonKey) {
  if (!url || !anonKey) return null;
  const key = `${url}|${anonKey}`;
  if (cached.key !== key) {
    cached = {
      key,
      client: createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'purelab-cloud-auth' },
      }),
    };
  }
  return cached.client;
}

export class SupabaseAdapter {
  constructor(url, anonKey) {
    this.client = getSupabase(url, anonKey);
    this.id = `cloud:${url}`;
    this.label = 'Cloud';
  }

  async ready() {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    if (!data.session) throw new Error('Not signed in to cloud sync (Settings → Sync)');
  }

  async push(table, rows) {
    const { data, error } = await this.client.rpc('purelab_push', { p_table: table, p_rows: rows });
    if (error) throw new Error(error.message);
    return data;
  }

  async pull(table, since) {
    const { data, error } = await this.client
      .from(`pl_${table}`)
      .select('data, server_seq')
      .gt('server_seq', since || 0)
      .order('server_seq', { ascending: true })
      .limit(PAGE);
    if (error) throw new Error(error.message);
    const rows = data || [];
    return {
      rows: rows.map((r) => r.data),
      cursor: rows.length ? rows[rows.length - 1].server_seq : since || 0,
      hasMore: rows.length === PAGE,
    };
  }
}
