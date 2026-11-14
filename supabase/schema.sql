-- =====================================================================
-- PureLab cloud schema for Supabase (Postgres).
-- Run once in: Supabase Dashboard → SQL Editor → New query → Run.
--
-- Each synced entity is a table holding the full record as JSONB plus the
-- sync metadata. Writes go through purelab_push(), which applies
-- last-write-wins (updated_at, then device_id) server-side, so an offline
-- device that reconnects with stale data can never overwrite newer data.
-- server_seq is assigned on every accepted write and is the pull cursor.
-- =====================================================================

create sequence if not exists public.purelab_seq;

do $$
declare t text;
begin
  foreach t in array array['pl_products', 'pl_customers', 'pl_invoices', 'pl_stock_movements'] loop
    execute format($f$
      create table if not exists public.%1$I (
        id          text primary key,
        data        jsonb   not null,
        updated_at  bigint  not null,
        deleted     boolean not null default false,
        device_id   text,
        server_seq  bigint  not null default nextval('public.purelab_seq'),
        synced_at   timestamptz not null default now(),
        synced_by   uuid default auth.uid()
      );
      create index if not exists %1$s_server_seq_idx on public.%1$I (server_seq);
      alter table public.%1$I enable row level security;

      drop policy if exists "authenticated read"   on public.%1$I;
      drop policy if exists "authenticated insert" on public.%1$I;
      drop policy if exists "authenticated update" on public.%1$I;
      create policy "authenticated read"   on public.%1$I for select to authenticated using (true);
      create policy "authenticated insert" on public.%1$I for insert to authenticated with check (true);
      create policy "authenticated update" on public.%1$I for update to authenticated using (true) with check (true);
      grant select, insert, update on public.%1$I to authenticated;
    $f$, t);
  end loop;
end $$;

grant usage on sequence public.purelab_seq to authenticated;

-- Batch upsert with LWW merge. Returns number of rows accepted.
create or replace function public.purelab_push(p_table text, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  if p_table not in ('products', 'customers', 'invoices', 'stock_movements') then
    raise exception 'purelab_push: invalid table %', p_table;
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'purelab_push: p_rows must be a JSON array';
  end if;

  execute format($q$
    with incoming as (
      select distinct on (r->>'id')
        r->>'id'                                   as id,
        r                                          as data,
        (r->>'updated_at')::bigint                 as updated_at,
        coalesce((r->>'deleted')::boolean, false)  as deleted,
        r->>'device_id'                            as device_id
      from jsonb_array_elements($1) as r
      where r ? 'id' and r ? 'updated_at'
      order by r->>'id', (r->>'updated_at')::bigint desc
    ), up as (
      insert into public.%1$I as t (id, data, updated_at, deleted, device_id)
      select id, data, updated_at, deleted, device_id from incoming
      on conflict (id) do update
        set data       = excluded.data,
            updated_at = excluded.updated_at,
            deleted    = excluded.deleted,
            device_id  = excluded.device_id,
            server_seq = nextval('public.purelab_seq'),
            synced_at  = now(),
            synced_by  = auth.uid()
        where excluded.updated_at > t.updated_at
           or (excluded.updated_at = t.updated_at
               and coalesce(excluded.device_id, '') > coalesce(t.device_id, ''))
      returning 1
    )
    select count(*)::int from up
  $q$, 'pl_' || p_table)
  into n
  using p_rows;

  return n;
end;
$$;

revoke all on function public.purelab_push(text, jsonb) from public, anon;
grant execute on function public.purelab_push(text, jsonb) to authenticated;

-- Convenience reporting views (optional): flatten invoices for BI tools.
create or replace view public.pl_invoice_report with (security_invoker = true) as
select
  id,
  data->>'number'                          as number,
  (data->>'date')::date                    as invoice_date,
  data->>'status'                          as status,
  data->'customer'->>'name'                as customer_name,
  (data->'totals'->>'grandTotal')::numeric as grand_total,
  (data->'totals'->>'tax')::numeric        as tax,
  (data->'totals'->>'balance')::numeric    as balance,
  data->>'currency'                        as currency
from public.pl_invoices
where not deleted;
